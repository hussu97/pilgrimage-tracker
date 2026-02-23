"""Admin — App Version Config management.

Allows admins to view and update per-platform version requirements
(iOS / Android) via the DB-backed AppVersionConfig table.
"""

from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlmodel import select

from app.api.deps import AdminDep
from app.db.models import AppVersionConfig
from app.db.session import SessionDep

router = APIRouter()


# ── Schemas ────────────────────────────────────────────────────────────────────


class AppVersionConfigResponse(BaseModel):
    platform: str
    min_version_hard: str
    min_version_soft: str
    latest_version: str
    store_url: str
    updated_at: datetime


class UpdateAppVersionBody(BaseModel):
    min_version_hard: str | None = None
    min_version_soft: str | None = None
    latest_version: str | None = None
    store_url: str | None = None


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("/app-versions", response_model=list[AppVersionConfigResponse])
def list_app_versions(admin: AdminDep, session: SessionDep):
    """List all AppVersionConfig rows (one per platform)."""
    rows = session.exec(select(AppVersionConfig).order_by(AppVersionConfig.platform)).all()
    return [
        AppVersionConfigResponse(
            platform=r.platform,
            min_version_hard=r.min_version_hard,
            min_version_soft=r.min_version_soft,
            latest_version=r.latest_version,
            store_url=r.store_url,
            updated_at=r.updated_at,
        )
        for r in rows
    ]


@router.put("/app-versions/{platform}", response_model=AppVersionConfigResponse)
def update_app_version(
    platform: str,
    body: UpdateAppVersionBody,
    admin: AdminDep,
    session: SessionDep,
):
    """Upsert the AppVersionConfig row for the given platform."""
    if platform not in ("ios", "android"):
        raise HTTPException(status_code=400, detail="Platform must be 'ios' or 'android'")

    row = session.exec(
        select(AppVersionConfig).where(AppVersionConfig.platform == platform)
    ).first()

    if not row:
        row = AppVersionConfig(platform=platform)

    if body.min_version_hard is not None:
        row.min_version_hard = body.min_version_hard
    if body.min_version_soft is not None:
        row.min_version_soft = body.min_version_soft
    if body.latest_version is not None:
        row.latest_version = body.latest_version
    if body.store_url is not None:
        row.store_url = body.store_url
    row.updated_at = datetime.now(UTC)

    session.add(row)
    session.commit()
    session.refresh(row)

    return AppVersionConfigResponse(
        platform=row.platform,
        min_version_hard=row.min_version_hard,
        min_version_soft=row.min_version_soft,
        latest_version=row.latest_version,
        store_url=row.store_url,
        updated_at=row.updated_at,
    )
