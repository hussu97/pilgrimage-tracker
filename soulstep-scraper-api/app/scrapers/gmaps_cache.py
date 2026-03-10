"""Persistent cross-run cache for raw Google Maps API responses.

GlobalGmapsCacheStore follows the GlobalCellStore pattern from cell_store.py:
  - Pre-loads non-expired entries on init.
  - Checks cache before making a GMaps detail API call.
  - Saves raw response + quality score after a successful API call.
  - TTL: 90 days (matching STALE_THRESHOLD_DAYS in scrapers/gmaps.py).

Stored in the scraper-api DB to keep all scraping concerns in one service.
"""

from __future__ import annotations

import threading
from datetime import UTC, datetime, timedelta

from sqlmodel import Session, select

from app.db.models import GlobalGmapsCache
from app.logger import get_logger

logger = get_logger(__name__)

_DEFAULT_TTL_DAYS = 90


class GlobalGmapsCacheStore:
    """Thread-safe in-memory cache backed by DB persistence for GMaps responses.

    Usage::

        store = GlobalGmapsCacheStore(engine)

        # Before detail API call:
        cached = store.get(place_code)
        if cached is not None:
            raw_response = cached.raw_response
            quality_score = cached.quality_score
        else:
            raw_response = await fetch_from_gmaps(...)
            quality_score = score_place_quality(build_place_data(raw_response))
            store.save(place_code, raw_response, quality_score)
    """

    def __init__(self, engine, ttl_days: int = _DEFAULT_TTL_DAYS) -> None:
        self._engine = engine
        self._ttl = timedelta(days=ttl_days)
        self._lock = threading.Lock()
        self._cache: dict[str, GlobalGmapsCache] = {}

        # Pre-load non-expired entries
        cutoff = datetime.now(UTC) - self._ttl
        with Session(engine) as session:
            existing = session.exec(
                select(GlobalGmapsCache).where(GlobalGmapsCache.cached_at >= cutoff)
            ).all()

        for entry in existing:
            self._cache[entry.place_code] = entry

        if existing:
            logger.info("GlobalGmapsCacheStore: pre-loaded %d non-expired entries", len(existing))

    def get(self, place_code: str) -> GlobalGmapsCache | None:
        """Return a non-expired cache entry for the place_code, or None."""
        cutoff = datetime.now(UTC) - self._ttl
        with self._lock:
            entry = self._cache.get(place_code)
            if entry is None:
                return None
            # Ensure it hasn't expired since pre-load
            cached_at = entry.cached_at
            if cached_at.tzinfo is None:
                cached_at = cached_at.replace(tzinfo=UTC)
            if cached_at < cutoff:
                del self._cache[place_code]
                return None
            return entry

    def save(
        self,
        place_code: str,
        raw_response: dict,
        quality_score: float | None = None,
    ) -> GlobalGmapsCache:
        """Persist a GMaps response (upsert: replace if same place_code exists)."""
        with self._lock:
            entry = GlobalGmapsCache(
                place_code=place_code,
                raw_response=raw_response,
                quality_score=quality_score,
                cached_at=datetime.now(UTC),
            )

            with Session(self._engine) as session:
                # Delete stale entry with same place_code if present
                old = session.exec(
                    select(GlobalGmapsCache).where(GlobalGmapsCache.place_code == place_code)
                ).first()
                if old:
                    session.delete(old)
                    session.flush()

                session.add(entry)
                session.commit()
                session.refresh(entry)

            self._cache[place_code] = entry
            return entry
