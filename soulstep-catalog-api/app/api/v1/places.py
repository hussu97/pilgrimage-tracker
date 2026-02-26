import logging

from fastapi import APIRouter, HTTPException, Query, Response
from fastapi.responses import RedirectResponse
from sqlmodel import Session, select

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
from app.db.models import PlaceSEO
from app.db.places import _haversine_km
from app.db.session import SessionDep
from app.models.schemas import CheckInBody, PlaceBatch, PlaceCreate, ReviewCreateBody
from app.services.place_specifications import build_specifications
from app.services.place_timings import build_timings
from app.services.timezone_utils import get_today_name

logger = logging.getLogger(__name__)

router = APIRouter()


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
        normalized_hours = {
            k: ("OPEN_24_HOURS" if v == "00:00-23:59" else v)
            for k, v in place.opening_hours.items()
        }
        out["opening_hours"] = normalized_hours

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
    limit: int = Query(50),
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
):
    place = places_db.get_place_by_code(place_code, session)
    if not place:
        raise HTTPException(status_code=404, detail="Place not found")
    out = _place_detail(place, session, lat=lat, lng=lng, lang=lang)
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
            user = (
                user_store.get_user_by_code(r.user_code, session)
                if r.user_code and not is_anon
                else None
            )
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
                )


def _upsert_single_place(place_data, session: Session):
    """Create or update a single place and its related data (images, attrs, reviews, translations)."""
    existing = places_db.get_place_by_code(place_data.place_code, session)
    if existing:
        row = places_db.update_place(
            place_code=place_data.place_code,
            session=session,
            name=place_data.name,
            religion=place_data.religion,
            place_type=place_data.place_type,
            lat=place_data.lat,
            lng=place_data.lng,
            address=place_data.address,
            opening_hours=place_data.opening_hours,
            utc_offset_minutes=getattr(place_data, "utc_offset_minutes", None),
            description=place_data.description,
            website_url=place_data.website_url,
            source=place_data.source,
        )
    else:
        row = places_db.create_place(
            place_code=place_data.place_code,
            session=session,
            name=place_data.name,
            religion=place_data.religion,
            place_type=place_data.place_type,
            lat=place_data.lat,
            lng=place_data.lng,
            address=place_data.address,
            opening_hours=place_data.opening_hours,
            utc_offset_minutes=getattr(place_data, "utc_offset_minutes", None),
            description=place_data.description,
            website_url=place_data.website_url,
            source=place_data.source,
        )

    if place_data.image_blobs:
        try:
            place_images.set_images_from_blobs(
                place_data.place_code, place_data.image_blobs, session=session
            )
        except Exception as e:
            logger.error("Failed to store image blobs for %s: %s", place_data.place_code, e)
    elif place_data.image_urls:
        place_images.set_images_from_urls(
            place_data.place_code, place_data.image_urls, session=session
        )

    if place_data.attributes:
        for attr_input in place_data.attributes:
            attr_db.upsert_attribute(
                place_data.place_code, attr_input.attribute_code, attr_input.value, session
            )

    if place_data.external_reviews:
        reviews_db.upsert_external_reviews(
            place_data.place_code, place_data.external_reviews, session
        )

    if place_data.translations:
        _persist_place_translations(place_data.place_code, place_data.translations, session)

    return row


@router.post("/batch")
def batch_create_places(
    body: PlaceBatch,
    session: SessionDep,
):
    """
    Create or update multiple places in a single request.
    Returns a summary of successes and failures.
    """
    results = []
    for place_data in body.places:
        try:
            _upsert_single_place(place_data, session)
            results.append({"place_code": place_data.place_code, "ok": True})
        except Exception as e:
            results.append({"place_code": place_data.place_code, "ok": False, "error": str(e)})

    success = sum(1 for r in results if r["ok"])
    return {
        "total": len(results),
        "synced": success,
        "failed": len(results) - success,
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
    row = _upsert_single_place(body, session)
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
