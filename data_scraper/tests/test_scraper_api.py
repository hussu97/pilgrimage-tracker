"""
Integration tests for data_scraper/app/api/v1/scraper.py.

Uses the conftest client fixture backed by in-memory SQLite.
"""

import os
import sys
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.db.models import DataLocation, GeoBoundary, ScraperRun

# ── helpers ────────────────────────────────────────────────────────────────────


def _add_geo_boundary(db_session, name="Dubai", boundary_type="city"):
    boundary = GeoBoundary(
        name=name,
        boundary_type=boundary_type,
        lat_min=24.0,
        lat_max=25.5,
        lng_min=54.5,
        lng_max=55.7,
    )
    db_session.add(boundary)
    db_session.commit()
    return boundary


def _create_location_in_db(db_session, name="Test", source_type="gsheet"):
    loc = DataLocation(
        code=f"loc_{name.lower().replace(' ', '_')}",
        name=name,
        source_type=source_type,
        config={"sheet_code": "testcode123"},
        sheet_code="testcode123",
    )
    db_session.add(loc)
    db_session.commit()
    return loc


def _create_run_in_db(db_session, location_code: str, status: str = "pending"):
    run = ScraperRun(
        run_code=f"run_{status[:3]}_{location_code[-4:]}",
        location_code=location_code,
        status=status,
    )
    db_session.add(run)
    db_session.commit()
    return run


# ── TestDataLocations ──────────────────────────────────────────────────────────


class TestDataLocations:
    def test_create_gsheet_location(self, client):
        resp = client.post(
            "/api/v1/scraper/data-locations",
            json={
                "name": "Test Sheet",
                "source_type": "gsheet",
                "sheet_url": "https://docs.google.com/spreadsheets/d/abc123XYZ/edit",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "Test Sheet"
        assert data["source_type"] == "gsheet"
        assert "code" in data

    def test_create_gsheet_with_bare_code(self, client):
        """Providing just a sheet code (no URL) should still work."""
        resp = client.post(
            "/api/v1/scraper/data-locations",
            json={
                "name": "Bare Code Sheet",
                "source_type": "gsheet",
                "sheet_url": "abc123XYZlongenoughcode",
            },
        )
        assert resp.status_code == 200

    def test_create_gsheet_missing_sheet_url_returns_400(self, client):
        resp = client.post(
            "/api/v1/scraper/data-locations",
            json={"name": "No URL", "source_type": "gsheet"},
        )
        assert resp.status_code == 400

    def test_create_gmaps_missing_boundary_returns_400(self, client):
        """gmaps location requires a GeoBoundary row — none seeded in test DB."""
        resp = client.post(
            "/api/v1/scraper/data-locations",
            json={
                "name": "GMaps Location",
                "source_type": "gmaps",
                "city": "NonexistentCity",
            },
        )
        assert resp.status_code == 400

    def test_create_gmaps_missing_city_and_country_returns_400(self, client):
        resp = client.post(
            "/api/v1/scraper/data-locations",
            json={"name": "GMaps No City", "source_type": "gmaps"},
        )
        assert resp.status_code == 400

    def test_create_gmaps_with_valid_boundary_city(self, client, db_session):
        """gmaps location with a city that exists in DB — covers lines 67-75, 44."""
        _add_geo_boundary(db_session, "Dubai", "city")
        resp = client.post(
            "/api/v1/scraper/data-locations",
            json={
                "name": "Dubai GMaps",
                "source_type": "gmaps",
                "city": "Dubai",
                "max_results": 5,
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["source_type"] == "gmaps"

    def test_create_gmaps_with_valid_boundary_country(self, client, db_session):
        """gmaps location with country (not city) covers the country branch."""
        _add_geo_boundary(db_session, "UAE", "country")
        resp = client.post(
            "/api/v1/scraper/data-locations",
            json={
                "name": "UAE GMaps",
                "source_type": "gmaps",
                "country": "UAE",
            },
        )
        assert resp.status_code == 200

    def test_list_locations_empty(self, client):
        resp = client.get("/api/v1/scraper/data-locations")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_list_locations_after_creation(self, client):
        client.post(
            "/api/v1/scraper/data-locations",
            json={
                "name": "Listed Sheet",
                "source_type": "gsheet",
                "sheet_url": "https://docs.google.com/spreadsheets/d/listtest/edit",
            },
        )
        resp = client.get("/api/v1/scraper/data-locations")
        assert resp.status_code == 200
        locs = resp.json()
        assert len(locs) >= 1
        assert any(loc["name"] == "Listed Sheet" for loc in locs)


# ── TestScraperRuns ────────────────────────────────────────────────────────────


class TestScraperRuns:
    def test_create_run_for_nonexistent_location_returns_404(self, client):
        resp = client.post(
            "/api/v1/scraper/runs",
            json={"location_code": "loc_nonexistent"},
        )
        assert resp.status_code == 404

    def test_create_run_success(self, client, db_session):
        """Create a run for an existing location (patches the background task)."""
        loc = _create_location_in_db(db_session, "Run Test")
        with patch("app.api.v1.scraper.run_scraper_task"):
            resp = client.post(
                "/api/v1/scraper/runs",
                json={"location_code": loc.code},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "pending"
        assert "run_code" in data

    def test_get_run_success(self, client, db_session):
        """Get an existing run by code."""
        loc = _create_location_in_db(db_session, "Get Run Test")
        run = _create_run_in_db(db_session, loc.code, "pending")
        resp = client.get(f"/api/v1/scraper/runs/{run.run_code}")
        assert resp.status_code == 200
        assert resp.json()["run_code"] == run.run_code

    def test_get_run_not_found(self, client):
        resp = client.get("/api/v1/scraper/runs/run_nonexistent")
        assert resp.status_code == 404

    def test_view_data_empty(self, client, db_session):
        """View data for an existing run with no scraped places."""
        loc = _create_location_in_db(db_session, "View Data Test")
        run = _create_run_in_db(db_session, loc.code, "completed")
        resp = client.get(f"/api/v1/scraper/runs/{run.run_code}/data")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_view_data_with_search_filter(self, client, db_session):
        """View data with a search filter — covers the search branch."""
        loc = _create_location_in_db(db_session, "Search Test")
        run = _create_run_in_db(db_session, loc.code, "completed")
        resp = client.get(f"/api/v1/scraper/runs/{run.run_code}/data?search=mosque")
        assert resp.status_code == 200

    def test_sync_run_success(self, client, db_session):
        """Sync a run to the main server (patches the sync task)."""
        loc = _create_location_in_db(db_session, "Sync Test")
        run = _create_run_in_db(db_session, loc.code, "completed")
        with patch("app.api.v1.scraper.sync_run_to_server"):
            resp = client.post(f"/api/v1/scraper/runs/{run.run_code}/sync")
        assert resp.status_code == 200
        assert resp.json()["status"] == "sync_started"

    def test_sync_run_not_found(self, client):
        resp = client.post("/api/v1/scraper/runs/run_nonexistent/sync")
        assert resp.status_code == 404

    def test_cancel_run_success(self, client, db_session):
        """Cancel a pending run."""
        loc = _create_location_in_db(db_session, "Cancel Test")
        run = _create_run_in_db(db_session, loc.code, "pending")
        resp = client.post(f"/api/v1/scraper/runs/{run.run_code}/cancel")
        assert resp.status_code == 200
        assert resp.json()["status"] == "cancelled"

    def test_cancel_completed_run_returns_400(self, client, db_session):
        """Can't cancel a completed run."""
        loc = _create_location_in_db(db_session, "Cancel Done Test")
        run = _create_run_in_db(db_session, loc.code, "completed")
        resp = client.post(f"/api/v1/scraper/runs/{run.run_code}/cancel")
        assert resp.status_code == 400

    def test_cancel_nonexistent_run_returns_404(self, client):
        resp = client.post("/api/v1/scraper/runs/run_nonexistent/cancel")
        assert resp.status_code == 404


# ── TestPlaceTypeMappings ──────────────────────────────────────────────────────


class TestPlaceTypeMappings:
    def test_list_mappings_empty(self, client):
        resp = client.get("/api/v1/scraper/place-type-mappings")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_create_mapping(self, client):
        resp = client.post(
            "/api/v1/scraper/place-type-mappings",
            json={
                "religion": "islam",
                "source_type": "gmaps",
                "gmaps_type": "mosque",
                "our_place_type": "mosque",
                "is_active": True,
                "display_order": 0,
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["religion"] == "islam"
        assert data["gmaps_type"] == "mosque"
        assert "id" in data

    def test_get_mapping_by_id(self, client):
        create_resp = client.post(
            "/api/v1/scraper/place-type-mappings",
            json={
                "religion": "christianity",
                "source_type": "gmaps",
                "gmaps_type": "church",
                "our_place_type": "church",
                "is_active": True,
                "display_order": 1,
            },
        )
        mapping_id = create_resp.json()["id"]

        resp = client.get(f"/api/v1/scraper/place-type-mappings/{mapping_id}")
        assert resp.status_code == 200
        assert resp.json()["gmaps_type"] == "church"

    def test_get_mapping_not_found(self, client):
        resp = client.get("/api/v1/scraper/place-type-mappings/99999")
        assert resp.status_code == 404

    def test_update_mapping(self, client):
        create_resp = client.post(
            "/api/v1/scraper/place-type-mappings",
            json={
                "religion": "hinduism",
                "source_type": "gmaps",
                "gmaps_type": "hindu_temple",
                "our_place_type": "temple",
                "is_active": True,
                "display_order": 0,
            },
        )
        mapping_id = create_resp.json()["id"]

        resp = client.put(
            f"/api/v1/scraper/place-type-mappings/{mapping_id}",
            json={"is_active": False, "display_order": 5},
        )
        assert resp.status_code == 200
        assert resp.json()["is_active"] is False
        assert resp.json()["display_order"] == 5

    def test_update_mapping_not_found(self, client):
        resp = client.put(
            "/api/v1/scraper/place-type-mappings/99999",
            json={"is_active": False},
        )
        assert resp.status_code == 404

    def test_delete_mapping(self, client):
        create_resp = client.post(
            "/api/v1/scraper/place-type-mappings",
            json={
                "religion": "islam",
                "source_type": "gmaps",
                "gmaps_type": "islamic_center",
                "our_place_type": "islamic_center",
                "is_active": True,
                "display_order": 2,
            },
        )
        mapping_id = create_resp.json()["id"]

        resp = client.delete(f"/api/v1/scraper/place-type-mappings/{mapping_id}")
        assert resp.status_code == 200

        # Confirm deleted
        resp2 = client.get(f"/api/v1/scraper/place-type-mappings/{mapping_id}")
        assert resp2.status_code == 404

    def test_delete_mapping_not_found(self, client):
        """Test the 404 path in delete — covers the missing not-found branch."""
        resp = client.delete("/api/v1/scraper/place-type-mappings/99999")
        assert resp.status_code == 404

    def test_list_mappings_with_religion_filter(self, client):
        client.post(
            "/api/v1/scraper/place-type-mappings",
            json={
                "religion": "islam",
                "source_type": "gmaps",
                "gmaps_type": "mosque",
                "our_place_type": "mosque",
                "is_active": True,
                "display_order": 0,
            },
        )
        resp = client.get("/api/v1/scraper/place-type-mappings?religion=islam")
        assert resp.status_code == 200
        data = resp.json()
        assert all(m["religion"] == "islam" for m in data)

    def test_list_mappings_with_source_type_filter(self, client):
        """Covers the source_type filter branch."""
        client.post(
            "/api/v1/scraper/place-type-mappings",
            json={
                "religion": "islam",
                "source_type": "gmaps",
                "gmaps_type": "mosque",
                "our_place_type": "mosque",
                "is_active": True,
                "display_order": 0,
            },
        )
        resp = client.get("/api/v1/scraper/place-type-mappings?source_type=gmaps")
        assert resp.status_code == 200

    def test_list_mappings_with_is_active_filter(self, client):
        """Covers the is_active filter branch."""
        client.post(
            "/api/v1/scraper/place-type-mappings",
            json={
                "religion": "islam",
                "source_type": "gmaps",
                "gmaps_type": "mosque",
                "our_place_type": "mosque",
                "is_active": True,
                "display_order": 0,
            },
        )
        resp = client.get("/api/v1/scraper/place-type-mappings?is_active=true")
        assert resp.status_code == 200


# ── TestMainEndpoints ──────────────────────────────────────────────────────────


class TestMainEndpoints:
    def test_health_endpoint(self, client):
        """Covers the /health endpoint in app/main.py."""
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}

    def test_http_exception_handler(self, error_client):
        """Trigger a 404 to exercise the HTTP exception handler in main.py."""
        resp = error_client.get("/api/v1/scraper/data-locations/nonexistent_bad_path")
        # The handler runs and returns a JSON error
        assert resp.status_code in (404, 405, 422)

    def test_validation_error_handler(self, error_client):
        """Send invalid data to trigger a 422 validation error handler."""
        resp = error_client.post(
            "/api/v1/scraper/data-locations",
            json=None,  # invalid body
        )
        assert resp.status_code == 422
