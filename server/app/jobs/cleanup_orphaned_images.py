"""
Cleanup job for orphaned review images.

Deletes review images that:
- Are not attached to any review (review_code IS NULL)
- Were created more than 24 hours ago

Run this job daily via cron or scheduler.
"""
from sqlmodel import Session

from app.db import review_images
from app.db.session import engine


def run_cleanup(max_age_hours: int = 24) -> dict:
    """
    Run the orphaned images cleanup job.

    Args:
        max_age_hours: Maximum age in hours for unattached images before deletion

    Returns:
        dict with count of deleted images
    """
    with Session(engine) as session:
        deleted_count = review_images.cleanup_orphaned_images(
            max_age_hours=max_age_hours,
            session=session,
        )

    return {
        "deleted_count": deleted_count,
        "max_age_hours": max_age_hours,
    }


if __name__ == "__main__":
    # Can be run directly: python -m app.jobs.cleanup_orphaned_images
    result = run_cleanup()
    print(f"Cleanup completed. Deleted {result['deleted_count']} orphaned images.")
