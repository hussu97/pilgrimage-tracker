"""
Unit tests for app/services/place_specifications.py.

Patches attr_db.get_attribute_definitions so no DB is hit.
"""

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.services.place_specifications import build_specifications


def _make_place(religion="islam", place_code="plc_test001"):
    return SimpleNamespace(religion=religion, place_code=place_code)


def _make_defn(attribute_code, icon="info", label_key=None, name="Label"):
    d = MagicMock()
    d.attribute_code = attribute_code
    d.icon = icon
    d.label_key = label_key
    d.name = name
    return d


def _mock_session():
    return MagicMock()


# ── TestBuildSpecifications ────────────────────────────────────────────────────


class TestBuildSpecifications:
    def test_bool_true_shows_available(self):
        place = _make_place()
        defn = _make_defn("wheelchair_accessible", icon="accessible", label_key="spec.wheelchair")
        attrs = {"wheelchair_accessible": True}

        with patch(
            "app.services.place_specifications.attr_db.get_attribute_definitions"
        ) as mock_defs:
            mock_defs.return_value = [defn]
            result = build_specifications(place, _mock_session(), attrs=attrs)

        assert len(result) == 1
        assert result[0]["value"] == "Available"
        assert result[0]["label"] == "spec.wheelchair"
        assert result[0]["icon"] == "accessible"

    def test_bool_false_is_omitted(self):
        place = _make_place()
        defn = _make_defn("wheelchair_accessible")
        attrs = {"wheelchair_accessible": False}

        with patch(
            "app.services.place_specifications.attr_db.get_attribute_definitions"
        ) as mock_defs:
            mock_defs.return_value = [defn]
            result = build_specifications(place, _mock_session(), attrs=attrs)

        assert result == []

    def test_string_value_shown(self):
        place = _make_place()
        defn = _make_defn("capacity", icon="group", label_key="spec.capacity")
        attrs = {"capacity": "500"}

        with patch(
            "app.services.place_specifications.attr_db.get_attribute_definitions"
        ) as mock_defs:
            mock_defs.return_value = [defn]
            result = build_specifications(place, _mock_session(), attrs=attrs)

        assert len(result) == 1
        assert result[0]["value"] == "500"

    def test_has_womens_area_true_shows_separate(self):
        place = _make_place()
        defn = _make_defn("has_womens_area", icon="wc", label_key="spec.womens_area")
        attrs = {"has_womens_area": True}

        with patch(
            "app.services.place_specifications.attr_db.get_attribute_definitions"
        ) as mock_defs:
            mock_defs.return_value = [defn]
            result = build_specifications(place, _mock_session(), attrs=attrs)

        assert result[0]["value"] == "Separate"

    def test_empty_attrs_returns_empty(self):
        place = _make_place()
        defn = _make_defn("wheelchair_accessible")

        with patch(
            "app.services.place_specifications.attr_db.get_attribute_definitions"
        ) as mock_defs:
            mock_defs.return_value = [defn]
            result = build_specifications(place, _mock_session(), attrs={})

        assert result == []

    def test_no_place_code_returns_empty(self):
        place = SimpleNamespace(religion="islam", place_code=None)
        result = build_specifications(place, _mock_session(), attrs={"some_attr": True})
        assert result == []

    def test_multiple_specs_all_included(self):
        place = _make_place()
        defn1 = _make_defn("parking", label_key="spec.parking")
        defn2 = _make_defn("ac", label_key="spec.ac")
        attrs = {"parking": True, "ac": True}

        with patch(
            "app.services.place_specifications.attr_db.get_attribute_definitions"
        ) as mock_defs:
            mock_defs.return_value = [defn1, defn2]
            result = build_specifications(place, _mock_session(), attrs=attrs)

        assert len(result) == 2

    def test_missing_attr_value_skipped(self):
        place = _make_place()
        defn = _make_defn("parking")
        # attr not present in attrs dict
        attrs = {}

        with patch(
            "app.services.place_specifications.attr_db.get_attribute_definitions"
        ) as mock_defs:
            mock_defs.return_value = [defn]
            result = build_specifications(place, _mock_session(), attrs=attrs)

        assert result == []

    def test_uses_name_as_fallback_label(self):
        place = _make_place()
        defn = _make_defn("parking", label_key=None, name="Parking Available")
        attrs = {"parking": True}

        with patch(
            "app.services.place_specifications.attr_db.get_attribute_definitions"
        ) as mock_defs:
            mock_defs.return_value = [defn]
            result = build_specifications(place, _mock_session(), attrs=attrs)

        assert result[0]["label"] == "Parking Available"
