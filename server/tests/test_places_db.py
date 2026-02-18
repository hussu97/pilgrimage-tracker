"""
Tests for pure-logic helpers in app.db.places:
_haversine_km, _check_attr_bool, _place_has_*, _generate_place_code, list_places filtering.
"""

from sqlmodel import Session

from app.db.models import Place
from app.db.places import (
    _check_attr_bool,
    _generate_place_code,
    _haversine_km,
    _place_has_events,
    _place_has_jummah,
    _place_has_parking,
    _place_has_womens_area,
    create_place,
    get_place_by_code,
    list_places,
    update_place,
)


def _place(session: Session, code: str, **kwargs) -> Place:
    return create_place(
        place_code=code,
        session=session,
        name=kwargs.get("name", "Test Place"),
        religion=kwargs.get("religion", "islam"),
        place_type=kwargs.get("place_type", "mosque"),
        lat=kwargs.get("lat", 0.0),
        lng=kwargs.get("lng", 0.0),
        address=kwargs.get("address", "Test Address"),
        opening_hours=kwargs.get("opening_hours", None),
        utc_offset_minutes=kwargs.get("utc_offset_minutes", None),
    )


# ── _haversine_km ──────────────────────────────────────────────────────────────


class TestHaversine:
    def test_same_point_is_zero(self):
        assert _haversine_km(0, 0, 0, 0) == 0.0

    def test_known_distance_dubai_to_abu_dhabi(self):
        # Dubai: 25.2048, 55.2708 / Abu Dhabi: 24.4539, 54.3773
        km = _haversine_km(25.2048, 55.2708, 24.4539, 54.3773)
        assert 120 < km < 140  # ~130 km

    def test_antipodal_points(self):
        km = _haversine_km(0, 0, 0, 180)
        assert abs(km - 20015) < 50  # half Earth circumference ≈ 20015 km

    def test_symmetric(self):
        d1 = _haversine_km(48.8566, 2.3522, 51.5074, -0.1278)  # Paris → London
        d2 = _haversine_km(51.5074, -0.1278, 48.8566, 2.3522)  # London → Paris
        assert abs(d1 - d2) < 0.01

    def test_small_distance(self):
        # ~1.11 km per 0.01 degree latitude
        km = _haversine_km(0.0, 0.0, 0.01, 0.0)
        assert 1.0 < km < 1.2


# ── _check_attr_bool ───────────────────────────────────────────────────────────


class TestCheckAttrBool:
    def test_true_bool(self):
        assert _check_attr_bool({"has_parking": True}, "has_parking") is True

    def test_false_bool(self):
        assert _check_attr_bool({"has_parking": False}, "has_parking") is False

    def test_missing_key(self):
        assert _check_attr_bool({}, "has_parking") is False

    def test_string_true_variants(self):
        assert _check_attr_bool({"x": "yes"}, "x") is True
        assert _check_attr_bool({"x": "1"}, "x") is True
        assert _check_attr_bool({"x": "True"}, "x") is True

    def test_string_false_variants(self):
        assert _check_attr_bool({"x": "false"}, "x") is False
        assert _check_attr_bool({"x": "0"}, "x") is False
        assert _check_attr_bool({"x": ""}, "x") is False

    def test_none_value(self):
        assert _check_attr_bool({"x": None}, "x") is False

    def test_nonzero_int(self):
        assert _check_attr_bool({"x": 1}, "x") is True
        assert _check_attr_bool({"x": 0}, "x") is False


# ── _place_has_* helpers ───────────────────────────────────────────────────────


class _FakePlace:
    """Minimal stub with only the attributes the helper functions access."""

    def __init__(self, religion: str = "islam"):
        self.religion = religion


class TestPlaceHasHelpers:
    def test_jummah_requires_islam(self):
        p = _FakePlace("hinduism")
        assert _place_has_jummah(p, {"jummah_times": True}) is False

    def test_jummah_islam_with_attribute(self):
        p = _FakePlace("islam")
        assert _place_has_jummah(p, {"jummah_times": True}) is True

    def test_jummah_islam_missing_attribute(self):
        p = _FakePlace("islam")
        assert _place_has_jummah(p, {}) is False

    def test_has_events_true(self):
        p = _FakePlace()
        assert _place_has_events(p, {"has_events": True}) is True

    def test_has_events_false(self):
        p = _FakePlace()
        assert _place_has_events(p, {"has_events": False}) is False

    def test_has_parking_true(self):
        p = _FakePlace()
        assert _place_has_parking(p, {"has_parking": True}) is True

    def test_has_parking_missing(self):
        p = _FakePlace()
        assert _place_has_parking(p, {}) is False

    def test_has_womens_area(self):
        p = _FakePlace()
        assert _place_has_womens_area(p, {"has_womens_area": True}) is True
        assert _place_has_womens_area(p, {"has_womens_area": False}) is False


# ── _generate_place_code ───────────────────────────────────────────────────────


class TestGeneratePlaceCode:
    def test_has_plc_prefix(self):
        code = _generate_place_code()
        assert code.startswith("plc_")

    def test_length_is_correct(self):
        code = _generate_place_code()
        # "plc_" + 16 hex chars = 20 chars
        assert len(code) == 20

    def test_codes_are_unique(self):
        codes = {_generate_place_code() for _ in range(20)}
        assert len(codes) == 20


# ── create_place / update_place / get_place_by_code ───────────────────────────


class TestPlaceCRUD:
    def test_create_and_retrieve(self, db_session):
        _place(db_session, "plc_crud0001")
        found = get_place_by_code("plc_crud0001", db_session)
        assert found is not None
        assert found.religion == "islam"

    def test_get_nonexistent_returns_none(self, db_session):
        assert get_place_by_code("plc_nothere", db_session) is None

    def test_update_name(self, db_session):
        _place(db_session, "plc_upd00001", name="Old Name")
        update_place("plc_upd00001", db_session, name="New Name")
        found = get_place_by_code("plc_upd00001", db_session)
        assert found.name == "New Name"

    def test_update_nonexistent_returns_none(self, db_session):
        result = update_place("plc_ghost001", db_session, name="X")
        assert result is None

    def test_update_partial_fields(self, db_session):
        _place(db_session, "plc_partial1", name="Keep Me", religion="islam")
        update_place("plc_partial1", db_session, lat=10.0)
        found = get_place_by_code("plc_partial1", db_session)
        assert found.name == "Keep Me"
        assert found.lat == 10.0


# ── list_places filtering ──────────────────────────────────────────────────────


class TestListPlacesFiltering:
    def test_empty_db_returns_empty(self, db_session):
        result = list_places(db_session)
        assert result["rows"] == []

    def test_religion_filter(self, db_session):
        _place(db_session, "plc_lp_isl01", religion="islam")
        _place(db_session, "plc_lp_hin01", religion="hinduism")
        result = list_places(db_session, religions=["islam"])
        codes = [p.place_code for p, _ in result["rows"]]
        assert "plc_lp_isl01" in codes
        assert "plc_lp_hin01" not in codes

    def test_search_by_name(self, db_session):
        _place(db_session, "plc_lp_srch1", name="Grand Masjid Search Test")
        _place(db_session, "plc_lp_srch2", name="Unrelated Place")
        result = list_places(db_session, search="Grand Masjid")
        codes = [p.place_code for p, _ in result["rows"]]
        assert "plc_lp_srch1" in codes
        assert "plc_lp_srch2" not in codes

    def test_radius_filter(self, db_session):
        _place(db_session, "plc_lp_near1", lat=25.2048, lng=55.2708)  # Dubai
        _place(db_session, "plc_lp_far01", lat=51.5074, lng=-0.1278)  # London
        result = list_places(db_session, lat=25.2048, lng=55.2708, radius_km=50)
        codes = [p.place_code for p, _ in result["rows"]]
        assert "plc_lp_near1" in codes
        assert "plc_lp_far01" not in codes

    def test_distance_computed_when_lat_lng_provided(self, db_session):
        _place(db_session, "plc_lp_dist1", lat=25.2048, lng=55.2708)
        result = list_places(db_session, lat=25.2, lng=55.27)
        for _p, dist in result["rows"]:
            assert dist is not None
            assert dist >= 0

    def test_no_distance_without_coordinates(self, db_session):
        _place(db_session, "plc_lp_nodst")
        result = list_places(db_session)
        for _p, dist in result["rows"]:
            assert dist is None

    def test_place_type_filter(self, db_session):
        _place(db_session, "plc_lp_mosk1", place_type="mosque")
        _place(db_session, "plc_lp_tmpl1", religion="hinduism", place_type="temple")
        result = list_places(db_session, place_type="mosque")
        codes = [p.place_code for p, _ in result["rows"]]
        assert "plc_lp_mosk1" in codes
        assert "plc_lp_tmpl1" not in codes

    def test_pagination_limit(self, db_session):
        for i in range(5):
            _place(db_session, f"plc_lp_pg{i:04d}")
        result = list_places(db_session, limit=2)
        assert len(result["rows"]) == 2

    def test_cursor_pagination(self, db_session):
        for i in range(4):
            _place(db_session, f"plc_lp_cur{i:03d}")
        # First page
        r0 = list_places(db_session, limit=2)
        assert len(r0["rows"]) == 2
        assert r0["next_cursor"] is not None
        # Second page using cursor
        cursor = r0["next_cursor"]
        r1 = list_places(db_session, limit=2, cursor=cursor)
        assert len(r1["rows"]) == 2
        # No overlap between pages
        codes_p0 = {p.place_code for p, _ in r0["rows"]}
        codes_p1 = {p.place_code for p, _ in r1["rows"]}
        assert codes_p0.isdisjoint(codes_p1)
        # Last page has no next_cursor
        assert r1["next_cursor"] is None

    def test_filters_meta_returned(self, db_session):
        result = list_places(db_session)
        assert "filters" in result
        assert "options" in result["filters"]
        assert isinstance(result["filters"]["options"], list)

    def test_open_now_filter_excludes_closed(self, db_session):
        # All-closed place
        _place(
            db_session,
            "plc_lp_cls01",
            opening_hours=dict.fromkeys(
                ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
                "Closed",
            ),
        )
        result = list_places(db_session, open_now=True)
        codes = [p.place_code for p, _ in result["rows"]]
        assert "plc_lp_cls01" not in codes

    def test_open_now_filter_includes_always_open(self, db_session):
        _place(
            db_session,
            "plc_lp_24h01",
            opening_hours=dict.fromkeys(
                ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
                "00:00-23:59",
            ),
        )
        result = list_places(db_session, open_now=True)
        codes = [p.place_code for p, _ in result["rows"]]
        assert "plc_lp_24h01" in codes
