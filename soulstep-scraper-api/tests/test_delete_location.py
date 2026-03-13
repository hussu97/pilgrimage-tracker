"""
Tests for DELETE /api/v1/scraper/data-locations/{code}.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlmodel import select

from app.db.models import DataLocation, DiscoveryCell, RawCollectorData, ScrapedPlace, ScraperRun


def _make_location(db_session, code="loc_del1", name="Delete Me"):
    loc = DataLocation(
        code=code,
        name=name,
        source_type="gmaps",
        config={"city": "Dubai", "max_results": 5},
    )
    db_session.add(loc)
    db_session.commit()
    return loc


def _make_run(db_session, location_code: str, run_code: str = "run_del1"):
    run = ScraperRun(
        run_code=run_code,
        location_code=location_code,
        status="completed",
    )
    db_session.add(run)
    db_session.commit()
    return run


def _make_place(db_session, run_code: str, place_code: str = "gplc_del1"):
    place = ScrapedPlace(
        run_code=run_code,
        place_code=place_code,
        name="Test Place",
        raw_data={"name": "Test Place"},
    )
    db_session.add(place)
    db_session.commit()
    return place


def _make_raw_data(db_session, run_code: str, place_code: str = "gplc_del1"):
    rd = RawCollectorData(
        place_code=place_code,
        collector_name="gmaps",
        run_code=run_code,
        raw_response={"test": True},
    )
    db_session.add(rd)
    db_session.commit()
    return rd


class TestDeleteDataLocation:
    def test_delete_existing_location(self, client, db_session):
        loc = _make_location(db_session, code="loc_dx1")
        resp = client.delete(f"/api/v1/scraper/data-locations/{loc.code}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "deleted"
        assert data["code"] == loc.code

    def test_delete_nonexistent_returns_404(self, client):
        resp = client.delete("/api/v1/scraper/data-locations/loc_notreal")
        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"].lower()

    def test_delete_removes_location_from_db(self, client, db_session):
        loc = _make_location(db_session, code="loc_dx2")
        client.delete(f"/api/v1/scraper/data-locations/{loc.code}")

        remaining = db_session.exec(
            select(DataLocation).where(DataLocation.code == loc.code)
        ).first()
        assert remaining is None

    def test_delete_cascades_to_runs(self, client, db_session):
        loc = _make_location(db_session, code="loc_dx3")
        _make_run(db_session, loc.code, run_code="run_dx3a")
        _make_run(db_session, loc.code, run_code="run_dx3b")

        client.delete(f"/api/v1/scraper/data-locations/{loc.code}")

        remaining_runs = db_session.exec(
            select(ScraperRun).where(ScraperRun.location_code == loc.code)
        ).all()
        assert len(remaining_runs) == 0

    def test_delete_cascades_to_scraped_places(self, client, db_session):
        loc = _make_location(db_session, code="loc_dx4")
        run = _make_run(db_session, loc.code, run_code="run_dx4")
        run_code = run.run_code  # capture before deletion
        _make_place(db_session, run_code, place_code="gplc_dx4")

        client.delete(f"/api/v1/scraper/data-locations/{loc.code}")

        remaining = db_session.exec(
            select(ScrapedPlace).where(ScrapedPlace.run_code == run_code)
        ).all()
        assert len(remaining) == 0

    def test_delete_cascades_to_raw_collector_data(self, client, db_session):
        loc = _make_location(db_session, code="loc_dx5")
        run = _make_run(db_session, loc.code, run_code="run_dx5")
        run_code = run.run_code  # capture before deletion
        _make_raw_data(db_session, run_code, place_code="gplc_dx5")

        client.delete(f"/api/v1/scraper/data-locations/{loc.code}")

        remaining = db_session.exec(
            select(RawCollectorData).where(RawCollectorData.run_code == run_code)
        ).all()
        assert len(remaining) == 0

    def test_delete_location_without_runs(self, client, db_session):
        """Deleting a location with no runs should still succeed."""
        loc = _make_location(db_session, code="loc_dx6")
        resp = client.delete(f"/api/v1/scraper/data-locations/{loc.code}")
        assert resp.status_code == 200

    def test_delete_cascades_to_discovery_cells(self, client, db_session):
        loc = _make_location(db_session, code="loc_dx7")
        run = _make_run(db_session, loc.code, run_code="run_dx7")
        run_code = run.run_code
        cell = DiscoveryCell(
            run_code=run_code,
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

        client.delete(f"/api/v1/scraper/data-locations/{loc.code}")

        remaining = db_session.exec(
            select(DiscoveryCell).where(DiscoveryCell.run_code == run_code)
        ).all()
        assert len(remaining) == 0
