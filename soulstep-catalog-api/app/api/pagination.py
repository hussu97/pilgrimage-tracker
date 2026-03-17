"""Shared pagination utilities for all API endpoints.

Standard pattern: every paginated endpoint accepts `page` (1-indexed) and
`page_size`, and returns `{ items, total, page, page_size }` plus any
endpoint-specific extra fields.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from fastapi import Query
from pydantic import BaseModel

# ── Defaults ────────────────────────────────────────────────────────────────

DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE_CUSTOMER = 100
MAX_PAGE_SIZE_ADMIN = 2000


# ── Response schema ─────────────────────────────────────────────────────────


class PaginatedMeta(BaseModel):
    """Pagination metadata included in every paginated response."""

    total: int
    page: int
    page_size: int


# ── Dependency helpers ──────────────────────────────────────────────────────


def paginate_query(
    total: int,
    page: int,
    page_size: int,
    items: Sequence[Any],
    **extra: Any,
) -> dict[str, Any]:
    """Build a standard paginated response dict.

    Args:
        total: Total number of matching records (before pagination).
        page: Current page number (1-indexed).
        page_size: Number of items per page.
        items: The items for this page.
        **extra: Additional top-level keys to include in the response
                 (e.g. ``filters``, ``unread_count``).

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


# ── Reusable Query params (for use in endpoint signatures) ──────────────────


# Customer endpoints
def page_param(default: int = 1) -> int:
    return Query(default, ge=1, description="Page number (1-indexed)")


def page_size_param(default: int = DEFAULT_PAGE_SIZE, le: int = MAX_PAGE_SIZE_CUSTOMER) -> int:
    return Query(default, ge=1, le=le, description="Items per page")
