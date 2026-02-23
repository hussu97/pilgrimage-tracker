"""
Tests for GET /api/v1/scraper/runs — list runs endpoint.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.db.models import DataLocation, ScraperRun


def _make_location(db_session, code="loc_test"):
    loc = DataLocation(
        code=code,
        name="Test Location",
        source_type="gmaps",
        config={"city": "Dubai", "max_results": 5},
    )
    db_session.add(loc)
    db_session.commit()
    return loc


def _make_run(db_session, location_code: str, status: str = "pending", run_code: str | None = None):
    run = ScraperRun(
        run_code=run_code or f"run_{status[:3]}_{location_code[-4:]}",
        location_code=location_code,
        status=status,
    )
    db_session.add(run)
    db_session.commit()
    return run


class TestListRuns:
    def test_empty_list(self, client):
        resp = client.get("/api/v1/scraper/runs")
        assert resp.status_code == 200
        data = resp.json()
        assert data["items"] == []
        assert data["total"] == 0
        assert data["page"] == 1
        assert data["page_size"] == 20

    def test_returns_all_runs(self, client, db_session):
        loc = _make_location(db_session)
        _make_run(db_session, loc.code, status="pending", run_code="run_001")
        _make_run(db_session, loc.code, status="completed", run_code="run_002")

        resp = client.get("/api/v1/scraper/runs")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 2
        assert len(data["items"]) == 2

    def test_filter_by_status(self, client, db_session):
        loc = _make_location(db_session, code="loc_filt")
        _make_run(db_session, loc.code, status="pending", run_code="run_pend")
        _make_run(db_session, loc.code, status="completed", run_code="run_comp")
        _make_run(db_session, loc.code, status="failed", run_code="run_fail")

        resp = client.get("/api/v1/scraper/runs?status=pending")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["status"] == "pending"

    def test_filter_by_location_code(self, client, db_session):
        loc_a = _make_location(db_session, code="loc_aaa")
        loc_b = _make_location(db_session, code="loc_bbb")
        _make_run(db_session, loc_a.code, run_code="run_aaa1")
        _make_run(db_session, loc_a.code, run_code="run_aaa2")
        _make_run(db_session, loc_b.code, run_code="run_bbb1")

        resp = client.get(f"/api/v1/scraper/runs?location_code={loc_a.code}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 2
        assert all(r["location_code"] == loc_a.code for r in data["items"])

    def test_pagination(self, client, db_session):
        loc = _make_location(db_session, code="loc_pag")
        for i in range(5):
            _make_run(db_session, loc.code, run_code=f"run_pag{i:02d}")

        resp = client.get("/api/v1/scraper/runs?page=1&page_size=2")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 5
        assert len(data["items"]) == 2
        assert data["page"] == 1
        assert data["page_size"] == 2

    def test_pagination_page2(self, client, db_session):
        loc = _make_location(db_session, code="loc_pg2")
        for i in range(5):
            _make_run(db_session, loc.code, run_code=f"run_pg2{i:02d}")

        resp = client.get("/api/v1/scraper/runs?page=2&page_size=2")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 5
        assert len(data["items"]) == 2
        assert data["page"] == 2

    def test_response_fields(self, client, db_session):
        loc = _make_location(db_session, code="loc_fld")
        _make_run(db_session, loc.code, status="running", run_code="run_fld1")

        resp = client.get("/api/v1/scraper/runs")
        assert resp.status_code == 200
        item = resp.json()["items"][0]
        assert "run_code" in item
        assert "location_code" in item
        assert "status" in item
        assert "total_items" in item
        assert "processed_items" in item
        assert "created_at" in item
