"""Tests for the GeoBoundaryBox model and get_boundary_boxes helper.

Covers:
- get_boundary_boxes returns seeded boxes when present
- get_boundary_boxes falls back to single box from boundary when no boxes seeded
- get_boundary_boxes fallback box matches boundary coordinates
- seed_geo_boundary_boxes deletes existing rows and re-inserts (delete-then-reinsert)
- seed_geo_boundaries deletes and re-inserts all boundaries fresh
- POST /runs fan-out: cloud_run dispatch with country location creates N runs (one per geo box)
- POST /runs no-fan-out: local dispatch or non-country location creates 1 run
"""

from __future__ import annotations

from unittest.mock import patch

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from app.db.models import DataLocation, GeoBoundary, GeoBoundaryBox
from app.scrapers.geo_utils import get_boundary_boxes
from app.seeds.geo import seed_geo_boundaries, seed_geo_boundary_boxes

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


def _add_boundary(session: Session, name: str = "TestCountry") -> GeoBoundary:
    b = GeoBoundary(
        name=name,
        boundary_type="country",
        lat_min=20.0,
        lat_max=30.0,
        lng_min=60.0,
        lng_max=80.0,
    )
    session.add(b)
    session.commit()
    session.refresh(b)
    return b


# ── get_boundary_boxes ────────────────────────────────────────────────────────


def test_get_boundary_boxes_returns_seeded_boxes(mem_engine):
    """Should return GeoBoundaryBox rows when they exist for the boundary."""
    with Session(mem_engine) as session:
        boundary = _add_boundary(session)
        for lat_min, lat_max, lng_min, lng_max in [
            (20.0, 25.0, 60.0, 70.0),
            (25.0, 30.0, 70.0, 80.0),
        ]:
            session.add(
                GeoBoundaryBox(
                    boundary_id=boundary.id,
                    lat_min=lat_min,
                    lat_max=lat_max,
                    lng_min=lng_min,
                    lng_max=lng_max,
                )
            )
        session.commit()

        boxes = get_boundary_boxes(boundary, session)

    assert len(boxes) == 2
    assert all(isinstance(b, GeoBoundaryBox) for b in boxes)


def test_get_boundary_boxes_fallback_when_no_boxes(mem_engine):
    """Should return a single synthetic box matching boundary coords when no boxes exist."""
    with Session(mem_engine) as session:
        boundary = _add_boundary(session)
        boxes = get_boundary_boxes(boundary, session)

    assert len(boxes) == 1
    box = boxes[0]
    assert box.lat_min == 20.0
    assert box.lat_max == 30.0
    assert box.lng_min == 60.0
    assert box.lng_max == 80.0


def test_get_boundary_boxes_fallback_has_coords(mem_engine):
    """Fallback box must expose .lat_min/.lat_max/.lng_min/.lng_max."""
    with Session(mem_engine) as session:
        boundary = _add_boundary(session, "SmallCity")
        boundary.lat_min = 25.1
        boundary.lat_max = 25.5
        boundary.lng_min = 55.2
        boundary.lng_max = 55.6
        session.add(boundary)
        session.commit()
        session.refresh(boundary)

        boxes = get_boundary_boxes(boundary, session)

    assert len(boxes) == 1
    b = boxes[0]
    assert b.lat_min == pytest.approx(25.1)
    assert b.lat_max == pytest.approx(25.5)
    assert b.lng_min == pytest.approx(55.2)
    assert b.lng_max == pytest.approx(55.6)


def test_get_boundary_boxes_fallback_for_no_id(mem_engine):
    """Boundary with no id (not persisted) should return single fallback box."""
    boundary = GeoBoundary(
        name="Unpersisted",
        boundary_type="country",
        lat_min=10.0,
        lat_max=15.0,
        lng_min=40.0,
        lng_max=50.0,
        id=None,
    )
    with Session(mem_engine) as session:
        boxes = get_boundary_boxes(boundary, session)

    assert len(boxes) == 1
    assert boxes[0].lat_min == 10.0


# ── seed_geo_boundary_boxes ───────────────────────────────────────────────────


def test_seed_geo_boundary_boxes_delete_then_reinsert(mem_engine):
    """seed_geo_boundary_boxes clears existing rows and re-inserts — second call gives same count."""
    with Session(mem_engine) as session:
        session.add(
            GeoBoundary(
                name="UAE",
                boundary_type="country",
                lat_min=22.5,
                lat_max=26.0,
                lng_min=51.5,
                lng_max=56.5,
            )
        )
        session.commit()

        seed_geo_boundary_boxes(session)
        first_count = len(session.exec(select(GeoBoundaryBox)).all())

        # Insert a stale row manually — it should be cleared on the second seed call
        boundary = session.exec(select(GeoBoundary).where(GeoBoundary.name == "UAE")).first()
        session.add(
            GeoBoundaryBox(
                boundary_id=boundary.id,
                lat_min=0.0,
                lat_max=1.0,
                lng_min=0.0,
                lng_max=1.0,
                label="stale_box",
            )
        )
        session.commit()
        stale_count = len(session.exec(select(GeoBoundaryBox)).all())
        assert stale_count == first_count + 1  # stale row added

        seed_geo_boundary_boxes(session)
        second_count = len(session.exec(select(GeoBoundaryBox)).all())

    # After re-seed, stale row must be gone — count equals the first seed
    assert first_count > 0
    assert second_count == first_count


def test_seed_geo_boundary_boxes_skips_missing_boundary(mem_engine):
    """seed_geo_boundary_boxes must not crash when a boundary is absent from DB."""
    # Empty DB — no GeoBoundary rows at all
    with Session(mem_engine) as session:
        seed_geo_boundary_boxes(session)  # should not raise
        count = len(session.exec(select(GeoBoundaryBox)).all())

    assert count == 0


def test_seed_geo_boundary_boxes_correct_box_count(mem_engine):
    """UAE must get exactly as many boxes as defined in COUNTRY_BOXES."""
    from app.seeds.geo import COUNTRY_BOXES

    with Session(mem_engine) as session:
        session.add(
            GeoBoundary(
                name="UAE",
                boundary_type="country",
                lat_min=22.5,
                lat_max=26.0,
                lng_min=51.5,
                lng_max=56.5,
            )
        )
        session.commit()
        seed_geo_boundary_boxes(session)
        count = len(session.exec(select(GeoBoundaryBox)).all())

    assert count == len(COUNTRY_BOXES["UAE"])


def test_seed_geo_boundaries_delete_then_reinsert(mem_engine):
    """seed_geo_boundaries clears existing boundaries (and boxes) then re-inserts fresh."""
    from app.seeds.geo import GEO_BOUNDARIES

    with Session(mem_engine) as session:
        # First seed
        seed_geo_boundaries(session)
        first_count = len(session.exec(select(GeoBoundary)).all())

        # Add a stale boundary row manually
        session.add(
            GeoBoundary(
                name="__stale__",
                boundary_type="country",
                lat_min=0.0,
                lat_max=1.0,
                lng_min=0.0,
                lng_max=1.0,
            )
        )
        session.commit()
        assert len(session.exec(select(GeoBoundary)).all()) == first_count + 1

        # Second seed — should clear stale row
        seed_geo_boundaries(session)
        second_count = len(session.exec(select(GeoBoundary)).all())

    assert first_count == len(GEO_BOUNDARIES)
    assert second_count == len(GEO_BOUNDARIES)


# ── POST /runs fan-out ────────────────────────────────────────────────────────


def test_create_run_fanout_cloud_run(mem_engine):
    """POST /runs with cloud_run dispatch + country location creates N runs (one per geo box)."""
    from fastapi.testclient import TestClient

    from app.db.session import get_db_session
    from app.main import app

    def override_db():
        with Session(mem_engine) as session:
            yield session

    saved_overrides = dict(app.dependency_overrides)
    app.dependency_overrides[get_db_session] = override_db

    try:
        with (
            patch("app.main.run_migrations"),
            patch("app.main.seed_geo_boundaries"),
            patch("app.main.seed_place_type_mappings"),
            patch("app.main._mark_interrupted_runs"),
            patch("app.api.v1.scraper.dispatch_run"),
            patch("app.config.settings") as mock_settings,
        ):
            mock_settings.scraper_dispatch = "cloud_run"
            with Session(mem_engine) as session:
                # Create a UAE boundary and 3 test boxes
                boundary = GeoBoundary(
                    name="UAE",
                    boundary_type="country",
                    lat_min=22.5,
                    lat_max=26.0,
                    lng_min=51.5,
                    lng_max=56.5,
                )
                session.add(boundary)
                session.commit()
                session.refresh(boundary)
                for i, label in enumerate(["box_a", "box_b", "box_c"]):
                    session.add(
                        GeoBoundaryBox(
                            boundary_id=boundary.id,
                            lat_min=22.5 + i,
                            lat_max=23.5 + i,
                            lng_min=51.5,
                            lng_max=53.0,
                            label=label,
                        )
                    )
                loc = DataLocation(
                    code="loc_uae_test",
                    name="UAE Test",
                    source_type="gmaps",
                    config={"country": "UAE", "max_results": 5},
                )
                session.add(loc)
                session.commit()

            with TestClient(app, raise_server_exceptions=True) as c:
                resp = c.post(
                    "/api/v1/scraper/runs",
                    json={"location_code": "loc_uae_test"},
                )

        assert resp.status_code == 200
        data = resp.json()
        assert "runs" in data
        assert len(data["runs"]) == 3
        labels = {r["geo_box_label"] for r in data["runs"]}
        assert labels == {"box_a", "box_b", "box_c"}
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(saved_overrides)


def test_create_run_no_fanout_local_dispatch(mem_engine):
    """POST /runs with local dispatch + country location creates exactly 1 run."""
    from fastapi.testclient import TestClient

    from app.db.session import get_db_session
    from app.main import app

    def override_db():
        with Session(mem_engine) as session:
            yield session

    saved_overrides = dict(app.dependency_overrides)
    app.dependency_overrides[get_db_session] = override_db

    try:
        with (
            patch("app.main.run_migrations"),
            patch("app.main.seed_geo_boundaries"),
            patch("app.main.seed_place_type_mappings"),
            patch("app.main._mark_interrupted_runs"),
            patch("app.api.v1.scraper.dispatch_run"),
            patch("app.config.settings") as mock_settings,
        ):
            mock_settings.scraper_dispatch = "local"
            with Session(mem_engine) as session:
                boundary = GeoBoundary(
                    name="India",
                    boundary_type="country",
                    lat_min=8.0,
                    lat_max=35.5,
                    lng_min=68.0,
                    lng_max=97.5,
                )
                session.add(boundary)
                loc = DataLocation(
                    code="loc_india_test",
                    name="India Test",
                    source_type="gmaps",
                    config={"country": "India", "max_results": 5},
                )
                session.add(loc)
                session.commit()

            with TestClient(app, raise_server_exceptions=True) as c:
                resp = c.post(
                    "/api/v1/scraper/runs",
                    json={"location_code": "loc_india_test"},
                )

        assert resp.status_code == 200
        data = resp.json()
        assert "runs" in data
        assert len(data["runs"]) == 1
        assert data["runs"][0]["geo_box_label"] is None
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(saved_overrides)
