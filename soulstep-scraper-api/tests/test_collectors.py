"""
Unit tests for all collectors (mocked HTTP responses).
"""

import os
import sys
from unittest.mock import patch

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

    def test_collect_no_data(self):
        from app.collectors.osm import OsmCollector

        collector = OsmCollector()
        with patch.object(collector, "_query_overpass", return_value={}):
            result = collector.collect("gplc_test", 25.0, 55.0, "Test Mosque")
        assert result.status == "skipped"

    def test_collect_exception(self):
        from app.collectors.osm import OsmCollector

        collector = OsmCollector()
        with patch.object(collector, "_query_overpass", side_effect=Exception("Network error")):
            result = collector.collect("gplc_test", 25.0, 55.0, "Test Mosque")
        assert result.status == "failed"
        assert "Network error" in result.error_message


# ── TestWikipediaCollector ────────────────────────────────────────────────────


class TestWikipediaCollector:
    def test_extract_from_tag(self):
        from app.collectors.wikipedia import WikipediaCollector

        collector = WikipediaCollector()
        mock_info = {
            "title": "Al-Aqsa Mosque",
            "description": "Al-Aqsa Mosque is a historic mosque in Jerusalem.",
            "short_description": "Historic mosque in Jerusalem",
            "image_url": "https://upload.wikimedia.org/image.jpg",
            "original_image": "https://upload.wikimedia.org/image_full.jpg",
        }
        with patch.object(collector, "_fetch_from_tag", return_value=mock_info):
            with patch.object(collector, "_fetch_by_title", return_value=None):
                result = collector.collect(
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

    def test_skip_when_no_article(self):
        from app.collectors.wikipedia import WikipediaCollector

        collector = WikipediaCollector()
        with patch.object(collector, "_search_wikipedia", return_value=None):
            result = collector.collect("gplc_test", 25.0, 55.0, "Unknown Place")
        assert result.status == "skipped"


# ── TestWikidataCollector ─────────────────────────────────────────────────────


class TestWikidataCollector:
    def test_skip_without_qid(self):
        from app.collectors.wikidata import WikidataCollector

        collector = WikidataCollector()
        result = collector.collect("gplc_test", 25.0, 55.0, "Test")
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
    def test_not_configured_without_key(self):
        from app.collectors.knowledge_graph import KnowledgeGraphCollector

        collector = KnowledgeGraphCollector()
        with patch.dict(os.environ, {"GOOGLE_MAPS_API_KEY": ""}, clear=False):
            # Override the is_available check
            result = collector.collect("gplc_test", 25.0, 55.0, "Test")
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
    def test_besttime_not_configured(self):
        from app.collectors.besttime import BestTimeCollector

        collector = BestTimeCollector()
        with patch.dict(os.environ, {"BESTTIME_API_KEY": ""}, clear=False):
            result = collector.collect("gplc_test", 25.0, 55.0, "Test")
        assert result.status == "not_configured"

    def test_foursquare_not_configured(self):
        from app.collectors.foursquare import FoursquareCollector

        collector = FoursquareCollector()
        with patch.dict(os.environ, {"FOURSQUARE_API_KEY": ""}, clear=False):
            result = collector.collect("gplc_test", 25.0, 55.0, "Test")
        assert result.status == "not_configured"

    def test_outscraper_not_configured(self):
        from app.collectors.outscraper import OutscraperCollector

        collector = OutscraperCollector()
        with patch.dict(os.environ, {"OUTSCRAPER_API_KEY": ""}, clear=False):
            result = collector.collect("gplc_test", 25.0, 55.0, "Test")
        assert result.status == "not_configured"

    def test_outscraper_skip_without_place_id(self):
        from app.collectors.outscraper import OutscraperCollector

        collector = OutscraperCollector()
        with patch.dict(os.environ, {"OUTSCRAPER_API_KEY": "test_key"}, clear=False):
            result = collector.collect("custom_place", 25.0, 55.0, "Test")
        assert result.status == "skipped"


# ── TestCollectorRegistry ─────────────────────────────────────────────────────


class TestCollectorRegistry:
    def test_get_all_collectors(self):
        from app.collectors.registry import get_all_collectors

        collectors = get_all_collectors()
        assert len(collectors) == 8
        names = [c.name for c in collectors]
        assert "gmaps" in names
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
