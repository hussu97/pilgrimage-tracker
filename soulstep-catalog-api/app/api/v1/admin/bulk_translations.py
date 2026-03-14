"""Admin — Bulk Translation Jobs (read-only).

Provides endpoints to list, inspect, and delete bulk content-translation job
records. Jobs are created and executed by the Cloud Run translate_content job
(app/jobs/translate_content.py), not by the API.
"""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Response
from pydantic import BaseModel
from sqlmodel import col, select

from app.api.deps import AdminDep
from app.db.models import BulkTranslationJob
from app.db.session import SessionDep

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Pydantic schemas ────────────────────────────────────────────────────────────


class BulkTranslationJobOut(BaseModel):
    job_code: str
    status: str
    job_type: str
    target_langs: list[str]
    entity_types: list[str]
    source_lang: str
    total_items: int
    completed_items: int
    failed_items: int
    skipped_items: int
    progress_pct: float
    error_message: str | None
    started_at: str | None
    completed_at: str | None
    created_at: str

    @classmethod
    def from_orm(cls, job: BulkTranslationJob) -> BulkTranslationJobOut:
        progress = (
            job.completed_items / max(job.total_items, 1) * 100 if job.total_items > 0 else 0.0
        )
        return cls(
            job_code=job.job_code,
            status=job.status,
            job_type=job.job_type,
            target_langs=job.target_langs or [],
            entity_types=job.entity_types or [],
            source_lang=job.source_lang,
            total_items=job.total_items,
            completed_items=job.completed_items,
            failed_items=job.failed_items,
            skipped_items=job.skipped_items,
            progress_pct=round(progress, 2),
            error_message=job.error_message,
            started_at=job.started_at.isoformat() if job.started_at else None,
            completed_at=job.completed_at.isoformat() if job.completed_at else None,
            created_at=job.created_at.isoformat(),
        )


class JobListResponse(BaseModel):
    items: list[BulkTranslationJobOut]
    total: int
    page: int
    page_size: int


# ── Endpoints ───────────────────────────────────────────────────────────────────


@router.get("/translations/jobs", response_model=JobListResponse)
def list_translation_jobs(
    admin: AdminDep,
    session: SessionDep,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=2000)] = 50,
) -> JobListResponse:
    """List all bulk translation jobs, newest first."""
    total = session.exec(select(BulkTranslationJob)).all()
    total_count = len(total)

    jobs = session.exec(
        select(BulkTranslationJob)
        .order_by(col(BulkTranslationJob.created_at).desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    return JobListResponse(
        items=[BulkTranslationJobOut.from_orm(j) for j in jobs],
        total=total_count,
        page=page,
        page_size=page_size,
    )


@router.get("/translations/jobs/{job_code}", response_model=BulkTranslationJobOut)
def get_translation_job(
    job_code: str,
    admin: AdminDep,
    session: SessionDep,
) -> BulkTranslationJobOut:
    """Get progress details for a specific job."""
    job = session.exec(
        select(BulkTranslationJob).where(BulkTranslationJob.job_code == job_code)
    ).first()
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return BulkTranslationJobOut.from_orm(job)


@router.delete("/translations/jobs/{job_code}", status_code=204)
def delete_translation_job(
    job_code: str,
    admin: AdminDep,
    session: SessionDep,
) -> Response:
    """Delete a completed or failed job. Returns 409 if the job is still running."""
    job = session.exec(
        select(BulkTranslationJob).where(BulkTranslationJob.job_code == job_code)
    ).first()
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status in ("pending", "running"):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete a job with status '{job.status}'. Cancel it first.",
        )
    session.delete(job)
    session.commit()
    return Response(status_code=204)
