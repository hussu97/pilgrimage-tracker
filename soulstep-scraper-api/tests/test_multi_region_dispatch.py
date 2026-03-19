"""Tests for multi-region configuration and capacity parsing.

Covers:
- region_capacity parsing from CLOUD_RUN_REGIONS env var
- available_regions property
- total_max_jobs property
- _extract_region() helper
- _count_active_per_region() grouping
"""

import secrets
from unittest.mock import patch

from sqlmodel import Session

from app.db.models import DataLocation, ScraperRun
from app.jobs.queue_processor import (
    _build_round_robin_slots,
    _count_active_per_region,
    _extract_region,
)


def _make_location(session: Session) -> DataLocation:
    loc = DataLocation(
        code=f"loc_{secrets.token_hex(4)}",
        name="Test Location",
        source_type="gmaps",
        config={"city": "Dubai"},
    )
    session.add(loc)
    session.commit()
    session.refresh(loc)
    return loc


# ── 1. _extract_region ───────────────────────────────────────────────────────


def test_extract_region_from_execution_name():
    """_extract_region parses region from Cloud Run execution resource name."""
    name = "projects/my-project/locations/europe-west1/jobs/scraper-job/executions/exec-123"
    assert _extract_region(name) == "europe-west1"


def test_extract_region_returns_none_for_none():
    assert _extract_region(None) is None


def test_extract_region_returns_none_for_empty_string():
    assert _extract_region("") is None


def test_extract_region_returns_none_for_invalid_format():
    assert _extract_region("invalid/format/string") is None


def test_extract_region_handles_different_regions():
    name = "projects/p/locations/us-central1/jobs/j/executions/e"
    assert _extract_region(name) == "us-central1"


# ── 2. region_capacity parsing ────────────────────────────────────────────────


def test_region_capacity_single_region_with_max():
    """CLOUD_RUN_REGIONS='region1:3' returns correct capacity."""
    from app.config import Settings

    s = Settings()
    s.cloud_run_regions = "europe-west1:3"
    assert s.region_capacity == [{"region": "europe-west1", "max_jobs": 3}]


def test_region_capacity_multiple_regions():
    """CLOUD_RUN_REGIONS='r1:3,r2:5' returns multiple entries."""
    from app.config import Settings

    s = Settings()
    s.cloud_run_regions = "europe-west1:3,europe-west4:5,europe-west2:5"
    assert s.region_capacity == [
        {"region": "europe-west1", "max_jobs": 3},
        {"region": "europe-west4", "max_jobs": 5},
        {"region": "europe-west2", "max_jobs": 5},
    ]


def test_region_capacity_without_max_defaults_to_5():
    """Region without :max defaults to max_jobs=5."""
    from app.config import Settings

    s = Settings()
    s.cloud_run_regions = "europe-west1"
    assert s.region_capacity == [{"region": "europe-west1", "max_jobs": 5}]


def test_region_capacity_fallback_to_cloud_run_region():
    """When CLOUD_RUN_REGIONS is empty, falls back to CLOUD_RUN_REGION."""
    from app.config import Settings

    s = Settings()
    s.cloud_run_regions = ""
    s.cloud_run_region = "us-central1"
    assert s.region_capacity == [{"region": "us-central1", "max_jobs": 5}]


def test_region_capacity_handles_whitespace():
    """Whitespace around entries is trimmed."""
    from app.config import Settings

    s = Settings()
    s.cloud_run_regions = " europe-west1 : 3 , europe-west4 : 5 "
    assert s.region_capacity == [
        {"region": "europe-west1", "max_jobs": 3},
        {"region": "europe-west4", "max_jobs": 5},
    ]


# ── 3. available_regions ──────────────────────────────────────────────────────


def test_available_regions_returns_region_names():
    from app.config import Settings

    s = Settings()
    s.cloud_run_regions = "europe-west1:3,europe-west4:5"
    assert s.available_regions == ["europe-west1", "europe-west4"]


def test_available_regions_single_fallback():
    from app.config import Settings

    s = Settings()
    s.cloud_run_regions = ""
    s.cloud_run_region = "us-east1"
    assert s.available_regions == ["us-east1"]


# ── 4. total_max_jobs ─────────────────────────────────────────────────────────


def test_total_max_jobs_sums_correctly():
    from app.config import Settings

    s = Settings()
    s.cloud_run_regions = "europe-west1:3,europe-west4:5,europe-west2:5"
    assert s.total_max_jobs == 13


def test_total_max_jobs_single_region():
    from app.config import Settings

    s = Settings()
    s.cloud_run_regions = ""
    s.cloud_run_region = "us-central1"
    assert s.total_max_jobs == 5


# ── 5. _count_active_per_region ───────────────────────────────────────────────


def test_count_active_groups_by_region(db_session, test_engine):
    """_count_active_per_region groups running jobs by their execution region."""
    loc = _make_location(db_session)

    # Two runs in europe-west1
    for _ in range(2):
        db_session.add(
            ScraperRun(
                run_code=f"run_{secrets.token_hex(4)}",
                location_code=loc.code,
                status="running",
                cloud_run_execution=f"projects/p/locations/europe-west1/jobs/j/executions/{secrets.token_hex(4)}",
            )
        )
    # One run in europe-west4
    db_session.add(
        ScraperRun(
            run_code=f"run_{secrets.token_hex(4)}",
            location_code=loc.code,
            status="running",
            cloud_run_execution=f"projects/p/locations/europe-west4/jobs/j/executions/{secrets.token_hex(4)}",
        )
    )
    db_session.commit()

    mock_settings = type(
        "Settings",
        (),
        {
            "region_capacity": [
                {"region": "europe-west1", "max_jobs": 3},
                {"region": "europe-west4", "max_jobs": 5},
            ],
            "available_regions": ["europe-west1", "europe-west4"],
        },
    )()

    with (
        patch("app.jobs.queue_processor.engine", test_engine),
        patch("app.config.settings", mock_settings),
    ):
        counts = _count_active_per_region(db_session)

    assert counts["europe-west1"] == 2
    assert counts["europe-west4"] == 1


def test_count_active_assigns_no_execution_to_first_region(db_session, test_engine):
    """Runs without cloud_run_execution are counted against the first region."""
    loc = _make_location(db_session)

    db_session.add(
        ScraperRun(
            run_code=f"run_{secrets.token_hex(4)}",
            location_code=loc.code,
            status="pending",
        )
    )
    db_session.commit()

    mock_settings = type(
        "Settings",
        (),
        {
            "region_capacity": [
                {"region": "europe-west1", "max_jobs": 3},
                {"region": "europe-west4", "max_jobs": 5},
            ],
            "available_regions": ["europe-west1", "europe-west4"],
        },
    )()

    with (
        patch("app.jobs.queue_processor.engine", test_engine),
        patch("app.config.settings", mock_settings),
    ):
        counts = _count_active_per_region(db_session)

    assert counts["europe-west1"] == 1
    assert counts["europe-west4"] == 0


# ── 6. _build_round_robin_slots ──────────────────────────────────────────────


def test_round_robin_even_distribution():
    """Jobs are spread evenly across regions, not all dumped in the first."""
    capacity = [
        {"region": "A", "max_jobs": 5},
        {"region": "B", "max_jobs": 5},
        {"region": "C", "max_jobs": 5},
    ]
    slots = _build_round_robin_slots(capacity, active={})
    # First 3 slots should hit all 3 regions (one each)
    assert slots[:3] == ["A", "B", "C"]
    # Next 3 slots should again be A, B, C
    assert slots[3:6] == ["A", "B", "C"]
    # Total slots = 15
    assert len(slots) == 15


def test_round_robin_primary_region_first_each_round():
    """The primary region (first in config) is always first in each round."""
    capacity = [
        {"region": "primary", "max_jobs": 3},
        {"region": "secondary", "max_jobs": 3},
    ]
    slots = _build_round_robin_slots(capacity, active={})
    assert slots == ["primary", "secondary", "primary", "secondary", "primary", "secondary"]


def test_round_robin_unequal_capacity():
    """Region with more capacity gets extra slots in later rounds."""
    capacity = [
        {"region": "A", "max_jobs": 2},
        {"region": "B", "max_jobs": 4},
    ]
    slots = _build_round_robin_slots(capacity, active={})
    # Round 1: A, B; Round 2: A, B; Round 3: B; Round 4: B
    assert slots == ["A", "B", "A", "B", "B", "B"]


def test_round_robin_respects_active_runs():
    """Active runs reduce available slots per region."""
    capacity = [
        {"region": "A", "max_jobs": 3},
        {"region": "B", "max_jobs": 3},
        {"region": "C", "max_jobs": 3},
    ]
    # A already has 2 active, B has 1, C has 0
    active = {"A": 2, "B": 1, "C": 0}
    slots = _build_round_robin_slots(capacity, active)
    # A has 1 slot, B has 2, C has 3 → round-robin: A,B,C then B,C then C
    assert slots == ["A", "B", "C", "B", "C", "C"]


def test_round_robin_all_regions_full():
    """Returns empty list when all regions are at capacity."""
    capacity = [
        {"region": "A", "max_jobs": 2},
        {"region": "B", "max_jobs": 3},
    ]
    active = {"A": 2, "B": 3}
    slots = _build_round_robin_slots(capacity, active)
    assert slots == []


def test_round_robin_single_region():
    """Single region still works — all slots go to it."""
    capacity = [{"region": "only", "max_jobs": 3}]
    slots = _build_round_robin_slots(capacity, active={})
    assert slots == ["only", "only", "only"]


def test_round_robin_three_jobs_across_three_regions():
    """Dispatching 3 jobs with 3 regions gives one per region (not all to first)."""
    capacity = [
        {"region": "A", "max_jobs": 5},
        {"region": "B", "max_jobs": 5},
        {"region": "C", "max_jobs": 5},
    ]
    slots = _build_round_robin_slots(capacity, active={})
    # If we dispatch 3 jobs, they take slots[:3] = A, B, C
    assigned = slots[:3]
    assert assigned.count("A") == 1
    assert assigned.count("B") == 1
    assert assigned.count("C") == 1
