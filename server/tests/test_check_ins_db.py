"""
Tests for app.db.check_ins — DB-layer functions not covered via the HTTP tests:
count_places_visited, count_check_ins_this_year, count_check_ins_for_place,
count_check_ins_bulk, get_check_ins_this_month, get_check_ins_on_this_day.
"""
from app.db import check_ins as check_ins_db
from app.db.models import Place


def _make_place(session, code: str):
    place = Place(
        place_code=code, name="Test", religion="islam",
        place_type="mosque", lat=0.0, lng=0.0, address="Addr"
    )
    session.add(place)
    session.commit()


def _check_in(session, user_code: str, place_code: str, note: str = None):
    return check_ins_db.create_check_in(user_code, place_code, session, note=note)


# ── count_places_visited ───────────────────────────────────────────────────────

class TestCountPlacesVisited:
    def test_zero_when_no_check_ins(self, db_session):
        assert check_ins_db.count_places_visited("usr_x", db_session) == 0

    def test_counts_distinct_places(self, db_session):
        _make_place(db_session, "plc_cv0001")
        _make_place(db_session, "plc_cv0002")
        _check_in(db_session, "usr_cv001", "plc_cv0001")
        _check_in(db_session, "usr_cv001", "plc_cv0001")  # duplicate place
        _check_in(db_session, "usr_cv001", "plc_cv0002")
        assert check_ins_db.count_places_visited("usr_cv001", db_session) == 2

    def test_does_not_count_other_users(self, db_session):
        _make_place(db_session, "plc_cv0003")
        _check_in(db_session, "usr_other", "plc_cv0003")
        assert check_ins_db.count_places_visited("usr_cv001", db_session) == 0


# ── count_check_ins_this_year ─────────────────────────────────────────────────

class TestCountCheckInsThisYear:
    def test_counts_current_year(self, db_session):
        _make_place(db_session, "plc_yr0001")
        _check_in(db_session, "usr_yr001", "plc_yr0001")
        _check_in(db_session, "usr_yr001", "plc_yr0001")
        count = check_ins_db.count_check_ins_this_year("usr_yr001", db_session)
        assert count == 2

    def test_zero_for_user_with_no_check_ins(self, db_session):
        assert check_ins_db.count_check_ins_this_year("usr_nobody", db_session) == 0


# ── count_check_ins_for_place ─────────────────────────────────────────────────

class TestCountCheckInsForPlace:
    def test_count_for_specific_place(self, db_session):
        _make_place(db_session, "plc_cf0001")
        _check_in(db_session, "usr_a", "plc_cf0001")
        _check_in(db_session, "usr_b", "plc_cf0001")
        assert check_ins_db.count_check_ins_for_place("plc_cf0001", db_session) == 2

    def test_zero_for_place_with_no_check_ins(self, db_session):
        _make_place(db_session, "plc_cf0002")
        assert check_ins_db.count_check_ins_for_place("plc_cf0002", db_session) == 0


# ── count_check_ins_bulk ───────────────────────────────────────────────────────

class TestCountCheckInsBulk:
    def test_empty_list(self, db_session):
        assert check_ins_db.count_check_ins_bulk([], db_session) == {}

    def test_bulk_count(self, db_session):
        _make_place(db_session, "plc_bk0001")
        _make_place(db_session, "plc_bk0002")
        _check_in(db_session, "usr_bk", "plc_bk0001")
        _check_in(db_session, "usr_bk", "plc_bk0001")
        _check_in(db_session, "usr_bk", "plc_bk0002")
        result = check_ins_db.count_check_ins_bulk(["plc_bk0001", "plc_bk0002"], db_session)
        assert result["plc_bk0001"] == 2
        assert result["plc_bk0002"] == 1

    def test_unvisited_place_not_in_result(self, db_session):
        _make_place(db_session, "plc_bk0003")
        result = check_ins_db.count_check_ins_bulk(["plc_bk0003"], db_session)
        assert result.get("plc_bk0003") is None


# ── get_check_ins_by_user / has_checked_in ────────────────────────────────────

class TestCheckInQueries:
    def test_get_check_ins_by_user(self, db_session):
        _make_place(db_session, "plc_q00001")
        _check_in(db_session, "usr_q001", "plc_q00001")
        _check_in(db_session, "usr_q001", "plc_q00001")
        rows = check_ins_db.get_check_ins_by_user("usr_q001", db_session)
        assert len(rows) == 2

    def test_get_check_ins_returns_only_this_users(self, db_session):
        _make_place(db_session, "plc_q00002")
        _check_in(db_session, "usr_q002", "plc_q00002")
        _check_in(db_session, "usr_other2", "plc_q00002")
        rows = check_ins_db.get_check_ins_by_user("usr_q002", db_session)
        assert all(r.user_code == "usr_q002" for r in rows)

    def test_has_checked_in_true(self, db_session):
        _make_place(db_session, "plc_q00003")
        _check_in(db_session, "usr_q003", "plc_q00003")
        assert check_ins_db.has_checked_in("usr_q003", "plc_q00003", db_session) is True

    def test_has_checked_in_false(self, db_session):
        _make_place(db_session, "plc_q00004")
        assert check_ins_db.has_checked_in("usr_q004", "plc_q00004", db_session) is False

    def test_get_check_ins_this_month_returns_list(self, db_session):
        _make_place(db_session, "plc_q00005")
        _check_in(db_session, "usr_q005", "plc_q00005")
        rows = check_ins_db.get_check_ins_this_month("usr_q005", db_session)
        # Check-in was just created so it should appear in this month
        assert len(rows) >= 1

    def test_get_check_ins_on_this_day_returns_list(self, db_session):
        # Check-ins created today won't appear (on-this-day excludes current year)
        _make_place(db_session, "plc_q00006")
        _check_in(db_session, "usr_q006", "plc_q00006")
        rows = check_ins_db.get_check_ins_on_this_day("usr_q006", db_session)
        # Just verify the function returns a list without error
        assert isinstance(rows, list)
