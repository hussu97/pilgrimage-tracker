"""
Timezone utilities for handling place-specific time calculations.

This module provides offset-based timezone utilities without requiring external dependencies.
Uses Python's stdlib datetime module exclusively.
"""

from datetime import UTC, datetime, timedelta, timezone


def get_local_now(utc_offset_minutes: int) -> datetime:
    """Return current datetime in the place's local timezone.

    Args:
        utc_offset_minutes: UTC offset in minutes (e.g., 240 for UTC+4, 330 for UTC+5:30)

    Returns:
        Current datetime in the specified timezone
    """
    tz = timezone(timedelta(minutes=utc_offset_minutes))
    return datetime.now(tz)


def get_today_name(utc_offset_minutes: int | None) -> str:
    """Return current day name (e.g., 'Monday') in the place's local timezone.

    Args:
        utc_offset_minutes: UTC offset in minutes, or None to use UTC

    Returns:
        Day name string (e.g., 'Monday', 'Tuesday', etc.)
    """
    if utc_offset_minutes is not None:
        return get_local_now(utc_offset_minutes).strftime("%A")
    return datetime.now(UTC).strftime("%A")
