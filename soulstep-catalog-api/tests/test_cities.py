"""Tests for P5.1 cities endpoint: /api/v1/cities."""

from tests.conftest import SAMPLE_PLACE

PLACES_URL = "/api/v1/places"
CITIES_URL = "/api/v1/cities"


def _create_place(client, place_code, city, religion="islam", **overrides):
    data = {
        **SAMPLE_PLACE,
        "place_code": place_code,
        "city": city,
        "religion": religion,
        **overrides,
    }
    return client.post(PLACES_URL, json=data)


class TestCitiesList:
    """GET /api/v1/cities"""

    def test_empty_cities(self, client):
        resp = client.get(CITIES_URL)
        assert resp.status_code == 200
        data = resp.json()
        assert "cities" in data
        assert data["cities"] == []

    def test_cities_with_places(self, client):
        _create_place(client, "plc_city001", "Dubai")
        _create_place(client, "plc_city002", "Dubai", "christianity")
        _create_place(client, "plc_city003", "London")
        resp = client.get(CITIES_URL)
        assert resp.status_code == 200
        cities = resp.json()["cities"]
        city_names = [c["city"] for c in cities]
        assert "Dubai" in city_names
        assert "London" in city_names

    def test_cities_sorted_by_count_desc(self, client):
        _create_place(client, "plc_sort001", "Dubai")
        _create_place(client, "plc_sort002", "Dubai")
        _create_place(client, "plc_sort003", "London")
        resp = client.get(CITIES_URL)
        cities = resp.json()["cities"]
        counts = [c["count"] for c in cities]
        assert counts == sorted(counts, reverse=True)

    def test_city_has_slug(self, client):
        _create_place(client, "plc_slug001", "New York")
        resp = client.get(CITIES_URL)
        cities = resp.json()["cities"]
        ny = next((c for c in cities if c["city"] == "New York"), None)
        assert ny is not None
        assert ny["city_slug"] == "new-york"

    def test_city_count(self, client):
        _create_place(client, "plc_cnt001", "Dubai")
        _create_place(client, "plc_cnt002", "Dubai")
        resp = client.get(CITIES_URL)
        cities = resp.json()["cities"]
        dubai = next((c for c in cities if c["city"] == "Dubai"), None)
        assert dubai is not None
        assert dubai["count"] == 2

    def test_places_without_city_excluded(self, client):
        """Places with no city should not appear in city list."""
        data = {**SAMPLE_PLACE, "place_code": "plc_nocity", "city": None}
        client.post(PLACES_URL, json=data)
        resp = client.get(CITIES_URL)
        cities = resp.json()["cities"]
        # No city entry should be None
        assert all(c["city"] is not None for c in cities)


class TestCityPlaces:
    """GET /api/v1/cities/{city_slug}"""

    def test_places_in_city(self, client):
        _create_place(client, "plc_dubai001", "Dubai")
        _create_place(client, "plc_dubai002", "Dubai")
        _create_place(client, "plc_london001", "London")
        resp = client.get(f"{CITIES_URL}/dubai")
        assert resp.status_code == 200
        data = resp.json()
        assert "city" in data
        assert "places" in data
        assert len(data["places"]) == 2

    def test_city_not_found_returns_404(self, client):
        resp = client.get(f"{CITIES_URL}/nonexistent-city-xyz")
        assert resp.status_code == 404

    def test_place_has_required_fields(self, client):
        _create_place(client, "plc_fields001", "Dubai")
        resp = client.get(f"{CITIES_URL}/dubai")
        places = resp.json()["places"]
        assert len(places) == 1
        place = places[0]
        assert "place_code" in place
        assert "name" in place
        assert "religion" in place
        assert "address" in place

    def test_city_slug_case_insensitive(self, client):
        _create_place(client, "plc_case001", "Dubai")
        resp = client.get(f"{CITIES_URL}/DUBAI")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["places"]) >= 1


class TestCityReligionPlaces:
    """GET /api/v1/cities/{city_slug}/{religion}"""

    def test_filter_by_religion(self, client):
        _create_place(client, "plc_rel001", "Dubai", "islam")
        _create_place(client, "plc_rel002", "Dubai", "christianity")
        _create_place(client, "plc_rel003", "Dubai", "hinduism")
        resp = client.get(f"{CITIES_URL}/dubai/islam")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["places"]) == 1
        assert data["places"][0]["religion"] == "islam"

    def test_filter_returns_empty_for_missing_religion(self, client):
        _create_place(client, "plc_missing001", "Dubai", "islam")
        resp = client.get(f"{CITIES_URL}/dubai/buddhism")
        assert resp.status_code == 200
        assert resp.json()["places"] == []

    def test_city_and_religion_in_response(self, client):
        _create_place(client, "plc_resp001", "London", "christianity")
        resp = client.get(f"{CITIES_URL}/london/christianity")
        data = resp.json()
        assert "city" in data
        assert "religion" in data
        assert data["religion"] == "christianity"


# ── city popularity metrics ────────────────────────────────────────────────────


class TestCityMetrics:
    """GET /api/v1/cities?include_metrics=true"""

    def _register_and_token(self, client, email="citymetrics@example.com"):
        resp = client.post(
            "/api/v1/auth/register",
            json={"email": email, "password": "Pass1234!", "display_name": "MetricsUser"},
        )
        assert resp.status_code == 200
        return resp.json()["token"]

    def test_metrics_fields_present_when_requested(self, client):
        """include_metrics=true adds checkins_30d and popularity_label to each city."""
        _create_place(client, "plc_met001", "Dubai")
        resp = client.get(CITIES_URL, params={"include_metrics": "true"})
        assert resp.status_code == 200
        cities = resp.json()["cities"]
        assert len(cities) >= 1
        city = next((c for c in cities if c["city"] == "Dubai"), None)
        assert city is not None
        assert "checkins_30d" in city
        assert "popularity_label" in city

    def test_metrics_fields_absent_without_flag(self, client):
        """Without include_metrics=true, fields are not present."""
        _create_place(client, "plc_met002", "London")
        resp = client.get(CITIES_URL)
        assert resp.status_code == 200
        cities = resp.json()["cities"]
        if cities:
            assert "checkins_30d" not in cities[0]
            assert "popularity_label" not in cities[0]

    def test_metrics_checkins_zero_when_no_checkins(self, client):
        """checkins_30d is 0 for a city with no check-ins."""
        _create_place(client, "plc_met003", "Tokyo")
        resp = client.get(CITIES_URL, params={"include_metrics": "true"})
        cities = resp.json()["cities"]
        tokyo = next((c for c in cities if c["city"] == "Tokyo"), None)
        assert tokyo is not None
        assert tokyo["checkins_30d"] == 0
        assert tokyo["popularity_label"] is None

    def test_metrics_checkins_counted_for_city(self, client, db_session):
        """Places with recent check-ins are counted per city."""
        from datetime import UTC, datetime, timedelta

        from app.db.models import CheckIn, Place

        # Create place in DB directly (so we can also create check-ins directly)
        place = Place(
            place_code="plc_met_ci01",
            name="Checkin Mosque",
            religion="islam",
            place_type="mosque",
            lat=25.0,
            lng=55.0,
            address="Test St",
            city="Riyadh",
        )
        db_session.add(place)
        db_session.commit()

        # Add 10 check-ins within last 30 days
        for i in range(10):
            ci = CheckIn(
                check_in_code=f"ci_met_{i:04d}",
                user_code="usr_test_metrics",
                place_code="plc_met_ci01",
                checked_in_at=datetime.now(UTC) - timedelta(days=i),
            )
            db_session.add(ci)
        db_session.commit()

        resp = client.get(CITIES_URL, params={"include_metrics": "true"})
        cities = resp.json()["cities"]
        riyadh = next((c for c in cities if c["city"] == "Riyadh"), None)
        assert riyadh is not None
        assert riyadh["checkins_30d"] == 10
        # 10 > 5 so label should be "Growing"
        assert riyadh["popularity_label"] == "Growing"

    def test_metrics_popularity_label_trending(self, client, db_session):
        """Cities with >50 check-ins get 'Trending' label."""
        from datetime import UTC, datetime

        from app.db.models import CheckIn, Place

        place = Place(
            place_code="plc_trending01",
            name="Trending Mosque",
            religion="islam",
            place_type="mosque",
            lat=24.0,
            lng=54.0,
            address="Test",
            city="Mecca",
        )
        db_session.add(place)
        db_session.commit()

        for i in range(55):
            ci = CheckIn(
                check_in_code=f"ci_trend_{i:04d}",
                user_code="usr_trend_test",
                place_code="plc_trending01",
                checked_in_at=datetime.now(UTC),
            )
            db_session.add(ci)
        db_session.commit()

        resp = client.get(CITIES_URL, params={"include_metrics": "true"})
        cities = resp.json()["cities"]
        mecca = next((c for c in cities if c["city"] == "Mecca"), None)
        assert mecca is not None
        assert mecca["checkins_30d"] == 55
        assert mecca["popularity_label"] == "Trending"
