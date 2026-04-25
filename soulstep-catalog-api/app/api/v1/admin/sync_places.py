"""Internal admin/control endpoints for direct scraper-to-catalog sync."""

from __future__ import annotations

import os

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from app.api.deps import ApiKeyDep
from app.jobs.sync_places import sync_places_for_run

router = APIRouter()


class DirectSyncPlacesRequest(BaseModel):
    run_code: str
    failed_only: bool = False
    dry_run: bool = False


def _run_direct_sync(run_code: str, failed_only: bool, dry_run: bool) -> None:
    scraper_db_url = os.environ.get("SCRAPER_DATABASE_URL")
    if not scraper_db_url:
        raise RuntimeError("SCRAPER_DATABASE_URL environment variable is required")
    sync_places_for_run(
        run_code=run_code,
        scraper_database_url=scraper_db_url,
        failed_only=failed_only,
        dry_run=dry_run,
        raise_on_failure=False,
    )


@router.post("/sync-places/direct")
def start_direct_sync_places(
    body: DirectSyncPlacesRequest,
    background_tasks: BackgroundTasks,
    _key: ApiKeyDep,
):
    """Start direct DB catalog sync for a scraper run.

    This endpoint is intentionally only a control plane call. The large place
    payload never flows through the HTTP request; the background job reads the
    scraper DB directly using SCRAPER_DATABASE_URL.
    """

    if not os.environ.get("SCRAPER_DATABASE_URL"):
        raise HTTPException(
            status_code=503,
            detail="SCRAPER_DATABASE_URL is not configured on catalog-api",
        )
    background_tasks.add_task(_run_direct_sync, body.run_code, body.failed_only, body.dry_run)
    return {
        "status": "direct_sync_started",
        "run_code": body.run_code,
        "failed_only": body.failed_only,
        "dry_run": body.dry_run,
    }
