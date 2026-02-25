"""Schema.org JSON-LD structured data generation.

Produces machine-readable structured data for sacred-site place pages.
Used by the pre-rendering endpoint to embed JSON-LD in HTML.
"""

from __future__ import annotations

import json
import os
from typing import Any

_FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")

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
) -> dict[str, Any]:
    """Build Schema.org JSON-LD for a PlaceOfWorship page."""
    place_url = f"{_FRONTEND_URL}/places/{place.place_code}"
    if seo:
        place_url = f"{_FRONTEND_URL}/places/{place.place_code}/{seo.slug}"

    schema: dict[str, Any] = {
        "@context": "https://schema.org",
        "@type": _place_schema_type(place.religion),
        "name": place.name,
        "url": place_url,
        "geo": {
            "@type": "GeoCoordinates",
            "latitude": place.lat,
            "longitude": place.lng,
        },
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
        seo.rich_description if seo and seo.rich_description else None
    ) or place.description
    if description:
        schema["description"] = description

    if place.website_url:
        schema["sameAs"] = place.website_url

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
                    "name": r.get("author_name") or "Anonymous",
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
    }


def render_jsonld_script_tags(schemas: list[dict[str, Any]]) -> str:
    """Render a list of JSON-LD dicts as HTML <script> tags."""
    tags: list[str] = []
    for schema in schemas:
        json_str = json.dumps(schema, ensure_ascii=False, separators=(",", ":"))
        tags.append(f'<script type="application/ld+json">{json_str}</script>')
    return "\n".join(tags)
