"""
One-time migration script to backfill timezone data for existing places.

This script:
1. Sets utc_offset_minutes = 240 (UTC+4) for all existing UAE places
2. Converts stored UTC opening hours back to local time by adding 4 hours
3. Updates the database

Run this script once after deploying the timezone handling changes.
"""

import logging
import os
import sys
from datetime import datetime, timedelta
from typing import Any

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from sqlmodel import Session, create_engine, select  # noqa: E402

from app.db.models import Place  # noqa: E402

logger = logging.getLogger(__name__)


def parse_time_range(time_str: str) -> tuple[str | None, str | None]:
    """Parse a time range string like '09:00-17:00' into start and end times."""
    if not time_str or time_str.lower() in ["closed", "open 24 hours"]:
        return None, None

    if "-" in time_str:
        parts = time_str.split("-")
        if len(parts) == 2:
            return parts[0].strip(), parts[1].strip()

    return None, None


def add_hours_to_time(time_str: str, hours: int) -> str:
    """Add hours to a time string in HH:MM format.

    Args:
        time_str: Time in 24h format (e.g., '09:00')
        hours: Number of hours to add

    Returns:
        New time in 24h format
    """
    try:
        # Parse the time
        hour, minute = map(int, time_str.split(":"))

        # Create a datetime object (date doesn't matter, just for calculation)
        dt = datetime(2000, 1, 1, hour, minute)

        # Add hours
        new_dt = dt + timedelta(hours=hours)

        # Return formatted time
        return new_dt.strftime("%H:%M")
    except (ValueError, AttributeError):
        # If parsing fails, return original
        return time_str


def convert_utc_to_local_hours(opening_hours: dict[str, Any], offset_hours: int) -> dict[str, Any]:
    """Convert UTC opening hours to local time by adding offset hours.

    Args:
        opening_hours: Dictionary with day names as keys and time ranges as values
        offset_hours: Number of hours to add (e.g., 4 for UTC+4)

    Returns:
        Updated opening hours dictionary in local time
    """
    if not opening_hours:
        return opening_hours

    converted = {}

    for day, hours in opening_hours.items():
        if not hours or hours.lower() in ["closed", "open 24 hours"]:
            converted[day] = hours
            continue

        start, end = parse_time_range(hours)
        if start and end:
            new_start = add_hours_to_time(start, offset_hours)
            new_end = add_hours_to_time(end, offset_hours)
            converted[day] = f"{new_start}-{new_end}"
        else:
            # Keep as-is if we can't parse
            converted[day] = hours

    return converted


def backfill_timezones(database_url: str):
    """Run the timezone backfill migration.

    Args:
        database_url: PostgreSQL database connection URL
    """
    engine = create_engine(database_url)

    with Session(engine) as session:
        # Query all places without timezone data
        statement = select(Place).where(Place.utc_offset_minutes.is_(None))
        places = session.exec(statement).all()

        logger.info("Found %d places without timezone data", len(places))

        updated_count = 0

        for place in places:
            # Assume all existing places are in UAE (UTC+4)
            # This is based on the project context
            place.utc_offset_minutes = 240  # UTC+4

            # Convert opening hours from UTC to local time
            if place.opening_hours:
                place.opening_hours = convert_utc_to_local_hours(place.opening_hours, 4)

            session.add(place)
            updated_count += 1

            if updated_count % 100 == 0:
                logger.info("Processed %d places...", updated_count)

        # Commit all changes
        session.commit()
        logger.info("Successfully updated %d places", updated_count)


if __name__ == "__main__":
    # Get database URL from environment
    database_url = os.getenv("DATABASE_URL")

    if not database_url:
        logger.error("DATABASE_URL environment variable not set")
        sys.exit(1)

    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    logger.info("Starting timezone backfill migration...")
    backfill_timezones(database_url)
    logger.info("Migration complete!")
