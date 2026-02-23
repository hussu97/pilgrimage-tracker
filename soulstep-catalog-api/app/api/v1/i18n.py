from fastapi import APIRouter, Query
from sqlmodel import select

from app.db import i18n as i18n_db
from app.db.models import UITranslation
from app.db.session import SessionDep

router = APIRouter()


@router.get("/languages")
def get_languages():
    """Return list of supported languages (code, name). No auth required."""
    return i18n_db.get_languages()


@router.get("/translations")
def get_translations(
    session: SessionDep,
    lang: str = Query(default="en", alias="lang"),
):
    """Return translation key -> value for the given lang.

    Merges in-memory seed data with any DB overrides (UITranslation rows).
    DB overrides take precedence. Fallback to English for missing keys.
    No auth required.
    """
    result = dict(i18n_db.get_translations(lang))

    # Apply runtime DB overrides for this specific language on top of seed
    overrides = session.exec(select(UITranslation).where(UITranslation.lang == lang)).all()
    for row in overrides:
        result[row.key] = row.value

    return result
