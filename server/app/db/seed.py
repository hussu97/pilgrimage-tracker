import json
from datetime import datetime
from pathlib import Path

from sqlmodel import SQLModel
from app.core.security import hash_password
from app.db import i18n as i18n_db
from app.db import store
from app.db import places as places_db
from app.db import groups as groups_db
from app.db import reviews as reviews_db
from app.db import check_ins as check_ins_db
from app.db import notifications as notifications_db
from app.db import favorites as favorites_db
from app.db import place_attributes as attr_db
from app.db.session import engine, create_db_and_tables


def _migrate_religion_specific(place_code: str, religion: str, rs: dict) -> None:
    """Migrate religion_specific dict fields into PlaceAttribute rows."""
    if not rs:
        return

    # Boolean / string / number attributes
    mapping = {
        "wudu_area": "has_wudu_area",
        "womens_area": "has_womens_area",
        "parking": "has_parking",
        "capacity": "capacity",
        "architecture": "architecture_style",
        "dress_code": "dress_code",
        "denomination": "denomination",
        "founded_year": "founded_year",
        "has_events": "has_events",
    }
    for src_key, attr_code in mapping.items():
        val = rs.get(src_key)
        if val is not None and val != "" and val is not False:
            # Normalize booleans: treat truthy strings as True
            if attr_code in ("has_wudu_area", "has_womens_area", "has_parking", "has_events"):
                attr_db.upsert_attribute(place_code, attr_code, True)
            else:
                attr_db.upsert_attribute(place_code, attr_code, val)

    # Check facilities list for parking / wudu / women
    facs = rs.get("facilities", [])
    if isinstance(facs, list):
        facs_lower = [str(f).lower() for f in facs]
        if any("parking" in f for f in facs_lower):
            attr_db.upsert_attribute(place_code, "has_parking", True)
        if any("wudu" in f or "ablution" in f for f in facs_lower):
            attr_db.upsert_attribute(place_code, "has_wudu_area", True)
        if any("women" in f for f in facs_lower):
            attr_db.upsert_attribute(place_code, "has_womens_area", True)

    # JSON attributes
    if religion == "islam" and rs.get("prayer_times"):
        attr_db.upsert_attribute(place_code, "prayer_times", rs["prayer_times"])
    if religion == "christianity":
        st = rs.get("service_times_array") or rs.get("service_times")
        if st:
            attr_db.upsert_attribute(place_code, "service_times", st)
    if religion == "hinduism" and rs.get("deities"):
        attr_db.upsert_attribute(place_code, "deities", rs["deities"])


def _clear_stores() -> None:
    # Drop and recreate all tables for a fresh start with seed
    SQLModel.metadata.drop_all(engine)
    create_db_and_tables()


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

    # Seed attribute definitions before places
    if "attribute_definitions" in data:
        attr_db.seed_attribute_definitions(data["attribute_definitions"])

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

    for entry in data.get("user_settings", []):
        user_code = entry.get("user_code")
        if user_code:
            kwargs = {k: v for k, v in entry.items() if k != "user_code"}
            if kwargs:
                store.update_user_settings(user_code, **kwargs)

    for pr in data.get("password_resets", []):
        expires_at = datetime.fromisoformat(pr["expires_at"].replace("Z", "+00:00"))
        store.save_password_reset(pr["token"], pr["user_code"], expires_at)

    # Places (order preserved for place_index refs)
    place_codes: list[str] = []
    for p in data.get("places", []):
        # Generate a stable-ish code for seed places
        from app.db.places import _generate_place_code
        p_code = _generate_place_code()
        
        row = places_db.create_place(
            place_code=p_code,
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
            website_url=p.get("website_url"),
        )
        place_codes.append(row.place_code)

        # Migrate religion_specific fields into PlaceAttribute rows
        rs = p.get("religion_specific") or {}
        religion = p["religion"]
        _migrate_religion_specific(row.place_code, religion, rs)


    # Groups
    group_codes: list[str] = []
    for g in data.get("groups", []):
        path_place_codes = None
        if "path_place_indices" in g:
            path_place_codes = [place_codes[i] for i in g["path_place_indices"]]
        elif g.get("path_place_codes") is not None:
            path_place_codes = g["path_place_codes"]
        row = groups_db.create_group(
            name=g["name"],
            description=g.get("description", ""),
            created_by_user_code=g["created_by_user_code"],
            is_private=g.get("is_private", False),
            path_place_codes=path_place_codes,
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
            is_anonymous=r.get("is_anonymous", False),
            photo_urls=r.get("photo_urls"),
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
