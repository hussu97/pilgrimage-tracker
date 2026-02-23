"""Admin — Audit log endpoints and write helper."""

import random
import string
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlmodel import Session, col, func, select

from app.api.deps import AdminDep
from app.db.models import AuditLog, User
from app.db.session import SessionDep

router = APIRouter()


# ── Helper used by all write endpoints ────────────────────────────────────────


def _gen_log_code() -> str:
    chars = string.ascii_lowercase + string.digits
    return "log_" + "".join(random.choices(chars, k=8))


def record_audit(
    session: Session,
    admin: User,
    action: str,
    entity_type: str,
    entity_code: str,
    changes: dict | None = None,
) -> None:
    """Create an AuditLog row. Caller is responsible for committing the session."""
    log = AuditLog(
        log_code=_gen_log_code(),
        admin_user_code=admin.user_code,
        action=action,
        entity_type=entity_type,
        entity_code=entity_code,
        changes=changes,
    )
    session.add(log)


# ── Schemas ────────────────────────────────────────────────────────────────────


class AuditLogItem(BaseModel):
    log_code: str
    admin_user_code: str
    admin_display_name: str | None
    action: str
    entity_type: str
    entity_code: str
    changes: dict | None
    created_at: datetime


class AuditLogListResponse(BaseModel):
    items: list[AuditLogItem]
    total: int
    page: int
    page_size: int


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("/audit-log", response_model=AuditLogListResponse)
def list_audit_log(
    admin: AdminDep,
    session: SessionDep,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 50,
    admin_user_code: str | None = None,
    entity_type: str | None = None,
    action: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
):
    stmt = select(AuditLog)
    if admin_user_code:
        stmt = stmt.where(AuditLog.admin_user_code == admin_user_code)
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if from_date:
        stmt = stmt.where(
            AuditLog.created_at >= datetime.fromisoformat(from_date).replace(tzinfo=UTC)
        )
    if to_date:
        stmt = stmt.where(
            AuditLog.created_at <= datetime.fromisoformat(to_date).replace(tzinfo=UTC)
        )

    total = session.exec(select(func.count()).select_from(stmt.subquery())).one()
    stmt = stmt.order_by(col(AuditLog.created_at).desc())
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    logs = session.exec(stmt).all()

    # Batch-fetch admin display names
    admin_codes = {log.admin_user_code for log in logs}
    admins = {
        u.user_code: u.display_name
        for u in session.exec(select(User).where(col(User.user_code).in_(admin_codes))).all()
    }

    return AuditLogListResponse(
        items=[
            AuditLogItem(
                log_code=log.log_code,
                admin_user_code=log.admin_user_code,
                admin_display_name=admins.get(log.admin_user_code),
                action=log.action,
                entity_type=log.entity_type,
                entity_code=log.entity_code,
                changes=log.changes,
                created_at=log.created_at,
            )
            for log in logs
        ],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/audit-log/{log_code}", response_model=AuditLogItem)
def get_audit_log_entry(log_code: str, admin: AdminDep, session: SessionDep):
    from fastapi import HTTPException

    log = session.exec(select(AuditLog).where(AuditLog.log_code == log_code)).first()
    if not log:
        raise HTTPException(status_code=404, detail="Audit log entry not found")

    admin_user = session.exec(select(User).where(User.user_code == log.admin_user_code)).first()

    return AuditLogItem(
        log_code=log.log_code,
        admin_user_code=log.admin_user_code,
        admin_display_name=admin_user.display_name if admin_user else None,
        action=log.action,
        entity_type=log.entity_type,
        entity_code=log.entity_code,
        changes=log.changes,
        created_at=log.created_at,
    )
