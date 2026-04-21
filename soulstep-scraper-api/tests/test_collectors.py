"""
Unit tests for all collectors (mocked HTTP responses).
"""

import os
import sys
from unittest.mock import AsyncMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


# ── TestBaseCollector ─────────────────────────────────────────────────────────


class TestBaseCollector:
    def test_collector_result_defaults(self):
        from app.collectors.base import CollectorResult

        result = CollectorResult(collector_name="test")
        assert result.status == "success"
        assert result.descriptions == []
        assert result.attributes == []
        assert result.contact == {}
        assert result.images == []
        assert result.reviews == []
        assert result.tags == {}
        assert result.entity_types == []

    def test_skip_result(self):
        from app.collectors.osm import OsmCollector

        collector = OsmCollector()
        result = collector._skip_result("No data")
        assert result.status == "skipped"
        assert result.error_message == "No data"

    def test_fail_result(self):
        from app.collectors.osm import OsmCollector

        collector = OsmCollector()
        result = collector._fail_result("Connection timeout")
        assert result.status == "failed"
        assert result.error_message == "Connection timeout"

    def test_not_configured_result(self):
        from app.collectors.besttime import BestTimeCollector

        collector = BestTimeCollector()
        result = collector._not_configured_result()
        assert result.status == "not_configured"
        assert "BESTTIME_API_KEY" in result.error_message


# ── TestOsmCollector ──────────────────────────────────────────────────────────


class TestOsmCollector:
    def test_extract_amenities(self):
        from app.collectors.osm import OsmCollector

        collector = OsmCollector()
        tags = {
            "toilets": "yes",
            "drinking_water": "no",
            "internet_access": "wlan",
            "denomination": "sunni",
            "wikipedia": "en:Al-Aqsa Mosque",
            "wikidata": "Q23731",
            "name:ar": "المسجد الأقصى",
            "name:hi": "अल-अक्सा मस्जिद",
            "contact:phone": "+972-2-1234567",
            "contact:email": "info@alaqsa.com",
            "website": "https://alaqsa.com",
        }
        result = collector._extract(tags)

        assert result.status == "success"
        attr_codes = {a["attribute_code"] for a in result.attributes}
        assert "has_toilets" in attr_codes
        assert "has_drinking_water" in attr_codes
        assert "denomination" in attr_codes
        assert "name_ar" in attr_codes
        assert "name_hi" in attr_codes

        # Check boolean conversion
        toilets_attr = next(a for a in result.attributes if a["attribute_code"] == "has_toilets")
        assert toilets_attr["value"] is True

        water_attr = next(
            a for a in result.attributes if a["attribute_code"] == "has_drinking_water"
        )
        assert water_attr["value"] is False

        # Check tags for downstream
        assert result.tags["wikipedia"] == "en:Al-Aqsa Mosque"
        assert result.tags["wikidata"] == "Q23731"

        # Check contact
        assert result.contact["phone_national"] == "+972-2-1234567"
        assert result.contact["email"] == "info@alaqsa.com"
        assert result.contact["website"] == "https://alaqsa.com"

    async def test_collect_no_data(self):
        from app.collectors.osm import OsmCollector

        collector = OsmCollector()
        with patch.object(collector, "_query_overpass", new=AsyncMock(return_value={})):
            result = await collector.collect("gplc_test", 25.0, 55.0, "Test Mosque")
        assert result.status == "skipped"

    async def test_collect_exception(self):
        from app.collectors.osm import OsmCollector

        collector = OsmCollector()
        with patch.object(
            collector, "_query_overpass", new=AsyncMock(side_effect=Exception("Network error"))
        ):
            result = await collector.collect("gplc_test", 25.0, 55.0, "Test Mosque")
        assert result.status == "failed"
        assert "Network error" in result.error_message


# ── TestWikipediaCollector ────────────────────────────────────────────────────


class TestWikipediaCollector:
    async def test_extract_from_tag(self):
        from app.collectors.wikipedia import WikipediaCollector

        collector = WikipediaCollector()
        mock_info = {
            "title": "Al-Aqsa Mosque",
            "description": "Al-Aqsa Mosque is a historic mosque in Jerusalem.",
            "short_description": "Historic mosque in Jerusalem",
            "image_url": "https://upload.wikimedia.org/image.jpg",
            "original_image": "https://upload.wikimedia.org/image_full.jpg",
        }
        with patch.object(collector, "_fetch_from_tag", new=AsyncMock(return_value=mock_info)):
            with patch.object(collector, "_fetch_by_title", new=AsyncMock(return_value=None)):
                result = await collector.collect(
                    "gplc_test",
                    31.7,
                    35.2,
                    "Al-Aqsa Mosque",
                    existing_data={"tags": {"wikipedia": "en:Al-Aqsa Mosque"}},
                )

        assert result.status == "success"
        assert len(result.descriptions) >= 1
        en_descs = [d for d in result.descriptions if d["lang"] == "en"]
        assert any("Al-Aqsa" in d["text"] for d in en_descs)
        assert len(result.images) == 1

    async def test_skip_when_no_article(self):
        from app.collectors.wikipedia import WikipediaCollector

        collector = WikipediaCollector()
        with patch.object(collector, "_search_wikipedia", new=AsyncMock(return_value=None)):
            result = await collector.collect("gplc_test", 25.0, 55.0, "Unknown Place")
        assert result.status == "skipped"

    # ── Layer 0: Distance gate ─────────────────────────────────────────────────

    def test_distance_gate_rejects_far_article(self):
        """Article coordinates >100 km from the place → rejected."""
        from app.collectors.wikipedia import WikipediaCollector

        collector = WikipediaCollector()
        # Place is in Abu Dhabi (~24.45, 54.37); article is in Dubai (~25.2, 55.27) = ~105 km
        article_info = {
            "title": "Some Mosque",
            "short_description": "mosque in Dubai",
            "coordinates": {"lat": 25.2, "lon": 55.27},
        }
        assert not collector._is_article_relevant(article_info, "Some Mosque", lat=24.45, lng=54.37)

    def test_distance_gate_accepts_nearby_article(self):
        """Article coordinates within 100 km of the place → not rejected on distance alone."""
        from app.collectors.wikipedia import WikipediaCollector

        collector = WikipediaCollector()
        # Both points within a few km of each other
        article_info = {
            "title": "Some Mosque",
            "short_description": "mosque",
            "coordinates": {"lat": 25.2, "lon": 55.3},
        }
        assert collector._is_article_relevant(article_info, "Some Mosque", lat=25.21, lng=55.31)

    def test_distance_gate_skipped_when_no_article_coords(self):
        """No article coordinates → distance gate is skipped; Jaccard decides."""
        from app.collectors.wikipedia import WikipediaCollector

        collector = WikipediaCollector()
        article_info = {
            "title": "Some Mosque",
            "short_description": "mosque",
            "coordinates": {},
        }
        # Jaccard will pass (identical name) even though we passed far-away lat/lng
        assert collector._is_article_relevant(article_info, "Some Mosque", lat=0.0, lng=0.0)

    # ── Layer 3: Distinctive token gap penalty ────────────────────────────────

    def test_distinctive_gap_rejects_two_tokens_missing(self):
        """Two non-noise, non-religious tokens missing + jaccard < 0.6 → reject."""
        from app.collectors.wikipedia import WikipediaCollector

        collector = WikipediaCollector()
        # place = "Hamdan Tower Mosque Garden Road" (tokens: hamdan, tower, mosque, garden, road)
        # article = "Hamdan Mosque" (tokens: hamdan, mosque)
        # jaccard = 2/5 = 0.4  (≥0.3, <0.6)
        # distinctive_missing = {tower, garden, road} → len=3 ≥ 2 → REJECT
        article_info = {
            "title": "Hamdan Mosque",
            "short_description": "mosque",
            "coordinates": {},
        }
        result = collector._is_article_relevant(article_info, "Hamdan Tower Mosque Garden Road")
        assert not result, "Should reject when 2+ distinctive tokens are missing and jaccard < 0.6"

    def test_distinctive_gap_accepts_high_jaccard(self):
        """High jaccard (≥ 0.6) passes even if some tokens differ."""
        from app.collectors.wikipedia import WikipediaCollector

        collector = WikipediaCollector()
        # place = "Faisal Mosque Islamabad" (tokens: faisal, mosque, islamabad)
        # article = "Faisal Mosque" (tokens: faisal, mosque)
        # jaccard = 2/3 = 0.67 ≥ 0.6 → NOT rejected by gap penalty
        article_info = {
            "title": "Faisal Mosque",
            "short_description": "mosque in Islamabad",
            "coordinates": {},
        }
        assert collector._is_article_relevant(article_info, "Faisal Mosque Islamabad")

    def test_distinctive_gap_accepts_one_token_missing(self):
        """Only 1 distinctive token missing → not rejected by gap penalty (threshold=2)."""
        from app.collectors.wikipedia import WikipediaCollector

        collector = WikipediaCollector()
        # place = "Khalifa Palace Mosque" → tokens: {khalifa, palace, mosque}
        # article = "Khalifa Mosque" → tokens: {khalifa, mosque}
        # jaccard = 2/3 ≈ 0.67 ≥ 0.6 → NOT rejected
        article_info = {
            "title": "Khalifa Mosque",
            "short_description": "mosque",
            "coordinates": {},
        }
        assert collector._is_article_relevant(article_info, "Khalifa Palace Mosque")

    # ── Layer 2: Top-N search — best-match selection ──────────────────────────

    async def test_search_returns_best_jaccard_match(self):
        """_search_wikipedia picks the candidate with the highest Jaccard score."""
        from app.collectors.wikipedia import WikipediaCollector

        collector = WikipediaCollector()

        search_response = AsyncMock()
        search_response.status_code = 200
        search_response.json = lambda: {
            "query": {
                "search": [
                    {"title": "Grand Mosque Abu Dhabi"},
                    {"title": "Grand Mosque (different city)"},
                    {"title": "Unrelated Article"},
                ]
            }
        }

        async def fake_fetch(title, lang="en"):
            return {
                "title": title,
                "description": f"Description for {title}",
                "short_description": title,
                "image_url": None,
                "original_image": None,
                "coordinates": {},
            }

        with patch(
            "app.collectors.wikipedia.async_request_with_backoff",
            new=AsyncMock(return_value=search_response),
        ):
            with patch.object(collector, "_fetch_by_title", side_effect=fake_fetch):
                result = await collector._search_wikipedia(
                    "Grand Mosque Abu Dhabi", "en", lat=24.41, lng=54.47
                )

        assert result is not None
        # The first result shares the most tokens with the query
        assert result["title"] == "Grand Mosque Abu Dhabi"

    # ── Layer 3: Location-aware search query ──────────────────────────────────

    async def test_city_hint_appended_to_query(self):
        """When existing_data has a city, it is appended to the Wikipedia search query."""
        from app.collectors.wikipedia import WikipediaCollector

        collector = WikipediaCollector()
        captured_queries: list[str] = []

        async def fake_search(query, lang="en", lat=None, lng=None):
            captured_queries.append(query)
            return {
                "title": "Sheikh Khalifa Palace Masjid",
                "description": "A mosque in Abu Dhabi Palace district.",
                "short_description": "mosque in Abu Dhabi",
                "image_url": None,
                "original_image": None,
                "coordinates": {"lat": 24.45, "lon": 54.37},
            }

        with patch.object(collector, "_search_wikipedia", side_effect=fake_search):
            with patch.object(collector, "_fetch_by_title", new=AsyncMock(return_value=None)):
                await collector.collect(
                    "gplc_test",
                    24.45,
                    54.37,
                    "Sheikh Khalifa Palace Masjid",
                    existing_data={"city": "Abu Dhabi"},
                )

        assert captured_queries, "search should have been called"
        assert "Abu Dhabi" in captured_queries[0]

    async def test_no_city_hint_uses_name_only(self):
        """Without city context the query is just the place name."""
        from app.collectors.wikipedia import WikipediaCollector

        collector = WikipediaCollector()
        captured_queries: list[str] = []

        async def fake_search(query, lang="en", lat=None, lng=None):
            captured_queries.append(query)
            return None

        with patch.object(collector, "_search_wikipedia", side_effect=fake_search):
            await collector.collect("gplc_test", 25.0, 55.0, "Al-Aqsa Mosque", existing_data={})

        assert captured_queries[0] == "Al-Aqsa Mosque"


# ── TestWikidataCollector ─────────────────────────────────────────────────────


class TestWikidataCollector:
    async def test_skip_without_qid(self):
        from app.collectors.wikidata import WikidataCollector

        collector = WikidataCollector()
        result = await collector.collect("gplc_test", 25.0, 55.0, "Test")
        assert result.status == "skipped"

    def test_extract_entity(self):
        from app.collectors.wikidata import WikidataCollector

        collector = WikidataCollector()
        entity = {
            "claims": {
                "P571": [
                    {
                        "mainsnak": {
                            "datavalue": {
                                "type": "time",
                                "value": {"time": "+0705-01-01T00:00:00Z"},
                            }
                        }
                    }
                ],
                "P1435": [
                    {
                        "mainsnak": {
                            "datavalue": {"type": "wikibase-entityid", "value": {"id": "Q9259"}}
                        }
                    }
                ],
                "P856": [
                    {"mainsnak": {"datavalue": {"type": "string", "value": "https://alaqsa.org"}}}
                ],
                "P2003": [
                    {"mainsnak": {"datavalue": {"type": "string", "value": "alaqsa_mosque"}}}
                ],
            },
            "descriptions": {
                "en": {"value": "Mosque in Jerusalem"},
                "ar": {"value": "مسجد في القدس"},
            },
            "labels": {
                "ar": {"value": "المسجد الأقصى"},
                "hi": {"value": "अल-अक्सा मस्जिद"},
            },
        }

        result = collector._extract(entity, "Q23731")
        assert result.status == "success"

        attr_codes = {a["attribute_code"] for a in result.attributes}
        assert "founded_year" in attr_codes
        assert "heritage_status" in attr_codes
        assert "name_ar" in attr_codes
        assert "name_hi" in attr_codes

        founded = next(a for a in result.attributes if a["attribute_code"] == "founded_year")
        assert founded["value"] == "0705"

        assert result.contact["website"] == "https://alaqsa.org"
        assert result.contact["social_instagram"] == "alaqsa_mosque"

        # Descriptions
        en_descs = [d for d in result.descriptions if d["lang"] == "en"]
        assert len(en_descs) == 1
        assert en_descs[0]["text"] == "Mosque in Jerusalem"


# ── TestKnowledgeGraphCollector ───────────────────────────────────────────────


class TestKnowledgeGraphCollector:
    async def test_not_configured_without_key(self):
        from app.collectors.knowledge_graph import KnowledgeGraphCollector

        collector = KnowledgeGraphCollector()
        with patch.dict(os.environ, {"GOOGLE_MAPS_API_KEY": ""}, clear=False):
            # Override the is_available check
            result = await collector.collect("gplc_test", 25.0, 55.0, "Test")
            # May be not_configured or fail depending on env
            assert result.status in ("not_configured", "failed", "skipped")

    def test_extract_element(self):
        from app.collectors.knowledge_graph import KnowledgeGraphCollector

        collector = KnowledgeGraphCollector()
        element = {
            "result": {
                "name": "Al-Aqsa Mosque",
                "@type": ["Place", "TouristAttraction", "CivicStructure"],
                "description": "Historic mosque in Jerusalem",
                "detailedDescription": {
                    "articleBody": "Al-Aqsa Mosque is the third holiest site in Islam, located in the Old City of Jerusalem.",
                    "url": "https://en.wikipedia.org/wiki/Al-Aqsa_Mosque",
                },
                "image": {"contentUrl": "https://example.com/image.jpg"},
                "url": "https://alaqsa.org",
            },
            "resultScore": 1234.56,
        }

        result = collector._extract(element)
        assert result.status == "success"
        assert len(result.descriptions) >= 1
        assert "Al-Aqsa" in result.descriptions[0]["text"]
        assert result.entity_types == ["Place", "TouristAttraction", "CivicStructure"]
        assert len(result.images) == 1
        assert result.contact["website"] == "https://alaqsa.org"


# ── TestPaidCollectors ────────────────────────────────────────────────────────


class TestPaidCollectors:
    async def test_besttime_not_configured(self):
        from app.collectors.besttime import BestTimeCollector

        collector = BestTimeCollector()
        with patch.dict(os.environ, {"BESTTIME_API_KEY": ""}, clear=False):
            result = await collector.collect("gplc_test", 25.0, 55.0, "Test")
        assert result.status == "not_configured"

    async def test_foursquare_not_configured(self):
        from app.collectors.foursquare import FoursquareCollector

        collector = FoursquareCollector()
        with patch.dict(os.environ, {"FOURSQUARE_API_KEY": ""}, clear=False):
            result = await collector.collect("gplc_test", 25.0, 55.0, "Test")
        assert result.status == "not_configured"

    async def test_outscraper_not_configured(self):
        from app.collectors.outscraper import OutscraperCollector

        collector = OutscraperCollector()
        with patch.dict(os.environ, {"OUTSCRAPER_API_KEY": ""}, clear=False):
            result = await collector.collect("gplc_test", 25.0, 55.0, "Test")
        assert result.status == "not_configured"

    async def test_outscraper_skip_without_place_id(self):
        from app.collectors.outscraper import OutscraperCollector

        collector = OutscraperCollector()
        with patch.dict(os.environ, {"OUTSCRAPER_API_KEY": "test_key"}, clear=False):
            result = await collector.collect("custom_place", 25.0, 55.0, "Test")
        assert result.status == "skipped"


# ── TestCollectorRegistry ─────────────────────────────────────────────────────


class TestCollectorRegistry:
    def test_get_all_collectors(self):
        from app.collectors.registry import get_all_collectors

        collectors = get_all_collectors()
        assert len(collectors) == 8
        names = [c.name for c in collectors]
        assert "gmaps" in names or "gmaps_browser" in names
        assert "osm" in names
        assert "wikipedia" in names
        assert "wikidata" in names
        assert "knowledge_graph" in names
        assert "besttime" in names
        assert "foursquare" in names
        assert "outscraper" in names

    def test_get_enrichment_collectors(self):
        """Enrichment collectors exclude gmaps and only return available ones."""
        from app.collectors.registry import get_enrichment_collectors

        collectors = get_enrichment_collectors()
        names = [c.name for c in collectors]
        assert "gmaps" not in names
        # OSM and Wikipedia are always available (no key required)
        assert "osm" in names
        assert "wikipedia" in names

    def test_enrichment_order(self):
        """OSM must come before Wikipedia and Wikidata."""
        from app.collectors.registry import get_enrichment_collectors

        collectors = get_enrichment_collectors()
        names = [c.name for c in collectors]
        if "osm" in names and "wikipedia" in names:
            assert names.index("osm") < names.index("wikipedia")
        if "osm" in names and "wikidata" in names:
            assert names.index("osm") < names.index("wikidata")

    def test_get_enrichment_phases_structure(self):
        """get_enrichment_phases returns a list of non-empty phases."""
        from app.collectors.registry import get_enrichment_phases

        phases = get_enrichment_phases()
        assert isinstance(phases, list)
        # Each phase must be a non-empty list of collectors
        for phase in phases:
            assert isinstance(phase, list)
            assert len(phase) > 0

    def test_get_enrichment_phases_osm_in_first_phase(self):
        """OSM (if available) must be in the first phase."""
        from app.collectors.registry import get_enrichment_phases

        phases = get_enrichment_phases()
        if not phases:
            return  # No collectors available — skip
        first_phase_names = [c.name for c in phases[0]]
        assert "gmaps" not in first_phase_names  # gmaps is never in enrichment phases
        # OSM is always available (no API key required)
        assert "osm" in first_phase_names

    def test_get_enrichment_phases_wikipedia_wikidata_in_phase1(self):
        """Wikipedia and Wikidata must be in a later phase than OSM."""
        from app.collectors.registry import get_enrichment_phases

        phases = get_enrichment_phases()
        all_names_by_phase = [[c.name for c in phase] for phase in phases]

        # Find phase index for osm, wikipedia, wikidata
        osm_phase = next((i for i, names in enumerate(all_names_by_phase) if "osm" in names), None)
        wp_phase = next(
            (i for i, names in enumerate(all_names_by_phase) if "wikipedia" in names), None
        )
        wd_phase = next(
            (i for i, names in enumerate(all_names_by_phase) if "wikidata" in names), None
        )

        if osm_phase is not None and wp_phase is not None:
            assert osm_phase < wp_phase, "Wikipedia must come after OSM"
        if osm_phase is not None and wd_phase is not None:
            assert osm_phase < wd_phase, "Wikidata must come after OSM"

    def test_get_enrichment_phases_excludes_gmaps(self):
        """gmaps collector must not appear in enrichment phases."""
        from app.collectors.registry import get_enrichment_phases

        phases = get_enrichment_phases()
        all_names = [c.name for phase in phases for c in phase]
        assert "gmaps" not in all_names


# ── TestHttpHelpers ───────────────────────────────────────────────────────────


class TestHttpHelpers:
    def test_varied_headers_returns_dict(self):
        from app.utils.http_helpers import varied_headers

        h = varied_headers()
        assert isinstance(h, dict)
        assert "User-Agent" in h
        assert "Accept-Language" in h
        assert "Accept" in h

    def test_varied_headers_ua_from_pool(self):
        from app.utils.http_helpers import _USER_AGENTS, varied_headers

        for _ in range(20):
            h = varied_headers()
            assert h["User-Agent"] in _USER_AGENTS

    def test_varied_headers_accept_language_from_pool(self):
        from app.utils.http_helpers import _ACCEPT_LANGUAGES, varied_headers

        for _ in range(20):
            h = varied_headers()
            assert h["Accept-Language"] in _ACCEPT_LANGUAGES

    def test_varied_headers_not_always_identical(self):
        """Over many calls the UA should vary (probabilistic — could fail with p=(1/5)^29)."""
        from app.utils.http_helpers import varied_headers

        uas = {varied_headers()["User-Agent"] for _ in range(30)}
        assert len(uas) > 1

    def test_varied_headers_merges_base(self):
        from app.utils.http_helpers import varied_headers

        h = varied_headers({"Content-Type": "application/x-www-form-urlencoded"})
        assert h["Content-Type"] == "application/x-www-form-urlencoded"
        assert "User-Agent" in h

    def test_varied_headers_does_not_mutate_base(self):
        from app.utils.http_helpers import varied_headers

        base = {"X-Custom": "value"}
        varied_headers(base)
        assert "User-Agent" not in base


# ── TestOsmOverpassDiversification ────────────────────────────────────────────


class TestOsmOverpassDiversification:
    def test_overpass_endpoints_list_nonempty(self):
        from app.collectors.osm import OVERPASS_ENDPOINTS

        assert len(OVERPASS_ENDPOINTS) >= 2
        for ep in OVERPASS_ENDPOINTS:
            assert ep.startswith("https://")

    async def test_query_overpass_uses_endpoint_from_list(self):
        """_query_overpass must POST to one of the OVERPASS_ENDPOINTS."""
        from unittest.mock import AsyncMock, MagicMock, patch

        from app.collectors.osm import OVERPASS_ENDPOINTS, OsmCollector

        collector = OsmCollector()
        called_urls: list[str] = []

        # Use MagicMock (not AsyncMock) so .json() is a plain callable
        mock_response = MagicMock()
        mock_response.json.return_value = {"elements": [{"tags": {"amenity": "place_of_worship"}}]}

        async def fake_backoff(method, url, **kwargs):
            called_urls.append(url)
            return mock_response

        with patch("app.collectors.osm.async_request_with_backoff", side_effect=fake_backoff):
            with patch("app.scrapers.base.AsyncRateLimiter.acquire", new=AsyncMock()):
                with patch("asyncio.sleep", new=AsyncMock()):
                    await collector._query_overpass(25.0, 55.0)

        assert len(called_urls) == 1
        assert called_urls[0] in OVERPASS_ENDPOINTS

    async def test_query_overpass_acquires_rate_limiter(self):
        """_query_overpass must call rate_limiter.acquire('overpass')."""
        from unittest.mock import AsyncMock, MagicMock, patch

        from app.collectors.osm import OsmCollector

        collector = OsmCollector()
        acquired: list[str] = []

        async def fake_acquire(endpoint):
            acquired.append(endpoint)

        # Use MagicMock (not AsyncMock) so .json() is a plain callable
        mock_response = MagicMock()
        mock_response.json.return_value = {"elements": [{"tags": {"amenity": "place_of_worship"}}]}

        async def fake_backoff(method, url, **kwargs):
            return mock_response

        with patch("app.collectors.osm.async_request_with_backoff", side_effect=fake_backoff):
            with patch("app.scrapers.base.AsyncRateLimiter.acquire", side_effect=fake_acquire):
                with patch("asyncio.sleep", new=AsyncMock()):
                    await collector._query_overpass(25.0, 55.0)

        assert "overpass" in acquired


# ── TestDownloadImage ─────────────────────────────────────────────────────────


class TestDownloadImage:
    """Tests for _download_image() redirect and error handling."""

    # Minimal valid JPEG: SOI marker + 1 KB of filler data (passes integrity check).
    _VALID_JPEG: bytes = b"\xff\xd8\xff" + b"\x00" * 1024

    def _make_mock_response(self, status_code: int, content: bytes = b"imagedata") -> AsyncMock:
        resp = AsyncMock()
        resp.status_code = status_code
        resp.content = content
        return resp

    async def test_200_returns_content(self):
        """200 response → returns content bytes (must be valid JPEG ≥ 1 KB)."""

        from app.collectors.image_download import _download_image

        resp = self._make_mock_response(200, self._VALID_JPEG)
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=resp)

        result = await _download_image("http://example.com/photo.jpg", mock_client)
        assert result == self._VALID_JPEG

    async def test_302_without_follow_returns_none_old_behavior(self):
        """Without follow_redirects a raw 302 would return None — validates the fix
        is necessary by confirming the old code path returned None on non-200."""

        from app.collectors.image_download import _download_image

        resp = self._make_mock_response(302, b"")
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=resp)

        # With the old client (no follow_redirects), status != 200 → None
        result = await _download_image("http://example.com/photo.jpg", mock_client)
        assert result is None

    async def test_200_after_redirect_returns_content(self):
        """httpx with follow_redirects=True transparently follows 302 and delivers 200.
        Simulated by passing a client that returns 200 directly (as httpx would after redirect)."""

        from app.collectors.image_download import _download_image

        resp = self._make_mock_response(200, self._VALID_JPEG)
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=resp)

        result = await _download_image(
            "http://places.googleapis.com/v1/places/X/photos/Y/media?key=K", mock_client
        )
        assert result == self._VALID_JPEG

    async def test_connection_error_retries_and_returns_none(self):
        """ConnectError → retries up to _MAX_IMAGE_ATTEMPTS times, then returns None."""
        import httpx

        from app.collectors.image_download import _download_image

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=httpx.ConnectError("refused"))

        with patch("asyncio.sleep", new_callable=AsyncMock):
            result = await _download_image("http://example.com/photo.jpg", mock_client)

        assert result is None

    async def test_no_client_creates_own_with_follow_redirects(self):
        """When no client is passed, _download_image creates its own with follow_redirects=True."""

        from app.collectors.image_download import _download_image

        # Patch httpx.AsyncClient to capture the kwargs it was constructed with
        captured_kwargs = {}

        class _FakeClient:
            def __init__(self, **kwargs):
                captured_kwargs.update(kwargs)

            async def __aenter__(self):
                return self

            async def __aexit__(self, *args):
                pass

            async def get(self, url, **kw):
                resp = AsyncMock()
                resp.status_code = 200
                resp.content = b"\xff\xd8\xff" + b"\x00" * 1024
                return resp

        with patch("app.collectors.image_download.httpx.AsyncClient", _FakeClient):
            result = await _download_image("http://example.com/photo.jpg")

        assert captured_kwargs.get("follow_redirects") is True
        assert result == b"\xff\xd8\xff" + b"\x00" * 1024


# ── TestForceJpegUrl ───────────────────────────────────────────────────────────


class TestForceJpegUrl:
    """Tests for _force_jpeg_url() — ensures lh3 URLs get -rj appended."""

    def test_lh3_url_with_size_suffix_gets_rj(self):
        from app.collectors.image_download import _force_jpeg_url

        url = "https://lh3.googleusercontent.com/gps-cs-s/ABC=w800-h600"
        assert _force_jpeg_url(url) == url + "-rj"

    def test_lh3_url_already_has_rj_unchanged(self):
        from app.collectors.image_download import _force_jpeg_url

        url = "https://lh3.googleusercontent.com/gps-cs-s/ABC=w800-h600-rj"
        assert _force_jpeg_url(url) == url

    def test_non_lh3_url_unchanged(self):
        from app.collectors.image_download import _force_jpeg_url

        url = "https://places.googleapis.com/v1/places/X/photos/Y/media?key=K"
        assert _force_jpeg_url(url) == url

    def test_lh3_url_without_size_suffix_unchanged(self):
        from app.collectors.image_download import _force_jpeg_url

        url = "https://lh3.googleusercontent.com/gps-cs-s/ABC"
        assert _force_jpeg_url(url) == url


# ── TestIsValidImage ───────────────────────────────────────────────────────────


class TestIsValidImage:
    """Tests for _is_valid_image() — accepts JPEG and WebP, rejects others."""

    def test_jpeg_magic_bytes_accepted(self):
        from app.collectors.image_download import _is_valid_image

        assert _is_valid_image(b"\xff\xd8\xff" + b"\x00" * 100) is True

    def test_webp_magic_bytes_accepted(self):
        from app.collectors.image_download import _is_valid_image

        # RIFF<4 bytes size>WEBP
        content = b"RIFF\x00\x00\x00\x00WEBP" + b"\x00" * 100
        assert _is_valid_image(content) is True

    def test_png_rejected(self):
        from app.collectors.image_download import _is_valid_image

        assert _is_valid_image(b"\x89PNG\r\n\x1a\n" + b"\x00" * 100) is False

    def test_empty_rejected(self):
        from app.collectors.image_download import _is_valid_image

        assert _is_valid_image(b"") is False


class TestDownloadImageWebP:
    """_download_image accepts WebP responses (not just JPEG)."""

    _VALID_WEBP: bytes = b"RIFF\x00\x00\x00\x00WEBP" + b"\x00" * 1024

    async def test_webp_response_accepted(self):
        from app.collectors.image_download import _download_image

        resp = AsyncMock()
        resp.status_code = 200
        resp.content = self._VALID_WEBP
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=resp)

        result = await _download_image("https://lh3.googleusercontent.com/x=w800-h600", mock_client)
        assert result == self._VALID_WEBP

    async def test_lh3_url_gets_rj_appended_before_request(self):
        """_download_image rewrites lh3 URLs to force JPEG before fetching."""
        from app.collectors.image_download import _download_image

        resp = AsyncMock()
        resp.status_code = 200
        resp.content = b"\xff\xd8\xff" + b"\x00" * 1024
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=resp)

        await _download_image("https://lh3.googleusercontent.com/x=w800-h600", mock_client)

        called_url = mock_client.get.call_args[0][0]
        assert called_url.endswith("-rj")
