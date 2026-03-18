"""Tests for the capacity-aware queue processor.

Covers:
- Queue dispatches up to capacity and no more
- Queued runs are dispatched in FIFO order (by created_at)
- When all slots are full, queued runs stay queued
- When a running job completes, next poll dispatches a queued run
- Failed dispatch reverts run back to queued
- Resume detection works (runs with stage set dispatch via resume path)
- Local dispatch mode works (SCRAPER_DISPATCH=local)
"""

import secrets
from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch

from sqlmodel import Session, select

from app.db.models import DataLocation, ScraperRun
from app.jobs.queue_processor import process_queue


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


def _make_run(
    session: Session,
    location_code: str,
    status: str = "queued",
    stage: str | None = None,
    processed_items: int = 0,
    created_at: datetime | None = None,
    cloud_run_execution: str | None = None,
) -> ScraperRun:
    run = ScraperRun(
        run_code=f"run_{secrets.token_hex(4)}",
        location_code=location_code,
        status=status,
        stage=stage,
        processed_items=processed_items,
        cloud_run_execution=cloud_run_execution,
    )
    if created_at:
        run.created_at = created_at
    session.add(run)
    session.commit()
    session.refresh(run)
    return run


def _mock_settings(regions: str = "region-a:2,region-b:2", dispatch: str = "cloud_run"):
    """Create a mock settings object with region_capacity."""
    from app.config import Settings

    s = Settings()
    s.cloud_run_regions = regions
    s.scraper_dispatch = dispatch
    return s


# ── 1. Cloud Run dispatch: capacity enforcement ──────────────────────────────


def test_dispatches_up_to_capacity(db_session, test_engine):
    """Queue processor dispatches up to max capacity and no more."""
    loc = _make_location(db_session)
    # Create 5 queued runs, but capacity is only 4 (2+2)
    now = datetime.now(UTC)
    runs = []
    for i in range(5):
        runs.append(_make_run(db_session, loc.code, created_at=now + timedelta(seconds=i)))

    mock_dispatch = MagicMock()
    settings = _mock_settings("region-a:2,region-b:2")

    with (
        patch("app.jobs.queue_processor.engine", test_engine),
        patch("app.config.settings", settings),
        patch("app.jobs.dispatcher.dispatch_cloud_run", mock_dispatch),
    ):
        dispatched = process_queue()

    assert dispatched == 4
    assert mock_dispatch.call_count == 4

    # 5th run should still be queued
    db_session.expire_all()
    fifth = db_session.exec(
        select(ScraperRun).where(ScraperRun.run_code == runs[4].run_code)
    ).first()
    assert fifth.status == "queued"


def test_fifo_order(db_session, test_engine):
    """Queued runs are dispatched in FIFO order by created_at."""
    loc = _make_location(db_session)
    now = datetime.now(UTC)
    run_old = _make_run(db_session, loc.code, created_at=now - timedelta(minutes=5))
    run_new = _make_run(db_session, loc.code, created_at=now)

    mock_dispatch = MagicMock()
    settings = _mock_settings("region-a:1")

    with (
        patch("app.jobs.queue_processor.engine", test_engine),
        patch("app.config.settings", settings),
        patch("app.jobs.dispatcher.dispatch_cloud_run", mock_dispatch),
    ):
        dispatched = process_queue()

    assert dispatched == 1
    # Older run should have been dispatched
    mock_dispatch.assert_called_once()
    assert mock_dispatch.call_args[0][0] == run_old.run_code

    db_session.expire_all()
    assert (
        db_session.exec(select(ScraperRun).where(ScraperRun.run_code == run_new.run_code))
        .first()
        .status
        == "queued"
    )


def test_no_dispatch_when_all_slots_full(db_session, test_engine):
    """When all slots are occupied, queued runs stay queued."""
    loc = _make_location(db_session)
    # 2 running jobs fill both slots
    _make_run(
        db_session,
        loc.code,
        status="running",
        cloud_run_execution="projects/p/locations/region-a/jobs/j/executions/e1",
    )
    _make_run(
        db_session,
        loc.code,
        status="running",
        cloud_run_execution="projects/p/locations/region-a/jobs/j/executions/e2",
    )
    queued = _make_run(db_session, loc.code, status="queued")

    mock_dispatch = MagicMock()
    settings = _mock_settings("region-a:2")

    with (
        patch("app.jobs.queue_processor.engine", test_engine),
        patch("app.config.settings", settings),
        patch("app.jobs.dispatcher.dispatch_cloud_run", mock_dispatch),
    ):
        dispatched = process_queue()

    assert dispatched == 0
    mock_dispatch.assert_not_called()
    db_session.expire_all()
    assert (
        db_session.exec(select(ScraperRun).where(ScraperRun.run_code == queued.run_code))
        .first()
        .status
        == "queued"
    )


def test_slot_opens_after_completion(db_session, test_engine):
    """When a running job completes, next poll dispatches a queued run."""
    loc = _make_location(db_session)
    # 1 completed job (does NOT count as active)
    _make_run(db_session, loc.code, status="completed")
    # 1 queued
    queued = _make_run(db_session, loc.code, status="queued")

    mock_dispatch = MagicMock()
    settings = _mock_settings("region-a:1")

    with (
        patch("app.jobs.queue_processor.engine", test_engine),
        patch("app.config.settings", settings),
        patch("app.jobs.dispatcher.dispatch_cloud_run", mock_dispatch),
    ):
        dispatched = process_queue()

    assert dispatched == 1
    db_session.expire_all()
    assert (
        db_session.exec(select(ScraperRun).where(ScraperRun.run_code == queued.run_code))
        .first()
        .status
        == "pending"
    )


# ── 2. Failed dispatch reverts to queued ──────────────────────────────────────


def test_failed_dispatch_reverts_to_queued(db_session, test_engine):
    """If dispatch_cloud_run raises, the run is reverted to queued."""
    loc = _make_location(db_session)
    run = _make_run(db_session, loc.code, status="queued")

    mock_dispatch = MagicMock(side_effect=Exception("API error"))
    settings = _mock_settings("region-a:2")

    with (
        patch("app.jobs.queue_processor.engine", test_engine),
        patch("app.config.settings", settings),
        patch("app.jobs.dispatcher.dispatch_cloud_run", mock_dispatch),
    ):
        dispatched = process_queue()

    assert dispatched == 0
    db_session.expire_all()
    reverted = db_session.exec(
        select(ScraperRun).where(ScraperRun.run_code == run.run_code)
    ).first()
    assert reverted.status == "queued"


# ── 3. Resume detection ──────────────────────────────────────────────────────


def test_resume_detected_by_stage(db_session, test_engine):
    """Runs with stage set are dispatched with action='resume'."""
    loc = _make_location(db_session)
    run = _make_run(db_session, loc.code, status="queued", stage="enrichment")

    mock_dispatch = MagicMock()
    settings = _mock_settings("region-a:2")

    with (
        patch("app.jobs.queue_processor.engine", test_engine),
        patch("app.config.settings", settings),
        patch("app.jobs.dispatcher.dispatch_cloud_run", mock_dispatch),
    ):
        process_queue()

    mock_dispatch.assert_called_once_with(run.run_code, "resume", region="region-a")


def test_resume_detected_by_processed_items(db_session, test_engine):
    """Runs with processed_items > 0 are dispatched with action='resume'."""
    loc = _make_location(db_session)
    run = _make_run(db_session, loc.code, status="queued", processed_items=10)

    mock_dispatch = MagicMock()
    settings = _mock_settings("region-a:2")

    with (
        patch("app.jobs.queue_processor.engine", test_engine),
        patch("app.config.settings", settings),
        patch("app.jobs.dispatcher.dispatch_cloud_run", mock_dispatch),
    ):
        process_queue()

    mock_dispatch.assert_called_once_with(run.run_code, "resume", region="region-a")


def test_new_run_dispatched_as_run(db_session, test_engine):
    """Runs without stage or processed_items are dispatched with action='run'."""
    loc = _make_location(db_session)
    run = _make_run(db_session, loc.code, status="queued")

    mock_dispatch = MagicMock()
    settings = _mock_settings("region-a:2")

    with (
        patch("app.jobs.queue_processor.engine", test_engine),
        patch("app.config.settings", settings),
        patch("app.jobs.dispatcher.dispatch_cloud_run", mock_dispatch),
    ):
        process_queue()

    mock_dispatch.assert_called_once_with(run.run_code, "run", region="region-a")


# ── 4. Local dispatch mode ────────────────────────────────────────────────────


def test_local_dispatch_uses_thread(db_session, test_engine):
    """In local mode, process_queue dispatches via threads."""
    loc = _make_location(db_session)
    run = _make_run(db_session, loc.code, status="queued")

    settings = _mock_settings(dispatch="local")
    settings.cloud_run_regions = ""
    settings.cloud_run_region = "us-central1"

    mock_thread_class = MagicMock()
    mock_thread_instance = MagicMock()
    mock_thread_class.return_value = mock_thread_instance

    with (
        patch("app.jobs.queue_processor.engine", test_engine),
        patch("app.config.settings", settings),
        patch("app.jobs.queue_processor.threading.Thread", mock_thread_class),
    ):
        dispatched = process_queue()

    assert dispatched == 1
    mock_thread_class.assert_called_once()
    mock_thread_instance.start.assert_called_once()

    db_session.expire_all()
    assert (
        db_session.exec(select(ScraperRun).where(ScraperRun.run_code == run.run_code))
        .first()
        .status
        == "pending"
    )


def test_local_dispatch_limits_parallel_jobs(db_session, test_engine):
    """Local mode limits to MAX_LOCAL_JOBS parallel runs."""
    loc = _make_location(db_session)
    # 2 running jobs
    _make_run(db_session, loc.code, status="running")
    _make_run(db_session, loc.code, status="running")
    # 1 queued
    queued = _make_run(db_session, loc.code, status="queued")

    settings = _mock_settings(dispatch="local")
    settings.cloud_run_regions = ""
    settings.cloud_run_region = "us-central1"

    with (
        patch("app.jobs.queue_processor.engine", test_engine),
        patch("app.config.settings", settings),
    ):
        dispatched = process_queue()

    assert dispatched == 0
    db_session.expire_all()
    assert (
        db_session.exec(select(ScraperRun).where(ScraperRun.run_code == queued.run_code))
        .first()
        .status
        == "queued"
    )


# ── 5. No queued runs ─────────────────────────────────────────────────────────


def test_no_queued_runs_returns_zero(db_session, test_engine):
    """process_queue returns 0 when there are no queued runs."""
    settings = _mock_settings("region-a:5")

    with (
        patch("app.jobs.queue_processor.engine", test_engine),
        patch("app.config.settings", settings),
    ):
        dispatched = process_queue()

    assert dispatched == 0


# ── 6. Multi-region slot assignment ───────────────────────────────────────────


def test_multi_region_distributes_across_regions(db_session, test_engine):
    """Jobs are distributed across regions based on available capacity."""
    loc = _make_location(db_session)
    # 1 running job in region-a
    _make_run(
        db_session,
        loc.code,
        status="running",
        cloud_run_execution="projects/p/locations/region-a/jobs/j/executions/e1",
    )
    # 3 queued runs
    now = datetime.now(UTC)
    runs = []
    for i in range(3):
        runs.append(_make_run(db_session, loc.code, created_at=now + timedelta(seconds=i)))

    mock_dispatch = MagicMock()
    # region-a: max 2 (1 used, 1 free), region-b: max 2 (0 used, 2 free)
    settings = _mock_settings("region-a:2,region-b:2")

    with (
        patch("app.jobs.queue_processor.engine", test_engine),
        patch("app.config.settings", settings),
        patch("app.jobs.dispatcher.dispatch_cloud_run", mock_dispatch),
    ):
        dispatched = process_queue()

    assert dispatched == 3

    # Verify regions were assigned
    regions_used = [call.kwargs["region"] for call in mock_dispatch.call_args_list]
    assert regions_used.count("region-a") == 1  # only 1 slot free
    assert regions_used.count("region-b") == 2  # 2 slots free
