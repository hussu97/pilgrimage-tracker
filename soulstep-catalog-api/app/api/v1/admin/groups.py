"""Admin — Groups management endpoints."""

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import col, func, select

from app.api.deps import AdminDep
from app.api.v1.admin.audit_log import record_audit
from app.db.models import Group, GroupMember, User
from app.db.session import SessionDep

router = APIRouter()


# ── Schemas ────────────────────────────────────────────────────────────────────


class AdminGroupListItem(BaseModel):
    group_code: str
    name: str
    description: str | None
    is_private: bool
    member_count: int
    place_count: int
    created_at: datetime
    updated_at: datetime


class AdminGroupDetail(AdminGroupListItem):
    created_by_user_code: str
    invite_code: str
    path_place_codes: list[str]
    cover_image_url: str | None
    start_date: str | None
    end_date: str | None


class AdminGroupListResponse(BaseModel):
    items: list[AdminGroupListItem]
    total: int
    page: int
    page_size: int


class PatchGroupBody(BaseModel):
    name: str | None = None
    description: str | None = None
    is_private: bool | None = None


class AdminGroupMemberItem(BaseModel):
    user_code: str
    display_name: str
    email: str
    role: str
    joined_at: datetime


class AdminGroupMemberListResponse(BaseModel):
    items: list[AdminGroupMemberItem]
    total: int


# ── Helpers ────────────────────────────────────────────────────────────────────


def _group_counts(session: SessionDep, group_code: str, path_place_codes: list) -> tuple[int, int]:
    member_count = session.exec(
        select(func.count()).select_from(GroupMember).where(GroupMember.group_code == group_code)
    ).one()
    place_count = len(path_place_codes)
    return member_count, place_count


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("/groups", response_model=AdminGroupListResponse)
def list_groups(
    admin: AdminDep,
    session: SessionDep,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=2000)] = 50,
    search: str | None = None,
):
    stmt = select(Group)
    if search:
        stmt = stmt.where(col(Group.name).ilike(f"%{search}%"))

    total = session.exec(select(func.count()).select_from(stmt.subquery())).one()
    stmt = (
        stmt.order_by(col(Group.created_at).desc()).offset((page - 1) * page_size).limit(page_size)
    )
    groups = session.exec(stmt).all()

    items = []
    for g in groups:
        member_count, place_count = _group_counts(session, g.group_code, g.path_place_codes)
        items.append(
            AdminGroupListItem(
                group_code=g.group_code,
                name=g.name,
                description=g.description,
                is_private=g.is_private,
                member_count=member_count,
                place_count=place_count,
                created_at=g.created_at,
                updated_at=g.updated_at,
            )
        )

    return AdminGroupListResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("/groups/{group_code}", response_model=AdminGroupDetail)
def get_group(group_code: str, admin: AdminDep, session: SessionDep):
    group = session.exec(select(Group).where(Group.group_code == group_code)).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    member_count, place_count = _group_counts(session, group_code, group.path_place_codes)

    return AdminGroupDetail(
        group_code=group.group_code,
        name=group.name,
        description=group.description,
        is_private=group.is_private,
        member_count=member_count,
        place_count=place_count,
        created_at=group.created_at,
        updated_at=group.updated_at,
        created_by_user_code=group.created_by_user_code,
        invite_code=group.invite_code,
        path_place_codes=group.path_place_codes,
        cover_image_url=group.cover_image_url,
        start_date=group.start_date.isoformat() if group.start_date else None,
        end_date=group.end_date.isoformat() if group.end_date else None,
    )


@router.patch("/groups/{group_code}", response_model=AdminGroupDetail)
def patch_group(group_code: str, body: PatchGroupBody, admin: AdminDep, session: SessionDep):
    group = session.exec(select(Group).where(Group.group_code == group_code)).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    changes: dict = {}
    if body.name is not None:
        changes["name"] = {"old": group.name, "new": body.name}
        group.name = body.name
    if body.description is not None:
        changes["description"] = {"old": group.description, "new": body.description}
        group.description = body.description
    if body.is_private is not None:
        changes["is_private"] = {"old": group.is_private, "new": body.is_private}
        group.is_private = body.is_private
    group.updated_at = datetime.now(UTC)

    record_audit(session, admin, "update", "group", group_code, changes or None)
    session.add(group)
    session.commit()
    session.refresh(group)

    member_count, place_count = _group_counts(session, group_code, group.path_place_codes)

    return AdminGroupDetail(
        group_code=group.group_code,
        name=group.name,
        description=group.description,
        is_private=group.is_private,
        member_count=member_count,
        place_count=place_count,
        created_at=group.created_at,
        updated_at=group.updated_at,
        created_by_user_code=group.created_by_user_code,
        invite_code=group.invite_code,
        path_place_codes=group.path_place_codes,
        cover_image_url=group.cover_image_url,
        start_date=group.start_date.isoformat() if group.start_date else None,
        end_date=group.end_date.isoformat() if group.end_date else None,
    )


@router.delete("/groups/{group_code}", status_code=204)
def delete_group(group_code: str, admin: AdminDep, session: SessionDep):
    group = session.exec(select(Group).where(Group.group_code == group_code)).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    record_audit(session, admin, "delete", "group", group_code)
    session.delete(group)
    session.commit()


@router.get("/groups/{group_code}/members", response_model=AdminGroupMemberListResponse)
def list_group_members(group_code: str, admin: AdminDep, session: SessionDep):
    group = session.exec(select(Group).where(Group.group_code == group_code)).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    members = session.exec(select(GroupMember).where(GroupMember.group_code == group_code)).all()

    items = []
    for m in members:
        user = session.exec(select(User).where(User.user_code == m.user_code)).first()
        if user:
            items.append(
                AdminGroupMemberItem(
                    user_code=m.user_code,
                    display_name=user.display_name,
                    email=user.email,
                    role=m.role,
                    joined_at=m.joined_at,
                )
            )

    return AdminGroupMemberListResponse(items=items, total=len(items))


@router.delete("/groups/{group_code}/members/{user_code}", status_code=204)
def remove_group_member(group_code: str, user_code: str, admin: AdminDep, session: SessionDep):
    group = session.exec(select(Group).where(Group.group_code == group_code)).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    member = session.exec(
        select(GroupMember).where(
            GroupMember.group_code == group_code, GroupMember.user_code == user_code
        )
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    session.delete(member)
    session.commit()
