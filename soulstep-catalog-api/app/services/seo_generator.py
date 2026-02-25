"""SEO content generation service.

Generates slugs, SEO titles, meta descriptions, rich descriptions, and FAQ
content from place data. Used by the admin bulk-generation endpoint and
triggered automatically when place data changes (if not manually edited).
"""

from __future__ import annotations

import logging
import re
import unicodedata
from datetime import UTC, datetime
from typing import Any

from sqlmodel import Session, select

from app.db.models import Place, PlaceSEO

logger = logging.getLogger(__name__)

# ── Religion display labels ────────────────────────────────────────────────────

_RELIGION_LABELS: dict[str, str] = {
    "islam": "Islamic",
    "christianity": "Christian",
    "hinduism": "Hindu",
    "buddhism": "Buddhist",
    "sikhism": "Sikh",
    "judaism": "Jewish",
    "bahai": "Bahá'í",
    "zoroastrianism": "Zoroastrian",
}

_PLACE_TYPE_LABELS: dict[str, str] = {
    "mosque": "Mosque",
    "church": "Church",
    "temple": "Temple",
    "synagogue": "Synagogue",
    "gurdwara": "Gurdwara",
    "monastery": "Monastery",
    "shrine": "Shrine",
    "cathedral": "Cathedral",
    "chapel": "Chapel",
    "prayer_room": "Prayer Room",
    "fire_temple": "Fire Temple",
    "bahaishouse": "Bahá'í House of Worship",
}


# ── Slug generation ────────────────────────────────────────────────────────────


def _slugify(text: str, max_length: int = 80) -> str:
    """Convert text to a URL-friendly slug."""
    # Normalize unicode (é → e, etc.)
    text = unicodedata.normalize("NFKD", text)
    text = text.encode("ascii", "ignore").decode("ascii")
    text = text.lower()
    # Replace non-alphanumeric characters with hyphens
    text = re.sub(r"[^a-z0-9]+", "-", text)
    # Strip leading/trailing hyphens
    text = text.strip("-")
    # Truncate cleanly at word boundary
    if len(text) > max_length:
        text = text[:max_length].rsplit("-", 1)[0]
    return text


def generate_slug(place: Place, session: Session) -> str:
    """Generate a unique slug for a place, appending suffix if needed."""
    base = _slugify(place.name)
    if not base:
        base = _slugify(place.place_code)

    # Check uniqueness, appending place_code suffix on collision
    candidate = base
    existing = session.exec(
        select(PlaceSEO).where(PlaceSEO.slug == candidate, PlaceSEO.place_code != place.place_code)
    ).first()
    if existing:
        suffix = place.place_code.replace("plc_", "")
        candidate = f"{base}-{suffix}"

    return candidate


# ── Title / description generation ────────────────────────────────────────────


def generate_seo_title(place: Place) -> str:
    """Generate a concise SEO title (≤60 chars recommended)."""
    religion_label = _RELIGION_LABELS.get(place.religion, place.religion.title())
    type_label = _PLACE_TYPE_LABELS.get(
        place.place_type, place.place_type.replace("_", " ").title()
    )

    # Extract city/country hint from address (last two comma-separated parts)
    location_hint = ""
    if place.address:
        parts = [p.strip() for p in place.address.split(",")]
        if len(parts) >= 2:
            location_hint = parts[-1].strip()
        elif len(parts) == 1:
            location_hint = parts[0].strip()

    title = place.name
    if location_hint:
        title = f"{place.name} – {type_label} in {location_hint}"
    else:
        title = f"{place.name} – {religion_label} {type_label}"

    # Truncate to 60 chars if too long
    if len(title) > 60:
        title = f"{place.name[:52]}…"

    return title


def generate_meta_description(
    place: Place,
    rating_data: dict[str, Any] | None = None,
) -> str:
    """Generate a meta description (≤160 chars)."""
    religion_label = _RELIGION_LABELS.get(place.religion, place.religion.title())
    type_label = _PLACE_TYPE_LABELS.get(
        place.place_type, place.place_type.replace("_", " ").title()
    )

    parts: list[str] = []

    # Rating opener
    if rating_data and rating_data.get("average"):
        avg = rating_data["average"]
        count = rating_data.get("count", 0)
        parts.append(f"Rated {avg:.1f}★ by {count} visitors.")

    # Place description snippet
    if place.description:
        snippet = place.description[:120].strip()
        if len(place.description) > 120:
            snippet = snippet.rsplit(" ", 1)[0] + "…"
        parts.append(snippet)
    else:
        parts.append(
            f"Explore {place.name}, a {religion_label} {type_label.lower()} "
            f"on SoulStep – discover sacred sites worldwide."
        )

    desc = " ".join(parts)
    if len(desc) > 160:
        desc = desc[:157] + "…"
    return desc


def generate_rich_description(
    place: Place,
    rating_data: dict[str, Any] | None = None,
) -> str:
    """Generate a longer crawlable paragraph for AI citation."""
    religion_label = _RELIGION_LABELS.get(place.religion, place.religion.title())
    type_label = _PLACE_TYPE_LABELS.get(
        place.place_type, place.place_type.replace("_", " ").title()
    )

    lines: list[str] = [f"{place.name} is a {religion_label} {type_label.lower()}"]

    if place.address:
        lines[0] += f" located at {place.address}"
    lines[0] += "."

    if place.description:
        lines.append(place.description)

    if rating_data and rating_data.get("average"):
        avg = rating_data["average"]
        count = rating_data.get("count", 0)
        lines.append(
            f"It has received an average rating of {avg:.1f} out of 5 "
            f"based on {count} visitor review{'s' if count != 1 else ''}."
        )

    if place.website_url:
        lines.append(f"Official website: {place.website_url}")

    return " ".join(lines)


# ── FAQ generation ─────────────────────────────────────────────────────────────


def generate_faqs(
    place: Place,
    attrs: dict[str, Any] | None = None,
    rating_data: dict[str, Any] | None = None,
) -> list[dict[str, str]]:
    """Generate FAQ pairs for FAQPage schema and AI citation."""
    religion_label = _RELIGION_LABELS.get(place.religion, place.religion.title())
    type_label = _PLACE_TYPE_LABELS.get(
        place.place_type, place.place_type.replace("_", " ").title()
    )
    faqs: list[dict[str, str]] = []
    attrs = attrs or {}

    # Q: What is this place?
    faqs.append(
        {
            "question": f"What is {place.name}?",
            "answer": (
                f"{place.name} is a {religion_label} {type_label.lower()}"
                + (f" located at {place.address}" if place.address else "")
                + "."
                + (f" {place.description[:200]}" if place.description else "")
            ),
        }
    )

    # Q: What are the opening hours?
    if place.opening_hours:
        day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        has_per_day = any(d in place.opening_hours for d in day_names)
        if has_per_day:
            hours_text = ", ".join(
                f"{day}: {place.opening_hours.get(day, 'N/A')}"
                for day in day_names
                if place.opening_hours.get(day)
            )
            faqs.append(
                {
                    "question": f"What are the opening hours of {place.name}?",
                    "answer": f"The opening hours are: {hours_text}.",
                }
            )

    # Q: Is there parking?
    has_parking = _truthy(attrs.get("has_parking"))
    if has_parking is not None:
        faqs.append(
            {
                "question": f"Is there parking available at {place.name}?",
                "answer": (
                    f"Yes, parking is available at {place.name}."
                    if has_parking
                    else f"No dedicated parking is listed for {place.name}."
                ),
            }
        )

    # Q: Women's area?
    has_womens = _truthy(attrs.get("has_womens_area"))
    if has_womens is not None:
        faqs.append(
            {
                "question": f"Is there a women's prayer area at {place.name}?",
                "answer": (
                    f"Yes, {place.name} has a dedicated women's prayer area."
                    if has_womens
                    else f"No women's area information is currently listed for {place.name}."
                ),
            }
        )

    # Q: Rating?
    if rating_data and rating_data.get("average"):
        avg = rating_data["average"]
        count = rating_data.get("count", 0)
        faqs.append(
            {
                "question": f"How is {place.name} rated?",
                "answer": (
                    f"{place.name} has an average rating of {avg:.1f} out of 5 "
                    f"based on {count} visitor review{'s' if count != 1 else ''} on SoulStep."
                ),
            }
        )

    # Q: Where is it?
    if place.address:
        faqs.append(
            {
                "question": f"Where is {place.name} located?",
                "answer": f"{place.name} is located at {place.address}.",
            }
        )

    return faqs


def _truthy(value: Any) -> bool | None:
    """Return True/False from attribute value, or None if missing."""
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lower = value.lower()
        if lower in ("true", "1", "yes"):
            return True
        if lower in ("false", "0", "no"):
            return False
    return None


# ── Persistence ────────────────────────────────────────────────────────────────


def upsert_place_seo(
    place: Place,
    session: Session,
    rating_data: dict[str, Any] | None = None,
    attrs: dict[str, Any] | None = None,
    force: bool = False,
) -> PlaceSEO:
    """Generate and persist SEO content for a place.

    If a PlaceSEO row already exists and is_manually_edited=True, the content
    is NOT overwritten unless force=True.

    Returns the PlaceSEO instance (created or updated).
    """
    existing = session.exec(select(PlaceSEO).where(PlaceSEO.place_code == place.place_code)).first()

    if existing and existing.is_manually_edited and not force:
        logger.info("Skipping SEO generation for %s — manually edited", place.place_code)
        return existing

    slug = generate_slug(place, session)
    seo_title = generate_seo_title(place)
    meta_desc = generate_meta_description(place, rating_data)
    rich_desc = generate_rich_description(place, rating_data)
    faqs = generate_faqs(place, attrs, rating_data)

    now = datetime.now(UTC)
    if existing:
        existing.slug = slug
        existing.seo_title = seo_title
        existing.meta_description = meta_desc
        existing.rich_description = rich_desc
        existing.faq_json = faqs
        existing.generated_at = now
        existing.updated_at = now
        # Preserve og_image_url if already set
        session.add(existing)
        session.commit()
        session.refresh(existing)
        logger.info("Updated SEO for %s (slug=%s)", place.place_code, slug)
        return existing

    place_seo = PlaceSEO(
        place_code=place.place_code,
        slug=slug,
        seo_title=seo_title,
        meta_description=meta_desc,
        rich_description=rich_desc,
        faq_json=faqs,
        og_image_url=None,
        is_manually_edited=False,
        generated_at=now,
        updated_at=now,
    )
    session.add(place_seo)
    session.commit()
    session.refresh(place_seo)
    logger.info("Created SEO for %s (slug=%s)", place.place_code, slug)
    return place_seo
