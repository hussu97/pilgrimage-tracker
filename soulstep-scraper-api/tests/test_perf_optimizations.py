"""
Tests for the scraper performance and scale optimizations:
- Image phase decoupling (download_place_images)
- Resource name derivation from DiscoveryCell records
- Token-bucket rate limiter burst behaviour
- Cross-run GlobalCellStore
- Field mask split (fetch_details_split)
"""

import os
import sys
import threading
import time
from unittest.mock import AsyncMock, MagicMock, patch

from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


# ── helpers ──────────────────────────────────────────────────────────────────


def _make_engine():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    import app.db.models  # noqa: F401

    SQLModel.metadata.create_all(engine)
    return engine


# ═══════════════════════════════════════════════════════════════════════════
# 1. Image phase decoupling — download_place_images()
# ═══════════════════════════════════════════════════════════════════════════


class TestDownloadPlaceImages:
    def _make_place(self, engine, run_code: str, image_urls: list[str]):
        from app.db.models import ScrapedPlace

        with Session(engine) as session:
            place = ScrapedPlace(
                run_code=run_code,
                place_code="gplc_test1",
                name="Test Place",
                raw_data={"image_urls": image_urls},
            )
            session.add(place)
            session.commit()
            session.refresh(place)
            return place.id

    async def test_downloads_images_and_stores_gcs_urls(self):
        """Images are downloaded then uploaded to GCS; GCS URLs stored in image_urls."""
        from app.collectors.image_download import download_place_images
        from app.db.models import ScrapedPlace

        engine = _make_engine()
        self._make_place(engine, "run1", ["http://example.com/img.jpg"])

        _valid_jpeg = b"\xff\xd8\xff" + b"\x00" * 1024
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.content = _valid_jpeg

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        _gcs_url = "https://storage.googleapis.com/bucket/images/places/abc123.jpg"

        with (
            patch("app.collectors.image_download.httpx.AsyncClient", return_value=mock_client),
            patch("app.services.gcs.upload_image_bytes", return_value=_gcs_url),
        ):
            await download_place_images("run1", engine, max_workers=1)

        with Session(engine) as session:
            place = session.exec(
                select(ScrapedPlace).where(ScrapedPlace.run_code == "run1")
            ).first()
            assert place is not None
            assert place.raw_data["image_urls"] == [_gcs_url]
            assert "image_blobs" not in place.raw_data

    async def test_skips_places_already_having_gcs_urls(self):
        """Places whose URLs already start with the GCS prefix are not re-processed."""
        from app.collectors.image_download import download_place_images
        from app.db.models import ScrapedPlace

        engine = _make_engine()
        _gcs_url = "https://storage.googleapis.com/bucket/images/places/existing.jpg"
        with Session(engine) as session:
            place = ScrapedPlace(
                run_code="run2",
                place_code="gplc_test2",
                name="Already done",
                raw_data={"image_urls": [_gcs_url]},
            )
            session.add(place)
            session.commit()

        called = []

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(
            side_effect=lambda *a, **k: (
                called.append(1) or MagicMock(status_code=200, content=b"data")
            )
        )
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.collectors.image_download.httpx.AsyncClient", return_value=mock_client):
            await download_place_images("run2", engine, max_workers=1)

        assert called == [], "Should not have made any HTTP requests"

    async def test_handles_download_failure_gracefully(self):
        """A 404 response should result in no GCS URL stored but no crash."""
        from app.collectors.image_download import download_place_images
        from app.db.models import ScrapedPlace

        engine = _make_engine()
        self._make_place(engine, "run3", ["http://example.com/missing.jpg"])

        mock_resp = MagicMock()
        mock_resp.status_code = 404

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.collectors.image_download.httpx.AsyncClient", return_value=mock_client):
            # Should not raise
            await download_place_images("run3", engine, max_workers=1)

        with Session(engine) as session:
            place = session.exec(
                select(ScrapedPlace).where(ScrapedPlace.run_code == "run3")
            ).first()
            # image_urls unchanged (download failed, no GCS upload)
            assert place.raw_data.get("image_urls") == ["http://example.com/missing.jpg"]
            assert "image_blobs" not in place.raw_data


# ═══════════════════════════════════════════════════════════════════════════
# 2. Resource name derivation from DiscoveryCell records
# ═══════════════════════════════════════════════════════════════════════════


class TestResourceNameDerivation:
    def test_cells_provide_resource_names_for_resume(self):
        """DiscoveryCell records should be derivable to reconstruct place_ids on resume."""
        from app.db.models import DiscoveryCell, ScraperRun

        engine = _make_engine()

        with Session(engine) as session:
            run = ScraperRun(run_code="run_resume", location_code="loc1")
            session.add(run)
            # Add two cells with resource names
            cell1 = DiscoveryCell(
                run_code="run_resume",
                lat_min=25.0,
                lat_max=25.05,
                lng_min=55.0,
                lng_max=55.05,
                depth=1,
                radius_m=3000,
                result_count=3,
                saturated=False,
                resource_names=["places/A", "places/B", "places/C"],
            )
            cell2 = DiscoveryCell(
                run_code="run_resume",
                lat_min=25.05,
                lat_max=25.1,
                lng_min=55.0,
                lng_max=55.05,
                depth=1,
                radius_m=3000,
                result_count=2,
                saturated=False,
                resource_names=["places/D", "places/B"],  # B is a duplicate
            )
            session.add(cell1)
            session.add(cell2)
            session.commit()

        # Derive place_ids the same way resume_scraper_task does
        with Session(engine) as session:
            cells = session.exec(
                select(DiscoveryCell).where(DiscoveryCell.run_code == "run_resume")
            ).all()
            place_ids = list({name for cell in cells for name in cell.resource_names})

        assert len(place_ids) == 4  # A, B, C, D — B deduplicated
        assert set(place_ids) == {"places/A", "places/B", "places/C", "places/D"}


# ═══════════════════════════════════════════════════════════════════════════
# 3. Token-bucket rate limiter
# ═══════════════════════════════════════════════════════════════════════════


class TestTokenBucketRateLimiter:
    def test_burst_allows_multiple_rapid_calls(self):
        """With burst=3, the first 3 calls should be immediate."""
        from app.scrapers.base import RateLimiter

        rl = RateLimiter(burst=3)
        start = time.monotonic()
        for _ in range(3):
            rl.acquire("gmaps_details")
        elapsed = time.monotonic() - start
        # All 3 should complete well under 100ms
        assert elapsed < 0.1

    def test_call_beyond_burst_is_throttled(self):
        """The call after burst exhaustion must wait for token refill."""
        from app.scrapers.base import RateLimiter

        rl = RateLimiter(burst=1)
        rl.acquire("gmaps_details")  # exhaust single burst token (25 rps → ~0.04s)
        start = time.monotonic()
        rl.acquire("gmaps_details")
        elapsed = time.monotonic() - start
        assert elapsed >= 0.03  # must wait for at least one token at 25 rps

    def test_tokens_refill_over_time(self):
        """After waiting, new tokens should be available without blocking."""
        from app.scrapers.base import RateLimiter

        rl = RateLimiter(burst=1)
        rl.acquire("gmaps_search")  # exhaust burst
        time.sleep(0.2)  # wait for tokens to refill at 20 rps (0.2s × 20 = 4 tokens)

        start = time.monotonic()
        rl.acquire("gmaps_search")  # should be immediate
        elapsed = time.monotonic() - start
        assert elapsed < 0.05

    def test_concurrent_workers_all_get_tokens(self):
        """N workers competing for the same endpoint should all succeed."""
        from app.scrapers.base import RateLimiter

        rl = RateLimiter(burst=10)
        results = []
        lock = threading.Lock()

        def _work():
            rl.acquire("wikipedia")
            with lock:
                results.append(1)

        threads = [threading.Thread(target=_work) for _ in range(10)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=5)

        assert len(results) == 10


# ═══════════════════════════════════════════════════════════════════════════
# 4. GlobalCellStore — cross-run discovery cache
# ═══════════════════════════════════════════════════════════════════════════


class TestGlobalCellStore:
    def test_save_and_retrieve(self):
        from app.scrapers.cell_store import GlobalCellStore

        engine = _make_engine()
        store = GlobalCellStore(engine, ttl_days=30)

        store.save(25.0, 25.1, 55.0, 55.1, "mosque", ["places/A", "places/B"], False)

        hit = store.get(25.0, 25.1, 55.0, 55.1, "mosque")
        assert hit is not None
        assert set(hit.resource_names) == {"places/A", "places/B"}
        assert hit.saturated is False

    def test_miss_on_different_bbox(self):
        from app.scrapers.cell_store import GlobalCellStore

        engine = _make_engine()
        store = GlobalCellStore(engine, ttl_days=30)
        store.save(25.0, 25.1, 55.0, 55.1, "mosque", ["places/A"], False)

        hit = store.get(26.0, 26.1, 55.0, 55.1, "mosque")
        assert hit is None

    def test_miss_on_different_place_types(self):
        from app.scrapers.cell_store import GlobalCellStore

        engine = _make_engine()
        store = GlobalCellStore(engine, ttl_days=30)
        store.save(25.0, 25.1, 55.0, 55.1, "mosque", ["places/A"], False)

        hit = store.get(25.0, 25.1, 55.0, 55.1, "church")  # different type
        assert hit is None

    def test_expired_entry_returns_none(self):
        """Entries older than ttl_days should not be returned."""
        from datetime import UTC, datetime, timedelta

        from app.db.models import GlobalDiscoveryCell
        from app.scrapers.cell_store import GlobalCellStore

        engine = _make_engine()

        # Manually insert an expired cell
        with Session(engine) as session:
            cell = GlobalDiscoveryCell(
                lat_min=25.0,
                lat_max=25.1,
                lng_min=55.0,
                lng_max=55.1,
                place_type="mosque",
                result_count=1,
                saturated=False,
                resource_names=["places/OLD"],
                searched_at=datetime.now(UTC) - timedelta(days=31),  # expired
            )
            session.add(cell)
            session.commit()

        # Create store with 30-day TTL — expired cell should not be loaded
        store = GlobalCellStore(engine, ttl_days=30)
        hit = store.get(25.0, 25.1, 55.0, 55.1, "mosque")
        assert hit is None

    def test_upsert_replaces_stale_entry(self):
        """Saving the same bbox again should replace the old entry."""
        from app.scrapers.cell_store import GlobalCellStore

        engine = _make_engine()
        store = GlobalCellStore(engine, ttl_days=30)

        store.save(25.0, 25.1, 55.0, 55.1, "mosque", ["places/OLD"], False)
        store.save(25.0, 25.1, 55.0, 55.1, "mosque", ["places/NEW1", "places/NEW2"], True)

        hit = store.get(25.0, 25.1, 55.0, 55.1, "mosque")
        assert hit is not None
        assert set(hit.resource_names) == {"places/NEW1", "places/NEW2"}
        assert hit.saturated is True

    def test_thread_safe_concurrent_saves(self):
        """Multiple threads saving different cells should not conflict."""
        from app.scrapers.cell_store import GlobalCellStore

        engine = _make_engine()
        store = GlobalCellStore(engine, ttl_days=30)

        errors = []

        def _save(i: int):
            try:
                lat = 25.0 + i * 0.1
                store.save(lat, lat + 0.1, 55.0, 55.1, "mosque", [f"places/{i}"], False)
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=_save, args=(i,)) for i in range(10)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=5)

        assert errors == [], f"Thread errors: {errors}"
