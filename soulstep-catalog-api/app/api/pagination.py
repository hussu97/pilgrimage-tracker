"""Shared pagination utilities for all API endpoints.

Standard pattern: every paginated endpoint accepts `page` (1-indexed) and
`page_size`, and returns `{ items, total, page, page_size }` plus any
endpoint-specific extra fields.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any


def paginate_query(
    total: int,
    page: int,
    page_size: int,
    items: Sequence[Any],
    **extra: Any,
) -> dict[str, Any]:
    """Build a standard paginated response dict.

    Returns:
        ``{"items": [...], "total": N, "page": N, "page_size": N, ...extra}``
    """
    return {
        "items": list(items),
        "total": total,
        "page": page,
        "page_size": page_size,
        **extra,
    }


def offset_for(page: int, page_size: int) -> int:
    """Convert 1-indexed page to SQL offset."""
    return (max(1, page) - 1) * page_size
