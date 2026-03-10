"""add quality scoring fields to scrapedplace/scraperrun and globalgmapscache table

Revision ID: 0008
Revises: 0007
Create Date: 2026-03-10

Changes:
  - ScrapedPlace: quality_score (FLOAT nullable), quality_gate (VARCHAR nullable)
  - ScraperRun: places_filtered (INTEGER not null, default 0)
  - New table globalgmapscache: cross-run GMaps response cache with TTL
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ScrapedPlace quality fields
    op.add_column(
        "scrapedplace",
        sa.Column("quality_score", sa.Float(), nullable=True),
    )
    op.add_column(
        "scrapedplace",
        sa.Column("quality_gate", sa.String(), nullable=True),
    )

    # ScraperRun filtered counter
    op.add_column(
        "scraperrun",
        sa.Column("places_filtered", sa.Integer(), nullable=False, server_default="0"),
    )

    # Global GMaps response cache table
    op.create_table(
        "globalgmapscache",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("place_code", sa.String(), nullable=False),
        sa.Column("raw_response", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("quality_score", sa.Float(), nullable=True),
        sa.Column("cached_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_globalgmapscache_place_code", "globalgmapscache", ["place_code"], unique=True
    )


def downgrade() -> None:
    op.drop_index("ix_globalgmapscache_place_code", table_name="globalgmapscache")
    op.drop_table("globalgmapscache")
    op.drop_column("scraperrun", "places_filtered")
    op.drop_column("scrapedplace", "quality_gate")
    op.drop_column("scrapedplace", "quality_score")
