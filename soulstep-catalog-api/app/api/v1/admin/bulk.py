"""Admin — Bulk operations endpoints."""

from datetime import UTC, datetime

from fastapi import APIRouter, Request
from pydantic import BaseModel
from sqlmodel import col, select

from app.api.deps import AdminDep
from app.api.v1.admin import admin_limiter
from app.db.models import CheckIn, Group, Place, Review, User
from app.db.session import SessionDep

router = APIRouter()


# ── Schemas ────────────────────────────────────────────────────────────────────


class BulkUserCodesBody(BaseModel):
    user_codes: list[str]


class BulkPlaceCodesBody(BaseModel):
    place_codes: list[str]


class BulkReviewCodesBody(BaseModel):
    review_codes: list[str]


class BulkCheckInCodesBody(BaseModel):
    check_in_codes: list[str]


class BulkGroupCodesBody(BaseModel):
    group_codes: list[str]


class BulkResult(BaseModel):
    affected: int


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.post("/bulk/users/deactivate", response_model=BulkResult)
@admin_limiter.limit("10/minute")
def bulk_deactivate_users(
    request: Request, body: BulkUserCodesBody, admin: AdminDep, session: SessionDep
):
    users = session.exec(select(User).where(col(User.user_code).in_(body.user_codes))).all()
    for user in users:
        user.is_active = False
    session.commit()
    return BulkResult(affected=len(users))


@router.post("/bulk/users/activate", response_model=BulkResult)
@admin_limiter.limit("10/minute")
def bulk_activate_users(
    request: Request, body: BulkUserCodesBody, admin: AdminDep, session: SessionDep
):
    users = session.exec(select(User).where(col(User.user_code).in_(body.user_codes))).all()
    for user in users:
        user.is_active = True
    session.commit()
    return BulkResult(affected=len(users))


@router.post("/bulk/reviews/flag", response_model=BulkResult)
@admin_limiter.limit("10/minute")
def bulk_flag_reviews(
    request: Request, body: BulkReviewCodesBody, admin: AdminDep, session: SessionDep
):
    reviews = session.exec(
        select(Review).where(col(Review.review_code).in_(body.review_codes))
    ).all()
    for review in reviews:
        review.is_flagged = True
    session.commit()
    return BulkResult(affected=len(reviews))


@router.post("/bulk/reviews/unflag", response_model=BulkResult)
@admin_limiter.limit("10/minute")
def bulk_unflag_reviews(
    request: Request, body: BulkReviewCodesBody, admin: AdminDep, session: SessionDep
):
    reviews = session.exec(
        select(Review).where(col(Review.review_code).in_(body.review_codes))
    ).all()
    for review in reviews:
        review.is_flagged = False
    session.commit()
    return BulkResult(affected=len(reviews))


@router.post("/bulk/reviews/delete", response_model=BulkResult)
@admin_limiter.limit("10/minute")
def bulk_delete_reviews(
    request: Request, body: BulkReviewCodesBody, admin: AdminDep, session: SessionDep
):
    now = datetime.now(UTC)
    reviews = session.exec(
        select(Review).where(col(Review.review_code).in_(body.review_codes))
    ).all()
    count = len(reviews)
    for review in reviews:
        review.deleted_at = now
    session.commit()
    return BulkResult(affected=count)


@router.post("/bulk/check-ins/delete", response_model=BulkResult)
@admin_limiter.limit("10/minute")
def bulk_delete_check_ins(
    request: Request, body: BulkCheckInCodesBody, admin: AdminDep, session: SessionDep
):
    now = datetime.now(UTC)
    check_ins = session.exec(
        select(CheckIn).where(col(CheckIn.check_in_code).in_(body.check_in_codes))
    ).all()
    count = len(check_ins)
    for ci in check_ins:
        ci.deleted_at = now
    session.commit()
    return BulkResult(affected=count)


@router.post("/bulk/places/delete", response_model=BulkResult)
@admin_limiter.limit("10/minute")
def bulk_delete_places(
    request: Request, body: BulkPlaceCodesBody, admin: AdminDep, session: SessionDep
):
    places = session.exec(select(Place).where(col(Place.place_code).in_(body.place_codes))).all()
    count = len(places)
    for place in places:
        session.delete(place)
    session.commit()
    return BulkResult(affected=count)


@router.post("/bulk/groups/delete", response_model=BulkResult)
@admin_limiter.limit("10/minute")
def bulk_delete_groups(
    request: Request, body: BulkGroupCodesBody, admin: AdminDep, session: SessionDep
):
    groups = session.exec(select(Group).where(col(Group.group_code).in_(body.group_codes))).all()
    count = len(groups)
    for group in groups:
        session.delete(group)
    session.commit()
    return BulkResult(affected=count)
