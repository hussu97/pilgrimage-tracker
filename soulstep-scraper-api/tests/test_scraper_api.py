"""
Integration tests for data_scraper/app/api/v1/scraper.py.

Uses the conftest client fixture backed by in-memory SQLite.
"""

import os
import sys
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.db.models import DataLocation, GeoBoundary, RawCollectorData, ScrapedPlace, ScraperRun

# ── helpers ────────────────────────────────────────────────────────────────────


def _add_geo_boundary(db_session, name="Dubai", boundary_type="city", state=None, radius_km=None):
    boundary = GeoBoundary(
        name=name,
        boundary_type=boundary_type,
        state=state,
        lat_min=24.0,
        lat_max=25.5,
        lng_min=54.5,
        lng_max=55.7,
        radius_km=radius_km,
    )
    db_session.add(boundary)
    db_session.commit()
    return boundary


def _create_location_in_db(db_session, name="Test"):
    loc = DataLocation(
        code=f"loc_{name.lower().replace(' ', '_')}",
        name=name,
        source_type="gmaps",
        config={"city": "Dubai", "max_results": 5},
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


def _create_place_in_db(
    db_session, run_code: str, place_code: str = "gplc_test1", name: str = "Test Mosque"
):
    place = ScrapedPlace(
        run_code=run_code,
        place_code=place_code,
        name=name,
        raw_data={"name": name, "lat": 25.2, "lng": 55.3, "description": "A test place"},
    )
    db_session.add(place)
    db_session.commit()
    return place


# ── TestDataLocations ──────────────────────────────────────────────────────────


class TestDataLocations:
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

    def test_create_gmaps_with_valid_boundary_city(self, client, db_session):
        """gmaps location with a city that exists in DB."""
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

    def test_create_gmaps_with_valid_boundary_state(self, client, db_session):
        """gmaps location with state scope validates against GeoBoundary of type 'state'."""
        _add_geo_boundary(db_session, "California", "state")
        resp = client.post(
            "/api/v1/scraper/data-locations",
            json={
                "name": "California GMaps",
                "source_type": "gmaps",
                "state": "California",
                "max_results": 5,
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["source_type"] == "gmaps"
        assert data["config"]["state"] == "California"

    def test_create_gmaps_missing_state_boundary_returns_400(self, client):
        """State that doesn't exist in GeoBoundary table returns 400."""
        resp = client.post(
            "/api/v1/scraper/data-locations",
            json={
                "name": "Unknown State",
                "source_type": "gmaps",
                "state": "NonexistentState",
            },
        )
        assert resp.status_code == 400

    def test_create_gmaps_missing_all_scopes_returns_400(self, client):
        """No city, state, or country provided returns 400."""
        resp = client.post(
            "/api/v1/scraper/data-locations",
            json={"name": "No Scope", "source_type": "gmaps"},
        )
        assert resp.status_code == 400

    def test_list_locations_empty(self, client):
        resp = client.get("/api/v1/scraper/data-locations")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_list_locations_after_creation(self, client, db_session):
        _add_geo_boundary(db_session, "Dubai", "city")
        client.post(
            "/api/v1/scraper/data-locations",
            json={
                "name": "Listed GMaps",
                "source_type": "gmaps",
                "city": "Dubai",
                "max_results": 5,
            },
        )
        resp = client.get("/api/v1/scraper/data-locations")
        assert resp.status_code == 200
        locs = resp.json()
        assert len(locs) >= 1
        assert any(loc["name"] == "Listed GMaps" for loc in locs)


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
        with patch("app.api.v1.scraper.trigger_queue_check"):
            resp = client.post(
                "/api/v1/scraper/runs",
                json={"location_code": loc.code},
            )
        assert resp.status_code == 200
        data = resp.json()
        # Response is now always { "runs": [...] }
        assert "runs" in data
        assert len(data["runs"]) == 1
        assert data["runs"][0]["status"] == "queued"
        assert "run_code" in data["runs"][0]

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
        """View data for an existing run with no scraped places returns paginated response."""
        loc = _create_location_in_db(db_session, "View Data Test")
        run = _create_run_in_db(db_session, loc.code, "completed")
        resp = client.get(f"/api/v1/scraper/runs/{run.run_code}/data")
        assert resp.status_code == 200
        data = resp.json()
        assert data["items"] == []
        assert data["total"] == 0
        assert data["page"] == 1
        assert data["page_size"] == 50

    def test_view_data_with_search_filter(self, client, db_session):
        """View data with a search filter — covers the search branch."""
        loc = _create_location_in_db(db_session, "Search Test")
        run = _create_run_in_db(db_session, loc.code, "completed")
        resp = client.get(f"/api/v1/scraper/runs/{run.run_code}/data?search=mosque")
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert "total" in data

    def test_view_data_pagination(self, client, db_session):
        """View data supports page and page_size query params."""
        loc = _create_location_in_db(db_session, "Pagination Test")
        run = _create_run_in_db(db_session, loc.code, "completed")

        # Insert 5 scraped places
        for i in range(5):
            place = ScrapedPlace(
                run_code=run.run_code,
                place_code=f"gplc_page{i}",
                name=f"Place {i}",
                raw_data={"name": f"Place {i}"},
                enrichment_status="complete",
            )
            db_session.add(place)
        db_session.commit()

        # Page 1, size 3 → 3 items
        resp = client.get(f"/api/v1/scraper/runs/{run.run_code}/data?page=1&page_size=3")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 5
        assert len(data["items"]) == 3
        assert data["page"] == 1
        assert data["page_size"] == 3

        # Page 2, size 3 → 2 items
        resp = client.get(f"/api/v1/scraper/runs/{run.run_code}/data?page=2&page_size=3")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 5
        assert len(data["items"]) == 2
        assert data["page"] == 2

    def test_view_raw_data_empty(self, client, db_session):
        """View raw collector data for a run with no data."""
        loc = _create_location_in_db(db_session, "Raw Data Test")
        run = _create_run_in_db(db_session, loc.code, "completed")
        resp = client.get(f"/api/v1/scraper/runs/{run.run_code}/raw-data")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_view_raw_data_with_filters(self, client, db_session):
        """View raw collector data filtered by collector name and place code."""
        loc = _create_location_in_db(db_session, "Raw Filter Test")
        run = _create_run_in_db(db_session, loc.code, "completed")

        # Insert a raw collector data record
        raw = RawCollectorData(
            place_code="gplc_test1",
            collector_name="osm",
            run_code=run.run_code,
            raw_response={"amenity": "place_of_worship"},
            status="success",
        )
        db_session.add(raw)
        db_session.commit()

        # Filter by collector
        resp = client.get(f"/api/v1/scraper/runs/{run.run_code}/raw-data?collector=osm")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["collector_name"] == "osm"

        # Filter by place_code
        resp = client.get(f"/api/v1/scraper/runs/{run.run_code}/raw-data?place_code=gplc_test1")
        assert resp.status_code == 200
        assert len(resp.json()) == 1

        # Filter by non-matching collector
        resp = client.get(f"/api/v1/scraper/runs/{run.run_code}/raw-data?collector=wikipedia")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_re_enrich_run_success(self, client, db_session):
        """Re-enrich a run that has places."""
        loc = _create_location_in_db(db_session, "Re-enrich Test")
        run = _create_run_in_db(db_session, loc.code, "completed")
        _create_place_in_db(db_session, run.run_code)

        with patch("app.pipeline.enrichment.run_enrichment_pipeline"):
            resp = client.post(f"/api/v1/scraper/runs/{run.run_code}/re-enrich")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "re_enrichment_started"
        assert data["place_count"] == 1

    def test_re_enrich_run_not_found(self, client):
        resp = client.post("/api/v1/scraper/runs/run_nonexistent/re-enrich")
        assert resp.status_code == 404

    def test_re_enrich_run_no_places(self, client, db_session):
        """Re-enrich a run with no places returns 400."""
        loc = _create_location_in_db(db_session, "Re-enrich Empty")
        run = _create_run_in_db(db_session, loc.code, "completed")
        resp = client.post(f"/api/v1/scraper/runs/{run.run_code}/re-enrich")
        assert resp.status_code == 400

    def test_retry_images_with_failures(self, client, db_session):
        """retry-images fires the background task when images_failed > 0."""
        loc = _create_location_in_db(db_session, "Retry Img Fail")
        run = _create_run_in_db(db_session, loc.code, "completed")
        run.images_failed = 3
        run.images_downloaded = 7
        db_session.add(run)
        db_session.commit()

        with patch("app.api.v1.scraper.retry_run_images") as mock_retry:
            resp = client.post(f"/api/v1/scraper/runs/{run.run_code}/retry-images")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "retry_started"
        assert data["images_failed"] == 3
        mock_retry.assert_called_once()

    def test_retry_images_no_failures(self, client, db_session):
        """retry-images returns no_failures when images_failed == 0 and some downloaded."""
        loc = _create_location_in_db(db_session, "Retry Img None")
        run = _create_run_in_db(db_session, loc.code, "completed")
        run.images_failed = 0
        run.images_downloaded = 10
        db_session.add(run)
        db_session.commit()

        resp = client.post(f"/api/v1/scraper/runs/{run.run_code}/retry-images")
        assert resp.status_code == 200
        assert resp.json()["status"] == "no_failures"

    def test_retry_images_not_found(self, client):
        resp = client.post("/api/v1/scraper/runs/run_nonexistent/retry-images")
        assert resp.status_code == 404

    def test_retry_images_running_run_returns_400(self, client, db_session):
        """retry-images on an active run returns 400."""
        loc = _create_location_in_db(db_session, "Retry Img Run")
        run = _create_run_in_db(db_session, loc.code, "running")
        resp = client.post(f"/api/v1/scraper/runs/{run.run_code}/retry-images")
        assert resp.status_code == 400

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

    def test_cancel_cloud_run_execution_called_when_execution_stored(self, client, db_session):
        """When SCRAPER_DISPATCH=cloud_run and cloud_run_execution is set,
        cancel_cloud_run_execution should be called with the stored execution name."""
        loc = _create_location_in_db(db_session, "CloudCancelExec")
        run = ScraperRun(
            run_code="run_cloud_cancel_exec",
            location_code=loc.code,
            status="running",
            cloud_run_execution="projects/proj/locations/us-central1/jobs/scraper/executions/abc123",
        )
        db_session.add(run)
        db_session.commit()

        with (
            patch("app.config.settings") as mock_settings,
            patch("app.api.v1.scraper.cancel_cloud_run_execution") as mock_cancel,
        ):
            mock_settings.scraper_dispatch = "cloud_run"
            resp = client.post(f"/api/v1/scraper/runs/{run.run_code}/cancel")

        assert resp.status_code == 200
        assert resp.json()["status"] == "cancelled"
        mock_cancel.assert_called_once_with(
            "projects/proj/locations/us-central1/jobs/scraper/executions/abc123"
        )

    def test_cancel_local_dispatch_does_not_call_cloud_run(self, client, db_session):
        """With local dispatch, cancel_cloud_run_execution must NOT be called
        even if cloud_run_execution is somehow set."""
        loc = _create_location_in_db(db_session, "LocalCancelExec")
        run = ScraperRun(
            run_code="run_local_cancel_exec",
            location_code=loc.code,
            status="running",
            cloud_run_execution="projects/proj/locations/us-central1/jobs/scraper/executions/xyz",
        )
        db_session.add(run)
        db_session.commit()

        with (
            patch("app.config.settings") as mock_settings,
            patch("app.api.v1.scraper.cancel_cloud_run_execution") as mock_cancel,
        ):
            mock_settings.scraper_dispatch = "local"
            resp = client.post(f"/api/v1/scraper/runs/{run.run_code}/cancel")

        assert resp.status_code == 200
        mock_cancel.assert_not_called()

    def test_cancel_cloud_run_no_execution_stored(self, client, db_session):
        """Cloud Run dispatch with no execution name stored — cancel still succeeds
        and cancel_cloud_run_execution is not called."""
        loc = _create_location_in_db(db_session, "CloudCancelNoExec")
        run = ScraperRun(
            run_code="run_cloud_cancel_no_exec",
            location_code=loc.code,
            status="running",
            cloud_run_execution=None,
        )
        db_session.add(run)
        db_session.commit()

        with (
            patch("app.config.settings") as mock_settings,
            patch("app.api.v1.scraper.cancel_cloud_run_execution") as mock_cancel,
        ):
            mock_settings.scraper_dispatch = "cloud_run"
            resp = client.post(f"/api/v1/scraper/runs/{run.run_code}/cancel")

        assert resp.status_code == 200
        mock_cancel.assert_not_called()

    def test_sync_running_run_returns_400(self, client, db_session):
        loc = _create_location_in_db(db_session, "SRun1")
        run = ScraperRun(run_code="run_sync_active_1", location_code=loc.code, status="running")
        db_session.add(run)
        db_session.commit()
        resp = client.post(f"/api/v1/scraper/runs/{run.run_code}/sync")
        assert resp.status_code == 400
        assert "running" in resp.json()["detail"].lower()

    def test_sync_pending_run_returns_400(self, client, db_session):
        loc = _create_location_in_db(db_session, "SPen1")
        run = ScraperRun(run_code="run_sync_pending_1", location_code=loc.code, status="pending")
        db_session.add(run)
        db_session.commit()
        resp = client.post(f"/api/v1/scraper/runs/{run.run_code}/sync")
        assert resp.status_code == 400

    def test_re_enrich_running_run_returns_400(self, client, db_session):
        loc = _create_location_in_db(db_session, "RERun1")
        run = ScraperRun(run_code="run_reenrich_active_1", location_code=loc.code, status="running")
        db_session.add(run)
        db_session.commit()
        _create_place_in_db(db_session, run.run_code, place_code="gplc_rer1")
        resp = client.post(f"/api/v1/scraper/runs/{run.run_code}/re-enrich")
        assert resp.status_code == 400


# ── TestCollectors ────────────────────────────────────────────────────────────


class TestCollectors:
    def test_list_collectors(self, client):
        """List all collectors with their status."""
        resp = client.get("/api/v1/scraper/collectors")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 7  # gmaps, osm, wikipedia, wikidata, besttime, foursquare, outscraper
        names = [c["name"] for c in data]
        assert "gmaps" in names or "gmaps_browser" in names
        assert "osm" in names
        assert "wikipedia" in names

        # OSM and Wikipedia should be available (no API key required)
        osm = next(c for c in data if c["name"] == "osm")
        assert osm["requires_api_key"] is False
        assert osm["is_available"] is True


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
        data = resp.json()
        assert data["status"] in ("ok", "degraded")
        assert "db" in data

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
