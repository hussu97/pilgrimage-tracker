"""Image storage abstraction — blob (DB) or GCS backends.

Usage:
    from app.services.image_storage import get_image_storage, is_gcs_enabled

    storage = get_image_storage()
    gcs_url = storage.upload(data, "image/jpeg", "images/reviews/")
    storage.delete("https://storage.googleapis.com/bucket/images/reviews/abc.jpg")
"""

import secrets
from typing import Protocol

# GCS path prefixes
PREFIX_PLACES = "images/places/"
PREFIX_REVIEWS = "images/reviews/"
PREFIX_GROUP_COVERS = "images/group-covers/"


class StorageBackend(Protocol):
    def upload(self, data: bytes, mime_type: str, prefix: str) -> str | None:
        """Upload image data. Returns public URL or None (for blob backend)."""
        ...

    def delete(self, url: str) -> None:
        """Delete an image. No-op for blob backend or unknown URLs."""
        ...


class BlobStorageBackend:
    """Stores images as blobs in the database. Default for local dev."""

    def upload(self, data: bytes, mime_type: str, prefix: str) -> str | None:
        # Signal to caller: store blob_data in DB row
        return None

    def delete(self, url: str) -> None:
        # Nothing to delete externally
        pass


class GCSStorageBackend:
    """Stores images in a Google Cloud Storage bucket."""

    def __init__(self, bucket_name: str) -> None:
        if not bucket_name:
            raise RuntimeError("GCS_BUCKET_NAME must be set when IMAGE_STORAGE=gcs")
        from google.cloud import storage as gcs

        self._client = gcs.Client()
        self._bucket = self._client.bucket(bucket_name)

    def _ext_for_mime(self, mime_type: str) -> str:
        mapping = {
            "image/jpeg": "jpg",
            "image/png": "png",
            "image/webp": "webp",
            "image/gif": "gif",
        }
        return mapping.get(mime_type, "jpg")

    def upload(self, data: bytes, mime_type: str, prefix: str) -> str:
        ext = self._ext_for_mime(mime_type)
        object_name = f"{prefix}{secrets.token_hex(16)}.{ext}"
        blob = self._bucket.blob(object_name)
        blob.upload_from_string(data, content_type=mime_type)
        blob.make_public()
        return blob.public_url

    def delete(self, url: str) -> None:
        if not url:
            return
        # Extract the object name from the public URL
        # URL format: https://storage.googleapis.com/{bucket}/{object_name}
        bucket_name = self._bucket.name
        prefix = f"https://storage.googleapis.com/{bucket_name}/"
        if not url.startswith(prefix):
            return
        object_name = url[len(prefix) :]
        try:
            blob = self._bucket.blob(object_name)
            blob.delete()
        except Exception:
            pass


_storage_instance: StorageBackend | None = None


def get_image_storage() -> StorageBackend:
    """Return the singleton storage backend based on IMAGE_STORAGE env var."""
    global _storage_instance
    if _storage_instance is None:
        import os

        image_storage = os.environ.get("IMAGE_STORAGE", "blob")
        gcs_bucket = os.environ.get("GCS_BUCKET_NAME", "")

        if image_storage == "gcs":
            _storage_instance = GCSStorageBackend(gcs_bucket)
        else:
            _storage_instance = BlobStorageBackend()
    return _storage_instance


def is_gcs_enabled() -> bool:
    """Return True when the GCS backend is active."""
    import os

    return os.environ.get("IMAGE_STORAGE", "blob") == "gcs"


def reset_storage_instance() -> None:
    """Reset the singleton — used in tests when env vars change."""
    global _storage_instance
    _storage_instance = None
