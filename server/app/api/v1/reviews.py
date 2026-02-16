from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_current_user
from app.db import reviews as reviews_db
from app.models.schemas import ReviewUpdateBody

router = APIRouter()


@router.patch("/{review_code}")
def update_review(
    review_code: str,
    body: ReviewUpdateBody,
    user: Annotated[Any, Depends(get_current_user)],
):
    row = reviews_db.get_review_by_code(review_code)
    if not row:
        raise HTTPException(status_code=404, detail="Review not found")
    if row.user_code != user.user_code:
        raise HTTPException(status_code=403, detail="Not the author")
    if body.rating is not None and not (1 <= body.rating <= 5):
        raise HTTPException(status_code=400, detail="Rating must be 1-5")
    if body.rating is not None:
        row.rating = body.rating
    if body.title is not None:
        row.title = body.title
    if body.body is not None:
        row.body = body.body
    return {"review_code": row.review_code, "rating": row.rating, "title": row.title, "body": row.body, "created_at": row.created_at}


@router.delete("/{review_code}")
def delete_review(
    review_code: str,
    user: Annotated[Any, Depends(get_current_user)],
):
    row = reviews_db.get_review_by_code(review_code)
    if not row:
        raise HTTPException(status_code=404, detail="Review not found")
    if row.user_code != user.user_code:
        raise HTTPException(status_code=403, detail="Not the author")

    deleted = reviews_db.delete_review(review_code)
    if not deleted:
        raise HTTPException(status_code=500, detail="Failed to delete review")

    return {"ok": True}
