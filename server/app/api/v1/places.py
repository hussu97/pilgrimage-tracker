from typing import Annotated, Any, List, Literal, Optional
import base64

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlmodel import Session

from app.api.deps import get_current_user, get_optional_user
from app.db.session import engine
from app.db import places as places_db
from app.db import reviews as reviews_db
from app.db import store as user_store
from app.db import check_ins as check_ins_db
from app.db import favorites as favorites_db
from app.db import place_attributes as attr_db
from app.db import place_images
from app.db import review_images
from app.models.schemas import CheckInBody, ReviewCreateBody, PlacesListResponse, PlaceCreate
from app.services.place_timings import build_timings
from app.services.place_specifications import build_specifications
from app.services.timezone_utils import get_today_name

router = APIRouter()

Religion = Literal["islam", "hinduism", "christianity"]


def _place_to_item(place, distance: Optional[float] = None, include_rating: bool = False, attrs: Optional[dict] = None, session: Optional[Session] = None) -> dict:
    d = distance
    if d is not None:
        d = round(d * 10) / 10

    # Fetch attributes if not provided
    if attrs is None:
        if session is None:
            with Session(engine) as sess:
                attrs = attr_db.get_attributes_dict(place.place_code, sess)
        else:
            attrs = attr_db.get_attributes_dict(place.place_code, session)

    out = {
        "place_code": place.place_code,
        "name": place.name,
        "religion": place.religion,
        "place_type": place.place_type,
        "lat": place.lat,
        "lng": place.lng,
        "address": place.address,
        "opening_hours": place.opening_hours,
        "images": place_images.get_images(place.place_code, session=session) if session else [],
        "description": place.description,
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

    # Add opening_hours_today - today's hours in local time
    if place.opening_hours and isinstance(place.opening_hours, dict):
        today_name = get_today_name(utc_offset_minutes)
        today_hours = place.opening_hours.get(today_name)
        if today_hours:
            out["opening_hours_today"] = today_hours

    if getattr(place, "website_url", None):
        out["website_url"] = place.website_url
    out["has_events"] = places_db._place_has_events(place, attrs)
    if include_rating:
        agg = reviews_db.get_aggregate_rating(place.place_code)
        if agg:
            out["average_rating"] = agg["average"]
            out["review_count"] = agg["count"]
    return out


def _place_detail(place) -> dict:
    # Fetch attributes once and reuse
    with Session(engine) as session:
        attrs = attr_db.get_attributes_dict(place.place_code, session)
        out = _place_to_item(place, include_rating=True, attrs=attrs, session=session)
        if "distance" in out:
            del out["distance"]
        out["total_checkins_count"] = check_ins_db.count_check_ins_for_place(place.place_code)
        out["timings"] = build_timings(place, attrs=attrs, session=session)
        out["specifications"] = build_specifications(place, attrs=attrs, session=session)
        out["attributes"] = attrs
    return out


@router.get("")
def list_places(
    religion: Optional[List[Religion]] = Query(None, description="Filter by religion(s); repeat for multiple; omit for all"),
    lat: Optional[float] = Query(None),
    lng: Optional[float] = Query(None),
    radius: Optional[float] = Query(None, description="Radius in km"),
    place_type: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    sort: Optional[str] = Query(None, description="proximity or rating"),
    limit: int = Query(50),
    offset: int = Query(0),
    jummah: Optional[bool] = Query(None, description="If true, only places with Jummah / Friday prayer (Islam)"),
    has_events: Optional[bool] = Query(None, description="If true, only places that have events"),
    include_rating: bool = Query(True, description="Include average_rating and review_count in list items"),
    open_now: Optional[bool] = Query(None, description="If true, only currently open places"),
    has_parking: Optional[bool] = Query(None, description="If true, only places with parking"),
    womens_area: Optional[bool] = Query(None, description="If true, only places with a women's area"),
    top_rated: Optional[bool] = Query(None, description="If true, only places rated 4.0 or above"),
):
    religions = religion
    result = places_db.list_places(
        religions=religions,
        lat=lat,
        lng=lng,
        radius_km=radius,
        place_type=place_type,
        search=search,
        sort=sort,
        limit=limit,
        offset=offset,
        jummah=jummah,
        has_events=has_events,
        open_now=open_now,
        has_parking=has_parking,
        womens_area=womens_area,
        top_rated=top_rated,
        _reviews_agg_fn=reviews_db.get_aggregate_rating,
    )
    # Use bulk-fetched attributes for efficiency
    all_attrs = result["all_attrs"]
    places_out = [_place_to_item(p, dist, include_rating=include_rating, attrs=all_attrs.get(p.place_code, {})) for p, dist in result["rows"]]
    return {"places": places_out, "filters": result["filters"]}


@router.get("/{place_code}")
def get_place(
    place_code: str,
    user: Annotated[Any, Depends(get_optional_user)] = None,
):
    place = places_db.get_place_by_code(place_code)
    if not place:
        raise HTTPException(status_code=404, detail="Place not found")
    out = _place_detail(place)
    if user:
        out["user_has_checked_in"] = check_ins_db.has_checked_in(user.user_code, place_code)
        out["is_favorite"] = favorites_db.is_favorite(user.user_code, place_code)
    return out


@router.get("/{place_code}/reviews")
def get_place_reviews(
    place_code: str,
    limit: int = Query(5),
    offset: int = Query(0),
):
    if not places_db.get_place_by_code(place_code):
        raise HTTPException(status_code=404, detail="Place not found")
    rows = reviews_db.get_reviews_by_place(place_code, limit=limit, offset=offset)
    agg = reviews_db.get_aggregate_rating(place_code)
    out = []

    # Fetch review images for all reviews in batch
    with Session(engine) as session:
        for r in rows:
            source = getattr(r, "source", "user")

            # Fetch attached images for this review
            review_image_urls = review_images.get_review_images(r.review_code, session=session)
            attached_urls = [img["url"] for img in review_image_urls]

            # Merge with external photo URLs
            external_urls = getattr(r, "photo_urls", []) or []
            all_photo_urls = attached_urls + external_urls

            if source == "external":
                # External review
                out.append({
                    "review_code": r.review_code,
                    "place_code": r.place_code,
                    "user_code": None,
                    "display_name": getattr(r, "author_name", "External User"),
                    "rating": r.rating,
                    "title": r.title,
                    "body": r.body,
                    "created_at": r.created_at,
                    "is_anonymous": False,
                    "photo_urls": all_photo_urls,
                    "source": "external",
                })
            else:
                # User review
                is_anon = getattr(r, "is_anonymous", False)
                user = user_store.get_user_by_code(r.user_code) if r.user_code and not is_anon else None
                out.append({
                    "review_code": r.review_code,
                    "place_code": r.place_code,
                    "user_code": r.user_code if not is_anon else None,
                    "display_name": "Anonymous" if is_anon else (user.display_name if user else "Unknown"),
                    "rating": r.rating,
                    "title": r.title,
                    "body": r.body,
                    "created_at": r.created_at,
                    "is_anonymous": is_anon,
                    "photo_urls": all_photo_urls,
                    "source": "user",
                })

    result = {"reviews": out}
    if agg:
        result["average_rating"] = agg["average"]
        result["review_count"] = agg["count"]
    return result


@router.post("/{place_code}/check-in")
def check_in(
    place_code: str,
    body: CheckInBody,
    user: Annotated[Any, Depends(get_current_user)],
):
    if not places_db.get_place_by_code(place_code):
        raise HTTPException(status_code=404, detail="Place not found")
    row = check_ins_db.create_check_in(user.user_code, place_code, note=body.note, photo_url=body.photo_url)
    return {
        "check_in_code": row.check_in_code,
        "place_code": row.place_code,
        "checked_in_at": row.checked_in_at,
        "note": row.note,
        "photo_url": row.photo_url,
    }


@router.post("/{place_code}/favorite")
def add_favorite(
    place_code: str,
    user: Annotated[Any, Depends(get_current_user)],
):
    if not places_db.get_place_by_code(place_code):
        raise HTTPException(status_code=404, detail="Place not found")
    favorites_db.add_favorite(user.user_code, place_code)
    return {"ok": True}


@router.delete("/{place_code}/favorite")
def remove_favorite(
    place_code: str,
    user: Annotated[Any, Depends(get_current_user)],
):
    favorites_db.remove_favorite(user.user_code, place_code)
    return {"ok": True}


@router.post("/{place_code}/reviews")
def create_review(
    place_code: str,
    body: ReviewCreateBody,
    user: Annotated[Any, Depends(get_current_user)],
):
    if not places_db.get_place_by_code(place_code):
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
        title=body.title,
        body=body.body,
        is_anonymous=body.is_anonymous or False,
        photo_urls=external_urls,
    )

    # Attach uploaded images to the review
    if image_ids:
        with Session(engine) as session:
            try:
                review_images.attach_images_to_review(
                    review_code=row.review_code,
                    image_ids=image_ids,
                    user_code=user.user_code,
                    session=session,
                )
            except ValueError as e:
                # Clean up the review if image attachment fails
                reviews_db.delete_review(row.review_code)
                raise HTTPException(status_code=400, detail=str(e))

    # Fetch full photo URLs (including attached images)
    with Session(engine) as session:
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


@router.post("")
def create_place(
    body: PlaceCreate,
    session: Annotated[Session, Depends(lambda: Session(engine))],
):
    """
    Create a new place or update an existing one if place_code matches.
    """
    existing_place = places_db.get_place_by_code(body.place_code)
    if existing_place:
        row = places_db.update_place(
            place_code=body.place_code,
            name=body.name,
            religion=body.religion,
            place_type=body.place_type,
            lat=body.lat,
            lng=body.lng,
            address=body.address,
            opening_hours=body.opening_hours,
            utc_offset_minutes=getattr(body, "utc_offset_minutes", None),
            description=body.description,
            website_url=body.website_url,
            source=body.source,
        )
    else:
        row = places_db.create_place(
            place_code=body.place_code,
            name=body.name,
            religion=body.religion,
            place_type=body.place_type,
            lat=body.lat,
            lng=body.lng,
            address=body.address,
            opening_hours=body.opening_hours,
            utc_offset_minutes=getattr(body, "utc_offset_minutes", None),
            description=body.description,
            website_url=body.website_url,
            source=body.source,
        )

    # Store images: prefer blobs over URLs
    if body.image_blobs:
        # Download and store image blobs
        for i, blob in enumerate(body.image_blobs):
            try:
                data = base64.b64decode(blob["data"])
                mime_type = blob.get("mime_type", "image/jpeg")
                place_images.add_image_blob(body.place_code, data, mime_type, display_order=i, session=session)
            except Exception as e:
                print(f"Failed to store image blob: {e}")
    elif body.image_urls:
        # Fallback to URL-based images if no blobs provided
        place_images.set_images_from_urls(body.place_code, body.image_urls, session=session)

    # Store attributes if provided
    if body.attributes:
        for attr_input in body.attributes:
            attr_db.upsert_attribute(body.place_code, attr_input.attribute_code, attr_input.value)

    # Store external reviews if provided
    if body.external_reviews:
        reviews_db.upsert_external_reviews(body.place_code, body.external_reviews)

    return _place_detail(row)


@router.delete("/{place_code}")
def delete_place(place_code: str):
    """
    Delete a place by code.

    NOTE: This is a hard delete. Consider implementing soft deletes in the future
    to preserve historical data (check-ins, reviews, etc.) associated with the place.
    """
    place = places_db.get_place_by_code(place_code)
    if not place:
        raise HTTPException(status_code=404, detail="Place not found")

    # TODO: Add authorization check - only admins should be able to delete places
    # TODO: Consider soft delete instead of hard delete to preserve references
    # TODO: Handle cascade deletion of related data (images, reviews, check-ins, etc.)

    # For now, document that deletion is intentionally not fully implemented
    raise HTTPException(
        status_code=501,
        detail="Place deletion not implemented. Contact administrator to remove places."
    )


@router.get("/{place_code}/images/{image_id}")
def get_place_image(
    place_code: str,
    image_id: int,
    session: Annotated[Session, Depends(lambda: Session(engine))],
):
    """Serve a blob image for a place."""
    image = place_images.get_image_by_id(image_id, session=session)
    if not image or image.place_code != place_code:
        raise HTTPException(status_code=404, detail="Image not found")

    if image.image_type != "blob" or not image.blob_data:
        raise HTTPException(status_code=404, detail="Image not found")

    return Response(
        content=image.blob_data,
        media_type=image.mime_type or "image/jpeg",
    )
