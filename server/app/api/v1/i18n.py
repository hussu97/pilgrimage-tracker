from fastapi import APIRouter, Query

from app.db import i18n as i18n_db

router = APIRouter()


@router.get("/languages")
def get_languages():
    """Return list of supported languages (code, name). No auth required."""
    return i18n_db.get_languages()


@router.get("/translations")
def get_translations(lang: str = Query(default="en", alias="lang")):
    """Return translation key -> value for the given lang. Fallback to English for missing keys. No auth required."""
    return i18n_db.get_translations(lang)
