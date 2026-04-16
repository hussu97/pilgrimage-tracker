"""Central place serialization — single source of truth for all place dicts.

Three tiers:
  serialize_place_minimal  — carousels, related items, city listings, check-in history
  serialize_place_item     — list endpoints, homepage, favorites
  serialize_place_detail   — single-place detail page
"""

from __future__ import annotations

from sqlmodel import Session, select

from app.db import check_ins as check_ins_db
from app.db import place_attributes as attr_db
from app.db import place_images
from app.db import places as places_db
from app.db import reviews as reviews_db
from app.db.enums import OpenStatus
from app.db.models import Place, PlaceSEO
from app.db.places import _haversine_km, _is_open_now_from_hours
from app.services.place_specifications import build_specifications
from app.services.place_timings import build_timings
from app.services.timezone_utils import get_today_name

# ── Helpers ───────────────────────────────────────────────────────────────────


def is_24h(v: str) -> bool:
    """Check if a hours value represents 'open 24 hours'."""
    return v == "00:00-23:59" or (isinstance(v, str) and "24 hours" in v.lower())


def normalize_hours(hours_dict: dict) -> dict:
    """Replace 24-hour sentinels with 'OPEN_24_HOURS' marker."""
    return {k: ("OPEN_24_HOURS" if is_24h(v) else v) for k, v in hours_dict.items()}


def compute_open_fields(place) -> dict:
    """Compute is_open_now, open_status, opening_hours_today, and normalized hours."""
    utc_offset = getattr(place, "utc_offset_minutes", None)
    is_open = _is_open_now_from_hours(place.opening_hours, utc_offset)

    out: dict = {
        "is_open_now": is_open,
        "open_status": (
            OpenStatus.OPEN
            if is_open is True
            else OpenStatus.CLOSED
            if is_open is False
            else OpenStatus.UNKNOWN
        ),
    }

    if place.opening_hours and isinstance(place.opening_hours, dict):
        today_name = get_today_name(utc_offset)
        today_hours = place.opening_hours.get(today_name)
        if today_hours:
            out["opening_hours_today"] = "OPEN_24_HOURS" if is_24h(today_hours) else today_hours
        out["opening_hours"] = normalize_hours(place.opening_hours)

    return out


def primary_image_url(images: list[dict]) -> str | None:
    """Extract the first image URL from an images list."""
    return images[0]["url"] if images else None


def _round_distance(d: float | None) -> float | None:
    if d is None:
        return None
    return round(d * 10) / 10


# ── Tier A: Minimal ──────────────────────────────────────────────────────────


def serialize_place_minimal(
    place,
    *,
    images: list[dict] | None = None,
    image_url: str | None = ...,  # sentinel: auto-derive from images
    distance: float | None = None,
    rating: dict | None = None,
    translations: dict | None = None,
    seo_slug: str | None = None,
) -> dict:
    """Lightweight place dict for carousels, related items, city listings.

    Includes open_status so every place surface shows open/closed.
    """
    trans = translations or {}
    imgs = images if images is not None else []
    derived_url = primary_image_url(imgs) if image_url is ... else image_url

    out: dict = {
        "place_code": place.place_code,
        "name": trans.get("name", place.name),
        "religion": place.religion,
        "place_type": place.place_type,
        "address": trans.get("address", place.address),
        "lat": place.lat,
        "lng": place.lng,
        "city": place.city,
        "image_url": derived_url,
        "images": imgs,
        "distance": _round_distance(distance),
        "distance_km": _round_distance(distance),  # legacy alias used by frontends
        **compute_open_fields(place),
    }
    if seo_slug is not None:
        out["seo_slug"] = seo_slug
    if rating:
        out["average_rating"] = rating["average"]
        out["review_count"] = rating.get("count")
    return out


# ── Tier B: Item ─────────────────────────────────────────────────────────────


def serialize_place_item(
    place,
    session: Session,
    *,
    distance: float | None = None,
    include_rating: bool = True,
    attrs: dict | None = None,
    images: list[dict] | None = None,
    rating: dict | None = None,
    translations: dict | None = None,
) -> dict:
    """Full place dict for list endpoints, homepage carousels, favorites."""
    if attrs is None:
        attrs = attr_db.get_attributes_dict(place.place_code, session)
    if images is None:
        images = place_images.get_images(place.place_code, session=session)

    trans = translations or {}

    out: dict = {
        "place_code": place.place_code,
        "name": trans.get("name", place.name),
        "religion": place.religion,
        "place_type": place.place_type,
        "lat": place.lat,
        "lng": place.lng,
        "address": trans.get("address", place.address),
        "opening_hours": place.opening_hours,
        "images": images,
        "description": trans.get("description", place.description),
        "created_at": place.created_at,
        "distance": _round_distance(distance),
        "city": place.city,
        "state": place.state,
        "country": place.country,
        "city_code": getattr(place, "city_code", None),
        "state_code": getattr(place, "state_code", None),
        "country_code": getattr(place, "country_code", None),
    }

    utc_offset_minutes = getattr(place, "utc_offset_minutes", None)
    if utc_offset_minutes is not None:
        out["utc_offset_minutes"] = utc_offset_minutes

    # Open status fields (overwrites raw opening_hours with normalized version)
    out.update(compute_open_fields(place))

    if getattr(place, "website_url", None):
        out["website_url"] = place.website_url
    out["has_events"] = places_db._place_has_events(place, attrs)

    if include_rating:
        agg = rating if rating else reviews_db.get_aggregate_rating(place.place_code, session)
        if agg:
            out["average_rating"] = agg["average"]
            out["review_count"] = agg["count"]

    return out


# ── Tier C: Detail ───────────────────────────────────────────────────────────

NEARBY_RADIUS_KM = 10.0
NEARBY_LIMIT = 5
SIMILAR_LIMIT = 5


def serialize_place_detail(
    place,
    session: Session,
    *,
    lat: float | None = None,
    lng: float | None = None,
    lang: str | None = None,
    include_related: bool = True,
) -> dict:
    """Complete place dict for the detail page."""
    from app.db import content_translations as ct_db

    attrs = attr_db.get_attributes_dict(place.place_code, session)
    rating = reviews_db.get_aggregate_rating(place.place_code, session)

    translations = None
    if lang and lang != "en":
        translations = ct_db.get_translations_for_entity("place", place.place_code, lang, session)

    dist = (
        _haversine_km(lat, lng, place.lat, place.lng)
        if lat is not None and lng is not None
        else None
    )

    out = serialize_place_item(
        place,
        session,
        distance=dist,
        include_rating=True,
        attrs=attrs,
        rating=rating,
        translations=translations,
    )

    # Remove distance key when no coordinates supplied
    if dist is None:
        out.pop("distance", None)

    out["total_checkins_count"] = check_ins_db.count_check_ins_for_place(place.place_code, session)
    out["timings"] = build_timings(place, attrs=attrs, session=session)
    out["specifications"] = build_specifications(place, attrs=attrs, session=session, lang=lang)
    out["attributes"] = attrs

    seo = session.exec(select(PlaceSEO).where(PlaceSEO.place_code == place.place_code)).first()
    out["seo_slug"] = seo.slug if seo else None
    out["seo_title"] = seo.seo_title if seo else None
    out["seo_meta_description"] = seo.meta_description if seo else None
    out["seo_rich_description"] = seo.rich_description if seo else None
    out["seo_faq_json"] = seo.faq_json if seo else None
    out["seo_og_image_url"] = seo.og_image_url if seo else None
    out["updated_at"] = place.created_at.isoformat() if place.created_at else None

    if include_related:
        if place.lat is not None and place.lng is not None:
            nearby_with_dist = places_db.get_nearby_places(
                place.lat,
                place.lng,
                NEARBY_RADIUS_KM,
                place.place_code,
                session,
                limit=NEARBY_LIMIT,
            )
        else:
            nearby_with_dist = []
        nearby_places = [p for _, p in nearby_with_dist]

        similar_places = session.exec(
            select(Place)
            .where(Place.religion == place.religion, Place.place_code != place.place_code)
            .limit(SIMILAR_LIMIT)
        ).all()

        related_codes = [p.place_code for p in nearby_places + similar_places]
        seo_rows = (
            session.exec(select(PlaceSEO).where(PlaceSEO.place_code.in_(related_codes))).all()
            if related_codes
            else []
        )
        seo_map = {s.place_code: s for s in seo_rows}

        related_images_bulk = (
            place_images.get_images_bulk(related_codes, session) if related_codes else {}
        )
        related_ratings_bulk = (
            reviews_db.get_aggregate_ratings_bulk(related_codes, session) if related_codes else {}
        )

        def _related(p: Place) -> dict:
            rel_seo = seo_map.get(p.place_code)
            rel_imgs = related_images_bulk.get(p.place_code, [])
            return serialize_place_minimal(
                p,
                images=rel_imgs,
                rating=related_ratings_bulk.get(p.place_code),
                seo_slug=rel_seo.slug if rel_seo else None,
            )

        out["nearby_places"] = [_related(p) for p in nearby_places]
        out["similar_places"] = [_related(p) for p in similar_places]
    else:
        out["nearby_places"] = []
        out["similar_places"] = []

    return out
