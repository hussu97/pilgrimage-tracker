"""Add place_type column to discoverycell and globaldiscoverycell;
drop place_types_hash from globaldiscoverycell; flush stale global cache.

Revision ID: 0015
Revises: 0014
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0015"
down_revision: str | None = "0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # discoverycell: add place_type column (default "" = combined/API mode)
    with op.batch_alter_table("discoverycell") as batch_op:
        batch_op.add_column(sa.Column("place_type", sa.Text(), nullable=False, server_default=""))

    # globaldiscoverycell: flush stale entries (wrong schema), then reshape
    # Drop the index on place_types_hash before batch_alter_table so SQLite's
    # table-rebuild step does not attempt to re-create it on the new schema.
    op.drop_index("ix_globaldiscoverycell_place_types_hash", table_name="globaldiscoverycell")
    op.execute("DELETE FROM globaldiscoverycell")
    with op.batch_alter_table("globaldiscoverycell") as batch_op:
        batch_op.add_column(sa.Column("place_type", sa.Text(), nullable=False, server_default=""))
        batch_op.drop_column("place_types_hash")


def downgrade() -> None:
    with op.batch_alter_table("globaldiscoverycell") as batch_op:
        batch_op.add_column(
            sa.Column("place_types_hash", sa.Text(), nullable=False, server_default="")
        )
        batch_op.drop_column("place_type")
    op.create_index(
        "ix_globaldiscoverycell_place_types_hash", "globaldiscoverycell", ["place_types_hash"]
    )

    with op.batch_alter_table("discoverycell") as batch_op:
        batch_op.drop_column("place_type")
