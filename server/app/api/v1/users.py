from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.api.deps import get_current_user
from app.db.session import engine
from app.db import store
from app.db import check_ins as check_ins_db
from app.db import places as places_db
from app.db import favorites as favorites_db
from app.db import reviews as reviews_db
from app.db import place_images
from app.models.schemas import UserResponse, UpdateMeBody, SettingsBody

router = APIRouter()


def _to_public_user(user) -> UserResponse:
    settings = store.get_user_settings(user.user_code)
    religions = settings.get("religions", [])
    return UserResponse(
        user_code=user.user_code,
        email=user.email,
        display_name=user.display_name,
        religions=religions,
        created_at=user.created_at.isoformat() + "Z",
        updated_at=user.updated_at.isoformat() + "Z",
    )


@router.get("/me", response_model=UserResponse)
def get_me(user: Annotated[Any, Depends(get_current_user)]):
    return _to_public_user(user)


@router.patch("/me", response_model=UserResponse)
def update_me(
    body: UpdateMeBody,
    user: Annotated[Any, Depends(get_current_user)],
):
    updated = store.update_user(
        user.user_code,
        display_name=body.display_name,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="User not found")
    return _to_public_user(updated)


def _parse_iso_datetime(iso_str: str):
    """Return (date_str, time_str) e.g. ('2024-06-12', '09:30:00') from ISO string."""
    if not iso_str:
        return None, None
    try:
        s = iso_str.replace("Z", "").split(".")[0]
        if "T" in s:
            date_part, time_part = s.split("T", 1)
            return date_part, time_part
        return s, None
    except Exception:
        return None, None


def _format_check_ins(rows, session) -> list:
    out = []
    for r in rows:
        place = places_db.get_place_by_code(r.place_code)
        date_str, time_str = _parse_iso_datetime(r.checked_in_at)
        place_image_url = None
        images = []
        if place:
            images = place_images.get_images(place.place_code, session=session)
            if images and len(images) > 0:
                place_image_url = images[0]["url"]
        place_payload = None
        if place:
            place_payload = {
                "place_code": place.place_code,
                "name": place.name,
                "address": place.address,
                "images": images,
                "location": place.address,
            }
        out.append({
            "check_in_code": r.check_in_code,
            "place_code": r.place_code,
            "checked_in_at": r.checked_in_at,
            "date": date_str,
            "time": time_str,
            "note": r.note,
            "photo_url": r.photo_url,
            "place": place_payload,
            "place_name": place.name if place else None,
            "place_image_url": place_image_url,
            "location": place.address if place else None,
        })
    return out


@router.get("/me/check-ins")
def get_my_check_ins(
    user: Annotated[Any, Depends(get_current_user)],
    session: Annotated[Session, Depends(lambda: Session(engine))],
):
    rows = check_ins_db.get_check_ins_by_user(user.user_code)
    return _format_check_ins(rows, session)


@router.get("/me/check-ins/this-month")
def get_my_check_ins_this_month(
    user: Annotated[Any, Depends(get_current_user)],
    session: Annotated[Session, Depends(lambda: Session(engine))],
):
    rows = check_ins_db.get_check_ins_this_month(user.user_code)
    return _format_check_ins(rows, session)


@router.get("/me/check-ins/on-this-day")
def get_my_check_ins_on_this_day(
    user: Annotated[Any, Depends(get_current_user)],
    session: Annotated[Session, Depends(lambda: Session(engine))],
):
    rows = check_ins_db.get_check_ins_on_this_day(user.user_code)
    return _format_check_ins(rows, session)


@router.get("/me/stats")
def get_my_stats(user: Annotated[Any, Depends(get_current_user)]):
    check_in_count = len(check_ins_db.get_check_ins_by_user(user.user_code))
    review_count = reviews_db.count_reviews_by_user(user.user_code)
    return {
        "placesVisited": check_ins_db.count_places_visited(user.user_code),
        "checkInsThisYear": check_ins_db.count_check_ins_this_year(user.user_code),
        "visits": check_in_count,
        "reviews": review_count,
        # TODO: Implement badges system when ready
        # "badges_count": 0,
        # "badges": [],
    }


@router.get("/me/favorites")
def get_my_favorites(
    user: Annotated[Any, Depends(get_current_user)],
    session: Annotated[Session, Depends(lambda: Session(engine))],
):
    place_codes = favorites_db.get_favorite_place_codes(user.user_code)
    places_list = []
    for pc in place_codes:
        place = places_db.get_place_by_code(pc)
        if place:
            images = place_images.get_images(place.place_code, session=session)
            places_list.append({
                "place_code": place.place_code,
                "name": place.name,
                "religion": place.religion,
                "place_type": place.place_type,
                "lat": place.lat,
                "lng": place.lng,
                "address": place.address,
                "images": images,
                "description": place.description,
            })
    return places_list


@router.get("/me/settings")
def get_my_settings(user: Annotated[Any, Depends(get_current_user)]):
    return store.get_user_settings(user.user_code)


@router.patch("/me/settings")
def update_my_settings(body: SettingsBody, user: Annotated[Any, Depends(get_current_user)]):
    kwargs = {}
    if body.notifications_on is not None:
        kwargs["notifications_on"] = body.notifications_on
    if body.theme is not None:
        kwargs["theme"] = body.theme
    if body.units is not None:
        kwargs["units"] = body.units
    if body.language is not None:
        kwargs["language"] = body.language
    if body.religions is not None:
        kwargs["religions"] = body.religions
    updated = store.update_user_settings(user.user_code, **kwargs)
    return updated
