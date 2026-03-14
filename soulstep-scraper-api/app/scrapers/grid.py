"""Fixed-size grid cell generator for browser-based discovery.

Divides a bounding box into a regular grid of cells sized `cell_size_km × cell_size_km`.
The longitude step is corrected for the latitude of the centre of each row so cells
remain approximately square regardless of latitude.

Typical usage:
    from app.scrapers.grid import generate_grid_cells, generate_multi_box_grid_cells

    cells = generate_grid_cells(24.0, 26.0, 54.0, 56.0, cell_size_km=3.0)
    # → list of (lat_min, lat_max, lng_min, lng_max) tuples
"""

from __future__ import annotations

import math

# Key type for deduplication: (lat_min, lat_max, lng_min, lng_max) rounded to 6 dp.
_GridKey = tuple[float, float, float, float]

_ROUND = 6  # decimal places (≈ 0.1 m precision at equator)


def _grid_key(lat_min: float, lat_max: float, lng_min: float, lng_max: float) -> _GridKey:
    return (
        round(lat_min, _ROUND),
        round(lat_max, _ROUND),
        round(lng_min, _ROUND),
        round(lng_max, _ROUND),
    )


def generate_grid_cells(
    lat_min: float,
    lat_max: float,
    lng_min: float,
    lng_max: float,
    cell_size_km: float = 3.0,
) -> list[tuple[float, float, float, float]]:
    """Divide a bounding box into fixed-size grid cells.

    Returns a list of (lat_min, lat_max, lng_min, lng_max) tuples, one per cell.
    The longitude step is computed at the row's centre latitude so cells remain
    roughly square even at high latitudes.

    Args:
        lat_min: Southern edge of the bounding box (degrees).
        lat_max: Northern edge of the bounding box (degrees).
        lng_min: Western edge of the bounding box (degrees).
        lng_max: Eastern edge of the bounding box (degrees).
        cell_size_km: Desired cell side length in kilometres.

    Returns:
        Non-overlapping grid cells covering the entire bounding box.
    """
    # 1 degree of latitude ≈ 111 km (constant)
    lat_step = cell_size_km / 111.0

    cells: list[tuple[float, float, float, float]] = []
    lat = lat_min
    while lat < lat_max:
        cell_lat_max = min(lat + lat_step, lat_max)
        centre_lat = (lat + cell_lat_max) / 2.0

        # 1 degree of longitude ≈ 111 * cos(lat) km
        cos_lat = math.cos(math.radians(centre_lat))
        if cos_lat < 1e-6:
            # At the poles a step would be infinite — use lat_step as fallback
            lng_step = lat_step
        else:
            lng_step = cell_size_km / (111.0 * cos_lat)

        lng = lng_min
        while lng < lng_max:
            cell_lng_max = min(lng + lng_step, lng_max)
            cells.append((lat, cell_lat_max, lng, cell_lng_max))
            lng = cell_lng_max

        lat = cell_lat_max

    return cells


def generate_multi_box_grid_cells(
    boxes: list,
    cell_size_km: float = 3.0,
) -> list[tuple[float, float, float, float]]:
    """Generate grid cells across multiple bounding boxes, deduplicating overlaps.

    Args:
        boxes: Objects with .lat_min, .lat_max, .lng_min, .lng_max attributes.
        cell_size_km: Desired cell side length in kilometres.

    Returns:
        Deduplicated list of grid cells covering all boxes.
    """
    seen: set[_GridKey] = set()
    result: list[tuple[float, float, float, float]] = []

    for box in boxes:
        for cell in generate_grid_cells(
            box.lat_min, box.lat_max, box.lng_min, box.lng_max, cell_size_km
        ):
            key = _grid_key(*cell)
            if key not in seen:
                seen.add(key)
                result.append(cell)

    return result
