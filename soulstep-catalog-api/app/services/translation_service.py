"""Google Cloud Translation API v3 wrapper.

Provides translate_text() and translate_batch() helpers used by the backfill script
and (optionally) online auto-translation during ingest.

Configuration:
    GOOGLE_CLOUD_PROJECT — GCP project ID (required).
    Credentials are resolved automatically via Application Default Credentials (ADC).
    Run `gcloud auth application-default login` locally, or set
    GOOGLE_APPLICATION_CREDENTIALS to a service account JSON path if available.
    If GOOGLE_CLOUD_PROJECT is not set, all calls return None (graceful no-op).
"""

import logging
import os

logger = logging.getLogger(__name__)

_PROJECT_ENV = "GOOGLE_CLOUD_PROJECT"


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


def translate_text(
    text: str,
    target_lang: str,
    source_lang: str = "en",
) -> str | None:
    """Translate a single string via Google Cloud Translation API v3.

    Returns the translated string, or None if credentials are not configured or
    the call fails.
    """
    results = translate_batch([text], target_lang=target_lang, source_lang=source_lang)
    return results[0] if results else None


def translate_batch(
    texts: list[str],
    target_lang: str,
    source_lang: str = "en",
) -> list[str | None]:
    """Translate multiple strings in a single API call.

    Returns a list of the same length as `texts`.  Any entry is None when the
    corresponding input is empty or when the call fails.
    """
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
