"""
Central seed runner. Loads seed_data.json and populates all in-memory stores.
Run on app startup (main.py) or via: python -m app.db.seed
"""
import json
from pathlib import Path

from app.core.security import hash_password
from app.db import i18n as i18n_db
from app.db import store
from app.db import places as places_db
from app.db import groups as groups_db
from app.db import reviews as reviews_db
from app.db import check_ins as check_ins_db
from app.db import notifications as notifications_db
from app.db import favorites as favorites_db


def _clear_stores() -> None:
    store.users.clear()
    store.users_by_email.clear()
    store.password_resets.clear()
    store.user_settings.clear()
    places_db.places.clear()
    groups_db.groups_by_code.clear()
    groups_db.members_by_group.clear()
    groups_db.invites_by_code.clear()
    groups_db.invite_code_to_group.clear()
    reviews_db.reviews_by_code.clear()
    reviews_db.reviews_by_place.clear()
    check_ins_db.check_ins_by_code.clear()
    check_ins_db.check_ins_by_user.clear()
    notifications_db.notifications_by_code.clear()
    notifications_db.notifications_by_user.clear()
    favorites_db.favorites.clear()


def run_seed(seed_path: str | Path | None = None) -> None:
    if seed_path is None:
        seed_path = Path(__file__).parent / "seed_data.json"
    path = Path(seed_path)
    if not path.exists():
        return
    data = json.loads(path.read_text(encoding="utf-8"))

    _clear_stores()

    if "languages" in data:
        i18n_db.set_languages(data["languages"])
    if "translations" in data:
        i18n_db.set_translations(data["translations"])

    # Users (need user_code for later refs)
    for u in data.get("users", []):
        password_hash = hash_password(u["password"]) if u.get("password") else u.get("password_hash", "")
        store.create_user(
            user_code=u["user_code"],
            email=u["email"].strip().lower(),
            password_hash=password_hash,
            display_name=u.get("display_name") or u["email"].split("@")[0],
            religion=u.get("religion"),
            avatar_url=u.get("avatar_url"),
        )
        # Preferred religions (filter): seed from single religion if present
        if u.get("religion"):
            store.update_user_settings(u["user_code"], religions=[u["religion"]])

    # Places (order preserved for place_index refs)
    place_codes: list[str] = []
    for p in data.get("places", []):
        row = places_db.create_place(
            name=p["name"],
            religion=p["religion"],
            place_type=p["place_type"],
            lat=p["lat"],
            lng=p["lng"],
            address=p["address"],
            opening_hours=p.get("opening_hours"),
            image_urls=p.get("image_urls"),
            description=p.get("description"),
            religion_specific=p.get("religion_specific"),
        )
        place_codes.append(row.place_code)

    # Groups
    group_codes: list[str] = []
    for g in data.get("groups", []):
        row = groups_db.create_group(
            name=g["name"],
            description=g.get("description", ""),
            created_by_user_code=g["created_by_user_code"],
            is_private=g.get("is_private", False),
        )
        group_codes.append(row.group_code)

    for m in data.get("group_members", []):
        gcode = group_codes[m["group_index"]]
        groups_db.add_member(gcode, m["user_code"], m.get("role", "member"))

    # Reviews, check-ins, notifications, favorites (use place_index -> place_codes)
    for r in data.get("reviews", []):
        place_code = place_codes[r["place_index"]]
        reviews_db.create_review(
            user_code=r["user_code"],
            place_code=place_code,
            rating=r["rating"],
            title=r.get("title"),
            body=r.get("body"),
        )

    for c in data.get("check_ins", []):
        place_code = place_codes[c["place_index"]]
        check_ins_db.create_check_in(
            user_code=c["user_code"],
            place_code=place_code,
            note=c.get("note"),
            photo_url=c.get("photo_url"),
        )

    for n in data.get("notifications", []):
        notifications_db.create_notification(
            user_code=n["user_code"],
            type=n["type"],
            payload=n.get("payload", {}),
        )

    for f in data.get("favorites", []):
        place_code = place_codes[f["place_index"]]
        favorites_db.add_favorite(f["user_code"], place_code)


if __name__ == "__main__":
    run_seed()
    print("Seed completed.")
