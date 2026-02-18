import json
from datetime import datetime
from pathlib import Path

from sqlmodel import SQLModel

from app.core.security import hash_password
from app.db import groups as groups_db
from app.db import i18n as i18n_db
from app.db import notifications as notifications_db
from app.db import place_attributes as attr_db
from app.db import place_images, store
from app.db import places as places_db
from app.db.session import Session, engine

_DEFAULT_SEED_PATH = Path(__file__).parent / "seed_data.json"


def _load_seed_data(seed_path: str | Path | None) -> dict | None:
    path = Path(seed_path) if seed_path is not None else _DEFAULT_SEED_PATH
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def _clear_stores() -> None:
    # Drop and immediately recreate all tables for a clean dev seed.
    # create_all is used here (not run_migrations) to avoid opening a second
    # Alembic connection while the server's lifespan connection may still be
    # alive. The lifespan already ran run_migrations() before calling run_seed().
    # IMPORTANT: Never run this against a production database.
    SQLModel.metadata.drop_all(engine)
    SQLModel.metadata.create_all(engine)


def run_seed_system(seed_path: str | Path | None = None) -> None:
    """Seed reference/system data: languages, translations, attribute definitions.

    Safe to call on every startup — no table drops, all operations are upserts
    or in-memory replacements. This is the only seeding that runs automatically.
    """
    data = _load_seed_data(seed_path)
    if data is None:
        return

    if "languages" in data:
        i18n_db.set_languages(data["languages"])
    if "translations" in data:
        i18n_db.set_translations(data["translations"])
    if "attribute_definitions" in data:
        attr_db.seed_attribute_definitions(data["attribute_definitions"])


def run_seed_demo(seed_path: str | Path | None = None) -> None:
    """Seed demo/sample data: places, users, groups, notifications, etc.

    Does NOT drop tables — the caller must ensure the DB is in the desired
    state first (e.g. via _clear_stores() or a full migration reset).
    Only invoke this explicitly (e.g. via scripts/reset_db.py --with-demo-data).
    """
    data = _load_seed_data(seed_path)
    if data is None:
        return

    with Session(engine) as session:
        # Seed places
        for p in data.get("places", []):
            places_db.create_place(
                place_code=p["place_code"],
                session=session,
                name=p["name"],
                religion=p["religion"],
                place_type=p["place_type"],
                lat=p["lat"],
                lng=p["lng"],
                address=p["address"],
                opening_hours=p.get("opening_hours"),
                utc_offset_minutes=p.get("utc_offset_minutes"),
                description=p.get("description"),
                website_url=p.get("website_url"),
                source=p.get("source", "manual"),
            )

        # Seed place images
        import base64

        for img in data.get("place_images", []):
            if img["image_type"] == "url":
                place_images.add_image_url(
                    place_code=img["place_code"],
                    url=img["url"],
                    session=session,
                    display_order=img.get("display_order", 0),
                )
            elif img["image_type"] == "blob" and img.get("blob_data_base64"):
                blob_data = base64.b64decode(img["blob_data_base64"])
                place_images.add_image_blob(
                    place_code=img["place_code"],
                    data=blob_data,
                    mime_type=img.get("mime_type", "image/jpeg"),
                    display_order=img.get("display_order", 0),
                    session=session,
                )

        # Seed users
        for u in data.get("users", []):
            password_hash = (
                hash_password(u["password"]) if u.get("password") else u.get("password_hash", "")
            )
            store.create_user(
                user_code=u["user_code"],
                email=u["email"].strip().lower(),
                password_hash=password_hash,
                display_name=u.get("display_name") or u["email"].split("@")[0],
                religion=u.get("religion"),
                session=session,
            )
            if u.get("religion"):
                store.update_user_settings(u["user_code"], session, religions=[u["religion"]])

        for entry in data.get("user_settings", []):
            user_code = entry.get("user_code")
            if user_code:
                kwargs = {k: v for k, v in entry.items() if k != "user_code"}
                if kwargs:
                    store.update_user_settings(user_code, session, **kwargs)

        for pr in data.get("password_resets", []):
            expires_at = datetime.fromisoformat(pr["expires_at"].replace("Z", "+00:00"))
            store.save_password_reset(pr["token"], pr["user_code"], expires_at, session)

        # Seed groups
        group_codes: list[str] = []
        for g in data.get("groups", []):
            path_place_codes = g.get("path_place_codes")
            row = groups_db.create_group(
                name=g["name"],
                description=g.get("description", ""),
                created_by_user_code=g["created_by_user_code"],
                is_private=g.get("is_private", False),
                path_place_codes=path_place_codes,
                session=session,
            )
            group_codes.append(row.group_code)

        for m in data.get("group_members", []):
            gcode = group_codes[m["group_index"]]
            groups_db.add_member(gcode, m["user_code"], session, m.get("role", "member"))

        # Seed notifications
        for n in data.get("notifications", []):
            notifications_db.create_notification(
                user_code=n["user_code"],
                type=n["type"],
                payload=n.get("payload", {}),
                session=session,
            )


if __name__ == "__main__":
    # Direct invocation: full reset + seed (dev convenience).
    # Use scripts/reset_db.py for more control.
    _clear_stores()
    run_seed_system()
    run_seed_demo()
    print("Seed completed.")
