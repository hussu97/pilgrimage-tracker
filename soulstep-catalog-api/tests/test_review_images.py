"""
DB-level tests for app/db/review_images.py.

Uses db_session fixture directly.
Creates User and Place rows required by foreign keys, then creates reviews/images.
"""

from datetime import UTC, datetime, timedelta

import pytest
from sqlmodel import Session

from app.db import review_images as review_images_db
from app.db.models import Place, Review, ReviewImage, User


def _create_user(db_session: Session, suffix="001") -> str:
    user_code = f"usr_{suffix}"
    user = User(
        user_code=user_code,
        email=f"user{suffix}@example.com",
        password_hash="hashed",
        display_name=f"User {suffix}",
    )
    db_session.add(user)
    db_session.commit()
    return user_code


def _create_place(db_session: Session, suffix="001") -> str:
    place_code = f"plc_ri{suffix}"
    place = Place(
        place_code=place_code,
        name="Review Test Place",
        religion="islam",
        place_type="mosque",
        lat=25.0,
        lng=55.0,
        address="Test Address",
    )
    db_session.add(place)
    db_session.commit()
    return place_code


def _create_review(db_session: Session, user_code: str, place_code: str, suffix="001") -> str:
    review_code = f"rev_{suffix}"
    review = Review(
        review_code=review_code,
        user_code=user_code,
        place_code=place_code,
        rating=5,
    )
    db_session.add(review)
    db_session.commit()
    return review_code


def _create_image(db_session: Session, user_code: str, review_code=None) -> ReviewImage:
    return review_images_db.create_review_image(
        uploaded_by_user_code=user_code,
        blob_data=b"\xff\xd8\xff\xe0test",
        mime_type="image/jpeg",
        file_size=1024,
        width=800,
        height=600,
        session=db_session,
    )


# ── TestAttachImages ───────────────────────────────────────────────────────────


class TestAttachImages:
    def test_attach_images_links_to_review(self, db_session):
        user_code = _create_user(db_session, "a01")
        place_code = _create_place(db_session, "a01")
        review_code = _create_review(db_session, user_code, place_code, "a01")

        img = _create_image(db_session, user_code)
        review_images_db.attach_images_to_review(
            review_code, [img.id], user_code, session=db_session
        )

        db_session.refresh(img)
        assert img.review_code == review_code

    def test_attach_wrong_user_raises(self, db_session):
        user1 = _create_user(db_session, "b01")
        user2 = _create_user(db_session, "b02")
        place_code = _create_place(db_session, "b01")
        review_code = _create_review(db_session, user1, place_code, "b01")

        img = _create_image(db_session, user1)

        with pytest.raises(ValueError, match="not uploaded by user"):
            review_images_db.attach_images_to_review(
                review_code, [img.id], user2, session=db_session
            )

    def test_attach_nonexistent_image_raises(self, db_session):
        user_code = _create_user(db_session, "c01")
        place_code = _create_place(db_session, "c01")
        review_code = _create_review(db_session, user_code, place_code, "c01")

        with pytest.raises(ValueError, match="not found"):
            review_images_db.attach_images_to_review(
                review_code, [99999], user_code, session=db_session
            )

    def test_session_required(self):
        with pytest.raises(ValueError, match="Session is required"):
            review_images_db.attach_images_to_review("rev_x", [1], "usr_x", session=None)


# ── TestGetReviewImages ────────────────────────────────────────────────────────


class TestGetReviewImages:
    def test_returns_images_for_review(self, db_session):
        user_code = _create_user(db_session, "d01")
        place_code = _create_place(db_session, "d01")
        review_code = _create_review(db_session, user_code, place_code, "d01")

        img = _create_image(db_session, user_code)
        review_images_db.attach_images_to_review(
            review_code, [img.id], user_code, session=db_session
        )

        result = review_images_db.get_review_images(review_code, session=db_session)
        assert len(result) == 1
        assert "url" in result[0]
        assert "id" in result[0]
        assert result[0]["width"] == 800
        assert result[0]["height"] == 600

    def test_returns_empty_when_no_images(self, db_session):
        user_code = _create_user(db_session, "e01")
        place_code = _create_place(db_session, "e01")
        review_code = _create_review(db_session, user_code, place_code, "e01")

        result = review_images_db.get_review_images(review_code, session=db_session)
        assert result == []

    def test_url_format_correct(self, db_session):
        user_code = _create_user(db_session, "f01")
        place_code = _create_place(db_session, "f01")
        review_code = _create_review(db_session, user_code, place_code, "f01")

        img = _create_image(db_session, user_code)
        review_images_db.attach_images_to_review(
            review_code, [img.id], user_code, session=db_session
        )

        result = review_images_db.get_review_images(review_code, session=db_session)
        assert result[0]["url"].startswith("/api/v1/reviews/images/")

    def test_gcs_url_returned_when_set(self, db_session):
        user_code = _create_user(db_session, "f02")
        place_code = _create_place(db_session, "f02")
        review_code = _create_review(db_session, user_code, place_code, "f02")

        gcs_url = "https://storage.googleapis.com/bucket/images/reviews/abc.jpg"
        img = review_images_db.create_review_image(
            uploaded_by_user_code=user_code,
            blob_data=None,
            mime_type="image/jpeg",
            file_size=1024,
            width=800,
            height=600,
            gcs_url=gcs_url,
            session=db_session,
        )
        review_images_db.attach_images_to_review(
            review_code, [img.id], user_code, session=db_session
        )

        result = review_images_db.get_review_images(review_code, session=db_session)
        assert result[0]["url"] == gcs_url

    def test_create_with_nullable_blob_data(self, db_session):
        user_code = _create_user(db_session, "f03")
        img = review_images_db.create_review_image(
            uploaded_by_user_code=user_code,
            blob_data=None,
            mime_type="image/jpeg",
            file_size=512,
            width=400,
            height=300,
            session=db_session,
        )
        assert img.id is not None
        assert img.blob_data is None

    def test_session_required(self):
        with pytest.raises(ValueError, match="Session is required"):
            review_images_db.get_review_images("rev_x", session=None)


# ── TestOrphanCleanup ──────────────────────────────────────────────────────────


class TestOrphanCleanup:
    def test_cleanup_removes_old_unattached_images(self, db_session):
        user_code = _create_user(db_session, "g01")

        # Create an unattached image with an old created_at
        img = ReviewImage(
            review_code=None,
            uploaded_by_user_code=user_code,
            blob_data=b"old",
            mime_type="image/jpeg",
            file_size=100,
            width=100,
            height=100,
            created_at=datetime.now(UTC) - timedelta(hours=48),
        )
        db_session.add(img)
        db_session.commit()

        count = review_images_db.cleanup_orphaned_images(max_age_hours=24, session=db_session)
        assert count == 1

    def test_cleanup_keeps_recent_unattached_images(self, db_session):
        user_code = _create_user(db_session, "h01")

        # Create a recently uploaded unattached image (should NOT be cleaned up)
        _create_image(db_session, user_code)

        count = review_images_db.cleanup_orphaned_images(max_age_hours=24, session=db_session)
        assert count == 0

    def test_cleanup_keeps_attached_images(self, db_session):
        user_code = _create_user(db_session, "i01")
        place_code = _create_place(db_session, "i01")
        review_code = _create_review(db_session, user_code, place_code, "i01")

        # Create old but attached image
        img = ReviewImage(
            review_code=review_code,
            uploaded_by_user_code=user_code,
            blob_data=b"old_attached",
            mime_type="image/jpeg",
            file_size=100,
            width=100,
            height=100,
            created_at=datetime.now(UTC) - timedelta(hours=48),
        )
        db_session.add(img)
        db_session.commit()

        count = review_images_db.cleanup_orphaned_images(max_age_hours=24, session=db_session)
        assert count == 0

    def test_cleanup_session_required(self):
        with pytest.raises(ValueError, match="Session is required"):
            review_images_db.cleanup_orphaned_images(session=None)
