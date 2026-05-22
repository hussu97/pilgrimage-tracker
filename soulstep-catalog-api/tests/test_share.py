"""Tests for GET /share/places/{place_code} OG share endpoint."""

from tests.conftest import SAMPLE_PLACE

SHARE_URL = "/share/places"


_API_KEY_HEADERS = {"X-API-Key": "test-api-key"}


def _create_place(client, place_code: str, **overrides):
    data = {**SAMPLE_PLACE, "place_code": place_code, **overrides}
    resp = client.post("/api/v1/places", json=data, headers=_API_KEY_HEADERS)
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
        assert "max-age=600" in resp.headers.get("cache-control", "")

    def test_share_place_reuses_rendered_html_cache(self, client, monkeypatch):
        """Repeated share requests should avoid rebuilding DB-backed HTML."""
        import app.api.v1.share as share_mod

        _create_place(client, "plc_sharecache1", name="Cached Mosque")
        calls = 0
        original = share_mod.places_db.get_place_by_code

        def wrapped(place_code, session):
            nonlocal calls
            calls += 1
            return original(place_code, session)

        monkeypatch.setattr(share_mod.places_db, "get_place_by_code", wrapped)

        first = client.get(f"{SHARE_URL}/plc_sharecache1", follow_redirects=False)
        second = client.get(f"{SHARE_URL}/plc_sharecache1", follow_redirects=False)

        assert first.status_code == 200
        assert second.status_code == 200
        assert calls == 1

    def test_share_place_not_found(self, client):
        """GET /share/places/bad_code returns 404."""
        resp = client.get(f"{SHARE_URL}/bad_code_xyz", follow_redirects=False)
        assert resp.status_code == 404

    def test_db_connection_failure_returns_503(self, client, monkeypatch):
        """Database connection failures should surface as temporary unavailability."""
        from sqlalchemy.exc import OperationalError

        import app.api.v1.share as share_mod

        def raise_operational_error(_place_code, _session):
            raise OperationalError("SELECT 1", {}, Exception("timeout expired"))

        monkeypatch.setattr(share_mod.places_db, "get_place_by_code", raise_operational_error)

        resp = client.get(f"{SHARE_URL}/plc_db_timeout", follow_redirects=False)

        assert resp.status_code == 503
        assert resp.json()["detail"] == "Database temporarily unavailable"
        assert resp.headers["retry-after"] == "5"
