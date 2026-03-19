from fastapi import APIRouter, HTTPException

from app.api.deps import UserDep
from app.api.v1.place_serializers import serialize_place_item, serialize_place_minimal
from app.db import check_ins as check_ins_db
from app.db import favorites as favorites_db
from app.db import place_images, store
from app.db import places as places_db
from app.db import reviews as reviews_db
from app.db.session import SessionDep
from app.models.schemas import SettingsBody, UpdateMeBody, UserResponse

router = APIRouter()


def _to_public_user(user, session) -> UserResponse:
    settings = store.get_user_settings(user.user_code, session)
    religions = settings.get("religions", [])
    return UserResponse(
        user_code=user.user_code,
        email=user.email,
        display_name=user.display_name,
        is_admin=user.is_admin,
        email_verified=user.email_verified_at is not None,
        religions=religions,
        created_at=user.created_at.isoformat().replace("+00:00", "Z"),
        updated_at=user.updated_at.isoformat().replace("+00:00", "Z"),
    )


@router.get("/me", response_model=UserResponse)
def get_me(user: UserDep, session: SessionDep):
    return _to_public_user(user, session)


@router.patch("/me", response_model=UserResponse)
def update_me(
    body: UpdateMeBody,
    user: UserDep,
    session: SessionDep,
):
    updated = store.update_user(
        user.user_code,
        session,
        display_name=body.display_name,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="User not found")
    return _to_public_user(updated, session)


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
    if not rows:
        return []
    # Bulk-fetch all places and images in 2 queries instead of 2*N
    place_codes = [r.place_code for r in rows]
    places_map = {p.place_code: p for p in places_db.get_places_by_codes(place_codes, session)}
    images_bulk = place_images.get_images_bulk(place_codes, session)

    out = []
    for r in rows:
        place = places_map.get(r.place_code)
        date_str, time_str = _parse_iso_datetime(r.checked_in_at)
        images = images_bulk.get(r.place_code, []) if place else []
        place_image_url = images[0]["url"] if images else None
        place_payload = None
        if place:
            place_payload = serialize_place_minimal(place, images=images)
            place_payload["location"] = place.address  # legacy alias
        out.append(
            {
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
            }
        )
    return out


@router.get("/me/check-ins")
def get_my_check_ins(
    user: UserDep,
    session: SessionDep,
):
    rows = check_ins_db.get_check_ins_by_user(user.user_code, session)
    return _format_check_ins(rows, session)


@router.get("/me/check-ins/this-month")
def get_my_check_ins_this_month(
    user: UserDep,
    session: SessionDep,
):
    rows = check_ins_db.get_check_ins_this_month(user.user_code, session)
    return _format_check_ins(rows, session)


@router.get("/me/check-ins/on-this-day")
def get_my_check_ins_on_this_day(
    user: UserDep,
    session: SessionDep,
):
    rows = check_ins_db.get_check_ins_on_this_day(user.user_code, session)
    return _format_check_ins(rows, session)


@router.get("/me/stats")
def get_my_stats(user: UserDep, session: SessionDep):
    check_in_count = len(check_ins_db.get_check_ins_by_user(user.user_code, session))
    review_count = reviews_db.count_reviews_by_user(user.user_code, session)
    return {
        "placesVisited": check_ins_db.count_places_visited(user.user_code, session),
        "checkInsThisYear": check_ins_db.count_check_ins_this_year(user.user_code, session),
        "visits": check_in_count,
        "reviews": review_count,
        # TODO: Implement badges system when ready
        # "badges_count": 0,
        # "badges": [],
    }


@router.get("/me/favorites")
def get_my_favorites(
    user: UserDep,
    session: SessionDep,
):
    place_codes = favorites_db.get_favorite_place_codes(user.user_code, session)
    if not place_codes:
        return []

    # Batch-fetch all favorite places in a single query
    favorite_places = places_db.get_places_by_codes(list(place_codes), session)

    # Batch-fetch all images for those places in a single query
    all_images = place_images.get_images_bulk(list(place_codes), session)

    places_list = []
    for place in favorite_places:
        images = all_images.get(place.place_code, [])
        places_list.append(
            serialize_place_item(place, session, images=images, include_rating=False)
        )
    return places_list


@router.get("/me/settings")
def get_my_settings(user: UserDep, session: SessionDep):
    return store.get_user_settings(user.user_code, session)


@router.patch("/me/settings")
def update_my_settings(body: SettingsBody, user: UserDep, session: SessionDep):
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
    updated = store.update_user_settings(user.user_code, session, **kwargs)
    return updated


@router.delete(
    "/me",
    status_code=204,
    summary="Delete own account (GDPR/CCPA self-service deletion)",
    responses={
        204: {"description": "Account deleted successfully"},
    },
)
def delete_me(user: UserDep, session: SessionDep):
    """
    Permanently delete the authenticated user's account.

    - Anonymises all PII (email, display name, password hash)
    - Soft-deletes all check-ins and reviews
    - Revokes all active refresh tokens
    - Deactivates the account (`is_active = False`)

    After this call the user's Bearer token remains technically valid until expiry,
    but subsequent authenticated requests will fail (user not found / inactive).
    """
    store.soft_delete_user_account(user.user_code, session)
