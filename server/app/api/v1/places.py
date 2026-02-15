from typing import Annotated, List, Literal, Optional
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import get_current_user, get_optional_user
from app.db import places as places_db
from app.db import reviews as reviews_db
from app.db import store as user_store
from app.db import check_ins as check_ins_db
from app.db import favorites as favorites_db
from app.models.schemas import CheckInBody, ReviewCreateBody, PlacesListResponse, PlaceCreate

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


def _build_timings(place) -> list:
    rs = getattr(place, "religion_specific", {}) or {}
    religion = getattr(place, "religion", "")
    result = []

    # Hinduism: deity circles
    if religion == "hinduism":
        deities = rs.get("deities", [])
        if isinstance(deities, list):
            for d in deities:
                if isinstance(d, dict):
                    result.append({
                        "type": "deity",
                        "name": d.get("name", ""),
                        "subtitle": d.get("subtitle", ""),
                        "image_url": d.get("image_url", ""),
                        "time": "",
                        "is_current": False,
                        "status": "upcoming",
                    })
        return result

    # Islam: prayer times with past/current/upcoming status
    prayer_times = rs.get("prayer_times", {})
    if prayer_times and isinstance(prayer_times, dict):
        now = datetime.now(timezone.utc)
        now_mins = now.hour * 60 + now.minute
        prayer_order = ["fajr", "dhuhr", "asr", "maghrib", "isha"]
        times_mins: dict = {}
        for key in prayer_order:
            t = prayer_times.get(key) or prayer_times.get(key.capitalize())
            if t and isinstance(t, str) and ":" in t:
                parts = t.split(":")
                try:
                    times_mins[key] = int(parts[0]) * 60 + int(parts[1])
                except (ValueError, IndexError):
                    pass
        next_prayer = next((k for k in prayer_order if times_mins.get(k, -1) > now_mins), None)
        if next_prayer is None and prayer_order:
            next_prayer = prayer_order[0]
        for key in prayer_order:
            t = prayer_times.get(key) or prayer_times.get(key.capitalize())
            if t:
                mins = times_mins.get(key, -1)
                if key == next_prayer:
                    status = "current"
                elif mins != -1 and mins < now_mins:
                    status = "past"
                else:
                    status = "upcoming"
                result.append({
                    "type": "prayer",
                    "name": key,
                    "subtitle": "",
                    "image_url": "",
                    "time": t,
                    "is_current": key == next_prayer,
                    "status": status,
                })
        return result

    # Christianity: service_times_array preferred, then service_times dict
    service_times_array = rs.get("service_times_array", [])
    if service_times_array and isinstance(service_times_array, list):
        now = datetime.now(timezone.utc)
        today_name = now.strftime("%A")
        now_mins = now.hour * 60 + now.minute
        next_idx = None
        for i, svc in enumerate(service_times_array):
            if not isinstance(svc, dict):
                continue
            if svc.get("day", "") == today_name:
                svc_time = svc.get("time", "")
                if svc_time and ":" in svc_time:
                    try:
                        h, m = svc_time.split(":")[:2]
                        if int(h) * 60 + int(m) > now_mins:
                            next_idx = i
                            break
                    except (ValueError, IndexError):
                        pass
        for i, svc in enumerate(service_times_array):
            if not isinstance(svc, dict):
                continue
            svc_day = svc.get("day", "")
            svc_time = svc.get("time", "")
            is_past = False
            if svc_day == today_name and svc_time and ":" in svc_time:
                try:
                    h, m = svc_time.split(":")[:2]
                    is_past = int(h) * 60 + int(m) < now_mins
                except (ValueError, IndexError):
                    pass
            if i == next_idx:
                status = "current"
            elif svc_day == today_name and is_past:
                status = "past"
            else:
                status = "upcoming"
            result.append({
                "type": "service",
                "name": svc.get("name") or svc_day,
                "subtitle": svc_day,
                "image_url": "",
                "time": svc_time,
                "is_current": i == next_idx,
                "status": status,
            })
        return result
    service_times = rs.get("service_times", {})
    if service_times and isinstance(service_times, dict):
        for day, time_str in service_times.items():
            result.append({
                "type": "service",
                "name": day,
                "subtitle": "",
                "image_url": "",
                "time": time_str if isinstance(time_str, str) else "",
                "is_current": False,
                "status": "upcoming",
            })
    return result


def _build_specifications(place) -> list:
    rs = getattr(place, "religion_specific", {}) or {}
    religion = getattr(place, "religion", "")
    specs = []

    if religion == "islam":
        if rs.get("capacity"):
            specs.append({"icon": "groups", "label": "placeDetail.capacity", "value": str(rs["capacity"])})
        facs = rs.get("facilities", [])
        if isinstance(facs, list):
            facs_lower = [str(f).lower() for f in facs]
        else:
            facs_lower = []
        has_wudu = rs.get("wudu_area") or any("wudu" in f or "ablution" in f for f in facs_lower)
        if has_wudu:
            specs.append({"icon": "opacity", "label": "placeDetail.wuduArea", "value": "Available"})
        has_parking = rs.get("parking") or any("parking" in f for f in facs_lower)
        if has_parking:
            specs.append({"icon": "local_parking", "label": "placeDetail.parking", "value": str(rs.get("parking", "Available"))})
        has_womens = rs.get("womens_area") or any("women" in f for f in facs_lower)
        if has_womens:
            specs.append({"icon": "wc", "label": "placeDetail.womensArea", "value": "Separate"})

    elif religion == "hinduism":
        if rs.get("architecture"):
            specs.append({"icon": "account_balance", "label": "placeDetail.architecture", "value": str(rs["architecture"])})
        if rs.get("dress_code"):
            specs.append({"icon": "checkroom", "label": "placeDetail.dressCode", "value": str(rs["dress_code"])})
        if rs.get("next_festival"):
            specs.append({"icon": "celebration", "label": "placeDetail.nextFestival", "value": str(rs["next_festival"])})
        if rs.get("festival_dates") and isinstance(rs["festival_dates"], list) and rs["festival_dates"]:
            specs.append({"icon": "event", "label": "placeDetail.festivalDates", "value": ", ".join(str(d) for d in rs["festival_dates"])})

    elif religion == "christianity":
        if rs.get("denomination"):
            specs.append({"icon": "church", "label": "placeDetail.denomination", "value": str(rs["denomination"])})
        if rs.get("founded_year"):
            specs.append({"icon": "history", "label": "placeDetail.foundedYear", "value": str(rs["founded_year"])})
        if rs.get("style"):
            specs.append({"icon": "architecture", "label": "placeDetail.style", "value": str(rs["style"])})
        notable = rs.get("notable_features", [])
        if isinstance(notable, list) and notable:
            specs.append({"icon": "star", "label": "placeDetail.notableFeatures", "value": ", ".join(str(f) for f in notable)})

    return specs


def _place_detail(place) -> dict:
    out = _place_to_item(place, include_rating=True)
    out["religion_specific"] = getattr(place, "religion_specific", None) or {}
    if "distance" in out:
        del out["distance"]
    rs = out["religion_specific"]
    out["crowd_level"] = rs.get("crowd_level") or getattr(place, "crowd_level", None)
    out["total_checkins_count"] = check_ins_db.count_check_ins_for_place(place.place_code)
    out["timings"] = _build_timings(place)
    out["specifications"] = _build_specifications(place)
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
    places_out = [_place_to_item(p, dist, include_rating=include_rating) for p, dist in result["rows"]]
    return {"places": places_out, "filters": result["filters"]}


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


@router.post("")
def create_place(
    body: PlaceCreate,
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
            image_urls=body.image_urls,
            description=body.description,
            religion_specific=body.religion_specific,
            website_url=body.website_url,
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
            image_urls=body.image_urls,
            description=body.description,
            religion_specific=body.religion_specific,
            website_url=body.website_url,
        )
    return _place_detail(row)


