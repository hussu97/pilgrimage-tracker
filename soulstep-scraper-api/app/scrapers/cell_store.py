"""Thread-safe cache and DB persistence for discovery cells.

DiscoveryCellStore pre-loads already-searched bounding boxes from the DB on
init and persists new cells immediately after each Google Places API call.
This lets interrupted discovery runs skip already-searched areas on resume.
"""

import threading

from sqlmodel import Session, select

from app.db.models import DiscoveryCell
from app.logger import get_logger
from app.scrapers.base import ThreadSafeIdSet

logger = get_logger(__name__)

# Key type: (lat_min, lat_max, lng_min, lng_max) rounded to avoid float drift
_CellKey = tuple[float, float, float, float]


def _cell_key(lat_min: float, lat_max: float, lng_min: float, lng_max: float) -> _CellKey:
    """Round coords to 8 decimal places (~1mm precision) to avoid float drift."""
    return (round(lat_min, 8), round(lat_max, 8), round(lng_min, 8), round(lng_max, 8))


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
        "database is locked" errors from concurrent depth-0 workers).
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
