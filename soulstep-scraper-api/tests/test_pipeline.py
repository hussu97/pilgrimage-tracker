"""
Unit tests for the enrichment pipeline (quality scoring, merger logic).
"""

import os
import sys
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


# ── TestGenericNameSkip ───────────────────────────────────────────────────────


class TestGenericNameSkip:
    def test_bare_mosque_is_generic(self):
        from app.pipeline.enrichment import _is_generic_name

        assert _is_generic_name("Mosque") is True
        assert _is_generic_name("mosque") is True
        assert _is_generic_name("MOSQUE") is True

    def test_bare_masjid_variants(self):
        from app.pipeline.enrichment import _is_generic_name

        assert _is_generic_name("Masjid") is True
        assert _is_generic_name("Masjed") is True

    def test_with_leading_article(self):
        from app.pipeline.enrichment import _is_generic_name

        assert _is_generic_name("The Mosque") is True
        assert _is_generic_name("The Church") is True
        assert _is_generic_name("Al Masjid") is True
        assert _is_generic_name("Al-Masjid") is True
        assert _is_generic_name("El Dargah") is True

    def test_other_generic_types(self):
        from app.pipeline.enrichment import _is_generic_name

        assert _is_generic_name("Church") is True
        assert _is_generic_name("Temple") is True
        assert _is_generic_name("Shrine") is True
        assert _is_generic_name("Gurudwara") is True
        assert _is_generic_name("Synagogue") is True
        assert _is_generic_name("Monastery") is True

    def test_specific_names_are_not_generic(self):
        from app.pipeline.enrichment import _is_generic_name

        assert _is_generic_name("Al-Aqsa Mosque") is False
        assert _is_generic_name("Grand Mosque") is False
        assert _is_generic_name("Hagia Sophia") is False
        assert _is_generic_name("Church of the Holy Sepulchre") is False
        assert _is_generic_name("Jama Masjid Delhi") is False
        assert _is_generic_name("Blue Mosque") is False

    def test_whitespace_handling(self):
        from app.pipeline.enrichment import _is_generic_name

        assert _is_generic_name("  Mosque  ") is True
        assert _is_generic_name("  Al Masjid  ") is True


# ── TestQualityScoring ────────────────────────────────────────────────────────


class TestQualityScoring:
    def test_score_empty_text(self):
        from app.pipeline.quality import score_description

        assert score_description("", "wikipedia") == 0.0
        assert score_description("  ", "wikipedia") == 0.0

    def test_score_wikipedia_long_specific(self):
        from app.pipeline.quality import score_description

        text = (
            "Al-Aqsa Mosque is the third holiest site in Islam, located in the Old City "
            "of Jerusalem. It was built in the 7th century and has been a pilgrimage "
            "destination for over 1300 years. The mosque features a large silver dome "
            "and can accommodate thousands of worshippers. It holds deep religious "
            "significance for Muslims worldwide as the site of Prophet Muhammad's "
            "Night Journey."
        )
        score = score_description(text, "wikipedia", "Al-Aqsa Mosque")
        # Wikipedia source (0.4) + long text (0.3) + mentions name (0.15) + keywords
        assert score > 0.7

    def test_score_gmaps_editorial_short(self):
        from app.pipeline.quality import score_description

        text = "Historic mosque"
        score = score_description(text, "gmaps_editorial", "Al-Aqsa Mosque")
        # Editorial (0.35) + short text (0.05) + no name mention
        assert score < 0.5

    def test_source_reliability_ordering(self):
        from app.pipeline.quality import score_description

        text = (
            "A moderate length description that is about 50 characters or so for testing purposes"
        )
        wp_score = score_description(text, "wikipedia")
        ed_score = score_description(text, "gmaps_editorial")
        kg_score = score_description(text, "knowledge_graph")
        gen_score = score_description(text, "gmaps_generative")

        assert wp_score > ed_score
        assert ed_score > kg_score
        assert kg_score > gen_score

    def test_length_scoring_tiers(self):
        from app.pipeline.quality import score_description

        short = "Hello world"  # < 30 chars
        medium = "A description that is definitely more than thirty characters but under one hundred."  # 30-100
        long_text = "x" * 101  # 100-300
        very_long = "x" * 301  # > 300

        s1 = score_description(short, "wikipedia")
        s2 = score_description(medium, "wikipedia")
        s3 = score_description(long_text, "wikipedia")
        s4 = score_description(very_long, "wikipedia")

        assert s1 < s2 < s3 < s4


class TestAssessDescriptions:
    async def test_empty_candidates(self):
        from app.pipeline.quality import assess_descriptions

        result = await assess_descriptions([])
        assert result["text"] == ""
        assert result["source"] == "none"

    async def test_single_candidate(self):
        from app.pipeline.quality import assess_descriptions

        candidates = [
            {"text": "A mosque in Jerusalem", "lang": "en", "source": "wikipedia", "score": None}
        ]
        result = await assess_descriptions(candidates, "Al-Aqsa Mosque")
        assert result["text"] == "A mosque in Jerusalem"
        assert result["source"] == "wikipedia"
        assert result["method"] == "heuristic"

    async def test_wikipedia_beats_editorial(self):
        from app.pipeline.quality import assess_descriptions

        candidates = [
            {
                "text": "Al-Aqsa Mosque is the third holiest site in Islam, built in the 7th century as a pilgrimage destination for over 1300 years.",
                "lang": "en",
                "source": "wikipedia",
                "score": None,
            },
            {
                "text": "Historic mosque",
                "lang": "en",
                "source": "gmaps_editorial",
                "score": None,
            },
        ]
        result = await assess_descriptions(candidates, "Al-Aqsa Mosque")
        assert result["source"] == "wikipedia"

    async def test_filters_to_english(self):
        """Non-English candidates should not affect the primary description choice."""
        from app.pipeline.quality import assess_descriptions

        candidates = [
            {"text": "A mosque", "lang": "en", "source": "wikipedia", "score": None},
            {"text": "مسجد", "lang": "ar", "source": "wikipedia", "score": None},
        ]
        result = await assess_descriptions(candidates, "Test Mosque")
        assert result["text"] == "A mosque"

    async def test_llm_tiebreak_not_triggered_without_key(self):
        """LLM should not be called when ANTHROPIC_API_KEY is not set."""
        from app.pipeline.quality import assess_descriptions

        candidates = [
            {
                "text": "Description A about a historical mosque with significance",
                "lang": "en",
                "source": "wikipedia",
                "score": None,
            },
            {
                "text": "Description B about a historical mosque with heritage",
                "lang": "en",
                "source": "knowledge_graph",
                "score": None,
            },
        ]
        with patch.dict(os.environ, {"ANTHROPIC_API_KEY": ""}, clear=False):
            result = await assess_descriptions(candidates, "Test Mosque")
        assert result["method"] == "heuristic"


# ── TestMerger ────────────────────────────────────────────────────────────────


class TestMerger:
    async def test_merge_empty_results(self):
        from app.pipeline.merger import merge_collector_results

        base = {"name": "Test", "description": "Original", "attributes": [], "external_reviews": []}
        merged = await merge_collector_results(base, {}, "Test")
        assert merged["name"] == "Test"
        assert merged["description"] == "Original"

    async def test_merge_descriptions(self):
        from app.collectors.base import CollectorResult
        from app.pipeline.merger import merge_collector_results

        base = {
            "name": "Test Mosque",
            "description": "Original short desc",
            "attributes": [],
            "external_reviews": [],
        }

        wp_result = CollectorResult(collector_name="wikipedia")
        wp_result.descriptions = [
            {
                "text": "Test Mosque is a historic mosque with rich cultural heritage, built in the 14th century as a center of worship and pilgrimage.",
                "lang": "en",
                "source": "wikipedia",
                "score": None,
            },
            {
                "text": "مسجد تاريخي",
                "lang": "ar",
                "source": "wikipedia",
                "score": None,
            },
        ]

        merged = await merge_collector_results(base, {"wikipedia": wp_result}, "Test Mosque")
        # Wikipedia should win over the short original
        assert "Test Mosque" in merged["description"]
        assert merged["_description_source"] == "wikipedia"
        assert merged["translations"]["description"]["ar"] == "مسجد تاريخي"

    async def test_merge_contact_priority(self):
        """gmaps contact should take priority over OSM."""
        from app.collectors.base import CollectorResult
        from app.pipeline.merger import merge_collector_results

        base = {"name": "Test", "attributes": [], "external_reviews": []}

        gmaps_result = CollectorResult(collector_name="gmaps")
        gmaps_result.contact = {"phone_national": "+1-555-0100"}

        osm_result = CollectorResult(collector_name="osm")
        osm_result.contact = {"phone_national": "+1-555-0200", "email": "info@test.com"}

        merged = await merge_collector_results(
            base, {"gmaps": gmaps_result, "osm": osm_result}, "Test"
        )

        attrs = {a["attribute_code"]: a["value"] for a in merged["attributes"]}
        assert attrs["phone_national"] == "+1-555-0100"  # gmaps wins
        assert attrs["email"] == "info@test.com"  # only in osm

    async def test_merge_attributes_union(self):
        """Attributes from multiple sources should be unioned."""
        from app.collectors.base import CollectorResult
        from app.pipeline.merger import merge_collector_results

        base = {
            "name": "Test",
            "attributes": [{"attribute_code": "rating", "value": 4.5}],
            "external_reviews": [],
        }

        osm_result = CollectorResult(collector_name="osm")
        osm_result.attributes = [
            {"attribute_code": "has_toilets", "value": True},
            {"attribute_code": "denomination", "value": "sunni"},
        ]

        merged = await merge_collector_results(base, {"osm": osm_result}, "Test")

        attr_codes = {a["attribute_code"] for a in merged["attributes"]}
        assert "rating" in attr_codes
        assert "has_toilets" in attr_codes
        assert "denomination" in attr_codes

    async def test_merge_boolean_true_wins(self):
        """For boolean attributes, True should win over False."""
        from app.collectors.base import CollectorResult
        from app.pipeline.merger import merge_collector_results

        base = {
            "name": "Test",
            "attributes": [{"attribute_code": "has_restroom", "value": False}],
            "external_reviews": [],
        }

        gmaps_result = CollectorResult(collector_name="gmaps")
        gmaps_result.attributes = [{"attribute_code": "has_restroom", "value": True}]

        merged = await merge_collector_results(base, {"gmaps": gmaps_result}, "Test")
        restroom = next(a for a in merged["attributes"] if a["attribute_code"] == "has_restroom")
        assert restroom["value"] is True

    async def test_merge_reviews_dedup(self):
        """Reviews from multiple sources should be deduplicated."""
        from app.collectors.base import CollectorResult
        from app.pipeline.merger import merge_collector_results

        base = {
            "name": "Test",
            "attributes": [],
            "external_reviews": [
                {"author_name": "User1", "text": "Great place to visit!", "rating": 5, "time": 0},
            ],
        }

        outscraper_result = CollectorResult(collector_name="outscraper")
        outscraper_result.reviews = [
            {"author_name": "User1", "text": "Great place to visit!", "rating": 5, "time": 0},
            {"author_name": "User2", "text": "Beautiful mosque", "rating": 4, "time": 0},
        ]

        merged = await merge_collector_results(base, {"outscraper": outscraper_result}, "Test")
        assert len(merged["external_reviews"]) == 2  # Deduped: User1 once + User2

    async def test_merge_images_dedup(self):
        """Images from multiple sources should be deduplicated."""
        from app.collectors.base import CollectorResult
        from app.pipeline.merger import merge_collector_results

        base = {
            "name": "Test",
            "attributes": [],
            "external_reviews": [],
            "image_urls": ["https://example.com/img1.jpg"],
        }

        wp_result = CollectorResult(collector_name="wikipedia")
        wp_result.images = [
            {"url": "https://example.com/img1.jpg", "source": "wikipedia"},  # dup
            {"url": "https://upload.wikimedia.org/img2.jpg", "source": "wikipedia"},
        ]

        merged = await merge_collector_results(base, {"wikipedia": wp_result}, "Test")
        assert len(merged["image_urls"]) == 2  # Original + 1 new

    async def test_merge_entity_types(self):
        """Entity types from knowledge graph should be stored."""
        from app.collectors.base import CollectorResult
        from app.pipeline.merger import merge_collector_results

        base = {"name": "Test", "attributes": [], "external_reviews": []}

        kg_result = CollectorResult(collector_name="knowledge_graph")
        kg_result.entity_types = ["Place", "TouristAttraction"]

        merged = await merge_collector_results(base, {"knowledge_graph": kg_result}, "Test")
        assert merged["entity_types"] == ["Place", "TouristAttraction"]
