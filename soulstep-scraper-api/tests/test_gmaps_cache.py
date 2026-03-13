"""
Unit tests for GlobalGmapsCacheStore (app/scrapers/gmaps_cache.py).
"""

import os
import sys
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


@pytest.fixture()
def cache_engine():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    import app.db.models  # noqa: F401

    SQLModel.metadata.create_all(engine)
    yield engine
    SQLModel.metadata.drop_all(engine)


class TestGlobalGmapsCacheStore:
    def test_miss_returns_none(self, cache_engine):
        from app.scrapers.gmaps_cache import GlobalGmapsCacheStore

        store = GlobalGmapsCacheStore(cache_engine, ttl_days=90)
        assert store.get("gplc_nonexistent") is None

    def test_save_and_hit(self, cache_engine):
        from app.scrapers.gmaps_cache import GlobalGmapsCacheStore

        store = GlobalGmapsCacheStore(cache_engine, ttl_days=90)
        store.save("gplc_abc123", {"name": "Test Mosque"}, quality_score=0.75)

        entry = store.get("gplc_abc123")
        assert entry is not None
        assert entry.raw_response == {"name": "Test Mosque"}
        assert entry.quality_score == pytest.approx(0.75)

    def test_upsert_replaces_old_entry(self, cache_engine):
        from app.scrapers.gmaps_cache import GlobalGmapsCacheStore

        store = GlobalGmapsCacheStore(cache_engine, ttl_days=90)
        store.save("gplc_abc", {"name": "Old"}, quality_score=0.3)
        store.save("gplc_abc", {"name": "New"}, quality_score=0.8)

        entry = store.get("gplc_abc")
        assert entry.raw_response["name"] == "New"
        assert entry.quality_score == pytest.approx(0.8)

    def test_expired_entry_returns_none(self, cache_engine):
        from app.db.models import GlobalGmapsCache
        from app.scrapers.gmaps_cache import GlobalGmapsCacheStore

        # Insert an entry directly with an old timestamp
        old_time = datetime.now(UTC) - timedelta(days=91)
        with Session(cache_engine) as session:
            entry = GlobalGmapsCache(
                place_code="gplc_old",
                raw_response={"name": "Old Place"},
                quality_score=0.5,
                cached_at=old_time,
            )
            session.add(entry)
            session.commit()

        # The store should NOT pre-load expired entries
        store = GlobalGmapsCacheStore(cache_engine, ttl_days=90)
        assert store.get("gplc_old") is None

    def test_pre_loads_valid_entries_on_init(self, cache_engine):
        from app.scrapers.gmaps_cache import GlobalGmapsCacheStore

        # Save via one store instance
        store1 = GlobalGmapsCacheStore(cache_engine, ttl_days=90)
        store1.save("gplc_valid", {"name": "Valid"}, quality_score=0.6)

        # Second instance should pre-load from DB
        store2 = GlobalGmapsCacheStore(cache_engine, ttl_days=90)
        entry = store2.get("gplc_valid")
        assert entry is not None
        assert entry.raw_response["name"] == "Valid"

    def test_save_without_quality_score(self, cache_engine):
        from app.scrapers.gmaps_cache import GlobalGmapsCacheStore

        store = GlobalGmapsCacheStore(cache_engine, ttl_days=90)
        store.save("gplc_noscore", {"name": "No Score"})

        entry = store.get("gplc_noscore")
        assert entry is not None
        assert entry.quality_score is None

    def test_concurrent_save_same_place_code_no_integrity_error(self, cache_engine):
        """Two saves for the same place_code must not raise IntegrityError — second wins."""
        import threading

        from app.scrapers.gmaps_cache import GlobalGmapsCacheStore

        store = GlobalGmapsCacheStore(cache_engine, ttl_days=90)
        errors = []

        def _save(response: dict, score: float) -> None:
            try:
                store.save("gplc_race", response, quality_score=score)
            except Exception as exc:
                errors.append(exc)

        t1 = threading.Thread(target=_save, args=({"name": "First"}, 0.6))
        t2 = threading.Thread(target=_save, args=({"name": "Second"}, 0.8))
        t1.start()
        t2.start()
        t1.join()
        t2.join()

        assert errors == [], f"Unexpected errors: {errors}"
        # One of the two saves won — the entry must still be readable
        entry = store.get("gplc_race")
        assert entry is not None
        assert entry.raw_response["name"] in ("First", "Second")
