"""
Tests for DELETE /api/v1/scraper/runs/{run_code}.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlmodel import select

from app.db.models import DataLocation, DiscoveryCell, RawCollectorData, ScrapedPlace, ScraperRun


def _make_location(db_session, code="loc_dr1"):
    loc = DataLocation(
        code=code,
        name="DR Location",
        source_type="gmaps",
        config={"city": "Dubai", "max_results": 5},
    )
    db_session.add(loc)
    db_session.commit()
    return loc


def _make_run(db_session, location_code: str, run_code: str = "run_dr1", status: str = "completed"):
    run = ScraperRun(
        run_code=run_code,
        location_code=location_code,
        status=status,
    )
    db_session.add(run)
    db_session.commit()
    return run


def _make_place(db_session, run_code: str, place_code: str = "gplc_dr1"):
    place = ScrapedPlace(
        run_code=run_code,
        place_code=place_code,
        name="Test Place",
        raw_data={"name": "Test Place"},
    )
    db_session.add(place)
    db_session.commit()
    return place


def _make_raw_data(db_session, run_code: str, place_code: str = "gplc_dr1"):
    rd = RawCollectorData(
        place_code=place_code,
        collector_name="gmaps",
        run_code=run_code,
        raw_response={"test": True},
    )
    db_session.add(rd)
    db_session.commit()
    return rd


class TestDeleteRun:
    def test_delete_existing_run(self, client, db_session):
        loc = _make_location(db_session, code="loc_dr2")
        run = _make_run(db_session, loc.code, run_code="run_dr2")

        resp = client.delete(f"/api/v1/scraper/runs/{run.run_code}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "deleted"
        assert data["run_code"] == run.run_code

    def test_delete_nonexistent_run_returns_404(self, client):
        resp = client.delete("/api/v1/scraper/runs/run_notreal")
        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"].lower()

    def test_delete_removes_run_from_db(self, client, db_session):
        loc = _make_location(db_session, code="loc_dr3")
        run = _make_run(db_session, loc.code, run_code="run_dr3")

        client.delete(f"/api/v1/scraper/runs/{run.run_code}")

        remaining = db_session.exec(
            select(ScraperRun).where(ScraperRun.run_code == run.run_code)
        ).first()
        assert remaining is None

    def test_delete_cascades_to_scraped_places(self, client, db_session):
        loc = _make_location(db_session, code="loc_dr4")
        run = _make_run(db_session, loc.code, run_code="run_dr4")
        _make_place(db_session, run.run_code, place_code="gplc_dr4a")
        _make_place(db_session, run.run_code, place_code="gplc_dr4b")

        client.delete(f"/api/v1/scraper/runs/{run.run_code}")

        remaining = db_session.exec(
            select(ScrapedPlace).where(ScrapedPlace.run_code == run.run_code)
        ).all()
        assert len(remaining) == 0

    def test_delete_cascades_to_raw_collector_data(self, client, db_session):
        loc = _make_location(db_session, code="loc_dr5")
        run = _make_run(db_session, loc.code, run_code="run_dr5")
        _make_raw_data(db_session, run.run_code, place_code="gplc_dr5")

        client.delete(f"/api/v1/scraper/runs/{run.run_code}")

        remaining = db_session.exec(
            select(RawCollectorData).where(RawCollectorData.run_code == run.run_code)
        ).all()
        assert len(remaining) == 0

    def test_delete_run_preserves_sibling_runs(self, client, db_session):
        """Deleting one run should not affect other runs for the same location."""
        loc = _make_location(db_session, code="loc_dr6")
        run_a = _make_run(db_session, loc.code, run_code="run_dr6a")
        run_b = _make_run(db_session, loc.code, run_code="run_dr6b")

        client.delete(f"/api/v1/scraper/runs/{run_a.run_code}")

        remaining = db_session.exec(
            select(ScraperRun).where(ScraperRun.run_code == run_b.run_code)
        ).first()
        assert remaining is not None

    def test_delete_run_without_data(self, client, db_session):
        """Deleting a run with no scraped places or raw data should succeed."""
        loc = _make_location(db_session, code="loc_dr7")
        run = _make_run(db_session, loc.code, run_code="run_dr7")

        resp = client.delete(f"/api/v1/scraper/runs/{run.run_code}")
        assert resp.status_code == 200

    def test_delete_cascades_to_discovery_cells(self, client, db_session):
        loc = _make_location(db_session, code="loc_dr8")
        run = _make_run(db_session, loc.code, run_code="run_dr8")
        cell = DiscoveryCell(
            run_code=run.run_code,
            lat_min=24.0,
            lat_max=24.5,
            lng_min=54.0,
            lng_max=54.5,
            depth=0,
            radius_m=5000.0,
            result_count=5,
            saturated=False,
        )
        db_session.add(cell)
        db_session.commit()

        client.delete(f"/api/v1/scraper/runs/{run.run_code}")

        remaining = db_session.exec(
            select(DiscoveryCell).where(DiscoveryCell.run_code == run.run_code)
        ).all()
        assert len(remaining) == 0
