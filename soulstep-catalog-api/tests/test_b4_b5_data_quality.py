"""Tests for B4 (data-quality endpoint) and B5 (nullable coordinates).

B4: GET /api/v1/admin/places/data-quality
B5: Place.lat / Place.lng nullable; structured_data omits geo when NULL;
    PlaceCreate accepts null coordinates.
"""

from sqlmodel import select

from app.db.models import User
from tests.conftest import SAMPLE_PLACE

PLACES_URL = "/api/v1/places"
DATA_QUALITY_URL = "/api/v1/admin/places/data-quality"
_API_KEY_HEADERS = {"X-API-Key": "test-api-key"}


def _admin_headers(client, db_session):
    resp = client.post(
        "/api/v1/auth/register",
        json={
            "email": "admin_dq@example.com",
            "password": "Admin1234!",
            "display_name": "AdminDQ",
        },
    )
    data = resp.json()
    token = data["token"]
    user = db_session.exec(select(User).where(User.user_code == data["user"]["user_code"])).first()
    user.is_admin = True
    db_session.add(user)
    db_session.commit()
    return {"Authorization": f"Bearer {token}"}


def _create_place(client, place_code, **overrides):
    data = {**SAMPLE_PLACE, "place_code": place_code, **overrides}
    return client.post(PLACES_URL, json=data, headers=_API_KEY_HEADERS)


# ── B5: Nullable coordinates ──────────────────────────────────────────────────


class TestNullableCoordinates:
    def test_create_place_with_null_lat_lng(self, client):
        """PlaceCreate should accept null lat/lng (no location data available)."""
        resp = _create_place(client, "plc_noloc01", lat=None, lng=None)
        assert resp.status_code == 200

    def test_create_place_with_normal_coordinates(self, client):
        """Normal coordinates still work after making fields nullable."""
        resp = _create_place(client, "plc_coords01", lat=25.2048, lng=55.2708)
        assert resp.status_code == 200

    def test_place_detail_returns_null_coordinates(self, client):
        """Place detail endpoint returns null lat/lng when not set."""
        _create_place(client, "plc_noloc02", lat=None, lng=None)
        resp = client.get(f"{PLACES_URL}/plc_noloc02", headers=_API_KEY_HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert data["lat"] is None
        assert data["lng"] is None


# ── B5: structured_data geo guard ─────────────────────────────────────────────


class TestStructuredDataGeoGuard:
    def test_jsonld_omits_geo_for_null_coordinates(self):
        """build_place_jsonld must not emit a geo block when lat/lng are None."""
        from unittest.mock import MagicMock

        from app.services.structured_data import build_place_jsonld

        place = MagicMock()
        place.lat = None
        place.lng = None
        place.name = "Test Mosque"
        place.religion = "islam"
        place.address = "Test St, Dubai"
        place.description = "A mosque"
        place.website_url = None
        place.opening_hours = None
        place.place_code = "plc_geo01"

        schema = build_place_jsonld(
            place=place,
            translated_name=None,
            translated_description=None,
            seo=None,
        )
        assert "geo" not in schema

    def test_jsonld_includes_geo_when_coordinates_present(self):
        """build_place_jsonld must emit a geo block when lat/lng are set."""
        from unittest.mock import MagicMock

        from app.services.structured_data import build_place_jsonld

        place = MagicMock()
        place.lat = 25.2048
        place.lng = 55.2708
        place.name = "Test Mosque"
        place.religion = "islam"
        place.address = "Test St, Dubai"
        place.description = "A mosque"
        place.website_url = None
        place.opening_hours = None
        place.place_code = "plc_geo02"

        schema = build_place_jsonld(
            place=place,
            translated_name=None,
            translated_description=None,
            seo=None,
        )
        assert "geo" in schema
        assert schema["geo"]["latitude"] == 25.2048
        assert schema["geo"]["longitude"] == 55.2708


# ── B4: Data-quality endpoint ─────────────────────────────────────────────────


class TestDataQualityEndpoint:
    def test_data_quality_requires_admin(self, client):
        resp = client.get(DATA_QUALITY_URL)
        assert resp.status_code == 401

    def test_data_quality_empty_when_no_issues(self, client, db_session):
        """Clean places (valid coords, known religion) do not appear in the report."""
        _create_place(client, "plc_clean01", lat=25.0, lng=55.0, religion="islam")
        headers = _admin_headers(client, db_session)
        resp = client.get(DATA_QUALITY_URL, headers=headers)
        assert resp.status_code == 200
        codes = [item["place_code"] for item in resp.json()]
        assert "plc_clean01" not in codes

    def test_data_quality_flags_null_coordinates(self, client, db_session):
        """Places with null lat/lng are reported as null_coordinates."""
        _create_place(client, "plc_null01", lat=None, lng=None)
        headers = _admin_headers(client, db_session)
        resp = client.get(DATA_QUALITY_URL, headers=headers)
        assert resp.status_code == 200
        items = {item["place_code"]: item for item in resp.json()}
        assert "plc_null01" in items
        assert items["plc_null01"]["issue"] == "null_coordinates"

    def test_data_quality_flags_unknown_religion(self, client, db_session):
        """Places with religion='unknown' are reported (legacy data from before enum enforcement)."""
        from app.db.models import Place

        # Bypass API enum validation — insert directly to simulate legacy data
        place = Place(
            place_code="plc_unk01",
            name="Unknown Religion Place",
            religion="unknown",  # type: ignore[arg-type]
            place_type="mosque",
            lat=25.2048,
            lng=55.2708,
            address="Legacy Address",
        )
        db_session.add(place)
        db_session.commit()

        headers = _admin_headers(client, db_session)
        resp = client.get(DATA_QUALITY_URL, headers=headers)
        assert resp.status_code == 200
        items = {item["place_code"]: item for item in resp.json()}
        assert "plc_unk01" in items
        assert items["plc_unk01"]["issue"] == "unknown_religion"

    def test_data_quality_response_shape(self, client, db_session):
        """Each issue item has the required fields."""
        _create_place(client, "plc_shape01", lat=None, lng=None)
        headers = _admin_headers(client, db_session)
        resp = client.get(DATA_QUALITY_URL, headers=headers)
        assert resp.status_code == 200
        items = resp.json()
        assert len(items) >= 1
        item = next(i for i in items if i["place_code"] == "plc_shape01")
        assert "place_code" in item
        assert "name" in item
        assert "place_type" in item
        assert "religion" in item
        assert "issue" in item
