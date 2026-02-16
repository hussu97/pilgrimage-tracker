"""
Timezone utilities for handling place-specific time calculations.

This module provides offset-based timezone utilities without requiring external dependencies.
Uses Python's stdlib datetime module exclusively.
"""

from datetime import datetime, timedelta, timezone


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
    return datetime.now(timezone.utc).strftime("%A")


def format_utc_offset(minutes: int) -> str:
    """Format offset for display.

    Args:
        minutes: UTC offset in minutes

    Returns:
        Formatted string (e.g., 'UTC+4', 'UTC+5:30', 'UTC-5')

    Examples:
        >>> format_utc_offset(240)
        'UTC+4'
        >>> format_utc_offset(330)
        'UTC+5:30'
        >>> format_utc_offset(-300)
        'UTC-5'
    """
    sign = "+" if minutes >= 0 else "-"
    total = abs(minutes)
    h, m = divmod(total, 60)
    return f"UTC{sign}{h}" if m == 0 else f"UTC{sign}{h}:{m:02d}"
