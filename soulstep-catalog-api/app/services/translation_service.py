"""Translation service — routes between Google Cloud API and headless browser backends.

Provides translate_text() and translate_batch() helpers used by the backfill script
and (optionally) online auto-translation during ingest.

Backend selection:
    TRANSLATION_BACKEND=api     — Google Cloud Translation API v3 (default)
    TRANSLATION_BACKEND=browser — Playwright headless browser via translate.google.com

Fallback:
    TRANSLATION_FALLBACK=true   — if browser returns None, retry via API

Google Cloud API configuration:
    GOOGLE_CLOUD_PROJECT — GCP project ID (required for api backend).
    Credentials are resolved automatically via Application Default Credentials (ADC).
    Run `gcloud auth application-default login` locally, or set
    GOOGLE_APPLICATION_CREDENTIALS to a service account JSON path if available.
    If GOOGLE_CLOUD_PROJECT is not set, all calls return None (graceful no-op).
"""

import logging
import os

logger = logging.getLogger(__name__)

_PROJECT_ENV = "GOOGLE_CLOUD_PROJECT"

TRANSLATION_BACKEND: str = os.environ.get("TRANSLATION_BACKEND", "api")
TRANSLATION_FALLBACK: bool = os.environ.get("TRANSLATION_FALLBACK", "false").lower() == "true"


def _backend() -> str:
    """Read backend setting dynamically so tests can override via monkeypatch."""
    return os.environ.get("TRANSLATION_BACKEND", "api")


def _fallback() -> bool:
    """Read fallback setting dynamically so tests can override via monkeypatch."""
    return os.environ.get("TRANSLATION_FALLBACK", "false").lower() == "true"


# ── Google Cloud API backend (private) ────────────────────────────────────────


def _get_project() -> str | None:
    """Return the GCP project ID or None if not configured."""
    return os.environ.get(_PROJECT_ENV) or None


def _make_client():
    """Return a TranslationServiceClient using ADC, or None on failure."""
    try:
        from google.cloud import translate_v3  # type: ignore[import-untyped]

        return translate_v3.TranslationServiceClient()
    except Exception as exc:
        logger.error("Failed to create Google Translate client: %s: %s", type(exc).__name__, exc)
        return None


def _translate_text_api(
    text: str,
    target_lang: str,
    source_lang: str = "en",
) -> str | None:
    """Translate a single string via Google Cloud Translation API v3."""
    results = _translate_batch_api([text], target_lang=target_lang, source_lang=source_lang)
    return results[0] if results else None


def _translate_batch_api(
    texts: list[str],
    target_lang: str,
    source_lang: str = "en",
) -> list[str | None]:
    """Translate multiple strings via Google Cloud Translation API v3."""
    project = _get_project()
    if not project:
        logger.warning(
            "%s not set — skipping batch of %d texts",
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

    client = _make_client()
    if client is None:
        logger.error("Could not initialise Google Translate client — check credentials")
        return [None] * len(texts)

    parent = f"projects/{project}/locations/global"
    logger.info(
        "Calling Google Translate API v3 (SDK): %d texts → %s (source=%s)",
        len(non_empty),
        target_lang,
        source_lang,
    )

    try:
        response = client.translate_text(
            request={
                "parent": parent,
                "contents": [t for _, t in non_empty],
                "mime_type": "text/plain",
                "source_language_code": source_lang,
                "target_language_code": target_lang,
            }
        )
        translated_texts = [t.translated_text for t in response.translations]
    except Exception as exc:
        logger.error("Google Translate batch API call failed: %s: %s", type(exc).__name__, exc)
        return [None] * len(texts)

    logger.info("Successfully translated %d texts → %s", len(translated_texts), target_lang)

    result: list[str | None] = [None] * len(texts)
    for (original_idx, _), translated in zip(non_empty, translated_texts, strict=False):
        result[original_idx] = translated
    return result


# ── Browser backend (private) ─────────────────────────────────────────────────


def _translate_text_browser(
    text: str,
    target_lang: str,
    source_lang: str = "en",
) -> str | None:
    """Translate a single string using the headless browser backend."""
    try:
        from app.services.browser_translation import translate_single_browser_sync

        return translate_single_browser_sync(text, target_lang=target_lang, source_lang=source_lang)
    except Exception as exc:
        logger.error("Browser translation failed: %s: %s", type(exc).__name__, exc)
        return None


def _translate_batch_browser(
    texts: list[str],
    target_lang: str,
    source_lang: str = "en",
) -> list[str | None]:
    """Translate multiple strings using the headless browser backend."""
    try:
        from app.services.browser_translation import translate_batch_browser_sync

        return translate_batch_browser_sync(texts, target_lang=target_lang, source_lang=source_lang)
    except Exception as exc:
        logger.error("Browser batch translation failed: %s: %s", type(exc).__name__, exc)
        return [None] * len(texts)


# ── Public API ─────────────────────────────────────────────────────────────────


def translate_text(
    text: str,
    target_lang: str,
    source_lang: str = "en",
) -> str | None:
    """Translate a single string.

    Routes to the backend selected by TRANSLATION_BACKEND (default: api).
    If TRANSLATION_FALLBACK=true and the browser backend returns None, retries via API.

    Returns the translated string, or None on failure.
    """
    if _backend() == "browser":
        result = _translate_text_browser(text, target_lang, source_lang)
        if result is None and _fallback():
            logger.info("translation_service: browser failed, falling back to API")
            result = _translate_text_api(text, target_lang, source_lang)
        return result

    return _translate_text_api(text, target_lang, source_lang)


def translate_batch(
    texts: list[str],
    target_lang: str,
    source_lang: str = "en",
) -> list[str | None]:
    """Translate multiple strings.

    Routes to the backend selected by TRANSLATION_BACKEND (default: api).
    If TRANSLATION_FALLBACK=true, any None result from the browser is retried via API.

    Returns a list of the same length as `texts`.
    """
    if _backend() == "browser":
        results = _translate_batch_browser(texts, target_lang, source_lang)
        if _fallback():
            # Retry failed entries via API
            failed_indices = [
                i for i, r in enumerate(results) if r is None and texts[i] and texts[i].strip()
            ]
            if failed_indices:
                logger.info(
                    "translation_service: retrying %d failed browser results via API",
                    len(failed_indices),
                )
                api_results = _translate_batch_api(
                    [texts[i] for i in failed_indices], target_lang, source_lang
                )
                for idx, api_result in zip(failed_indices, api_results, strict=False):
                    results[idx] = api_result
        return results

    return _translate_batch_api(texts, target_lang, source_lang)
