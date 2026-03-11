"""Add places_sync_quality_filtered and places_sync_name_filtered to scraperrun

Revision ID: 0012
Revises: 0011
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0012"
down_revision: str | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "scraperrun",
        sa.Column("places_sync_quality_filtered", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "scraperrun",
        sa.Column("places_sync_name_filtered", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("scraperrun", "places_sync_quality_filtered")
    op.drop_column("scraperrun", "places_sync_name_filtered")
