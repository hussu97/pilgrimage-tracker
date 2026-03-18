"""Tests for the GeoBoundaryBox model and get_boundary_boxes helper.

Covers:
- get_boundary_boxes returns seeded boxes when present
- get_boundary_boxes falls back to single box from boundary when no boxes seeded
- get_boundary_boxes fallback box matches boundary coordinates
- seed_geo_boundary_boxes is idempotent
"""

from __future__ import annotations

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from app.db.models import GeoBoundary, GeoBoundaryBox
from app.scrapers.geo_utils import get_boundary_boxes
from app.seeds.geo import seed_geo_boundary_boxes

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


def test_seed_geo_boundary_boxes_idempotent(mem_engine):
    """Calling seed_geo_boundary_boxes twice must not duplicate rows."""
    # We need at least one matching GeoBoundary name in the DB.
    # Use "UAE" since it is the smallest entry in COUNTRY_BOXES.
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

        seed_geo_boundary_boxes(session)
        second_count = len(session.exec(select(GeoBoundaryBox)).all())

    assert first_count > 0
    assert first_count == second_count


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
