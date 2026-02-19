"""convert all TIMESTAMP columns to TIMESTAMPTZ

Revision ID: 0003
Revises: 0002
Create Date: 2026-02-19

Converts every datetime column from plain TIMESTAMP (timezone-naive) to
TIMESTAMP WITH TIME ZONE (TIMESTAMPTZ) so that PostgreSQL stores and returns
timezone-aware datetimes consistently.  Existing values are re-interpreted as
UTC, which is correct because they were always written as UTC.

SQLite is not affected — its DateTime type uses string storage regardless.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# (table, column) pairs that need to become TIMESTAMPTZ
_TIMESTAMP_COLUMNS: list[tuple[str, str]] = [
    ("user", "created_at"),
    ("user", "updated_at"),
    ("place", "created_at"),
    ("placeimage", "created_at"),
    ("review", "created_at"),
    ("reviewimage", "created_at"),
    ("reviewimage", "attached_at"),
    ("checkin", "checked_in_at"),
    ("group", "created_at"),
    ("groupmember", "joined_at"),
    ("notification", "read_at"),
    ("notification", "created_at"),
    ("passwordreset", "expires_at"),
    ("passwordreset", "used_at"),
    ("refreshtoken", "expires_at"),
    ("refreshtoken", "revoked_at"),
    ("refreshtoken", "created_at"),
    ("visitor", "created_at"),
    ("visitor", "last_seen_at"),
]

_TSTZ = sa.DateTime(timezone=True)


def upgrade() -> None:
    conn = op.get_bind()
    if conn.dialect.name != "postgresql":
        # SQLite and other non-PostgreSQL engines do not support ALTER COLUMN TYPE;
        # the DateTime(timezone=True) flag is already handled at the ORM level.
        return

    for table, column in _TIMESTAMP_COLUMNS:
        op.alter_column(
            table,
            column,
            type_=_TSTZ,
            postgresql_using=f"{column} AT TIME ZONE 'UTC'",
        )


def downgrade() -> None:
    conn = op.get_bind()
    if conn.dialect.name != "postgresql":
        return

    for table, column in _TIMESTAMP_COLUMNS:
        op.alter_column(
            table,
            column,
            type_=sa.DateTime(timezone=False),
            postgresql_using=f"{column} AT TIME ZONE 'UTC'",
        )
