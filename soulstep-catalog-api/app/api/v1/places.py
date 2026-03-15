import logging
import time

from fastapi import APIRouter, HTTPException, Query, Response
from fastapi.responses import RedirectResponse
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlmodel import Session, func, select

from app.api.deps import OptionalUserDep, UserDep
from app.db import check_ins as check_ins_db
from app.db import content_translations as ct_db
from app.db import favorites as favorites_db
from app.db import place_attributes as attr_db
from app.db import place_images, review_images
from app.db import places as places_db
from app.db import reviews as reviews_db
from app.db import store as user_store
from app.db.enums import ImageType, NotificationType, OpenStatus, Religion, ReviewSource
from app.db.locations import resolve_location_codes
from app.db.models import Place, PlaceSEO
from app.db.places import _haversine_km
from app.db.session import SessionDep, engine
from app.models.schemas import CheckInBody, PlaceBatch, PlaceCreate, ReviewCreateBody
from app.services.place_specifications import build_specifications
from app.services.place_timings import build_timings
from app.services.timezone_utils import get_today_name

logger = logging.getLogger(__name__)

# ── Named constants ────────────────────────────────────────────────────────────
NEARBY_RADIUS_KM = 10.0
NEARBY_LIMIT = 5
SIMILAR_LIMIT = 5
RECOMMENDED_CANDIDATE_LIMIT = 200

router = APIRouter()


def _normalize_hours(hours_dict: dict) -> dict:
    """Replace the sentinel '00:00-23:59' with 'OPEN_24_HOURS' in a hours dict."""
    return {k: ("OPEN_24_HOURS" if v == "00:00-23:59" else v) for k, v in hours_dict.items()}


def _place_to_item(
    place,
    session: Session,
    distance: float | None = None,
    include_rating: bool = False,
    attrs: dict | None = None,
    images: list[dict] | None = None,
    rating: dict | None = None,
    translations: dict | None = None,
) -> dict:
    d = distance
    if d is not None:
        d = round(d * 10) / 10

    # Fetch attributes if not provided
    if attrs is None:
        attrs = attr_db.get_attributes_dict(place.place_code, session)

    # Apply translation overlay for localizable text fields
    trans = translations or {}
    out = {
        "place_code": place.place_code,
        "name": trans.get("name", place.name),
        "religion": place.religion,
        "place_type": place.place_type,
        "lat": place.lat,
        "lng": place.lng,
        "address": trans.get("address", place.address),
        "opening_hours": place.opening_hours,
        "images": images
        if images is not None
        else place_images.get_images(place.place_code, session=session),
        "description": trans.get("description", place.description),
        "created_at": place.created_at,
        "distance": d,
        "city": place.city,
        "state": place.state,
        "country": place.country,
        "city_code": getattr(place, "city_code", None),
        "state_code": getattr(place, "state_code", None),
        "country_code": getattr(place, "country_code", None),
    }

    # Add UTC offset
    utc_offset_minutes = getattr(place, "utc_offset_minutes", None)
    if utc_offset_minutes is not None:
        out["utc_offset_minutes"] = utc_offset_minutes

    # Compute is_open_now using place's local time
    is_open = places_db._is_open_now_from_hours(place.opening_hours, utc_offset_minutes)
    out["is_open_now"] = is_open

    # Derive open_status string: "open" | "closed" | "unknown"
    if is_open is True:
        out["open_status"] = OpenStatus.OPEN
    elif is_open is False:
        out["open_status"] = OpenStatus.CLOSED
    else:
        out["open_status"] = OpenStatus.UNKNOWN

    # Add opening_hours_today - today's hours in local time (normalize 24h marker)
    if place.opening_hours and isinstance(place.opening_hours, dict):
        today_name = get_today_name(utc_offset_minutes)
        today_hours = place.opening_hours.get(today_name)
        if today_hours:
            normalized_today = today_hours if today_hours != "00:00-23:59" else "OPEN_24_HOURS"
            out["opening_hours_today"] = normalized_today

    # Normalize full opening_hours dict: replace "00:00-23:59" with "OPEN_24_HOURS" marker
    if place.opening_hours and isinstance(place.opening_hours, dict):
        out["opening_hours"] = _normalize_hours(place.opening_hours)

    if getattr(place, "website_url", None):
        out["website_url"] = place.website_url
    out["has_events"] = places_db._place_has_events(place, attrs)
    if include_rating:
        # Use passed rating if provided, otherwise fetch from DB
        if rating:
            agg = rating
        else:
            agg = reviews_db.get_aggregate_rating(place.place_code, session)
        if agg:
            out["average_rating"] = agg["average"]
            out["review_count"] = agg["count"]
    return out


def _place_detail(
    place,
    session: Session,
    lat: float | None = None,
    lng: float | None = None,
    lang: str | None = None,
    include_related: bool = True,
) -> dict:
    # Fetch attributes once and reuse
    attrs = attr_db.get_attributes_dict(place.place_code, session)
    rating = reviews_db.get_aggregate_rating(place.place_code, session)

    # Resolve translations for non-English locales
    translations = None
    if lang and lang != "en":
        translations = ct_db.get_translations_for_entity("place", place.place_code, lang, session)

    out = _place_to_item(
        place, session, include_rating=True, attrs=attrs, rating=rating, translations=translations
    )
    # Include distance only when caller supplies user coordinates
    if lat is not None and lng is not None:
        raw_dist = _haversine_km(lat, lng, place.lat, place.lng)
        out["distance"] = round(raw_dist * 10) / 10
    else:
        out.pop("distance", None)
    out["total_checkins_count"] = check_ins_db.count_check_ins_for_place(place.place_code, session)
    out["timings"] = build_timings(place, attrs=attrs, session=session)
    out["specifications"] = build_specifications(place, attrs=attrs, session=session, lang=lang)
    out["attributes"] = attrs
    # Append SEO slug if available
    seo = session.exec(select(PlaceSEO).where(PlaceSEO.place_code == place.place_code)).first()
    out["seo_slug"] = seo.slug if seo else None
    out["seo_title"] = seo.seo_title if seo else None
    out["seo_meta_description"] = seo.meta_description if seo else None
    out["seo_rich_description"] = seo.rich_description if seo else None
    out["seo_faq_json"] = seo.faq_json if seo else None
    out["seo_og_image_url"] = seo.og_image_url if seo else None
    out["updated_at"] = place.created_at.isoformat() if place.created_at else None

    if include_related:
        # Nearby places (within 10 km) — bounding-box pre-filter to avoid full scan
        nearby_with_dist = places_db.get_nearby_places(
            place.lat, place.lng, NEARBY_RADIUS_KM, place.place_code, session, limit=NEARBY_LIMIT
        )
        nearby_places = [p for _, p in nearby_with_dist]

        # Similar places (same religion)
        similar_places = session.exec(
            select(Place)
            .where(Place.religion == place.religion, Place.place_code != place.place_code)
            .limit(SIMILAR_LIMIT)
        ).all()

        # Build SEO slug map for related places
        related_codes = [p.place_code for p in nearby_places + similar_places]
        seo_rows = (
            session.exec(select(PlaceSEO).where(PlaceSEO.place_code.in_(related_codes))).all()
            if related_codes
            else []
        )
        seo_map = {s.place_code: s for s in seo_rows}

        # Bulk fetch images and ratings for related places (avoids N+1)
        related_images_bulk = (
            place_images.get_images_bulk(related_codes, session) if related_codes else {}
        )
        related_ratings_bulk = (
            reviews_db.get_aggregate_ratings_bulk(related_codes, session) if related_codes else {}
        )

        def _related_item(p) -> dict:
            rel_seo = seo_map.get(p.place_code)
            rel_imgs = related_images_bulk.get(p.place_code, [])
            agg = related_ratings_bulk.get(p.place_code)
            return {
                "place_code": p.place_code,
                "name": p.name,
                "address": p.address,
                "religion": p.religion,
                "seo_slug": rel_seo.slug if rel_seo else None,
                "image_url": rel_imgs[0]["url"] if rel_imgs else None,
                "average_rating": agg["average"] if agg else None,
                "lat": p.lat,
                "lng": p.lng,
            }

        out["nearby_places"] = [_related_item(p) for p in nearby_places]
        out["similar_places"] = [_related_item(p) for p in similar_places]
    else:
        out["nearby_places"] = []
        out["similar_places"] = []
    return out


@router.get("/count")
def get_places_count(session: SessionDep, response: Response):
    """Return the total count of all places in the database."""
    total = session.exec(select(func.count(Place.id))).one()
    response.headers["Cache-Control"] = "public, max-age=600"
    return {"total": total}


@router.get("/recommended")
def get_recommended_places(
    session: SessionDep,
    user: OptionalUserDep,
    lat: float | None = Query(None),
    lng: float | None = Query(None),
    religions: list[str] | None = Query(None),
    limit: int = Query(20, le=100),
):
    """Return personalised place recommendations: nearby + matching religion preference.

    If lat/lng are provided, sorts by distance. Falls back to a random sample
    if no location is given. Excludes places the user has already checked in to.
    """
    from sqlalchemy import or_ as _or
    from sqlmodel import select as _select

    # Fetch places by religion preference
    stmt = _select(Place)
    valid_religions = [r for r in (religions or []) if r and r != "all"]
    if valid_religions:
        stmt = stmt.where(_or(*[Place.religion == r for r in valid_religions]))
    places_raw = session.exec(stmt.limit(200)).all()

    # Exclude already-checked-in places for authenticated users
    excluded: set[str] = set()
    if user:
        user_checkins = check_ins_db.get_check_ins_for_users([user.user_code], session)
        excluded = {c.place_code for c in user_checkins}

    candidates = [p for p in places_raw if p.place_code not in excluded]

    # Sort by distance if location provided; compute distance once (avoid double calculation)
    if lat is not None and lng is not None:
        candidates_with_dist = [(p, _haversine_km(lat, lng, p.lat, p.lng)) for p in candidates]
        candidates_with_dist.sort(key=lambda pd: pd[1])
        results_with_dist = candidates_with_dist[:limit]
    else:
        results_with_dist = [(p, None) for p in candidates[:limit]]

    result_codes = [p.place_code for p, _ in results_with_dist]
    result_images = place_images.get_images_bulk(result_codes, session)

    # Build lightweight response
    out = []
    for p, raw_dist in results_with_dist:
        imgs = result_images.get(p.place_code, [])
        img_url = imgs[0]["url"] if imgs else None
        dist = round(raw_dist * 10) / 10 if raw_dist is not None else None
        out.append(
            {
                "place_code": p.place_code,
                "name": p.name,
                "religion": p.religion,
                "address": p.address,
                "city": p.city,
                "lat": p.lat,
                "lng": p.lng,
                "image_url": img_url,
                "distance_km": dist,
            }
        )
    return out


@router.get("")
def list_places(
    session: SessionDep,
    religion: list[Religion] | None = Query(
        None, description="Filter by religion(s); repeat for multiple; omit for all"
    ),
    lat: float | None = Query(None),
    lng: float | None = Query(None),
    radius: float | None = Query(None, description="Radius in km"),
    place_type: str | None = Query(None),
    search: str | None = Query(None),
    sort: str | None = Query(None, description="proximity or rating"),
    limit: int = Query(50, le=500),
    cursor: str | None = Query(
        None, description="place_code of the last seen item; omit for the first page"
    ),
    jummah: bool | None = Query(
        None, description="If true, only places with Jummah / Friday prayer (Islam)"
    ),
    has_events: bool | None = Query(None, description="If true, only places that have events"),
    include_rating: bool = Query(
        True, description="Include average_rating and review_count in list items"
    ),
    open_now: bool | None = Query(None, description="If true, only currently open places"),
    has_parking: bool | None = Query(None, description="If true, only places with parking"),
    womens_area: bool | None = Query(None, description="If true, only places with a women's area"),
    top_rated: bool | None = Query(None, description="If true, only places rated 4.0 or above"),
    include_checkins: bool = Query(
        False, description="If true, include total_checkins_count per place"
    ),
    lang: str | None = Query(
        None, description="BCP-47 language code for localized content (e.g. ar, hi, te)"
    ),
    min_lat: float | None = Query(None, description="South boundary of map viewport"),
    max_lat: float | None = Query(None, description="North boundary of map viewport"),
    min_lng: float | None = Query(None, description="West boundary of map viewport"),
    max_lng: float | None = Query(None, description="East boundary of map viewport"),
    city: str | None = Query(None, description="Filter by city name (case-insensitive)"),
):
    religions = religion
    result = places_db.list_places(
        session=session,
        religions=religions,
        lat=lat,
        lng=lng,
        radius_km=radius,
        place_type=place_type,
        search=search,
        sort=sort,
        limit=limit,
        cursor=cursor,
        jummah=jummah,
        has_events=has_events,
        open_now=open_now,
        has_parking=has_parking,
        womens_area=womens_area,
        top_rated=top_rated,
        min_lat=min_lat,
        max_lat=max_lat,
        min_lng=min_lng,
        max_lng=max_lng,
        city=city,
    )
    # Use bulk-fetched attributes, ratings, and images for efficiency
    all_attrs = result["all_attrs"]
    all_ratings = result.get("all_ratings", {})
    place_codes = [p.place_code for p, _ in result["rows"]]

    all_images = place_images.get_images_bulk(place_codes, session)
    all_checkins = (
        check_ins_db.count_check_ins_bulk(place_codes, session) if include_checkins else {}
    )

    # Bulk-fetch translations for non-English locales (English fast path: zero overhead)
    all_translations: dict[str, dict[str, str]] = {}
    if lang and lang != "en":
        all_translations = ct_db.bulk_get_translations("place", place_codes, lang, session)

    places_out = []
    for p, dist in result["rows"]:
        item = _place_to_item(
            p,
            session,
            dist,
            include_rating=include_rating,
            attrs=all_attrs.get(p.place_code, {}),
            images=all_images.get(p.place_code, []),
            rating=all_ratings.get(p.place_code) if include_rating else None,
            translations=all_translations.get(p.place_code),
        )
        if include_checkins:
            item["total_checkins_count"] = all_checkins.get(p.place_code, 0)
        places_out.append(item)

    return {
        "places": places_out,
        "filters": result["filters"],
        "next_cursor": result.get("next_cursor"),
    }


@router.get("/{place_code}")
def get_place(
    place_code: str,
    session: SessionDep,
    user: OptionalUserDep = None,
    lat: float | None = Query(None, description="User latitude for distance computation"),
    lng: float | None = Query(None, description="User longitude for distance computation"),
    lang: str | None = Query(
        None, description="BCP-47 language code for localized content (e.g. ar, hi, te)"
    ),
    include_related: bool = Query(
        True, description="Include nearby and similar places (set false to reduce latency)"
    ),
):
    place = places_db.get_place_by_code(place_code, session)
    if not place:
        raise HTTPException(status_code=404, detail="Place not found")
    out = _place_detail(
        place, session, lat=lat, lng=lng, lang=lang, include_related=include_related
    )
    if user:
        out["user_has_checked_in"] = check_ins_db.has_checked_in(
            user.user_code, place_code, session
        )
        out["is_favorite"] = favorites_db.is_favorite(user.user_code, place_code, session)
    return out


@router.get("/{place_code}/reviews")
def get_place_reviews(
    place_code: str,
    session: SessionDep,
    limit: int = Query(5),
    offset: int = Query(0),
    lang: str | None = Query(None),
):
    if not places_db.get_place_by_code(place_code, session):
        raise HTTPException(status_code=404, detail="Place not found")
    rows = reviews_db.get_reviews_by_place(place_code, session, limit=limit, offset=offset)

    agg = reviews_db.get_aggregate_rating(place_code, session)

    # Batch-fetch review images for all reviews in a single query
    review_codes = [r.review_code for r in rows]
    all_review_images = review_images.get_review_images_bulk(review_codes, session=session)

    # Bulk-fetch review translations if a non-English lang is requested
    all_review_translations: dict = {}
    if lang and lang != "en":
        all_review_translations = ct_db.bulk_get_translations("review", review_codes, lang, session)

    # Bulk-fetch users for non-anonymous reviews in one query
    non_anon_codes = [
        r.user_code for r in rows if r.user_code and not getattr(r, "is_anonymous", False)
    ]
    users_map = user_store.get_users_bulk(non_anon_codes, session) if non_anon_codes else {}

    out = []
    for r in rows:
        source = getattr(r, "source", ReviewSource.USER)

        # Use pre-fetched images for this review
        review_image_urls = all_review_images.get(r.review_code, [])
        attached_urls = [img["url"] for img in review_image_urls]

        # Merge with external photo URLs
        external_urls = getattr(r, "photo_urls", []) or []
        all_photo_urls = attached_urls + external_urls

        # Apply translation overlay
        trans = all_review_translations.get(r.review_code, {})
        translated_title = trans.get("title", r.title)
        translated_body = trans.get("body", r.body)

        if source == ReviewSource.EXTERNAL:
            # External review
            out.append(
                {
                    "review_code": r.review_code,
                    "place_code": r.place_code,
                    "user_code": None,
                    "display_name": getattr(r, "author_name", "External User"),
                    "rating": r.rating,
                    "title": translated_title,
                    "body": translated_body,
                    "created_at": r.created_at,
                    "is_anonymous": False,
                    "photo_urls": all_photo_urls,
                    "source": ReviewSource.EXTERNAL,
                }
            )
        else:
            # User review
            is_anon = getattr(r, "is_anonymous", False)
            user = users_map.get(r.user_code) if r.user_code and not is_anon else None
            out.append(
                {
                    "review_code": r.review_code,
                    "place_code": r.place_code,
                    "user_code": r.user_code if not is_anon else None,
                    "display_name": "Anonymous"
                    if is_anon
                    else (user.display_name if user else "Unknown"),
                    "rating": r.rating,
                    "title": translated_title,
                    "body": translated_body,
                    "created_at": r.created_at,
                    "is_anonymous": is_anon,
                    "photo_urls": all_photo_urls,
                    "source": ReviewSource.USER,
                }
            )

    result = {"reviews": out}
    if agg:
        result["average_rating"] = agg["average"]
        result["review_count"] = agg["count"]
    return result


@router.post("/{place_code}/check-in")
def check_in(
    place_code: str,
    body: CheckInBody,
    session: SessionDep,
    user: UserDep,
):
    from app.db import groups as groups_db
    from app.db import notifications as notifications_db

    place = places_db.get_place_by_code(place_code, session)
    if not place:
        raise HTTPException(status_code=404, detail="Place not found")

    group_code = body.group_code
    if group_code:
        group = groups_db.get_group_by_code(group_code, session)
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")
        if not groups_db.is_member(group_code, user.user_code, session):
            raise HTTPException(status_code=403, detail="Not a member of this group")
        path = group.path_place_codes or []
        if path and place_code not in path:
            raise HTTPException(status_code=400, detail="Place is not in this group's itinerary")

    row = check_ins_db.create_check_in(
        user.user_code,
        place_code,
        session,
        note=body.note,
        photo_url=body.photo_url,
        group_code=group_code,
    )

    # Notify other group members of the check-in
    if group_code and group:
        members = groups_db.get_members(group_code, session)
        for member_code, _role, _joined in members:
            if member_code == user.user_code:
                continue
            notifications_db.create_notification(
                member_code,
                NotificationType.GROUP_CHECK_IN,
                {
                    "group_code": group_code,
                    "group_name": group.name,
                    "place_code": place_code,
                    "place_name": place.name,
                    "user_code": user.user_code,
                    "display_name": user.display_name,
                },
                session,
            )

    return {
        "check_in_code": row.check_in_code,
        "place_code": row.place_code,
        "checked_in_at": row.checked_in_at,
        "note": row.note,
        "photo_url": row.photo_url,
        "group_code": row.group_code,
    }


@router.post("/{place_code}/favorite")
def add_favorite(
    place_code: str,
    session: SessionDep,
    user: UserDep,
):
    if not places_db.get_place_by_code(place_code, session):
        raise HTTPException(status_code=404, detail="Place not found")
    favorites_db.add_favorite(user.user_code, place_code, session)
    return {"ok": True}


@router.delete("/{place_code}/favorite")
def remove_favorite(
    place_code: str,
    session: SessionDep,
    user: UserDep,
):
    favorites_db.remove_favorite(user.user_code, place_code, session)
    return {"ok": True}


@router.post("/{place_code}/reviews")
def create_review(
    place_code: str,
    body: ReviewCreateBody,
    session: SessionDep,
    user: UserDep,
):
    if not places_db.get_place_by_code(place_code, session):
        raise HTTPException(status_code=404, detail="Place not found")
    if not (1 <= body.rating <= 5):
        raise HTTPException(status_code=400, detail="Rating must be 1-5")

    # Parse photo_urls to extract internal image IDs and external URLs
    image_ids = []
    external_urls = []
    if body.photo_urls:
        for url in body.photo_urls:
            # Check if it's an internal image URL: /api/v1/reviews/images/{id}
            if url.startswith("/api/v1/reviews/images/"):
                try:
                    image_id = int(url.split("/")[-1])
                    image_ids.append(image_id)
                except (ValueError, IndexError):
                    raise HTTPException(status_code=400, detail=f"Invalid image URL: {url}")
            else:
                # External URL
                external_urls.append(url)

    # Create the review with external URLs only
    row = reviews_db.create_review(
        user.user_code,
        place_code,
        body.rating,
        session,
        title=body.title,
        body=body.body,
        is_anonymous=body.is_anonymous or False,
        photo_urls=external_urls,
    )

    # Attach uploaded images to the review
    if image_ids:
        try:
            review_images.attach_images_to_review(
                review_code=row.review_code,
                image_ids=image_ids,
                user_code=user.user_code,
                session=session,
            )
        except ValueError as e:
            # Clean up the review if image attachment fails
            reviews_db.delete_review(row.review_code, session)
            raise HTTPException(status_code=400, detail=str(e))

    # Fetch full photo URLs (including attached images)
    review_image_urls = review_images.get_review_images(row.review_code, session=session)
    all_photo_urls = [img["url"] for img in review_image_urls] + external_urls

    return {
        "review_code": row.review_code,
        "place_code": row.place_code,
        "rating": row.rating,
        "title": row.title,
        "body": row.body,
        "created_at": row.created_at,
        "is_anonymous": row.is_anonymous,
        "photo_urls": all_photo_urls,
    }


def _persist_place_translations(place_code: str, translations, session: Session) -> None:
    """Upsert ContentTranslation rows from a PlaceTranslationInput."""
    from app.models.schemas import PlaceTranslationInput

    if not isinstance(translations, PlaceTranslationInput):
        return
    any_written = False
    for field, lang_map in [
        ("name", translations.name),
        ("description", translations.description),
        ("address", translations.address),
    ]:
        if not lang_map:
            continue
        for lang, text in lang_map.items():
            if lang and text and lang != "en":
                ct_db.upsert_translation(
                    entity_type="place",
                    entity_code=place_code,
                    field=field,
                    lang=lang,
                    text=text,
                    source="scraper",
                    session=session,
                    commit=False,
                )
                any_written = True
    if any_written:
        session.commit()


def _upsert_single_place(
    place_data,
    session: Session,
    existing_map: dict[str, Place] | None = None,
    loc_cache: dict[tuple, tuple] | None = None,
) -> tuple:
    """Create or update a single place and all its related data.

    Args:
        existing_map: Pre-fetched {place_code: Place} dict (batch optimisation).
                      When None, falls back to a single SELECT.
        loc_cache:    Per-batch {(city, state, country): (city_code, state_code, country_code)}
                      cache to avoid repeated location lookups for the same strings.

    Returns:
        (place_row, action) where action is "created" or "updated".
    """
    city_str = getattr(place_data, "city", None)
    state_str = getattr(place_data, "state", None)
    country_str = getattr(place_data, "country", None)

    loc_key = (city_str, state_str, country_str)
    if loc_cache is not None:
        if loc_key not in loc_cache:
            loc_cache[loc_key] = resolve_location_codes(city_str, state_str, country_str, session)
        city_code, state_code, country_code = loc_cache[loc_key]
    else:
        city_code, state_code, country_code = resolve_location_codes(
            city_str, state_str, country_str, session
        )

    existing = (
        existing_map.get(place_data.place_code)
        if existing_map is not None
        else places_db.get_place_by_code(place_data.place_code, session)
    )

    shared_kwargs = {
        "session": session,
        "name": place_data.name,
        "religion": place_data.religion,
        "place_type": place_data.place_type,
        "lat": place_data.lat,
        "lng": place_data.lng,
        "address": place_data.address,
        "opening_hours": place_data.opening_hours,
        "utc_offset_minutes": getattr(place_data, "utc_offset_minutes", None),
        "description": place_data.description,
        "website_url": place_data.website_url,
        "source": place_data.source,
        "city": city_str,
        "state": state_str,
        "country": country_str,
        "city_code": city_code,
        "state_code": state_code,
        "country_code": country_code,
    }

    if existing:
        row = places_db.update_place(place_code=place_data.place_code, **shared_kwargs)
        action = "updated"
    else:
        row = places_db.create_place(place_code=place_data.place_code, **shared_kwargs)
        action = "created"

    # Only upload/set images if the place is new, or if it has no images yet.
    # Skipping re-upload for existing places with images prevents redundant GCS
    # uploads on every sync run (scraper sends the same blobs each time).
    if not place_images.has_images(place_data.place_code, session):
        if place_data.image_blobs:
            try:
                place_images.set_images_from_blobs(
                    place_data.place_code, place_data.image_blobs, session=session
                )
            except Exception as e:
                logger.error(
                    "Failed to store image blobs for %s: %s",
                    place_data.place_code,
                    e,
                    exc_info=True,
                )
        elif place_data.image_urls:
            place_images.set_images_from_urls(
                place_data.place_code, place_data.image_urls, session=session
            )

    if place_data.attributes:
        attr_db.bulk_upsert_attributes(place_data.place_code, place_data.attributes, session)
        session.commit()

    if place_data.external_reviews:
        reviews_db.upsert_external_reviews(
            place_data.place_code, place_data.external_reviews, session
        )

    if place_data.translations:
        _persist_place_translations(place_data.place_code, place_data.translations, session)

    return row, action


_BATCH_CHUNK_SIZE = 50


_MAX_CHUNK_RETRIES = 3


def _process_chunk(chunk: list[PlaceCreate]) -> list[dict]:
    """Upsert one chunk of places using a dedicated short-lived session.

    Opens and closes its own Session so the connection is returned to the pool
    as soon as the chunk finishes. A DB-level error (e.g. pool timeout) only
    affects this chunk; the caller continues with the remaining chunks.

    Retries up to _MAX_CHUNK_RETRIES times on OperationalError (pool timeout /
    transient connection error) with exponential backoff (1s, 2s).
    """
    chunk_codes = [p.place_code for p in chunk]
    last_op_err: OperationalError | None = None

    for attempt in range(_MAX_CHUNK_RETRIES):
        if attempt:
            delay = 2 ** (attempt - 1)  # 1s, 2s
            logger.warning(
                "Chunk DB retry %d/%d (%d places) in %ds: %s",
                attempt + 1,
                _MAX_CHUNK_RETRIES,
                len(chunk),
                delay,
                last_op_err,
            )
            time.sleep(delay)

        results: list[dict] = []
        with Session(engine) as session:
            try:
                existing_rows = session.exec(
                    select(Place).where(Place.place_code.in_(chunk_codes))
                ).all()
            except OperationalError as e:
                # Pool timeout or transient connection error — retry
                last_op_err = e
                continue
            except Exception as e:
                logger.warning("Chunk pre-fetch failed (%s places): %s", len(chunk), e)
                return [
                    {"place_code": p.place_code, "ok": False, "error": f"db_unavailable: {e}"}
                    for p in chunk
                ]

            existing_map: dict[str, Place] = {p.place_code: p for p in existing_rows}
            loc_cache: dict[tuple, tuple] = {}

            for place_data in chunk:
                try:
                    _, action = _upsert_single_place(place_data, session, existing_map, loc_cache)
                    results.append(
                        {"place_code": place_data.place_code, "ok": True, "action": action}
                    )
                except IntegrityError:
                    # Race condition: concurrent request inserted this place between our
                    # pre-fetch and our INSERT. Roll back, re-fetch the row, then update.
                    session.rollback()
                    try:
                        existing = places_db.get_place_by_code(place_data.place_code, session)
                        if existing:
                            existing_map[place_data.place_code] = existing
                        _, action = _upsert_single_place(
                            place_data, session, existing_map, loc_cache
                        )
                        results.append(
                            {"place_code": place_data.place_code, "ok": True, "action": action}
                        )
                    except Exception as retry_err:
                        session.rollback()
                        logger.warning(
                            "Failed to upsert place %s after IntegrityError retry: %s",
                            place_data.place_code,
                            retry_err,
                            exc_info=True,
                        )
                        results.append(
                            {
                                "place_code": place_data.place_code,
                                "ok": False,
                                "error": str(retry_err),
                            }
                        )
                except Exception as e:
                    session.rollback()
                    logger.warning(
                        "Failed to upsert place %s: %s",
                        place_data.place_code,
                        e,
                        exc_info=True,
                    )
                    results.append(
                        {"place_code": place_data.place_code, "ok": False, "error": str(e)}
                    )

        return results  # success

    logger.warning(
        "Chunk pre-fetch failed after %d attempts (%d places): %s",
        _MAX_CHUNK_RETRIES,
        len(chunk),
        last_op_err,
    )
    return [
        {"place_code": p.place_code, "ok": False, "error": f"db_unavailable: {last_op_err}"}
        for p in chunk
    ]


@router.post("/batch")
def batch_create_places(body: PlaceBatch):
    """Create or update multiple places in a single request (up to 500).

    Places are processed in chunks of up to 50. Each chunk uses its own
    short-lived DB session so a connection-pool timeout or transient DB error
    only fails that chunk's places — the remaining chunks still run.

    Optimisations within each chunk:
    - Existing Place rows are pre-fetched in a single SELECT per chunk.
    - Location strings are resolved once per unique (city, state, country) tuple
      and cached for the duration of the chunk.
    - Attributes are upserted in a single round-trip instead of one commit each.
    - A failed place triggers a session rollback; already-committed places are
      not rolled back.

    Returns a summary with per-place action ("created" | "updated") and errors.
    """
    # Deduplicate: last item for each place_code wins
    seen: dict[str, PlaceCreate] = {}
    for p in body.places:
        seen[p.place_code] = p
    places = list(seen.values())

    results: list[dict] = []
    for i in range(0, len(places), _BATCH_CHUNK_SIZE):
        chunk = places[i : i + _BATCH_CHUNK_SIZE]
        results.extend(_process_chunk(chunk))

    success = sum(1 for r in results if r["ok"])
    duplicates = len(body.places) - len(places)
    return {
        "total": len(body.places),
        "unique": len(places),
        "synced": success,
        "failed": len(results) - success,
        "duplicates_skipped": duplicates,
        "results": results,
    }


@router.post("")
def create_place(
    body: PlaceCreate,
    session: SessionDep,
):
    """
    Create a new place or update an existing one if place_code matches.
    """
    row, _ = _upsert_single_place(body, session)
    return _place_detail(row, session)


@router.get("/{place_code}/images/{image_id}")
def get_place_image(
    place_code: str,
    image_id: int,
    session: SessionDep,
):
    """Serve a blob image for a place."""
    image = place_images.get_image_by_id(image_id, session=session)
    if not image or image.place_code != place_code:
        raise HTTPException(status_code=404, detail="Image not found")

    if image.image_type == ImageType.GCS and image.gcs_url:
        return RedirectResponse(url=image.gcs_url, status_code=301)

    if image.image_type != ImageType.BLOB or not image.blob_data:
        raise HTTPException(status_code=404, detail="Image not found")

    return Response(
        content=image.blob_data,
        media_type=image.mime_type or "image/jpeg",
    )
