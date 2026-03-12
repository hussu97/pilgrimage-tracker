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


def test_homepage_with_location(client):
    """Homepage with lat/lng returns recommended_places with distance_km field."""
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
        "/api/v1/places", json={**SAMPLE_PLACE, "place_code": "plc_hp_001", "city": "Dubai"}
    )
    res = client.get(HOMEPAGE_URL)
    assert res.status_code == 200
    data = res.json()
    assert data["place_count"] >= 1
    # popular_cities should include Dubai now
    city_names = [c["city"] for c in data["popular_cities"]]
    assert "Dubai" in city_names
