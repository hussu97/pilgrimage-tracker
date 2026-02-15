import secrets
from datetime import datetime
from typing import List, Optional

from sqlmodel import Session, select, func
from app.db.models import Review
from app.db.session import engine


def _generate_review_code() -> str:
    return "rev_" + secrets.token_hex(8)


def create_review(
    user_code: str,
    place_code: str,
    rating: int,
    title: Optional[str] = None,
    body: Optional[str] = None,
    is_anonymous: bool = False,
    photo_urls: Optional[List[str]] = None,
) -> Review:
    with Session(engine) as session:
        review_code = _generate_review_code()
        review = Review(
            review_code=review_code,
            user_code=user_code,
            place_code=place_code,
            rating=rating,
            title=title,
            body=body,
            is_anonymous=is_anonymous,
            photo_urls=photo_urls or [],
        )
        session.add(review)
        session.commit()
        session.refresh(review)
        return review


def get_reviews_by_place(place_code: str, limit: int = 5, offset: int = 0) -> List[Review]:
    with Session(engine) as session:
        statement = select(Review).where(Review.place_code == place_code).order_by(Review.created_at.desc()).offset(offset).limit(limit)
        return session.exec(statement).all()


def get_review_by_code(review_code: str) -> Optional[Review]:
    with Session(engine) as session:
        return session.exec(select(Review).where(Review.review_code == review_code)).first()


def get_aggregate_rating(place_code: str) -> Optional[dict]:
    with Session(engine) as session:
        # We can use func.avg and func.count for efficiency
        statement = select(func.avg(Review.rating), func.count(Review.id)).where(Review.place_code == place_code)
        avg, count = session.exec(statement).first()
        if count == 0:
            return None
        return {"average": round(avg * 10) / 10, "count": count}


def count_reviews_by_user(user_code: str) -> int:
    with Session(engine) as session:
        statement = select(func.count(Review.id)).where(Review.user_code == user_code)
        return session.exec(statement).one()
