"""CRUD operations for ReviewImage model."""

from datetime import UTC, datetime, timedelta

from sqlmodel import Session, select

from app.db.models import ReviewImage


def create_review_image(
    uploaded_by_user_code: str,
    blob_data: bytes | None,
    mime_type: str,
    file_size: int,
    width: int,
    height: int,
    display_order: int = 0,
    gcs_url: str | None = None,
    session: Session = None,
) -> ReviewImage:
    """
    Create a review image (not yet attached to a review).
    Returns the created image with ID and metadata.
    """
    if session is None:
        raise ValueError("Session is required")

    image = ReviewImage(
        review_code=None,  # Not attached yet
        uploaded_by_user_code=uploaded_by_user_code,
        blob_data=blob_data,
        gcs_url=gcs_url,
        mime_type=mime_type,
        file_size=file_size,
        width=width,
        height=height,
        display_order=display_order,
    )
    session.add(image)
    session.commit()
    session.refresh(image)
    return image


def attach_images_to_review(
    review_code: str,
    image_ids: list[int],
    user_code: str,
    session: Session = None,
) -> None:
    """
    Attach uploaded images to a review.
    Validates that all images were uploaded by the same user.
    Raises ValueError if validation fails.
    """
    if session is None:
        raise ValueError("Session is required")

    for image_id in image_ids:
        image = session.get(ReviewImage, image_id)
        if image is None:
            raise ValueError(f"Image {image_id} not found")

        # Validate ownership
        if image.uploaded_by_user_code != user_code:
            raise ValueError(f"Image {image_id} was not uploaded by user {user_code}")

        # Check if already attached to a different review
        if image.review_code is not None and image.review_code != review_code:
            raise ValueError(f"Image {image_id} is already attached to review {image.review_code}")

        # Attach to review
        image.review_code = review_code
        image.attached_at = datetime.now(UTC)
        session.add(image)

    session.commit()


def get_review_images(review_code: str, session: Session = None) -> list[dict]:
    """
    Get all images for a review.
    Returns list of dicts with id, url, width, height, display_order.
    """
    if session is None:
        raise ValueError("Session is required")

    stmt = (
        select(ReviewImage)
        .where(ReviewImage.review_code == review_code)
        .order_by(ReviewImage.display_order, ReviewImage.id)
    )
    images = session.exec(stmt).all()

    return [
        {
            "id": img.id,
            "url": img.gcs_url if img.gcs_url else f"/api/v1/reviews/images/{img.id}",
            "width": img.width,
            "height": img.height,
            "display_order": img.display_order,
        }
        for img in images
    ]


def get_review_images_bulk(
    review_codes: list[str], session: Session = None
) -> dict[str, list[dict]]:
    """
    Batch-fetch images for multiple reviews in a single query.

    Returns a dict mapping review_code -> [{"id": ..., "url": ..., ...}, ...].
    """
    if session is None:
        raise ValueError("Session is required")
    if not review_codes:
        return {}

    stmt = (
        select(ReviewImage)
        .where(ReviewImage.review_code.in_(review_codes))
        .order_by(ReviewImage.display_order, ReviewImage.id)
    )
    images = session.exec(stmt).all()

    result: dict[str, list[dict]] = {rc: [] for rc in review_codes}
    for img in images:
        if img.review_code in result:
            result[img.review_code].append(
                {
                    "id": img.id,
                    "url": img.gcs_url if img.gcs_url else f"/api/v1/reviews/images/{img.id}",
                    "width": img.width,
                    "height": img.height,
                    "display_order": img.display_order,
                }
            )
    return result


def get_image_by_id(image_id: int, session: Session = None) -> ReviewImage | None:
    """Get a single review image by ID."""
    if session is None:
        raise ValueError("Session is required")

    return session.get(ReviewImage, image_id)


def cleanup_orphaned_images(max_age_hours: int = 24, session: Session = None) -> int:
    """
    Delete review images that:
    - Are not attached to any review (review_code IS NULL)
    - Were created more than max_age_hours ago

    Returns the number of images deleted.
    """
    if session is None:
        raise ValueError("Session is required")

    cutoff = datetime.now(UTC) - timedelta(hours=max_age_hours)

    stmt = select(ReviewImage).where(
        ReviewImage.review_code.is_(None), ReviewImage.created_at < cutoff
    )
    orphaned = session.exec(stmt).all()

    from app.services.image_storage import get_image_storage, is_gcs_enabled

    count = len(orphaned)
    for img in orphaned:
        if is_gcs_enabled() and img.gcs_url:
            try:
                get_image_storage().delete(img.gcs_url)
            except Exception:
                pass
        session.delete(img)

    session.commit()
    return count
