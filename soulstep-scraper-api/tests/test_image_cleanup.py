"""
Tests for the image cleanup worker (cleanup_image_downloads) and the
POST /api/v1/scraper/cleanup/images endpoint.
"""

import os
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.db.models import DataLocation, ScrapedPlace, ScraperRun

# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest.fixture()
def engine():
    eng = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(eng)
    yield eng
    SQLModel.metadata.drop_all(eng)


def _make_run(session: Session) -> ScraperRun:
    loc = DataLocation(code="loc_test", name="Test", source_type="gmaps", config={"city": "X"})
    session.add(loc)
    session.commit()
    run = ScraperRun(run_code="run_test", location_code="loc_test", status="completed")
    session.add(run)
    session.commit()
    return run


def _make_place(
    session: Session,
    run_code: str,
    place_code: str,
    image_urls: list,
    image_blobs: list,
    quality_score: float | None = None,
    google_place_id: str | None = None,
) -> ScrapedPlace:
    raw: dict = {
        "name": "Test Place",
        "image_urls": image_urls,
        "image_blobs": image_blobs,
    }
    if google_place_id:
        raw["google_place_id"] = google_place_id
    place = ScrapedPlace(
        run_code=run_code,
        place_code=place_code,
        name="Test Place",
        raw_data=raw,
        quality_score=quality_score,
    )
    session.add(place)
    session.commit()
    return place


# ── cleanup_image_downloads unit tests ────────────────────────────────────────


class TestCleanupImageDownloads:
    @pytest.mark.asyncio
    async def test_no_pending_returns_zeros(self, engine):
        """Nothing to do → all counts are 0."""
        from app.collectors.gmaps import cleanup_image_downloads

        with Session(engine) as session:
            run = _make_run(session)
            # Place already has blobs — should be skipped
            _make_place(
                session,
                run.run_code,
                "plc_done",
                image_urls=[],
                image_blobs=[{"data": "abc", "mime_type": "image/jpeg"}],
            )

        result = await cleanup_image_downloads(engine, api_key="fake")
        assert result == {
            "pending_places": 0,
            "downloaded": 0,
            "refreshed_from_google": 0,
            "failed": 0,
        }

    @pytest.mark.asyncio
    async def test_successful_download_on_first_pass(self, engine):
        """Existing URLs that return valid JPEG bytes are downloaded and saved."""
        from app.collectors.gmaps import cleanup_image_downloads

        valid_jpeg = b"\xff\xd8\xff" + b"\x00" * 2000  # passes JPEG + size check

        with Session(engine) as session:
            run = _make_run(session)
            _make_place(
                session,
                run.run_code,
                "plc_ok",
                image_urls=["https://example.com/photo1.jpg"],
                image_blobs=[],
            )

        with patch(
            "app.collectors.gmaps._download_image",
            new=AsyncMock(return_value=valid_jpeg),
        ):
            result = await cleanup_image_downloads(engine, api_key="fake")

        assert result["pending_places"] == 1
        assert result["downloaded"] == 1
        assert result["failed"] == 0

        # Verify blobs were persisted and image_urls cleared
        with Session(engine) as session:
            place = session.exec(
                __import__("sqlmodel", fromlist=["select"])
                .select(ScrapedPlace)
                .where(ScrapedPlace.place_code == "plc_ok")
            ).first()
            assert place is not None
            assert place.raw_data["image_blobs"] != []
            assert place.raw_data["image_urls"] == []

    @pytest.mark.asyncio
    async def test_stale_urls_trigger_google_refetch(self, engine):
        """When all URLs fail, google_place_id is used to get fresh references."""
        from app.collectors.gmaps import cleanup_image_downloads

        valid_jpeg = b"\xff\xd8\xff" + b"\x00" * 2000

        with Session(engine) as session:
            run = _make_run(session)
            _make_place(
                session,
                run.run_code,
                "plc_stale",
                image_urls=["https://places.googleapis.com/v1/places/ABC/photos/OLD/media?key=x"],
                image_blobs=[],
                google_place_id="ChIJstale123",
            )

        google_resp = MagicMock()
        google_resp.status_code = 200
        google_resp.json.return_value = {"photos": [{"name": "places/ChIJstale123/photos/NEW_REF"}]}

        # First _download_image call (for stale URL) → None
        # Second call (for fresh URL) → valid_jpeg
        download_side_effects = [None, valid_jpeg]

        async def _fake_download(url, client=None):
            return download_side_effects.pop(0)

        async def _fake_get(*args, **kwargs):
            return google_resp

        with (
            patch("app.collectors.gmaps._download_image", side_effect=_fake_download),
            patch("httpx.AsyncClient.get", new=AsyncMock(side_effect=_fake_get)),
        ):
            result = await cleanup_image_downloads(engine, api_key="real_key")

        assert result["pending_places"] == 1
        assert result["downloaded"] == 1
        assert result["refreshed_from_google"] == 1
        assert result["failed"] == 0

    @pytest.mark.asyncio
    async def test_stale_without_google_place_id_counts_as_failed(self, engine):
        """Places with stale URLs but no google_place_id cannot be recovered."""
        from app.collectors.gmaps import cleanup_image_downloads

        with Session(engine) as session:
            run = _make_run(session)
            _make_place(
                session,
                run.run_code,
                "plc_noplaceid",
                image_urls=["https://example.com/dead.jpg"],
                image_blobs=[],
                google_place_id=None,
            )

        with patch("app.collectors.gmaps._download_image", new=AsyncMock(return_value=None)):
            result = await cleanup_image_downloads(engine, api_key="key")

        assert result["pending_places"] == 1
        assert result["downloaded"] == 0
        assert result["refreshed_from_google"] == 0
        assert result["failed"] == 1

    @pytest.mark.asyncio
    async def test_quality_gate_skips_low_score_places(self, engine):
        """Places below GATE_IMAGE_DOWNLOAD quality threshold are skipped."""
        from app.collectors.gmaps import cleanup_image_downloads

        with Session(engine) as session:
            run = _make_run(session)
            _make_place(
                session,
                run.run_code,
                "plc_low",
                image_urls=["https://example.com/photo.jpg"],
                image_blobs=[],
                quality_score=0.10,  # well below 0.75 gate
            )

        result = await cleanup_image_downloads(engine, api_key="key")
        assert result["pending_places"] == 0

    @pytest.mark.asyncio
    async def test_null_quality_score_passes_gate(self, engine):
        """quality_score=None means backwards-compat pass-through (existing runs)."""
        from app.collectors.gmaps import cleanup_image_downloads

        valid_jpeg = b"\xff\xd8\xff" + b"\x00" * 2000

        with Session(engine) as session:
            run = _make_run(session)
            _make_place(
                session,
                run.run_code,
                "plc_nullscore",
                image_urls=["https://example.com/photo.jpg"],
                image_blobs=[],
                quality_score=None,
            )

        with patch("app.collectors.gmaps._download_image", new=AsyncMock(return_value=valid_jpeg)):
            result = await cleanup_image_downloads(engine, api_key="key")

        assert result["pending_places"] == 1
        assert result["downloaded"] == 1


# ── POST /cleanup/images endpoint ─────────────────────────────────────────────


class TestCleanupImagesEndpoint:
    def test_cleanup_images_returns_202_started(self, client):
        """Endpoint returns started status and enqueues background task."""
        with patch(
            "app.api.v1.scraper._run_cleanup_images_bg",
            new=AsyncMock(),
        ):
            resp = client.post("/api/v1/scraper/cleanup/images")

        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "started"
        assert "message" in data
