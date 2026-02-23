"""
Unit tests for app.services.timezone_utils:
get_local_now, get_today_name, format_utc_offset.

Pure-function tests — no DB or HTTP needed.
"""

from datetime import UTC, datetime

from app.services.timezone_utils import format_utc_offset, get_local_now, get_today_name


class TestGetLocalNow:
    def test_returns_datetime(self):
        result = get_local_now(0)
        assert isinstance(result, datetime)

    def test_utc_plus_4_is_4h_ahead_of_utc(self):
        _utc_now = datetime.now(UTC)
        local = get_local_now(240)  # UTC+4
        diff = local.utcoffset().total_seconds() / 60
        assert diff == 240

    def test_utc_plus_5_30(self):
        local = get_local_now(330)  # UTC+5:30
        assert local.utcoffset().total_seconds() / 60 == 330

    def test_utc_minus_5(self):
        local = get_local_now(-300)  # UTC-5
        assert local.utcoffset().total_seconds() / 60 == -300

    def test_utc_zero(self):
        local = get_local_now(0)
        assert local.utcoffset().total_seconds() == 0

    def test_local_time_is_offset_from_utc(self):
        utc_now = datetime.now(UTC)
        local = get_local_now(60)  # UTC+1
        # Local hour should be UTC hour + 1 (modulo 24, ignoring day rollover edge case)
        delta = local.replace(tzinfo=None) - utc_now.replace(tzinfo=None)
        assert abs(delta.total_seconds() - 3600) < 2  # within 2 seconds


class TestGetTodayName:
    def test_returns_day_name_string(self):
        result = get_today_name(0)
        assert result in (
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
            "Sunday",
        )

    def test_none_offset_uses_utc(self):
        result = get_today_name(None)
        expected = datetime.now(UTC).strftime("%A")
        assert result == expected

    def test_zero_offset_matches_utc(self):
        assert get_today_name(0) == datetime.now(UTC).strftime("%A")


class TestFormatUtcOffset:
    def test_whole_hour_positive(self):
        assert format_utc_offset(240) == "UTC+4"

    def test_whole_hour_negative(self):
        assert format_utc_offset(-300) == "UTC-5"

    def test_half_hour_offset(self):
        assert format_utc_offset(330) == "UTC+5:30"

    def test_45_min_offset(self):
        assert format_utc_offset(345) == "UTC+5:45"

    def test_zero(self):
        assert format_utc_offset(0) == "UTC+0"

    def test_negative_half_hour(self):
        assert format_utc_offset(-330) == "UTC-5:30"

    def test_large_positive(self):
        assert format_utc_offset(720) == "UTC+12"

    def test_large_negative(self):
        assert format_utc_offset(-720) == "UTC-12"
