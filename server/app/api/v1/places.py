from typing import Annotated, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import get_current_user, get_optional_user
from app.db import places as places_db
from app.db import reviews as reviews_db
from app.db import store as user_store
from app.db import check_ins as check_ins_db
from app.db import favorites as favorites_db
from app.models.schemas import CheckInBody, ReviewCreateBody

router = APIRouter()

Religion = Literal["islam", "hinduism", "christianity"]


def _place_to_item(place, distance: Optional[float] = None, include_rating: bool = False) -> dict:
    d = distance
    if d is not None:
        d = round(d * 10) / 10
    out = {
        "place_code": place.place_code,
        "name": place.name,
        "religion": place.religion,
        "place_type": place.place_type,
        "lat": place.lat,
        "lng": place.lng,
        "address": place.address,
        "opening_hours": place.opening_hours,
        "image_urls": place.image_urls,
        "description": place.description,
        "created_at": place.created_at,
        "distance": d,
    }
    rs = getattr(place, "religion_specific", None)
    if rs:
        out["religion_specific"] = rs
    is_open = places_db._is_open_now_from_hours(place.opening_hours)
    out["is_open_now"] = is_open
    if getattr(place, "website_url", None):
        out["website_url"] = place.website_url
    out["has_events"] = places_db._place_has_events(place)
    if include_rating:
        agg = reviews_db.get_aggregate_rating(place.place_code)
        if agg:
            out["average_rating"] = agg["average"]
            out["review_count"] = agg["count"]
    return out


def _place_detail(place) -> dict:
    out = _place_to_item(place, include_rating=True)
    out["religion_specific"] = getattr(place, "religion_specific", None) or {}
    if "distance" in out:
        del out["distance"]
    return out


@router.get("", response_model=list)
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
):
    religions = religion
    rows = places_db.list_places(
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
    )
    return [_place_to_item(p, dist, include_rating=include_rating) for p, dist in rows]


@router.get("/{place_code}")
def get_place(
    place_code: str,
    user: Annotated[any, Depends(get_optional_user)] = None,
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
    for r in rows:
        is_anon = getattr(r, "is_anonymous", False)
        user = user_store.get_user_by_code(r.user_code) if not is_anon else None
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
            "photo_urls": getattr(r, "photo_urls", []) or [],
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
    user: Annotated[any, Depends(get_current_user)],
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
    user: Annotated[any, Depends(get_current_user)],
):
    if not places_db.get_place_by_code(place_code):
        raise HTTPException(status_code=404, detail="Place not found")
    favorites_db.add_favorite(user.user_code, place_code)
    return {"ok": True}


@router.delete("/{place_code}/favorite")
def remove_favorite(
    place_code: str,
    user: Annotated[any, Depends(get_current_user)],
):
    favorites_db.remove_favorite(user.user_code, place_code)
    return {"ok": True}


@router.post("/{place_code}/reviews")
def create_review(
    place_code: str,
    body: ReviewCreateBody,
    user: Annotated[any, Depends(get_current_user)],
):
    if not places_db.get_place_by_code(place_code):
        raise HTTPException(status_code=404, detail="Place not found")
    if not (1 <= body.rating <= 5):
        raise HTTPException(status_code=400, detail="Rating must be 1-5")
    row = reviews_db.create_review(
        user.user_code,
        place_code,
        body.rating,
        title=body.title,
        body=body.body,
        is_anonymous=body.is_anonymous or False,
        photo_urls=body.photo_urls,
    )
    return {
        "review_code": row.review_code,
        "place_code": row.place_code,
        "rating": row.rating,
        "title": row.title,
        "body": row.body,
        "created_at": row.created_at,
        "is_anonymous": row.is_anonymous,
        "photo_urls": row.photo_urls,
    }
