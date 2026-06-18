"""Coordinate validation helpers shared across scraper ingestion paths."""

from __future__ import annotations

import math
from typing import Any


def coerce_float(value: Any) -> float | None:
    """Return a finite float, or None when the value is missing/invalid."""
    if value is None:
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if math.isfinite(parsed) else None


def sanitize_coordinate_pair(lat: Any, lng: Any) -> tuple[float | None, float | None]:
    """Return a usable coordinate pair, treating Google fallback (0, 0) as missing."""
    parsed_lat = coerce_float(lat)
    parsed_lng = coerce_float(lng)
    if parsed_lat is None or parsed_lng is None:
        return None, None
    if not (-90 <= parsed_lat <= 90 and -180 <= parsed_lng <= 180):
        return None, None
    if parsed_lat == 0 and parsed_lng == 0:
        return None, None
    return parsed_lat, parsed_lng


def has_usable_coordinates(lat: Any, lng: Any) -> bool:
    """Return True when both coordinates form a valid, non-placeholder pair."""
    parsed_lat, parsed_lng = sanitize_coordinate_pair(lat, lng)
    return parsed_lat is not None and parsed_lng is not None
