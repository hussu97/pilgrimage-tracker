"""Internal admin/control endpoints for direct scraper-to-catalog sync."""

from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.api.deps import ApiKeyDep

router = APIRouter()


class DirectSyncPlacesRequest(BaseModel):
    run_code: str
    failed_only: bool = False
    dry_run: bool = False


def _safe_log_token(value: str) -> str:
    token = re.sub(r"[^A-Za-z0-9_.-]+", "_", value).strip("._-")
    return token or "run"


def _sync_log_dir() -> Path:
    return Path(os.environ.get("CATALOG_SYNC_LOG_DIR", "/tmp/soulstep-catalog-sync"))


def _start_direct_sync_process(
    run_code: str, failed_only: bool, dry_run: bool
) -> dict[str, str | int]:
    """Launch direct catalog sync outside the web worker lifecycle."""
    if not os.environ.get("SCRAPER_DATABASE_URL"):
        raise RuntimeError("SCRAPER_DATABASE_URL environment variable is required")

    log_dir = _sync_log_dir()
    log_dir.mkdir(parents=True, exist_ok=True)
    suffix = _safe_log_token(run_code)
    if failed_only:
        suffix = f"{suffix}-failed-only"
    if dry_run:
        suffix = f"{suffix}-dry-run"
    log_path = log_dir / f"{suffix}.log"

    cmd = [sys.executable, "-m", "app.jobs.sync_places", "--run-code", run_code]
    if failed_only:
        cmd.append("--failed-only")
    if dry_run:
        cmd.append("--dry-run")

    project_root = Path(__file__).resolve().parents[4]
    with log_path.open("ab", buffering=0) as log_file:
        log_file.write(
            (
                f"\n--- starting direct catalog sync for {run_code} "
                f"(failed_only={failed_only}, dry_run={dry_run}) ---\n"
            ).encode()
        )
        proc = subprocess.Popen(
            cmd,
            cwd=project_root,
            env=os.environ.copy(),
            stdout=log_file,
            stderr=subprocess.STDOUT,
            close_fds=True,
            start_new_session=True,
        )

    return {"pid": proc.pid, "log_path": str(log_path)}


@router.post("/sync-places/direct")
def start_direct_sync_places(
    body: DirectSyncPlacesRequest,
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
    try:
        process = _start_direct_sync_process(body.run_code, body.failed_only, body.dry_run)
    except OSError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to start direct catalog sync process: {exc}",
        ) from exc
    return {
        "status": "direct_sync_started",
        "run_code": body.run_code,
        "failed_only": body.failed_only,
        "dry_run": body.dry_run,
        **process,
    }
