"""Admin — Check-ins management endpoints."""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import col, func, select

from app.api.deps import AdminDep
from app.api.v1.admin.audit_log import record_audit
from app.db.models import CheckIn, Place, User
from app.db.session import SessionDep

router = APIRouter()


class AdminCheckInListItem(BaseModel):
    check_in_code: str
    user_code: str
    user_display_name: str | None
    place_code: str
    place_name: str | None
    group_code: str | None
    note: str | None
    checked_in_at: datetime
    deleted_at: datetime | None = None


class AdminCheckInListResponse(BaseModel):
    items: list[AdminCheckInListItem]
    total: int
    page: int
    page_size: int


@router.get("/check-ins", response_model=AdminCheckInListResponse)
def list_check_ins(
    admin: AdminDep,
    session: SessionDep,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=2000)] = 50,
    place_code: str | None = None,
    user_code: str | None = None,
    group_code: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    include_deleted: bool = False,
):
    stmt = select(CheckIn)
    if not include_deleted:
        stmt = stmt.where(CheckIn.deleted_at == None)  # noqa: E711
    if place_code:
        stmt = stmt.where(CheckIn.place_code == place_code)
    if user_code:
        stmt = stmt.where(CheckIn.user_code == user_code)
    if group_code:
        stmt = stmt.where(CheckIn.group_code == group_code)
    if from_date:
        stmt = stmt.where(col(CheckIn.checked_in_at) >= from_date)
    if to_date:
        stmt = stmt.where(col(CheckIn.checked_in_at) <= to_date)

    total = session.exec(select(func.count()).select_from(stmt.subquery())).one()
    stmt = (
        stmt.order_by(col(CheckIn.checked_in_at).desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    check_ins = session.exec(stmt).all()

    place_codes = {ci.place_code for ci in check_ins}
    user_codes = {ci.user_code for ci in check_ins}
    place_map: dict = {}
    user_map: dict = {}
    if place_codes:
        places = session.exec(select(Place).where(col(Place.place_code).in_(place_codes))).all()
        place_map = {p.place_code: p for p in places}
    if user_codes:
        users = session.exec(select(User).where(col(User.user_code).in_(user_codes))).all()
        user_map = {u.user_code: u for u in users}

    items = []
    for ci in check_ins:
        place = place_map.get(ci.place_code)
        user = user_map.get(ci.user_code)
        items.append(
            AdminCheckInListItem(
                check_in_code=ci.check_in_code,
                user_code=ci.user_code,
                user_display_name=user.display_name if user else None,
                place_code=ci.place_code,
                place_name=place.name if place else None,
                group_code=ci.group_code,
                note=ci.note,
                checked_in_at=ci.checked_in_at,
                deleted_at=ci.deleted_at,
            )
        )

    return AdminCheckInListResponse(items=items, total=total, page=page, page_size=page_size)


@router.delete("/check-ins/{check_in_code}", status_code=204)
def delete_check_in(check_in_code: str, admin: AdminDep, session: SessionDep):
    ci = session.exec(select(CheckIn).where(CheckIn.check_in_code == check_in_code)).first()
    if not ci:
        raise HTTPException(status_code=404, detail="Check-in not found")
    record_audit(session, admin, "delete", "check_in", check_in_code)
    session.delete(ci)
    session.commit()
