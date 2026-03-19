"""
Additional tests for data_scraper/app/scrapers/gmaps.py:
calculate_search_radius, detect_religion_from_types (with mocked session),
get_default_place_type (mocked), and MIN_RADIUS / deduplication logic.
"""

import os
import sys
from unittest.mock import MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.scrapers.gmaps import (
    MIN_RADIUS,
    calculate_search_radius,
    detect_religion_from_types,
    get_default_place_type,
    get_gmaps_type_to_our_type,
)

# ── calculate_search_radius ────────────────────────────────────────────────────


class TestCalculateSearchRadius:
    def test_center_is_midpoint(self):
        lat_center, lng_center, _ = calculate_search_radius(0, 2, 0, 2)
        assert lat_center == 1.0
        assert lng_center == 1.0

    def test_positive_radius(self):
        _, _, radius = calculate_search_radius(0, 1, 0, 1)
        assert radius > 0

    def test_square_box_radius(self):
        # 1 degree × 1 degree box near equator
        # lat_diff ≈ 111000m, lng_diff ≈ 111000m, diagonal ≈ 157000m, radius ≈ 78500m
        _, _, radius = calculate_search_radius(0, 1, 0, 1)
        assert 70_000 < radius < 90_000

    def test_small_box_radius(self):
        # 0.1 degree × 0.1 degree near equator
        _, _, radius = calculate_search_radius(0, 0.1, 0, 0.1)
        assert radius < 10_000  # should be ~7850m

    def test_symmetric_box(self):
        c1, c2, r1 = calculate_search_radius(0, 1, 0, 1)
        c3, c4, r2 = calculate_search_radius(10, 11, 20, 21)
        # Radii should be similar for same-size boxes (slightly different because of cos(lat))
        assert abs(r1 - r2) < 5_000

    def test_lng_diff_shrinks_at_high_latitude(self):
        # At lat=60°, cos(60°)=0.5, so lng contribution is halved
        _, _, r_equator = calculate_search_radius(0, 0.1, 0, 1)
        _, _, r_60 = calculate_search_radius(60, 60.1, 0, 1)
        assert r_60 < r_equator

    def test_returns_tuple_of_three(self):
        result = calculate_search_radius(10, 20, 30, 40)
        assert len(result) == 3

    def test_zero_area_returns_zero_radius(self):
        _, _, radius = calculate_search_radius(10, 10, 20, 20)
        assert radius == 0.0


# ── detect_religion_from_types (mocked session) ───────────────────────────────


class TestDetectReligionFromTypes:
    def _make_mapping(self, gmaps_type: str, religion: str):
        m = MagicMock()
        m.gmaps_type = gmaps_type
        m.religion = religion
        m.our_place_type = gmaps_type
        m.is_active = True
        return m

    def _make_session(self, mappings: list | None = None):
        session = MagicMock()
        exec_result = MagicMock()
        exec_result.all.return_value = mappings or []
        session.exec.return_value = exec_result
        return session

    def test_detects_islam_from_mosque(self):
        mapping = self._make_mapping("mosque", "islam")
        session = self._make_session([mapping])
        result = detect_religion_from_types(session, ["mosque"])
        assert result == "islam"

    def test_detects_hinduism_from_hindu_temple(self):
        mapping = self._make_mapping("hindu_temple", "hinduism")
        session = self._make_session([mapping])
        result = detect_religion_from_types(session, ["hindu_temple"])
        assert result == "hinduism"

    def test_returns_none_for_unknown_type(self):
        session = self._make_session([])  # No mapping found
        result = detect_religion_from_types(session, ["unknown_type"])
        assert result is None

    def test_returns_none_for_empty_list(self):
        session = self._make_session([])
        result = detect_religion_from_types(session, [])
        assert result is None

    def test_uses_first_matching_type(self):
        # First type should match
        islam_mapping = self._make_mapping("mosque", "islam")
        hindu_mapping = self._make_mapping("hindu_temple", "hinduism")
        session = self._make_session([islam_mapping, hindu_mapping])
        result = detect_religion_from_types(session, ["mosque", "hindu_temple"])
        assert result == "islam"


# ── get_default_place_type (mocked session) ───────────────────────────────────


class TestGetDefaultPlaceType:
    def _make_session(self, our_type: str = None, religion: str = "islam"):
        session = MagicMock()
        exec_result = MagicMock()
        if our_type:
            mapping = MagicMock()
            mapping.our_place_type = our_type
            mapping.gmaps_type = our_type
            mapping.religion = religion
            exec_result.all.return_value = [mapping]
        else:
            exec_result.all.return_value = []
        session.exec.return_value = exec_result
        return session

    def test_returns_type_from_mapping(self):
        session = self._make_session("mosque", religion="islam")
        result = get_default_place_type(session, "islam")
        assert result == "mosque"

    def test_fallback_when_no_mapping(self):
        session = self._make_session(None)
        result = get_default_place_type(session, "unknown_religion")
        assert result == "place of worship"


# ── get_gmaps_type_to_our_type (mocked session) ───────────────────────────────


class TestGetGmapsTypeToOurType:
    def test_builds_mapping_dict(self):
        m1 = MagicMock()
        m1.gmaps_type = "mosque"
        m1.our_place_type = "mosque"
        m2 = MagicMock()
        m2.gmaps_type = "hindu_temple"
        m2.our_place_type = "temple"

        session = MagicMock()
        session.exec.return_value.all.return_value = [m1, m2]

        result = get_gmaps_type_to_our_type(session)
        assert result == {"mosque": "mosque", "hindu_temple": "temple"}

    def test_empty_when_no_mappings(self):
        session = MagicMock()
        session.exec.return_value.all.return_value = []
        result = get_gmaps_type_to_our_type(session)
        assert result == {}


# ── MIN_RADIUS constant ────────────────────────────────────────────────────────


class TestMinRadius:
    def test_min_radius_is_500_meters(self):
        assert MIN_RADIUS == 500

    def test_search_radius_above_min_is_searchable(self):
        # A 0.1° × 0.1° box near equator has radius ~7850m > MIN_RADIUS
        _, _, radius = calculate_search_radius(0, 0.1, 0, 0.1)
        assert radius >= MIN_RADIUS

    def test_search_radius_tiny_box_below_min(self):
        # A 0.004° × 0.004° box has radius ~314m < MIN_RADIUS (500m)
        _, _, radius = calculate_search_radius(0, 0.004, 0, 0.004)
        assert radius < MIN_RADIUS
