"""Admin — Notification management endpoints."""

import random
import string
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import col, func, select

from app.api.deps import AdminDep
from app.db.models import AdminBroadcast, Notification, User
from app.db.session import SessionDep

router = APIRouter()


# ── Helpers ───────────────────────────────────────────────────────────────────


def _gen_code(prefix: str) -> str:
    chars = string.ascii_lowercase + string.digits
    return prefix + "".join(random.choices(chars, k=8))


# ── Schemas ────────────────────────────────────────────────────────────────────


class BroadcastBody(BaseModel):
    type: str
    payload: dict = {}


class SendBody(BaseModel):
    user_codes: list[str]
    type: str
    payload: dict = {}


class BroadcastResult(BaseModel):
    broadcast_code: str
    recipient_count: int


class AdminBroadcastItem(BaseModel):
    broadcast_code: str
    admin_user_code: str
    admin_display_name: str | None
    type: str
    payload: dict
    recipient_type: str
    recipient_count: int
    created_at: datetime


class AdminBroadcastListResponse(BaseModel):
    items: list[AdminBroadcastItem]
    total: int
    page: int
    page_size: int


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.post("/notifications/broadcast", response_model=BroadcastResult)
def broadcast_notification(body: BroadcastBody, admin: AdminDep, session: SessionDep):
    """Send a notification to all active users."""
    users = session.exec(select(User).where(User.is_active == True)).all()  # noqa: E712

    now = datetime.now(UTC)
    notifications = [
        Notification(
            notification_code=_gen_code("ntf_"),
            user_code=u.user_code,
            type=body.type,
            payload=body.payload,
            created_at=now,
        )
        for u in users
    ]
    for n in notifications:
        session.add(n)

    broadcast = AdminBroadcast(
        broadcast_code=_gen_code("brd_"),
        admin_user_code=admin.user_code,
        type=body.type,
        payload=body.payload,
        recipient_type="all",
        recipient_count=len(notifications),
        created_at=now,
    )
    session.add(broadcast)
    session.commit()

    return BroadcastResult(
        broadcast_code=broadcast.broadcast_code,
        recipient_count=len(notifications),
    )


@router.post("/notifications/send", response_model=BroadcastResult)
def send_notification(body: SendBody, admin: AdminDep, session: SessionDep):
    """Send a notification to specific users."""
    if not body.user_codes:
        raise HTTPException(status_code=400, detail="user_codes must not be empty")

    users = session.exec(select(User).where(col(User.user_code).in_(body.user_codes))).all()

    if not users:
        raise HTTPException(status_code=404, detail="No matching users found")

    now = datetime.now(UTC)
    notifications = [
        Notification(
            notification_code=_gen_code("ntf_"),
            user_code=u.user_code,
            type=body.type,
            payload=body.payload,
            created_at=now,
        )
        for u in users
    ]
    for n in notifications:
        session.add(n)

    broadcast = AdminBroadcast(
        broadcast_code=_gen_code("brd_"),
        admin_user_code=admin.user_code,
        type=body.type,
        payload=body.payload,
        recipient_type="targeted",
        recipient_count=len(notifications),
        created_at=now,
    )
    session.add(broadcast)
    session.commit()

    return BroadcastResult(
        broadcast_code=broadcast.broadcast_code,
        recipient_count=len(notifications),
    )


@router.get("/notifications/history", response_model=AdminBroadcastListResponse)
def list_notification_history(
    admin: AdminDep,
    session: SessionDep,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=2000)] = 50,
):
    stmt = select(AdminBroadcast)
    total = session.exec(select(func.count()).select_from(stmt.subquery())).one()
    stmt = stmt.order_by(col(AdminBroadcast.created_at).desc())
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    broadcasts = session.exec(stmt).all()

    admin_codes = {b.admin_user_code for b in broadcasts}
    admins = {
        u.user_code: u.display_name
        for u in session.exec(select(User).where(col(User.user_code).in_(admin_codes))).all()
    }

    return AdminBroadcastListResponse(
        items=[
            AdminBroadcastItem(
                broadcast_code=b.broadcast_code,
                admin_user_code=b.admin_user_code,
                admin_display_name=admins.get(b.admin_user_code),
                type=b.type,
                payload=b.payload,
                recipient_type=b.recipient_type,
                recipient_count=b.recipient_count,
                created_at=b.created_at,
            )
            for b in broadcasts
        ],
        total=total,
        page=page,
        page_size=page_size,
    )
