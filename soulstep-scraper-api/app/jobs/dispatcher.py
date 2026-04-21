"""Pluggable job dispatcher for scraper runs.

SCRAPER_DISPATCH=local       (default) — runs the scraper in-process via FastAPI
                               BackgroundTasks; no GCP required; works locally.
                               The scraper runs in a dedicated OS thread with its
                               own asyncio event loop so it never blocks the
                               FastAPI/uvicorn event loop that handles HTTP requests.
SCRAPER_DISPATCH=cloud_run   (production) — dispatches a Cloud Run Job execution
                               via the google-cloud-run SDK; requires
                               CLOUD_RUN_JOB_NAME, CLOUD_RUN_REGION, and
                               GOOGLE_CLOUD_PROJECT to be set.

Dispatch is now handled by the queue processor (queue_processor.py) which
calls dispatch_cloud_run() and _run_local()/_resume_local() directly.
The old dispatch_run/dispatch_resume functions are kept for backwards
compatibility but are no longer called from the HTTP endpoints.
"""

from __future__ import annotations

import asyncio
import logging

from fastapi import BackgroundTasks

logger = logging.getLogger(__name__)


def _run_local(run_code: str) -> None:
    """Sync wrapper: runs the async scraper task in its own event loop.

    FastAPI's BackgroundTasks dispatches *sync* callables via anyio's thread
    pool, giving this function its own OS thread.  asyncio.run() then creates
    a brand-new event loop inside that thread, completely isolated from the
    uvicorn event loop that serves HTTP requests.

    This prevents the long-running browser automation (Playwright page loads,
    5–12 s inter-cell delays, scroll loops) from saturating the API event loop
    and causing request timeouts.
    """
    from app.db.scraper import run_scraper_task

    asyncio.run(run_scraper_task(run_code))


def _resume_local(run_code: str) -> None:
    """Sync wrapper for resume — same isolation rationale as _run_local."""
    from app.db.scraper import resume_scraper_task

    asyncio.run(resume_scraper_task(run_code))


def dispatch_run(run_code: str, background_tasks: BackgroundTasks) -> None:
    """Dispatch a new scraper run via the configured backend.

    Legacy function — kept for backwards compatibility. New code should use
    the queue processor which calls dispatch_cloud_run() directly.
    """
    from app.config import settings

    logger.info(
        "dispatcher: dispatching run",
        extra={"run_code": run_code, "dispatch_mode": settings.scraper_dispatch},
    )
    if settings.scraper_dispatch == "cloud_run":
        background_tasks.add_task(dispatch_cloud_run, run_code, "run")
    else:
        background_tasks.add_task(_run_local, run_code)


def dispatch_resume(run_code: str, background_tasks: BackgroundTasks) -> None:
    """Dispatch a resume for an interrupted/failed/cancelled run.

    Legacy function — kept for backwards compatibility. New code should use
    the queue processor which calls dispatch_cloud_run() directly.
    """
    from app.config import settings

    logger.info(
        "dispatcher: dispatching resume",
        extra={"run_code": run_code, "dispatch_mode": settings.scraper_dispatch},
    )
    if settings.scraper_dispatch == "cloud_run":
        background_tasks.add_task(dispatch_cloud_run, run_code, "resume")
    else:
        background_tasks.add_task(_resume_local, run_code)


def dispatch_cloud_run(run_code: str, action: str = "run", region: str | None = None) -> None:
    """Call the Cloud Run Jobs API to execute the scraper job container.

    The job container must be configured to run ``python -m app.jobs.run``
    as its command. The run_code and action are passed via env var overrides.

    If ``region`` is provided, the job is dispatched to that region.
    Otherwise, falls back to the first configured region.

    Requires:
        pip install google-cloud-run
        CLOUD_RUN_JOB_NAME, CLOUD_RUN_REGION, GOOGLE_CLOUD_PROJECT env vars
    """
    from app.config import settings

    target_region = region or settings.available_regions[0]

    try:
        from google.cloud import run_v2
    except ImportError as exc:
        logger.error(
            "dispatcher: google-cloud-run SDK not installed — cannot dispatch Cloud Run Job",
            extra={"run_code": run_code, "action": action},
        )
        raise ImportError(
            "google-cloud-run is not installed.\n"
            "Install: pip install google-cloud-run\n"
            "Only needed when SCRAPER_DISPATCH=cloud_run."
        ) from exc

    job_name = (
        f"projects/{settings.google_cloud_project}"
        f"/locations/{target_region}"
        f"/jobs/{settings.cloud_run_job_name}"
    )

    logger.info(
        "dispatcher: calling Cloud Run Jobs API",
        extra={
            "run_code": run_code,
            "action": action,
            "job_name": job_name,
            "cloud_run_job": settings.cloud_run_job_name,
            "cloud_run_region": target_region,
            "google_cloud_project": settings.google_cloud_project,
        },
    )

    try:
        client = run_v2.JobsClient()
        # Forward all job-relevant env vars from the API service's settings so
        # that config (grid size, concurrency, secrets, etc.) is consistent
        # between the dispatcher and the Cloud Run Job container.
        forwarded_env = [run_v2.EnvVar(name=k, value=v) for k, v in settings.job_env_vars().items()]
        # Always append run-specific overrides last so they take precedence.
        forwarded_env += [
            run_v2.EnvVar(name="SCRAPER_RUN_CODE", value=run_code),
            run_v2.EnvVar(name="SCRAPER_RUN_ACTION", value=action),
        ]

        request = run_v2.RunJobRequest(
            name=job_name,
            overrides=run_v2.RunJobRequest.Overrides(
                container_overrides=[
                    run_v2.RunJobRequest.Overrides.ContainerOverride(
                        env=forwarded_env,
                    )
                ],
                task_count=1,
            ),
        )

        operation = client.run_job(request=request)

        # Extract the execution resource name from the LRO metadata so the
        # cancel endpoint can terminate this specific execution later.
        execution_name: str | None = None
        try:
            meta = operation.metadata
            if meta and getattr(meta, "name", None):
                execution_name = meta.name
        except Exception:
            pass

        if execution_name:
            from sqlmodel import Session
            from sqlmodel import select as _select

            from app.db.models import ScraperRun
            from app.db.session import engine

            with Session(engine) as db_session:
                run = db_session.exec(
                    _select(ScraperRun).where(ScraperRun.run_code == run_code)
                ).first()
                if run:
                    run.cloud_run_execution = execution_name
                    db_session.add(run)
                    db_session.commit()

        logger.info(
            "dispatcher: Cloud Run Job execution triggered",
            extra={
                "run_code": run_code,
                "action": action,
                "job_name": job_name,
                "operation_name": operation.operation.name,
                "execution_name": execution_name,
            },
        )
    except Exception as exc:
        logger.error(
            "dispatcher: failed to trigger Cloud Run Job — run will remain in pending state",
            extra={
                "run_code": run_code,
                "action": action,
                "job_name": job_name,
                "error.type": type(exc).__name__,
                "error.message": str(exc),
            },
            exc_info=True,
        )
        raise


def is_cloud_run_execution_active(execution_name: str) -> bool:
    """Return True if the Cloud Run execution is still running (not yet finished).

    Uses the Executions API to fetch the execution and checks whether it has a
    completion_time. Returns False when the SDK is unavailable or the execution
    no longer exists. Other lookup failures stay fail-closed and are treated as
    active so we do not accidentally double-dispatch on a transient GCP error.
    """
    try:
        from google.cloud import run_v2
    except ImportError:
        return False

    try:
        from google.api_core.exceptions import NotFound
    except ImportError:
        NotFound = None

    try:
        client = run_v2.ExecutionsClient()
        execution = client.get_execution(name=execution_name)
        # run_v2 SDK returns completion_time as a Python datetime (or None when
        # the execution is still running).  A non-None value means finished
        # (succeeded, failed, or cancelled).
        return execution.completion_time is None
    except Exception as exc:
        if NotFound is not None and isinstance(exc, NotFound):
            logger.info(
                "dispatcher: Cloud Run execution no longer exists — treating as inactive",
                extra={"execution_name": execution_name},
            )
            return False
        logger.warning(
            "dispatcher: could not check Cloud Run execution status — assuming still active",
            extra={
                "execution_name": execution_name,
                "error.type": type(exc).__name__,
                "error.message": str(exc),
            },
        )
        return True


def cancel_cloud_run_execution(execution_name: str) -> None:
    """Terminate an active Cloud Run Job execution via the Executions API.

    Called by the cancel endpoint when SCRAPER_DISPATCH=cloud_run and the run
    has a stored execution name.  Best-effort: errors are logged but not raised
    so the DB status change (cancelled) is always committed first.
    """
    try:
        from google.cloud import run_v2
    except ImportError:
        logger.warning(
            "dispatcher: google-cloud-run SDK not installed — "
            "Cloud Run execution will not be terminated",
            extra={"execution_name": execution_name},
        )
        return

    try:
        client = run_v2.ExecutionsClient()
        client.cancel_execution(name=execution_name)
        logger.info(
            "dispatcher: Cloud Run execution cancelled",
            extra={"execution_name": execution_name},
        )
    except Exception as exc:
        logger.error(
            "dispatcher: failed to cancel Cloud Run execution",
            extra={
                "execution_name": execution_name,
                "error.type": type(exc).__name__,
                "error.message": str(exc),
            },
            exc_info=True,
        )
