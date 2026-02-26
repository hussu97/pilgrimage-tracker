"""
Typed shapes for all shared dicts across the collector pipeline.
"""

from __future__ import annotations

from typing import TypedDict


class DescriptionDict(TypedDict):
    text: str
    lang: str  # "en", "ar", "hi", "te"
    source: str  # "wikipedia", "gmaps_editorial", "knowledge_graph", etc.
    score: float | None


class ReviewDict(TypedDict):
    author_name: str
    rating: float | int
    text: str
    time: int  # Unix timestamp (0 if unknown)
    relative_time_description: str
    language: str  # "en" default


class AttributeDict(TypedDict):
    attribute_code: str
    value: str | int | float | bool | list[str]


class ImageDict(TypedDict):
    url: str
    source: str


class ContactDict(TypedDict, total=False):
    phone_national: str
    phone_international: str
    email: str
    website: str
    google_maps_url: str
    facebook_url: str
    twitter_url: str
    instagram_url: str
    wikidata_id: str
    wikipedia_url: str
    # Legacy keys used by some collectors / Wikidata
    social_facebook: str
    social_twitter: str
    social_instagram: str


class ExistingDataDict(TypedDict, total=False):
    """existing_data passed to collectors from accumulated enrichment."""

    tags: dict[str, str]
    google_place_id: str
