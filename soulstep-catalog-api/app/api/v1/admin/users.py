"""Admin — Users management endpoints."""

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import col, func, select

from app.api.deps import AdminDep
from app.api.v1.admin.audit_log import record_audit
from app.db.models import CheckIn, Place, Review, User
from app.db.session import SessionDep

router = APIRouter()


# ── Schemas ────────────────────────────────────────────────────────────────────


class AdminUserListItem(BaseModel):
    user_code: str
    email: str
    display_name: str
    is_active: bool
    is_admin: bool
    created_at: datetime
    updated_at: datetime


class AdminUserDetail(AdminUserListItem):
    check_in_count: int
    review_count: int


class AdminUserListResponse(BaseModel):
    items: list[AdminUserListItem]
    total: int
    page: int
    page_size: int


class PatchUserBody(BaseModel):
    display_name: str | None = None
    is_active: bool | None = None
    is_admin: bool | None = None


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("/users", response_model=AdminUserListResponse)
def list_users(
    admin: AdminDep,
    session: SessionDep,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=2000)] = 50,
    search: str | None = None,
    is_active: bool | None = None,
    is_admin_filter: Annotated[bool | None, Query(alias="is_admin")] = None,
):
    stmt = select(User)
    if search:
        pattern = f"%{search}%"
        stmt = stmt.where(col(User.email).ilike(pattern) | col(User.display_name).ilike(pattern))
    if is_active is not None:
        stmt = stmt.where(User.is_active == is_active)
    if is_admin_filter is not None:
        stmt = stmt.where(User.is_admin == is_admin_filter)

    total = session.exec(select(func.count()).select_from(stmt.subquery())).one()

    stmt = stmt.order_by(col(User.created_at).desc())
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    users = session.exec(stmt).all()

    return AdminUserListResponse(
        items=[
            AdminUserListItem(
                user_code=u.user_code,
                email=u.email,
                display_name=u.display_name,
                is_active=u.is_active,
                is_admin=u.is_admin,
                created_at=u.created_at,
                updated_at=u.updated_at,
            )
            for u in users
        ],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/users/{user_code}", response_model=AdminUserDetail)
def get_user(user_code: str, admin: AdminDep, session: SessionDep):
    user = session.exec(select(User).where(User.user_code == user_code)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    check_in_count = session.exec(
        select(func.count()).select_from(CheckIn).where(CheckIn.user_code == user_code)
    ).one()
    review_count = session.exec(
        select(func.count()).select_from(Review).where(Review.user_code == user_code)
    ).one()

    return AdminUserDetail(
        user_code=user.user_code,
        email=user.email,
        display_name=user.display_name,
        is_active=user.is_active,
        is_admin=user.is_admin,
        created_at=user.created_at,
        updated_at=user.updated_at,
        check_in_count=check_in_count,
        review_count=review_count,
    )


@router.patch("/users/{user_code}", response_model=AdminUserDetail)
def patch_user(
    user_code: str,
    body: PatchUserBody,
    admin: AdminDep,
    session: SessionDep,
):
    user = session.exec(select(User).where(User.user_code == user_code)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    changes: dict = {}
    if body.display_name is not None:
        changes["display_name"] = {"old": user.display_name, "new": body.display_name}
        user.display_name = body.display_name
    if body.is_active is not None:
        changes["is_active"] = {"old": user.is_active, "new": body.is_active}
        user.is_active = body.is_active
    if body.is_admin is not None:
        changes["is_admin"] = {"old": user.is_admin, "new": body.is_admin}
        user.is_admin = body.is_admin
    user.updated_at = datetime.now(UTC)

    record_audit(session, admin, "update", "user", user_code, changes or None)
    session.add(user)
    session.commit()
    session.refresh(user)

    check_in_count = session.exec(
        select(func.count()).select_from(CheckIn).where(CheckIn.user_code == user_code)
    ).one()
    review_count = session.exec(
        select(func.count()).select_from(Review).where(Review.user_code == user_code)
    ).one()

    return AdminUserDetail(
        user_code=user.user_code,
        email=user.email,
        display_name=user.display_name,
        is_active=user.is_active,
        is_admin=user.is_admin,
        created_at=user.created_at,
        updated_at=user.updated_at,
        check_in_count=check_in_count,
        review_count=review_count,
    )


@router.delete("/users/{user_code}", status_code=204)
def deactivate_user(user_code: str, admin: AdminDep, session: SessionDep):
    """Soft-delete: sets is_active=False."""
    user = session.exec(select(User).where(User.user_code == user_code)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = False
    user.updated_at = datetime.now(UTC)
    record_audit(session, admin, "delete", "user", user_code)
    session.add(user)
    session.commit()


class AdminCheckInItem(BaseModel):
    check_in_code: str
    place_code: str
    place_name: str | None
    group_code: str | None
    note: str | None
    checked_in_at: datetime


class AdminCheckInListResponse(BaseModel):
    items: list[AdminCheckInItem]
    total: int
    page: int
    page_size: int


@router.get("/users/{user_code}/check-ins", response_model=AdminCheckInListResponse)
def list_user_check_ins(
    user_code: str,
    admin: AdminDep,
    session: SessionDep,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=2000)] = 50,
):
    user = session.exec(select(User).where(User.user_code == user_code)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    stmt = select(CheckIn).where(CheckIn.user_code == user_code)
    total = session.exec(select(func.count()).select_from(stmt.subquery())).one()
    stmt = (
        stmt.order_by(col(CheckIn.checked_in_at).desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    check_ins = session.exec(stmt).all()

    items = []
    for ci in check_ins:
        place = session.exec(select(Place).where(Place.place_code == ci.place_code)).first()
        items.append(
            AdminCheckInItem(
                check_in_code=ci.check_in_code,
                place_code=ci.place_code,
                place_name=place.name if place else None,
                group_code=ci.group_code,
                note=ci.note,
                checked_in_at=ci.checked_in_at,
            )
        )

    return AdminCheckInListResponse(items=items, total=total, page=page, page_size=page_size)


class AdminReviewItem(BaseModel):
    review_code: str
    place_code: str
    place_name: str | None
    rating: int
    title: str | None
    body: str | None
    is_flagged: bool
    created_at: datetime


class AdminReviewListResponse(BaseModel):
    items: list[AdminReviewItem]
    total: int
    page: int
    page_size: int


@router.get("/users/{user_code}/reviews", response_model=AdminReviewListResponse)
def list_user_reviews(
    user_code: str,
    admin: AdminDep,
    session: SessionDep,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=2000)] = 50,
):
    user = session.exec(select(User).where(User.user_code == user_code)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    stmt = select(Review).where(Review.user_code == user_code)
    total = session.exec(select(func.count()).select_from(stmt.subquery())).one()
    stmt = (
        stmt.order_by(col(Review.created_at).desc()).offset((page - 1) * page_size).limit(page_size)
    )
    reviews = session.exec(stmt).all()

    items = []
    for r in reviews:
        place = session.exec(select(Place).where(Place.place_code == r.place_code)).first()
        items.append(
            AdminReviewItem(
                review_code=r.review_code,
                place_code=r.place_code,
                place_name=place.name if place else None,
                rating=r.rating,
                title=r.title,
                body=r.body,
                is_flagged=r.is_flagged,
                created_at=r.created_at,
            )
        )

    return AdminReviewListResponse(items=items, total=total, page=page, page_size=page_size)
