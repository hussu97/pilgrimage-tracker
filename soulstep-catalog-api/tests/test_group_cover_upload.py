"""
Tests for group cover image upload and serving endpoints.

Covers:
- POST /api/v1/groups/upload-cover  (cover image upload pipeline)
- GET  /api/v1/groups/cover/{image_code}  (serve cover image blob)
- GCS upload flow (mocked)
"""

from io import BytesIO
from unittest.mock import MagicMock, patch

from PIL import Image

UPLOAD_URL = "/api/v1/groups/upload-cover"
COVER_URL = "/api/v1/groups/cover"


def _make_jpeg_bytes(width=100, height=100) -> bytes:
    img = Image.new("RGB", (width, height), color=(100, 149, 237))
    buf = BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


# ── TestUploadGroupCover ──────────────────────────────────────────────────────


class TestUploadGroupCover:
    def test_upload_valid_jpeg(self, auth_client):
        client, token, user_code = auth_client
        jpeg = _make_jpeg_bytes()
        resp = client.post(
            UPLOAD_URL,
            files={"file": ("cover.jpg", jpeg, "image/jpeg")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "image_code" in data
        assert data["url"].startswith("/api/v1/groups/cover/")
        assert "width" in data
        assert "height" in data

    def test_upload_png(self, auth_client):
        client, token, user_code = auth_client
        img = Image.new("RGB", (50, 50), color=(255, 0, 0))
        buf = BytesIO()
        img.save(buf, format="PNG")
        resp = client.post(
            UPLOAD_URL,
            files={"file": ("cover.png", buf.getvalue(), "image/png")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "image_code" in data

    def test_upload_webp(self, auth_client):
        client, token, user_code = auth_client
        img = Image.new("RGB", (80, 80), color=(0, 255, 0))
        buf = BytesIO()
        img.save(buf, format="WEBP")
        resp = client.post(
            UPLOAD_URL,
            files={"file": ("cover.webp", buf.getvalue(), "image/webp")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "image_code" in data

    def test_upload_invalid_type_returns_400(self, auth_client):
        client, token, user_code = auth_client
        resp = client.post(
            UPLOAD_URL,
            files={"file": ("doc.pdf", b"%PDF-1.4", "application/pdf")},
        )
        assert resp.status_code == 400

    def test_upload_gif_type_returns_400(self, auth_client):
        client, token, user_code = auth_client
        resp = client.post(
            UPLOAD_URL,
            files={"file": ("anim.gif", b"GIF89a", "image/gif")},
        )
        assert resp.status_code == 400

    def test_upload_oversized_file_returns_400(self, auth_client):
        client, token, user_code = auth_client
        # 6 MB of data
        big_data = b"\xff\xd8\xff\xe0" + b"\x00" * (6 * 1024 * 1024)
        resp = client.post(
            UPLOAD_URL,
            files={"file": ("big.jpg", big_data, "image/jpeg")},
        )
        assert resp.status_code == 400

    def test_upload_requires_auth(self, client):
        jpeg = _make_jpeg_bytes()
        resp = client.post(
            UPLOAD_URL,
            files={"file": ("cover.jpg", jpeg, "image/jpeg")},
        )
        assert resp.status_code == 401

    def test_upload_wide_image_gets_resized(self, auth_client):
        """An image wider than 1200px should be resized to max 1200px width."""
        client, token, user_code = auth_client
        img = Image.new("RGB", (2000, 500), color=(50, 50, 50))
        buf = BytesIO()
        img.save(buf, format="JPEG")
        resp = client.post(
            UPLOAD_URL,
            files={"file": ("wide.jpg", buf.getvalue(), "image/jpeg")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["width"] <= 1200

    def test_upload_rgba_image_converted(self, auth_client):
        """RGBA images should be converted to RGB successfully."""
        client, token, user_code = auth_client
        img = Image.new("RGBA", (100, 100), color=(0, 128, 255, 128))
        buf = BytesIO()
        img.save(buf, format="PNG")
        resp = client.post(
            UPLOAD_URL,
            files={"file": ("rgba.png", buf.getvalue(), "image/png")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "image_code" in data


# ── TestGetCoverImage ─────────────────────────────────────────────────────────


class TestGetCoverImage:
    def test_get_uploaded_cover_returns_bytes(self, auth_client):
        client, token, user_code = auth_client
        jpeg = _make_jpeg_bytes()
        upload_resp = client.post(
            UPLOAD_URL,
            files={"file": ("cover.jpg", jpeg, "image/jpeg")},
        )
        assert upload_resp.status_code == 200
        image_code = upload_resp.json()["image_code"]

        resp = client.get(f"{COVER_URL}/{image_code}")
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("image/")
        assert len(resp.content) > 0

    def test_get_nonexistent_cover_returns_404(self, client):
        resp = client.get(f"{COVER_URL}/nonexistent_code_xyz")
        assert resp.status_code == 404

    def test_cover_image_has_cache_headers(self, auth_client):
        """Served cover images should have long-lived cache headers."""
        client, token, user_code = auth_client
        jpeg = _make_jpeg_bytes()
        upload_resp = client.post(
            UPLOAD_URL,
            files={"file": ("cover.jpg", jpeg, "image/jpeg")},
        )
        assert upload_resp.status_code == 200
        image_code = upload_resp.json()["image_code"]

        resp = client.get(f"{COVER_URL}/{image_code}")
        assert resp.status_code == 200
        assert "max-age" in resp.headers.get("cache-control", "")


# ── TestGCSCoverUpload ────────────────────────────────────────────────────────


class TestGCSCoverUpload:
    def test_upload_uses_gcs_when_enabled(self, auth_client):
        """When GCS is enabled, upload returns a full GCS URL."""
        client, token, user_code = auth_client
        jpeg = _make_jpeg_bytes()

        gcs_public_url = "https://storage.googleapis.com/test-bucket/images/group-covers/abc123.jpg"

        mock_storage = MagicMock()
        mock_storage.upload.return_value = gcs_public_url

        with (
            patch("app.api.v1.groups.is_gcs_enabled", return_value=True),
            patch("app.api.v1.groups.get_image_storage", return_value=mock_storage),
        ):
            resp = client.post(
                UPLOAD_URL,
                files={"file": ("cover.jpg", jpeg, "image/jpeg")},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["url"] == gcs_public_url
        assert "image_code" in data
        mock_storage.upload.assert_called_once()
