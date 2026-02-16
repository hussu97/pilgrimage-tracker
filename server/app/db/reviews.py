import secrets
from datetime import datetime
from typing import Dict, List, Optional

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


def get_reviews_by_place(
    place_code: str,
    limit: int = 5,
    offset: int = 0,
    source: Optional[str] = None,
) -> List[Review]:
    """Get reviews for a place. Optionally filter by source ('user' or 'external')."""
    with Session(engine) as session:
        statement = select(Review).where(Review.place_code == place_code)
        if source:
            statement = statement.where(Review.source == source)
        statement = statement.order_by(Review.created_at.desc()).offset(offset).limit(limit)
        return session.exec(statement).all()


def get_review_by_code(review_code: str) -> Optional[Review]:
    with Session(engine) as session:
        return session.exec(select(Review).where(Review.review_code == review_code)).first()


def get_aggregate_ratings_bulk(place_codes: List[str], session: Session) -> Dict[str, dict]:
    """
    Bulk fetch aggregate ratings for multiple places in a single query.
    Returns dict mapping place_code -> {average, count}
    """
    if not place_codes:
        return {}

    statement = (
        select(
            Review.place_code,
            func.avg(Review.rating).label('avg_rating'),
            func.count(Review.id).label('total_ratings')
        )
        .where(Review.place_code.in_(place_codes))
        .group_by(Review.place_code)
    )

    results = session.exec(statement).all()

    return {
        r.place_code: {
            "average": round(r.avg_rating * 10) / 10 if r.avg_rating else 0.0,
            "count": r.total_ratings
        }
        for r in results
    }


def get_aggregate_rating(place_code: str, session: Session) -> Optional[dict]:
    """Fetch aggregate rating for a single place. Requires session parameter."""
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


def create_external_review(
    place_code: str,
    author_name: str,
    rating: int,
    text: str,
    review_time: int,
    language: str = "en",
) -> Review:
    """Create a review from external sources with source='external'."""
    with Session(engine) as session:
        review_code = _generate_review_code()
        review = Review(
            review_code=review_code,
            user_code=None,  # No user for external reviews
            place_code=place_code,
            rating=rating,
            body=text,
            source="external",
            author_name=author_name,
            review_time=review_time,
            language=language,
        )
        session.add(review)
        session.commit()
        session.refresh(review)
        return review


def delete_review(review_code: str) -> bool:
    """Delete a review by code. Returns True if deleted, False if not found."""
    from app.db.models import ReviewImage
    with Session(engine) as session:
        review = session.exec(select(Review).where(Review.review_code == review_code)).first()
        if not review:
            return False

        # Delete associated images
        images = session.exec(select(ReviewImage).where(ReviewImage.review_code == review_code)).all()
        for img in images:
            session.delete(img)

        session.delete(review)
        session.commit()
        return True


def upsert_external_reviews(place_code: str, reviews_list: List[dict]) -> None:
    """Delete existing external reviews for place and insert new ones."""
    with Session(engine) as session:
        # Delete existing external reviews
        stmt = select(Review).where(
            Review.place_code == place_code,
            Review.source == "external"
        )
        existing = session.exec(stmt).all()
        for review in existing:
            session.delete(review)

        # Insert new external reviews
        for r in reviews_list:
            review_code = _generate_review_code()
            review = Review(
                review_code=review_code,
                user_code=None,
                place_code=place_code,
                rating=r.get("rating", 0),
                body=r.get("text", ""),
                source="external",
                author_name=r.get("author_name", ""),
                review_time=r.get("time", 0),
                language=r.get("language", "en"),
            )
            session.add(review)

        session.commit()
