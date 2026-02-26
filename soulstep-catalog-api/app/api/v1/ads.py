"""Public endpoints for ad configuration and consent management."""

from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlmodel import select

from app.api.deps import OptionalUserDep
from app.db.models import AdConfig, ConsentRecord
from app.db.session import SessionDep

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────────────────────


class AdConfigResponse(BaseModel):
    platform: str
    ads_enabled: bool
    adsense_publisher_id: str
    ad_slots: dict


class ConsentBody(BaseModel):
    consent_type: str  # "ads" | "analytics"
    granted: bool
    visitor_code: str | None = None


class ConsentStatusResponse(BaseModel):
    ads: bool | None = None
    analytics: bool | None = None


# ── Ad config ────────────────────────────────────────────────────────────────


@router.get("/ads/config", response_model=AdConfigResponse, tags=["ads"])
def get_ad_config(
    session: SessionDep,
    platform: str = Query(default="web", pattern="^(web|ios|android)$"),
):
    """Return ad configuration for the given platform (no auth required)."""
    row = session.exec(select(AdConfig).where(AdConfig.platform == platform)).first()
    if not row:
        return AdConfigResponse(
            platform=platform,
            ads_enabled=False,
            adsense_publisher_id="",
            ad_slots={},
        )
    return AdConfigResponse(
        platform=row.platform,
        ads_enabled=row.ads_enabled,
        adsense_publisher_id=row.adsense_publisher_id,
        ad_slots=row.ad_slots or {},
    )


# ── Consent ──────────────────────────────────────────────────────────────────


@router.post("/consent", status_code=status.HTTP_201_CREATED, tags=["ads"])
def record_consent(
    body: ConsentBody,
    request: Request,
    session: SessionDep,
    current_user: OptionalUserDep,
):
    """Record a consent choice (ads or analytics). Works for both logged-in users and visitors."""
    if body.consent_type not in ("ads", "analytics"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="consent_type must be 'ads' or 'analytics'",
        )

    user_code = current_user.user_code if current_user else None
    visitor_code = body.visitor_code if not current_user else None

    if not user_code and not visitor_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="visitor_code required for anonymous consent",
        )

    record = ConsentRecord(
        user_code=user_code,
        visitor_code=visitor_code,
        consent_type=body.consent_type,
        granted=body.granted,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        created_at=datetime.now(UTC),
    )
    session.add(record)
    session.commit()
    return {"status": "ok"}


@router.get("/consent", response_model=ConsentStatusResponse, tags=["ads"])
def get_consent_status(
    session: SessionDep,
    current_user: OptionalUserDep,
    visitor_code: str | None = Query(default=None),
):
    """Return the latest consent status for the current user or visitor."""
    user_code = current_user.user_code if current_user else None
    vc = visitor_code if not current_user else None

    if not user_code and not vc:
        return ConsentStatusResponse()

    result: dict[str, bool | None] = {"ads": None, "analytics": None}

    for consent_type in ("ads", "analytics"):
        stmt = select(ConsentRecord).where(ConsentRecord.consent_type == consent_type)
        if user_code:
            stmt = stmt.where(ConsentRecord.user_code == user_code)
        else:
            stmt = stmt.where(ConsentRecord.visitor_code == vc)
        stmt = stmt.order_by(ConsentRecord.created_at.desc()).limit(1)  # type: ignore[union-attr]
        row = session.exec(stmt).first()
        if row:
            result[consent_type] = row.granted

    return ConsentStatusResponse(**result)
