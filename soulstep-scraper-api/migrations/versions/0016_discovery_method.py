"""Add discovery_method column to discoverycell and globaldiscoverycell.

Revision ID: 0016
Revises: 0015
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "0016"
down_revision: str | None = "0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _columns(table: str) -> set[str]:
    conn = op.get_context().connection
    return {c["name"] for c in inspect(conn).get_columns(table)}


def upgrade() -> None:
    # discoverycell: add discovery_method column
    if "discovery_method" not in _columns("discoverycell"):
        with op.batch_alter_table("discoverycell") as batch_op:
            batch_op.add_column(
                sa.Column("discovery_method", sa.Text(), nullable=False, server_default="quadtree")
            )

    # globaldiscoverycell: add discovery_method column
    if "discovery_method" not in _columns("globaldiscoverycell"):
        with op.batch_alter_table("globaldiscoverycell") as batch_op:
            batch_op.add_column(
                sa.Column("discovery_method", sa.Text(), nullable=False, server_default="quadtree")
            )


def downgrade() -> None:
    if "discovery_method" in _columns("discoverycell"):
        with op.batch_alter_table("discoverycell") as batch_op:
            batch_op.drop_column("discovery_method")

    if "discovery_method" in _columns("globaldiscoverycell"):
        with op.batch_alter_table("globaldiscoverycell") as batch_op:
            batch_op.drop_column("discovery_method")
