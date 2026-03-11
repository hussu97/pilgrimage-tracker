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
