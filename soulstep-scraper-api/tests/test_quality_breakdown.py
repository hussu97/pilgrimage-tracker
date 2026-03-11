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
    def test_returns_7_factors(self):
        result = score_place_quality_breakdown(RICH_RAW)
        assert len(result["factors"]) == 7

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
        assert "Place Type Bonus" not in names

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
        assert len(result["factors"]) == 7
        assert 0.0 <= result["total_score"] <= 1.0

    def test_sparse_raw_data_factors(self):
        result = score_place_quality_breakdown(SPARSE_RAW)
        assert len(result["factors"]) == 7
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
        assert len(data["factors"]) == 7

    def test_endpoint_total_score_matches_direct_calculation(self, client, db_session):
        _seed_place(db_session, "run_match", "plc_match", RICH_RAW)
        res = client.get("/api/v1/scraper/runs/run_match/places/plc_match/quality-breakdown")
        assert res.status_code == 200
        data = res.json()
        expected = score_place_quality(RICH_RAW)
        assert abs(data["total_score"] - expected) < 0.001


# ── Edge-case tests for quality scoring ───────────────────────────────────────


class TestQualityScoringEdgeCases:
    def test_all_zero_inputs(self):
        """All-zero raw_data should produce a low but valid score."""
        result = score_place_quality_breakdown(
            {
                "rating": 0,
                "user_rating_count": 0,
            }
        )
        assert 0.0 <= result["total_score"] <= 1.0
        assert len(result["factors"]) == 7

    def test_null_name_field(self):
        """Missing name should not raise — specificity factor handles None."""
        result = score_place_quality_breakdown({"name": None})
        assert 0.0 <= result["total_score"] <= 1.0

    def test_extremely_long_name(self):
        """A very long name should still produce a valid score."""
        result = score_place_quality_breakdown({"name": "A" * 500})
        assert 0.0 <= result["total_score"] <= 1.0

    def test_single_word_generic_name_zero_specificity(self):
        """A single generic word like 'Mosque' should score 0 on name specificity."""
        result = score_place_quality_breakdown({"name": "Mosque"})
        spec = next(f for f in result["factors"] if f["name"] == "Name Specificity")
        assert spec["raw_score"] == 0.0

    def test_specific_two_word_name_nonzero_specificity(self):
        """A specific two-word name should score > 0 on name specificity."""
        result = score_place_quality_breakdown({"name": "Al-Aqsa Mosque"})
        spec = next(f for f in result["factors"] if f["name"] == "Name Specificity")
        assert spec["raw_score"] > 0.0

    def test_permanently_closed_low_status_score(self):
        """CLOSED_PERMANENTLY should produce zero business status score."""
        result = score_place_quality_breakdown({"business_status": "CLOSED_PERMANENTLY"})
        status = next(f for f in result["factors"] if f["name"] == "Business Status")
        assert status["raw_score"] == 0.0

    def test_operational_status_full_score(self):
        """OPERATIONAL business status should produce maximum status score."""
        result = score_place_quality_breakdown({"business_status": "OPERATIONAL"})
        status = next(f for f in result["factors"] if f["name"] == "Business Status")
        assert status["raw_score"] == 1.0

    def test_high_rating_high_reviews_max_rating_factor(self):
        """Rating 4.9 with 10 000 reviews should produce near-max rating factor."""
        result = score_place_quality_breakdown({"rating": 4.9, "user_rating_count": 10000})
        rating = next(f for f in result["factors"] if f["name"] == "Rating & Reviews")
        assert rating["raw_score"] >= 0.9

    def test_score_is_float_not_int(self):
        """total_score must be a float."""
        result = score_place_quality_breakdown(RICH_RAW)
        assert isinstance(result["total_score"], float)

    def test_score_stable_across_calls(self):
        """Calling score_place_quality twice with identical input returns identical result."""
        score_a = score_place_quality(RICH_RAW)
        score_b = score_place_quality(RICH_RAW)
        assert score_a == score_b
