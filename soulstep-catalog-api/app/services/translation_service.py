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
        logger.warning("GOOGLE_TRANSLATE_API_KEY not set — skipping translation")
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
        if not resp.ok:
            logger.error(
                "Google Translate API returned HTTP %d: %s", resp.status_code, resp.text[:500]
            )
            return None
        data = resp.json()
        translated = data["data"]["translations"][0]["translatedText"]
        return translated
    except requests.exceptions.ConnectionError as exc:
        logger.error("Google Translate API connection failed (check network/API key): %s", exc)
        return None
    except requests.exceptions.Timeout:
        logger.error("Google Translate API timed out after 10s")
        return None
    except (KeyError, IndexError) as exc:
        logger.error(
            "Unexpected Google Translate API response structure: %s — raw: %s", exc, resp.text[:500]
        )
        return None
    except Exception as exc:
        logger.error("Google Translate API call failed: %s: %s", type(exc).__name__, exc)
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
        logger.warning("GOOGLE_TRANSLATE_API_KEY not set — skipping batch of %d texts", len(texts))
        return [None] * len(texts)

    if not texts:
        return []

    # Filter out empty inputs (API rejects blank strings)
    non_empty = [(i, t) for i, t in enumerate(texts) if t and t.strip()]
    if not non_empty:
        logger.warning("All %d texts in batch are empty — nothing to translate", len(texts))
        return [None] * len(texts)

    logger.info(
        "Calling Google Translate API: %d texts → %s (source=%s)",
        len(non_empty),
        target_lang,
        source_lang,
    )

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
        if not resp.ok:
            logger.error(
                "Google Translate batch API returned HTTP %d: %s",
                resp.status_code,
                resp.text[:500],
            )
            return [None] * len(texts)
        data = resp.json()
        translated_texts = [t["translatedText"] for t in data["data"]["translations"]]
    except requests.exceptions.ConnectionError as exc:
        logger.error("Google Translate API connection failed (check network/API key): %s", exc)
        return [None] * len(texts)
    except requests.exceptions.Timeout:
        logger.error("Google Translate batch API timed out after 30s")
        return [None] * len(texts)
    except (KeyError, IndexError) as exc:
        logger.error(
            "Unexpected Google Translate API response structure: %s — raw: %s",
            exc,
            resp.text[:500],
        )
        return [None] * len(texts)
    except Exception as exc:
        logger.error("Google Translate batch API call failed: %s: %s", type(exc).__name__, exc)
        return [None] * len(texts)

    logger.info("Successfully translated %d texts → %s", len(translated_texts), target_lang)

    result: list[str | None] = [None] * len(texts)
    for (original_idx, _), translated in zip(non_empty, translated_texts, strict=False):
        result[original_idx] = translated
    return result
