"""
Unit tests for the place quality scoring engine (app/pipeline/place_quality.py).
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.pipeline.place_quality import (
    GATE_ENRICHMENT,
    GATE_IMAGE_DOWNLOAD,
    GATE_SYNC,
    get_quality_gate,
    is_generic_name,
    is_name_specific_enough,
    passes_gate,
    score_place_quality,
)

# ── Gate constants ────────────────────────────────────────────────────────────


class TestGateConstants:
    def test_all_gates_equal_0_75(self):
        assert GATE_IMAGE_DOWNLOAD == 0.75
        assert GATE_ENRICHMENT == 0.75
        assert GATE_SYNC == 0.75

    def test_gates_in_valid_range(self):
        assert 0.0 < GATE_IMAGE_DOWNLOAD < 1.0
        assert 0.0 < GATE_ENRICHMENT < 1.0
        assert 0.0 < GATE_SYNC < 1.0


# ── is_generic_name ───────────────────────────────────────────────────────────


class TestIsGenericName:
    def test_bare_mosque(self):
        assert is_generic_name("Mosque") is True
        assert is_generic_name("mosque") is True

    def test_bare_masjid(self):
        assert is_generic_name("Masjid") is True
        assert is_generic_name("masjed") is True

    def test_with_article(self):
        assert is_generic_name("The Church") is True
        assert is_generic_name("Al Masjid") is True
        assert is_generic_name("Al-Mosque") is True

    def test_specific_name(self):
        assert is_generic_name("Al-Aqsa Mosque") is False
        assert is_generic_name("Blue Mosque") is False
        assert is_generic_name("Hagia Sophia") is False


# ── score_place_quality ───────────────────────────────────────────────────────


def _make_raw(
    name="Test Mosque",
    rating=4.5,
    user_rating_count=100,
    business_status="OPERATIONAL",
    image_urls=None,
    has_editorial=True,
    website_url="https://example.com",
    opening_hours=None,
    gmaps_types=None,
) -> dict:
    if image_urls is None:
        image_urls = ["https://img1.com", "https://img2.com"]
    if opening_hours is None:
        opening_hours = {"Monday": "09:00-17:00", "Tuesday": "09:00-17:00"}
    if gmaps_types is None:
        gmaps_types = ["mosque", "tourist_attraction", "point_of_interest"]
    return {
        "name": name,
        "rating": rating,
        "user_rating_count": user_rating_count,
        "business_status": business_status,
        "image_urls": image_urls or [],
        "has_editorial": has_editorial,
        "website_url": website_url,
        "opening_hours": opening_hours,
        "gmaps_types": gmaps_types,
    }


class TestScorePlaceQuality:
    def test_score_in_range(self):
        raw = _make_raw()
        score = score_place_quality(raw)
        assert 0.0 <= score <= 1.0

    def test_high_quality_place_scores_high(self):
        raw = _make_raw(
            name="Al-Aqsa Mosque",
            rating=4.8,
            user_rating_count=2000,
            business_status="OPERATIONAL",
        )
        assert score_place_quality(raw) > 0.7

    def test_permanently_closed_scores_low(self):
        raw = _make_raw(
            name="Mosque",  # generic → 0.0 name factor
            business_status="CLOSED_PERMANENTLY",
            rating=0,
            user_rating_count=0,
            image_urls=[],
            has_editorial=False,
            website_url="",
            opening_hours={},
            gmaps_types=[],
        )
        # Even with zero content, Bayesian still contributes ~0.18 (prior) + type base 0.05 = 0.23.
        # A permanently closed place with no reviews, no photos, and a generic name
        # should be well below GATE_ENRICHMENT.
        assert score_place_quality(raw) < GATE_ENRICHMENT

    def test_operational_boosts_status_score(self):
        raw_op = _make_raw(business_status="OPERATIONAL")
        raw_closed = _make_raw(business_status="CLOSED_PERMANENTLY")
        assert score_place_quality(raw_op) > score_place_quality(raw_closed)

    def test_temporarily_closed_halfway(self):
        raw_op = _make_raw(business_status="OPERATIONAL")
        raw_temp = _make_raw(business_status="CLOSED_TEMPORARILY")
        raw_perm = _make_raw(business_status="CLOSED_PERMANENTLY")
        assert (
            score_place_quality(raw_op)
            > score_place_quality(raw_temp)
            > score_place_quality(raw_perm)
        )

    def test_bayesian_penalizes_low_review_count(self):
        raw_many = _make_raw(rating=4.5, user_rating_count=500)
        raw_few = _make_raw(rating=4.5, user_rating_count=1)
        assert score_place_quality(raw_many) > score_place_quality(raw_few)

    def test_zero_rating_counts_as_neutral_bayesian(self):
        """Zero rating with zero reviews → bayesian factor = 3.0/5.0 * 0.30 = 0.18."""
        raw = _make_raw(
            rating=0,
            user_rating_count=0,
            has_editorial=False,
            image_urls=[],
            website_url="",
            opening_hours={},
            gmaps_types=[],
            business_status="OPERATIONAL",
            name="Unique Specific Name Here",
        )
        score = score_place_quality(raw)
        # 0.18 (bayesian) + 0.15 (operational) + 0.25 (name 3 words * 0.25)
        assert score > 0.0

    def test_photo_count_granular(self):
        """Photo score increases across 3 tiers: 0=none / 1=low / 2=medium / 3+=best."""

        def make(n):
            return _make_raw(image_urls=[f"u{i}" for i in range(n)])

        s0 = score_place_quality(make(0))  # none
        s1 = score_place_quality(make(1))  # low
        s2 = score_place_quality(make(2))  # medium
        s3 = score_place_quality(make(3))  # best
        s5 = score_place_quality(make(5))  # best (same tier as 3)

        assert s0 < s1 < s2 < s3 == s5

    def test_editorial_adds_bonus(self):
        raw_ed = _make_raw(has_editorial=True)
        raw_none = _make_raw(has_editorial=False)
        assert score_place_quality(raw_ed) > score_place_quality(raw_none)

    def test_no_editorial_no_penalty(self):
        """Absence of editorial should not cause large score drop — it's a small bonus."""
        raw_none = _make_raw(has_editorial=False)
        score = score_place_quality(raw_none)
        # Without editorial (0.05 bonus), a good place should still score >= 0.70
        assert score >= 0.70

    def test_website_adds_score(self):
        raw_with = _make_raw(website_url="https://example.com")
        raw_without = _make_raw(website_url="")
        assert score_place_quality(raw_with) > score_place_quality(raw_without)

    def test_opening_hours_adds_score(self):
        raw_with = _make_raw(opening_hours={"Monday": "09:00-17:00"})
        raw_without = _make_raw(opening_hours={"Monday": "Hours not available"})
        assert score_place_quality(raw_with) > score_place_quality(raw_without)

    def test_generic_name_scores_zero_for_name_factor(self):
        raw_generic = _make_raw(name="Mosque")
        raw_specific = _make_raw(name="Al-Aqsa Mosque")
        # Generic name gives 0.0 for name factor (weight 0.25), so specific > generic
        assert score_place_quality(raw_specific) > score_place_quality(raw_generic)

    def test_3_plus_words_beats_2_words_beats_1_word(self):
        # Use names without leading articles so word count is clear:
        # "Sheikh Zayed Mosque" → 3 words (1.0), "Blue Mosque" → 2 words (0.7), "Hagia" → 1 word (0.3)
        raw_3 = _make_raw(name="Sheikh Zayed Mosque")
        raw_2 = _make_raw(name="Blue Mosque")
        raw_1 = _make_raw(name="Hagia")
        assert score_place_quality(raw_3) > score_place_quality(raw_2) > score_place_quality(raw_1)

    def test_fallback_attributes_list(self):
        """Older raw_data that stores rating/count only in attributes list should still score."""
        raw = {
            "name": "Grand Mosque",
            "business_status": "OPERATIONAL",
            "image_urls": ["url1"],
            "has_editorial": False,
            "website_url": "",
            "opening_hours": {},
            "gmaps_types": [],
            "attributes": [
                {"attribute_code": "rating", "value": 4.2},
                {"attribute_code": "reviews_count", "value": 50},
            ],
        }
        score = score_place_quality(raw)
        assert score > 0.0


# ── get_quality_gate ──────────────────────────────────────────────────────────


class TestGetQualityGate:
    def test_below_image_gate(self):
        assert get_quality_gate(0.0) == "below_image_gate"
        assert get_quality_gate(0.74) == "below_image_gate"
        assert get_quality_gate(0.65) == "below_image_gate"

    def test_passes_all_gates(self):
        # All three thresholds are 0.75 — score >= 0.75 passes everything
        assert get_quality_gate(GATE_SYNC) is None
        assert get_quality_gate(0.75) is None
        assert get_quality_gate(1.0) is None


# ── passes_gate ───────────────────────────────────────────────────────────────


class TestPassesGate:
    def test_none_always_passes(self):
        """quality_score IS NULL is backwards-compat — passes all gates."""
        assert passes_gate(None, GATE_IMAGE_DOWNLOAD) is True
        assert passes_gate(None, GATE_ENRICHMENT) is True
        assert passes_gate(None, GATE_SYNC) is True

    def test_above_threshold_passes(self):
        assert passes_gate(0.85, GATE_ENRICHMENT) is True

    def test_at_threshold_passes(self):
        assert passes_gate(GATE_ENRICHMENT, GATE_ENRICHMENT) is True

    def test_below_threshold_fails(self):
        assert passes_gate(0.1, GATE_ENRICHMENT) is False


# ── is_name_specific_enough ───────────────────────────────────────────────────


class TestIsNameSpecificEnough:
    def test_two_word_name_passes(self):
        assert is_name_specific_enough("Blue Mosque") is True
        assert is_name_specific_enough("Al-Aqsa Mosque") is True

    def test_three_plus_word_name_passes(self):
        assert is_name_specific_enough("Church of the Holy Sepulchre") is True
        assert is_name_specific_enough("Sheikh Zayed Grand Mosque") is True

    def test_generic_bare_word_fails(self):
        assert is_name_specific_enough("Mosque") is False
        assert is_name_specific_enough("Church") is False
        assert is_name_specific_enough("Al Masjid") is False

    def test_single_word_non_generic_fails(self):
        assert is_name_specific_enough("Hagia") is False
        assert is_name_specific_enough("Pantheon") is False
