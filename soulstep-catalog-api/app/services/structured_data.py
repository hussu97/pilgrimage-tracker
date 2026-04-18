"""Schema.org JSON-LD structured data generation.

Produces machine-readable structured data for sacred-site place pages.
Used by the pre-rendering endpoint to embed JSON-LD in HTML.
"""

from __future__ import annotations

import json
import re
from typing import Any

from app.core.config import FRONTEND_URL as _FRONTEND_URL

# ── Religion → Schema.org @type mapping ───────────────────────────────────────

_RELIGION_SCHEMA_TYPE: dict[str, str] = {
    "islam": "Mosque",
    "christianity": "Church",
    "hinduism": "HinduTemple",
    "buddhism": "BuddhistTemple",
    "sikhism": "Gurdwara",
    "judaism": "Synagogue",
    "bahai": "PlaceOfWorship",
    "zoroastrianism": "PlaceOfWorship",
}


def _place_schema_type(religion: str) -> str:
    return _RELIGION_SCHEMA_TYPE.get(religion.lower(), "PlaceOfWorship")


# ── Place JSON-LD ──────────────────────────────────────────────────────────────


def build_place_jsonld(
    place: Any,  # Place model instance
    seo: Any | None = None,  # PlaceSEO model instance
    rating_data: dict[str, Any] | None = None,
    review_samples: list[dict[str, Any]] | None = None,
    image_url: str | None = None,
    knowledge_graph_urls: list[str] | None = None,
    translated_name: str | None = None,
    translated_description: str | None = None,
) -> dict[str, Any]:
    """Build Schema.org JSON-LD for a PlaceOfWorship page.

    knowledge_graph_urls: additional sameAs URLs from Knowledge Graph data
    (e.g. Wikidata entity URI, Wikipedia article URL, Google Maps URL).
    These are merged with place.website_url to build a sameAs list.
    """
    place_url = f"{_FRONTEND_URL}/places/{place.place_code}"
    if seo:
        place_url = f"{_FRONTEND_URL}/places/{place.place_code}/{seo.slug}"

    schema: dict[str, Any] = {
        "@context": "https://schema.org",
        "@type": ["LocalBusiness", _place_schema_type(place.religion)],
        "additionalType": "https://schema.org/TouristAttraction",
        "name": translated_name or place.name,
        "url": place_url,
    }

    if place.lat and place.lng:
        schema["geo"] = {
            "@type": "GeoCoordinates",
            "latitude": place.lat,
            "longitude": place.lng,
        }

    if place.address:
        # Best-effort address decomposition (split at last comma for addressLocality)
        parts = [p.strip() for p in place.address.split(",")]
        schema["address"] = {
            "@type": "PostalAddress",
            "streetAddress": ", ".join(parts[:-1]) if len(parts) > 1 else place.address,
            "addressLocality": parts[-1] if len(parts) >= 1 else "",
        }

    description = (
        translated_description
        or (seo.rich_description if seo and seo.rich_description else None)
        or place.description
    )
    if description:
        schema["description"] = description

    # Build sameAs: website_url + Knowledge Graph URLs (Wikidata, Wikipedia, Google Maps, etc.)
    same_as: list[str] = []
    if place.website_url:
        same_as.append(place.website_url)
    if knowledge_graph_urls:
        for url in knowledge_graph_urls:
            if url and url not in same_as:
                same_as.append(url)
    if len(same_as) == 1:
        schema["sameAs"] = same_as[0]
    elif len(same_as) > 1:
        schema["sameAs"] = same_as

    if image_url:
        schema["image"] = image_url

    if rating_data and rating_data.get("count", 0) > 0:
        schema["aggregateRating"] = {
            "@type": "AggregateRating",
            "ratingValue": round(rating_data["average"], 1),
            "reviewCount": rating_data["count"],
            "bestRating": 5,
            "worstRating": 1,
        }

    if review_samples:
        schema["review"] = [
            {
                "@type": "Review",
                "author": {
                    "@type": "Person",
                    "name": re.sub(r"(?:Local Guide|·).*$", "", r.get("author_name") or "").strip()
                    or "Anonymous",
                },
                "reviewRating": {
                    "@type": "Rating",
                    "ratingValue": r.get("rating", 5),
                    "bestRating": 5,
                    "worstRating": 1,
                },
                **({"reviewBody": r["body"]} if r.get("body") else {}),
            }
            for r in review_samples[:3]
        ]

    return schema


def build_breadcrumb_jsonld(
    place_name: str,
    place_url: str,
    religion: str | None = None,
) -> dict[str, Any]:
    """Build a BreadcrumbList JSON-LD for a place page."""
    items: list[dict[str, Any]] = [
        {
            "@type": "ListItem",
            "position": 1,
            "name": "Home",
            "item": _FRONTEND_URL,
        },
        {
            "@type": "ListItem",
            "position": 2,
            "name": "Places",
            "item": f"{_FRONTEND_URL}/places",
        },
    ]
    if religion:
        items.append(
            {
                "@type": "ListItem",
                "position": 3,
                "name": religion.title(),
                "item": f"{_FRONTEND_URL}/places?religion={religion}",
            }
        )
        items.append(
            {
                "@type": "ListItem",
                "position": 4,
                "name": place_name,
                "item": place_url,
            }
        )
    else:
        items.append(
            {
                "@type": "ListItem",
                "position": 3,
                "name": place_name,
                "item": place_url,
            }
        )

    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": items,
    }


def build_faq_jsonld(faqs: list[dict[str, str]]) -> dict[str, Any] | None:
    """Build a FAQPage JSON-LD from a list of {question, answer} pairs."""
    if not faqs:
        return None
    return {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
            {
                "@type": "Question",
                "name": faq["question"],
                "acceptedAnswer": {
                    "@type": "Answer",
                    "text": faq["answer"],
                },
            }
            for faq in faqs
        ],
    }


def build_organization_jsonld() -> dict[str, Any]:
    """Build an Organization JSON-LD for the homepage."""
    return {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": "SoulStep",
        "url": _FRONTEND_URL,
        "description": (
            "SoulStep is a sacred-site discovery platform connecting spiritual travellers "
            "with mosques, temples, churches, and other houses of worship worldwide."
        ),
        "sameAs": [_FRONTEND_URL],
        "knowsAbout": [
            "Sacred sites",
            "Religious tourism",
            "Islamic architecture",
            "Christian churches",
            "Hindu temples",
            "Buddhist monasteries",
            "Sikh gurdwaras",
            "Jewish synagogues",
        ],
    }


def build_dataset_jsonld(
    total_places: int,
    religion_counts: dict[str, int] | None = None,
) -> dict[str, Any]:
    """Build a Dataset JSON-LD describing the SoulStep places catalogue.

    Strengthens entity recognition for AI systems indexing structured data
    about the platform's content scope.
    """
    dataset: dict[str, Any] = {
        "@context": "https://schema.org",
        "@type": "Dataset",
        "name": "SoulStep Sacred Sites Catalogue",
        "description": (
            f"A curated dataset of {total_places:,} sacred sites and religious worship places "
            "worldwide, covering mosques, churches, temples, gurdwaras, synagogues, and more. "
            "Includes geolocation, opening hours, reviews, and multi-language descriptions."
        ),
        "url": f"{_FRONTEND_URL}/coverage",
        "creator": {
            "@type": "Organization",
            "name": "SoulStep",
            "url": _FRONTEND_URL,
        },
        "license": "https://creativecommons.org/licenses/by/4.0/",
        "keywords": [
            "sacred sites",
            "religious places",
            "mosques",
            "churches",
            "temples",
            "gurdwaras",
            "synagogues",
            "spiritual tourism",
        ],
    }
    if religion_counts:
        dataset["variableMeasured"] = [
            {
                "@type": "PropertyValue",
                "name": religion.title(),
                "value": count,
                "unitText": "places",
            }
            for religion, count in religion_counts.items()
            if count > 0
        ]
    return dataset


def render_jsonld_script_tags(schemas: list[dict[str, Any]]) -> str:
    """Render a list of JSON-LD dicts as HTML <script> tags."""
    tags: list[str] = []
    for schema in schemas:
        json_str = json.dumps(schema, ensure_ascii=False, separators=(",", ":"))
        tags.append(f'<script type="application/ld+json">{json_str}</script>')
    return "\n".join(tags)
