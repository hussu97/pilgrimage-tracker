"""Shared geographic utility helpers for scraper orchestrators.

Provides get_boundary_boxes() which both the API (quadtree) and browser
(grid) scrapers use to support multi-box country borders.
"""

from __future__ import annotations

from sqlmodel import Session, select

from app.db.models import GeoBoundary, GeoBoundaryBox
from app.logger import get_logger

logger = get_logger(__name__)


class _FallbackBox:
    """Lightweight single-box fallback when no GeoBoundaryBox rows exist."""

    __slots__ = ("lat_min", "lat_max", "lng_min", "lng_max", "label")

    def __init__(
        self,
        lat_min: float,
        lat_max: float,
        lng_min: float,
        lng_max: float,
        label: str | None = "full_boundary",
    ) -> None:
        self.lat_min = lat_min
        self.lat_max = lat_max
        self.lng_min = lng_min
        self.lng_max = lng_max
        self.label = label


def get_boundary_boxes(
    boundary: GeoBoundary, session: Session
) -> list[GeoBoundaryBox | _FallbackBox]:
    """Return the list of sub-boxes for *boundary*.

    If GeoBoundaryBox rows exist for this boundary they are returned directly.
    Otherwise a single synthetic box is constructed from the boundary's own
    lat/lng extents so callers never have to special-case the no-boxes path.

    Args:
        boundary: The GeoBoundary to look up.
        session:  An open SQLModel session (does not own or close it).

    Returns:
        One or more objects with .lat_min, .lat_max, .lng_min, .lng_max.
    """
    if boundary.id is None:
        logger.warning(
            "get_boundary_boxes: boundary %r has no id — using single-box fallback",
            boundary.name,
        )
        return [
            _FallbackBox(boundary.lat_min, boundary.lat_max, boundary.lng_min, boundary.lng_max)
        ]

    boxes = session.exec(
        select(GeoBoundaryBox).where(GeoBoundaryBox.boundary_id == boundary.id)
    ).all()

    if boxes:
        logger.info("get_boundary_boxes: %d boxes for %r", len(boxes), boundary.name)
        return list(boxes)

    # No boxes seeded yet — fall back to boundary's own bounding box
    logger.debug("get_boundary_boxes: no boxes for %r — using single-box fallback", boundary.name)
    return [_FallbackBox(boundary.lat_min, boundary.lat_max, boundary.lng_min, boundary.lng_max)]
