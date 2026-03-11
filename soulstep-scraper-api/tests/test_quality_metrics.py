"""
Tests for GET /api/v1/scraper/quality-metrics
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.db.models import DataLocation, ScrapedPlace, ScraperRun

# ── Helpers ───────────────────────────────────────────────────────────────────


def _add_location(db_session, code="loc_test", name="Test Location"):
    loc = DataLocation(
        code=code,
        name=name,
        source_type="gmaps",
        config={"city": "Dubai", "max_results": 5},
    )
    db_session.add(loc)
    db_session.commit()
    return loc


def _add_run(db_session, run_code="run_test001", location_code="loc_test", status="completed"):
    run = ScraperRun(run_code=run_code, location_code=location_code, status=status)
    db_session.add(run)
    db_session.commit()
    return run


def _add_place(
    db_session,
    run_code="run_test001",
    place_code="gplc_001",
    quality_score=None,
    quality_gate=None,
    description_source=None,
    enrichment_status="complete",
):
    place = ScrapedPlace(
        run_code=run_code,
        place_code=place_code,
        name="Test Place",
        raw_data={},
        enrichment_status=enrichment_status,
        description_source=description_source,
        quality_score=quality_score,
        quality_gate=quality_gate,
    )
    db_session.add(place)
    db_session.commit()
    return place


# ── Tests ─────────────────────────────────────────────────────────────────────


class TestQualityMetricsEmpty:
    def test_empty_db_returns_valid_structure(self, client):
        resp = client.get("/api/v1/scraper/quality-metrics")
        assert resp.status_code == 200
        data = resp.json()
        assert data["score_distribution"] == [
            {"bucket": f"{round(i * 0.1, 1)}-{round((i + 1) * 0.1, 1)}", "count": 0}
            for i in range(10)
        ]
        assert data["avg_quality_score"] is None
        assert data["median_quality_score"] is None
        assert data["overall_stats"]["total_scraped"] == 0
        assert data["overall_stats"]["overall_filter_rate_pct"] == 0.0


class TestQualityMetricsSeeded:
    def test_seeded_data_score_distribution(self, client, db_session):
        _add_location(db_session)
        _add_run(db_session)
        # Add places with known scores
        _add_place(
            db_session, place_code="gplc_s01", quality_score=0.15, quality_gate="below_image_gate"
        )
        _add_place(
            db_session,
            place_code="gplc_s02",
            quality_score=0.30,
            quality_gate="below_enrichment_gate",
        )
        _add_place(db_session, place_code="gplc_s03", quality_score=0.50, quality_gate="passed")
        _add_place(db_session, place_code="gplc_s04", quality_score=0.80, quality_gate="passed")

        resp = client.get("/api/v1/scraper/quality-metrics")
        assert resp.status_code == 200
        data = resp.json()

        dist = {b["bucket"]: b["count"] for b in data["score_distribution"]}
        assert dist["0.1-0.2"] == 1  # 0.15
        assert dist["0.3-0.4"] == 1  # 0.30
        assert dist["0.5-0.6"] == 1  # 0.50
        assert dist["0.8-0.9"] == 1  # 0.80

    def test_gate_breakdown(self, client, db_session):
        _add_location(db_session)
        _add_run(db_session)
        _add_place(db_session, place_code="gplc_g01", quality_gate="below_image_gate")
        _add_place(db_session, place_code="gplc_g02", quality_gate="passed")
        _add_place(db_session, place_code="gplc_g03", quality_gate="passed")

        resp = client.get("/api/v1/scraper/quality-metrics")
        assert resp.status_code == 200
        data = resp.json()
        gate_map = {g["gate"]: g["count"] for g in data["gate_breakdown"]}
        assert gate_map["below_image_gate"] == 1
        assert gate_map["passed"] == 2


class TestQualityMetricsRunCodeFilter:
    def test_run_code_filter_only_counts_that_run(self, client, db_session):
        _add_location(db_session)
        _add_run(db_session, run_code="run_a001", location_code="loc_test")
        _add_run(db_session, run_code="run_b001", location_code="loc_test")
        _add_place(
            db_session,
            run_code="run_a001",
            place_code="gplc_r01",
            quality_score=0.55,
            quality_gate="passed",
        )
        _add_place(
            db_session,
            run_code="run_b001",
            place_code="gplc_r02",
            quality_score=0.10,
            quality_gate="below_image_gate",
        )

        resp = client.get("/api/v1/scraper/quality-metrics?run_code=run_a001")
        assert resp.status_code == 200
        data = resp.json()
        assert data["overall_stats"]["total_scraped"] == 1
        gate_map = {g["gate"]: g["count"] for g in data["gate_breakdown"]}
        assert gate_map["passed"] == 1
        assert gate_map["below_image_gate"] == 0


class TestQualityMetricsDescriptionSource:
    def test_description_source_breakdown(self, client, db_session):
        _add_location(db_session)
        _add_run(db_session)
        _add_place(db_session, place_code="gplc_d01", description_source="wikipedia")
        _add_place(db_session, place_code="gplc_d02", description_source="wikipedia")
        _add_place(db_session, place_code="gplc_d03", description_source="llm_synthesized")

        resp = client.get("/api/v1/scraper/quality-metrics")
        assert resp.status_code == 200
        data = resp.json()
        source_map = {s["source"]: s["count"] for s in data["description_source_breakdown"]}
        assert source_map["wikipedia"] == 2
        assert source_map["llm_synthesized"] == 1


class TestQualityMetricsEnrichmentStatus:
    def test_enrichment_status_breakdown(self, client, db_session):
        _add_location(db_session)
        _add_run(db_session)
        _add_place(db_session, place_code="gplc_e01", enrichment_status="complete")
        _add_place(db_session, place_code="gplc_e02", enrichment_status="complete")
        _add_place(db_session, place_code="gplc_e03", enrichment_status="filtered")

        resp = client.get("/api/v1/scraper/quality-metrics")
        assert resp.status_code == 200
        data = resp.json()
        status_map = {s["status"]: s["count"] for s in data["enrichment_status_breakdown"]}
        assert status_map["complete"] == 2
        assert status_map["filtered"] == 1


class TestQualityMetricsAvgScore:
    def test_avg_score_accuracy(self, client, db_session):
        _add_location(db_session)
        _add_run(db_session)
        _add_place(db_session, place_code="gplc_av1", quality_score=0.20)
        _add_place(db_session, place_code="gplc_av2", quality_score=0.40)
        _add_place(db_session, place_code="gplc_av3", quality_score=0.60)

        resp = client.get("/api/v1/scraper/quality-metrics")
        assert resp.status_code == 200
        data = resp.json()
        assert abs(data["avg_quality_score"] - 0.4) < 0.001
        assert abs(data["median_quality_score"] - 0.4) < 0.001


class TestQualityMetricsNearThreshold:
    def test_near_threshold_band_counting(self, client, db_session):
        _add_location(db_session)
        _add_run(db_session)
        # GATE_IMAGE_DOWNLOAD=0.50 band: 0.45–0.55
        _add_place(db_session, place_code="gplc_nt1", quality_score=0.47)
        _add_place(db_session, place_code="gplc_nt2", quality_score=0.53)
        # Outside all bands
        _add_place(db_session, place_code="gplc_nt3", quality_score=0.20)

        resp = client.get("/api/v1/scraper/quality-metrics")
        assert resp.status_code == 200
        data = resp.json()
        nt = {n["gate"]: n["count"] for n in data["near_threshold_counts"]}
        # 0.47 and 0.53 are both in [0.45, 0.55]
        assert nt["below_image_gate"] == 2
        # 0.20 is not near 0.60 or 0.70
        assert nt["below_enrichment_gate"] == 0
        assert nt["below_sync_gate"] == 0
