"""Public endpoint for batch analytics event ingestion."""

import secrets
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, field_validator
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.api.deps import OptionalUserDep
from app.db.enums import AnalyticsEventType
from app.db.models import AnalyticsEvent
from app.db.session import SessionDep

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

_VALID_PLATFORMS = {"web", "ios", "android"}
_VALID_DEVICE_TYPES = {"mobile", "desktop"}
_VALID_EVENT_TYPES = {e.value for e in AnalyticsEventType}


# ── Schemas ──────────────────────────────────────────────────────────────────


class EventItem(BaseModel):
    event_type: str
    properties: dict[str, Any] | None = None
    client_timestamp: datetime
    session_id: str

    @field_validator("event_type")
    @classmethod
    def validate_event_type(cls, v: str) -> str:
        if v not in _VALID_EVENT_TYPES:
            raise ValueError(f"Unknown event_type '{v}'")
        return v


class AnalyticsIngestionBody(BaseModel):
    events: list[EventItem]
    platform: str
    device_type: str | None = None
    app_version: str | None = None
    visitor_code: str | None = None

    @field_validator("platform")
    @classmethod
    def validate_platform(cls, v: str) -> str:
        if v not in _VALID_PLATFORMS:
            raise ValueError(f"platform must be one of {_VALID_PLATFORMS}")
        return v

    @field_validator("device_type")
    @classmethod
    def validate_device_type(cls, v: str | None) -> str | None:
        if v is not None and v not in _VALID_DEVICE_TYPES:
            raise ValueError(f"device_type must be one of {_VALID_DEVICE_TYPES}")
        return v

    @field_validator("events")
    @classmethod
    def validate_max_events(cls, v: list) -> list:
        if len(v) > 50:
            raise ValueError("Maximum 50 events per request")
        return v


class AnalyticsIngestionResponse(BaseModel):
    accepted: int


# ── Endpoint ─────────────────────────────────────────────────────────────────


@router.post(
    "/analytics/events",
    response_model=AnalyticsIngestionResponse,
    status_code=status.HTTP_200_OK,
    tags=["analytics"],
)
@limiter.limit("10/minute")
def ingest_events(
    body: AnalyticsIngestionBody,
    request: Request,
    session: SessionDep,
    current_user: OptionalUserDep,
):
    """Ingest a batch of analytics events (authenticated or anonymous)."""
    user_code = current_user.user_code if current_user else None
    visitor_code = body.visitor_code if not current_user else None

    if not user_code and not visitor_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="visitor_code required for anonymous events",
        )

    now = datetime.now(UTC)
    records: list[AnalyticsEvent] = []
    for event in body.events:
        records.append(
            AnalyticsEvent(
                event_code=f"evt_{secrets.token_hex(8)}",
                event_type=event.event_type,
                user_code=user_code,
                visitor_code=visitor_code,
                session_id=event.session_id,
                properties=event.properties,
                platform=body.platform,
                device_type=body.device_type,
                app_version=body.app_version,
                client_timestamp=event.client_timestamp,
                created_at=now,
            )
        )

    for record in records:
        session.add(record)
    session.commit()

    return AnalyticsIngestionResponse(accepted=len(records))
