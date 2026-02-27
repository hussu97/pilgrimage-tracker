"""add globaldiscoverycell table for cross-run discovery caching

Revision ID: 0006
Revises: 0005
Create Date: 2026-02-27

Adds the globaldiscoverycell table which caches discovery API results across
runs. Recurring monthly runs of the same city reuse results within the TTL
(default 30 days), eliminating ~95% of discovery API calls after month 1.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "globaldiscoverycell",
        sa.Column("id", sa.Integer(), nullable=False, primary_key=True),
        sa.Column("lat_min", sa.Float(), nullable=False),
        sa.Column("lat_max", sa.Float(), nullable=False),
        sa.Column("lng_min", sa.Float(), nullable=False),
        sa.Column("lng_max", sa.Float(), nullable=False),
        sa.Column("place_types_hash", sa.String(), nullable=False),
        sa.Column("result_count", sa.Integer(), nullable=False),
        sa.Column("saturated", sa.Boolean(), nullable=False),
        sa.Column("resource_names", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("searched_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_globaldiscoverycell_place_types_hash",
        "globaldiscoverycell",
        ["place_types_hash"],
    )
    # Composite index for bbox lookups
    op.create_index(
        "ix_globaldiscoverycell_bbox",
        "globaldiscoverycell",
        ["lat_min", "lat_max", "lng_min", "lng_max"],
    )


def downgrade() -> None:
    op.drop_index("ix_globaldiscoverycell_bbox", table_name="globaldiscoverycell")
    op.drop_index("ix_globaldiscoverycell_place_types_hash", table_name="globaldiscoverycell")
    op.drop_table("globaldiscoverycell")
