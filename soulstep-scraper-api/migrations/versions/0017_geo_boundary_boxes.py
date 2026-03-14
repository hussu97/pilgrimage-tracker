"""Create geoboundarybox table for multi-box country borders.

Revision ID: 0017
Revises: 0016
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "0017"
down_revision: str | None = "0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _tables() -> set[str]:
    conn = op.get_context().connection
    return set(inspect(conn).get_table_names())


def upgrade() -> None:
    if "geoboundarybox" not in _tables():
        op.create_table(
            "geoboundarybox",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("boundary_id", sa.Integer(), nullable=False),
            sa.Column("lat_min", sa.Float(), nullable=False),
            sa.Column("lat_max", sa.Float(), nullable=False),
            sa.Column("lng_min", sa.Float(), nullable=False),
            sa.Column("lng_max", sa.Float(), nullable=False),
            sa.Column("label", sa.Text(), nullable=True),
            sa.ForeignKeyConstraint(["boundary_id"], ["geoboundary.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_geoboundarybox_boundary_id", "geoboundarybox", ["boundary_id"])


def downgrade() -> None:
    if "geoboundarybox" in _tables():
        op.drop_index("ix_geoboundarybox_boundary_id", table_name="geoboundarybox")
        op.drop_table("geoboundarybox")
