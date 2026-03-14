"""Tests for the fixed-size grid cell generator.

Covers:
- generate_grid_cells: correct cell count, full coverage, longitude correction
- generate_multi_box_grid_cells: multi-box output, overlap deduplication
"""

from __future__ import annotations

import pytest

from app.scrapers.grid import generate_grid_cells, generate_multi_box_grid_cells

# ── generate_grid_cells ────────────────────────────────────────────────────────


def test_generate_grid_cells_returns_list():
    cells = generate_grid_cells(24.0, 24.3, 55.0, 55.3, cell_size_km=3.0)
    assert isinstance(cells, list)
    assert len(cells) > 0


def test_generate_grid_cells_covers_bbox():
    """All cells combined must tile the full bounding box without gaps."""
    lat_min, lat_max, lng_min, lng_max = 24.0, 25.0, 55.0, 56.0
    cells = generate_grid_cells(lat_min, lat_max, lng_min, lng_max, cell_size_km=3.0)

    # The southernmost cell must start at lat_min
    assert min(c[0] for c in cells) == pytest.approx(lat_min, abs=1e-9)
    # The northernmost cell must end at lat_max
    assert max(c[1] for c in cells) == pytest.approx(lat_max, abs=1e-9)
    # The westernmost cell must start at lng_min
    assert min(c[2] for c in cells) == pytest.approx(lng_min, abs=1e-9)
    # The easternmost cell must end at lng_max
    assert max(c[3] for c in cells) == pytest.approx(lng_max, abs=1e-9)


def test_generate_grid_cells_cell_format():
    """Each cell must be a 4-tuple (lat_min, lat_max, lng_min, lng_max)."""
    cells = generate_grid_cells(24.0, 24.5, 55.0, 55.5, cell_size_km=3.0)
    for cell in cells:
        assert len(cell) == 4
        lat_min, lat_max, lng_min, lng_max = cell
        assert lat_min < lat_max
        assert lng_min < lng_max


def test_generate_grid_cells_lng_step_corrected_for_latitude():
    """Cells near the equator should have a larger lng step than near the poles."""
    # Equatorial belt
    cells_equator = generate_grid_cells(0.0, 1.0, 0.0, 10.0, cell_size_km=3.0)
    # Near-polar area (60°N)
    cells_polar = generate_grid_cells(60.0, 61.0, 0.0, 10.0, cell_size_km=3.0)

    # At 60°N cos(60°) = 0.5, so lng_step is doubled vs equator → fewer cells per row
    n_cols_equator = len({c[2] for c in cells_equator})  # unique lng_min values
    n_cols_polar = len({c[2] for c in cells_polar})
    # More columns needed at the equator (smaller lng step)
    assert n_cols_equator > n_cols_polar


def test_generate_grid_cells_single_cell_bbox():
    """A bbox smaller than one cell step should still produce exactly one cell."""
    # 1 km × 1 km bbox with 3 km cell size
    lat_step = 3.0 / 111.0
    lng_step = 3.0 / 111.0  # rough equatorial value
    cells = generate_grid_cells(
        24.0,
        24.0 + lat_step * 0.5,
        55.0,
        55.0 + lng_step * 0.5,
        cell_size_km=3.0,
    )
    assert len(cells) == 1


def test_generate_grid_cells_no_overlap():
    """Adjacent cells must share an edge but not overlap in area."""
    cells = generate_grid_cells(24.0, 25.0, 55.0, 56.0, cell_size_km=3.0)
    # Sort by (lat_min, lng_min) and check that no two cells overlap in area
    for i, c1 in enumerate(cells):
        for c2 in cells[i + 1 :]:
            # Allow sharing a boundary (edge-touching is fine) but not interior overlap
            lat_interior = c1[1] > c2[0] + 1e-9 and c2[1] > c1[0] + 1e-9
            lng_interior = c1[3] > c2[2] + 1e-9 and c2[3] > c1[2] + 1e-9
            assert not (lat_interior and lng_interior), f"Cells overlap: {c1} vs {c2}"


# ── generate_multi_box_grid_cells ─────────────────────────────────────────────


class _Box:
    """Minimal box stub matching the GeoBoundaryBox / _FallbackBox interface."""

    def __init__(self, lat_min, lat_max, lng_min, lng_max):
        self.lat_min = lat_min
        self.lat_max = lat_max
        self.lng_min = lng_min
        self.lng_max = lng_max


def test_multi_box_single_box_same_as_direct():
    """One box should produce the same cells as calling generate_grid_cells directly."""
    boxes = [_Box(24.0, 25.0, 55.0, 56.0)]
    multi = generate_multi_box_grid_cells(boxes, cell_size_km=3.0)
    direct = generate_grid_cells(24.0, 25.0, 55.0, 56.0, cell_size_km=3.0)
    assert sorted(multi) == sorted(direct)


def test_multi_box_two_disjoint_boxes():
    """Two non-overlapping boxes should give the union of their individual grids."""
    box1 = _Box(24.0, 25.0, 55.0, 56.0)
    box2 = _Box(26.0, 27.0, 57.0, 58.0)
    multi = generate_multi_box_grid_cells([box1, box2], cell_size_km=3.0)
    cells1 = generate_grid_cells(24.0, 25.0, 55.0, 56.0, cell_size_km=3.0)
    cells2 = generate_grid_cells(26.0, 27.0, 57.0, 58.0, cell_size_km=3.0)
    assert len(multi) == len(cells1) + len(cells2)


def test_multi_box_deduplicates_identical_boxes():
    """Two identical boxes should not duplicate cells."""
    boxes = [_Box(24.0, 25.0, 55.0, 56.0), _Box(24.0, 25.0, 55.0, 56.0)]
    multi = generate_multi_box_grid_cells(boxes, cell_size_km=3.0)
    direct = generate_grid_cells(24.0, 25.0, 55.0, 56.0, cell_size_km=3.0)
    assert len(multi) == len(direct)


def test_multi_box_empty_list():
    """Empty box list should return empty cells list."""
    assert generate_multi_box_grid_cells([], cell_size_km=3.0) == []


def test_multi_box_returns_unique_cells():
    """All returned cells should be unique (no duplicates)."""
    boxes = [_Box(24.0, 25.0, 55.0, 56.0), _Box(24.5, 25.5, 55.5, 56.5)]
    multi = generate_multi_box_grid_cells(boxes, cell_size_km=3.0)
    assert len(multi) == len(set(multi))
