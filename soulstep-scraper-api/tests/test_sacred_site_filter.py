"""Unit tests for is_sacred_site() in app/pipeline/place_quality.py (B4)."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.pipeline.place_quality import VALID_SACRED_GMAPS_TYPES, is_sacred_site


class TestIsSacredSite:
    # ── passes: sacred types ──────────────────────────────────────────────────

    def test_mosque_via_primary_type(self):
        assert is_sacred_site({"primaryType": "mosque"}) is True

    def test_church_via_primary_type(self):
        assert is_sacred_site({"primaryType": "church"}) is True

    def test_hindu_temple_via_primary_type(self):
        assert is_sacred_site({"primaryType": "hindu_temple"}) is True

    def test_synagogue_via_primary_type(self):
        assert is_sacred_site({"primaryType": "synagogue"}) is True

    def test_buddhist_temple_via_primary_type(self):
        assert is_sacred_site({"primaryType": "buddhist_temple"}) is True

    def test_place_of_worship_via_primary_type(self):
        assert is_sacred_site({"primaryType": "place_of_worship"}) is True

    def test_sacred_type_in_types_list(self):
        """Falls back to ``types`` list when primaryType is absent."""
        assert is_sacred_site({"types": ["mosque", "point_of_interest"]}) is True

    def test_sacred_type_in_types_list_with_non_sacred_primary(self):
        """Sacred type in ``types`` overrides non-sacred primaryType."""
        assert is_sacred_site({"primaryType": "restaurant", "types": ["shrine"]}) is True

    def test_case_insensitive_primary_type(self):
        assert is_sacred_site({"primaryType": "Mosque"}) is True

    def test_case_insensitive_types_list(self):
        assert is_sacred_site({"types": ["Hindu_Temple"]}) is True

    # ── fails: non-sacred types ───────────────────────────────────────────────

    def test_restaurant_returns_false(self):
        assert (
            is_sacred_site({"primaryType": "restaurant", "types": ["restaurant", "food"]}) is False
        )

    def test_hotel_returns_false(self):
        assert is_sacred_site({"primaryType": "lodging", "types": ["lodging", "hotel"]}) is False

    def test_shopping_mall_returns_false(self):
        assert is_sacred_site({"primaryType": "shopping_mall"}) is False

    def test_empty_types_no_primary_type(self):
        assert is_sacred_site({"types": [], "name": "Coffee Shop"}) is False

    # ── backwards-compat: empty/None raw_data ────────────────────────────────

    def test_empty_dict_passes(self):
        """No raw_data → pass filter (backwards-compat for legacy places)."""
        assert is_sacred_site({}) is True

    def test_none_passes(self):
        assert is_sacred_site(None) is True  # type: ignore[arg-type]


class TestValidSacredGmapsTypes:
    def test_frozenset_not_empty(self):
        assert len(VALID_SACRED_GMAPS_TYPES) > 0

    def test_core_types_present(self):
        assert "mosque" in VALID_SACRED_GMAPS_TYPES
        assert "church" in VALID_SACRED_GMAPS_TYPES
        assert "hindu_temple" in VALID_SACRED_GMAPS_TYPES
        assert "synagogue" in VALID_SACRED_GMAPS_TYPES
        assert "buddhist_temple" in VALID_SACRED_GMAPS_TYPES

    def test_all_lowercase(self):
        for t in VALID_SACRED_GMAPS_TYPES:
            assert t == t.lower(), f"Type '{t}' is not lowercase"
