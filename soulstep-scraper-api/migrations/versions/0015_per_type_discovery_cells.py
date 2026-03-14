"""Add place_type column to discoverycell and globaldiscoverycell;
drop place_types_hash from globaldiscoverycell; flush stale global cache.

Revision ID: 0015
Revises: 0014
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "0015"
down_revision: str | None = "0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _columns(table: str) -> set[str]:
    conn = op.get_bind()
    return {c["name"] for c in inspect(conn).get_columns(table)}


def _indexes(table: str) -> set[str]:
    conn = op.get_bind()
    return {i["name"] for i in inspect(conn).get_indexes(table)}


def upgrade() -> None:
    # discoverycell: add place_type column (default "" = combined/API mode)
    if "place_type" not in _columns("discoverycell"):
        with op.batch_alter_table("discoverycell") as batch_op:
            batch_op.add_column(
                sa.Column("place_type", sa.Text(), nullable=False, server_default="")
            )

    # globaldiscoverycell: flush stale entries (wrong schema), then reshape.
    # Drop the index on place_types_hash before batch_alter_table so SQLite's
    # table-rebuild step does not attempt to re-create it on the new schema.
    if "ix_globaldiscoverycell_place_types_hash" in _indexes("globaldiscoverycell"):
        op.drop_index("ix_globaldiscoverycell_place_types_hash", table_name="globaldiscoverycell")
    op.execute("DELETE FROM globaldiscoverycell")
    cols = _columns("globaldiscoverycell")
    if "place_type" not in cols or "place_types_hash" in cols:
        with op.batch_alter_table("globaldiscoverycell") as batch_op:
            if "place_type" not in cols:
                batch_op.add_column(
                    sa.Column("place_type", sa.Text(), nullable=False, server_default="")
                )
            if "place_types_hash" in cols:
                batch_op.drop_column("place_types_hash")


def downgrade() -> None:
    cols = _columns("globaldiscoverycell")
    if "place_types_hash" not in cols or "place_type" in cols:
        with op.batch_alter_table("globaldiscoverycell") as batch_op:
            if "place_types_hash" not in cols:
                batch_op.add_column(
                    sa.Column("place_types_hash", sa.Text(), nullable=False, server_default="")
                )
            if "place_type" in cols:
                batch_op.drop_column("place_type")
    if "ix_globaldiscoverycell_place_types_hash" not in _indexes("globaldiscoverycell"):
        op.create_index(
            "ix_globaldiscoverycell_place_types_hash",
            "globaldiscoverycell",
            ["place_types_hash"],
        )

    if "place_type" in _columns("discoverycell"):
        with op.batch_alter_table("discoverycell") as batch_op:
            batch_op.drop_column("place_type")
