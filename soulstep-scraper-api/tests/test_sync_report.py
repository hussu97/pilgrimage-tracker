"""Tests for GET /runs/{run_code}/sync-report endpoint."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.db.models import DataLocation, ScrapedPlace, ScraperRun


def _make_location(db_session, code="loc_sr1"):
    loc = DataLocation(code=code, name="SR Location", source_type="gmaps", config={"city": "Dubai"})
    db_session.add(loc)
    db_session.commit()
    return loc


def _make_run(db_session, run_code: str, location_code: str, **kwargs):
    run = ScraperRun(run_code=run_code, location_code=location_code, status="completed", **kwargs)
    db_session.add(run)
    db_session.commit()
    return run


def _make_place(
    db_session,
    run_code: str,
    place_code: str,
    enrichment_status: str = "complete",
    quality_gate=None,
):
    place = ScrapedPlace(
        run_code=run_code,
        place_code=place_code,
        name="Test Place",
        raw_data={"name": "Test Place"},
        enrichment_status=enrichment_status,
        quality_gate=quality_gate,
    )
    db_session.add(place)
    db_session.commit()
    return place


class TestSyncReport:
    def test_404_for_unknown_run(self, client):
        resp = client.get("/api/v1/scraper/runs/nonexistent_run/sync-report")
        assert resp.status_code == 404

    def test_returns_summary_counts(self, client, db_session):
        loc = _make_location(db_session, "loc_srA")
        _make_run(
            db_session,
            "run_srA",
            loc.code,
            places_synced=2,
            places_sync_failed=1,
            places_sync_quality_filtered=3,
            places_sync_name_filtered=1,
        )
        _make_place(db_session, "run_srA", "plc_srA1", enrichment_status="complete")
        _make_place(db_session, "run_srA", "plc_srA2", enrichment_status="complete")
        _make_place(db_session, "run_srA", "plc_srA3", enrichment_status="failed")
        _make_place(
            db_session,
            "run_srA",
            "plc_srA4",
            enrichment_status="filtered",
            quality_gate="below_sync_gate",
        )

        resp = client.get("/api/v1/scraper/runs/run_srA/sync-report")
        assert resp.status_code == 200

        data = resp.json()
        assert data["run_code"] == "run_srA"
        assert data["status"] == "completed"
        assert data["summary"]["places_synced"] == 2
        assert data["summary"]["places_sync_failed"] == 1
        assert data["summary"]["places_quality_filtered"] == 3
        assert data["summary"]["places_name_filtered"] == 1

    def test_enrichment_breakdown(self, client, db_session):
        loc = _make_location(db_session, "loc_srB")
        _make_run(db_session, "run_srB", loc.code)
        _make_place(db_session, "run_srB", "plc_srB1", enrichment_status="complete")
        _make_place(db_session, "run_srB", "plc_srB2", enrichment_status="complete")
        _make_place(db_session, "run_srB", "plc_srB3", enrichment_status="failed")
        _make_place(
            db_session,
            "run_srB",
            "plc_srB4",
            enrichment_status="filtered",
            quality_gate="below_enrichment_gate",
        )

        resp = client.get("/api/v1/scraper/runs/run_srB/sync-report")
        assert resp.status_code == 200

        enrichment = resp.json()["enrichment"]
        assert enrichment["complete"] == 2
        assert enrichment["failed"] == 1
        assert enrichment["filtered"] == 1

    def test_quality_gate_breakdown(self, client, db_session):
        loc = _make_location(db_session, "loc_srC")
        _make_run(db_session, "run_srC", loc.code)
        _make_place(db_session, "run_srC", "plc_srC1", quality_gate="below_sync_gate")
        _make_place(db_session, "run_srC", "plc_srC2", quality_gate="below_sync_gate")
        _make_place(db_session, "run_srC", "plc_srC3", quality_gate="below_enrichment_gate")
        _make_place(db_session, "run_srC", "plc_srC4")  # no gate label

        resp = client.get("/api/v1/scraper/runs/run_srC/sync-report")
        assert resp.status_code == 200

        breakdown = resp.json()["quality_gate_breakdown"]
        assert breakdown.get("below_sync_gate") == 2
        assert breakdown.get("below_enrichment_gate") == 1

    def test_sync_failures_list_returned(self, client, db_session):
        loc = _make_location(db_session, "loc_srD")
        _make_run(
            db_session,
            "run_srD",
            loc.code,
            sync_failure_details=["plc_srD1: HTTP 422", "plc_srD2: server error"],
        )

        resp = client.get("/api/v1/scraper/runs/run_srD/sync-report")
        assert resp.status_code == 200

        failures = resp.json()["sync_failures"]
        assert "plc_srD1: HTTP 422" in failures
        assert "plc_srD2: server error" in failures

    def test_empty_run_returns_zeros(self, client, db_session):
        loc = _make_location(db_session, "loc_srE")
        _make_run(db_session, "run_srE", loc.code)

        resp = client.get("/api/v1/scraper/runs/run_srE/sync-report")
        assert resp.status_code == 200

        data = resp.json()
        assert data["summary"]["total_scraped"] == 0
        assert data["sync_failures"] == []
