"""Thread-safe cache and DB persistence for discovery cells.

DiscoveryCellStore — per-run cache that lets interrupted runs resume by
skipping already-searched bounding boxes.

GlobalCellStore — cross-run cache keyed by (bbox, place_types_hash) with a
configurable TTL (default 30 days).  After month 1, recurring runs of the
same city skip 95%+ of discovery API calls.
"""

import hashlib
import json
import threading
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


def _place_types_hash(place_types: list[str]) -> str:
    """Stable 8-char hash of a sorted place_types list."""
    key = json.dumps(sorted(place_types), separators=(",", ":"))
    return hashlib.sha256(key.encode()).hexdigest()[:8]


class DiscoveryCellStore:
    """Thread-safe in-memory cache backed by DB persistence for discovery cells.

    Usage:
      store = DiscoveryCellStore(run_code, engine)
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

    def __init__(self, run_code: str, engine) -> None:
        self._run_code = run_code
        self._engine = engine
        self._lock = threading.Lock()
        self._cells: dict[_CellKey, DiscoveryCell] = {}

        # Pre-load existing cells from DB
        with Session(engine) as session:
            existing = session.exec(
                select(DiscoveryCell).where(DiscoveryCell.run_code == run_code)
            ).all()

        for cell in existing:
            key = _cell_key(cell.lat_min, cell.lat_max, cell.lng_min, cell.lng_max)
            self._cells[key] = cell

        if existing:
            logger.info(
                "DiscoveryCellStore: pre-loaded %d cells for run %s", len(existing), run_code
            )

    def get(
        self, lat_min: float, lat_max: float, lng_min: float, lng_max: float
    ) -> DiscoveryCell | None:
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
    ) -> DiscoveryCell:
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
            )

            with Session(self._engine) as session:
                session.add(cell)
                session.commit()
                session.refresh(cell)

            self._cells[key] = cell
            logger.debug(
                "Saved cell (lat: %.4f-%.4f, lng: %.4f-%.4f, depth: %d, results: %d, sat: %s)",
                lat_min,
                lat_max,
                lng_min,
                lng_max,
                depth,
                len(resource_names),
                saturated,
            )
            return cell

    def pre_seed_id_set(self, id_set: ThreadSafeIdSet) -> None:
        """Seed a ThreadSafeIdSet with all resource names from stored cells.

        Call once at the start of discover_places() so that the dedup set
        already contains IDs from previous (interrupted) runs.
        """
        with self._lock:
            all_names = [name for cell in self._cells.values() for name in cell.resource_names]

        if all_names:
            id_set.add_new(all_names)
            logger.info(
                "DiscoveryCellStore: pre-seeded %d resource names into dedup set", len(all_names)
            )

    @property
    def all_resource_names(self) -> list[str]:
        """All unique resource names across all stored cells."""
        with self._lock:
            seen: set[str] = set()
            result: list[str] = []
            for cell in self._cells.values():
                for name in cell.resource_names:
                    if name not in seen:
                        seen.add(name)
                        result.append(name)
            return result


class GlobalCellStore:
    """Cross-run discovery cache with TTL.

    Keyed by (lat_min, lat_max, lng_min, lng_max, place_types_hash).
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
        self._cells: dict[tuple, GlobalDiscoveryCell] = {}

        # Pre-load non-expired cells
        cutoff = datetime.now(UTC) - self._ttl
        with Session(engine) as session:
            existing = session.exec(
                select(GlobalDiscoveryCell).where(GlobalDiscoveryCell.searched_at >= cutoff)
            ).all()

        for cell in existing:
            key = self._make_key(
                cell.lat_min, cell.lat_max, cell.lng_min, cell.lng_max, cell.place_types_hash
            )
            self._cells[key] = cell

        if existing:
            logger.info("GlobalCellStore: pre-loaded %d non-expired cells", len(existing))

    @staticmethod
    def _make_key(
        lat_min: float,
        lat_max: float,
        lng_min: float,
        lng_max: float,
        types_hash: str,
    ) -> tuple:
        return (
            round(lat_min, 8),
            round(lat_max, 8),
            round(lng_min, 8),
            round(lng_max, 8),
            types_hash,
        )

    def get(
        self,
        lat_min: float,
        lat_max: float,
        lng_min: float,
        lng_max: float,
        place_types: list[str],
    ) -> GlobalDiscoveryCell | None:
        """Return a non-expired global cache entry, or None."""
        types_hash = _place_types_hash(place_types)
        key = self._make_key(lat_min, lat_max, lng_min, lng_max, types_hash)
        cutoff = datetime.now(UTC) - self._ttl
        with self._lock:
            cell = self._cells.get(key)
            if cell is None:
                return None
            # Ensure it hasn't expired since pre-load
            cell_time = cell.searched_at
            if cell_time.tzinfo is None:
                cell_time = cell_time.replace(tzinfo=UTC)
            if cell_time < cutoff:
                del self._cells[key]
                return None
            return cell

    def save(
        self,
        lat_min: float,
        lat_max: float,
        lng_min: float,
        lng_max: float,
        place_types: list[str],
        resource_names: list[str],
        saturated: bool,
    ) -> GlobalDiscoveryCell:
        """Persist a global cache entry (upsert: replace if same key exists)."""
        types_hash = _place_types_hash(place_types)
        key = self._make_key(lat_min, lat_max, lng_min, lng_max, types_hash)

        with self._lock:
            cell = GlobalDiscoveryCell(
                lat_min=lat_min,
                lat_max=lat_max,
                lng_min=lng_min,
                lng_max=lng_max,
                place_types_hash=types_hash,
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
                        GlobalDiscoveryCell.place_types_hash == types_hash,
                    )
                ).first()
                if old:
                    session.delete(old)
                    session.flush()

                session.add(cell)
                session.commit()
                session.refresh(cell)

            self._cells[key] = cell
            return cell
