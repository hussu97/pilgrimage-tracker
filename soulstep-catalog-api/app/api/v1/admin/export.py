"""Admin — Data export endpoints (streaming CSV / JSON)."""

import csv
import io
import json
from typing import Annotated

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from sqlmodel import select

from app.api.deps import AdminDep
from app.db.models import CheckIn, Group, GroupMember, Place, Review, User
from app.db.session import SessionDep

router = APIRouter()


# ── CSV helper ────────────────────────────────────────────────────────────────


def _csv_stream(headers: list[str], rows: list[list]):
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(headers)
    yield buf.getvalue()
    for row in rows:
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(row)
        yield buf.getvalue()


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("/export/users")
def export_users(
    admin: AdminDep,
    session: SessionDep,
    format: Annotated[str, Query()] = "csv",
):
    users = session.exec(select(User).order_by(User.created_at)).all()

    if format == "json":
        data = [
            {
                "user_code": u.user_code,
                "email": u.email,
                "display_name": u.display_name,
                "is_active": u.is_active,
                "is_admin": u.is_admin,
                "created_at": u.created_at.isoformat(),
            }
            for u in users
        ]
        return StreamingResponse(
            iter([json.dumps(data)]),
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=users.json"},
        )

    headers = ["user_code", "email", "display_name", "is_active", "is_admin", "created_at"]
    rows = [
        [u.user_code, u.email, u.display_name, u.is_active, u.is_admin, u.created_at.isoformat()]
        for u in users
    ]
    return StreamingResponse(
        _csv_stream(headers, rows),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=users.csv"},
    )


@router.get("/export/places")
def export_places(
    admin: AdminDep,
    session: SessionDep,
    format: Annotated[str, Query()] = "csv",
):
    places = session.exec(select(Place).order_by(Place.created_at)).all()

    if format == "json":
        data = [
            {
                "place_code": p.place_code,
                "name": p.name,
                "religion": p.religion,
                "place_type": p.place_type,
                "lat": p.lat,
                "lng": p.lng,
                "address": p.address,
                "created_at": p.created_at.isoformat(),
            }
            for p in places
        ]
        return StreamingResponse(
            iter([json.dumps(data)]),
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=places.json"},
        )

    headers = [
        "place_code",
        "name",
        "religion",
        "place_type",
        "lat",
        "lng",
        "address",
        "created_at",
    ]
    rows = [
        [
            p.place_code,
            p.name,
            p.religion,
            p.place_type,
            p.lat,
            p.lng,
            p.address,
            p.created_at.isoformat(),
        ]
        for p in places
    ]
    return StreamingResponse(
        _csv_stream(headers, rows),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=places.csv"},
    )


@router.get("/export/reviews")
def export_reviews(
    admin: AdminDep,
    session: SessionDep,
    format: Annotated[str, Query()] = "csv",
):
    reviews = session.exec(select(Review).order_by(Review.created_at)).all()

    if format == "json":
        data = [
            {
                "review_code": r.review_code,
                "user_code": r.user_code,
                "place_code": r.place_code,
                "rating": r.rating,
                "title": r.title,
                "body": r.body,
                "is_flagged": r.is_flagged,
                "created_at": r.created_at.isoformat(),
            }
            for r in reviews
        ]
        return StreamingResponse(
            iter([json.dumps(data)]),
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=reviews.json"},
        )

    headers = [
        "review_code",
        "user_code",
        "place_code",
        "rating",
        "title",
        "is_flagged",
        "created_at",
    ]
    rows = [
        [
            r.review_code,
            r.user_code,
            r.place_code,
            r.rating,
            r.title,
            r.is_flagged,
            r.created_at.isoformat(),
        ]
        for r in reviews
    ]
    return StreamingResponse(
        _csv_stream(headers, rows),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=reviews.csv"},
    )


@router.get("/export/check-ins")
def export_check_ins(
    admin: AdminDep,
    session: SessionDep,
    format: Annotated[str, Query()] = "csv",
):
    check_ins = session.exec(select(CheckIn).order_by(CheckIn.checked_in_at)).all()

    if format == "json":
        data = [
            {
                "check_in_code": ci.check_in_code,
                "user_code": ci.user_code,
                "place_code": ci.place_code,
                "group_code": ci.group_code,
                "checked_in_at": ci.checked_in_at.isoformat(),
            }
            for ci in check_ins
        ]
        return StreamingResponse(
            iter([json.dumps(data)]),
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=check-ins.json"},
        )

    headers = ["check_in_code", "user_code", "place_code", "group_code", "checked_in_at"]
    rows = [
        [ci.check_in_code, ci.user_code, ci.place_code, ci.group_code, ci.checked_in_at.isoformat()]
        for ci in check_ins
    ]
    return StreamingResponse(
        _csv_stream(headers, rows),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=check-ins.csv"},
    )


@router.get("/export/groups")
def export_groups(
    admin: AdminDep,
    session: SessionDep,
    format: Annotated[str, Query()] = "csv",
):
    groups = session.exec(select(Group).order_by(Group.created_at)).all()

    # Get member counts
    member_counts: dict[str, int] = {}
    for g in groups:
        count = session.exec(
            select(GroupMember).where(GroupMember.group_code == g.group_code)
        ).all()
        member_counts[g.group_code] = len(count)

    if format == "json":
        data = [
            {
                "group_code": g.group_code,
                "name": g.name,
                "description": g.description,
                "is_private": g.is_private,
                "member_count": member_counts.get(g.group_code, 0),
                "created_at": g.created_at.isoformat(),
            }
            for g in groups
        ]
        return StreamingResponse(
            iter([json.dumps(data)]),
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=groups.json"},
        )

    headers = ["group_code", "name", "is_private", "member_count", "created_at"]
    rows = [
        [
            g.group_code,
            g.name,
            g.is_private,
            member_counts.get(g.group_code, 0),
            g.created_at.isoformat(),
        ]
        for g in groups
    ]
    return StreamingResponse(
        _csv_stream(headers, rows),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=groups.csv"},
    )
