"""convert datetime columns to timestamptz

Revision ID: 0003
Revises: 0002
Create Date: 2026-02-27

On PostgreSQL: converts all TIMESTAMP WITHOUT TIME ZONE columns to
TIMESTAMPTZ (TIMESTAMP WITH TIME ZONE).  Existing values are reinterpreted
as UTC via the USING … AT TIME ZONE 'UTC' clause, which matches how the
application writes them (always datetime.now(UTC)).

On SQLite: no-op — SQLite stores datetimes as strings regardless of the
declared column type, so no structural change is needed.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# (table, column) pairs that hold datetimes.
_DATETIME_COLUMNS: list[tuple[str, str]] = [
    ("datalocation", "created_at"),
    ("scraperrun", "created_at"),
    ("scrapedplace", "created_at"),
    ("rawcollectordata", "collected_at"),
    ("placetypemapping", "created_at"),
]


def upgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return  # SQLite: no structural change needed

    for table, column in _DATETIME_COLUMNS:
        op.alter_column(
            table,
            column,
            type_=sa.DateTime(timezone=True),
            existing_type=sa.DateTime(timezone=False),
            existing_nullable=False,
            # Reinterpret stored naive timestamps as UTC when converting.
            postgresql_using=f"{column} AT TIME ZONE 'UTC'",
        )


def downgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return

    for table, column in reversed(_DATETIME_COLUMNS):
        op.alter_column(
            table,
            column,
            type_=sa.DateTime(timezone=False),
            existing_type=sa.DateTime(timezone=True),
            existing_nullable=False,
            postgresql_using=f"{column} AT TIME ZONE 'UTC'",
        )
