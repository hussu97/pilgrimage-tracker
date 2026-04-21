"""
Extended pure-function tests for data_scraper/app/scrapers/gmaps.py.

Complements test_normalize.py with additional edge cases for normalize_to_24h,
clean_address, and process_weekly_hours.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.scrapers.gmaps_shared import clean_address, normalize_to_24h, process_weekly_hours

# ── TestNormalizeTo24hExtended ─────────────────────────────────────────────────


class TestNormalizeTo24hExtended:
    def test_noon_12pm(self):
        """12:00 PM should be 12:00 (noon) in 24h."""
        result = normalize_to_24h("9:00 AM - 12:00 PM")
        assert result == "09:00-12:00"

    def test_midnight_12am_start(self):
        """12:00 AM is midnight — should be 00:00 in 24h."""
        result = normalize_to_24h("12:00 AM - 6:00 AM")
        assert result == "00:00-06:00"

    def test_already_24h_passthrough_when_unparseable(self):
        """Strings that don't match 12h format are returned unchanged."""
        result = normalize_to_24h("09:00-17:00")
        assert result == "09:00-17:00"

    def test_open_24_hours_mixed_case(self):
        assert normalize_to_24h("Open 24 Hours") == "00:00-23:59"

    def test_closed_returns_closed(self):
        assert normalize_to_24h("Closed") == "Closed"

    def test_early_morning_to_late_night(self):
        result = normalize_to_24h("3:00 AM - 11:00 PM")
        assert result == "03:00-23:00"

    def test_en_dash_separator(self):
        """Google Maps sometimes uses an en-dash (–) as the range separator."""
        result = normalize_to_24h("9:00 AM \u2013 5:00 PM")
        assert result == "09:00-17:00"


# ── TestCleanAddressExtended ───────────────────────────────────────────────────


class TestCleanAddressExtended:
    def test_strips_leading_whitespace(self):
        result = clean_address("  123 Main Street")
        assert result == "123 Main Street"

    def test_trailing_whitespace(self):
        result = clean_address("123 Main Street  ")
        assert result == "123 Main Street"

    def test_plus_code_only(self):
        result = clean_address("7G8Q+WC")
        # After removing the plus code there's nothing left
        assert result == ""

    def test_normal_address_unchanged(self):
        addr = "456 Church Road, London, UK"
        assert clean_address(addr) == addr

    def test_plus_code_with_hyphen(self):
        result = clean_address("ABCD+12 - Some City")
        assert "ABCD+12" not in result


# ── TestProcessWeeklyHoursExtended ────────────────────────────────────────────


class TestProcessWeeklyHoursExtended:
    def test_full_week_dict(self):
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
        assert len(result) == 7
        assert result["Monday"] == "09:00-17:00"
        assert result["Saturday"] == "Closed"

    def test_missing_days_default_not_available(self):
        result = process_weekly_hours({"weekday_text": ["Monday: 9:00 AM - 5:00 PM"]})
        for day in ["Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]:
            assert result[day] == "Hours not available"

    def test_open_24_hours_day(self):
        result = process_weekly_hours({"weekday_text": ["Friday: Open 24 hours"]})
        assert result["Friday"] == "00:00-23:59"

    def test_empty_weekday_text(self):
        result = process_weekly_hours({"weekday_text": []})
        for day in ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]:
            assert result[day] == "Hours not available"

    def test_multi_slot_day(self):
        result = process_weekly_hours(
            {"weekday_text": ["Monday: 9:00 AM - 12:00 PM, 2:00 PM - 6:00 PM"]}
        )
        assert result["Monday"] == "09:00-12:00, 14:00-18:00"

    def test_missing_weekday_text_key(self):
        """If weekday_text key is absent, all days default to not available."""
        result = process_weekly_hours({})
        for day in ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]:
            assert result[day] == "Hours not available"
