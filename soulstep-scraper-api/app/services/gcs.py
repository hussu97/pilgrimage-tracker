"""
GCS image upload utility — mirrors the catalog API's image_storage.py exactly.

Path format:  images/places/{secrets.token_hex(16)}.jpg
Bucket:       GCS_BUCKET_NAME (same env var as catalog API)
URL format:   https://storage.googleapis.com/{bucket}/images/places/{hex}.jpg

Using the same bucket + prefix as the catalog means scraped images land in the
same folder as user-uploaded images — no separate folder, no duplication.
Uniform bucket-level access is assumed (no per-object ACLs / make_public()).

GCS is always required for the scraper — set GCS_BUCKET_NAME in your environment.
"""

from __future__ import annotations

import secrets

from app.logger import get_logger

logger = get_logger(__name__)

# Matches PREFIX_PLACES in catalog's app/services/image_storage.py
_PREFIX_PLACES = "images/places/"

_EXT_MAP = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
}


def upload_image_bytes(data: bytes, mime_type: str = "image/jpeg") -> str | None:
    """Upload image bytes to GCS and return the public HTTPS URL.

    Object path:  images/places/{hex16}.{ext}
    Raises RuntimeError if GCS_BUCKET_NAME is not configured.
    Returns None if the upload fails (transient error).
    """
    from app.config import settings

    bucket_name = settings.gcs_bucket_name
    if not bucket_name:
        raise RuntimeError(
            "GCS_BUCKET_NAME is not set. GCS is required for image storage. "
            "Set GCS_BUCKET_NAME in your environment."
        )

    ext = _EXT_MAP.get(mime_type, "jpg")
    object_name = f"{_PREFIX_PLACES}{secrets.token_hex(16)}.{ext}"

    try:
        from google.cloud import storage  # type: ignore[import-untyped]

        client = storage.Client()
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(object_name)
        blob.upload_from_string(data, content_type=mime_type)
        # Construct URL directly — make_public() requires legacy per-object ACLs
        # which conflict with uniform bucket-level access (the GCP default).
        url = f"https://storage.googleapis.com/{bucket_name}/{object_name}"
        logger.debug("GCS upload OK: %s", url)
        return url
    except Exception as exc:
        logger.warning("GCS upload failed: %s", exc)
        return None
