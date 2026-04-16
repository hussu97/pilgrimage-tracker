"""SEO content generation service.

Generates slugs, SEO titles, meta descriptions, rich descriptions, and FAQ
content from place data. Supports multi-language generation using DB-driven
templates (SEOLabel + SEOContentTemplate) with English fallback.

Used by the admin bulk-generation endpoint and triggered automatically when
place data changes (if not manually edited).
"""

from __future__ import annotations

import hashlib
import logging
import re
import unicodedata
from collections import defaultdict
from datetime import UTC, datetime
from typing import Any

from sqlmodel import Session, func, select

from app.db import content_translations as ct_db
from app.db.models import (
    Place,
    PlaceImage,
    PlaceSEO,
    PlaceSEOTranslation,
    SEOContentTemplate,
    SEOLabel,
)

logger = logging.getLogger(__name__)

# ── Hardcoded fallback labels (used when DB labels are not yet seeded) ────────

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


# ── DB-driven label and template loaders ──────────────────────────────────────


def _load_labels(lang: str, session: Session) -> tuple[dict[str, str], dict[str, str]]:
    """Return (religion_labels, place_type_labels) for the given language.

    Falls back to English DB labels, then to hardcoded constants.
    """
    rows = session.exec(select(SEOLabel).where(SEOLabel.lang == lang)).all()
    religion: dict[str, str] = {}
    place_type: dict[str, str] = {}
    for row in rows:
        if row.label_type == "religion":
            religion[row.label_key] = row.label_text
        elif row.label_type == "place_type":
            place_type[row.label_key] = row.label_text

    # If non-English and some keys are missing, fill from English DB labels
    if lang != "en":
        en_rows = session.exec(select(SEOLabel).where(SEOLabel.lang == "en")).all()
        for row in en_rows:
            if row.label_type == "religion" and row.label_key not in religion:
                religion[row.label_key] = row.label_text
            elif row.label_type == "place_type" and row.label_key not in place_type:
                place_type[row.label_key] = row.label_text

    # Final fallback to hardcoded constants for English
    if not religion:
        religion = dict(_RELIGION_LABELS)
    if not place_type:
        place_type = dict(_PLACE_TYPE_LABELS)

    return religion, place_type


def _load_template(template_code: str, lang: str, session: Session) -> SEOContentTemplate | None:
    """Load active template for (code, lang). Falls back to English."""
    tmpl = session.exec(
        select(SEOContentTemplate).where(
            SEOContentTemplate.template_code == template_code,
            SEOContentTemplate.lang == lang,
            SEOContentTemplate.is_active.is_(True),
        )
    ).first()
    if tmpl:
        return tmpl
    if lang != "en":
        return session.exec(
            select(SEOContentTemplate).where(
                SEOContentTemplate.template_code == template_code,
                SEOContentTemplate.lang == "en",
                SEOContentTemplate.is_active.is_(True),
            )
        ).first()
    return None


def _get_max_template_version(session: Session) -> int:
    """Return the max version across all active templates."""
    result = session.exec(
        select(func.coalesce(func.max(SEOContentTemplate.version), 0)).where(
            SEOContentTemplate.is_active.is_(True)
        )
    ).one()
    return result


def _render_template(template: SEOContentTemplate, variables: dict[str, str]) -> str:
    """Render a template with safe variable substitution."""
    all_vars = {**(template.static_phrases or {}), **variables}
    return template.template_text.format_map(defaultdict(str, all_vars))


def _render_fallback(template: SEOContentTemplate, variables: dict[str, str]) -> str:
    """Render fallback_text, or template_text if no fallback."""
    text = template.fallback_text or template.template_text
    all_vars = {**(template.static_phrases or {}), **variables}
    return text.format_map(defaultdict(str, all_vars))


def _get_entity_text(place: Place, field: str, lang: str, session: Session) -> str:
    """Get translated text for a place field, falling back to English original."""
    if lang == "en":
        return getattr(place, field, "") or ""
    translated = ct_db.get_translation("place", place.place_code, field, lang, session)
    return translated or getattr(place, field, "") or ""


def _extract_location(address: str | None) -> str:
    """Extract city/country hint from the last comma-separated part of address."""
    if not address:
        return ""
    parts = [p.strip() for p in address.split(",")]
    if len(parts) >= 2:
        return parts[-1].strip()
    if len(parts) == 1:
        return parts[0].strip()
    return ""


# ── Slug generation ────────────────────────────────────────────────────────────


def _slugify(text: str, max_length: int = 80) -> str:
    """Convert text to a URL-friendly slug."""
    text = unicodedata.normalize("NFKD", text)
    text = text.encode("ascii", "ignore").decode("ascii")
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    text = text.strip("-")
    if len(text) > max_length:
        text = text[:max_length].rsplit("-", 1)[0]
    return text


def generate_slug(place: Place, session: Session) -> str:
    """Generate a unique, clean URL slug for a place.

    Collision strategy (in order):
    1. ``{name}``               e.g. "al-noor-mosque"
    2. ``{name}-{city}``        e.g. "al-noor-mosque-dubai"  (when city is a real word)
    3. ``{name}-{city}-{id}``   e.g. "al-noor-mosque-dubai-i9lxz3n4"  (rare double collision)
    4. ``{name}-{id}``          fallback when city is absent or looks like a street address

    All suffix components go through ``_slugify`` so no raw Google Place IDs,
    uppercase characters, or special symbols can leak into the URL.
    """
    base = _slugify(place.name)
    if not base:
        # Name is non-ASCII (e.g., Arabic) — build a keyword slug from place_type + city
        # so the URL carries SEO value rather than a meaningless code hash.
        type_slug = _slugify(place.place_type or "") or "place"
        city_slug_fb = _slugify(place.city or "")
        if city_slug_fb and not re.search(r"\d", city_slug_fb) and len(city_slug_fb) <= 40:
            base = f"{type_slug}-{city_slug_fb}"
        else:
            base = type_slug

    # Stable 6-char hex derived from place_code — no Google Place ID structure exposed.
    short_id = hashlib.md5(place.place_code.encode()).hexdigest()[:6]

    def _taken(slug: str) -> bool:
        return bool(
            session.exec(
                select(PlaceSEO).where(
                    PlaceSEO.slug == slug, PlaceSEO.place_code != place.place_code
                )
            ).first()
        )

    # Attempt 1: bare name slug
    if not _taken(base):
        return base

    # Attempt 2: name + city (only when city slug looks like a real city — no digits)
    city_slug = _slugify(place.city or "")
    if city_slug and not re.search(r"\d", city_slug) and len(city_slug) <= 40:
        candidate = f"{base}-{city_slug}"
        if not _taken(candidate):
            return candidate

        # Attempt 3: name + city + short_id (two same-name places in same city)
        candidate = f"{base}-{city_slug}-{short_id}"
        if not _taken(candidate):
            return candidate

    # Attempt 4: name + short_id (no usable city)
    return f"{base}-{short_id}"


# ── Template-based generation functions ───────────────────────────────────────


def generate_seo_title(
    place: Place,
    session: Session | None = None,
    lang: str = "en",
) -> str:
    """Generate a concise SEO title (≤60 chars recommended)."""
    name = place.name
    if session and lang != "en":
        name = _get_entity_text(place, "name", lang, session) or place.name

    location = _extract_location(place.address)

    if session:
        religion_labels, type_labels = _load_labels(lang, session)
    else:
        religion_labels, type_labels = _RELIGION_LABELS, _PLACE_TYPE_LABELS

    religion_label = religion_labels.get(place.religion, place.religion.title())
    type_label = type_labels.get(place.place_type, place.place_type.replace("_", " ").title())

    # Try DB template
    if session:
        tmpl = _load_template("seo_title", lang, session)
        if tmpl:
            variables = {
                "name": name,
                "type_label": type_label,
                "religion_label": religion_label,
                "location": location,
            }
            if location:
                title = _render_template(tmpl, variables)
            else:
                title = _render_fallback(tmpl, variables)

            if len(title) > 60:
                title = f"{name[:52]}…"
            return title

    # Hardcoded fallback (no session or no template)
    if location:
        title = f"{name} – {type_label} in {location}"
    else:
        title = f"{name} – {religion_label} {type_label}"

    if len(title) > 60:
        title = f"{name[:52]}…"
    return title


def generate_meta_description(
    place: Place,
    rating_data: dict[str, Any] | None = None,
    session: Session | None = None,
    lang: str = "en",
) -> str:
    """Generate a meta description (≤160 chars)."""
    name = place.name
    description = place.description
    if session and lang != "en":
        name = _get_entity_text(place, "name", lang, session) or place.name
        description = _get_entity_text(place, "description", lang, session) or place.description

    if session:
        religion_labels, type_labels = _load_labels(lang, session)
    else:
        religion_labels, type_labels = _RELIGION_LABELS, _PLACE_TYPE_LABELS

    religion_label = religion_labels.get(place.religion, place.religion.title())
    type_label = type_labels.get(place.place_type, place.place_type.replace("_", " ").title())

    # Build rating sentence
    rating_sentence = ""
    if rating_data and rating_data.get("average"):
        avg = rating_data["average"]
        count = rating_data.get("count", 0)
        rating_sentence = f"Rated {avg:.1f}★ by {count} visitors. "

    # Build description snippet
    description_snippet = ""
    if description:
        snippet = description[:120].strip()
        if len(description) > 120:
            snippet = snippet.rsplit(" ", 1)[0] + "…"
        description_snippet = snippet

    # Try DB template
    if session:
        tmpl = _load_template("meta_description", lang, session)
        if tmpl:
            variables = {
                "name": name,
                "religion_label": religion_label,
                "type_label": type_label,
                "type_label_lower": type_label.lower(),
                "rating_sentence": rating_sentence,
                "description_snippet": description_snippet,
            }
            if description_snippet or rating_sentence:
                desc = _render_template(tmpl, variables).strip()
            else:
                desc = _render_fallback(tmpl, variables).strip()

            if len(desc) > 160:
                desc = desc[:157] + "…"
            return desc

    # Hardcoded fallback
    parts: list[str] = []
    if rating_sentence:
        parts.append(rating_sentence.strip())
    if description_snippet:
        parts.append(description_snippet)
    else:
        parts.append(
            f"Explore {name}, a {religion_label} {type_label.lower()} "
            f"on SoulStep – discover sacred sites worldwide."
        )

    desc = " ".join(parts)
    if len(desc) > 160:
        desc = desc[:157] + "…"
    return desc


def generate_rich_description(
    place: Place,
    rating_data: dict[str, Any] | None = None,
    session: Session | None = None,
    lang: str = "en",
) -> str:
    """Generate a longer crawlable paragraph for AI citation."""
    name = place.name
    description = place.description or ""
    address = place.address or ""
    if session and lang != "en":
        name = _get_entity_text(place, "name", lang, session) or place.name
        description = _get_entity_text(place, "description", lang, session) or (
            place.description or ""
        )
        address = _get_entity_text(place, "address", lang, session) or (place.address or "")

    if session:
        religion_labels, type_labels = _load_labels(lang, session)
    else:
        religion_labels, type_labels = _RELIGION_LABELS, _PLACE_TYPE_LABELS

    religion_label = religion_labels.get(place.religion, place.religion.title())
    type_label = type_labels.get(place.place_type, place.place_type.replace("_", " ").title())

    # Try DB template
    if session:
        tmpl = _load_template("rich_description", lang, session)
        if tmpl:
            phrases = tmpl.static_phrases or {}

            # Location sentence
            location_sentence = ""
            if address:
                located_at = phrases.get("located_at", "located at")
                location_sentence = f"{located_at} {address}"

            # Rating sentence
            rating_sentence = ""
            if rating_data and rating_data.get("average"):
                avg = rating_data["average"]
                count = rating_data.get("count", 0)
                prefix = phrases.get("rating_prefix", "It has received an average rating of")
                out_of = phrases.get("out_of", "out of 5 based on")
                review_word = (
                    phrases.get("visitor_reviews", "visitor reviews")
                    if count != 1
                    else phrases.get("visitor_review", "visitor review")
                )
                rating_sentence = f"{prefix} {avg:.1f} {out_of} {count} {review_word}."

            # Website sentence
            website_sentence = ""
            if place.website_url:
                official = phrases.get("official_website", "Official website:")
                website_sentence = f"{official} {place.website_url}"

            variables = {
                "name": name,
                "religion_label": religion_label,
                "type_label": type_label,
                "type_label_lower": type_label.lower(),
                "location_sentence": location_sentence,
                "description": description,
                "rating_sentence": rating_sentence,
                "website_sentence": website_sentence,
            }

            if location_sentence:
                result = _render_template(tmpl, variables)
            else:
                result = _render_fallback(tmpl, variables)

            # Clean up multiple spaces
            return " ".join(result.split())

    # Hardcoded fallback
    lines: list[str] = [f"{name} is a {religion_label} {type_label.lower()}"]
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
    session: Session | None = None,
    lang: str = "en",
) -> list[dict[str, str]]:
    """Generate FAQ pairs for FAQPage schema and AI citation."""
    name = place.name
    description = place.description or ""
    address = place.address or ""
    if session and lang != "en":
        name = _get_entity_text(place, "name", lang, session) or place.name
        description = _get_entity_text(place, "description", lang, session) or (
            place.description or ""
        )
        address = _get_entity_text(place, "address", lang, session) or (place.address or "")

    if session:
        religion_labels, type_labels = _load_labels(lang, session)
    else:
        religion_labels, type_labels = _RELIGION_LABELS, _PLACE_TYPE_LABELS

    religion_label = religion_labels.get(place.religion, place.religion.title())
    type_label = type_labels.get(place.place_type, place.place_type.replace("_", " ").title())
    faqs: list[dict[str, str]] = []
    attrs = attrs or {}

    # Q: What is this place?
    tmpl = _load_template("faq_what_is", lang, session) if session else None
    if tmpl:
        phrases = tmpl.static_phrases or {}
        location_clause = f" located at {address}" if address else ""
        description_clause = f" {description[:200]}" if description else ""
        question = _render_template(tmpl, {"name": name})
        answer_tmpl = phrases.get(
            "answer_template",
            "{name} is a {religion_label} {type_label_lower}{location_clause}.{description_clause}",
        )
        answer = answer_tmpl.format_map(
            defaultdict(
                str,
                {
                    "name": name,
                    "religion_label": religion_label,
                    "type_label_lower": type_label.lower(),
                    "location_clause": location_clause,
                    "description_clause": description_clause,
                },
            )
        )
        faqs.append({"question": question, "answer": answer})
    else:
        faqs.append(
            {
                "question": f"What is {name}?",
                "answer": (
                    f"{name} is a {religion_label} {type_label.lower()}"
                    + (f" located at {address}" if address else "")
                    + "."
                    + (f" {description[:200]}" if description else "")
                ),
            }
        )

    # Q: Opening hours
    if place.opening_hours:
        day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        has_per_day = any(d in place.opening_hours for d in day_names)
        if has_per_day:
            hours_text = ", ".join(
                f"{day}: {place.opening_hours.get(day, 'N/A')}"
                for day in day_names
                if place.opening_hours.get(day)
            )
            tmpl = _load_template("faq_opening_hours", lang, session) if session else None
            if tmpl:
                phrases = tmpl.static_phrases or {}
                question = _render_template(tmpl, {"name": name})
                prefix = phrases.get("answer_prefix", "The opening hours are:")
                answer = f"{prefix} {hours_text}."
            else:
                question = f"What are the opening hours of {name}?"
                answer = f"The opening hours are: {hours_text}."
            faqs.append({"question": question, "answer": answer})

    # Q: Parking
    has_parking = _truthy(attrs.get("has_parking"))
    if has_parking is not None:
        tmpl = _load_template("faq_parking", lang, session) if session else None
        if tmpl:
            phrases = tmpl.static_phrases or {}
            question = _render_template(tmpl, {"name": name})
            key = "yes" if has_parking else "no"
            answer = phrases.get(key, "").format_map(defaultdict(str, {"name": name}))
        else:
            question = f"Is there parking available at {name}?"
            answer = (
                f"Yes, parking is available at {name}."
                if has_parking
                else f"No dedicated parking is listed for {name}."
            )
        faqs.append({"question": question, "answer": answer})

    # Q: Women's area
    has_womens = _truthy(attrs.get("has_womens_area"))
    if has_womens is not None:
        tmpl = _load_template("faq_womens_area", lang, session) if session else None
        if tmpl:
            phrases = tmpl.static_phrases or {}
            question = _render_template(tmpl, {"name": name})
            key = "yes" if has_womens else "no"
            answer = phrases.get(key, "").format_map(defaultdict(str, {"name": name}))
        else:
            question = f"Is there a women's prayer area at {name}?"
            answer = (
                f"Yes, {name} has a dedicated women's prayer area."
                if has_womens
                else f"No women's area information is currently listed for {name}."
            )
        faqs.append({"question": question, "answer": answer})

    # Q: Rating
    if rating_data and rating_data.get("average"):
        avg = rating_data["average"]
        count = rating_data.get("count", 0)
        tmpl = _load_template("faq_rating", lang, session) if session else None
        if tmpl:
            phrases = tmpl.static_phrases or {}
            question = _render_template(tmpl, {"name": name})
            answer_t = phrases.get("answer_template", "")
            review_word = "review" if count == 1 else "reviews"
            answer = answer_t.format_map(
                defaultdict(
                    str,
                    {
                        "name": name,
                        "avg": f"{avg:.1f}",
                        "count": str(count),
                        "review_word": review_word,
                    },
                )
            )
        else:
            question = f"How is {name} rated?"
            answer = (
                f"{name} has an average rating of {avg:.1f} out of 5 "
                f"based on {count} visitor review{'s' if count != 1 else ''} on SoulStep."
            )
        faqs.append({"question": question, "answer": answer})

    # Q: Location
    if address:
        tmpl = _load_template("faq_location", lang, session) if session else None
        if tmpl:
            phrases = tmpl.static_phrases or {}
            question = _render_template(tmpl, {"name": name})
            answer_t = phrases.get("answer_template", "{name} is located at {address}.")
            answer = answer_t.format_map(defaultdict(str, {"name": name, "address": address}))
        else:
            question = f"Where is {name} located?"
            answer = f"{name} is located at {address}."
        faqs.append({"question": question, "answer": answer})

    return faqs


def generate_image_alt_text(
    place: Place,
    display_order: int = 0,
    session: Session | None = None,
    lang: str = "en",
) -> str:
    """Generate SEO-friendly alt text for a place image."""
    name = place.name
    if session and lang != "en":
        name = _get_entity_text(place, "name", lang, session) or place.name

    if display_order > 0:
        if session:
            tmpl = _load_template("image_alt_secondary", lang, session)
            if tmpl:
                return _render_template(tmpl, {"name": name, "index": str(display_order + 1)})
        return f"{name} – interior view {display_order + 1}"

    if session:
        religion_labels, type_labels = _load_labels(lang, session)
    else:
        religion_labels, type_labels = _RELIGION_LABELS, _PLACE_TYPE_LABELS

    religion_label = religion_labels.get(place.religion, place.religion.title())
    type_label = type_labels.get(place.place_type, place.place_type.replace("_", " ").title())
    city = _extract_location(place.address)

    if session:
        tmpl = _load_template("image_alt_primary", lang, session)
        if tmpl:
            variables = {
                "name": name,
                "religion_label": religion_label,
                "type_label": type_label,
                "city": city,
            }
            if city:
                return _render_template(tmpl, variables)
            return _render_fallback(tmpl, variables)

    if city:
        return f"{name} – {religion_label} {type_label} in {city}"
    return f"{name} – {religion_label} {type_label}"


def backfill_image_alt_texts(place: Place, session: Session) -> int:
    """Generate and persist English alt text for all images of a place that have none.

    Skips images that already have alt_text set.  Returns the count updated.
    """
    images = session.exec(
        select(PlaceImage).where(
            PlaceImage.place_code == place.place_code,
            PlaceImage.alt_text.is_(None),  # type: ignore[arg-type]
        )
    ).all()

    updated = 0
    for img in images:
        alt = generate_image_alt_text(place, display_order=img.display_order or 0, session=session)
        img.alt_text = alt
        session.add(img)
        updated += 1

    if updated:
        session.commit()
        logger.debug("Backfilled alt text for %d image(s) on %s", updated, place.place_code)

    return updated


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
    """Generate and persist English SEO content for a place.

    If a PlaceSEO row already exists and is_manually_edited=True, the content
    is NOT overwritten unless force=True.

    Returns the PlaceSEO instance (created or updated).
    """
    existing = session.exec(select(PlaceSEO).where(PlaceSEO.place_code == place.place_code)).first()

    if existing and existing.is_manually_edited and not force:
        logger.info("Skipping SEO generation for %s — manually edited", place.place_code)
        return existing

    slug = generate_slug(place, session)
    seo_title = generate_seo_title(place, session=session, lang="en")
    meta_desc = generate_meta_description(place, rating_data, session=session, lang="en")
    rich_desc = generate_rich_description(place, rating_data, session=session, lang="en")
    faqs = generate_faqs(place, attrs, rating_data, session=session, lang="en")
    template_version = _get_max_template_version(session)

    now = datetime.now(UTC)
    if existing:
        existing.slug = slug
        existing.seo_title = seo_title
        existing.meta_description = meta_desc
        existing.rich_description = rich_desc
        existing.faq_json = faqs
        existing.template_version = template_version
        existing.generated_at = now
        existing.updated_at = now
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
        template_version=template_version,
        is_manually_edited=False,
        generated_at=now,
        updated_at=now,
    )
    session.add(place_seo)
    session.commit()
    session.refresh(place_seo)
    logger.info("Created SEO for %s (slug=%s)", place.place_code, slug)
    return place_seo


def upsert_place_seo_translation(
    place: Place,
    session: Session,
    lang: str,
    rating_data: dict[str, Any] | None = None,
    attrs: dict[str, Any] | None = None,
    force: bool = False,
) -> PlaceSEOTranslation:
    """Generate and persist non-English SEO content for a place."""
    existing = session.exec(
        select(PlaceSEOTranslation).where(
            PlaceSEOTranslation.place_code == place.place_code,
            PlaceSEOTranslation.lang == lang,
        )
    ).first()

    if existing and existing.is_manually_edited and not force:
        logger.info("Skipping %s SEO translation for %s — manually edited", lang, place.place_code)
        return existing

    seo_title = generate_seo_title(place, session=session, lang=lang)
    meta_desc = generate_meta_description(place, rating_data, session=session, lang=lang)
    rich_desc = generate_rich_description(place, rating_data, session=session, lang=lang)
    faqs = generate_faqs(place, attrs, rating_data, session=session, lang=lang)
    template_version = _get_max_template_version(session)

    now = datetime.now(UTC)
    if existing:
        existing.seo_title = seo_title
        existing.meta_description = meta_desc
        existing.rich_description = rich_desc
        existing.faq_json = faqs
        existing.template_version = template_version
        existing.generated_at = now
        existing.updated_at = now
        session.add(existing)
        session.commit()
        session.refresh(existing)
        logger.info("Updated %s SEO translation for %s", lang, place.place_code)
        return existing

    translation = PlaceSEOTranslation(
        place_code=place.place_code,
        lang=lang,
        seo_title=seo_title,
        meta_description=meta_desc,
        rich_description=rich_desc,
        faq_json=faqs,
        template_version=template_version,
        is_manually_edited=False,
        generated_at=now,
        updated_at=now,
    )
    session.add(translation)
    session.commit()
    session.refresh(translation)
    logger.info("Created %s SEO translation for %s", lang, place.place_code)
    return translation


def generate_all_langs(
    place: Place,
    session: Session,
    rating_data: dict[str, Any] | None = None,
    attrs: dict[str, Any] | None = None,
    force: bool = False,
    langs: list[str] | None = None,
) -> dict[str, PlaceSEO | PlaceSEOTranslation]:
    """Generate SEO for English + requested non-English languages.

    Only generates non-English if a translated name exists in ContentTranslation.
    """
    results: dict[str, PlaceSEO | PlaceSEOTranslation] = {}

    if langs is None or "en" in langs:
        results["en"] = upsert_place_seo(place, session, rating_data, attrs, force)

    target_langs = [lg for lg in (langs or ["ar", "hi", "te", "ml"]) if lg != "en"]
    for lang in target_langs:
        translated_name = ct_db.get_translation("place", place.place_code, "name", lang, session)
        if translated_name:
            results[lang] = upsert_place_seo_translation(
                place, session, lang, rating_data, attrs, force
            )
        else:
            logger.debug("Skipping %s SEO for %s — no translated name", lang, place.place_code)

    # Backfill image alt text for any images that still have none.
    backfill_image_alt_texts(place, session)

    return results
