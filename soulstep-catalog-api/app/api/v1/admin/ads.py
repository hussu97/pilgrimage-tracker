"""Admin — Ad configuration and consent analytics."""

from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlmodel import func, select

from app.api.deps import AdminDep
from app.api.v1.admin.audit_log import record_audit
from app.db.models import AdConfig, ConsentRecord
from app.db.session import SessionDep

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────────────────────


class AdminAdConfigItem(BaseModel):
    id: int
    platform: str
    ads_enabled: bool
    adsense_publisher_id: str
    ad_slots: dict
    updated_at: datetime


class AdminAdConfigListResponse(BaseModel):
    items: list[AdminAdConfigItem]


class PatchAdConfigBody(BaseModel):
    ads_enabled: bool | None = None
    adsense_publisher_id: str | None = None
    ad_slots: dict | None = None


class ConsentStatsItem(BaseModel):
    consent_type: str
    total: int
    granted: int
    denied: int
    grant_rate: float


class ConsentStatsResponse(BaseModel):
    items: list[ConsentStatsItem]


# ── Config endpoints ─────────────────────────────────────────────────────────


@router.get("/ads/config", response_model=AdminAdConfigListResponse, tags=["admin-ads"])
def list_ad_configs(session: SessionDep, admin: AdminDep):
    """List web ad config."""
    rows = session.exec(select(AdConfig).order_by(AdConfig.platform)).all()
    return AdminAdConfigListResponse(
        items=[
            AdminAdConfigItem(
                id=r.id,  # type: ignore[arg-type]
                platform=r.platform,
                ads_enabled=r.ads_enabled,
                adsense_publisher_id=r.adsense_publisher_id,
                ad_slots=r.ad_slots or {},
                updated_at=r.updated_at,
            )
            for r in rows
        ]
    )


@router.patch("/ads/config/{config_id}", response_model=AdminAdConfigItem, tags=["admin-ads"])
def patch_ad_config(
    config_id: int,
    body: PatchAdConfigBody,
    session: SessionDep,
    admin: AdminDep,
):
    """Update ad config for a platform."""
    row = session.get(AdConfig, config_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ad config not found")

    changes: dict = {}
    if body.ads_enabled is not None and body.ads_enabled != row.ads_enabled:
        changes["ads_enabled"] = {"old": row.ads_enabled, "new": body.ads_enabled}
        row.ads_enabled = body.ads_enabled
    if (
        body.adsense_publisher_id is not None
        and body.adsense_publisher_id != row.adsense_publisher_id
    ):
        changes["adsense_publisher_id"] = {
            "old": row.adsense_publisher_id,
            "new": body.adsense_publisher_id,
        }
        row.adsense_publisher_id = body.adsense_publisher_id
    if body.ad_slots is not None and body.ad_slots != row.ad_slots:
        changes["ad_slots"] = {"old": row.ad_slots, "new": body.ad_slots}
        row.ad_slots = body.ad_slots

    if changes:
        row.updated_at = datetime.now(UTC)
        session.add(row)
        session.commit()
        session.refresh(row)
        record_audit(session, admin, "update", "ad_config", row.platform, changes)

    return AdminAdConfigItem(
        id=row.id,  # type: ignore[arg-type]
        platform=row.platform,
        ads_enabled=row.ads_enabled,
        adsense_publisher_id=row.adsense_publisher_id,
        ad_slots=row.ad_slots or {},
        updated_at=row.updated_at,
    )


# ── Consent stats ────────────────────────────────────────────────────────────


@router.get("/ads/consent-stats", response_model=ConsentStatsResponse, tags=["admin-ads"])
def get_consent_stats(session: SessionDep, admin: AdminDep):
    """Aggregate consent grant/deny rates by type."""
    items: list[ConsentStatsItem] = []
    for ct in ("ads", "analytics"):
        total_q = (
            select(func.count()).select_from(ConsentRecord).where(ConsentRecord.consent_type == ct)
        )
        total = session.exec(total_q).one()

        granted_q = (
            select(func.count())
            .select_from(ConsentRecord)
            .where(
                ConsentRecord.consent_type == ct,
                ConsentRecord.granted == True,  # noqa: E712
            )
        )
        granted = session.exec(granted_q).one()

        denied = total - granted
        rate = round(granted / total, 4) if total > 0 else 0.0
        items.append(
            ConsentStatsItem(
                consent_type=ct,
                total=total,
                granted=granted,
                denied=denied,
                grant_rate=rate,
            )
        )
    return ConsentStatsResponse(items=items)
