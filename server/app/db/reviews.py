"""
In-memory reviews store for local dev.
"""
import secrets
from datetime import datetime
from typing import List, Optional

reviews_by_code: dict = {}
reviews_by_place: dict = {}  # place_code -> list of review_code


class ReviewRow:
    def __init__(
        self,
        review_code: str,
        user_code: str,
        place_code: str,
        rating: int,
        title: Optional[str],
        body: Optional[str],
        created_at: str,
    ):
        self.review_code = review_code
        self.user_code = user_code
        self.place_code = place_code
        self.rating = rating
        self.title = title
        self.body = body
        self.created_at = created_at


def _generate_review_code() -> str:
    return "rev_" + secrets.token_hex(8)


def create_review(user_code: str, place_code: str, rating: int, title: Optional[str] = None, body: Optional[str] = None) -> ReviewRow:
    review_code = _generate_review_code()
    now = datetime.utcnow().isoformat() + "Z"
    row = ReviewRow(
        review_code=review_code,
        user_code=user_code,
        place_code=place_code,
        rating=rating,
        title=title,
        body=body,
        created_at=now,
    )
    reviews_by_code[review_code] = row
    if place_code not in reviews_by_place:
        reviews_by_place[place_code] = []
    reviews_by_place[place_code].append(review_code)
    return row


def get_reviews_by_place(place_code: str, limit: int = 5, offset: int = 0) -> List[ReviewRow]:
    codes = reviews_by_place.get(place_code, [])
    # newest first (we don't store order; use created_at from row)
    rows = [reviews_by_code[c] for c in codes if c in reviews_by_code]
    rows.sort(key=lambda r: r.created_at, reverse=True)
    return rows[offset : offset + limit]


def get_review_by_code(review_code: str) -> Optional[ReviewRow]:
    return reviews_by_code.get(review_code)


def get_aggregate_rating(place_code: str) -> Optional[dict]:
    codes = reviews_by_place.get(place_code, [])
    rows = [reviews_by_code[c] for c in codes if c in reviews_by_code]
    if not rows:
        return None
    avg = sum(r.rating for r in rows) / len(rows)
    return {"average": round(avg * 10) / 10, "count": len(rows)}
