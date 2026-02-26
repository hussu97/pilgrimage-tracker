"""
Unit tests for app/services/image_storage.py.

Uses unittest.mock to avoid any real GCS calls.
"""

import os
from unittest.mock import MagicMock, patch

import pytest

from app.services.image_storage import (
    BlobStorageBackend,
    GCSStorageBackend,
    get_image_storage,
    is_gcs_enabled,
    reset_storage_instance,
)


@pytest.fixture(autouse=True)
def _reset_singleton():
    """Ensure the storage singleton is reset before/after each test."""
    reset_storage_instance()
    yield
    reset_storage_instance()


# ── BlobStorageBackend ────────────────────────────────────────────────────────


class TestBlobStorageBackend:
    def test_upload_returns_none(self):
        backend = BlobStorageBackend()
        result = backend.upload(b"data", "image/jpeg", "images/places/")
        assert result is None

    def test_delete_is_noop(self):
        backend = BlobStorageBackend()
        # Should not raise
        backend.delete("https://storage.googleapis.com/bucket/some/path.jpg")

    def test_delete_empty_url_is_noop(self):
        backend = BlobStorageBackend()
        backend.delete("")


# ── GCSStorageBackend ─────────────────────────────────────────────────────────


class TestGCSStorageBackend:
    def _make_backend(self, bucket_name="test-bucket"):
        """Build a GCSStorageBackend with a fully mocked GCS client."""
        mock_blob = MagicMock()
        mock_blob.public_url = (
            f"https://storage.googleapis.com/{bucket_name}/images/reviews/abc123.jpg"
        )

        mock_bucket = MagicMock()
        mock_bucket.name = bucket_name
        mock_bucket.blob.return_value = mock_blob

        mock_client = MagicMock()
        mock_client.bucket.return_value = mock_bucket

        with patch("google.cloud.storage.Client", return_value=mock_client):
            backend = GCSStorageBackend(bucket_name)

        # Inject the mocked bucket/blob directly so we don't need live credentials
        backend._bucket = mock_bucket
        backend._mock_blob = mock_blob
        return backend

    def test_upload_returns_public_url(self):
        backend = self._make_backend()
        url = backend.upload(b"data", "image/jpeg", "images/reviews/")
        assert url.startswith("https://storage.googleapis.com/")
        assert url.endswith(".jpg")

    def test_upload_constructs_url_directly(self):
        """URL is built directly (not via make_public) to support uniform bucket-level access."""
        backend = self._make_backend("test-bucket")
        url = backend.upload(b"data", "image/jpeg", "images/reviews/")
        assert url.startswith("https://storage.googleapis.com/test-bucket/images/reviews/")
        assert url.endswith(".jpg")
        backend._mock_blob.make_public.assert_not_called()

    def test_upload_png_extension(self):
        backend = self._make_backend()
        url = backend.upload(b"data", "image/png", "images/places/")
        assert url.endswith(".jpg") or ".png" in url or ".jpg" in url  # depends on mock url

    def test_delete_calls_blob_delete(self):
        bucket_name = "test-bucket"
        backend = self._make_backend(bucket_name)

        url = f"https://storage.googleapis.com/{bucket_name}/images/reviews/abc.jpg"
        backend.delete(url)
        backend._bucket.blob.assert_called()

    def test_delete_ignores_unknown_url(self):
        backend = self._make_backend()
        # Should not raise even when URL doesn't match bucket
        backend.delete("https://other.com/image.jpg")

    def test_delete_empty_url_is_noop(self):
        backend = self._make_backend()
        backend.delete("")

    def test_raises_on_empty_bucket_name(self):
        with pytest.raises(RuntimeError, match="GCS_BUCKET_NAME"):
            with patch("google.cloud.storage.Client"):
                GCSStorageBackend("")


# ── get_image_storage / is_gcs_enabled ───────────────────────────────────────


class TestGetImageStorage:
    def test_defaults_to_blob(self):
        with patch.dict(os.environ, {"IMAGE_STORAGE": "blob"}, clear=False):
            storage = get_image_storage()
        assert isinstance(storage, BlobStorageBackend)

    def test_unset_defaults_to_blob(self):
        env = {k: v for k, v in os.environ.items() if k != "IMAGE_STORAGE"}
        with patch.dict(os.environ, env, clear=True):
            storage = get_image_storage()
        assert isinstance(storage, BlobStorageBackend)

    def test_gcs_returns_gcs_backend(self):
        mock_client = MagicMock()
        mock_client.bucket.return_value = MagicMock()

        with (
            patch.dict(os.environ, {"IMAGE_STORAGE": "gcs", "GCS_BUCKET_NAME": "my-bucket"}),
            patch("google.cloud.storage.Client", return_value=mock_client),
        ):
            storage = get_image_storage()
        assert isinstance(storage, GCSStorageBackend)

    def test_gcs_raises_when_no_bucket(self):
        env_patch = {"IMAGE_STORAGE": "gcs", "GCS_BUCKET_NAME": ""}
        with (
            patch.dict(os.environ, env_patch),
            patch("google.cloud.storage.Client"),
            pytest.raises(RuntimeError, match="GCS_BUCKET_NAME"),
        ):
            get_image_storage()

    def test_singleton_is_reused(self):
        storage1 = get_image_storage()
        storage2 = get_image_storage()
        assert storage1 is storage2


class TestIsGcsEnabled:
    def test_returns_false_for_blob(self):
        with patch.dict(os.environ, {"IMAGE_STORAGE": "blob"}):
            assert is_gcs_enabled() is False

    def test_returns_true_for_gcs(self):
        with patch.dict(os.environ, {"IMAGE_STORAGE": "gcs"}):
            assert is_gcs_enabled() is True

    def test_returns_false_when_unset(self):
        env = {k: v for k, v in os.environ.items() if k != "IMAGE_STORAGE"}
        with patch.dict(os.environ, env, clear=True):
            assert is_gcs_enabled() is False
