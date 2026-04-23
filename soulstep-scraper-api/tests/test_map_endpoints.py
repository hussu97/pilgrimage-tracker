"""
Tests for GET /map/cells and GET /map/places endpoints.

Cases covered:
- Empty DB returns []
- Saturated cells are excluded from /map/cells
- run_code filter works for cells
- Places with lat=0, lng=0 in raw_data are excluded
- run_code filter works for places
- Response field shapes match MapCellItem / MapPlaceItem schemas
"""

import pytest
from sqlmodel import Session

from app.db.models import DiscoveryCell, ScrapedPlace, ScraperRun

# ── Helpers ───────────────────────────────────────────────────────────────────


def _make_run(session: Session, run_code: str = "run_aaa") -> ScraperRun:
    run = ScraperRun(
        run_code=run_code,
        location_code="loc_test",
        status="completed",
    )
    session.add(run)
    session.commit()
    return run


def _make_cell(
    session: Session,
    run_code: str = "run_aaa",
    saturated: bool = False,
    result_count: int = 5,
    depth: int = 1,
) -> DiscoveryCell:
    lat_min = 10.0 + (depth - 1) * 0.1
    lat_max = 11.0 + (depth - 1) * 0.1
    lng_min = 20.0 + (depth - 1) * 0.1
    lng_max = 21.0 + (depth - 1) * 0.1
    cell = DiscoveryCell(
        run_code=run_code,
        lat_min=lat_min,
        lat_max=lat_max,
        lng_min=lng_min,
        lng_max=lng_max,
        depth=depth,
        radius_m=5000,
        result_count=result_count,
        saturated=saturated,
        resource_names=[],
    )
    session.add(cell)
    session.commit()
    return cell


def _make_place(
    session: Session,
    run_code: str = "run_aaa",
    lat: float = 24.0,
    lng: float = 46.0,
) -> ScrapedPlace:
    place = ScrapedPlace(
        run_code=run_code,
        place_code=f"plc_{run_code}_{lat}_{lng}",
        name="Test Mosque",
        raw_data={"lat": str(lat), "lng": str(lng)},
        lat=lat if lat != 0.0 or lng != 0.0 else None,
        lng=lng if lat != 0.0 or lng != 0.0 else None,
        enrichment_status="complete",
        quality_score=0.8,
        quality_gate=None,
    )
    session.add(place)
    session.commit()
    return place


# ── /map/cells tests ──────────────────────────────────────────────────────────


def test_map_cells_empty(client):
    res = client.get("/api/v1/scraper/map/cells")
    assert res.status_code == 200
    assert res.json() == []


def test_map_cells_excludes_saturated(client, db_session):
    _make_run(db_session)
    _make_cell(db_session, saturated=False)  # leaf — should appear
    _make_cell(db_session, saturated=True, depth=2)  # saturated — excluded

    res = client.get("/api/v1/scraper/map/cells")
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 1
    assert data[0]["depth"] == 1


def test_map_cells_filter_by_run_code(client, db_session):
    _make_run(db_session, "run_aaa")
    _make_run(db_session, "run_bbb")
    _make_cell(db_session, run_code="run_aaa", saturated=False)
    _make_cell(db_session, run_code="run_bbb", saturated=False, depth=2)

    res = client.get("/api/v1/scraper/map/cells?run_code=run_aaa")
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 1
    assert data[0]["run_code"] == "run_aaa"


def test_map_cells_response_shape(client, db_session):
    _make_run(db_session)
    _make_cell(db_session, result_count=7, depth=3)

    res = client.get("/api/v1/scraper/map/cells")
    assert res.status_code == 200
    item = res.json()[0]
    assert set(item.keys()) == {
        "lat_min",
        "lat_max",
        "lng_min",
        "lng_max",
        "depth",
        "result_count",
        "run_code",
    }
    assert item["result_count"] == 7
    assert item["depth"] == 3
    assert item["run_code"] == "run_aaa"


# ── /map/places tests ─────────────────────────────────────────────────────────


def test_map_places_empty(client):
    res = client.get("/api/v1/scraper/map/places")
    assert res.status_code == 200
    assert res.json() == []


def test_map_places_excludes_zero_coords(client, db_session):
    _make_run(db_session)
    # Place with valid coords
    _make_place(db_session, lat=24.0, lng=46.0)
    # Place with no lat/lng — should be excluded
    zero_place = ScrapedPlace(
        run_code="run_aaa",
        place_code="plc_zero",
        name="Zero Coords",
        raw_data={"lat": 0, "lng": 0},
        lat=None,
        lng=None,
        enrichment_status="pending",
    )
    db_session.add(zero_place)
    db_session.commit()

    res = client.get("/api/v1/scraper/map/places")
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 1
    assert data[0]["name"] == "Test Mosque"


def test_map_places_filter_by_run_code(client, db_session):
    _make_run(db_session, "run_aaa")
    _make_run(db_session, "run_bbb")
    _make_place(db_session, run_code="run_aaa", lat=24.0, lng=46.0)
    _make_place(db_session, run_code="run_bbb", lat=25.0, lng=47.0)

    res = client.get("/api/v1/scraper/map/places?run_code=run_bbb")
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 1
    assert data[0]["run_code"] == "run_bbb"


def test_map_places_response_shape(client, db_session):
    _make_run(db_session)
    _make_place(db_session, lat=24.7, lng=46.7)

    res = client.get("/api/v1/scraper/map/places")
    assert res.status_code == 200
    item = res.json()[0]
    assert set(item.keys()) == {
        "place_code",
        "name",
        "lat",
        "lng",
        "enrichment_status",
        "quality_gate",
        "quality_score",
        "run_code",
    }
    assert abs(item["lat"] - 24.7) < 0.01
    assert abs(item["lng"] - 46.7) < 0.01
    assert item["enrichment_status"] == "complete"
    assert item["quality_score"] == pytest.approx(0.8)
