"""Admin — Translation key management (UI strings).

Endpoints let admins view, override, and create translation keys at runtime.
DB overrides (UITranslation rows) take precedence over seed_data.json values.
"""

from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import select

from app.api.deps import AdminDep
from app.db import i18n as i18n_db
from app.db.models import UITranslation
from app.db.session import SessionDep

router = APIRouter()

SUPPORTED_LANGS = ["en", "ar", "hi"]


# ── Schemas ────────────────────────────────────────────────────────────────────


class TranslationEntry(BaseModel):
    key: str
    en: str | None = None
    ar: str | None = None
    hi: str | None = None
    overridden_langs: list[str]  # langs that have a DB override row


class UpsertTranslationBody(BaseModel):
    en: str | None = None
    ar: str | None = None
    hi: str | None = None


class CreateTranslationBody(BaseModel):
    key: str
    en: str | None = None
    ar: str | None = None
    hi: str | None = None


# ── Helpers ────────────────────────────────────────────────────────────────────


def _build_entry(
    key: str,
    seed_data: dict[str, dict[str, str]],
    db_overrides: dict[str, dict[str, str]],
) -> TranslationEntry:
    overridden_langs: list[str] = []
    values: dict[str, str | None] = {}
    for lang in SUPPORTED_LANGS:
        if key in db_overrides.get(lang, {}):
            values[lang] = db_overrides[lang][key]
            overridden_langs.append(lang)
        else:
            values[lang] = seed_data.get(lang, {}).get(key)
    return TranslationEntry(
        key=key,
        en=values.get("en"),
        ar=values.get("ar"),
        hi=values.get("hi"),
        overridden_langs=overridden_langs,
    )


def _load_db_overrides(session, key: str | None = None) -> dict[str, dict[str, str]]:
    """Return {lang -> {key -> value}} for DB UITranslation rows."""
    stmt = select(UITranslation)
    if key is not None:
        stmt = stmt.where(UITranslation.key == key)
    rows = session.exec(stmt).all()
    overrides: dict[str, dict[str, str]] = {}
    for row in rows:
        overrides.setdefault(row.lang, {})[row.key] = row.value
    return overrides


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("/translations", response_model=list[TranslationEntry])
def list_translations(
    admin: AdminDep,
    session: SessionDep,
    search: str | None = Query(default=None),
):
    """List all known translation keys with per-language values.

    Shows keys from seed data (union) any DB-only keys.
    The overridden_langs field indicates which values are DB overrides.
    """
    seed_keys: set[str] = set()
    for lang_map in i18n_db.translations.values():
        seed_keys.update(lang_map.keys())

    db_overrides = _load_db_overrides(session)
    db_keys: set[str] = set()
    for lang_map in db_overrides.values():
        db_keys.update(lang_map.keys())

    all_keys = seed_keys | db_keys
    if search:
        term = search.lower()
        all_keys = {k for k in all_keys if term in k.lower()}

    return [_build_entry(key, i18n_db.translations, db_overrides) for key in sorted(all_keys)]


@router.post("/translations", response_model=TranslationEntry, status_code=201)
def create_translation(
    body: CreateTranslationBody,
    admin: AdminDep,
    session: SessionDep,
):
    """Create a new translation key that does not exist in seed data."""
    seed_has_key = any(body.key in lang_map for lang_map in i18n_db.translations.values())
    if seed_has_key:
        raise HTTPException(
            status_code=409,
            detail="Key already exists in seed data. Use PUT to override a value.",
        )

    now = datetime.now(UTC)
    for lang in SUPPORTED_LANGS:
        value = getattr(body, lang)
        if value is not None:
            row = UITranslation(key=body.key, lang=lang, value=value, updated_at=now)
            session.add(row)
    session.commit()

    db_overrides = _load_db_overrides(session, key=body.key)
    return _build_entry(body.key, i18n_db.translations, db_overrides)


@router.get("/translations/{key}", response_model=TranslationEntry)
def get_translation(key: str, admin: AdminDep, session: SessionDep):
    """Get a single translation key with values for all languages."""
    seed_has_key = any(key in lang_map for lang_map in i18n_db.translations.values())
    db_overrides = _load_db_overrides(session, key=key)
    db_has_key = any(key in lang_map for lang_map in db_overrides.values())

    if not seed_has_key and not db_has_key:
        raise HTTPException(status_code=404, detail="Translation key not found")

    return _build_entry(key, i18n_db.translations, db_overrides)


@router.put("/translations/{key}", response_model=TranslationEntry)
def upsert_translation(
    key: str,
    body: UpsertTranslationBody,
    admin: AdminDep,
    session: SessionDep,
):
    """Upsert DB overrides for one or more languages of a key."""
    updates = {
        lang: getattr(body, lang) for lang in SUPPORTED_LANGS if getattr(body, lang) is not None
    }
    if not updates:
        raise HTTPException(status_code=400, detail="At least one language value is required")

    now = datetime.now(UTC)
    for lang, value in updates.items():
        existing = session.exec(
            select(UITranslation).where(
                UITranslation.key == key,
                UITranslation.lang == lang,
            )
        ).first()
        if existing:
            existing.value = value
            existing.updated_at = now
            session.add(existing)
        else:
            session.add(UITranslation(key=key, lang=lang, value=value, updated_at=now))

    session.commit()

    db_overrides = _load_db_overrides(session, key=key)
    return _build_entry(key, i18n_db.translations, db_overrides)


@router.delete("/translations/{key}", status_code=204)
def delete_translation(key: str, admin: AdminDep, session: SessionDep):
    """Remove all DB overrides for this key (reverts all langs to seed values)."""
    rows = session.exec(select(UITranslation).where(UITranslation.key == key)).all()
    for row in rows:
        session.delete(row)
    session.commit()
