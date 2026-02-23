"""Tests for GET /share/places/{place_code} OG share endpoint."""

from tests.conftest import SAMPLE_PLACE

SHARE_URL = "/share/places"


def _create_place(client, place_code: str, **overrides):
    data = {**SAMPLE_PLACE, "place_code": place_code, **overrides}
    resp = client.post("/api/v1/places", json=data)
    assert resp.status_code == 200, resp.text
    return resp


class TestSharePlace:
    def test_share_place_ok(self, client):
        """GET /share/places/{code} returns 200 HTML with og:title containing place name."""
        _create_place(client, "plc_share0001", name="Grand Mosque")

        resp = client.get(f"{SHARE_URL}/plc_share0001", follow_redirects=False)

        assert resp.status_code == 200
        content_type = resp.headers.get("content-type", "")
        assert "text/html" in content_type
        body = resp.text
        assert "Grand Mosque" in body
        assert "og:title" in body
        assert "og:url" in body

    def test_share_place_not_found(self, client):
        """GET /share/places/bad_code returns 404."""
        resp = client.get(f"{SHARE_URL}/bad_code_xyz", follow_redirects=False)
        assert resp.status_code == 404
