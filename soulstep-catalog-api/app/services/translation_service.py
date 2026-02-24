"""Google Cloud Translation API v3 wrapper.

Provides translate_text() and translate_batch() helpers used by the backfill script
and (optionally) online auto-translation during ingest.

Configuration:
    GOOGLE_TRANSLATE_API_KEY — Cloud Translation API key (required).
    GOOGLE_CLOUD_PROJECT     — GCP project ID (required for v3 endpoint).
    If either is not set, all calls return None (graceful no-op).
"""

import logging
import os

import requests

logger = logging.getLogger(__name__)

_TRANSLATE_V3_URL = (
    "https://translation.googleapis.com/v3/projects/{project}/locations/global:translateText"
)
_API_KEY_ENV = "GOOGLE_TRANSLATE_API_KEY"
_PROJECT_ENV = "GOOGLE_CLOUD_PROJECT"


def _get_credentials() -> tuple[str, str] | None:
    """Return (api_key, project_id) or None if either is missing."""
    api_key = os.environ.get(_API_KEY_ENV) or None
    project = os.environ.get(_PROJECT_ENV) or None
    if not api_key or not project:
        return None
    return api_key, project


def translate_text(
    text: str,
    target_lang: str,
    source_lang: str = "en",
) -> str | None:
    """Translate a single string via Google Cloud Translation API v3.

    Returns the translated string, or None if credentials are not configured or
    the call fails.
    """
    creds = _get_credentials()
    if not creds:
        logger.warning("%s and/or %s not set — skipping translation", _API_KEY_ENV, _PROJECT_ENV)
        return None

    if not text or not text.strip():
        return None

    api_key, project = creds
    url = _TRANSLATE_V3_URL.format(project=project)

    try:
        resp = requests.post(
            url,
            params={"key": api_key},
            json={
                "contents": [text],
                "sourceLanguageCode": source_lang,
                "targetLanguageCode": target_lang,
                "mimeType": "text/plain",
            },
            timeout=10,
        )
        if not resp.ok:
            logger.error(
                "Google Translate API returned HTTP %d: %s", resp.status_code, resp.text[:500]
            )
            return None
        data = resp.json()
        return data["translations"][0]["translatedText"]
    except requests.exceptions.ConnectionError as exc:
        logger.error("Google Translate API connection failed (check network/API key): %s", exc)
        return None
    except requests.exceptions.Timeout:
        logger.error("Google Translate API timed out after 10s")
        return None
    except (KeyError, IndexError) as exc:
        logger.error(
            "Unexpected Google Translate API response structure: %s — raw: %s",
            exc,
            resp.text[:500],
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
    creds = _get_credentials()
    if not creds:
        logger.warning(
            "%s and/or %s not set — skipping batch of %d texts",
            _API_KEY_ENV,
            _PROJECT_ENV,
            len(texts),
        )
        return [None] * len(texts)

    if not texts:
        return []

    # Filter out empty inputs (API rejects blank strings)
    non_empty = [(i, t) for i, t in enumerate(texts) if t and t.strip()]
    if not non_empty:
        logger.warning("All %d texts in batch are empty — nothing to translate", len(texts))
        return [None] * len(texts)

    api_key, project = creds
    url = _TRANSLATE_V3_URL.format(project=project)

    logger.info(
        "Calling Google Translate API v3: %d texts → %s (source=%s)",
        len(non_empty),
        target_lang,
        source_lang,
    )

    try:
        resp = requests.post(
            url,
            params={"key": api_key},
            json={
                "contents": [t for _, t in non_empty],
                "sourceLanguageCode": source_lang,
                "targetLanguageCode": target_lang,
                "mimeType": "text/plain",
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
        translated_texts = [t["translatedText"] for t in data["translations"]]
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
