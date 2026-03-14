"""Pluggable job dispatcher for scraper runs.

SCRAPER_DISPATCH=local       (default) — runs the scraper in-process via FastAPI
                               BackgroundTasks; no GCP required; works locally.
SCRAPER_DISPATCH=cloud_run   (production) — dispatches a Cloud Run Job execution
                               via the google-cloud-run SDK; requires
                               CLOUD_RUN_JOB_NAME, CLOUD_RUN_REGION, and
                               GOOGLE_CLOUD_PROJECT to be set.
"""

from __future__ import annotations

import logging

from fastapi import BackgroundTasks

logger = logging.getLogger(__name__)


def dispatch_run(run_code: str, background_tasks: BackgroundTasks) -> None:
    """Dispatch a new scraper run via the configured backend."""
    from app.config import settings

    if settings.scraper_dispatch == "cloud_run":
        background_tasks.add_task(_dispatch_cloud_run, run_code, "run")
    else:
        from app.db.scraper import run_scraper_task

        background_tasks.add_task(run_scraper_task, run_code)


def dispatch_resume(run_code: str, background_tasks: BackgroundTasks) -> None:
    """Dispatch a resume for an interrupted/failed/cancelled run."""
    from app.config import settings

    if settings.scraper_dispatch == "cloud_run":
        background_tasks.add_task(_dispatch_cloud_run, run_code, "resume")
    else:
        from app.db.scraper import resume_scraper_task

        background_tasks.add_task(resume_scraper_task, run_code)


def _dispatch_cloud_run(run_code: str, action: str = "run") -> None:
    """Call the Cloud Run Jobs API to execute the scraper job container.

    The job container must be configured to run ``python -m app.jobs.run``
    as its command. The run_code and action are passed via env var overrides.

    Requires:
        pip install google-cloud-run
        CLOUD_RUN_JOB_NAME, CLOUD_RUN_REGION, GOOGLE_CLOUD_PROJECT env vars
    """
    from app.config import settings

    try:
        from google.cloud import run_v2
    except ImportError as exc:
        raise ImportError(
            "google-cloud-run is not installed.\n"
            "Install: pip install google-cloud-run\n"
            "Only needed when SCRAPER_DISPATCH=cloud_run."
        ) from exc

    job_name = (
        f"projects/{settings.google_cloud_project}"
        f"/locations/{settings.cloud_run_region}"
        f"/jobs/{settings.cloud_run_job_name}"
    )

    client = run_v2.JobsClient()
    request = run_v2.RunJobRequest(
        name=job_name,
        overrides=run_v2.RunJobRequest.Overrides(
            container_overrides=[
                run_v2.RunJobRequest.Overrides.ContainerOverride(
                    env=[
                        run_v2.EnvVar(name="SCRAPER_RUN_CODE", value=run_code),
                        run_v2.EnvVar(name="SCRAPER_RUN_ACTION", value=action),
                    ]
                )
            ],
            task_count=1,
        ),
    )

    operation = client.run_job(request=request)
    logger.info(
        "Cloud Run Job dispatched: run_code=%s action=%s operation=%s",
        run_code,
        action,
        operation.operation.name,
    )
