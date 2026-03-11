"""
Tests for GET /runs/{run_code}/activity and GET /runs/{run_code}/cells.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.db.models import DiscoveryCell, ScrapedPlace, ScraperRun

# ── helpers ────────────────────────────────────────────────────────────────────


def _make_run(db_session, run_code="run_test_act1", status="running"):
    run = ScraperRun(run_code=run_code, location_code="loc_test", status=status)
    db_session.add(run)
    db_session.commit()
    return run


def _make_place(db_session, run_code, place_code, name="Mosque", enrichment_status="pending"):
    place = ScrapedPlace(
        run_code=run_code,
        place_code=place_code,
        name=name,
        raw_data={"name": name},
        enrichment_status=enrichment_status,
    )
    db_session.add(place)
    db_session.commit()
    return place


def _make_cell(
    db_session,
    run_code,
    lat_min=24.0,
    lat_max=24.5,
    lng_min=54.0,
    lng_max=54.5,
    depth=0,
    result_count=10,
    saturated=False,
):
    cell = DiscoveryCell(
        run_code=run_code,
        lat_min=lat_min,
        lat_max=lat_max,
        lng_min=lng_min,
        lng_max=lng_max,
        depth=depth,
        radius_m=30000.0,
        result_count=result_count,
        saturated=saturated,
        resource_names=[f"places/id{i}" for i in range(result_count)],
    )
    db_session.add(cell)
    db_session.commit()
    return cell


# ── /activity ─────────────────────────────────────────────────────────────────


class TestRunActivity:
    def test_activity_404_for_missing_run(self, client):
        resp = client.get("/api/v1/scraper/runs/run_nonexistent/activity")
        assert resp.status_code == 404

    def test_activity_empty_run(self, client, db_session):
        """A run with no places or cells returns all-zero counts."""
        _make_run(db_session, "run_act_empty")
        resp = client.get("/api/v1/scraper/runs/run_act_empty/activity")
        assert resp.status_code == 200
        data = resp.json()
        assert data["cells_total"] == 0
        assert data["cells_saturated"] == 0
        assert data["places_total"] == 0
        assert data["places_complete"] == 0
        assert data["places_failed"] == 0
        assert data["places_pending"] == 0
        assert data["places_enriching"] == []

    def test_activity_with_cells(self, client, db_session):
        run = _make_run(db_session, "run_act_cells")
        _make_cell(db_session, run.run_code, result_count=20, saturated=True)
        _make_cell(
            db_session, run.run_code, lat_min=24.5, lat_max=25.0, result_count=5, saturated=False
        )
        resp = client.get(f"/api/v1/scraper/runs/{run.run_code}/activity")
        assert resp.status_code == 200
        data = resp.json()
        assert data["cells_total"] == 2
        assert data["cells_saturated"] == 1

    def test_activity_place_counts(self, client, db_session):
        run = _make_run(db_session, "run_act_places")
        _make_place(db_session, run.run_code, "gplc_a1", enrichment_status="complete")
        _make_place(db_session, run.run_code, "gplc_a2", enrichment_status="complete")
        _make_place(db_session, run.run_code, "gplc_a3", enrichment_status="failed")
        _make_place(
            db_session, run.run_code, "gplc_a4", enrichment_status="enriching", name="Al Noor"
        )
        _make_place(db_session, run.run_code, "gplc_a5", enrichment_status="pending")

        resp = client.get(f"/api/v1/scraper/runs/{run.run_code}/activity")
        assert resp.status_code == 200
        data = resp.json()
        assert data["places_total"] == 5
        assert data["places_complete"] == 2
        assert data["places_failed"] == 1
        assert len(data["places_enriching"]) == 1
        assert data["places_enriching"][0]["name"] == "Al Noor"
        assert data["places_enriching"][0]["place_code"] == "gplc_a4"

    def test_activity_detail_fetch_fields(self, client, db_session):
        """detail_fetch_total equals run.total_items; detail_fetch_cached equals run.detail_fetch_cached."""
        run = ScraperRun(
            run_code="run_act_df1",
            location_code="loc_test",
            status="running",
            total_items=42,
            detail_fetch_cached=10,
        )
        db_session.add(run)
        db_session.commit()

        resp = client.get("/api/v1/scraper/runs/run_act_df1/activity")
        assert resp.status_code == 200
        data = resp.json()
        assert data["detail_fetch_total"] == 42
        assert data["detail_fetch_cached"] == 10

    def test_activity_detail_fetch_defaults(self, client, db_session):
        """detail_fetch_cached defaults to 0 and detail_fetch_total is None when total_items not set."""
        _make_run(db_session, "run_act_df2")
        resp = client.get("/api/v1/scraper/runs/run_act_df2/activity")
        assert resp.status_code == 200
        data = resp.json()
        assert data["detail_fetch_cached"] == 0
        assert data["detail_fetch_total"] is None

    def test_activity_places_enriching_capped_at_5(self, client, db_session):
        run = _make_run(db_session, "run_act_cap")
        for i in range(8):
            _make_place(
                db_session,
                run.run_code,
                f"gplc_cap{i}",
                name=f"Place {i}",
                enrichment_status="enriching",
            )
        resp = client.get(f"/api/v1/scraper/runs/{run.run_code}/activity")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["places_enriching"]) <= 5


# ── /cells ────────────────────────────────────────────────────────────────────


class TestRunCells:
    def test_cells_404_for_missing_run(self, client):
        resp = client.get("/api/v1/scraper/runs/run_nonexistent/cells")
        assert resp.status_code == 404

    def test_cells_empty(self, client, db_session):
        _make_run(db_session, "run_cells_empty")
        resp = client.get("/api/v1/scraper/runs/run_cells_empty/cells")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["items"] == []

    def test_cells_returns_correct_fields(self, client, db_session):
        run = _make_run(db_session, "run_cells_fields")
        _make_cell(
            db_session,
            run.run_code,
            lat_min=24.0,
            lat_max=24.5,
            lng_min=54.0,
            lng_max=54.5,
            depth=1,
            result_count=15,
            saturated=False,
        )
        resp = client.get(f"/api/v1/scraper/runs/{run.run_code}/cells")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        cell = data["items"][0]
        assert cell["depth"] == 1
        assert cell["result_count"] == 15
        assert cell["saturated"] is False
        assert cell["resource_names_count"] == 15
        assert "lat_min" in cell
        assert "radius_m" in cell
        assert "width_m" in cell and cell["width_m"] > 0
        assert "height_m" in cell and cell["height_m"] > 0
        assert "area_m2" in cell and cell["area_m2"] > 0

    def test_cells_pagination(self, client, db_session):
        run = _make_run(db_session, "run_cells_page")
        for i in range(10):
            _make_cell(
                db_session,
                run.run_code,
                lat_min=24.0 + i * 0.1,
                lat_max=24.1 + i * 0.1,
                depth=i % 3,
            )
        resp = client.get(f"/api/v1/scraper/runs/{run.run_code}/cells?page=1&page_size=5")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 10
        assert len(data["items"]) == 5
        assert data["page"] == 1
        assert data["page_size"] == 5

    def test_cells_saturated_flag(self, client, db_session):
        run = _make_run(db_session, "run_cells_sat")
        _make_cell(db_session, run.run_code, result_count=20, saturated=True)
        resp = client.get(f"/api/v1/scraper/runs/{run.run_code}/cells")
        data = resp.json()
        assert data["items"][0]["saturated"] is True

    def test_cell_dimensions_values(self, client, db_session):
        """Dimensions should be computed correctly for a known bounding box."""
        run = _make_run(db_session, "run_cells_dim")
        # 0.5 degree square at equator ≈ 55500 m on each side
        _make_cell(
            db_session,
            run.run_code,
            lat_min=0.0,
            lat_max=0.5,
            lng_min=0.0,
            lng_max=0.5,
            depth=0,
            result_count=0,
            saturated=False,
        )
        resp = client.get(f"/api/v1/scraper/runs/{run.run_code}/cells")
        assert resp.status_code == 200
        cell = resp.json()["items"][0]
        # At equator, 0.5 deg lat and lng are both ~55500 m
        assert abs(cell["height_m"] - 55500) < 500
        assert abs(cell["width_m"] - 55500) < 500
        assert cell["area_m2"] > 0
