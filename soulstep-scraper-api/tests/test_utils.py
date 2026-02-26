"""
Tests for app/utils/extractors.py — pure logic, no DB or network required.
"""

from __future__ import annotations

from app.utils.extractors import (
    ContactExtractor,
    ReviewExtractor,
    make_description,
    parse_iso_to_unix,
)

# ─────────────────────────────────────────────────────────────────────────────
# parse_iso_to_unix
# ─────────────────────────────────────────────────────────────────────────────


class TestParseIsoToUnix:
    def test_valid_z_suffix(self):
        result = parse_iso_to_unix("2024-01-15T12:30:00Z")
        assert result == 1705321800

    def test_valid_utc_offset(self):
        result = parse_iso_to_unix("2024-01-15T12:30:00+00:00")
        assert result == 1705321800

    def test_empty_string(self):
        assert parse_iso_to_unix("") == 0

    def test_invalid_string(self):
        assert parse_iso_to_unix("not-a-date") == 0

    def test_none_like_empty(self):
        # Calling with empty string should return 0, not raise
        assert parse_iso_to_unix("") == 0


# ─────────────────────────────────────────────────────────────────────────────
# make_description
# ─────────────────────────────────────────────────────────────────────────────


class TestMakeDescription:
    def test_returns_correct_fields(self):
        d = make_description("A beautiful mosque.", "en", "wikipedia", 0.9)
        assert d["text"] == "A beautiful mosque."
        assert d["lang"] == "en"
        assert d["source"] == "wikipedia"
        assert d["score"] == 0.9

    def test_score_defaults_to_none(self):
        d = make_description("Some text", "ar", "wikidata")
        assert d["score"] is None

    def test_returns_description_dict_type(self):
        d = make_description("Text", "hi", "knowledge_graph")
        # DescriptionDict is a TypedDict — verify all keys present
        assert "text" in d and "lang" in d and "source" in d and "score" in d


# ─────────────────────────────────────────────────────────────────────────────
# ReviewExtractor.from_gmaps
# ─────────────────────────────────────────────────────────────────────────────


class TestReviewExtractorFromGmaps:
    def _make_review(self, text="Nice place", rating=5, time="2024-06-01T10:00:00Z"):
        return {
            "text": {"text": text},
            "rating": rating,
            "publishTime": time,
            "authorAttribution": {"displayName": "User A"},
            "relativePublishTimeDescription": "2 weeks ago",
        }

    def test_basic_extraction(self):
        reviews = [self._make_review()]
        result = ReviewExtractor.from_gmaps(reviews)
        assert len(result) == 1
        r = result[0]
        assert r["author_name"] == "User A"
        assert r["rating"] == 5
        assert r["text"] == "Nice place"
        assert r["language"] == "en"
        assert r["relative_time_description"] == "2 weeks ago"

    def test_nested_text_dict_unwrapped(self):
        reviews = [
            {
                "text": {"text": "Deep text"},
                "rating": 4,
                "publishTime": "2024-01-01T00:00:00Z",
                "authorAttribution": {"displayName": "B"},
                "relativePublishTimeDescription": "",
            }
        ]
        result = ReviewExtractor.from_gmaps(reviews)
        assert result[0]["text"] == "Deep text"

    def test_plain_string_text(self):
        reviews = [
            {
                "text": "Plain string",
                "rating": 3,
                "publishTime": "2024-01-01T00:00:00Z",
                "authorAttribution": {"displayName": "C"},
                "relativePublishTimeDescription": "",
            }
        ]
        result = ReviewExtractor.from_gmaps(reviews)
        assert result[0]["text"] == "Plain string"

    def test_empty_list(self):
        assert ReviewExtractor.from_gmaps([]) == []

    def test_limited_to_5_reviews(self):
        reviews = [self._make_review(f"text {i}") for i in range(10)]
        result = ReviewExtractor.from_gmaps(reviews)
        assert len(result) == 5

    def test_unix_time_parsed(self):
        reviews = [self._make_review(time="2024-01-15T12:30:00Z")]
        result = ReviewExtractor.from_gmaps(reviews)
        assert result[0]["time"] == 1705321800

    def test_bad_time_becomes_zero(self):
        reviews = [self._make_review(time="not-a-time")]
        result = ReviewExtractor.from_gmaps(reviews)
        assert result[0]["time"] == 0


# ─────────────────────────────────────────────────────────────────────────────
# ReviewExtractor.from_outscraper
# ─────────────────────────────────────────────────────────────────────────────


class TestReviewExtractorFromOutscraper:
    def _make_review(self):
        return {
            "author_title": "Jane",
            "review_rating": 4,
            "review_text": "Great atmosphere",
            "review_datetime_utc": "2024-03-10T08:00:00Z",
            "review_language": "en",
        }

    def test_basic_extraction(self):
        result = ReviewExtractor.from_outscraper([self._make_review()])
        assert len(result) == 1
        r = result[0]
        assert r["author_name"] == "Jane"
        assert r["rating"] == 4
        assert r["text"] == "Great atmosphere"
        assert r["language"] == "en"

    def test_time_parsed(self):
        result = ReviewExtractor.from_outscraper([self._make_review()])
        assert result[0]["time"] > 0

    def test_empty_list(self):
        assert ReviewExtractor.from_outscraper([]) == []

    def test_missing_fields_use_defaults(self):
        result = ReviewExtractor.from_outscraper([{}])
        assert result[0]["author_name"] == ""
        assert result[0]["rating"] == 0
        assert result[0]["text"] == ""
        assert result[0]["language"] == "en"
        assert result[0]["time"] == 0


# ─────────────────────────────────────────────────────────────────────────────
# ReviewExtractor.from_foursquare_tips
# ─────────────────────────────────────────────────────────────────────────────


class TestReviewExtractorFromFoursquareTips:
    def test_basic_extraction(self):
        tips = [{"created_by": "FQ User", "text": "Lovely spot", "lang": "fr"}]
        result = ReviewExtractor.from_foursquare_tips(tips)
        assert len(result) == 1
        r = result[0]
        assert r["author_name"] == "FQ User"
        assert r["rating"] == 0
        assert r["text"] == "Lovely spot"
        assert r["time"] == 0
        assert r["language"] == "fr"

    def test_empty_list(self):
        assert ReviewExtractor.from_foursquare_tips([]) == []

    def test_defaults_for_missing_fields(self):
        result = ReviewExtractor.from_foursquare_tips([{}])
        assert result[0]["author_name"] == "Foursquare User"
        assert result[0]["language"] == "en"


# ─────────────────────────────────────────────────────────────────────────────
# ContactExtractor.from_gmaps_response
# ─────────────────────────────────────────────────────────────────────────────


class TestContactExtractorFromGmaps:
    def test_full_extraction(self):
        response = {
            "nationalPhoneNumber": "+1 555-123",
            "internationalPhoneNumber": "+15551234567",
            "googleMapsUri": "https://maps.google.com/place?id=123",
            "websiteUri": "https://example.com",
        }
        contact = ContactExtractor.from_gmaps_response(response)
        assert contact["phone_national"] == "+1 555-123"
        assert contact["phone_international"] == "+15551234567"
        assert contact["google_maps_url"] == "https://maps.google.com/place?id=123"
        assert contact["website"] == "https://example.com"

    def test_missing_fields_omitted(self):
        contact = ContactExtractor.from_gmaps_response({})
        assert "phone_national" not in contact
        assert "website" not in contact

    def test_partial_response(self):
        contact = ContactExtractor.from_gmaps_response({"websiteUri": "https://x.com"})
        assert contact["website"] == "https://x.com"
        assert "phone_national" not in contact


# ─────────────────────────────────────────────────────────────────────────────
# ContactExtractor.from_osm_tags
# ─────────────────────────────────────────────────────────────────────────────


class TestContactExtractorFromOsmTags:
    def test_contact_phone_mapped(self):
        contact = ContactExtractor.from_osm_tags({"contact:phone": "+44 20 1234"})
        assert contact["phone_national"] == "+44 20 1234"

    def test_phone_fallback_when_contact_phone_absent(self):
        contact = ContactExtractor.from_osm_tags({"phone": "+44 20 9999"})
        assert contact["phone_national"] == "+44 20 9999"

    def test_contact_phone_takes_priority_over_phone(self):
        contact = ContactExtractor.from_osm_tags(
            {
                "contact:phone": "PRIMARY",
                "phone": "FALLBACK",
            }
        )
        assert contact["phone_national"] == "PRIMARY"

    def test_email_mapped(self):
        contact = ContactExtractor.from_osm_tags({"contact:email": "info@mosque.com"})
        assert contact["email"] == "info@mosque.com"

    def test_email_fallback(self):
        contact = ContactExtractor.from_osm_tags({"email": "alt@mosque.com"})
        assert contact["email"] == "alt@mosque.com"

    def test_website_mapped(self):
        contact = ContactExtractor.from_osm_tags({"website": "https://place.com"})
        assert contact["website"] == "https://place.com"

    def test_contact_website_fallback(self):
        contact = ContactExtractor.from_osm_tags({"contact:website": "https://cw.com"})
        assert contact["website"] == "https://cw.com"

    def test_social_fields(self):
        tags = {
            "contact:facebook": "fb.com/place",
            "contact:twitter": "@place",
            "contact:instagram": "place_ig",
        }
        contact = ContactExtractor.from_osm_tags(tags)
        assert contact["social_facebook"] == "fb.com/place"
        assert contact["social_twitter"] == "@place"
        assert contact["social_instagram"] == "place_ig"

    def test_unknown_tags_ignored(self):
        contact = ContactExtractor.from_osm_tags({"unknown_key": "value", "foo": "bar"})
        assert contact == {}

    def test_empty_tags(self):
        assert ContactExtractor.from_osm_tags({}) == {}
