"""
GCS image upload utility.

Uploads scraped place images to Google Cloud Storage when GCS_BUCKET_NAME is
set. Falls back gracefully when the google-cloud-storage package is not
installed or credentials are not configured.

Public URL format:
    https://storage.googleapis.com/{bucket}/{prefix}/places/{place_code}/{idx}.jpg
"""

from __future__ import annotations

import io
from typing import TYPE_CHECKING

from app.logger import get_logger

if TYPE_CHECKING:
    pass

logger = get_logger(__name__)


def is_gcs_configured() -> bool:
    """Return True if GCS upload is configured (bucket name set)."""
    from app.config import settings

    return bool(settings.gcs_bucket_name)


def upload_image_bytes(
    place_code: str, idx: int, data: bytes, mime_type: str = "image/jpeg"
) -> str | None:
    """Upload image bytes to GCS and return the public HTTPS URL.

    Returns None if GCS is not configured or the upload fails.

    Object path: {prefix}/places/{place_code}/{idx}.jpg  (or .webp)
    """
    from app.config import settings

    bucket_name = settings.gcs_bucket_name
    if not bucket_name:
        return None

    ext = "webp" if "webp" in mime_type else "jpg"
    object_name = f"{settings.gcs_image_prefix}/places/{place_code}/{idx}.{ext}"

    try:
        from google.cloud import storage  # type: ignore[import-untyped]

        client = storage.Client()
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(object_name)
        blob.upload_from_file(io.BytesIO(data), content_type=mime_type)
        # Make the blob publicly readable
        blob.make_public()
        url = blob.public_url
        logger.debug("GCS upload OK: %s → %s", object_name, url)
        return url
    except ImportError:
        logger.warning(
            "google-cloud-storage not installed; falling back to base64 blob storage. "
            "Run: pip install google-cloud-storage"
        )
        return None
    except Exception as exc:
        logger.warning("GCS upload failed for %s idx=%d: %s", place_code, idx, exc)
        return None
