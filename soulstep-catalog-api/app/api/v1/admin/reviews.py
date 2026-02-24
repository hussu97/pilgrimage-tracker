"""Admin — Reviews management endpoints."""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import col, func, select

from app.api.deps import AdminDep
from app.api.v1.admin.audit_log import record_audit
from app.db.models import Place, Review, User
from app.db.session import SessionDep

router = APIRouter()


# ── Schemas ────────────────────────────────────────────────────────────────────


class AdminReviewListItem(BaseModel):
    review_code: str
    place_code: str
    place_name: str | None
    user_code: str | None
    user_display_name: str | None
    rating: int
    title: str | None
    is_flagged: bool
    source: str
    created_at: datetime


class AdminReviewDetail(AdminReviewListItem):
    body: str | None
    is_anonymous: bool
    author_name: str | None


class AdminReviewListResponse(BaseModel):
    items: list[AdminReviewListItem]
    total: int
    page: int
    page_size: int


class PatchReviewBody(BaseModel):
    title: str | None = None
    body: str | None = None
    is_flagged: bool | None = None


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("/reviews", response_model=AdminReviewListResponse)
def list_reviews(
    admin: AdminDep,
    session: SessionDep,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=2000)] = 50,
    is_flagged: bool | None = None,
    place_code: str | None = None,
    user_code: str | None = None,
    min_rating: Annotated[int | None, Query(ge=1, le=5)] = None,
    max_rating: Annotated[int | None, Query(ge=1, le=5)] = None,
):
    stmt = select(Review)
    if is_flagged is not None:
        stmt = stmt.where(Review.is_flagged == is_flagged)
    if place_code:
        stmt = stmt.where(Review.place_code == place_code)
    if user_code:
        stmt = stmt.where(Review.user_code == user_code)
    if min_rating is not None:
        stmt = stmt.where(Review.rating >= min_rating)
    if max_rating is not None:
        stmt = stmt.where(Review.rating <= max_rating)

    total = session.exec(select(func.count()).select_from(stmt.subquery())).one()
    stmt = (
        stmt.order_by(col(Review.created_at).desc()).offset((page - 1) * page_size).limit(page_size)
    )
    reviews = session.exec(stmt).all()

    items = []
    for r in reviews:
        place = session.exec(select(Place).where(Place.place_code == r.place_code)).first()
        user = None
        if r.user_code:
            user = session.exec(select(User).where(User.user_code == r.user_code)).first()
        items.append(
            AdminReviewListItem(
                review_code=r.review_code,
                place_code=r.place_code,
                place_name=place.name if place else None,
                user_code=r.user_code,
                user_display_name=user.display_name if user else None,
                rating=r.rating,
                title=r.title,
                is_flagged=r.is_flagged,
                source=r.source,
                created_at=r.created_at,
            )
        )

    return AdminReviewListResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("/reviews/{review_code}", response_model=AdminReviewDetail)
def get_review(review_code: str, admin: AdminDep, session: SessionDep):
    review = session.exec(select(Review).where(Review.review_code == review_code)).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    place = session.exec(select(Place).where(Place.place_code == review.place_code)).first()
    user = None
    if review.user_code:
        user = session.exec(select(User).where(User.user_code == review.user_code)).first()

    return AdminReviewDetail(
        review_code=review.review_code,
        place_code=review.place_code,
        place_name=place.name if place else None,
        user_code=review.user_code,
        user_display_name=user.display_name if user else None,
        rating=review.rating,
        title=review.title,
        body=review.body,
        is_flagged=review.is_flagged,
        is_anonymous=review.is_anonymous,
        author_name=review.author_name,
        source=review.source,
        created_at=review.created_at,
    )


@router.patch("/reviews/{review_code}", response_model=AdminReviewDetail)
def patch_review(review_code: str, body: PatchReviewBody, admin: AdminDep, session: SessionDep):
    review = session.exec(select(Review).where(Review.review_code == review_code)).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    changes: dict = {}
    if body.title is not None:
        changes["title"] = {"old": review.title, "new": body.title}
        review.title = body.title
    if body.body is not None:
        changes["body"] = {"old": review.body, "new": body.body}
        review.body = body.body
    if body.is_flagged is not None:
        changes["is_flagged"] = {"old": review.is_flagged, "new": body.is_flagged}
        review.is_flagged = body.is_flagged

    action = (
        "flag"
        if (body.is_flagged is True)
        else ("unflag" if body.is_flagged is False else "update")
    )
    record_audit(session, admin, action, "review", review_code, changes or None)
    session.add(review)
    session.commit()
    session.refresh(review)

    place = session.exec(select(Place).where(Place.place_code == review.place_code)).first()
    user = None
    if review.user_code:
        user = session.exec(select(User).where(User.user_code == review.user_code)).first()

    return AdminReviewDetail(
        review_code=review.review_code,
        place_code=review.place_code,
        place_name=place.name if place else None,
        user_code=review.user_code,
        user_display_name=user.display_name if user else None,
        rating=review.rating,
        title=review.title,
        body=review.body,
        is_flagged=review.is_flagged,
        is_anonymous=review.is_anonymous,
        author_name=review.author_name,
        source=review.source,
        created_at=review.created_at,
    )


@router.delete("/reviews/{review_code}", status_code=204)
def delete_review(review_code: str, admin: AdminDep, session: SessionDep):
    review = session.exec(select(Review).where(Review.review_code == review_code)).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    record_audit(session, admin, "delete", "review", review_code)
    session.delete(review)
    session.commit()
