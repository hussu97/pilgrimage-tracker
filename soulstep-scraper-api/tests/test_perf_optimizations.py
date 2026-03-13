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
                raw_data={"image_urls": image_urls, "image_blobs": []},
            )
            session.add(place)
            session.commit()
            session.refresh(place)
            return place.id

    async def test_downloads_images_and_stores_blobs(self):
        from app.collectors.gmaps import download_place_images
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

        with patch("app.collectors.gmaps.httpx.AsyncClient", return_value=mock_client):
            await download_place_images("run1", engine, max_workers=1)

        with Session(engine) as session:
            place = session.exec(
                select(ScrapedPlace).where(ScrapedPlace.run_code == "run1")
            ).first()
            assert place is not None
            assert place.raw_data["image_blobs"] != []
            assert place.raw_data["image_urls"] == []

    async def test_skips_places_already_having_blobs(self):
        """Places that already have image_blobs should not be re-downloaded."""
        from app.collectors.gmaps import download_place_images
        from app.db.models import ScrapedPlace

        engine = _make_engine()
        with Session(engine) as session:
            place = ScrapedPlace(
                run_code="run2",
                place_code="gplc_test2",
                name="Already done",
                raw_data={
                    "image_urls": [],
                    "image_blobs": [{"data": "abc", "mime_type": "image/jpeg"}],
                },
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

        with patch("app.collectors.gmaps.httpx.AsyncClient", return_value=mock_client):
            await download_place_images("run2", engine, max_workers=1)

        assert called == [], "Should not have made any HTTP requests"

    async def test_handles_download_failure_gracefully(self):
        """A 404 response should result in no blobs stored but no crash."""
        from app.collectors.gmaps import download_place_images
        from app.db.models import ScrapedPlace

        engine = _make_engine()
        self._make_place(engine, "run3", ["http://example.com/missing.jpg"])

        mock_resp = MagicMock()
        mock_resp.status_code = 404

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.collectors.gmaps.httpx.AsyncClient", return_value=mock_client):
            # Should not raise
            await download_place_images("run3", engine, max_workers=1)

        with Session(engine) as session:
            place = session.exec(
                select(ScrapedPlace).where(ScrapedPlace.run_code == "run3")
            ).first()
            # Blobs should still be empty since download failed
            assert place.raw_data.get("image_blobs") == []


# ═══════════════════════════════════════════════════════════════════════════
# 2. Resource name derivation from DiscoveryCell records
# ═══════════════════════════════════════════════════════════════════════════


class TestResourceNameDerivation:
    async def test_discover_places_does_not_write_resource_names_to_run(self):
        """discover_places() should NOT write the full resource name list to run.discovered_resource_names."""
        from app.db.models import GeoBoundary, ScraperRun
        from app.scrapers.gmaps import discover_places

        engine = _make_engine()

        with Session(engine) as session:
            boundary = GeoBoundary(
                name="TestCity",
                boundary_type="city",
                lat_min=25.0,
                lat_max=25.1,
                lng_min=55.0,
                lng_max=55.1,
            )
            session.add(boundary)

            run = ScraperRun(run_code="run_x", location_code="loc1")
            session.add(run)
            session.commit()

        async def _fake_search_area(*args, **kwargs):
            return []

        with (
            patch("app.scrapers.gmaps.search_area", new=AsyncMock(side_effect=_fake_search_area)),
            patch("app.db.session.engine", engine),
            patch("app.scrapers.gmaps.GlobalCellStore"),
            patch("app.scrapers.gmaps.DiscoveryCellStore"),
            patch("app.scrapers.cell_store.DiscoveryCellStore"),
        ):
            with Session(engine) as session:
                type_map: dict = {}
                religion_map: dict = {}
                boundary_obj = session.exec(
                    select(GeoBoundary).where(GeoBoundary.name == "TestCity")
                ).first()

                await discover_places(
                    config={},
                    run_code="run_x",
                    session=session,
                    type_map=type_map,
                    religion_type_map=religion_map,
                    api_key="fake",
                    all_gmaps_types=["mosque"],
                    boundary=boundary_obj,
                )

                # Reload run from DB
                session.expire_all()
                run = session.exec(select(ScraperRun).where(ScraperRun.run_code == "run_x")).first()
                # The JSON list should be empty (no longer written at scale)
                assert run.discovered_resource_names == [] or run.discovered_resource_names is None

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
        rl.acquire("gmaps_details")  # exhaust single burst token (15 rps → ~0.067s)
        start = time.monotonic()
        rl.acquire("gmaps_details")
        elapsed = time.monotonic() - start
        assert elapsed >= 0.05  # must wait for at least one token

    def test_tokens_refill_over_time(self):
        """After waiting, new tokens should be available without blocking."""
        from app.scrapers.base import RateLimiter

        rl = RateLimiter(burst=1)
        rl.acquire("gmaps_search")  # exhaust burst
        time.sleep(0.2)  # wait for 2 tokens to refill at 10 rps

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

        place_types = ["mosque", "church"]
        store.save(25.0, 25.1, 55.0, 55.1, place_types, ["places/A", "places/B"], False)

        hit = store.get(25.0, 25.1, 55.0, 55.1, place_types)
        assert hit is not None
        assert set(hit.resource_names) == {"places/A", "places/B"}
        assert hit.saturated is False

    def test_miss_on_different_bbox(self):
        from app.scrapers.cell_store import GlobalCellStore

        engine = _make_engine()
        store = GlobalCellStore(engine, ttl_days=30)
        store.save(25.0, 25.1, 55.0, 55.1, ["mosque"], ["places/A"], False)

        hit = store.get(26.0, 26.1, 55.0, 55.1, ["mosque"])
        assert hit is None

    def test_miss_on_different_place_types(self):
        from app.scrapers.cell_store import GlobalCellStore

        engine = _make_engine()
        store = GlobalCellStore(engine, ttl_days=30)
        store.save(25.0, 25.1, 55.0, 55.1, ["mosque"], ["places/A"], False)

        hit = store.get(25.0, 25.1, 55.0, 55.1, ["church"])  # different types
        assert hit is None

    def test_expired_entry_returns_none(self):
        """Entries older than ttl_days should not be returned."""
        from datetime import UTC, datetime, timedelta

        from app.db.models import GlobalDiscoveryCell
        from app.scrapers.cell_store import GlobalCellStore, _place_types_hash

        engine = _make_engine()

        # Manually insert an expired cell
        place_types = ["mosque"]
        with Session(engine) as session:
            cell = GlobalDiscoveryCell(
                lat_min=25.0,
                lat_max=25.1,
                lng_min=55.0,
                lng_max=55.1,
                place_types_hash=_place_types_hash(place_types),
                result_count=1,
                saturated=False,
                resource_names=["places/OLD"],
                searched_at=datetime.now(UTC) - timedelta(days=31),  # expired
            )
            session.add(cell)
            session.commit()

        # Create store with 30-day TTL — expired cell should not be loaded
        store = GlobalCellStore(engine, ttl_days=30)
        hit = store.get(25.0, 25.1, 55.0, 55.1, place_types)
        assert hit is None

    def test_upsert_replaces_stale_entry(self):
        """Saving the same bbox again should replace the old entry."""
        from app.scrapers.cell_store import GlobalCellStore

        engine = _make_engine()
        store = GlobalCellStore(engine, ttl_days=30)

        place_types = ["mosque"]
        store.save(25.0, 25.1, 55.0, 55.1, place_types, ["places/OLD"], False)
        store.save(25.0, 25.1, 55.0, 55.1, place_types, ["places/NEW1", "places/NEW2"], True)

        hit = store.get(25.0, 25.1, 55.0, 55.1, place_types)
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
                store.save(lat, lat + 0.1, 55.0, 55.1, ["mosque"], [f"places/{i}"], False)
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=_save, args=(i,)) for i in range(10)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=5)

        assert errors == [], f"Thread errors: {errors}"


# ═══════════════════════════════════════════════════════════════════════════
# 5. Field mask split — fetch_details_split()
# ═══════════════════════════════════════════════════════════════════════════


class TestFetchDetailsSplit:
    def _make_rate_limiter(self):
        from app.scrapers.base import AsyncRateLimiter

        return AsyncRateLimiter(burst=10)

    async def test_only_essential_for_permanently_closed(self):
        """PERMANENTLY_CLOSED places should skip the extended API call."""
        from app.collectors.gmaps import GmapsCollector

        collector = GmapsCollector()
        rl = self._make_rate_limiter()

        essential_resp = {
            "businessStatus": "PERMANENTLY_CLOSED",
            "rating": 4.5,
            "displayName": {"text": "Closed Place"},
        }

        call_count = [0]

        def fake_fetch(place_name, api_key, field_mask=None, http_session=None):
            call_count[0] += 1
            return dict(essential_resp)

        with patch.object(collector, "_fetch_details", new=AsyncMock(side_effect=fake_fetch)):
            with patch.dict(os.environ, {"GOOGLE_MAPS_API_KEY": "fake"}):
                await collector.fetch_details_split("places/X", "fake", rl)

        assert call_count[0] == 1  # only essential call

    async def test_single_call_for_any_place(self):
        """fetch_details_split always issues exactly one _fetch_details call (merged mask)."""
        from app.collectors.gmaps import GmapsCollector

        collector = GmapsCollector()
        rl = self._make_rate_limiter()

        full_resp = {
            "businessStatus": "OPERATIONAL",
            "rating": 4.2,
            "accessibilityOptions": {"wheelchairAccessibleEntrance": True},
        }
        call_count = [0]

        def fake_fetch(place_name, api_key, field_mask=None, http_session=None):
            call_count[0] += 1
            # Merged call must use the full FIELD_MASK (both essential + extended fields)
            assert field_mask == collector.FIELD_MASK
            return dict(full_resp)

        with patch.object(collector, "_fetch_details", new=AsyncMock(side_effect=fake_fetch)):
            result = await collector.fetch_details_split("places/Y", "fake", rl)

        assert call_count[0] == 1  # always exactly one merged call
        assert result.get("accessibilityOptions") is not None

    async def test_single_call_for_unrated_place(self):
        """An unrated place also gets exactly one merged call (not two)."""
        from app.collectors.gmaps import GmapsCollector

        collector = GmapsCollector()
        rl = self._make_rate_limiter()

        essential_resp = {
            "businessStatus": "OPERATIONAL",
            "rating": None,  # no rating
        }

        call_count = [0]

        def fake_fetch(place_name, api_key, field_mask=None, http_session=None):
            call_count[0] += 1
            return dict(essential_resp)

        with patch.object(collector, "_fetch_details", new=AsyncMock(side_effect=fake_fetch)):
            await collector.fetch_details_split("places/Z", "fake", rl)

        assert call_count[0] == 1  # only essential


# ═══════════════════════════════════════════════════════════════════════════
# 6. build_place_data — no blobs, only URLs
# ═══════════════════════════════════════════════════════════════════════════


class TestBuildPlaceDataNoBlobStorage:
    def test_build_place_data_stores_urls_not_blobs(self):
        """build_place_data must always return empty image_blobs and populated image_urls."""
        from app.collectors.gmaps import GmapsCollector

        collector = GmapsCollector()

        response = {
            "photos": [{"name": "places/X/photos/abc"}],
            "displayName": {"text": "Test Mosque"},
            "types": ["mosque"],
            "location": {"latitude": 25.0, "longitude": 55.0},
            "formattedAddress": "123 Test St",
            "businessStatus": "OPERATIONAL",
            "editorialSummary": {"text": "A test mosque."},
        }

        with (
            patch("app.collectors.gmaps.detect_religion_from_types", return_value="islam"),
            patch(
                "app.collectors.gmaps.get_gmaps_type_to_our_type", return_value={"mosque": "mosque"}
            ),
            patch("app.collectors.gmaps.clean_address", return_value="123 Test St"),
            patch("app.collectors.gmaps.process_weekly_hours", return_value={}),
        ):
            result = collector.build_place_data(response, "gplc_X", "fake_key", None)

        assert result["image_blobs"] == []
        assert len(result["image_urls"]) == 1
        assert "abc" in result["image_urls"][0]
