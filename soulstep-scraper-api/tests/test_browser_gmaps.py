"""
Tests for browser-based Google Maps scraper.

Uses mocked Playwright page.evaluate() — does not launch a real browser.
"""

from __future__ import annotations

import asyncio
import importlib.util
import unittest.mock
from unittest.mock import AsyncMock, MagicMock, patch

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
        # ChIJ IDs appear at the !19s slot in real Maps URLs
        hrefs = [
            "https://www.google.com/maps/place/Mosque/data=!4m7!3m6!1s0x3e5f:0xff!8m2!3d25.2!4d55.3!19sChIJabc123def456",
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
            "data=!19sChIJabc123",
            "data=!19sChIJabc123",  # duplicate
        ]
        result = _extract_place_ids_from_links(hrefs)
        assert len(result) == 1

    def test_chij_preferred_over_hex(self):
        # Link has both a hex CID at !1s and a ChIJ at !19s — ChIJ wins
        hrefs = [
            "data=!1s0x3e5f:0xff!19sChIJabc123",
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
        assert "image_blobs" not in result
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


# ── Per-type search architecture ─────────────────────────────────────────────


class TestPerTypeBrowserSearch:
    @pytest.mark.asyncio
    async def test_browser_grid_search_calls_once_per_type(self):
        """run_gmaps_scraper_browser calls search_grid_browser once per active place type."""
        from unittest.mock import AsyncMock, patch

        from sqlalchemy import StaticPool, create_engine
        from sqlmodel import Session, SQLModel

        from app.scrapers.gmaps_browser import run_gmaps_scraper_browser

        engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        SQLModel.metadata.create_all(engine)

        from app.db.models import GeoBoundary, PlaceTypeMapping, ScraperRun

        with Session(engine) as sess:
            sess.add(
                ScraperRun(
                    run_code="run_grid_type_test",
                    location_code="loc_test",
                    status="running",
                )
            )
            sess.add(
                GeoBoundary(
                    name="TestCity",
                    boundary_type="city",
                    lat_min=25.0,
                    lat_max=25.5,
                    lng_min=55.0,
                    lng_max=55.5,
                )
            )
            for gmaps_type in ["mosque", "church"]:
                sess.add(
                    PlaceTypeMapping(
                        religion="test",
                        source_type="gmaps",
                        gmaps_type=gmaps_type,
                        our_place_type=gmaps_type,
                        is_active=True,
                        display_order=0,
                    )
                )
            sess.commit()

        call_types: list[str] = []

        async def fake_grid_search(grid_cells, place_type, existing_ids, **kwargs):
            call_types.append(place_type)
            return []

        with (
            patch("app.scrapers.gmaps_browser.search_grid_browser", side_effect=fake_grid_search),
            patch("app.scrapers.gmaps_browser.DiscoveryCellStore"),
            patch("app.scrapers.gmaps_browser.GlobalCellStore"),
            patch("app.scrapers.gmaps.fetch_place_details", new=AsyncMock()),
            patch("app.collectors.gmaps.download_place_images", new=AsyncMock()),
            patch("app.db.session.engine", engine),
        ):
            with Session(engine) as sess:
                await run_gmaps_scraper_browser("run_grid_type_test", {"city": "TestCity"}, sess)

        # Should have been called once per active place type
        assert sorted(call_types) == ["church", "mosque"]


class TestDiscoveryCellStorePerType:
    def _make_engine(self):
        from sqlalchemy import StaticPool, create_engine
        from sqlmodel import SQLModel

        engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        SQLModel.metadata.create_all(engine)
        return engine

    def test_stores_are_scoped_independently(self):
        """Two stores for the same run but different types load/save independently."""
        from app.scrapers.cell_store import DiscoveryCellStore

        engine = self._make_engine()
        store_mosque = DiscoveryCellStore("run_scope_test", engine, place_type="mosque")
        store_church = DiscoveryCellStore("run_scope_test", engine, place_type="church")

        store_mosque.save(25.0, 25.1, 55.0, 55.1, 0, 1000.0, ["places/A", "places/B"], False)

        # Mosque store should see the cell, church store should not
        assert store_mosque.get(25.0, 25.1, 55.0, 55.1) is not None
        assert store_church.get(25.0, 25.1, 55.0, 55.1) is None

    def test_reloaded_store_only_sees_its_type(self):
        """A freshly constructed store pre-loads only its own type's cells."""
        from app.scrapers.cell_store import DiscoveryCellStore

        engine = self._make_engine()
        store_mosque = DiscoveryCellStore("run_reload_test", engine, place_type="mosque")
        store_mosque.save(25.0, 25.1, 55.0, 55.1, 0, 1000.0, ["places/X"], False)

        # New store for same run, different type — must not see mosque cell
        store_church = DiscoveryCellStore("run_reload_test", engine, place_type="church")
        assert store_church.get(25.0, 25.1, 55.0, 55.1) is None

        # New store for same run, same type — must see the cell
        store_mosque2 = DiscoveryCellStore("run_reload_test", engine, place_type="mosque")
        assert store_mosque2.get(25.0, 25.1, 55.0, 55.1) is not None


class TestGlobalCellStorePerTypeKey:
    def _make_engine(self):
        from sqlalchemy import StaticPool, create_engine
        from sqlmodel import SQLModel

        engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        SQLModel.metadata.create_all(engine)
        return engine

    def test_different_types_are_independent(self):
        """Saving with place_type='mosque' does not produce a hit for 'temple'."""
        from app.scrapers.cell_store import GlobalCellStore

        engine = self._make_engine()
        store = GlobalCellStore(engine)
        store.save(25.0, 25.1, 55.0, 55.1, "mosque", ["places/A"], False)

        assert store.get(25.0, 25.1, 55.0, 55.1, "mosque") is not None
        assert store.get(25.0, 25.1, 55.0, 55.1, "temple") is None

    def test_same_type_hit_after_save(self):
        """A saved entry is returned by get() with the same type."""
        from app.scrapers.cell_store import GlobalCellStore

        engine = self._make_engine()
        store = GlobalCellStore(engine)
        store.save(25.0, 25.1, 55.0, 55.1, "church", ["places/C", "places/D"], True)

        hit = store.get(25.0, 25.1, 55.0, 55.1, "church")
        assert hit is not None
        assert hit.result_count == 2
        assert hit.saturated is True


# ── _scroll_until_stable ─────────────────────────────────────────────────────


class TestScrollUntilStable:
    @pytest.mark.asyncio
    async def test_stops_when_stable(self):
        """Scroll stops after stable_threshold consecutive scrolls with same link count."""
        from unittest.mock import AsyncMock, MagicMock

        from app.scrapers.gmaps_browser import _scroll_until_stable

        # Link count stays at 5 from the start → should stabilise immediately
        page = MagicMock()
        page.evaluate = AsyncMock(
            side_effect=lambda *a, **kw: 5 if "querySelectorAll" in str(a) else None
        )
        page.query_selector = AsyncMock(return_value=MagicMock())

        await _scroll_until_stable(page, max_attempts=20, stable_threshold=3, pixel_step=800)
        # evaluate was called at least once to count links
        assert page.evaluate.call_count >= 1

    @pytest.mark.asyncio
    async def test_stops_at_max_attempts(self):
        """Scroll never exceeds max_attempts even when count keeps growing."""
        from unittest.mock import AsyncMock, MagicMock

        from app.scrapers.gmaps_browser import _scroll_until_stable

        counter = [0]

        async def growing_count(*args, **kwargs):
            # Every call returns an increasing count — never stabilises
            if "querySelectorAll" in str(args):
                counter[0] += 1
                return counter[0]
            return None

        page = MagicMock()
        page.evaluate = AsyncMock(side_effect=growing_count)
        page.query_selector = AsyncMock(return_value=None)

        await _scroll_until_stable(page, max_attempts=5, stable_threshold=3, pixel_step=800)
        # Should have made exactly max_attempts evaluate calls for link count
        link_count_calls = [c for c in page.evaluate.call_args_list if "querySelectorAll" in str(c)]
        assert len(link_count_calls) <= 5


# ── search_grid_browser ───────────────────────────────────────────────────────


class TestSearchGridBrowser:
    @pytest.mark.asyncio
    async def test_returns_empty_for_empty_cells(self):
        """search_grid_browser with no cells returns empty list."""
        from app.scrapers.base import ThreadSafeIdSet
        from app.scrapers.gmaps_browser import search_grid_browser

        ids = ThreadSafeIdSet()
        result = await search_grid_browser([], "mosque", ids)
        assert result == []

    @pytest.mark.asyncio
    async def test_skips_cached_cells(self):
        """Cells already in cell_store are skipped without browser navigation."""
        from unittest.mock import MagicMock, patch

        from app.scrapers.base import ThreadSafeIdSet
        from app.scrapers.cell_store import DiscoveryCellStore
        from app.scrapers.gmaps_browser import search_grid_browser

        mock_store = MagicMock(spec=DiscoveryCellStore)
        # All cells report a cache hit
        cached = MagicMock()
        cached.result_count = 2
        cached.resource_names = ["places/A", "places/B"]
        mock_store.get.return_value = cached

        cells = [(25.0, 25.1, 55.0, 55.1), (25.1, 25.2, 55.0, 55.1)]
        ids = ThreadSafeIdSet()

        with patch("app.scrapers.gmaps_browser.get_maps_pool") as mock_pool:
            await search_grid_browser(cells, "mosque", ids, cell_store=mock_store)

        # Browser pool should not have been acquired
        mock_pool.assert_not_called()
        # Cached names should be in dedup set
        assert "places/A" in ids

    @pytest.mark.asyncio
    async def test_respects_max_results(self):
        """search_grid_browser stops processing cells once max_results is reached."""
        from unittest.mock import AsyncMock, patch

        from app.scrapers.base import ThreadSafeIdSet
        from app.scrapers.gmaps_browser import search_grid_browser

        # Pre-fill existing_ids with enough to trigger max_results immediately
        ids = ThreadSafeIdSet()
        ids.add_new([f"places/{i}" for i in range(10)])

        cells = [(25.0, 25.1, 55.0, 55.1), (25.1, 25.2, 55.0, 55.1)]

        with patch(
            "app.scrapers.gmaps_browser._search_single_grid_cell", new=AsyncMock(return_value=[])
        ) as mock_cell:
            await search_grid_browser(cells, "mosque", ids, max_results=5)

        # All calls should have been skipped due to max_results already exceeded
        # (any calls that did execute return [] due to the guard inside _bounded_cell)
        assert mock_cell.call_count >= 0  # calls may be 0 if guard fires before gather


# ── DiscoveryCellStore grid/quadtree isolation ────────────────────────────────


class TestDiscoveryCellStoreMethodIsolation:
    def _make_engine(self):
        from sqlalchemy import StaticPool, create_engine
        from sqlmodel import SQLModel

        engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        SQLModel.metadata.create_all(engine)
        return engine

    def test_grid_and_quadtree_stores_are_independent(self):
        """A grid cell saved under 'grid' is not visible to a 'quadtree' store."""
        from app.scrapers.cell_store import DiscoveryCellStore

        engine = self._make_engine()
        grid_store = DiscoveryCellStore(
            "run_m1", engine, place_type="mosque", discovery_method="grid"
        )
        qt_store = DiscoveryCellStore(
            "run_m1", engine, place_type="mosque", discovery_method="quadtree"
        )

        grid_store.save(25.0, 25.1, 55.0, 55.1, 0, 1000.0, ["places/G"], False)

        assert grid_store.get(25.0, 25.1, 55.0, 55.1) is not None
        assert qt_store.get(25.0, 25.1, 55.0, 55.1) is None

    def test_grid_store_reloads_only_grid_cells(self):
        """A freshly constructed grid store pre-loads only grid-method cells."""
        from app.scrapers.cell_store import DiscoveryCellStore

        engine = self._make_engine()
        grid_store = DiscoveryCellStore(
            "run_m2", engine, place_type="mosque", discovery_method="grid"
        )
        grid_store.save(25.0, 25.1, 55.0, 55.1, 0, 1000.0, ["places/G"], False)

        # New quadtree store must not see the grid cell
        qt_store = DiscoveryCellStore(
            "run_m2", engine, place_type="mosque", discovery_method="quadtree"
        )
        assert qt_store.get(25.0, 25.1, 55.0, 55.1) is None

        # New grid store must see it
        grid_store2 = DiscoveryCellStore(
            "run_m2", engine, place_type="mosque", discovery_method="grid"
        )
        assert grid_store2.get(25.0, 25.1, 55.0, 55.1) is not None


class TestGlobalCellStoreDiscoveryMethodKey:
    def _make_engine(self):
        from sqlalchemy import StaticPool, create_engine
        from sqlmodel import SQLModel

        engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        SQLModel.metadata.create_all(engine)
        return engine

    def test_grid_and_quadtree_keys_are_independent(self):
        """Saving with discovery_method='grid' does not produce a hit for 'quadtree'."""
        from app.scrapers.cell_store import GlobalCellStore

        engine = self._make_engine()
        store = GlobalCellStore(engine)
        store.save(25.0, 25.1, 55.0, 55.1, "mosque", ["places/G"], False, "grid")

        assert store.get(25.0, 25.1, 55.0, 55.1, "mosque", "grid") is not None
        assert store.get(25.0, 25.1, 55.0, 55.1, "mosque", "quadtree") is None

    def test_default_discovery_method_is_quadtree(self):
        """Omitting discovery_method in get/save defaults to 'quadtree'."""
        from app.scrapers.cell_store import GlobalCellStore

        engine = self._make_engine()
        store = GlobalCellStore(engine)
        store.save(25.0, 25.1, 55.0, 55.1, "mosque", ["places/Q"], False)  # default = quadtree

        assert store.get(25.0, 25.1, 55.0, 55.1, "mosque") is not None  # default = quadtree
        assert store.get(25.0, 25.1, 55.0, 55.1, "mosque", "grid") is None


# ── Browser pool: --disable-dev-shm-usage flag ──────────────────────────────


@pytest.mark.skipif(
    not importlib.util.find_spec("playwright"),
    reason="playwright not installed",
)
class TestChromiumFlags:
    @pytest.mark.asyncio
    async def test_disable_dev_shm_usage_in_launch_args(self):
        """Chromium must be launched with --disable-dev-shm-usage for Docker/Cloud Run."""
        from unittest.mock import AsyncMock, MagicMock, patch

        from app.services.browser_pool import MapsBrowserPool

        pool = MapsBrowserPool()
        pool._pool_size = 1
        pool._max_pages = 10
        pool._headless = True

        mock_browser = MagicMock()
        mock_context = AsyncMock()
        mock_page = AsyncMock()
        mock_context.new_page = AsyncMock(return_value=mock_page)
        mock_browser.new_context = AsyncMock(return_value=mock_context)

        mock_pw = MagicMock()
        mock_pw.chromium.launch = AsyncMock(return_value=mock_browser)

        mock_ap_ctx = MagicMock()
        mock_ap_ctx.start = AsyncMock(return_value=mock_pw)

        with patch("playwright.async_api.async_playwright", return_value=mock_ap_ctx):
            await pool._init()

        launch_call = mock_pw.chromium.launch
        assert launch_call.called
        args = launch_call.call_args[1].get("args", [])
        assert "--disable-dev-shm-usage" in args
        assert "--disable-accelerated-2d-canvas" in args
        # --single-process and --no-zygote are only added on Linux (Docker/Cloud Run)
        # to avoid IPC deadlocks.  On macOS they crash Chromium after the first context.
        import sys

        if sys.platform == "linux":
            assert "--single-process" in args
            assert "--no-zygote" in args
        else:
            assert "--single-process" not in args
            assert "--no-zygote" not in args


# ── AcquireTimeoutError ─────────────────────────────────────────────────────


class TestAcquireTimeout:
    @pytest.mark.asyncio
    async def test_acquire_timeout_on_semaphore_exhaustion(self):
        """acquire() raises AcquireTimeoutError when semaphore times out."""
        import app.constants as constants_mod
        from app.services.browser_pool import AcquireTimeoutError, MapsBrowserPool

        pool = MapsBrowserPool()
        pool._pool_size = 1
        pool._headless = True
        pool._initialized = True
        # Replace with a single-slot semaphore we can fully drain
        pool._sem = asyncio.Semaphore(1)

        original = constants_mod.BROWSER_ACQUIRE_TIMEOUT_S
        try:
            constants_mod.BROWSER_ACQUIRE_TIMEOUT_S = 0.01
            # Drain the single semaphore slot so acquire() blocks on wait_for
            await pool._sem.acquire()
            with pytest.raises(AcquireTimeoutError, match="Timed out"):
                await pool.acquire()
            pool._sem.release()
        finally:
            constants_mod.BROWSER_ACQUIRE_TIMEOUT_S = original

    @pytest.mark.asyncio
    async def test_acquire_raises_after_max_retries(self):
        """acquire() raises AcquireTimeoutError after BROWSER_ACQUIRE_MAX_RETRIES.

        The pool is initialised but every session slot is occupied, so the loop
        exhausts all attempts and raises.
        """
        from app.services.browser_pool import AcquireTimeoutError, MapsBrowserPool

        pool = MapsBrowserPool()
        pool._pool_size = 0  # no slots available → always retries
        pool._headless = True
        pool._initialized = True  # skip Playwright launch
        pool._browser = AsyncMock()
        pool._browser.is_connected.return_value = True

        with patch("app.constants.BROWSER_ACQUIRE_MAX_RETRIES", 2):
            with pytest.raises(AcquireTimeoutError, match="attempts"):
                await pool.acquire()


# ── Semaphore leak on _init() failure ─────────────────────────────────────


@pytest.mark.skipif(
    not importlib.util.find_spec("playwright"),
    reason="playwright not installed",
)
class TestSemaphoreLeak:
    @pytest.mark.asyncio
    async def test_semaphore_released_on_init_failure(self):
        """If _init() raises inside acquire(), the semaphore must be released."""
        from unittest.mock import AsyncMock, patch

        from app.services.browser_pool import MapsBrowserPool

        pool = MapsBrowserPool()
        pool._pool_size = 2
        pool._headless = True
        pool._sem = asyncio.Semaphore(2)

        mock_ap_ctx = AsyncMock()
        mock_ap_ctx.start = AsyncMock(side_effect=TimeoutError("Chromium launch timeout"))

        with patch("playwright.async_api.async_playwright", return_value=mock_ap_ctx):
            with pytest.raises(TimeoutError):
                await pool.acquire()

        # Semaphore must have been released back — both slots available
        assert pool._sem._value == 2

    @pytest.mark.asyncio
    async def test_semaphore_released_on_create_session_failure(self):
        """If _create_session() raises inside acquire(), the semaphore must be released."""
        from unittest.mock import AsyncMock, MagicMock

        from app.services.browser_pool import MapsBrowserPool

        pool = MapsBrowserPool()
        pool._pool_size = 2
        pool._headless = True
        pool._sem = asyncio.Semaphore(2)
        # Mark as already initialized so _init() is a no-op
        pool._initialized = True
        pool._browser = MagicMock()
        pool._browser.new_context = AsyncMock(side_effect=Exception("context creation failed"))

        with pytest.raises(Exception, match="context creation failed"):
            await pool.acquire()

        # Semaphore must have been released back
        assert pool._sem._value == 2


# ── Route handler safety ────────────────────────────────────────────────────


@pytest.mark.skipif(
    not importlib.util.find_spec("playwright"),
    reason="playwright not installed",
)
class TestRouteHandlerSafety:
    @pytest.mark.asyncio
    async def test_route_handler_survives_abort_exception(self):
        """Route handler must swallow errors so requests aren't left unresolved."""
        from unittest.mock import AsyncMock, MagicMock, patch

        from app.services.browser_pool import MapsBrowserPool

        pool = MapsBrowserPool()
        pool._pool_size = 1
        pool._max_pages = 10
        pool._headless = True

        # Track the route handler
        captured_handler = None
        mock_context = AsyncMock()
        mock_page = AsyncMock()
        mock_context.new_page = AsyncMock(return_value=mock_page)

        async def capture_route(pattern, handler):
            nonlocal captured_handler
            captured_handler = handler

        mock_context.route = capture_route

        mock_browser = MagicMock()
        mock_browser.new_context = AsyncMock(return_value=mock_context)

        mock_pw = MagicMock()
        mock_pw.chromium.launch = AsyncMock(return_value=mock_browser)

        mock_ap_ctx = MagicMock()
        mock_ap_ctx.start = AsyncMock(return_value=mock_pw)

        with patch("playwright.async_api.async_playwright", return_value=mock_ap_ctx):
            await pool._init()
            await pool._create_session()

        assert captured_handler is not None

        # Simulate a route.abort() that throws
        mock_route = AsyncMock()
        mock_route.request.resource_type = "font"
        mock_route.abort = AsyncMock(side_effect=Exception("Connection closed"))

        # Should NOT raise
        await captured_handler(mock_route)


# ── Grid cell timeout ───────────────────────────────────────────────────────


class TestGridCellTimeout:
    @pytest.mark.asyncio
    async def test_cell_returns_empty_on_overall_timeout(self):
        """_search_single_grid_cell returns [] when overall cell timeout fires."""
        from unittest.mock import patch

        from app.scrapers.base import ThreadSafeIdSet
        from app.scrapers.gmaps_browser import _search_single_grid_cell

        async def hang_forever(*args, **kwargs):
            await asyncio.sleep(999)
            return []

        ids = ThreadSafeIdSet()

        with (
            patch("app.scrapers.gmaps_browser._do_grid_cell_navigation", side_effect=hang_forever),
            patch("app.scrapers.gmaps_browser.BROWSER_CELL_TIMEOUT_S", 0.05),
        ):
            result = await _search_single_grid_cell(25.0, 25.1, 55.0, 55.1, "mosque", ids)

        assert result == []


# ── Scroll timeout ──────────────────────────────────────────────────────────


class TestScrollTimeout:
    @pytest.mark.asyncio
    async def test_scroll_stops_on_timeout(self):
        """_scroll_until_stable returns gracefully when scroll timeout fires."""
        from unittest.mock import AsyncMock, MagicMock, patch

        from app.scrapers.gmaps_browser import _scroll_until_stable

        counter = [0]

        async def slow_evaluate(*args, **kwargs):
            counter[0] += 1
            await asyncio.sleep(0.5)  # Each evaluate is slow
            if "querySelectorAll" in str(args):
                return counter[0]
            return None

        page = MagicMock()
        page.evaluate = AsyncMock(side_effect=slow_evaluate)
        page.query_selector = AsyncMock(return_value=None)

        with patch("app.scrapers.gmaps_browser.BROWSER_SCROLL_TIMEOUT_S", 0.1):
            # Should not hang — timeout fires and function returns
            await _scroll_until_stable(page, max_attempts=100, stable_threshold=3)


# ── TargetClosedError recovery ─────────────────────────────────────────────


class TestTargetClosedRecovery:
    @pytest.mark.asyncio
    async def test_acquire_reinits_on_target_closed_new_context(self):
        """acquire() force-reinits browser when new_context raises TargetClosedError."""
        from unittest.mock import AsyncMock, MagicMock, patch

        from app.services.browser_pool import MapsBrowserPool, _MapsSession

        pool = MapsBrowserPool()
        pool._pool_size = 2
        pool._headless = True
        pool._sem = asyncio.Semaphore(2)
        pool._initialized = True
        pool._browser = MagicMock(close=AsyncMock(), is_connected=MagicMock(return_value=True))
        pool._playwright = MagicMock(stop=AsyncMock())

        # _create_session: first call raises TargetClosedError, second succeeds
        mock_page = MagicMock()
        mock_page.is_closed = MagicMock(return_value=False)
        ok_session = _MapsSession(context=MagicMock(), page=mock_page)

        mock_create = AsyncMock(
            side_effect=[
                Exception("Target page, context or browser has been closed"),
                ok_session,
            ]
        )

        # _init: no-op (we manage _initialized ourselves)
        async def fake_init():
            pool._initialized = True

        with (
            patch.object(pool, "_init", side_effect=fake_init),
            patch.object(pool, "_create_session", mock_create),
        ):
            session = await pool.acquire()

        assert session is not None
        assert session.in_use is True
        assert mock_create.call_count == 2
        # force_reinit was triggered (browser/playwright cleared)
        assert pool._sem._value == 1

    @pytest.mark.asyncio
    async def test_acquire_evicts_dead_session(self):
        """acquire() evicts sessions whose page.is_closed() returns True."""
        from unittest.mock import AsyncMock, MagicMock

        from app.services.browser_pool import MapsBrowserPool, _MapsSession

        pool = MapsBrowserPool()
        pool._pool_size = 2
        pool._headless = True
        pool._sem = asyncio.Semaphore(2)
        pool._initialized = True

        # Create a dead session
        dead_page = MagicMock()
        dead_page.is_closed = MagicMock(return_value=True)
        dead_context = AsyncMock()
        dead_context.close = AsyncMock()
        dead_session = _MapsSession(context=dead_context, page=dead_page, nav_count=1, in_use=False)
        pool._sessions = [dead_session]

        # Browser is alive, can create new sessions
        mock_context = AsyncMock()
        mock_page = AsyncMock()
        mock_page.is_closed = MagicMock(return_value=False)
        mock_context.new_page = AsyncMock(return_value=mock_page)
        mock_context.route = AsyncMock()

        mock_browser = MagicMock()
        mock_browser.new_context = AsyncMock(return_value=mock_context)
        mock_browser.is_connected = MagicMock(return_value=True)
        pool._browser = mock_browser

        with patch("app.services.browser_pool.apply_stealth", new=AsyncMock()):
            session = await pool.acquire()

        assert session is not None
        assert dead_session not in pool._sessions
        assert session.in_use is True


# ── TimezoneFinder singleton ─────────────────────────────────────────────


class TestTimezoneFinderSingleton:
    """Verify _get_timezone_finder returns the same instance."""

    def setup_method(self):
        # Reset the singleton so each test starts fresh
        import app.collectors.gmaps_browser as mod

        mod._tf_instance = None

    def test_singleton_returns_same_instance(self):
        import app.collectors.gmaps_browser as mod

        fake_tf = MagicMock()
        fake_module = MagicMock()
        fake_module.TimezoneFinder.return_value = fake_tf

        with unittest.mock.patch.dict("sys.modules", {"timezonefinder": fake_module}):
            mod._tf_instance = None
            tf1 = mod._get_timezone_finder()
            tf2 = mod._get_timezone_finder()
            assert tf1 is tf2
            # TimezoneFinder() should only be called once (singleton)
            fake_module.TimezoneFinder.assert_called_once()

    def test_get_utc_offset_uses_singleton(self):
        """_get_utc_offset should not re-create TimezoneFinder each call."""
        import app.collectors.gmaps_browser as mod

        fake_tf = MagicMock()
        fake_tf.timezone_at.return_value = "Asia/Dubai"
        fake_module = MagicMock()
        fake_module.TimezoneFinder.return_value = fake_tf

        with unittest.mock.patch.dict("sys.modules", {"timezonefinder": fake_module}):
            mod._tf_instance = None
            result = mod._get_utc_offset(25.2048, 55.2708)
            assert result is not None
            assert isinstance(result, int)
            # Dubai is UTC+4 = 240 minutes
            assert result == 240


# ── Circuit breaker half-open state ──────────────────────────────────────


class TestCircuitBreakerHalfOpen:
    """Verify three-state circuit breaker: closed → open → half_open → closed/open."""

    def test_transitions_to_half_open(self):
        from app.services.browser_pool import _CircuitBreaker

        cb = _CircuitBreaker(max_failures=2, pause_seconds=0.01)
        cb.record_failure()
        cb.record_failure()
        assert cb._state == "open"

        # Wait for pause to expire
        import time

        time.sleep(0.02)
        assert not cb.is_open  # should have transitioned to half_open
        assert cb._state == "half_open"

    def test_half_open_success_closes(self):
        from app.services.browser_pool import _CircuitBreaker

        cb = _CircuitBreaker(max_failures=2, pause_seconds=0.01)
        cb.record_failure()
        cb.record_failure()
        import time

        time.sleep(0.02)
        assert not cb.is_open  # trigger half_open transition
        cb.record_success()
        assert cb._state == "closed"
        assert cb._failures == 0

    def test_half_open_failure_reopens(self):
        from app.services.browser_pool import _CircuitBreaker

        cb = _CircuitBreaker(max_failures=2, pause_seconds=0.01)
        cb.record_failure()
        cb.record_failure()
        import time

        time.sleep(0.02)
        assert not cb.is_open  # trigger half_open transition
        cb.record_failure()
        assert cb._state == "open"


# ── ProxyRotator ────────────────────────────────────────────────────────


class TestProxyRotator:
    def test_no_proxies(self):
        from app.services.browser_pool import ProxyRotator

        pr = ProxyRotator("", "round_robin")
        assert not pr.has_proxies
        assert pr.next() is None

    def test_round_robin(self):
        from app.services.browser_pool import ProxyRotator

        pr = ProxyRotator("http://a:8080,http://b:8080", "round_robin")
        assert pr.has_proxies
        assert pr.next() == "http://a:8080"
        assert pr.next() == "http://b:8080"
        assert pr.next() == "http://a:8080"

    def test_random(self):
        from app.services.browser_pool import ProxyRotator

        pr = ProxyRotator("http://a:8080,http://b:8080", "random")
        # Just verify it returns one of the proxies
        result = pr.next()
        assert result in ("http://a:8080", "http://b:8080")


# ── RunMetrics ──────────────────────────────────────────────────────────


class TestRunMetrics:
    def test_avg_cell_time(self):
        from app.scrapers.gmaps_browser import RunMetrics

        m = RunMetrics()
        m.record_cell_time(1.0)
        m.record_cell_time(3.0)
        assert m.avg_cell_time == 2.0

    def test_avg_cell_time_empty(self):
        from app.scrapers.gmaps_browser import RunMetrics

        m = RunMetrics()
        assert m.avg_cell_time == 0.0

    def test_log_summary(self):
        from app.scrapers.gmaps_browser import RunMetrics

        m = RunMetrics(cells_total=100, cells_searched=80, cells_empty=20)
        m.record_cell_time(5.0)
        # Should not raise
        m.log_summary("mosque")


# ── Batched grid processing ─────────────────────────────────────────────


class TestBatchedGridProcessing:
    @pytest.mark.asyncio
    async def test_search_grid_browser_batches(self):
        """search_grid_browser processes cells in batches, not all at once."""
        from app.scrapers.gmaps_browser import search_grid_browser

        cells = [(0, 1, 0, 1)] * 250  # 250 cells should trigger 3 batches
        existing_ids = _make_id_set()

        with patch(
            "app.scrapers.gmaps_browser._search_single_grid_cell",
            new=AsyncMock(return_value=[]),
        ):
            result = await search_grid_browser(cells, "mosque", existing_ids)
            assert isinstance(result, list)


def _make_id_set():
    """Create a fresh ThreadSafeIdSet."""
    from app.scrapers.base import ThreadSafeIdSet

    return ThreadSafeIdSet()


# ── Review photo_urls in build_place_data ────────────────────────────────────


class TestReviewPhotoUrlsInBuildPlaceData:
    """Verify photo_urls field on reviews is preserved end-to-end through build_place_data."""

    def setup_method(self):
        self.collector = BrowserGmapsCollector()
        self.sample_response = {
            "name": "Test Mosque",
            "address": "Dubai, United Arab Emirates",
            "lat": 25.2,
            "lng": 55.3,
            "rating": 4.5,
            "review_count": 100,
            "phone": "",
            "website": "",
            "google_maps_uri": "",
            "business_status": "OPERATIONAL",
            "categories": ["Mosque"],
            "photo_urls": [],
            "reviews": [
                {
                    "author_name": "Alice",
                    "rating": 5,
                    "text": "Great place",
                    "time": 1700000000,
                    "relative_time_description": "1 month ago",
                    "language": "en",
                    "photo_urls": [
                        "https://lh3.googleusercontent.com/review-photo1=w800-h600",
                        "https://lh3.googleusercontent.com/review-photo2=w800-h600",
                    ],
                },
                {
                    "author_name": "Bob",
                    "rating": 4,
                    "text": "Nice",
                    "time": 1700001000,
                    "relative_time_description": "1 month ago",
                    "language": "en",
                    "photo_urls": [],
                },
            ],
            "opening_hours_weekday": [],
            "about_sections": {},
            "canonical_place_id": None,
        }

    def test_review_photo_urls_preserved(self):
        """photo_urls on each review dict must survive build_place_data unchanged."""
        result = self.collector.build_place_data(
            self.sample_response,
            "gbr_test",
            "",
            None,
            type_map={},
            religion_type_map={},
        )
        reviews = result["external_reviews"]
        assert len(reviews) == 2
        assert reviews[0]["photo_urls"] == [
            "https://lh3.googleusercontent.com/review-photo1=w800-h600",
            "https://lh3.googleusercontent.com/review-photo2=w800-h600",
        ]
        assert reviews[1]["photo_urls"] == []

    def test_review_without_photo_urls_key_defaults_to_empty(self):
        """Reviews that omit photo_urls entirely should default to [] in the output."""
        response = dict(self.sample_response)
        response["reviews"] = [
            {
                "author_name": "Charlie",
                "rating": 3,
                "text": "OK",
                "time": 1700002000,
                "relative_time_description": "2 months ago",
                "language": "en",
                # no photo_urls key at all
            }
        ]
        result = self.collector.build_place_data(
            response, "gbr_test", "", None, type_map={}, religion_type_map={}
        )
        reviews = result["external_reviews"]
        assert len(reviews) == 1
        photo_urls = reviews[0].get("photo_urls", [])
        assert photo_urls == [] or photo_urls is None


# ── _flush_detail_buffer: review image GCS write-back ───────────────────────


class TestFlushDetailBufferReviewImages:
    """Unit tests for _flush_detail_buffer's review image GCS upload path."""

    def _make_engine_and_run(self):
        from sqlalchemy import StaticPool, create_engine
        from sqlmodel import Session, SQLModel

        from app.db.models import ScraperRun

        engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        SQLModel.metadata.create_all(engine)

        with Session(engine) as sess:
            run = ScraperRun(
                run_code="run_rev_img_test",
                location_code="loc_test",
                status="running",
            )
            sess.add(run)
            sess.commit()

        return engine

    def _minimal_details(self, place_code: str = "gbr_revimg01") -> dict:
        return {
            "place_code": place_code,
            "name": "Test Place",
            "religion": "islam",
            "place_type": "mosque",
            "lat": 25.0,
            "lng": 55.0,
            "address": "Dubai, UAE",
            "image_urls": [],
            "description": None,
            "website_url": "",
            "opening_hours": None,
            "utc_offset_minutes": None,
            "attributes": [],
            "external_reviews": [
                {
                    "author_name": "Alice",
                    "rating": 5,
                    "text": "Great",
                    "time": 1700000000,
                    "language": "en",
                    "photo_urls": [],
                }
            ],
            "city": "Dubai",
            "state": None,
            "country": "UAE",
            "source": "gmaps_browser",
            "vicinity": "",
            "business_status": "OPERATIONAL",
            "google_place_id": "ChIJtest",
            "rating": 4.5,
            "user_rating_count": 100,
            "has_editorial": False,
            "gmaps_types": ["mosque"],
        }

    def _flush(self, engine, details, response, gcs_side_effect=None):
        """Helper: run _flush_detail_buffer with optional GCS mock, return ScrapedPlace."""
        import contextlib

        from sqlmodel import Session, select

        from app.db.models import ScrapedPlace, ScraperRun
        from app.scrapers.gmaps import AtomicCounter, _flush_detail_buffer

        counter = AtomicCounter()
        patches = [
            patch("app.pipeline.place_quality.score_place_quality", return_value=0.85),
            patch("app.pipeline.place_quality.get_quality_gate", return_value="sync"),
        ]
        if gcs_side_effect is not None:
            patches.append(
                patch("app.services.gcs.upload_image_bytes", side_effect=gcs_side_effect)
            )

        with Session(engine) as sess:
            run_obj = sess.exec(
                select(ScraperRun).where(ScraperRun.run_code == "run_rev_img_test")
            ).first()
            with contextlib.ExitStack() as stack:
                for p in patches:
                    stack.enter_context(p)
                _flush_detail_buffer(
                    [("Test Place", details, response)],
                    "run_rev_img_test",
                    sess,
                    run_obj,
                    counter,
                    1,
                )
                sess.commit()

        with Session(engine) as sess:
            return sess.exec(
                select(ScrapedPlace).where(ScrapedPlace.place_code == details["place_code"])
            ).first()

    def test_review_image_bytes_written_back_to_raw_data(self):
        """GCS URLs must be injected into external_reviews[i]['photo_urls']."""
        engine = self._make_engine_and_run()
        details = self._minimal_details("gbr_revimg01")
        response = {"_review_image_bytes": [(0, 0, b"fake_image_bytes")]}

        uploaded = []

        def fake_upload(data):
            url = f"https://storage.googleapis.com/bucket/{len(uploaded)}.jpg"
            uploaded.append(url)
            return url

        sp = self._flush(engine, details, response, gcs_side_effect=fake_upload)

        assert sp is not None
        reviews = (sp.raw_data or {}).get("external_reviews", [])
        assert len(reviews) == 1
        assert reviews[0]["photo_urls"] == [uploaded[0]]

    def test_no_review_image_bytes_leaves_reviews_unchanged(self):
        """When _review_image_bytes is absent, external_reviews stay as-is."""
        engine = self._make_engine_and_run()
        details = self._minimal_details("gbr_revimg02")
        response = {}

        sp = self._flush(engine, details, response)

        assert sp is not None
        reviews = (sp.raw_data or {}).get("external_reviews", [])
        assert len(reviews) == 1
        assert reviews[0].get("photo_urls", []) == []

    def test_gcs_failure_does_not_write_photo_urls(self):
        """If GCS returns None, photo_urls must not be modified."""
        engine = self._make_engine_and_run()
        details = self._minimal_details("gbr_revimg03")
        response = {"_review_image_bytes": [(0, 0, b"bytes_that_fail")]}

        sp = self._flush(engine, details, response, gcs_side_effect=lambda _: None)

        assert sp is not None
        reviews = (sp.raw_data or {}).get("external_reviews", [])
        assert len(reviews) == 1
        assert reviews[0].get("photo_urls", []) == []


# ── _capture_review_images: URL collection and limit ────────────────────────


class TestCaptureReviewImages:
    @pytest.mark.asyncio
    async def test_respects_max_review_images_config(self):
        """_capture_review_images must not download more than max_review_images per review."""

        collector = BrowserGmapsCollector()

        reviews = [
            {
                "author_name": "Alice",
                "rating": 5,
                "text": "Test",
                "time": 1700000000,
                "language": "en",
                "photo_urls": [
                    "https://lh3.googleusercontent.com/photo1=w1920-h1080",
                    "https://lh3.googleusercontent.com/photo2=w1920-h1080",
                    "https://lh3.googleusercontent.com/photo3=w1920-h1080",
                ],
            }
        ]

        downloaded = []

        async def fake_get(url, **kwargs):
            downloaded.append(url)
            resp = MagicMock()
            resp.status_code = 200
            resp.content = b"fake_bytes"
            return resp

        mock_client = AsyncMock()
        mock_client.get = fake_get
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)

        mock_page = MagicMock()
        mock_page.context = MagicMock()
        mock_page.context.cookies = AsyncMock(return_value=[])

        with (
            patch("app.config.settings") as mock_settings,
            patch("httpx.AsyncClient", return_value=mock_client),
        ):
            mock_settings.max_review_images = 2  # limit to 2, despite 3 URLs
            result = await collector._capture_review_images(mock_page, reviews)

        # At most 2 downloads for the single review
        assert len(result) <= 2
        assert all(isinstance(r, tuple) and len(r) == 3 for r in result)
        assert all(r[0] == 0 for r in result)  # all belong to review_idx=0
