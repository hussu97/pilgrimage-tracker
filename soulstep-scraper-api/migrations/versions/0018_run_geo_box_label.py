"""Add geo_box_label column to scraperrun for per-box parallel Cloud Run dispatch.

Revision ID: 0018
Revises: 0017
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "0018"
down_revision: str | None = "0017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _columns(table: str) -> set[str]:
    conn = op.get_context().connection
    return {c["name"] for c in inspect(conn).get_columns(table)}


def upgrade() -> None:
    if "geo_box_label" not in _columns("scraperrun"):
        with op.batch_alter_table("scraperrun") as batch_op:
            batch_op.add_column(sa.Column("geo_box_label", sa.Text(), nullable=True))


def downgrade() -> None:
    if "geo_box_label" in _columns("scraperrun"):
        with op.batch_alter_table("scraperrun") as batch_op:
            batch_op.drop_column("geo_box_label")
