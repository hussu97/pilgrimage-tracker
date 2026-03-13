"""Add sync_failure_details JSON column to scraperrun

Revision ID: 0013
Revises: 0012
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "scraperrun",
        sa.Column("sync_failure_details", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("scraperrun", "sync_failure_details")
