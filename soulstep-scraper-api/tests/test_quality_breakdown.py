"""
Tests for score_place_quality_breakdown() and the
GET /api/v1/scraper/runs/{run_code}/places/{place_code}/quality-breakdown endpoint.
"""

import os
import sys

from sqlmodel import Session

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.db.models import DataLocation, ScrapedPlace, ScraperRun
from app.pipeline.place_quality import score_place_quality, score_place_quality_breakdown

# ── Fixture raw_data ──────────────────────────────────────────────────────────

RICH_RAW = {
    "name": "Grand Mosque of Mecca",
    "rating": 4.8,
    "user_rating_count": 5000,
    "business_status": "OPERATIONAL",
    "image_urls": ["url1", "url2", "url3"],
    "has_editorial": True,
    "website_url": "https://example.com",
    "opening_hours": {"Monday": "Open 24 hours"},
    "gmaps_types": ["tourist_attraction", "point_of_interest"],
}

SPARSE_RAW = {
    "name": "Mosque",
    "business_status": "CLOSED_PERMANENTLY",
}


# ── Unit tests for score_place_quality_breakdown ──────────────────────────────


class TestScorePlaceQualityBreakdown:
    def test_returns_8_factors(self):
        result = score_place_quality_breakdown(RICH_RAW)
        assert len(result["factors"]) == 8

    def test_factor_names_present(self):
        result = score_place_quality_breakdown(RICH_RAW)
        names = [f["name"] for f in result["factors"]]
        assert "Rating & Reviews" in names
        assert "Business Status" in names
        assert "Photo Count" in names
        assert "Editorial Summary" in names
        assert "Has Website" in names
        assert "Opening Hours" in names
        assert "Name Specificity" in names
        assert "Place Type Bonus" in names

    def test_weighted_sum_equals_total_score(self):
        result = score_place_quality_breakdown(RICH_RAW)
        weighted_sum = sum(f["weighted"] for f in result["factors"])
        # Allow small floating-point drift
        assert abs(weighted_sum - result["total_score"]) < 0.001

    def test_total_score_matches_score_place_quality(self):
        breakdown = score_place_quality_breakdown(RICH_RAW)
        direct = score_place_quality(RICH_RAW)
        assert abs(breakdown["total_score"] - direct) < 0.001

    def test_total_score_capped_at_one(self):
        result = score_place_quality_breakdown(RICH_RAW)
        assert 0.0 <= result["total_score"] <= 1.0

    def test_gate_none_for_high_score(self):
        result = score_place_quality_breakdown(RICH_RAW)
        # High-quality place should pass all gates
        assert result["gate"] is None

    def test_gate_set_for_low_score(self):
        result = score_place_quality_breakdown(SPARSE_RAW)
        assert result["gate"] is not None

    def test_each_factor_has_required_keys(self):
        result = score_place_quality_breakdown(RICH_RAW)
        for f in result["factors"]:
            assert "name" in f
            assert "weight" in f
            assert "raw_score" in f
            assert "weighted" in f
            assert "detail" in f

    def test_raw_score_within_bounds(self):
        result = score_place_quality_breakdown(RICH_RAW)
        for f in result["factors"]:
            assert 0.0 <= f["raw_score"] <= 1.0

    def test_empty_raw_data(self):
        result = score_place_quality_breakdown({})
        assert len(result["factors"]) == 8
        assert 0.0 <= result["total_score"] <= 1.0

    def test_sparse_raw_data_factors(self):
        result = score_place_quality_breakdown(SPARSE_RAW)
        assert len(result["factors"]) == 8
        # Generic name → 0 specificity
        specificity_factor = next(f for f in result["factors"] if f["name"] == "Name Specificity")
        assert specificity_factor["raw_score"] == 0.0

    def test_detail_field_is_string(self):
        result = score_place_quality_breakdown(RICH_RAW)
        for f in result["factors"]:
            assert isinstance(f["detail"], str)


# ── Endpoint integration tests ────────────────────────────────────────────────


def _seed_place(session: Session, run_code: str, place_code: str, raw_data: dict):
    loc = DataLocation(code="loc_test", name="Test Location", source_type="gmaps", config={})
    session.add(loc)
    run = ScraperRun(run_code=run_code, location_code="loc_test", status="completed")
    session.add(run)
    place = ScrapedPlace(
        place_code=place_code,
        run_code=run_code,
        name=raw_data.get("name", "Test Place"),
        raw_data=raw_data,
        enrichment_status="complete",
    )
    session.add(place)
    session.commit()


class TestQualityBreakdownEndpoint:
    def test_404_when_run_not_found(self, client):
        res = client.get("/api/v1/scraper/runs/nonexistent_run/places/plc_xyz/quality-breakdown")
        assert res.status_code == 404

    def test_404_when_place_not_found(self, client, db_session):
        _seed_place(db_session, "run_abc", "plc_other", RICH_RAW)
        res = client.get("/api/v1/scraper/runs/run_abc/places/plc_missing/quality-breakdown")
        assert res.status_code == 404

    def test_returns_breakdown_for_existing_place(self, client, db_session):
        _seed_place(db_session, "run_xyz", "plc_rich", RICH_RAW)
        res = client.get("/api/v1/scraper/runs/run_xyz/places/plc_rich/quality-breakdown")
        assert res.status_code == 200
        data = res.json()
        assert "total_score" in data
        assert "gate" in data
        assert "factors" in data
        assert len(data["factors"]) == 8

    def test_endpoint_total_score_matches_direct_calculation(self, client, db_session):
        _seed_place(db_session, "run_match", "plc_match", RICH_RAW)
        res = client.get("/api/v1/scraper/runs/run_match/places/plc_match/quality-breakdown")
        assert res.status_code == 200
        data = res.json()
        expected = score_place_quality(RICH_RAW)
        assert abs(data["total_score"] - expected) < 0.001
