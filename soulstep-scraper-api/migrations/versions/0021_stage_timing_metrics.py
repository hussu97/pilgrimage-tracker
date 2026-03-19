"""Add per-stage timing metrics to scraperrun.

Revision ID: 0021
Revises: 0020
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "0021"
down_revision: str | None = "0020"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_COLUMNS = [
    "discovery_duration_s",
    "detail_fetch_duration_s",
    "image_download_duration_s",
    "enrichment_duration_s",
    "sync_duration_s",
    "avg_time_per_place_s",
]


def _columns(table: str) -> set[str]:
    conn = op.get_context().connection
    return {c["name"] for c in inspect(conn).get_columns(table)}


def upgrade() -> None:
    existing = _columns("scraperrun")
    with op.batch_alter_table("scraperrun") as batch_op:
        for col_name in _COLUMNS:
            if col_name not in existing:
                batch_op.add_column(sa.Column(col_name, sa.Float(), nullable=True))


def downgrade() -> None:
    existing = _columns("scraperrun")
    with op.batch_alter_table("scraperrun") as batch_op:
        for col_name in _COLUMNS:
            if col_name in existing:
                batch_op.drop_column(col_name)
