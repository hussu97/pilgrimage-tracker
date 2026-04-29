import json
import logging
from datetime import UTC, datetime
from pathlib import Path

from sqlmodel import SQLModel, select

from app.core.security import hash_password
from app.db import content_translations as ct_db
from app.db import groups as groups_db
from app.db import i18n as i18n_db
from app.db import notifications as notifications_db
from app.db import place_attributes as attr_db
from app.db import places as places_db
from app.db import store
from app.db.models import (
    AdConfig,
    BlogPost,
    City,
    Country,
    SEOContentTemplate,
    SEOLabel,
    State,
)
from app.db.session import Session, engine

logger = logging.getLogger(__name__)

_DEFAULT_SEED_PATH = Path(__file__).parent / "seed_data.json"
_SEO_SEED_PATH = Path(__file__).parent / "seo_seed_data.json"
_BLOG_SEED_PATH = Path(__file__).parent / "blog_seed_data.json"


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
    if "content_translations" in data:
        _seed_content_translations(data["content_translations"])
    if "locations" in data:
        _seed_locations(data["locations"])

    _seed_seo_templates()
    _seed_ad_config()
    _seed_blog_posts()


def _seed_ad_config() -> None:
    """Upsert the web AdConfig row with ads enabled.

    Safe to call repeatedly — updates existing rows rather than inserting duplicates.
    Publisher ID matches the hardcoded value in the frontend ad-constants.ts.
    """
    _PUBLISHER_ID = "ca-pub-7902951158656200"
    _WEB_SLOTS = {
        "home-feed": f"{_PUBLISHER_ID}/home-feed",
        "place-detail-top": f"{_PUBLISHER_ID}/place-detail-top",
        "place-detail-mid": f"{_PUBLISHER_ID}/place-detail-mid",
        "place-detail-bottom": f"{_PUBLISHER_ID}/place-detail-bottom",
        "checkins-top": f"{_PUBLISHER_ID}/checkins-top",
        "checkins-mid": f"{_PUBLISHER_ID}/checkins-mid",
        "favorites-feed": f"{_PUBLISHER_ID}/favorites-feed",
        "group-detail-bottom": f"{_PUBLISHER_ID}/group-detail-bottom",
        "profile-bottom": f"{_PUBLISHER_ID}/profile-bottom",
        "notifications-bottom": f"{_PUBLISHER_ID}/notifications-bottom",
    }

    with Session(engine) as session:
        row = session.exec(select(AdConfig).where(AdConfig.platform == "web")).first()
        if row is None:
            session.add(
                AdConfig(
                    platform="web",
                    ads_enabled=True,
                    adsense_publisher_id=_PUBLISHER_ID,
                    ad_slots=_WEB_SLOTS,
                    updated_at=datetime.now(UTC),
                )
            )
        else:
            row.ads_enabled = True
            row.adsense_publisher_id = _PUBLISHER_ID
            if not row.ad_slots:
                row.ad_slots = _WEB_SLOTS
            row.updated_at = datetime.now(UTC)
        session.commit()


def _seed_blog_posts() -> None:
    """Upsert blog posts from blog_seed_data.json.

    Safe to call repeatedly — skips posts that already exist by slug.
    """
    if not _BLOG_SEED_PATH.exists():
        return
    posts = json.loads(_BLOG_SEED_PATH.read_text(encoding="utf-8"))
    with Session(engine) as session:
        for p in posts:
            existing = session.exec(select(BlogPost).where(BlogPost.slug == p["slug"])).first()
            published_at = datetime.fromisoformat(p["published_at"])
            updated_at = datetime.fromisoformat(p["updated_at"])
            if existing:
                # Upsert SEO fields added in 0027
                existing.author_name = p.get("author_name", existing.author_name)
                existing.tags = p.get("tags", existing.tags)
                existing.faq_json = p.get("faq_json", existing.faq_json)
                existing.cover_image_url = p.get("cover_image_url", existing.cover_image_url)
                session.add(existing)
            else:
                session.add(
                    BlogPost(
                        post_code=p["post_code"],
                        slug=p["slug"],
                        title=p["title"],
                        description=p["description"],
                        published_at=published_at,
                        updated_at=updated_at,
                        reading_time=p["reading_time"],
                        category=p["category"],
                        cover_gradient=p["cover_gradient"],
                        content=p["content"],
                        is_published=p.get("is_published", True),
                        author_name=p.get("author_name"),
                        tags=p.get("tags", []),
                        faq_json=p.get("faq_json"),
                        cover_image_url=p.get("cover_image_url"),
                    )
                )
        session.commit()
    logger.info("Blog posts seeded from %s", _BLOG_SEED_PATH)


def _seed_content_translations(rows: list[dict]) -> None:
    """Upsert ContentTranslation rows from seed data. Safe to call repeatedly."""
    with Session(engine) as session:
        for row in rows:
            ct_db.upsert_translation(
                entity_type=row["entity_type"],
                entity_code=row["entity_code"],
                field=row["field"],
                lang=row["lang"],
                text=row["translated_text"],
                source=row.get("source", "manual"),
                session=session,
            )


def _seed_locations(locations: dict) -> None:
    """Upsert Country, State, City rows from seed data. Safe to call repeatedly.

    Seeded entities use the code from seed_data.json (not the auto-generated slug code).
    """
    with Session(engine) as session:
        for row in locations.get("countries", []):
            existing = session.exec(
                select(Country).where(Country.country_code == row["code"])
            ).first()
            if existing is None:
                session.add(
                    Country(
                        country_code=row["code"],
                        iso_code=row.get("iso_code"),
                        name=row["name"],
                        translations=row.get("translations", {}),
                    )
                )
        session.commit()

        for row in locations.get("states", []):
            existing = session.exec(select(State).where(State.state_code == row["code"])).first()
            if existing is None:
                session.add(
                    State(
                        state_code=row["code"],
                        name=row["name"],
                        country_code=row["country_code"],
                        translations=row.get("translations", {}),
                    )
                )
        session.commit()

        for row in locations.get("cities", []):
            existing = session.exec(select(City).where(City.city_code == row["code"])).first()
            if existing is None:
                session.add(
                    City(
                        city_code=row["code"],
                        name=row["name"],
                        country_code=row["country_code"],
                        state_code=row.get("state_code"),
                        translations=row.get("translations", {}),
                    )
                )
        session.commit()


def _seed_seo_templates() -> None:
    """Upsert SEOLabel and SEOContentTemplate rows from seo_seed_data.json.

    Safe to call on every startup — idempotent upserts keyed by unique constraints.
    """
    if not _SEO_SEED_PATH.exists():
        return
    data = json.loads(_SEO_SEED_PATH.read_text(encoding="utf-8"))
    now = datetime.now(UTC)

    with Session(engine) as session:
        # Labels
        for row in data.get("labels", []):
            existing = session.exec(
                select(SEOLabel).where(
                    SEOLabel.label_type == row["label_type"],
                    SEOLabel.label_key == row["label_key"],
                    SEOLabel.lang == row["lang"],
                )
            ).first()
            if existing:
                existing.label_text = row["label_text"]
                session.add(existing)
            else:
                session.add(
                    SEOLabel(
                        label_type=row["label_type"],
                        label_key=row["label_key"],
                        lang=row["lang"],
                        label_text=row["label_text"],
                    )
                )
        session.commit()

        # Templates
        for row in data.get("templates", []):
            existing = session.exec(
                select(SEOContentTemplate).where(
                    SEOContentTemplate.template_code == row["template_code"],
                    SEOContentTemplate.lang == row["lang"],
                )
            ).first()
            if existing:
                existing.template_text = row["template_text"]
                existing.fallback_text = row.get("fallback_text")
                existing.static_phrases = row.get("static_phrases", {})
                existing.updated_at = now
                session.add(existing)
            else:
                session.add(
                    SEOContentTemplate(
                        template_code=row["template_code"],
                        lang=row["lang"],
                        template_text=row["template_text"],
                        fallback_text=row.get("fallback_text"),
                        static_phrases=row.get("static_phrases", {}),
                        version=1,
                        is_active=True,
                        created_at=now,
                        updated_at=now,
                    )
                )
        session.commit()


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

        from app.db.enums import ImageType
        from app.db.models import PlaceImage

        for img in data.get("place_images", []):
            if img["image_type"] == "url":
                session.add(
                    PlaceImage(
                        place_code=img["place_code"],
                        image_type=ImageType.URL,
                        url=img["url"],
                        display_order=img.get("display_order", 0),
                    )
                )
                session.commit()
            elif img["image_type"] == "blob" and img.get("blob_data_base64"):
                blob_data = base64.b64decode(img["blob_data_base64"])
                session.add(
                    PlaceImage(
                        place_code=img["place_code"],
                        image_type=ImageType.BLOB,
                        blob_data=blob_data,
                        mime_type=img.get("mime_type", "image/jpeg"),
                        display_order=img.get("display_order", 0),
                    )
                )
                session.commit()

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
                is_admin=u.get("is_admin", False),
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
    logger.info("Seed completed.")
