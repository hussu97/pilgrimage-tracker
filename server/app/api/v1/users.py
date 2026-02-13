from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_current_user
from app.db import store
from app.db import check_ins as check_ins_db
from app.db import places as places_db
from app.db import favorites as favorites_db
from app.models.schemas import UserResponse, ReligionBody, UpdateMeBody, SettingsBody

router = APIRouter()


def _to_public_user(user) -> UserResponse:
    return UserResponse(
        user_code=user.user_code,
        email=user.email,
        display_name=user.display_name,
        religion=user.religion,
        avatar_url=user.avatar_url,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


@router.get("/me", response_model=UserResponse)
def get_me(user: Annotated[any, Depends(get_current_user)]):
    return _to_public_user(user)


@router.patch("/me", response_model=UserResponse)
def update_me(
    body: UpdateMeBody,
    user: Annotated[any, Depends(get_current_user)],
):
    updated = store.update_user(
        user.user_code,
        display_name=body.display_name,
        avatar_url=body.avatar_url,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="User not found")
    return _to_public_user(updated)


@router.patch("/me/religion", response_model=UserResponse)
def set_religion(
    body: ReligionBody,
    user: Annotated[any, Depends(get_current_user)],
):
    religion = body.religion
    if religion is not None and religion not in ("islam", "hinduism", "christianity"):
        raise HTTPException(status_code=400, detail="Invalid religion")
    updated = store.update_user_religion(user.user_code, religion)
    if not updated:
        raise HTTPException(status_code=404, detail="User not found")
    return _to_public_user(updated)


@router.get("/me/check-ins")
def get_my_check_ins(user: Annotated[any, Depends(get_current_user)]):
    rows = check_ins_db.get_check_ins_by_user(user.user_code)
    out = []
    for r in rows:
        place = places_db.get_place_by_code(r.place_code)
        out.append({
            "check_in_code": r.check_in_code,
            "place_code": r.place_code,
            "checked_in_at": r.checked_in_at,
            "note": r.note,
            "photo_url": r.photo_url,
            "place": {"place_code": place.place_code, "name": place.name, "address": place.address} if place else None,
        })
    return out


@router.get("/me/stats")
def get_my_stats(user: Annotated[any, Depends(get_current_user)]):
    return {
        "placesVisited": check_ins_db.count_places_visited(user.user_code),
        "checkInsThisYear": check_ins_db.count_check_ins_this_year(user.user_code),
    }


@router.get("/me/favorites")
def get_my_favorites(user: Annotated[any, Depends(get_current_user)]):
    place_codes = favorites_db.get_favorite_place_codes(user.user_code)
    places_list = []
    for pc in place_codes:
        place = places_db.get_place_by_code(pc)
        if place:
            places_list.append({
                "place_code": place.place_code,
                "name": place.name,
                "religion": place.religion,
                "place_type": place.place_type,
                "lat": place.lat,
                "lng": place.lng,
                "address": place.address,
                "image_urls": place.image_urls,
                "description": place.description,
            })
    return places_list


@router.get("/me/settings")
def get_my_settings(user: Annotated[any, Depends(get_current_user)]):
    return store.get_user_settings(user.user_code)


@router.patch("/me/settings")
def update_my_settings(body: SettingsBody, user: Annotated[any, Depends(get_current_user)]):
    kwargs = {}
    if body.notifications_on is not None:
        kwargs["notifications_on"] = body.notifications_on
    if body.theme is not None:
        kwargs["theme"] = body.theme
    if body.units is not None:
        kwargs["units"] = body.units
    if body.language is not None:
        kwargs["language"] = body.language
    return store.update_user_settings(user.user_code, **kwargs)
