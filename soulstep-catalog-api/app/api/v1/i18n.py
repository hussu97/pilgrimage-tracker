import time
from threading import Lock

from fastapi import APIRouter, Query, Response
from sqlmodel import select

from app.db import i18n as i18n_db
from app.db.models import UITranslation
from app.db.session import SessionDep

router = APIRouter()

# In-memory TTL cache for UITranslation DB overrides: lang -> (overrides_dict, expires_at)
_db_overrides_cache: dict[str, tuple[dict[str, str], float]] = {}
_db_overrides_lock = Lock()
_DB_OVERRIDES_TTL = 3600.0  # 1 hour


def _get_db_overrides(lang: str, session) -> dict[str, str]:
    """Return UITranslation overrides for lang, using an in-memory 1h TTL cache."""
    now = time.monotonic()
    with _db_overrides_lock:
        cached = _db_overrides_cache.get(lang)
        if cached is not None and now < cached[1]:
            return cached[0]

    # Cache miss or expired — query DB
    overrides_rows = session.exec(select(UITranslation).where(UITranslation.lang == lang)).all()
    overrides = {row.key: row.value for row in overrides_rows}
    with _db_overrides_lock:
        _db_overrides_cache[lang] = (overrides, now + _DB_OVERRIDES_TTL)
    return overrides


@router.get("/languages")
def get_languages(response: Response):
    """Return list of supported languages (code, name). No auth required."""
    response.headers["Cache-Control"] = "public, max-age=86400"
    return i18n_db.get_languages()


@router.get("/translations")
def get_translations(
    response: Response,
    session: SessionDep,
    lang: str = Query(default="en", alias="lang"),
):
    """Return translation key -> value for the given lang.

    Merges in-memory seed data with any DB overrides (UITranslation rows).
    DB overrides take precedence. Fallback to English for missing keys.
    No auth required.
    """
    result = dict(i18n_db.get_translations(lang))

    # Apply runtime DB overrides (served from 1h TTL in-memory cache)
    overrides = _get_db_overrides(lang, session)
    result.update(overrides)

    response.headers["Cache-Control"] = "public, max-age=3600"
    return result
