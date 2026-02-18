"""
Unit tests for normalize_to_24h() in data_scraper/app/scrapers/gmaps.py.

These are pure-function tests — no DB or network calls required.
"""

import os
import sys

# Make the data_scraper package importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.scrapers.gmaps import clean_address, normalize_to_24h, process_weekly_hours


class TestNormalizeTo24h:
    # ── basic 12h → 24h conversion ───────────────────────────────────────────

    def test_am_to_24h(self):
        assert normalize_to_24h("9:00 AM - 5:00 PM") == "09:00-17:00"

    def test_pm_wraps_correctly(self):
        assert normalize_to_24h("12:00 PM - 9:00 PM") == "12:00-21:00"

    def test_midnight_hour(self):
        assert normalize_to_24h("12:00 AM - 12:00 PM") == "00:00-12:00"

    def test_minutes_preserved(self):
        assert normalize_to_24h("9:30 AM - 5:45 PM") == "09:30-17:45"

    # ── special keywords ──────────────────────────────────────────────────────

    def test_open_24_hours(self):
        assert normalize_to_24h("Open 24 hours") == "00:00-23:59"

    def test_open_24_hours_case_insensitive(self):
        assert normalize_to_24h("open 24 hours") == "00:00-23:59"

    def test_closed(self):
        assert normalize_to_24h("Closed") == "Closed"

    def test_closed_case_insensitive(self):
        assert normalize_to_24h("closed") == "Closed"

    # ── multi-slot (comma-separated) ──────────────────────────────────────────

    def test_multi_slot(self):
        result = normalize_to_24h("9:00 AM - 12:00 PM, 2:00 PM - 6:00 PM")
        assert result == "09:00-12:00, 14:00-18:00"

    def test_multi_slot_three_segments(self):
        result = normalize_to_24h("8:00 AM - 12:00 PM, 1:00 PM - 5:00 PM, 7:00 PM - 9:00 PM")
        assert result == "08:00-12:00, 13:00-17:00, 19:00-21:00"

    # ── unicode whitespace (narrow no-break space U+202F) ─────────────────────

    def test_narrow_no_break_space(self):
        # Google Maps uses U+202F between time and AM/PM
        result = normalize_to_24h("9:00\u202fAM - 5:00\u202fPM")
        assert result == "09:00-17:00"

    # ── unparseable input ─────────────────────────────────────────────────────

    def test_unparseable_returns_original(self):
        original = "Hours not available"
        assert normalize_to_24h(original) == original

    def test_missing_ampm_returns_original(self):
        # A segment without AM/PM should fall back to original
        original = "9:00 - 5:00"
        assert normalize_to_24h(original) == original


class TestCleanAddress:
    def test_removes_plus_code_prefix(self):
        assert clean_address("7G8Q+WC Dubai") == "Dubai"

    def test_no_plus_code(self):
        assert clean_address("123 Main Street, Dubai") == "123 Main Street, Dubai"

    def test_plus_code_with_dash(self):
        result = clean_address("7G8Q+WC - Dubai, UAE")
        assert "7G8Q" not in result

    def test_empty_string(self):
        assert clean_address("") == ""


class TestProcessWeeklyHours:
    def test_full_week(self):
        opening_hours_dict = {
            "weekday_text": [
                "Monday: 9:00 AM - 5:00 PM",
                "Tuesday: 9:00 AM - 5:00 PM",
                "Wednesday: 9:00 AM - 5:00 PM",
                "Thursday: 9:00 AM - 5:00 PM",
                "Friday: 9:00 AM - 1:00 PM",
                "Saturday: Closed",
                "Sunday: Closed",
            ]
        }
        result = process_weekly_hours(opening_hours_dict)
        assert result["Monday"] == "09:00-17:00"
        assert result["Friday"] == "09:00-13:00"
        assert result["Saturday"] == "Closed"
        assert result["Sunday"] == "Closed"

    def test_missing_days_default_to_not_available(self):
        result = process_weekly_hours({"weekday_text": []})
        for day in ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]:
            assert result[day] == "Hours not available"

    def test_open_24_hours(self):
        result = process_weekly_hours({"weekday_text": ["Monday: Open 24 hours"]})
        assert result["Monday"] == "00:00-23:59"
