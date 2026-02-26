"""
Shared extraction utilities used across multiple collectors.

Replaces ~150 lines of duplicated patterns across 7+ collector files.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from app.utils.types import ContactDict, DescriptionDict, ReviewDict


def parse_iso_to_unix(datetime_str: str) -> int:
    """Parse ISO datetime string (Z suffix supported) → Unix timestamp. Returns 0 on failure."""
    if not datetime_str:
        return 0
    try:
        dt = datetime.fromisoformat(datetime_str.replace("Z", "+00:00"))
        return int(dt.timestamp())
    except Exception:
        return 0


def make_description(
    text: str,
    lang: str,
    source: str,
    score: float | None = None,
) -> DescriptionDict:
    """Build a standardized DescriptionDict."""
    return DescriptionDict(text=text, lang=lang, source=source, score=score)


class ReviewExtractor:
    """Extract reviews from various source APIs into ReviewDict format."""

    @staticmethod
    def from_gmaps(reviews: list[dict[str, Any]]) -> list[ReviewDict]:
        """Extract reviews from Google Places API v1 response (handles nested text dict)."""
        result: list[ReviewDict] = []
        for review in reviews[:5]:
            review_text = review.get("text", {})
            if isinstance(review_text, dict):
                review_text = review_text.get("text", "")

            author_name = review.get("authorAttribution", {}).get("displayName", "")
            time_unix = parse_iso_to_unix(review.get("publishTime", ""))

            result.append(
                ReviewDict(
                    author_name=author_name,
                    rating=review.get("rating", 0),
                    text=review_text,
                    time=time_unix,
                    relative_time_description=review.get("relativePublishTimeDescription", ""),
                    language="en",
                )
            )
        return result

    @staticmethod
    def from_outscraper(reviews: list[dict[str, Any]]) -> list[ReviewDict]:
        """Extract reviews from Outscraper Maps Reviews API response."""
        result: list[ReviewDict] = []
        for review in reviews:
            time_unix = parse_iso_to_unix(review.get("review_datetime_utc", ""))
            result.append(
                ReviewDict(
                    author_name=review.get("author_title", ""),
                    rating=review.get("review_rating", 0),
                    text=review.get("review_text", ""),
                    time=time_unix,
                    relative_time_description=review.get("review_datetime_utc", ""),
                    language=review.get("review_language", "en"),
                )
            )
        return result

    @staticmethod
    def from_foursquare_tips(tips: list[dict[str, Any]]) -> list[ReviewDict]:
        """Convert Foursquare tips to ReviewDict format (no rating, time=0)."""
        result: list[ReviewDict] = []
        for tip in tips:
            result.append(
                ReviewDict(
                    author_name=tip.get("created_by", "Foursquare User"),
                    rating=0,
                    text=tip.get("text", ""),
                    time=0,
                    relative_time_description="",
                    language=tip.get("lang", "en"),
                )
            )
        return result


class ContactExtractor:
    """Extract contact information from various source API responses into ContactDict format."""

    @staticmethod
    def from_gmaps_response(response: dict[str, Any]) -> ContactDict:
        """Extract contact fields from Google Places API place detail response."""
        contact: ContactDict = {}
        national_phone = response.get("nationalPhoneNumber")
        intl_phone = response.get("internationalPhoneNumber")
        gmaps_uri = response.get("googleMapsUri")
        website = response.get("websiteUri")

        if national_phone:
            contact["phone_national"] = national_phone
        if intl_phone:
            contact["phone_international"] = intl_phone
        if gmaps_uri:
            contact["google_maps_url"] = gmaps_uri
        if website:
            contact["website"] = website

        return contact

    @staticmethod
    def from_osm_tags(tags: dict[str, str]) -> ContactDict:
        """Map OSM tag keys to ContactDict fields (contact:phone, phone, contact:email, etc.)."""
        contact_mappings = {
            "contact:phone": "phone_national",
            "phone": "phone_national",
            "contact:email": "email",
            "email": "email",
            "contact:website": "website",
            "website": "website",
            "contact:facebook": "social_facebook",
            "contact:twitter": "social_twitter",
            "contact:instagram": "social_instagram",
        }

        contact: ContactDict = {}
        for tag_key, contact_field in contact_mappings.items():
            val = tags.get(tag_key)
            if val and contact_field not in contact:
                contact[contact_field] = val  # type: ignore[literal-required]

        return contact
