"""Thread-safe cache and DB persistence for discovery cells.

DiscoveryCellStore — per-run cache that lets interrupted runs resume by
skipping already-searched bounding boxes.  Now scoped to a single place_type
so each browser type pass gets its own independent cell records.

GlobalCellStore — cross-run cache keyed by (bbox, place_type) with a
configurable TTL (default 30 days).  After month 1, recurring runs of the
same city skip 95%+ of discovery API calls.
"""

import threading
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlmodel import Session, select

from app.db.models import DiscoveryCell, GlobalDiscoveryCell
from app.logger import get_logger
from app.scrapers.base import ThreadSafeIdSet

logger = get_logger(__name__)

# Key type: (lat_min, lat_max, lng_min, lng_max) rounded to avoid float drift
_CellKey = tuple[float, float, float, float]


def _cell_key(lat_min: float, lat_max: float, lng_min: float, lng_max: float) -> _CellKey:
    """Round coords to 8 decimal places (~1mm precision) to avoid float drift."""
    return (round(lat_min, 8), round(lat_max, 8), round(lng_min, 8), round(lng_max, 8))


@dataclass(frozen=True, slots=True)
class _CachedCell:
    result_count: int
    saturated: bool


@dataclass(frozen=True, slots=True)
class _CachedGlobalCell:
    result_count: int
    saturated: bool
    resource_names: list[str]
    searched_at: datetime


class DiscoveryCellStore:
    """Thread-safe in-memory cache backed by DB persistence for discovery cells.

    Scoped to a single place_type (empty string = combined/API mode) and
    discovery_method ("quadtree" for API, "grid" for browser grid).

    Usage:
      store = DiscoveryCellStore(run_code, engine, place_type="mosque")
      store.pre_seed_id_set(existing_ids)  # seed dedup set from stored cells

      # Inside search_area():
      cached = store.get(lat_min, lat_max, lng_min, lng_max)
      if cached is not None:
          ...  # skip API call
      else:
          ...  # call API, then:
          store.save(lat_min, lat_max, lng_min, lng_max, depth, radius_m,
                     resource_names, saturated)
    """

    def __init__(
        self, run_code: str, engine, place_type: str = "", discovery_method: str = "quadtree"
    ) -> None:
        self._run_code = run_code
        self._engine = engine
        self._place_type = place_type
        self._discovery_method = discovery_method
        self._lock = threading.Lock()
        self._cells: dict[_CellKey, _CachedCell] = {}

        loaded = 0
        with Session(engine) as session:
            existing = session.exec(
                select(
                    DiscoveryCell.lat_min,
                    DiscoveryCell.lat_max,
                    DiscoveryCell.lng_min,
                    DiscoveryCell.lng_max,
                    DiscoveryCell.result_count,
                    DiscoveryCell.saturated,
                )
                .where(DiscoveryCell.run_code == run_code)
                .where(DiscoveryCell.place_type == place_type)
                .where(DiscoveryCell.discovery_method == discovery_method)
            )
            for lat_min, lat_max, lng_min, lng_max, result_count, saturated in existing:
                key = _cell_key(lat_min, lat_max, lng_min, lng_max)
                self._cells[key] = _CachedCell(result_count=result_count, saturated=saturated)
                loaded += 1

        if loaded:
            logger.info(
                "DiscoveryCellStore: pre-loaded %d cells for run %s type=%r method=%r",
                loaded,
                run_code,
                place_type,
                discovery_method,
            )

    def get(
        self, lat_min: float, lat_max: float, lng_min: float, lng_max: float
    ) -> _CachedCell | None:
        """Return the cached cell for this bounding box, or None if not cached."""
        key = _cell_key(lat_min, lat_max, lng_min, lng_max)
        with self._lock:
            return self._cells.get(key)

    def save(
        self,
        lat_min: float,
        lat_max: float,
        lng_min: float,
        lng_max: float,
        depth: int,
        radius_m: float,
        resource_names: list[str],
        saturated: bool,
    ) -> _CachedCell:
        """Persist a searched cell to DB and cache it in memory.

        Thread-safe: uses self._lock to serialize DB writes (prevents SQLite
        "database is locked" errors from concurrent workers).
        Idempotent: if the cell already exists in the cache, returns it as-is.
        """
        key = _cell_key(lat_min, lat_max, lng_min, lng_max)

        with self._lock:
            if key in self._cells:
                return self._cells[key]

            cell = DiscoveryCell(
                run_code=self._run_code,
                lat_min=lat_min,
                lat_max=lat_max,
                lng_min=lng_min,
                lng_max=lng_max,
                depth=depth,
                radius_m=radius_m,
                result_count=len(resource_names),
                saturated=saturated,
                resource_names=list(resource_names),
                place_type=self._place_type,
                discovery_method=self._discovery_method,
            )

            with Session(self._engine) as session:
                session.add(cell)
                session.commit()
                session.refresh(cell)

            cached = _CachedCell(result_count=len(resource_names), saturated=saturated)
            self._cells[key] = cached
            logger.debug(
                "Saved cell (lat: %.4f-%.4f, lng: %.4f-%.4f, depth: %d, results: %d, sat: %s, type: %r)",
                lat_min,
                lat_max,
                lng_min,
                lng_max,
                depth,
                len(resource_names),
                saturated,
                self._place_type,
            )
            return cached

    def pre_seed_id_set(self, id_set: ThreadSafeIdSet) -> None:
        """Seed a ThreadSafeIdSet with all resource names from stored cells.

        Call once at the start of discover_places() so that the dedup set
        already contains IDs from previous (interrupted) runs.
        """
        added = 0
        batch: list[str] = []
        with Session(self._engine) as session:
            rows = session.exec(
                select(DiscoveryCell.resource_names)
                .where(DiscoveryCell.run_code == self._run_code)
                .where(DiscoveryCell.place_type == self._place_type)
                .where(DiscoveryCell.discovery_method == self._discovery_method)
            )
            for resource_names in rows:
                if resource_names:
                    batch.extend(resource_names)
                if len(batch) >= 1000:
                    added += len(id_set.add_new(batch))
                    batch.clear()

        if batch:
            added += len(id_set.add_new(batch))

        if added:
            logger.info("DiscoveryCellStore: pre-seeded %d resource names into dedup set", added)

    @property
    def all_resource_names(self) -> list[str]:
        """All unique resource names across all stored cells."""
        seen: set[str] = set()
        result: list[str] = []
        with Session(self._engine) as session:
            rows = session.exec(
                select(DiscoveryCell.resource_names)
                .where(DiscoveryCell.run_code == self._run_code)
                .where(DiscoveryCell.place_type == self._place_type)
                .where(DiscoveryCell.discovery_method == self._discovery_method)
            )
            for resource_names in rows:
                for name in resource_names or []:
                    if name not in seen:
                        seen.add(name)
                        result.append(name)
        return result


class GlobalCellStore:
    """Cross-run discovery cache with TTL.

    Keyed by (lat_min, lat_max, lng_min, lng_max, place_type).
    Results fresher than `ttl_days` are returned without an API call.
    After each real API call, results are written to both the run-specific
    DiscoveryCellStore and this global cache.

    Thread-safe: a single lock serialises all reads and writes to the
    in-memory dict; DB writes use a fresh Session per call.
    """

    DEFAULT_TTL_DAYS: int = 30

    def __init__(self, engine, ttl_days: int = DEFAULT_TTL_DAYS) -> None:
        self._engine = engine
        self._ttl = timedelta(days=ttl_days)
        self._lock = threading.Lock()
        self._cells: dict[tuple, _CachedGlobalCell] = {}
        self._misses: set[tuple] = set()

    @staticmethod
    def _make_key(
        lat_min: float,
        lat_max: float,
        lng_min: float,
        lng_max: float,
        place_type: str,
        discovery_method: str = "quadtree",
    ) -> tuple:
        return (
            round(lat_min, 8),
            round(lat_max, 8),
            round(lng_min, 8),
            round(lng_max, 8),
            place_type,
            discovery_method,
        )

    def get(
        self,
        lat_min: float,
        lat_max: float,
        lng_min: float,
        lng_max: float,
        place_type: str,
        discovery_method: str = "quadtree",
    ) -> _CachedGlobalCell | None:
        """Return a non-expired global cache entry, or None."""
        key = self._make_key(lat_min, lat_max, lng_min, lng_max, place_type, discovery_method)
        cutoff = datetime.now(UTC) - self._ttl
        with self._lock:
            cell = self._cells.get(key)
            if cell is not None:
                cell_time = cell.searched_at
                if cell_time.tzinfo is None:
                    cell_time = cell_time.replace(tzinfo=UTC)
                if cell_time < cutoff:
                    del self._cells[key]
                    self._misses.add(key)
                    return None
                return cell

            if key in self._misses:
                return None

            with Session(self._engine) as session:
                db_cell = session.exec(
                    select(GlobalDiscoveryCell)
                    .where(GlobalDiscoveryCell.lat_min == lat_min)
                    .where(GlobalDiscoveryCell.lat_max == lat_max)
                    .where(GlobalDiscoveryCell.lng_min == lng_min)
                    .where(GlobalDiscoveryCell.lng_max == lng_max)
                    .where(GlobalDiscoveryCell.place_type == place_type)
                    .where(GlobalDiscoveryCell.discovery_method == discovery_method)
                    .where(GlobalDiscoveryCell.searched_at >= cutoff)
                ).first()

            if db_cell is None:
                self._misses.add(key)
                return None

            cached = _CachedGlobalCell(
                result_count=db_cell.result_count,
                saturated=db_cell.saturated,
                resource_names=list(db_cell.resource_names),
                searched_at=db_cell.searched_at,
            )
            self._cells[key] = cached
            return cached

    def save(
        self,
        lat_min: float,
        lat_max: float,
        lng_min: float,
        lng_max: float,
        place_type: str,
        resource_names: list[str],
        saturated: bool,
        discovery_method: str = "quadtree",
    ) -> _CachedGlobalCell:
        """Persist a global cache entry (upsert: replace if same key exists)."""
        key = self._make_key(lat_min, lat_max, lng_min, lng_max, place_type, discovery_method)

        with self._lock:
            cell = GlobalDiscoveryCell(
                lat_min=lat_min,
                lat_max=lat_max,
                lng_min=lng_min,
                lng_max=lng_max,
                place_type=place_type,
                discovery_method=discovery_method,
                result_count=len(resource_names),
                saturated=saturated,
                resource_names=list(resource_names),
                searched_at=datetime.now(UTC),
            )

            with Session(self._engine) as session:
                # Delete stale entry with same key if it exists
                old = session.exec(
                    select(GlobalDiscoveryCell).where(
                        GlobalDiscoveryCell.lat_min == lat_min,
                        GlobalDiscoveryCell.lat_max == lat_max,
                        GlobalDiscoveryCell.lng_min == lng_min,
                        GlobalDiscoveryCell.lng_max == lng_max,
                        GlobalDiscoveryCell.place_type == place_type,
                        GlobalDiscoveryCell.discovery_method == discovery_method,
                    )
                ).first()
                if old:
                    session.delete(old)
                    session.flush()

                session.add(cell)
                session.commit()
                session.refresh(cell)

            cached = _CachedGlobalCell(
                result_count=len(resource_names),
                saturated=saturated,
                resource_names=list(resource_names),
                searched_at=cell.searched_at,
            )
            self._cells[key] = cached
            self._misses.discard(key)
            return cached
