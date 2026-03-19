"""
Unit tests for opening-hours parsing logic in app.db.places.

These tests exercise the pure Python helpers directly — no HTTP / DB needed.
"""

from datetime import UTC

from app.db.places import _is_open_now_from_hours, _parse_slot, _parse_time, _parse_time_12h

# ── _parse_time (24h) ──────────────────────────────────────────────────────────


class TestParseTime24h:
    def test_valid_24h(self):
        assert _parse_time("09:00") == (9, 0)
        assert _parse_time("23:59") == (23, 59)
        assert _parse_time("00:00") == (0, 0)

    def test_invalid_values(self):
        assert _parse_time("25:00") is None
        assert _parse_time("09:60") is None
        assert _parse_time("abc") is None
        assert _parse_time("") is None
        assert _parse_time(None) is None

    def test_leading_zeros_optional(self):
        assert _parse_time("9:00") == (9, 0)
        assert _parse_time("5:30") == (5, 30)


# ── _parse_time_12h ────────────────────────────────────────────────────────────


class TestParseTime12h:
    def test_am_times(self):
        assert _parse_time_12h("5:06 AM") == (5, 6)
        assert _parse_time_12h("12:00 AM") == (0, 0)  # midnight
        assert _parse_time_12h("6:30 AM") == (6, 30)

    def test_pm_times(self):
        assert _parse_time_12h("11:02 PM") == (23, 2)
        assert _parse_time_12h("12:00 PM") == (12, 0)  # noon
        assert _parse_time_12h("5:00 PM") == (17, 0)

    def test_narrow_no_break_space(self):
        # U+202F narrow no-break space between time and AM/PM
        assert _parse_time_12h("5:06\u202fAM") == (5, 6)
        assert _parse_time_12h("11:02\u202fPM") == (23, 2)

    def test_invalid(self):
        assert _parse_time_12h("6:30") is None  # no AM/PM
        assert _parse_time_12h("") is None
        assert _parse_time_12h(None) is None
        assert _parse_time_12h("abc") is None


# ── _parse_slot ────────────────────────────────────────────────────────────────


class TestParseSlot:
    def test_24h_slot(self):
        assert _parse_slot("09:00-17:00") == ((9, 0), (17, 0))
        assert _parse_slot("00:00-23:59") == ((0, 0), (23, 59))

    def test_12h_slot_with_em_dash(self):
        # em dash U+2013
        assert _parse_slot("5:06 AM \u2013 11:02 PM") == ((5, 6), (23, 2))

    def test_12h_slot_with_en_dash(self):
        # en dash U+2014
        assert _parse_slot("8:00 AM \u2014 6:00 PM") == ((8, 0), (18, 0))

    def test_12h_slot_with_narrow_nbsp(self):
        # Google Maps format with narrow no-break space before AM/PM
        assert _parse_slot("5:06\u202fAM \u2013 11:02\u202fPM") == ((5, 6), (23, 2))

    def test_am_pm_inheritance(self):
        # "6:30 – 7:15 AM" — open has no AM/PM, inherit from close
        result = _parse_slot("6:30 \u2013 7:15 AM")
        assert result == ((6, 30), (7, 15))

    def test_am_pm_inheritance_pm(self):
        # "5:00 – 5:30 PM" — open has no AM/PM, inherit PM from close
        result = _parse_slot("5:00 \u2013 5:30 PM")
        assert result == ((17, 0), (17, 30))

    def test_invalid_slot(self):
        assert _parse_slot("Closed") is None
        assert _parse_slot("Hours not available") is None
        assert _parse_slot("") is None


# ── _is_open_now_from_hours ────────────────────────────────────────────────────


class TestIsOpenNow:
    def _hours(self, day_hours: str) -> dict:
        """Build a full per-day opening_hours dict with a single day's value."""
        from datetime import datetime

        day = datetime.now(UTC).strftime("%A")
        return {day: day_hours}

    def test_always_open_24h(self):
        # 00:00-23:59 means open all day
        result = _is_open_now_from_hours(self._hours("00:00-23:59"))
        assert result is True

    def test_open_24_hours_string(self):
        # "Open 24 hours" raw string (from Google Maps via scraper)
        assert _is_open_now_from_hours(self._hours("Open 24 hours")) is True

    def test_open_24_hours_case_insensitive(self):
        assert _is_open_now_from_hours(self._hours("open 24 hours")) is True
        assert _is_open_now_from_hours(self._hours("OPEN 24 HOURS")) is True

    def test_24_hours_without_open_prefix(self):
        assert _is_open_now_from_hours(self._hours("24 hours")) is True

    def test_closed_keyword(self):
        result = _is_open_now_from_hours(self._hours("Closed"))
        assert result is False

    def test_hours_not_available(self):
        result = _is_open_now_from_hours(self._hours("Hours not available"))
        assert result is None

    def test_none_input(self):
        assert _is_open_now_from_hours(None) is None
        assert _is_open_now_from_hours({}) is None

    def test_12h_format_parses(self):
        # Should not raise and should return a bool (not None)
        hours = self._hours("5:06\u202fAM \u2013 11:02\u202fPM")
        result = _is_open_now_from_hours(hours)
        assert result in (True, False)  # parseable, not unknown

    def test_multi_slot(self):
        # Multi-slot: if current time is in either slot → True or False (not None)
        hours = self._hours("06:00-12:00, 14:00-22:00")
        result = _is_open_now_from_hours(hours)
        assert result in (True, False)

    def test_partial_ampm_multi_slot(self):
        # "6:30 – 7:15 AM, 8:30 – 9:30 AM" — AM/PM inheritance across multiple slots
        hours = self._hours("6:30 \u2013 7:15 AM, 8:30 \u2013 9:30 AM")
        result = _is_open_now_from_hours(hours)
        assert result in (True, False)  # parseable, not None

    def test_legacy_format(self):
        result = _is_open_now_from_hours({"opens": "09:00", "closes": "17:00"})
        assert result in (True, False)

    def test_utc_offset_applied(self):
        # Cover all days so a UTC↔local day boundary mismatch cannot cause None.
        # (self._hours() uses the UTC day, but the function looks up by local day.)
        days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        hours = dict.fromkeys(days, "05:00-22:00")
        result = _is_open_now_from_hours(hours, utc_offset_minutes=240)
        assert result in (True, False)

    def test_concatenated_multi_slot_no_comma(self):
        # Google Maps sometimes omits the comma between two slots, e.g.:
        # "9–11:30 am6–8:30 pm"  (two slots concatenated without comma separator)
        hours = self._hours("9\u201311:30\u202fam6\u20138:30\u202fpm")
        result = _is_open_now_from_hours(hours)
        assert result in (True, False)  # parseable after pre-processing, not None

    def test_concatenated_multi_slot_uppercase(self):
        # Same pattern with uppercase AM/PM
        hours = self._hours("9\u201311:30\u202fAM6\u20138:30\u202fPM")
        result = _is_open_now_from_hours(hours)
        assert result in (True, False)
