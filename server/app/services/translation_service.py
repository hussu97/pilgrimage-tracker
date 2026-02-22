"""Google Cloud Translation API v2 wrapper.

Provides translate_text() and translate_batch() helpers used by the backfill script
and (optionally) online auto-translation during ingest.

Configuration:
    GOOGLE_TRANSLATE_API_KEY — Cloud Translation API v2 key.
    If not set, all calls return None (graceful no-op).
"""

import logging
import os

import requests

logger = logging.getLogger(__name__)

_TRANSLATE_URL = "https://translation.googleapis.com/language/translate/v2"
_API_KEY_ENV = "GOOGLE_TRANSLATE_API_KEY"


def _get_api_key() -> str | None:
    return os.environ.get(_API_KEY_ENV) or None


def translate_text(
    text: str,
    target_lang: str,
    source_lang: str = "en",
) -> str | None:
    """Translate a single string via Google Cloud Translation API v2.

    Returns the translated string, or None if the API key is not configured or
    the call fails.
    """
    api_key = _get_api_key()
    if not api_key:
        logger.debug("GOOGLE_TRANSLATE_API_KEY not set — skipping translation")
        return None

    if not text or not text.strip():
        return None

    try:
        resp = requests.post(
            _TRANSLATE_URL,
            params={"key": api_key},
            json={
                "q": text,
                "source": source_lang,
                "target": target_lang,
                "format": "text",
            },
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        translated = data["data"]["translations"][0]["translatedText"]
        return translated
    except Exception as exc:
        logger.warning("Google Translate API call failed: %s", exc)
        return None


def translate_batch(
    texts: list[str],
    target_lang: str,
    source_lang: str = "en",
) -> list[str | None]:
    """Translate multiple strings in a single API call.

    Returns a list of the same length as `texts`.  Any entry is None when the
    corresponding input is empty or when the call fails.
    """
    api_key = _get_api_key()
    if not api_key:
        logger.debug("GOOGLE_TRANSLATE_API_KEY not set — returning empty batch")
        return [None] * len(texts)

    if not texts:
        return []

    # Filter out empty inputs (API rejects blank strings)
    non_empty = [(i, t) for i, t in enumerate(texts) if t and t.strip()]
    if not non_empty:
        return [None] * len(texts)

    try:
        resp = requests.post(
            _TRANSLATE_URL,
            params={"key": api_key},
            json={
                "q": [t for _, t in non_empty],
                "source": source_lang,
                "target": target_lang,
                "format": "text",
            },
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        translated_texts = [t["translatedText"] for t in data["data"]["translations"]]
    except Exception as exc:
        logger.warning("Google Translate batch API call failed: %s", exc)
        return [None] * len(texts)

    result: list[str | None] = [None] * len(texts)
    for (original_idx, _), translated in zip(non_empty, translated_texts, strict=False):
        result[original_idx] = translated
    return result
