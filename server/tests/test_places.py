"""Tests for /api/v1/places endpoints: list, get, create, search, filters, reviews, check-ins, favorites."""
import pytest
from tests.conftest import SAMPLE_PLACE

PLACES_URL = "/api/v1/places"


def _register_and_token(client, email="places_user@example.com"):
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Pass1234!", "display_name": "PlaceUser"},
    )
    assert resp.status_code == 200
    return resp.json()["token"]


def _auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def _create_place(client, place_code, **overrides):
    data = {**SAMPLE_PLACE, "place_code": place_code, **overrides}
    return client.post(PLACES_URL, json=data)


# ── list places ────────────────────────────────────────────────────────────────

class TestListPlaces:
    def test_list_empty(self, client):
        resp = client.get(PLACES_URL, params={"lat": 0, "lng": 0})
        assert resp.status_code == 200
        data = resp.json()
        assert "places" in data
        assert isinstance(data["places"], list)

    def test_list_returns_created_place(self, client):
        _create_place(client, "plc_listret01")
        resp = client.get(PLACES_URL, params={"lat": 25.2048, "lng": 55.2708})
        assert resp.status_code == 200
        codes = [p["place_code"] for p in resp.json()["places"]]
        assert "plc_listret01" in codes

    def test_list_has_open_status_field(self, client):
        _create_place(client, "plc_osfld0001")
        resp = client.get(PLACES_URL, params={"lat": 25.2048, "lng": 55.2708})
        assert resp.status_code == 200
        places = resp.json()["places"]
        if places:
            assert "open_status" in places[0]
            assert places[0]["open_status"] in ("open", "closed", "unknown")

    def test_list_filter_by_religion(self, client):
        _create_place(client, "plc_islam001", religion="islam")
        _create_place(
            client, "plc_hindu001",
            name="Test Temple",
            religion="hinduism",
            place_type="temple",
        )
        resp = client.get(PLACES_URL, params={"religion": "islam"})
        assert resp.status_code == 200
        for p in resp.json()["places"]:
            assert p["religion"] == "islam"

    def test_list_with_radius_filter(self, client):
        _create_place(client, "plc_near0001", lat=25.2048, lng=55.2708)
        _create_place(
            client, "plc_far00001",
            name="Far Mosque",
            lat=51.5074,
            lng=-0.1278,
        )
        resp = client.get(PLACES_URL, params={"lat": 25.2048, "lng": 55.2708, "radius": 10})
        assert resp.status_code == 200
        codes = [p["place_code"] for p in resp.json()["places"]]
        assert "plc_near0001" in codes
        assert "plc_far00001" not in codes

    def test_list_search(self, client):
        _create_place(client, "plc_srch0001", name="Grand Mosque Search Test")
        resp = client.get(PLACES_URL, params={"search": "Grand Mosque Search"})
        assert resp.status_code == 200
        codes = [p["place_code"] for p in resp.json()["places"]]
        assert "plc_srch0001" in codes

    def test_list_has_filters_meta(self, client):
        resp = client.get(PLACES_URL, params={"lat": 0, "lng": 0})
        assert resp.status_code == 200
        data = resp.json()
        assert "filters" in data
        assert "options" in data["filters"]

    def test_list_pagination(self, client):
        for i in range(3):
            _create_place(client, f"plc_page{i:04d}", name=f"Pager Place {i}")
        resp = client.get(PLACES_URL, params={"limit": 2, "offset": 0})
        assert resp.status_code == 200
        assert len(resp.json()["places"]) <= 2


# ── get single place ───────────────────────────────────────────────────────────

class TestGetPlace:
    def test_get_existing_place(self, client):
        _create_place(client, "plc_get00001")
        resp = client.get(f"{PLACES_URL}/plc_get00001")
        assert resp.status_code == 200
        data = resp.json()
        assert data["place_code"] == "plc_get00001"
        assert "open_status" in data

    def test_get_nonexistent_place(self, client):
        resp = client.get(f"{PLACES_URL}/plc_notexist0")
        assert resp.status_code == 404

    def test_get_place_has_normalized_hours(self, client):
        _create_place(
            client, "plc_oh000001",
            opening_hours={
                "Monday": "00:00-23:59",
                "Tuesday": "00:00-23:59",
                "Wednesday": "00:00-23:59",
                "Thursday": "00:00-23:59",
                "Friday": "00:00-23:59",
                "Saturday": "00:00-23:59",
                "Sunday": "00:00-23:59",
            },
        )
        resp = client.get(f"{PLACES_URL}/plc_oh000001")
        assert resp.status_code == 200
        hours = resp.json().get("opening_hours", {})
        # 00:00-23:59 should be normalized to OPEN_24_HOURS in API response
        for v in hours.values():
            assert v == "OPEN_24_HOURS"

    def test_get_place_open_status_field(self, client):
        _create_place(client, "plc_os000001")
        resp = client.get(f"{PLACES_URL}/plc_os000001")
        assert resp.status_code == 200
        data = resp.json()
        assert data["open_status"] in ("open", "closed", "unknown")


# ── create / upsert place ─────────────────────────────────────────────────────

class TestCreatePlace:
    def test_create_success(self, client):
        resp = _create_place(client, "plc_create01")
        assert resp.status_code in (200, 201)
        assert resp.json()["place_code"] == "plc_create01"

    def test_create_upsert_updates_name(self, client):
        _create_place(client, "plc_upsert01", name="Original Name")
        resp = _create_place(client, "plc_upsert01", name="Updated Name")
        assert resp.status_code in (200, 201)
        assert resp.json()["name"] == "Updated Name"

    def test_create_missing_required_fields_returns_422(self, client):
        resp = client.post(PLACES_URL, json={"name": "Incomplete"})
        assert resp.status_code == 422


# ── reviews ────────────────────────────────────────────────────────────────────

class TestPlaceReviews:
    def test_list_reviews_empty(self, client):
        _create_place(client, "plc_rev00001")
        resp = client.get(f"{PLACES_URL}/plc_rev00001/reviews")
        assert resp.status_code == 200
        data = resp.json()
        assert "reviews" in data
        assert data["reviews"] == []

    def test_create_review(self, client):
        _create_place(client, "plc_revpost1")
        token = _register_and_token(client, "rev_author@example.com")
        resp = client.post(
            f"{PLACES_URL}/plc_revpost1/reviews",
            json={"rating": 5, "title": "Great!", "body": "Really enjoyed it."},
            headers=_auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["rating"] == 5
        assert "review_code" in data

    def test_create_review_requires_auth(self, client):
        _create_place(client, "plc_revauth1")
        resp = client.post(
            f"{PLACES_URL}/plc_revauth1/reviews",
            json={"rating": 4, "title": "Nice"},
        )
        assert resp.status_code == 401

    def test_create_review_rating_out_of_range(self, client):
        _create_place(client, "plc_revrang1")
        token = _register_and_token(client, "rev_range@example.com")
        resp = client.post(
            f"{PLACES_URL}/plc_revrang1/reviews",
            json={"rating": 6},
            headers=_auth_headers(token),
        )
        assert resp.status_code == 400


# ── check-ins ──────────────────────────────────────────────────────────────────

class TestCheckIns:
    def test_check_in_creates_record(self, client):
        _create_place(client, "plc_chkin001")
        token = _register_and_token(client, "checkin@example.com")
        resp = client.post(
            f"{PLACES_URL}/plc_chkin001/check-in",
            json={"note": "Was here!"},
            headers=_auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "check_in_code" in data
        assert data["place_code"] == "plc_chkin001"

    def test_check_in_requires_auth(self, client):
        _create_place(client, "plc_chkauth1")
        resp = client.post(f"{PLACES_URL}/plc_chkauth1/check-in", json={})
        assert resp.status_code == 401

    def test_check_in_nonexistent_place(self, client):
        token = _register_and_token(client, "checkin2@example.com")
        resp = client.post(
            f"{PLACES_URL}/plc_ghostt01/check-in",
            json={},
            headers=_auth_headers(token),
        )
        assert resp.status_code == 404


# ── favorites ──────────────────────────────────────────────────────────────────

class TestFavorites:
    def test_add_favorite(self, client):
        _create_place(client, "plc_fav00001")
        token = _register_and_token(client, "fav_user@example.com")
        resp = client.post(
            f"{PLACES_URL}/plc_fav00001/favorite",
            headers=_auth_headers(token),
        )
        assert resp.status_code == 200
        assert resp.json().get("ok") is True

    def test_remove_favorite(self, client):
        _create_place(client, "plc_unfav001")
        token = _register_and_token(client, "unfav_user@example.com")
        client.post(f"{PLACES_URL}/plc_unfav001/favorite", headers=_auth_headers(token))
        resp = client.delete(f"{PLACES_URL}/plc_unfav001/favorite", headers=_auth_headers(token))
        assert resp.status_code == 200
        assert resp.json().get("ok") is True

    def test_favorite_requires_auth(self, client):
        _create_place(client, "plc_favauth1")
        resp = client.post(f"{PLACES_URL}/plc_favauth1/favorite")
        assert resp.status_code == 401
