"""
Tests for browser-based Google Maps scraper.

Uses mocked Playwright page.evaluate() — does not launch a real browser.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from app.collectors.gmaps_browser import (
    BrowserGmapsCollector,
    _clean_image_url,
    _parse_address_components,
    _parse_hours_rows,
)
from app.scrapers.gmaps_browser import _extract_place_ids_from_links

# ── _parse_address_components ────────────────────────────────────────────────


class TestParseAddressComponents:
    def test_four_parts(self):
        city, state, country = _parse_address_components(
            "Al Fahidi St, Al Fahidi, Dubai, United Arab Emirates"
        )
        assert country == "United Arab Emirates"
        assert state == "Dubai"
        assert city == "Al Fahidi"

    def test_three_parts(self):
        city, state, country = _parse_address_components(
            "Jumeirah Beach, Dubai, United Arab Emirates"
        )
        assert country == "United Arab Emirates"
        assert state == "Dubai"
        assert city is None

    def test_two_parts(self):
        city, state, country = _parse_address_components("Dubai, UAE")
        assert country == "UAE"
        assert city == "Dubai"
        assert state is None

    def test_one_part(self):
        city, state, country = _parse_address_components("UAE")
        assert country == "UAE"
        assert city is None
        assert state is None

    def test_empty_string(self):
        assert _parse_address_components("") == (None, None, None)

    def test_none_input(self):
        assert _parse_address_components(None) == (None, None, None)

    def test_strips_whitespace(self):
        _, _, country = _parse_address_components("  City  ,  Country  ")
        assert country == "Country"


# ── _parse_hours_rows ────────────────────────────────────────────────────────


class TestParseHoursRows:
    def test_paired_rows(self):
        rows = ["Monday", "9:00 AM – 6:00 PM", "Friday", "Closed"]
        result = _parse_hours_rows(rows)
        assert result["Monday"] == "09:00-18:00"
        assert result["Friday"] == "Closed"
        assert result["Tuesday"] == "Hours not available"

    def test_colon_format(self):
        rows = ["Monday: 9:00 AM – 6:00 PM"]
        result = _parse_hours_rows(rows)
        assert result["Monday"] == "09:00-18:00"

    def test_24h_open(self):
        rows = ["Sunday", "Open 24 hours"]
        result = _parse_hours_rows(rows)
        assert result["Sunday"] == "00:00-23:59"

    def test_empty_rows(self):
        result = _parse_hours_rows([])
        assert all(v == "Hours not available" for v in result.values())
        assert len(result) == 7

    def test_all_seven_days_present(self):
        result = _parse_hours_rows([])
        expected_days = {
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
            "Sunday",
        }
        assert set(result.keys()) == expected_days


# ── _clean_image_url ─────────────────────────────────────────────────────────


class TestCleanImageUrl:
    def test_google_size_param_stripped(self):
        url = "https://lh3.googleusercontent.com/abc123=s800"
        result = _clean_image_url(url)
        assert result is not None
        assert "=w800-h600" in result

    def test_width_param_stripped(self):
        url = "https://lh3.googleusercontent.com/abc123=w400-h300"
        result = _clean_image_url(url)
        assert "=w800-h600" in result

    def test_data_uri_rejected(self):
        assert _clean_image_url("data:image/png;base64,abc") is None

    def test_none_input(self):
        assert _clean_image_url(None) is None

    def test_empty_string(self):
        assert _clean_image_url("") is None

    def test_plain_https_url_unchanged(self):
        url = "https://example.com/image.jpg"
        assert _clean_image_url(url) == url


# ── _extract_place_ids_from_links ────────────────────────────────────────────


class TestExtractPlaceIds:
    def test_chij_extraction(self):
        hrefs = [
            "https://www.google.com/maps/place/Mosque/@25.2,55.3,17z/data=!3m1!4b1!4m6!3m5!1sChIJabc123def456!8m2!3d25.2!4d55.3",
        ]
        result = _extract_place_ids_from_links(hrefs)
        assert "places/ChIJabc123def456" in result

    def test_hex_cid_extraction(self):
        hrefs = [
            "https://www.google.com/maps/place/Mosque/data=!1s0x3e5f43348a67e24b:0xff45e1c17cc99396!8m2",
        ]
        result = _extract_place_ids_from_links(hrefs)
        assert len(result) == 1
        assert result[0].startswith("places/")
        assert "0x" in result[0]

    def test_url_encoded_hex_cid(self):
        hrefs = [
            "https://maps.google.com/place/data=!1s0x3e5f43348a67e24b%3A0xff45e1c17cc99396",
        ]
        result = _extract_place_ids_from_links(hrefs)
        assert len(result) == 1

    def test_deduplication(self):
        hrefs = [
            "data=!1sChIJabc123",
            "data=!1sChIJabc123",  # duplicate
        ]
        result = _extract_place_ids_from_links(hrefs)
        assert len(result) == 1

    def test_chij_preferred_over_hex(self):
        # If same link has ChIJ, use it (not the hex)
        hrefs = [
            "data=!1sChIJabc123!4b1",
        ]
        result = _extract_place_ids_from_links(hrefs)
        assert result[0] == "places/ChIJabc123"

    def test_empty_list(self):
        assert _extract_place_ids_from_links([]) == []

    def test_no_place_ids_in_links(self):
        hrefs = ["https://www.google.com/", "https://maps.google.com/search"]
        assert _extract_place_ids_from_links(hrefs) == []


# ── BrowserGmapsCollector.build_place_data ───────────────────────────────────


class TestBuildPlaceData:
    def setup_method(self):
        self.collector = BrowserGmapsCollector()
        self.sample_response = {
            "name": "Jumeirah Mosque",
            "address": "Al Jumeirah Rd, Jumeirah, Dubai, United Arab Emirates",
            "lat": 25.2341,
            "lng": 55.3041,
            "rating": 4.7,
            "review_count": 2341,
            "phone": "+971 4 353 6666",
            "website": "https://cultures.ae",
            "google_maps_uri": "https://www.google.com/maps/place/...",
            "business_status": "OPERATIONAL",
            "categories": ["Mosque"],
            "photo_urls": ["https://lh3.googleusercontent.com/abc=s800"],
            "reviews": [
                {
                    "author_name": "Alice",
                    "rating": 5,
                    "text": "Beautiful mosque",
                    "time": 1700000000,
                    "relative_time_description": "3 months ago",
                    "language": "en",
                }
            ],
            "opening_hours_weekday": ["Monday", "9:00 AM – 6:00 PM"],
            "about_sections": {
                "accessibility": {"wheelchair_accessible": True},
            },
            "canonical_place_id": "ChIJabc123",
        }

    def test_required_fields_present(self):
        result = self.collector.build_place_data(
            self.sample_response,
            "gplc_ChIJabc123",
            "",
            None,
            type_map={"mosque": "mosque"},
            religion_type_map={"mosque": "islam"},
        )
        required_fields = [
            "place_code",
            "name",
            "religion",
            "place_type",
            "lat",
            "lng",
            "address",
            "image_urls",
            "image_blobs",
            "description",
            "website_url",
            "opening_hours",
            "utc_offset_minutes",
            "attributes",
            "external_reviews",
            "city",
            "state",
            "country",
            "source",
            "vicinity",
            "business_status",
            "google_place_id",
            "rating",
            "user_rating_count",
            "has_editorial",
            "gmaps_types",
        ]
        for field in required_fields:
            assert field in result, f"Missing required field: {field}"

    def test_core_values(self):
        result = self.collector.build_place_data(
            self.sample_response,
            "gplc_ChIJabc123",
            "",
            None,
            type_map={"mosque": "mosque"},
            religion_type_map={"mosque": "islam"},
        )
        assert result["name"] == "Jumeirah Mosque"
        assert result["religion"] == "islam"
        assert result["lat"] == 25.2341
        assert result["lng"] == 55.3041
        assert result["business_status"] == "OPERATIONAL"
        assert result["image_blobs"] == []
        assert result["source"] == "gmaps_browser"
        assert result["has_editorial"] is False

    def test_canonical_place_id_upgrades_code(self):
        result = self.collector.build_place_data(
            self.sample_response,
            "gbr_old_id",
            "",
            None,
            type_map={},
            religion_type_map={},
        )
        assert result["place_code"] == "gplc_ChIJabc123"
        assert result["google_place_id"] == "ChIJabc123"

    def test_religion_fallback_from_category_text(self):
        response = dict(self.sample_response)
        response["categories"] = ["Church", "Place of worship"]
        response["canonical_place_id"] = None
        result = self.collector.build_place_data(
            response, "gbr_test", "", None, type_map={}, religion_type_map={}
        )
        assert result["religion"] == "christianity"

    def test_religion_fallback_islam(self):
        response = dict(self.sample_response)
        response["categories"] = ["Islamic Center"]
        response["canonical_place_id"] = None
        result = self.collector.build_place_data(
            response, "gbr_test", "", None, type_map={}, religion_type_map={}
        )
        assert result["religion"] == "islam"

    def test_religion_unknown_fallback(self):
        response = dict(self.sample_response)
        response["categories"] = ["Community Center"]
        response["canonical_place_id"] = None
        result = self.collector.build_place_data(
            response, "gbr_test", "", None, type_map={}, religion_type_map={}
        )
        assert result["religion"] == "unknown"

    def test_address_parsing(self):
        result = self.collector.build_place_data(
            self.sample_response,
            "gplc_test",
            "",
            None,
            type_map={},
            religion_type_map={},
        )
        assert result["country"] == "United Arab Emirates"
        assert result["state"] == "Dubai"

    def test_attributes_contain_rating(self):
        result = self.collector.build_place_data(
            self.sample_response,
            "gplc_test",
            "",
            None,
            type_map={},
            religion_type_map={},
        )
        rating_attrs = [a for a in result["attributes"] if a["attribute_code"] == "rating"]
        assert len(rating_attrs) == 1
        assert rating_attrs[0]["value"] == 4.7

    def test_about_sections_become_attributes(self):
        result = self.collector.build_place_data(
            self.sample_response,
            "gplc_test",
            "",
            None,
            type_map={},
            religion_type_map={},
        )
        about_attrs = [
            a for a in result["attributes"] if a["attribute_code"].startswith("about_accessibility")
        ]
        assert len(about_attrs) >= 1
        assert about_attrs[0]["value"] is True

    def test_no_photos_gives_empty_image_urls(self):
        response = dict(self.sample_response)
        response["photo_urls"] = []
        result = self.collector.build_place_data(
            response, "gplc_test", "", None, type_map={}, religion_type_map={}
        )
        assert result["image_urls"] == []

    def test_external_reviews_preserved(self):
        result = self.collector.build_place_data(
            self.sample_response,
            "gplc_test",
            "",
            None,
            type_map={},
            religion_type_map={},
        )
        assert len(result["external_reviews"]) == 1
        assert result["external_reviews"][0]["author_name"] == "Alice"


# ── BrowserGmapsCollector.collect (async, with mocked pool) ─────────────────


class TestBrowserGmapsCollectorAsync:
    @pytest.mark.asyncio
    async def test_collect_success(self):
        collector = BrowserGmapsCollector()
        mock_raw = {
            "name": "Test Mosque",
            "address": "123 Street, Dubai, UAE",
            "lat": 25.2,
            "lng": 55.3,
            "rating": 4.5,
            "review_count": 100,
            "categories": ["Mosque"],
            "photo_urls": [],
            "reviews": [],
            "business_status": "OPERATIONAL",
            "about_sections": {},
            "opening_hours_weekday": [],
            "canonical_place_id": None,
        }

        with patch.object(collector, "_navigate_and_extract", new=AsyncMock(return_value=mock_raw)):
            result = await collector.collect("gplc_ChIJtest", 25.2, 55.3, "Test Mosque")

        assert result.collector_name == "gmaps_browser"
        assert result.status == "success"

    @pytest.mark.asyncio
    async def test_collect_network_error_returns_failed(self):
        collector = BrowserGmapsCollector()

        with patch.object(
            collector,
            "_navigate_and_extract",
            new=AsyncMock(side_effect=Exception("Network error")),
        ):
            result = await collector.collect("gplc_ChIJtest", 25.2, 55.3, "Test Mosque")

        assert result.status == "failed"
        assert "Network error" in result.error_message

    @pytest.mark.asyncio
    async def test_collect_invalid_place_code_returns_skipped(self):
        collector = BrowserGmapsCollector()
        result = await collector.collect("invalid_code_xyz", 25.2, 55.3, "Test")
        assert result.status == "skipped"

    @pytest.mark.asyncio
    async def test_fetch_details_split_signature(self):
        """fetch_details_split must accept (place_name, api_key, rate_limiter, client)."""
        collector = BrowserGmapsCollector()
        mock_raw = {
            "name": "X",
            "address": "",
            "lat": 0.0,
            "lng": 0.0,
            "categories": [],
            "photo_urls": [],
            "reviews": [],
            "business_status": "OPERATIONAL",
            "about_sections": {},
            "opening_hours_weekday": [],
            "canonical_place_id": None,
        }

        with patch.object(collector, "_navigate_and_extract", new=AsyncMock(return_value=mock_raw)):
            result = await collector.fetch_details_split("places/ChIJtest", "", None, None)

        assert isinstance(result, dict)
        assert result["name"] == "X"


# ── Circuit breaker / block detection ───────────────────────────────────────


class TestCircuitBreaker:
    def test_opens_after_three_failures(self):
        from app.services.browser_pool import _CircuitBreaker

        breaker = _CircuitBreaker(max_failures=3, pause_seconds=600.0)
        assert not breaker.is_open

        breaker.record_failure()
        assert not breaker.is_open
        breaker.record_failure()
        assert not breaker.is_open
        breaker.record_failure()
        assert breaker.is_open

    def test_resets_on_success(self):
        from app.services.browser_pool import _CircuitBreaker

        breaker = _CircuitBreaker(max_failures=3, pause_seconds=600.0)
        breaker.record_failure()
        breaker.record_failure()
        breaker.record_failure()
        assert breaker.is_open

        breaker.record_success()
        assert not breaker.is_open

    def test_auto_reset_after_pause(self):
        import time

        from app.services.browser_pool import _CircuitBreaker

        breaker = _CircuitBreaker(max_failures=1, pause_seconds=0.01)
        breaker.record_failure()
        assert breaker.is_open

        time.sleep(0.05)
        assert not breaker.is_open  # should auto-reset after pause_seconds
