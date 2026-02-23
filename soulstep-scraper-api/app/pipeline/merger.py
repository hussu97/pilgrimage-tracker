"""
Merger — combines all collector outputs into the final ScrapedPlace.raw_data.

Priority rules for conflicts:
- Name: gmaps (authoritative)
- Description: quality-scored winner
- Contact phone: gmaps > OSM > Wikidata
- Contact socials: Wikidata > OSM
- Attributes: union across all sources (for booleans, True wins over False)
- Reviews: gmaps base + outscraper extended + foursquare tips
- Images: gmaps photos + wikipedia images + knowledge graph image (deduped)
- Busyness: besttime only (exclusive source)
"""

from __future__ import annotations

from typing import Any

from app.collectors.base import CollectorResult
from app.pipeline.quality import assess_descriptions


def merge_collector_results(
    base_data: dict[str, Any],
    results: dict[str, CollectorResult],
    place_name: str = "",
) -> dict[str, Any]:
    """
    Merge all collector results into the final place data dict.

    Args:
        base_data: The existing raw_data from ScrapedPlace (gmaps initial data).
        results: Map of collector_name -> CollectorResult.
        place_name: Place display name for quality assessment.

    Returns:
        Updated raw_data dict with enriched information.
    """
    merged = dict(base_data)

    # --- 1. Description assessment ---
    all_descriptions = []
    for r in results.values():
        if r.status == "success":
            all_descriptions.extend(r.descriptions)

    if all_descriptions:
        assessment = assess_descriptions(all_descriptions, place_name)
        if assessment["text"]:
            merged["description"] = assessment["text"]
            merged["_description_source"] = assessment["source"]
            merged["_description_score"] = assessment["score"]
            merged["_description_method"] = assessment["method"]

        # Consolidate non-English descriptions into the translations dict
        for desc in all_descriptions:
            lang = desc.get("lang")
            text = desc.get("text")
            if lang and lang != "en" and text:
                merged.setdefault("translations", {}).setdefault("description", {}).setdefault(
                    lang, text
                )

    # --- 2. Contact merging (priority-based) ---
    merged_contact = {}

    # Priority order for contact fields
    contact_priority = {
        "phone_national": ["gmaps", "osm", "wikidata"],
        "phone_international": ["gmaps", "osm", "wikidata"],
        "email": ["osm", "wikidata"],
        "website": ["gmaps", "osm", "wikidata", "knowledge_graph"],
        "social_facebook": ["wikidata", "osm"],
        "social_instagram": ["wikidata", "osm"],
        "social_twitter": ["wikidata", "osm"],
        "google_maps_url": ["gmaps"],
    }

    for field, priority in contact_priority.items():
        for source in priority:
            r = results.get(source)
            if r and r.status == "success" and field in r.contact:
                merged_contact[field] = r.contact[field]
                break

    # Write contact fields as attributes
    existing_attrs = merged.get("attributes", [])
    existing_attr_codes = {a["attribute_code"] for a in existing_attrs}

    for field, value in merged_contact.items():
        if field not in existing_attr_codes:
            existing_attrs.append({"attribute_code": field, "value": value})

    # --- 3. Attributes merging (union, True wins) ---
    attr_map: dict[str, Any] = {}
    for a in existing_attrs:
        attr_map[a["attribute_code"]] = a["value"]

    for r in results.values():
        if r.status != "success":
            continue
        for attr in r.attributes:
            code = attr["attribute_code"]
            value = attr["value"]
            if code not in attr_map:
                attr_map[code] = value
            elif isinstance(value, bool) and isinstance(attr_map[code], bool):
                # For booleans, True wins over False
                attr_map[code] = attr_map[code] or value

    # Consolidate multilingual name attributes (name_ar, name_hi, name_te) into translations
    _NAME_LANG_ATTRS = {"name_ar": "ar", "name_hi": "hi", "name_te": "te"}
    filtered_attrs = {}
    for code, value in attr_map.items():
        if code in _NAME_LANG_ATTRS:
            lang_code = _NAME_LANG_ATTRS[code]
            merged.setdefault("translations", {}).setdefault("name", {}).setdefault(
                lang_code, str(value)
            )
        else:
            filtered_attrs[code] = value

    merged["attributes"] = [
        {"attribute_code": code, "value": value} for code, value in filtered_attrs.items()
    ]

    # --- 4. Reviews merging ---
    all_reviews = list(merged.get("external_reviews", []))
    seen_texts = {r.get("text", "")[:100] for r in all_reviews if r.get("text")}

    for source_name in ["outscraper", "foursquare"]:
        r = results.get(source_name)
        if r and r.status == "success":
            for review in r.reviews:
                text_key = review.get("text", "")[:100]
                if text_key and text_key not in seen_texts:
                    all_reviews.append(review)
                    seen_texts.add(text_key)

    merged["external_reviews"] = all_reviews

    # --- 5. Images merging (deduped) ---
    existing_urls = set(merged.get("image_urls", []))

    for source_name in ["wikipedia", "knowledge_graph"]:
        r = results.get(source_name)
        if r and r.status == "success":
            for img in r.images:
                url = img.get("url", "")
                if url and url not in existing_urls:
                    merged.setdefault("image_urls", []).append(url)
                    existing_urls.add(url)

    # --- 6. Entity types from Knowledge Graph ---
    kg = results.get("knowledge_graph")
    if kg and kg.status == "success" and kg.entity_types:
        merged["entity_types"] = kg.entity_types

    return merged
