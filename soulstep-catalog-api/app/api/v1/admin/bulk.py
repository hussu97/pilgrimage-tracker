"""Admin — Bulk operations endpoints."""

import random
import string

from fastapi import APIRouter
from pydantic import BaseModel
from sqlmodel import col, select

from app.api.deps import AdminDep
from app.db.models import CheckIn, Group, Place, Review, User
from app.db.session import SessionDep

router = APIRouter()


# ── Helper ─────────────────────────────────────────────────────────────────────


def _gen_code(prefix: str) -> str:
    chars = string.ascii_lowercase + string.digits
    return prefix + "".join(random.choices(chars, k=8))


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
def bulk_deactivate_users(body: BulkUserCodesBody, admin: AdminDep, session: SessionDep):
    users = session.exec(select(User).where(col(User.user_code).in_(body.user_codes))).all()
    for user in users:
        user.is_active = False
    session.commit()
    return BulkResult(affected=len(users))


@router.post("/bulk/users/activate", response_model=BulkResult)
def bulk_activate_users(body: BulkUserCodesBody, admin: AdminDep, session: SessionDep):
    users = session.exec(select(User).where(col(User.user_code).in_(body.user_codes))).all()
    for user in users:
        user.is_active = True
    session.commit()
    return BulkResult(affected=len(users))


@router.post("/bulk/reviews/flag", response_model=BulkResult)
def bulk_flag_reviews(body: BulkReviewCodesBody, admin: AdminDep, session: SessionDep):
    reviews = session.exec(
        select(Review).where(col(Review.review_code).in_(body.review_codes))
    ).all()
    for review in reviews:
        review.is_flagged = True
    session.commit()
    return BulkResult(affected=len(reviews))


@router.post("/bulk/reviews/unflag", response_model=BulkResult)
def bulk_unflag_reviews(body: BulkReviewCodesBody, admin: AdminDep, session: SessionDep):
    reviews = session.exec(
        select(Review).where(col(Review.review_code).in_(body.review_codes))
    ).all()
    for review in reviews:
        review.is_flagged = False
    session.commit()
    return BulkResult(affected=len(reviews))


@router.post("/bulk/reviews/delete", response_model=BulkResult)
def bulk_delete_reviews(body: BulkReviewCodesBody, admin: AdminDep, session: SessionDep):
    reviews = session.exec(
        select(Review).where(col(Review.review_code).in_(body.review_codes))
    ).all()
    count = len(reviews)
    for review in reviews:
        session.delete(review)
    session.commit()
    return BulkResult(affected=count)


@router.post("/bulk/check-ins/delete", response_model=BulkResult)
def bulk_delete_check_ins(body: BulkCheckInCodesBody, admin: AdminDep, session: SessionDep):
    check_ins = session.exec(
        select(CheckIn).where(col(CheckIn.check_in_code).in_(body.check_in_codes))
    ).all()
    count = len(check_ins)
    for ci in check_ins:
        session.delete(ci)
    session.commit()
    return BulkResult(affected=count)


@router.post("/bulk/places/delete", response_model=BulkResult)
def bulk_delete_places(body: BulkPlaceCodesBody, admin: AdminDep, session: SessionDep):
    places = session.exec(select(Place).where(col(Place.place_code).in_(body.place_codes))).all()
    count = len(places)
    for place in places:
        session.delete(place)
    session.commit()
    return BulkResult(affected=count)


@router.post("/bulk/groups/delete", response_model=BulkResult)
def bulk_delete_groups(body: BulkGroupCodesBody, admin: AdminDep, session: SessionDep):
    groups = session.exec(select(Group).where(col(Group.group_code).in_(body.group_codes))).all()
    count = len(groups)
    for group in groups:
        session.delete(group)
    session.commit()
    return BulkResult(affected=count)
