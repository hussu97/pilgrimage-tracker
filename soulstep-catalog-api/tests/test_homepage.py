"""Tests for the composite /api/v1/homepage endpoint."""

HOMEPAGE_URL = "/api/v1/homepage"


def _register_and_token(client, email="hp_user@example.com"):
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Pass1234!", "display_name": "HPUser"},
    )
    assert resp.status_code == 200
    return resp.json()["token"]


def _auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_homepage_unauthenticated(client):
    """Unauthenticated request returns all expected keys with empty groups list."""
    res = client.get(HOMEPAGE_URL)
    assert res.status_code == 200
    data = res.json()
    assert "groups" in data
    assert "recommended_places" in data
    assert "featured_journeys" in data
    assert "popular_places" in data
    assert "popular_cities" in data
    assert "place_count" in data
    assert data["groups"] == []


def test_homepage_authenticated(client):
    """Authenticated request returns groups key as a list."""
    token = _register_and_token(client)
    res = client.get(HOMEPAGE_URL, headers=_auth_headers(token))
    assert res.status_code == 200
    data = res.json()
    assert "groups" in data
    assert isinstance(data["groups"], list)


def test_homepage_authenticated_group_datetimes_are_json_encoded(client, db_session):
    """Authenticated homepage must serialize group datetime fields."""
    from sqlmodel import select

    from app.db import groups as groups_db
    from app.db.models import User

    email = "hp_group_owner@example.com"
    token = _register_and_token(client, email=email)
    user = db_session.exec(select(User).where(User.email == email)).first()
    assert user is not None

    groups_db.create_group(
        name="Serializable Journey",
        description="Regression coverage",
        created_by_user_code=user.user_code,
        session=db_session,
    )

    res = client.get(HOMEPAGE_URL, headers=_auth_headers(token))
    assert res.status_code == 200
    group = next(g for g in res.json()["groups"] if g["name"] == "Serializable Journey")
    assert isinstance(group["created_at"], str)
    assert isinstance(group["updated_at"], str)


def test_homepage_with_location(client):
    """Homepage with lat/lng returns recommended_places with distance field."""
    res = client.get(HOMEPAGE_URL, params={"lat": 51.5074, "lng": -0.1278})
    assert res.status_code == 200
    data = res.json()
    assert "recommended_places" in data
    assert isinstance(data["recommended_places"], list)


def test_homepage_place_count_is_integer(client):
    """place_count is an integer."""
    res = client.get(HOMEPAGE_URL)
    assert res.status_code == 200
    assert isinstance(res.json()["place_count"], int)


def test_homepage_popular_cities_is_list(client):
    """popular_cities is a list."""
    res = client.get(HOMEPAGE_URL)
    assert res.status_code == 200
    assert isinstance(res.json()["popular_cities"], list)


def test_homepage_featured_journeys_is_list(client):
    """featured_journeys is a list."""
    res = client.get(HOMEPAGE_URL)
    assert res.status_code == 200
    assert isinstance(res.json()["featured_journeys"], list)


def test_homepage_religion_filter(client):
    """Homepage with religions filter returns only filtered recommended_places."""
    res = client.get(HOMEPAGE_URL, params={"religions": ["islam"]})
    assert res.status_code == 200
    data = res.json()
    assert "recommended_places" in data
    assert isinstance(data["recommended_places"], list)


def test_homepage_with_places_in_db(client):
    """When places exist, popular_places and recommended_places can be non-empty."""
    from tests.conftest import SAMPLE_PLACE

    client.post(
        "/api/v1/places",
        json={**SAMPLE_PLACE, "place_code": "plc_hp_001", "city": "Dubai"},
        headers={"X-API-Key": "test-api-key"},
    )
    res = client.get(HOMEPAGE_URL)
    assert res.status_code == 200
    data = res.json()
    assert data["place_count"] >= 1
    # popular_cities should include Dubai now
    city_names = [c["city"] for c in data["popular_cities"]]
    assert "Dubai" in city_names


def test_homepage_lang_overlays_place_translations(client, db_session):
    """Homepage ?lang=ar overlays Arabic translations on place names/addresses."""
    from datetime import UTC, datetime

    from app.db.models import ContentTranslation, Place

    # Insert a place directly via db_session
    place = Place(
        place_code="plc_lang_hp001",
        name="Test Mosque",
        religion="islam",
        place_type="mosque",
        lat=21.4,
        lng=39.8,
        address="Test Street",
        city="Mecca",
    )
    db_session.add(place)
    db_session.commit()

    # Insert an Arabic translation for the name
    now = datetime.now(UTC)
    db_session.add(
        ContentTranslation(
            entity_type="place",
            entity_code="plc_lang_hp001",
            field="name",
            lang="ar",
            translated_text="الكعبة المشرفة",
            source="test",
            created_at=now,
            updated_at=now,
        )
    )
    db_session.commit()

    response = client.get(f"{HOMEPAGE_URL}?lang=ar")
    assert response.status_code == 200
    data = response.json()
    # Find our place in popular_places or recommended_places
    all_places = data["popular_places"] + data["recommended_places"]
    our_place = next((p for p in all_places if p["place_code"] == "plc_lang_hp001"), None)
    if our_place:
        assert our_place["name"] == "الكعبة المشرفة"


def test_homepage_lang_en_no_overlay(client, db_session):
    """Homepage ?lang=en returns original English names (no translation lookup)."""
    from app.db.models import Place

    place = Place(
        place_code="plc_lang_en001",
        name="English Mosque",
        religion="islam",
        place_type="mosque",
        lat=21.4,
        lng=39.8,
        address="English Street",
        city="London",
    )
    db_session.add(place)
    db_session.commit()

    response = client.get(f"{HOMEPAGE_URL}?lang=en")
    assert response.status_code == 200
    data = response.json()
    all_places = data["popular_places"] + data["recommended_places"]
    our_place = next((p for p in all_places if p["place_code"] == "plc_lang_en001"), None)
    if our_place:
        assert our_place["name"] == "English Mosque"


def test_homepage_popular_places_include_aggregate_rating(client, db_session):
    """popular_places entries must surface avg rating + count from the Review join.

    Regression for homepage.py where SQLAlchemy Row objects were misread as
    non-tuples and every popular_place got {"average": 0.0, "count": 0}.
    """
    from app.db.models import Place, Review

    place = Place(
        place_code="plc_hp_rating01",
        name="Rating Test Mosque",
        religion="islam",
        place_type="mosque",
        lat=21.4,
        lng=39.8,
        address="Rating Street",
        city="Mecca",
    )
    db_session.add(place)
    db_session.add(Review(review_code="rev_hp_001", place_code=place.place_code, rating=5))
    db_session.add(Review(review_code="rev_hp_002", place_code=place.place_code, rating=4))
    db_session.commit()

    res = client.get(HOMEPAGE_URL)
    assert res.status_code == 200
    popular = res.json()["popular_places"]
    ours = next((p for p in popular if p["place_code"] == "plc_hp_rating01"), None)
    assert ours is not None, "seeded place missing from popular_places"
    assert ours["review_count"] == 2
    assert ours["average_rating"] == 4.5
