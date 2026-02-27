"""
Tests for discovery cell persistence and resumable discovery.

Covers:
- ThreadSafeIdSet.to_list()
- DiscoveryCellStore pre-loading existing cells from DB on init
- DiscoveryCellStore.save() persists and is idempotent
- DiscoveryCellStore.pre_seed_id_set() seeds the dedup set correctly
- search_area() cache hit (non-saturated): no API call, returns cached names
- search_area() cache hit (saturated): no API call, recurses into quadrants
- discover_places() resume: pre-seeded cells skip API calls
"""

import secrets
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from app.db.models import DiscoveryCell
from app.scrapers.base import ThreadSafeIdSet
from app.scrapers.cell_store import DiscoveryCellStore, _cell_key

# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest.fixture()
def mem_engine():
    """Fresh in-memory SQLite engine for each test."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    import app.db.models  # noqa: F401

    SQLModel.metadata.create_all(engine)
    yield engine
    SQLModel.metadata.drop_all(engine)


def _run_code() -> str:
    return f"run_{secrets.token_hex(4)}"


def _seed_cell(
    engine,
    run_code: str,
    lat_min=1.0,
    lat_max=2.0,
    lng_min=3.0,
    lng_max=4.0,
    depth=1,
    radius_m=500.0,
    resource_names=None,
    saturated=False,
) -> DiscoveryCell:
    """Insert a DiscoveryCell row directly into the test DB."""
    if resource_names is None:
        resource_names = []
    cell = DiscoveryCell(
        run_code=run_code,
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
    with Session(engine) as session:
        session.add(cell)
        session.commit()
        session.refresh(cell)
    return cell


# ── ThreadSafeIdSet.to_list() ─────────────────────────────────────────────────


def test_to_list_empty():
    id_set = ThreadSafeIdSet()
    assert id_set.to_list() == []


def test_to_list_after_add():
    id_set = ThreadSafeIdSet()
    id_set.add_new(["places/A", "places/B", "places/C"])
    result = id_set.to_list()
    assert sorted(result) == ["places/A", "places/B", "places/C"]


def test_to_list_deduplicates():
    id_set = ThreadSafeIdSet()
    id_set.add_new(["places/A", "places/B"])
    id_set.add_new(["places/B", "places/C"])  # places/B already seen
    result = id_set.to_list()
    assert sorted(result) == ["places/A", "places/B", "places/C"]


# ── DiscoveryCellStore init: pre-loading ──────────────────────────────────────


def test_cell_store_init_empty(mem_engine):
    """Store init with no existing cells should have empty cache."""
    rc = _run_code()
    store = DiscoveryCellStore(rc, mem_engine)
    assert store.get(1.0, 2.0, 3.0, 4.0) is None


def test_cell_store_init_preloads_existing(mem_engine):
    """Store init should pre-load cells from DB for the same run_code."""
    rc = _run_code()
    _seed_cell(mem_engine, rc, resource_names=["places/X"])

    store = DiscoveryCellStore(rc, mem_engine)
    cached = store.get(1.0, 2.0, 3.0, 4.0)
    assert cached is not None
    assert cached.resource_names == ["places/X"]


def test_cell_store_init_ignores_other_runs(mem_engine):
    """Store init must only load cells for its own run_code."""
    rc1 = _run_code()
    rc2 = _run_code()
    _seed_cell(mem_engine, rc1, resource_names=["places/A"])

    store = DiscoveryCellStore(rc2, mem_engine)
    assert store.get(1.0, 2.0, 3.0, 4.0) is None


# ── DiscoveryCellStore.save() ─────────────────────────────────────────────────


def test_cell_store_save_persists_to_db(mem_engine):
    """save() should write the cell to the database."""
    rc = _run_code()
    store = DiscoveryCellStore(rc, mem_engine)
    store.save(
        1.0, 2.0, 3.0, 4.0, depth=1, radius_m=800.0, resource_names=["places/A"], saturated=False
    )

    with Session(mem_engine) as session:
        cell = session.exec(select(DiscoveryCell).where(DiscoveryCell.run_code == rc)).first()

    assert cell is not None
    assert cell.resource_names == ["places/A"]
    assert cell.saturated is False
    assert cell.result_count == 1


def test_cell_store_save_idempotent(mem_engine):
    """save() for the same bounding box twice should write to DB only once."""
    rc = _run_code()
    store = DiscoveryCellStore(rc, mem_engine)
    store.save(
        1.0, 2.0, 3.0, 4.0, depth=1, radius_m=800.0, resource_names=["places/A"], saturated=False
    )
    store.save(
        1.0, 2.0, 3.0, 4.0, depth=1, radius_m=800.0, resource_names=["places/B"], saturated=True
    )  # duplicate key

    with Session(mem_engine) as session:
        cells = session.exec(select(DiscoveryCell).where(DiscoveryCell.run_code == rc)).all()

    # Only the first write should be persisted
    assert len(cells) == 1
    assert cells[0].resource_names == ["places/A"]


def test_cell_store_get_after_save(mem_engine):
    """get() should return the cell immediately after save()."""
    rc = _run_code()
    store = DiscoveryCellStore(rc, mem_engine)
    store.save(
        5.0, 6.0, 7.0, 8.0, depth=2, radius_m=300.0, resource_names=["places/Z"], saturated=True
    )

    cached = store.get(5.0, 6.0, 7.0, 8.0)
    assert cached is not None
    assert cached.saturated is True
    assert "places/Z" in cached.resource_names


# ── DiscoveryCellStore.pre_seed_id_set() ──────────────────────────────────────


def test_pre_seed_id_set_empty_store(mem_engine):
    """pre_seed_id_set with no stored cells should leave id_set empty."""
    rc = _run_code()
    store = DiscoveryCellStore(rc, mem_engine)
    id_set = ThreadSafeIdSet()
    store.pre_seed_id_set(id_set)
    assert id_set.to_list() == []


def test_pre_seed_id_set_seeds_all_names(mem_engine):
    """pre_seed_id_set should add all resource names from all stored cells."""
    rc = _run_code()
    _seed_cell(
        mem_engine,
        rc,
        lat_min=1.0,
        lat_max=2.0,
        lng_min=3.0,
        lng_max=4.0,
        resource_names=["places/A", "places/B"],
    )
    _seed_cell(
        mem_engine,
        rc,
        lat_min=2.0,
        lat_max=3.0,
        lng_min=3.0,
        lng_max=4.0,
        resource_names=["places/C"],
    )

    store = DiscoveryCellStore(rc, mem_engine)
    id_set = ThreadSafeIdSet()
    store.pre_seed_id_set(id_set)

    assert sorted(id_set.to_list()) == ["places/A", "places/B", "places/C"]


def test_pre_seed_id_set_deduplicates(mem_engine):
    """pre_seed_id_set should not duplicate names that appear in multiple cells."""
    rc = _run_code()
    _seed_cell(
        mem_engine,
        rc,
        lat_min=1.0,
        lat_max=2.0,
        lng_min=3.0,
        lng_max=4.0,
        resource_names=["places/A"],
    )
    _seed_cell(
        mem_engine,
        rc,
        lat_min=2.0,
        lat_max=3.0,
        lng_min=3.0,
        lng_max=4.0,
        resource_names=["places/A", "places/B"],
    )

    store = DiscoveryCellStore(rc, mem_engine)
    id_set = ThreadSafeIdSet()
    store.pre_seed_id_set(id_set)

    names = id_set.to_list()
    assert sorted(names) == ["places/A", "places/B"]


# ── search_area() with cell_store cache hits ──────────────────────────────────


def _make_place_types():
    return ["mosque"]


async def test_search_area_cache_hit_non_saturated():
    """Cache hit for a non-saturated cell: no API call, returns cached names."""
    from app.scrapers.gmaps import search_area

    mock_store = MagicMock(spec=DiscoveryCellStore)
    cached_cell = MagicMock()
    cached_cell.resource_names = ["places/A", "places/B"]
    cached_cell.saturated = False
    cached_cell.result_count = 2
    mock_store.get.return_value = cached_cell

    existing_ids = ThreadSafeIdSet()

    with patch("app.scrapers.gmaps.get_places_in_circle", new=AsyncMock()) as mock_api:
        result = await search_area(
            lat_min=24.0,
            lat_max=25.0,
            lng_min=55.0,
            lng_max=56.0,
            place_types=_make_place_types(),
            api_key="test_key",
            existing_ids=existing_ids,
            depth=1,
            cell_store=mock_store,
        )

    mock_api.assert_not_called()
    assert sorted(result) == ["places/A", "places/B"]


async def test_search_area_cache_miss_calls_api_and_saves():
    """Cache miss: API is called and result is saved to cell store.

    Uses a 0.1x0.1 degree box (~7.5 km radius) which is well under MAX_RADIUS
    (50 km) so the cell-store cache check is reached for the root cell.
    """
    from app.scrapers.gmaps import search_area

    mock_store = MagicMock(spec=DiscoveryCellStore)
    mock_store.get.return_value = None  # cache miss

    existing_ids = ThreadSafeIdSet()

    with (
        patch(
            "app.scrapers.gmaps.get_places_in_circle",
            new=AsyncMock(return_value=(["places/X", "places/Y"], False)),
        ) as mock_api,
        patch("app.scrapers.gmaps.get_async_rate_limiter") as mock_rl,
    ):
        mock_rl.return_value.acquire = AsyncMock()

        result = await search_area(
            lat_min=24.0,
            lat_max=24.1,
            lng_min=55.0,
            lng_max=55.1,
            place_types=_make_place_types(),
            api_key="test_key",
            existing_ids=existing_ids,
            depth=1,
            cell_store=mock_store,
        )

    mock_api.assert_called_once()
    mock_store.save.assert_called_once()
    save_kwargs = mock_store.save.call_args
    assert save_kwargs[0][4] == 1  # depth
    assert save_kwargs[0][6] == ["places/X", "places/Y"]  # resource_names
    assert save_kwargs[0][7] is False  # saturated
    assert sorted(result) == ["places/X", "places/Y"]


async def test_search_area_cache_hit_saturated_recurses():
    """Cache hit for a saturated cell: no API call but recurses into quadrants.

    Uses a 0.1x0.1 degree root cell (~7.5 km) so the cell-store cache check
    is reached. Root returns a saturated cached cell → code recurses into 4
    quadrants (each ~3.75 km, also < MAX_RADIUS). Quadrants are cache misses
    so the API is called 4 times for them.
    """
    from app.scrapers.gmaps import search_area

    ROOT_KEY = _cell_key(24.0, 24.1, 55.0, 55.1)

    def fake_get(lat_min, lat_max, lng_min, lng_max):
        key = _cell_key(lat_min, lat_max, lng_min, lng_max)
        if key == ROOT_KEY:
            cached = MagicMock()
            cached.resource_names = ["places/ROOT"]
            cached.saturated = True
            return cached
        return None  # sub-cells are cache misses

    mock_store = MagicMock(spec=DiscoveryCellStore)
    mock_store.get.side_effect = fake_get

    existing_ids = ThreadSafeIdSet()

    with (
        patch(
            "app.scrapers.gmaps.get_places_in_circle",
            new=AsyncMock(return_value=([], False)),
        ) as mock_api,
        patch("app.scrapers.gmaps.get_async_rate_limiter") as mock_rl,
    ):
        mock_rl.return_value.acquire = AsyncMock()

        await search_area(
            lat_min=24.0,
            lat_max=24.1,
            lng_min=55.0,
            lng_max=55.1,
            place_types=_make_place_types(),
            api_key="test_key",
            existing_ids=existing_ids,
            depth=1,
            cell_store=mock_store,
        )

    # Root cell was a cache hit (no API call for it), but 4 sub-cells were fetched
    assert mock_api.call_count == 4
    # Root cell's resource names should be in the dedup set
    assert "places/ROOT" in existing_ids


# ── _cell_key helper ──────────────────────────────────────────────────────────


def test_cell_key_rounds_floats():
    """_cell_key should round coordinates to avoid float-drift mismatches."""
    k1 = _cell_key(1.000000001, 2.0, 3.0, 4.0)
    k2 = _cell_key(1.0, 2.0, 3.0, 4.0)
    # 9th decimal place is beyond 8-decimal rounding
    assert k1 == k2


def test_cell_key_distinguishes_different_boxes():
    k1 = _cell_key(1.0, 2.0, 3.0, 4.0)
    k2 = _cell_key(1.0, 2.0, 3.0, 5.0)
    assert k1 != k2


# ── all_resource_names property ───────────────────────────────────────────────


def test_all_resource_names_unique(mem_engine):
    """all_resource_names should deduplicate across cells."""
    rc = _run_code()
    _seed_cell(
        mem_engine,
        rc,
        lat_min=1.0,
        lat_max=2.0,
        lng_min=3.0,
        lng_max=4.0,
        resource_names=["places/A", "places/B"],
    )
    _seed_cell(
        mem_engine,
        rc,
        lat_min=2.0,
        lat_max=3.0,
        lng_min=3.0,
        lng_max=4.0,
        resource_names=["places/B", "places/C"],
    )

    store = DiscoveryCellStore(rc, mem_engine)
    names = store.all_resource_names
    assert sorted(names) == ["places/A", "places/B", "places/C"]
