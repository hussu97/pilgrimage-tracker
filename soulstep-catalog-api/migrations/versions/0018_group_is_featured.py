"""add is_featured to group

Revision ID: 0018
Revises: 0017
Create Date: 2026-03-11

Adds a nullable boolean `is_featured` column to the `group` table so that
curated public journeys can be surfaced in the "Popular Journeys" dashboard
carousel via GET /api/v1/groups/featured.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0018"
down_revision: str | None = "0017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "group",
        sa.Column(
            "is_featured",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("group", "is_featured")
