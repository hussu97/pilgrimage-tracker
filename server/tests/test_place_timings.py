"""
Unit tests for app/services/place_timings.py.

Uses SimpleNamespace mock places and passes attrs directly so no DB is hit.
"""

from types import SimpleNamespace
from unittest.mock import MagicMock

from app.services.place_timings import build_timings


def _make_place(religion="islam", utc_offset_minutes=0, place_code="plc_test"):
    return SimpleNamespace(
        religion=religion,
        utc_offset_minutes=utc_offset_minutes,
        place_code=place_code,
    )


def _mock_session():
    return MagicMock()


# ── TestBuildTimingsIslam ──────────────────────────────────────────────────────


class TestBuildTimingsIslam:
    def test_returns_five_prayers(self):
        place = _make_place("islam")
        attrs = {
            "prayer_times": {
                "fajr": "05:00",
                "dhuhr": "12:00",
                "asr": "15:30",
                "maghrib": "18:00",
                "isha": "20:00",
            }
        }
        result = build_timings(place, _mock_session(), attrs=attrs)
        assert len(result) == 5
        names = [r["name"] for r in result]
        assert "fajr" in names
        assert "isha" in names

    def test_all_entries_have_type_prayer(self):
        place = _make_place("islam")
        attrs = {
            "prayer_times": {
                "fajr": "05:00",
                "dhuhr": "12:00",
                "asr": "15:30",
                "maghrib": "18:00",
                "isha": "20:00",
            }
        }
        result = build_timings(place, _mock_session(), attrs=attrs)
        assert all(r["type"] == "prayer" for r in result)

    def test_status_fields_present(self):
        place = _make_place("islam")
        attrs = {
            "prayer_times": {
                "fajr": "05:00",
                "dhuhr": "12:00",
                "asr": "15:30",
                "maghrib": "18:00",
                "isha": "20:00",
            }
        }
        result = build_timings(place, _mock_session(), attrs=attrs)
        for r in result:
            assert r["status"] in ("past", "current", "upcoming")
            assert isinstance(r["is_current"], bool)

    def test_exactly_one_current_prayer(self):
        place = _make_place("islam")
        attrs = {
            "prayer_times": {
                "fajr": "05:00",
                "dhuhr": "12:00",
                "asr": "15:30",
                "maghrib": "18:00",
                "isha": "20:00",
            }
        }
        result = build_timings(place, _mock_session(), attrs=attrs)
        current = [r for r in result if r["is_current"]]
        assert len(current) == 1

    def test_empty_prayer_times_returns_empty(self):
        place = _make_place("islam")
        attrs = {"prayer_times": {}}
        result = build_timings(place, _mock_session(), attrs=attrs)
        assert result == []

    def test_capitalized_keys_also_accepted(self):
        place = _make_place("islam")
        attrs = {
            "prayer_times": {
                "Fajr": "05:00",
                "Dhuhr": "12:00",
                "Asr": "15:30",
                "Maghrib": "18:00",
                "Isha": "20:00",
            }
        }
        result = build_timings(place, _mock_session(), attrs=attrs)
        assert len(result) == 5


# ── TestBuildTimingsChristianity ───────────────────────────────────────────────


class TestBuildTimingsChristianity:
    def test_returns_service_entries_from_list(self):
        place = _make_place("christianity")
        attrs = {
            "service_times": [
                {"day": "Sunday", "time": "09:00", "name": "Morning Service"},
                {"day": "Sunday", "time": "18:00", "name": "Evening Service"},
            ]
        }
        result = build_timings(place, _mock_session(), attrs=attrs)
        assert len(result) == 2
        assert all(r["type"] == "service" for r in result)

    def test_dict_format_service_times_fallback(self):
        place = _make_place("christianity")
        attrs = {
            "service_times": {
                "Sunday": "09:00",
                "Wednesday": "19:00",
            }
        }
        result = build_timings(place, _mock_session(), attrs=attrs)
        assert len(result) == 2
        assert all(r["type"] == "service" for r in result)
        assert all(r["status"] == "upcoming" for r in result)

    def test_status_fields_present(self):
        place = _make_place("christianity")
        attrs = {
            "service_times": [
                {"day": "Monday", "time": "09:00", "name": "Service"},
            ]
        }
        result = build_timings(place, _mock_session(), attrs=attrs)
        for r in result:
            assert r["status"] in ("past", "current", "upcoming")

    def test_no_service_times_returns_empty(self):
        place = _make_place("christianity")
        attrs = {}
        result = build_timings(place, _mock_session(), attrs=attrs)
        assert result == []


# ── TestBuildTimingsHinduism ───────────────────────────────────────────────────


class TestBuildTimingsHinduism:
    def test_returns_deity_circles(self):
        place = _make_place("hinduism")
        attrs = {
            "deities": [
                {"name": "Ganesha", "subtitle": "God of beginnings", "image_url": ""},
                {"name": "Lakshmi", "subtitle": "Goddess of wealth", "image_url": ""},
            ]
        }
        result = build_timings(place, _mock_session(), attrs=attrs)
        assert len(result) == 2
        assert all(r["type"] == "deity" for r in result)
        names = [r["name"] for r in result]
        assert "Ganesha" in names
        assert "Lakshmi" in names

    def test_empty_deities_list(self):
        place = _make_place("hinduism")
        attrs = {"deities": []}
        result = build_timings(place, _mock_session(), attrs=attrs)
        assert result == []

    def test_deity_status_always_upcoming(self):
        place = _make_place("hinduism")
        attrs = {
            "deities": [
                {"name": "Shiva", "subtitle": "", "image_url": ""},
            ]
        }
        result = build_timings(place, _mock_session(), attrs=attrs)
        assert result[0]["status"] == "upcoming"
        assert result[0]["is_current"] is False


# ── TestBuildTimingsEmpty ──────────────────────────────────────────────────────


class TestBuildTimingsEmpty:
    def test_no_attrs_returns_empty(self):
        place = _make_place("islam")
        result = build_timings(place, _mock_session(), attrs={})
        assert result == []

    def test_unknown_religion_returns_empty(self):
        place = _make_place("sikhism")
        result = build_timings(place, _mock_session(), attrs={})
        assert result == []


# ── TestBuildTimingsNoUtcOffset ────────────────────────────────────────────────


class TestBuildTimingsNoUtcOffset:
    """Tests the fallback path when utc_offset_minutes is absent."""

    def test_islam_without_utc_offset_still_returns_prayers(self):
        # No utc_offset_minutes attribute → uses datetime.now(UTC) fallback
        place = SimpleNamespace(religion="islam", place_code="plc_notz")
        attrs = {
            "prayer_times": {
                "fajr": "05:00",
                "dhuhr": "12:00",
                "asr": "15:30",
                "maghrib": "18:00",
                "isha": "20:00",
            }
        }
        result = build_timings(place, _mock_session(), attrs=attrs)
        assert len(result) == 5
        assert all(r["type"] == "prayer" for r in result)

    def test_christianity_without_utc_offset_still_returns_services(self):
        from datetime import datetime

        today = datetime.now().strftime("%A")
        place = SimpleNamespace(religion="christianity", place_code="plc_notz2")
        attrs = {
            "service_times": [
                {"day": today, "time": "09:00", "name": "Morning Service"},
            ]
        }
        result = build_timings(place, _mock_session(), attrs=attrs)
        assert len(result) == 1
        assert result[0]["type"] == "service"


# ── TestBuildTimingsChristianityDynamicDay ─────────────────────────────────────


class TestBuildTimingsChristianityDynamicDay:
    """Tests Christianity service matching with real current day."""

    def test_all_seven_days_covered_some_will_match_today(self):
        """Include all 7 days so at least one matches today — exercises matching branch."""
        place = _make_place("christianity")
        all_days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        service_times = [{"day": d, "time": "09:00", "name": f"{d} Service"} for d in all_days]
        attrs = {"service_times": service_times}
        result = build_timings(place, _mock_session(), attrs=attrs)
        assert len(result) == 7
        assert all(r["type"] == "service" for r in result)

    def test_today_services_have_valid_statuses(self):
        """Services for today should have valid status values."""
        from datetime import datetime

        today = datetime.now().strftime("%A")
        place = _make_place("christianity", utc_offset_minutes=0)
        attrs = {
            "service_times": [
                {"day": today, "time": "00:01", "name": "Early Service"},
                {"day": today, "time": "23:59", "name": "Late Service"},
            ]
        }
        result = build_timings(place, _mock_session(), attrs=attrs)
        assert len(result) == 2
        valid_statuses = {"past", "current", "upcoming"}
        for r in result:
            assert r["status"] in valid_statuses
        # Exactly one may be "current" (or none if all are past/upcoming)
        current_count = sum(1 for r in result if r["is_current"])
        assert current_count <= 1
