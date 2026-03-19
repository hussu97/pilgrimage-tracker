"""Promote frequently-accessed raw_data fields to real columns on scrapedplace.

Avoids loading heavy JSON blobs for map endpoints, quality scoring, and
enrichment lookups.  A one-time backfill script populates existing rows.

Revision ID: 0022
Revises: 0021
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "0022"
down_revision: str | None = "0021"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_FLOAT_COLS = ["lat", "lng", "rating"]
_INT_COLS = ["user_rating_count"]
_STR_COLS = ["google_place_id", "address", "religion", "place_type", "business_status"]
_INDEXED_STR_COLS = {"google_place_id", "religion", "place_type"}


def _columns(table: str) -> set[str]:
    conn = op.get_context().connection
    return {c["name"] for c in inspect(conn).get_columns(table)}


def upgrade() -> None:
    existing = _columns("scrapedplace")
    with op.batch_alter_table("scrapedplace") as batch_op:
        for col_name in _FLOAT_COLS:
            if col_name not in existing:
                batch_op.add_column(sa.Column(col_name, sa.Float(), nullable=True))
        for col_name in _INT_COLS:
            if col_name not in existing:
                batch_op.add_column(sa.Column(col_name, sa.Integer(), nullable=True))
        for col_name in _STR_COLS:
            if col_name not in existing:
                batch_op.add_column(sa.Column(col_name, sa.String(), nullable=True))
                if col_name in _INDEXED_STR_COLS:
                    batch_op.create_index(f"ix_scrapedplace_{col_name}", [col_name])


def downgrade() -> None:
    existing = _columns("scrapedplace")
    all_cols = _FLOAT_COLS + _INT_COLS + _STR_COLS
    with op.batch_alter_table("scrapedplace") as batch_op:
        for col_name in all_cols:
            if col_name in existing:
                if col_name in _INDEXED_STR_COLS:
                    batch_op.drop_index(f"ix_scrapedplace_{col_name}")
                batch_op.drop_column(col_name)
