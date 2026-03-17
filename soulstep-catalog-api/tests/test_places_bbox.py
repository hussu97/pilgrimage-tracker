"""Tests for bounding-box filtering on the /api/v1/places endpoint."""

from tests.conftest import SAMPLE_PLACE

PLACES_URL = "/api/v1/places"


_API_KEY_HEADERS = {"X-API-Key": "test-api-key"}


def _create_place(client, place_code, **overrides):
    data = {**SAMPLE_PLACE, "place_code": place_code, **overrides}
    return client.post(PLACES_URL, json=data, headers=_API_KEY_HEADERS)


class TestBoundingBoxFilter:
    """Places returned only when they fall within the supplied viewport box."""

    def test_bbox_returns_places_inside_box(self, client):
        _create_place(client, "plc_bbox_in01", lat=25.2, lng=55.3)
        _create_place(client, "plc_bbox_out1", lat=51.5, lng=-0.1, name="London Mosque")
        resp = client.get(
            PLACES_URL,
            params={"min_lat": 24, "max_lat": 26, "min_lng": 54, "max_lng": 56},
        )
        assert resp.status_code == 200
        codes = [p["place_code"] for p in resp.json()["items"]]
        assert "plc_bbox_in01" in codes
        assert "plc_bbox_out1" not in codes

    def test_bbox_with_religion_filter(self, client):
        _create_place(client, "plc_bx_isl1", lat=25.2, lng=55.3, religion="islam")
        _create_place(
            client,
            "plc_bx_hin1",
            lat=25.2,
            lng=55.3,
            name="Test Temple",
            religion="hinduism",
            place_type="temple",
        )
        resp = client.get(
            PLACES_URL,
            params={
                "min_lat": 24,
                "max_lat": 26,
                "min_lng": 54,
                "max_lng": 56,
                "religion": "islam",
            },
        )
        assert resp.status_code == 200
        codes = [p["place_code"] for p in resp.json()["items"]]
        assert "plc_bx_isl1" in codes
        assert "plc_bx_hin1" not in codes

    def test_bbox_respects_page_size(self, client):
        for i in range(5):
            _create_place(client, f"plc_bxlim{i:02d}", lat=25.2 + i * 0.001, lng=55.3)
        resp = client.get(
            PLACES_URL,
            params={"min_lat": 24, "max_lat": 26, "min_lng": 54, "max_lng": 56, "page_size": 2},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["items"]) == 2
        assert data["total"] >= 5

    def test_bbox_without_lat_lng_has_no_distance(self, client):
        _create_place(client, "plc_bxnodst1", lat=25.2, lng=55.3)
        resp = client.get(
            PLACES_URL,
            params={"min_lat": 24, "max_lat": 26, "min_lng": 54, "max_lng": 56},
        )
        assert resp.status_code == 200
        places = resp.json()["items"]
        assert len(places) >= 1
        assert places[0]["distance"] is None

    def test_bbox_with_lat_lng_returns_distance(self, client):
        _create_place(client, "plc_bxdist1", lat=25.2, lng=55.3)
        resp = client.get(
            PLACES_URL,
            params={
                "min_lat": 24,
                "max_lat": 26,
                "min_lng": 54,
                "max_lng": 56,
                "lat": 25.0,
                "lng": 55.0,
            },
        )
        assert resp.status_code == 200
        places = resp.json()["items"]
        assert len(places) >= 1
        assert places[0]["distance"] is not None
        assert places[0]["distance"] > 0

    def test_bbox_skips_radius_filter(self, client):
        """When bbox is provided, radius should NOT exclude places within the box."""
        _create_place(client, "plc_bxrad01", lat=25.2, lng=55.3)
        # radius=0.001 would normally exclude most places, but bbox takes priority
        resp = client.get(
            PLACES_URL,
            params={
                "min_lat": 24,
                "max_lat": 26,
                "min_lng": 54,
                "max_lng": 56,
                "lat": 25.0,
                "lng": 55.0,
                "radius": 0.001,
            },
        )
        assert resp.status_code == 200
        codes = [p["place_code"] for p in resp.json()["items"]]
        assert "plc_bxrad01" in codes

    def test_page_size_over_100_rejected(self, client):
        resp = client.get(PLACES_URL, params={"page_size": 101})
        assert resp.status_code == 422
