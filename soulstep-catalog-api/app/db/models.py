from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, LargeBinary, UniqueConstraint
from sqlalchemy import types as sa_types
from sqlmodel import JSON, Column, Field, SQLModel

from app.db.enums import GroupRole, ImageType, Language, ReviewSource, Theme, Units


class _UTCAwareDateTime(sa_types.TypeDecorator):
    """DateTime column that always returns timezone-aware UTC datetimes.

    - PostgreSQL: maps to TIMESTAMPTZ — stores and returns aware datetimes.
    - SQLite: stores as ISO string (SQLAlchemy behaviour); on read, any naive
      value is assumed to be UTC and given an explicit UTC tzinfo so that
      business logic can compare freely with datetime.now(UTC).
    """

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_result_value(self, value: datetime | None, dialect) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value


# Shorthand: Column(UTCAwareDateTime, nullable=True/False)
def _TSTZ(**kw) -> Column:  # noqa: N802
    return Column(_UTCAwareDateTime(), **kw)


class User(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user_code: str = Field(index=True, unique=True)
    email: str = Field(index=True, unique=True)
    password_hash: str
    display_name: str
    is_admin: bool = Field(
        default=False,
        sa_column=Column(Boolean, nullable=False, server_default="0"),
    )
    is_active: bool = Field(
        default=True,
        sa_column=Column(Boolean, nullable=False, server_default="1"),
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=_TSTZ(nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=_TSTZ(nullable=False),
    )


class UserSettings(SQLModel, table=True):
    user_code: str = Field(primary_key=True, foreign_key="user.user_code")
    notifications_on: bool = Field(default=True)
    theme: str = Field(default=Theme.LIGHT)  # light, dark, system
    units: str = Field(default=Units.KM)  # km, miles
    language: str = Field(default=Language.EN)  # en, ar, hi
    religions: list[str] = Field(default=[], sa_column=Column(JSON))


class Place(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    place_code: str = Field(index=True, unique=True)
    name: str = Field(index=True)
    religion: str = Field(index=True)  # islam, hinduism, christianity
    place_type: str = Field(index=True)
    lat: float
    lng: float
    address: str
    opening_hours: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))
    utc_offset_minutes: int | None = None  # e.g., 240 for UTC+4 (UAE), 330 for UTC+5:30 (India)
    description: str | None = None
    website_url: str | None = None
    source: str | None = None  # gmaps, overpass, manual
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=_TSTZ(nullable=False),
    )


class PlaceImage(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    place_code: str = Field(index=True, foreign_key="place.place_code")
    image_type: str = Field(default=ImageType.URL)  # "url" or "blob"
    url: str | None = None
    blob_data: bytes | None = Field(default=None, sa_column=Column(LargeBinary))
    mime_type: str | None = None  # "image/jpeg", "image/png"
    display_order: int = Field(default=0)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=_TSTZ(nullable=False),
    )


class Review(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    review_code: str = Field(index=True, unique=True)
    user_code: str | None = Field(default=None, index=True, foreign_key="user.user_code")
    place_code: str = Field(index=True, foreign_key="place.place_code")
    rating: int
    title: str | None = None
    body: str | None = None
    is_anonymous: bool = Field(default=False)
    photo_urls: list[str] = Field(default=[], sa_column=Column(JSON))
    source: str = Field(default=ReviewSource.USER)  # "user" or "google"
    is_flagged: bool = Field(
        default=False,
        sa_column=Column(Boolean, nullable=False, server_default="0"),
    )
    author_name: str | None = None  # For Google reviews
    review_time: int | None = None  # Unix timestamp from Google
    language: str | None = None  # Review language from Google
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=_TSTZ(nullable=False),
    )


class ReviewImage(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    review_code: str | None = Field(default=None, index=True, foreign_key="review.review_code")
    uploaded_by_user_code: str = Field(index=True, foreign_key="user.user_code")
    blob_data: bytes = Field(sa_column=Column(LargeBinary))
    mime_type: str  # "image/jpeg", "image/png", "image/webp"
    file_size: int
    width: int
    height: int
    display_order: int = Field(default=0)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=_TSTZ(nullable=False),
    )
    attached_at: datetime | None = Field(default=None, sa_column=_TSTZ(nullable=True))


class CheckIn(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    check_in_code: str = Field(index=True, unique=True)
    user_code: str = Field(index=True, foreign_key="user.user_code")
    place_code: str = Field(index=True, foreign_key="place.place_code")
    group_code: str | None = Field(default=None, index=True, foreign_key="group.group_code")
    note: str | None = None
    photo_url: str | None = None
    checked_in_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=_TSTZ(nullable=False),
    )


class Favorite(SQLModel, table=True):
    user_code: str = Field(primary_key=True, foreign_key="user.user_code")
    place_code: str = Field(primary_key=True, foreign_key="place.place_code")


class Group(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    group_code: str = Field(index=True, unique=True)
    name: str = Field(index=True)
    description: str | None = None
    created_by_user_code: str = Field(foreign_key="user.user_code")
    invite_code: str = Field(index=True, unique=True)
    is_private: bool = Field(default=False)
    path_place_codes: list[str] = Field(default=[], sa_column=Column(JSON))
    cover_image_url: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=_TSTZ(nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=_TSTZ(nullable=False),
    )


class GroupMember(SQLModel, table=True):
    group_code: str = Field(primary_key=True, foreign_key="group.group_code")
    user_code: str = Field(primary_key=True, foreign_key="user.user_code")
    role: str = Field(default=GroupRole.MEMBER)  # admin, member
    joined_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=_TSTZ(nullable=False),
    )


class GroupPlaceNote(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    note_code: str = Field(index=True, unique=True)
    group_code: str = Field(index=True, foreign_key="group.group_code")
    place_code: str = Field(index=True, foreign_key="place.place_code")
    user_code: str = Field(foreign_key="user.user_code")
    text: str
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=_TSTZ(nullable=False),
    )


class Notification(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    notification_code: str = Field(index=True, unique=True)
    user_code: str = Field(index=True, foreign_key="user.user_code")
    type: str  # group_invite, check_in_activity, etc.
    payload: dict[str, Any] = Field(default={}, sa_column=Column(JSON))
    read_at: datetime | None = Field(default=None, sa_column=_TSTZ(nullable=True))
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=_TSTZ(nullable=False),
    )


class PasswordReset(SQLModel, table=True):
    token: str = Field(primary_key=True)
    user_code: str = Field(foreign_key="user.user_code")
    expires_at: datetime = Field(sa_column=_TSTZ(nullable=False))
    used_at: datetime | None = Field(default=None, sa_column=_TSTZ(nullable=True))


class RefreshToken(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    token: str = Field(index=True, unique=True)
    user_code: str = Field(index=True, foreign_key="user.user_code")
    expires_at: datetime = Field(sa_column=_TSTZ(nullable=False))
    revoked_at: datetime | None = Field(default=None, sa_column=_TSTZ(nullable=True))
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=_TSTZ(nullable=False),
    )


class Visitor(SQLModel, table=True):
    __tablename__ = "visitor"
    visitor_code: str = Field(primary_key=True)  # "vis_" + 16 hex chars
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=_TSTZ(nullable=False),
    )
    last_seen_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=_TSTZ(nullable=False),
    )


class VisitorSettings(SQLModel, table=True):
    __tablename__ = "visitor_settings"
    visitor_code: str = Field(primary_key=True, foreign_key="visitor.visitor_code")
    theme: str = Field(default=Theme.SYSTEM)  # light | dark | system
    units: str = Field(default=Units.KM)  # km | miles
    language: str = Field(default=Language.EN)  # en | ar | hi
    religions: list[str] = Field(default=[], sa_column=Column(JSON))


class GroupCoverImage(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    image_code: str = Field(index=True, unique=True)
    uploaded_by_user_code: str = Field(index=True, foreign_key="user.user_code")
    blob_data: bytes = Field(sa_column=Column(LargeBinary))
    mime_type: str  # "image/jpeg"
    file_size: int
    width: int
    height: int
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=_TSTZ(nullable=False),
    )


class PlaceAttributeDefinition(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    attribute_code: str = Field(index=True, unique=True)
    name: str
    data_type: str  # "boolean", "string", "number", "json"
    icon: str | None = None
    label_key: str | None = None
    is_filterable: bool = False
    is_specification: bool = False
    category: str | None = None  # "facility", "timing", "info"
    religion: str | None = None  # null = all, "islam", "hinduism", "christianity"
    display_order: int = Field(default=0)


class PlaceAttribute(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("place_code", "attribute_code"),)

    id: int | None = Field(default=None, primary_key=True)
    place_code: str = Field(index=True, foreign_key="place.place_code")
    attribute_code: str = Field(index=True, foreign_key="placeattributedefinition.attribute_code")
    value_text: str | None = None
    value_json: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))


class ContentTranslation(SQLModel, table=True):
    """Stores translated text for system/scraped content (places, spec values, etc.).

    English is canonical on the source model — this table stores non-English translations only.
    Keyed by (entity_type, entity_code, field, lang); unique constraint enforced.
    """

    __table_args__ = (UniqueConstraint("entity_type", "entity_code", "field", "lang"),)

    id: int | None = Field(default=None, primary_key=True)
    entity_type: str = Field(index=True)  # "place", "attribute_def", "spec_value"
    entity_code: str = Field(index=True)  # place_code, attribute_code, or value key
    field: str  # "name", "description", "address", "label", "value"
    lang: str = Field(index=True)  # "ar", "hi", "te" (never "en")
    translated_text: str
    source: str = Field(default="scraper")  # "scraper", "google_translate", "manual"
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=_TSTZ(nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=_TSTZ(nullable=False),
    )


class AppVersionConfig(SQLModel, table=True):
    """Per-platform app version requirements.

    Rows: one for "ios", one for "android".
    Used by GET /api/v1/app-version to decide soft/hard update banners.
    Falls back to env vars when no row exists.
    """

    id: int | None = Field(default=None, primary_key=True)
    platform: str = Field(index=True, unique=True)  # "ios" | "android"
    min_version_hard: str = Field(default="")  # e.g. "1.0.0" — blocks below this
    min_version_soft: str = Field(default="")  # e.g. "1.1.0" — banner below this
    latest_version: str = Field(default="")  # e.g. "1.2.0"
    store_url: str = Field(default="")  # App Store / Play Store URL
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=_TSTZ(nullable=False),
    )


class UITranslation(SQLModel, table=True):
    """Runtime overrides for UI translation keys.

    Rows in this table override the seed_data.json values at runtime.
    Keyed by (key, lang); unique constraint enforced.
    Used by GET /api/v1/i18n/translations to merge on top of seed data.
    """

    __tablename__ = "ui_translation"
    __table_args__ = (UniqueConstraint("key", "lang"),)

    id: int | None = Field(default=None, primary_key=True)
    key: str = Field(index=True)  # e.g. "home.title"
    lang: str  # "en", "ar", "hi"
    value: str
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=_TSTZ(nullable=False),
    )


class AuditLog(SQLModel, table=True):
    """Records every admin write operation for accountability."""

    __tablename__ = "audit_log"

    id: int | None = Field(default=None, primary_key=True)
    log_code: str = Field(index=True, unique=True)
    admin_user_code: str = Field(foreign_key="user.user_code", index=True)
    action: str  # "create", "update", "delete", "bulk_deactivate", "flag", etc.
    entity_type: str  # "user", "place", "review", "check_in", "group", etc.
    entity_code: str  # code of the affected entity (or comma-joined for bulk)
    changes: dict | None = Field(default=None, sa_column=Column(JSON))
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=_TSTZ(nullable=False),
    )


class AdminBroadcast(SQLModel, table=True):
    """Tracks admin-initiated notification broadcasts for history."""

    __tablename__ = "admin_broadcast"

    id: int | None = Field(default=None, primary_key=True)
    broadcast_code: str = Field(index=True, unique=True)
    admin_user_code: str = Field(foreign_key="user.user_code", index=True)
    type: str  # notification type key
    payload: dict[str, Any] = Field(default={}, sa_column=Column(JSON))
    recipient_type: str  # "all" | "targeted"
    recipient_count: int = Field(default=0)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=_TSTZ(nullable=False),
    )


class PlaceSEO(SQLModel, table=True):
    """SEO metadata for a sacred-site place page.

    English is the canonical language. Translations for other languages are
    stored via ContentTranslation with entity_type="place_seo".
    is_manually_edited=True prevents auto-overwrite on re-generation.
    """

    __tablename__ = "place_seo"

    id: int | None = Field(default=None, primary_key=True)
    place_code: str = Field(index=True, unique=True, foreign_key="place.place_code")
    slug: str = Field(index=True, unique=True)  # URL-friendly, e.g. "grand-mosque-dubai"
    seo_title: str  # <title> tag content, ≤60 chars recommended
    meta_description: str  # <meta name="description">, ≤160 chars recommended
    rich_description: str | None = None  # Longer crawlable description paragraph
    faq_json: list[dict[str, Any]] | None = Field(
        default=None, sa_column=Column(JSON)
    )  # [{"question": "...", "answer": "..."}, ...]
    og_image_url: str | None = None  # 1200x630 OG image URL
    is_manually_edited: bool = Field(
        default=False,
        sa_column=Column(Boolean, nullable=False, server_default="0"),
    )
    generated_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=_TSTZ(nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=_TSTZ(nullable=False),
    )
