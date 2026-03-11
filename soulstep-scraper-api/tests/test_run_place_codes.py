"""Tests for GET /runs/{run_code}/place-codes and DiscoveryCell deletion in DELETE /runs/{run_code}."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlmodel import select

from app.db.models import DataLocation, DiscoveryCell, ScrapedPlace, ScraperRun

# ── Helpers ────────────────────────────────────────────────────────────────────


def _make_location(db_session, code="loc_pc1"):
    loc = DataLocation(
        code=code,
        name="PC Location",
        source_type="gmaps",
        config={"city": "Dubai", "max_results": 5},
    )
    db_session.add(loc)
    db_session.commit()
    return loc


def _make_run(db_session, location_code: str, run_code: str = "run_pc1", status: str = "completed"):
    run = ScraperRun(run_code=run_code, location_code=location_code, status=status)
    db_session.add(run)
    db_session.commit()
    return run


def _make_scraped_place(db_session, run_code: str, place_code: str):
    place = ScrapedPlace(
        run_code=run_code,
        place_code=place_code,
        name="Test Place",
        raw_data={"name": "Test Place"},
    )
    db_session.add(place)
    db_session.commit()
    return place


def _make_discovery_cell(db_session, run_code: str, idx: int = 1):
    cell = DiscoveryCell(
        run_code=run_code,
        lat_min=25.0 + idx * 0.01,
        lat_max=25.1 + idx * 0.01,
        lng_min=55.0 + idx * 0.01,
        lng_max=55.1 + idx * 0.01,
        depth=1,
        radius_m=500.0,
        result_count=5,
        saturated=False,
    )
    db_session.add(cell)
    db_session.commit()
    return cell


# ── place-codes endpoint tests ─────────────────────────────────────────────────


class TestGetRunPlaceCodes:
    def test_returns_place_codes_for_run(self, client, db_session):
        loc = _make_location(db_session, code="loc_pc2")
        run = _make_run(db_session, loc.code, run_code="run_pc2")
        _make_scraped_place(db_session, run.run_code, place_code="gplc_pc2a")
        _make_scraped_place(db_session, run.run_code, place_code="gplc_pc2b")

        resp = client.get(f"/api/v1/scraper/runs/{run.run_code}/place-codes")
        assert resp.status_code == 200
        data = resp.json()
        assert set(data) == {"gplc_pc2a", "gplc_pc2b"}

    def test_returns_empty_list_when_no_places(self, client, db_session):
        loc = _make_location(db_session, code="loc_pc3")
        run = _make_run(db_session, loc.code, run_code="run_pc3")

        resp = client.get(f"/api/v1/scraper/runs/{run.run_code}/place-codes")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_returns_404_for_unknown_run(self, client):
        resp = client.get("/api/v1/scraper/runs/run_notreal/place-codes")
        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"].lower()

    def test_only_returns_codes_for_that_run(self, client, db_session):
        loc = _make_location(db_session, code="loc_pc4")
        run_a = _make_run(db_session, loc.code, run_code="run_pc4a")
        run_b = _make_run(db_session, loc.code, run_code="run_pc4b")
        _make_scraped_place(db_session, run_a.run_code, place_code="gplc_pc4a")
        _make_scraped_place(db_session, run_b.run_code, place_code="gplc_pc4b")

        resp = client.get(f"/api/v1/scraper/runs/{run_a.run_code}/place-codes")
        assert resp.status_code == 200
        assert resp.json() == ["gplc_pc4a"]


# ── DiscoveryCell deletion in delete_run tests ────────────────────────────────


class TestDeleteRunCascadesCells:
    def test_delete_run_removes_discovery_cells(self, client, db_session):
        loc = _make_location(db_session, code="loc_pc5")
        run = _make_run(db_session, loc.code, run_code="run_pc5")
        _make_discovery_cell(db_session, run.run_code, idx=1)
        _make_discovery_cell(db_session, run.run_code, idx=2)

        resp = client.delete(f"/api/v1/scraper/runs/{run.run_code}")
        assert resp.status_code == 200

        remaining = db_session.exec(
            select(DiscoveryCell).where(DiscoveryCell.run_code == run.run_code)
        ).all()
        assert len(remaining) == 0

    def test_delete_run_preserves_cells_of_other_runs(self, client, db_session):
        loc = _make_location(db_session, code="loc_pc6")
        run_a = _make_run(db_session, loc.code, run_code="run_pc6a")
        run_b = _make_run(db_session, loc.code, run_code="run_pc6b")
        _make_discovery_cell(db_session, run_a.run_code, idx=1)
        _make_discovery_cell(db_session, run_b.run_code, idx=2)

        client.delete(f"/api/v1/scraper/runs/{run_a.run_code}")

        remaining = db_session.exec(
            select(DiscoveryCell).where(DiscoveryCell.run_code == run_b.run_code)
        ).all()
        assert len(remaining) == 1

    def test_delete_run_without_cells_succeeds(self, client, db_session):
        loc = _make_location(db_session, code="loc_pc7")
        run = _make_run(db_session, loc.code, run_code="run_pc7")

        resp = client.delete(f"/api/v1/scraper/runs/{run.run_code}")
        assert resp.status_code == 200
