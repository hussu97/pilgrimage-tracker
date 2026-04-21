"""
Tests for scraper run persistence and resumability.

Covers:
- Startup interrupted-run detection (_mark_interrupted_runs)
- Resume endpoint (POST /runs/{run_code}/resume)
- Stage and error_message fields in API responses
- discovered_resource_names JSON persistence
- Cancel endpoint accepting interrupted runs
"""

import secrets
import sys
import types
from unittest.mock import patch

from sqlmodel import Session, select

from app.db.models import DataLocation, ScraperRun
from app.jobs.dispatcher import is_cloud_run_execution_active


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
    session: Session, location_code: str, status: str = "pending", stage: str | None = None
) -> ScraperRun:
    run = ScraperRun(
        run_code=f"run_{secrets.token_hex(4)}",
        location_code=location_code,
        status=status,
        stage=stage,
    )
    session.add(run)
    session.commit()
    session.refresh(run)
    return run


def _install_fake_google_run(
    monkeypatch, *, execution=None, get_execution_exc=None, not_found_cls=None
):
    class _FakeExecutionsClient:
        def get_execution(self, name: str):
            if get_execution_exc is not None:
                raise get_execution_exc
            return execution

    google_mod = types.ModuleType("google")
    cloud_mod = types.ModuleType("google.cloud")
    run_v2_mod = types.ModuleType("google.cloud.run_v2")
    run_v2_mod.ExecutionsClient = _FakeExecutionsClient
    cloud_mod.run_v2 = run_v2_mod
    google_mod.cloud = cloud_mod

    monkeypatch.setitem(sys.modules, "google", google_mod)
    monkeypatch.setitem(sys.modules, "google.cloud", cloud_mod)
    monkeypatch.setitem(sys.modules, "google.cloud.run_v2", run_v2_mod)

    if not_found_cls is not None:
        api_core_mod = types.ModuleType("google.api_core")
        exceptions_mod = types.ModuleType("google.api_core.exceptions")
        exceptions_mod.NotFound = not_found_cls
        api_core_mod.exceptions = exceptions_mod
        monkeypatch.setitem(sys.modules, "google.api_core", api_core_mod)
        monkeypatch.setitem(sys.modules, "google.api_core.exceptions", exceptions_mod)


# ── 1. Startup: _mark_interrupted_runs ────────────────────────────────────────


def test_startup_marks_running_as_interrupted(db_session, test_engine, real_mark_interrupted_runs):
    """Runs with status='running' at startup should be marked 'interrupted'."""
    loc = _make_location(db_session)
    run = _make_run(db_session, loc.code, status="running", stage="detail_fetch")

    # _mark_interrupted_runs uses the global engine — patch it with the test engine
    with patch("app.main.engine", test_engine):
        real_mark_interrupted_runs()

    db_session.refresh(run)
    assert run.status == "interrupted"
    assert run.error_message == "Process terminated unexpectedly"


def test_startup_ignores_completed_runs(db_session, test_engine, real_mark_interrupted_runs):
    """Completed, failed, and cancelled runs must not be touched at startup."""
    loc = _make_location(db_session)
    completed = _make_run(db_session, loc.code, status="completed")
    failed = _make_run(db_session, loc.code, status="failed")
    cancelled = _make_run(db_session, loc.code, status="cancelled")

    with patch("app.main.engine", test_engine):
        real_mark_interrupted_runs()

    db_session.refresh(completed)
    db_session.refresh(failed)
    db_session.refresh(cancelled)
    assert completed.status == "completed"
    assert failed.status == "failed"
    assert cancelled.status == "cancelled"


def test_cloud_run_execution_missing_is_treated_as_inactive(monkeypatch):
    """Missing Cloud Run executions should not block resume."""

    class _FakeNotFound(Exception):
        pass

    _install_fake_google_run(
        monkeypatch,
        get_execution_exc=_FakeNotFound("gone"),
        not_found_cls=_FakeNotFound,
    )

    assert (
        is_cloud_run_execution_active("projects/p/locations/r/jobs/j/executions/missing") is False
    )


def test_cloud_run_status_lookup_errors_remain_fail_closed(monkeypatch):
    """Transient lookup failures should still block resume to avoid duplicates."""

    _install_fake_google_run(
        monkeypatch,
        get_execution_exc=RuntimeError("transport unavailable"),
    )

    assert (
        is_cloud_run_execution_active("projects/p/locations/r/jobs/j/executions/maybe-active")
        is True
    )


def test_startup_leaves_active_cloud_run_execution_alone(
    db_session, test_engine, real_mark_interrupted_runs
):
    """Runs dispatched to Cloud Run that are still active should NOT be interrupted."""
    loc = _make_location(db_session)
    run = ScraperRun(
        run_code=f"run_{secrets.token_hex(4)}",
        location_code=loc.code,
        status="running",
        stage="detail_fetch",
        cloud_run_execution="projects/p/locations/eu-west1/jobs/j/executions/active-exec",
    )
    db_session.add(run)
    db_session.commit()
    db_session.refresh(run)

    with (
        patch("app.main.engine", test_engine),
        patch(
            "app.jobs.dispatcher.is_cloud_run_execution_active", return_value=True
        ) as mock_active,
    ):
        real_mark_interrupted_runs()

    db_session.refresh(run)
    assert run.status == "running"
    assert run.error_message is None
    mock_active.assert_called_once_with(
        "projects/p/locations/eu-west1/jobs/j/executions/active-exec"
    )


def test_startup_interrupts_finished_cloud_run_execution(
    db_session, test_engine, real_mark_interrupted_runs
):
    """Cloud Run runs whose execution is no longer active should be interrupted."""
    loc = _make_location(db_session)
    run = ScraperRun(
        run_code=f"run_{secrets.token_hex(4)}",
        location_code=loc.code,
        status="running",
        stage="enrichment",
        cloud_run_execution="projects/p/locations/eu-west1/jobs/j/executions/done-exec",
    )
    db_session.add(run)
    db_session.commit()
    db_session.refresh(run)

    with (
        patch("app.main.engine", test_engine),
        patch("app.jobs.dispatcher.is_cloud_run_execution_active", return_value=False),
    ):
        real_mark_interrupted_runs()

    db_session.refresh(run)
    assert run.status == "interrupted"
    assert run.error_message == "Cloud Run execution finished or unreachable"


def test_startup_mixed_local_and_cloud_runs(db_session, test_engine, real_mark_interrupted_runs):
    """Local runs should be interrupted while active cloud runs are left alone."""
    loc = _make_location(db_session)
    local_run = _make_run(db_session, loc.code, status="running", stage="discovery")
    cloud_run_active = ScraperRun(
        run_code=f"run_{secrets.token_hex(4)}",
        location_code=loc.code,
        status="running",
        stage="detail_fetch",
        cloud_run_execution="projects/p/locations/r/jobs/j/executions/still-going",
    )
    db_session.add(cloud_run_active)
    db_session.commit()
    db_session.refresh(cloud_run_active)

    with (
        patch("app.main.engine", test_engine),
        patch("app.jobs.dispatcher.is_cloud_run_execution_active", return_value=True),
    ):
        real_mark_interrupted_runs()

    db_session.refresh(local_run)
    db_session.refresh(cloud_run_active)
    assert local_run.status == "interrupted"
    assert local_run.error_message == "Process terminated unexpectedly"
    assert cloud_run_active.status == "running"
    assert cloud_run_active.error_message is None


# ── 2. Resume endpoint ─────────────────────────────────────────────────────────


def test_resume_endpoint_accepts_interrupted(client, db_session):
    """POST /runs/{run_code}/resume should accept interrupted runs."""
    loc = _make_location(db_session)
    run = _make_run(db_session, loc.code, status="interrupted", stage="enrichment")

    with patch("app.api.v1.scraper.trigger_queue_check"):
        resp = client.post(f"/api/v1/scraper/runs/{run.run_code}/resume")

    assert resp.status_code == 200
    data = resp.json()
    assert data["run_code"] == run.run_code
    assert data["resume_from_stage"] == "enrichment"


def test_resume_endpoint_accepts_failed(client, db_session):
    """POST /runs/{run_code}/resume should accept failed runs."""
    loc = _make_location(db_session)
    run = _make_run(db_session, loc.code, status="failed", stage="discovery")

    with patch("app.api.v1.scraper.trigger_queue_check"):
        resp = client.post(f"/api/v1/scraper/runs/{run.run_code}/resume")

    assert resp.status_code == 200
    assert resp.json()["run_code"] == run.run_code


def test_resume_endpoint_rejects_completed(client, db_session):
    """POST /runs/{run_code}/resume should reject completed runs with 400."""
    loc = _make_location(db_session)
    run = _make_run(db_session, loc.code, status="completed")

    resp = client.post(f"/api/v1/scraper/runs/{run.run_code}/resume")

    assert resp.status_code == 400
    assert "completed" in resp.json()["detail"]


def test_resume_endpoint_rejects_pending(client, db_session):
    """POST /runs/{run_code}/resume should reject pending runs with 400."""
    loc = _make_location(db_session)
    run = _make_run(db_session, loc.code, status="pending")

    resp = client.post(f"/api/v1/scraper/runs/{run.run_code}/resume")

    assert resp.status_code == 400
    assert "pending" in resp.json()["detail"]


def test_resume_endpoint_accepts_cancelled(client, db_session):
    """POST /runs/{run_code}/resume should accept cancelled runs."""
    loc = _make_location(db_session)
    run = _make_run(db_session, loc.code, status="cancelled")

    with patch("app.api.v1.scraper.trigger_queue_check"):
        resp = client.post(f"/api/v1/scraper/runs/{run.run_code}/resume")

    assert resp.status_code == 200
    assert resp.json()["run_code"] == run.run_code


def test_resume_endpoint_not_found(client):
    """POST /runs/{run_code}/resume should return 404 for unknown run_code."""
    resp = client.post("/api/v1/scraper/runs/run_nonexistent/resume")
    assert resp.status_code == 404


# ── 3. Schema fields in GET response ──────────────────────────────────────────


def test_stage_and_error_in_response(client, db_session):
    """GET /runs/{run_code} should include stage and error_message fields."""
    loc = _make_location(db_session)
    run = ScraperRun(
        run_code=f"run_{secrets.token_hex(4)}",
        location_code=loc.code,
        status="interrupted",
        stage="detail_fetch",
        error_message="Process terminated unexpectedly",
    )
    db_session.add(run)
    db_session.commit()

    resp = client.get(f"/api/v1/scraper/runs/{run.run_code}")

    assert resp.status_code == 200
    data = resp.json()
    assert data["stage"] == "detail_fetch"
    assert data["error_message"] == "Process terminated unexpectedly"


# ── 4. discovered_resource_names JSON round-trip ───────────────────────────────


def test_discovered_resource_names_persisted(db_session):
    """discovered_resource_names should round-trip through the DB as a JSON list."""
    loc = _make_location(db_session)
    names = ["places/ChIJ001", "places/ChIJ002", "places/ChIJ003"]
    run = ScraperRun(
        run_code=f"run_{secrets.token_hex(4)}",
        location_code=loc.code,
        status="running",
        stage="detail_fetch",
        discovered_resource_names=names,
    )
    db_session.add(run)
    db_session.commit()

    # Re-fetch from DB
    fetched = db_session.exec(select(ScraperRun).where(ScraperRun.run_code == run.run_code)).first()
    assert fetched is not None
    assert fetched.discovered_resource_names == names


# ── 5. Cancel endpoint accepts interrupted status ─────────────────────────────


def test_cancel_accepts_interrupted(client, db_session):
    """POST /runs/{run_code}/cancel should accept interrupted runs."""
    loc = _make_location(db_session)
    run = _make_run(db_session, loc.code, status="interrupted")

    resp = client.post(f"/api/v1/scraper/runs/{run.run_code}/cancel")

    assert resp.status_code == 200
    assert resp.json()["status"] == "cancelled"

    db_session.refresh(run)
    assert run.status == "cancelled"


# ── 6. Cloud Run active-execution guard ──────────────────────────────────────


def test_resume_returns_409_when_cloud_run_execution_still_active(client, db_session):
    """Resume should return 409 if the existing Cloud Run execution is still running."""
    loc = _make_location(db_session)
    run = ScraperRun(
        run_code=f"run_{secrets.token_hex(4)}",
        location_code=loc.code,
        status="interrupted",
        stage="enrichment",
        cloud_run_execution="projects/p/locations/r/jobs/j/executions/active-exec",
    )
    db_session.add(run)
    db_session.commit()

    with (
        patch("app.config.settings") as mock_settings,
        patch(
            "app.jobs.dispatcher.is_cloud_run_execution_active", return_value=True
        ) as mock_active,
    ):
        mock_settings.scraper_dispatch = "cloud_run"
        resp = client.post(f"/api/v1/scraper/runs/{run.run_code}/resume")

    assert resp.status_code == 409
    mock_active.assert_called_once_with("projects/p/locations/r/jobs/j/executions/active-exec")


def test_resume_dispatches_when_cloud_run_execution_finished(client, db_session):
    """Resume should dispatch a new execution when the previous one has finished."""
    loc = _make_location(db_session)
    run = ScraperRun(
        run_code=f"run_{secrets.token_hex(4)}",
        location_code=loc.code,
        status="failed",
        stage="enrichment",
        cloud_run_execution="projects/p/locations/r/jobs/j/executions/old-exec",
    )
    db_session.add(run)
    db_session.commit()

    with (
        patch("app.config.settings") as mock_settings,
        patch("app.jobs.dispatcher.is_cloud_run_execution_active", return_value=False),
        patch("app.api.v1.scraper.trigger_queue_check") as mock_trigger,
    ):
        mock_settings.scraper_dispatch = "cloud_run"
        resp = client.post(f"/api/v1/scraper/runs/{run.run_code}/resume")

    assert resp.status_code == 200
    mock_trigger.assert_called_once()


def test_resume_skips_active_check_when_no_execution_stored(client, db_session):
    """If no cloud_run_execution is stored, skip the check and dispatch directly."""
    loc = _make_location(db_session)
    run = _make_run(db_session, loc.code, status="failed", stage="enrichment")
    # cloud_run_execution is None (not set)

    with (
        patch("app.config.settings") as mock_settings,
        patch("app.jobs.dispatcher.is_cloud_run_execution_active") as mock_active,
        patch("app.api.v1.scraper.trigger_queue_check"),
    ):
        mock_settings.scraper_dispatch = "cloud_run"
        resp = client.post(f"/api/v1/scraper/runs/{run.run_code}/resume")

    assert resp.status_code == 200
    mock_active.assert_not_called()


# ── 7. image_download resume stage ───────────────────────────────────────────


def test_resume_endpoint_accepts_image_download_stage(client, db_session):
    """POST /runs/{run_code}/resume should accept runs with stage='image_download'."""
    loc = _make_location(db_session)
    run = _make_run(db_session, loc.code, status="interrupted", stage="image_download")

    with patch("app.api.v1.scraper.trigger_queue_check"):
        resp = client.post(f"/api/v1/scraper/runs/{run.run_code}/resume")

    assert resp.status_code == 200
    data = resp.json()
    assert data["run_code"] == run.run_code
    assert data["resume_from_stage"] == "image_download"
