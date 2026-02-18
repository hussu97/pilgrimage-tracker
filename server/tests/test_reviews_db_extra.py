"""
DB-level tests for app/db/reviews.py to cover external reviews and other paths.
"""

from sqlmodel import Session

from app.db import reviews as reviews_db
from app.db.models import Place, User


def _create_place(db_session: Session, code: str) -> None:
    place = Place(
        place_code=code,
        name="Test Place",
        religion="islam",
        place_type="mosque",
        lat=0.0,
        lng=0.0,
        address="Test",
    )
    db_session.add(place)
    db_session.commit()


def _create_user(db_session: Session, code: str, email: str) -> None:
    user = User(
        user_code=code,
        email=email,
        password_hash="hashed",
        display_name="Test User",
    )
    db_session.add(user)
    db_session.commit()


# ── TestExternalReviewsDB ──────────────────────────────────────────────────────


class TestExternalReviewsDB:
    def test_create_external_review(self, db_session):
        _create_place(db_session, "plc_ext001")
        review = reviews_db.create_external_review(
            place_code="plc_ext001",
            author_name="John Doe",
            rating=4,
            text="Great place!",
            review_time=1700000000,
            session=db_session,
        )
        assert review.review_code is not None
        assert review.source == "external"
        assert review.user_code is None
        assert review.author_name == "John Doe"
        assert review.rating == 4

    def test_create_external_review_with_language(self, db_session):
        _create_place(db_session, "plc_ext002")
        review = reviews_db.create_external_review(
            place_code="plc_ext002",
            author_name="Ahmed",
            rating=5,
            text="ممتاز",
            review_time=1700000001,
            session=db_session,
            language="ar",
        )
        assert review.language == "ar"

    def test_upsert_external_reviews_inserts(self, db_session):
        _create_place(db_session, "plc_upsert01")
        reviews_list = [
            {
                "author_name": "Alice",
                "rating": 5,
                "text": "Excellent",
                "time": 100,
                "language": "en",
            },
            {"author_name": "Bob", "rating": 3, "text": "OK", "time": 200, "language": "en"},
        ]
        reviews_db.upsert_external_reviews("plc_upsert01", reviews_list, db_session)

        result = reviews_db.get_reviews_by_place(
            "plc_upsert01", db_session, limit=10, source="external"
        )
        assert len(result) == 2

    def test_upsert_external_reviews_replaces_old(self, db_session):
        _create_place(db_session, "plc_upsert02")
        old_reviews = [
            {"author_name": "Old", "rating": 1, "text": "Bad", "time": 1, "language": "en"},
        ]
        reviews_db.upsert_external_reviews("plc_upsert02", old_reviews, db_session)

        new_reviews = [
            {"author_name": "New", "rating": 5, "text": "Great", "time": 2, "language": "en"},
            {"author_name": "New2", "rating": 4, "text": "Good", "time": 3, "language": "en"},
        ]
        reviews_db.upsert_external_reviews("plc_upsert02", new_reviews, db_session)

        result = reviews_db.get_reviews_by_place(
            "plc_upsert02", db_session, limit=10, source="external"
        )
        assert len(result) == 2
        assert all(r.author_name in ("New", "New2") for r in result)

    def test_upsert_empty_list_clears_reviews(self, db_session):
        _create_place(db_session, "plc_upsert03")
        reviews_db.upsert_external_reviews(
            "plc_upsert03",
            [{"author_name": "X", "rating": 5, "text": "Y", "time": 1, "language": "en"}],
            db_session,
        )
        reviews_db.upsert_external_reviews("plc_upsert03", [], db_session)
        result = reviews_db.get_reviews_by_place(
            "plc_upsert03", db_session, limit=10, source="external"
        )
        assert len(result) == 0

    def test_get_reviews_by_place_with_source_filter(self, db_session):
        _create_place(db_session, "plc_source01")
        _create_user(db_session, "usr_src01", "src01@example.com")
        # Create a user review
        reviews_db.create_review(
            user_code="usr_src01", place_code="plc_source01", rating=5, session=db_session
        )
        # Create an external review
        reviews_db.create_external_review(
            place_code="plc_source01",
            author_name="Ext Author",
            rating=4,
            text="External",
            review_time=0,
            session=db_session,
        )

        user_reviews = reviews_db.get_reviews_by_place(
            "plc_source01", db_session, limit=10, source="user"
        )
        assert all(r.source == "user" for r in user_reviews)
        assert len(user_reviews) == 1

        ext_reviews = reviews_db.get_reviews_by_place(
            "plc_source01", db_session, limit=10, source="external"
        )
        assert all(r.source == "external" for r in ext_reviews)
        assert len(ext_reviews) == 1

    def test_delete_review_returns_false_for_nonexistent(self, db_session):
        result = reviews_db.delete_review("rev_nonexistent", db_session)
        assert result is False

    def test_count_reviews_by_user(self, db_session):
        _create_place(db_session, "plc_cnt001")
        _create_user(db_session, "usr_cnt01", "cnt01@example.com")
        reviews_db.create_review(
            user_code="usr_cnt01", place_code="plc_cnt001", rating=5, session=db_session
        )
        count = reviews_db.count_reviews_by_user("usr_cnt01", db_session)
        assert count == 1

    def test_get_aggregate_ratings_bulk_empty(self, db_session):
        result = reviews_db.get_aggregate_ratings_bulk([], db_session)
        assert result == {}

    def test_get_aggregate_ratings_bulk(self, db_session):
        _create_place(db_session, "plc_bulk01")
        _create_place(db_session, "plc_bulk02")
        _create_user(db_session, "usr_bulk01", "bulk01@example.com")
        reviews_db.create_review("usr_bulk01", "plc_bulk01", 4, db_session)
        reviews_db.create_review("usr_bulk01", "plc_bulk02", 2, db_session)

        result = reviews_db.get_aggregate_ratings_bulk(["plc_bulk01", "plc_bulk02"], db_session)
        assert "plc_bulk01" in result
        assert result["plc_bulk01"]["average"] == 4.0
        assert result["plc_bulk02"]["average"] == 2.0
