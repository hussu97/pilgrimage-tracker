"""
Tests for app.db.place_attributes:
upsert_attribute, get_attributes_dict, bulk_get_attributes_for_places, get_attribute_definitions.
"""
import pytest
from sqlmodel import Session

from app.db import place_attributes as attr_db
from app.db.models import Place, PlaceAttributeDefinition


def _make_place(session: Session, code: str, name: str = "Test Place") -> Place:
    place = Place(
        place_code=code,
        name=name,
        religion="islam",
        place_type="mosque",
        lat=0.0,
        lng=0.0,
        address="Test Address",
    )
    session.add(place)
    session.commit()
    return place


def _make_attr_def(session: Session, code: str, **kwargs) -> PlaceAttributeDefinition:
    defn = PlaceAttributeDefinition(
        attribute_code=code,
        name=kwargs.get("name", code),
        data_type=kwargs.get("data_type", "boolean"),
        display_order=kwargs.get("display_order", 0),
        is_filterable=kwargs.get("is_filterable", False),
        is_specification=kwargs.get("is_specification", False),
        religion=kwargs.get("religion", None),
        icon=kwargs.get("icon", None),
    )
    session.add(defn)
    session.commit()
    return defn


# ── upsert_attribute ───────────────────────────────────────────────────────────

class TestUpsertAttribute:
    def test_insert_text_attribute(self, db_session):
        _make_place(db_session, "plc_attr0001")
        attr_db.upsert_attribute("plc_attr0001", "capacity", "500", db_session)
        d = attr_db.get_attributes_dict("plc_attr0001", db_session)
        assert d["capacity"] == "500"

    def test_insert_bool_attribute(self, db_session):
        _make_place(db_session, "plc_attr0002")
        attr_db.upsert_attribute("plc_attr0002", "has_parking", True, db_session)
        d = attr_db.get_attributes_dict("plc_attr0002", db_session)
        assert d["has_parking"] == "True"   # booleans stored as text

    def test_insert_json_attribute(self, db_session):
        _make_place(db_session, "plc_attr0003")
        attr_db.upsert_attribute("plc_attr0003", "prayer_times", {"fajr": "05:00"}, db_session)
        d = attr_db.get_attributes_dict("plc_attr0003", db_session)
        assert d["prayer_times"] == {"fajr": "05:00"}

    def test_insert_list_attribute(self, db_session):
        _make_place(db_session, "plc_attr0004")
        attr_db.upsert_attribute("plc_attr0004", "deities", ["Shiva", "Vishnu"], db_session)
        d = attr_db.get_attributes_dict("plc_attr0004", db_session)
        assert d["deities"] == ["Shiva", "Vishnu"]

    def test_upsert_updates_existing(self, db_session):
        _make_place(db_session, "plc_attr0005")
        attr_db.upsert_attribute("plc_attr0005", "capacity", "100", db_session)
        attr_db.upsert_attribute("plc_attr0005", "capacity", "200", db_session)
        d = attr_db.get_attributes_dict("plc_attr0005", db_session)
        assert d["capacity"] == "200"

    def test_multiple_attributes_for_same_place(self, db_session):
        _make_place(db_session, "plc_attr0006")
        attr_db.upsert_attribute("plc_attr0006", "has_parking", True, db_session)
        attr_db.upsert_attribute("plc_attr0006", "has_womens_area", False, db_session)
        d = attr_db.get_attributes_dict("plc_attr0006", db_session)
        assert "has_parking" in d
        assert "has_womens_area" in d

    def test_no_attributes_returns_empty_dict(self, db_session):
        _make_place(db_session, "plc_attr0007")
        d = attr_db.get_attributes_dict("plc_attr0007", db_session)
        assert d == {}


# ── bulk_get_attributes_for_places ────────────────────────────────────────────

class TestBulkGetAttributes:
    def test_bulk_fetch_multiple_places(self, db_session):
        _make_place(db_session, "plc_blk0001")
        _make_place(db_session, "plc_blk0002")
        attr_db.upsert_attribute("plc_blk0001", "capacity", "100", db_session)
        attr_db.upsert_attribute("plc_blk0002", "capacity", "200", db_session)

        result = attr_db.bulk_get_attributes_for_places(
            ["plc_blk0001", "plc_blk0002"], db_session
        )
        assert result["plc_blk0001"]["capacity"] == "100"
        assert result["plc_blk0002"]["capacity"] == "200"

    def test_empty_list_returns_empty_dict(self, db_session):
        result = attr_db.bulk_get_attributes_for_places([], db_session)
        assert result == {}

    def test_place_with_no_attrs_not_in_result(self, db_session):
        _make_place(db_session, "plc_blk0003")
        result = attr_db.bulk_get_attributes_for_places(["plc_blk0003"], db_session)
        # Place with no attributes won't appear in result
        assert result.get("plc_blk0003") is None


# ── get_attribute_definitions ─────────────────────────────────────────────────

class TestGetAttributeDefinitions:
    def test_returns_empty_when_no_definitions(self, db_session):
        defs = attr_db.get_attribute_definitions(session=db_session)
        assert isinstance(defs, list)

    def test_filterable_only_flag(self, db_session):
        _make_attr_def(db_session, "filterable_attr", is_filterable=True)
        _make_attr_def(db_session, "nonfilterable_attr", is_filterable=False)

        defs = attr_db.get_attribute_definitions(filterable_only=True, session=db_session)
        codes = [d.attribute_code for d in defs]
        assert "filterable_attr" in codes
        assert "nonfilterable_attr" not in codes

    def test_spec_only_flag(self, db_session):
        _make_attr_def(db_session, "spec_attr", is_specification=True)
        _make_attr_def(db_session, "nonspec_attr", is_specification=False)

        defs = attr_db.get_attribute_definitions(spec_only=True, session=db_session)
        codes = [d.attribute_code for d in defs]
        assert "spec_attr" in codes
        assert "nonspec_attr" not in codes

    def test_religion_filter(self, db_session):
        _make_attr_def(db_session, "islam_attr", religion="islam")
        _make_attr_def(db_session, "any_religion_attr", religion=None)

        defs = attr_db.get_attribute_definitions(religion="islam", session=db_session)
        codes = [d.attribute_code for d in defs]
        assert "islam_attr" in codes
        assert "any_religion_attr" in codes  # religion=None means applicable to all

    def test_religion_filter_excludes_other_religions(self, db_session):
        _make_attr_def(db_session, "hinduism_attr", religion="hinduism")

        defs = attr_db.get_attribute_definitions(religion="islam", session=db_session)
        codes = [d.attribute_code for d in defs]
        assert "hinduism_attr" not in codes

    def test_sorted_by_display_order(self, db_session):
        _make_attr_def(db_session, "third_attr", display_order=3)
        _make_attr_def(db_session, "first_attr", display_order=1)
        _make_attr_def(db_session, "second_attr", display_order=2)

        defs = attr_db.get_attribute_definitions(session=db_session)
        orders = [d.display_order for d in defs]
        assert orders == sorted(orders)
