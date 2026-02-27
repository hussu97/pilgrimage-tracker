"""add sync and image-download progress counters to scraperrun

Revision ID: 0007
Revises: 0006
Create Date: 2026-02-27

Adds four integer counters to ScraperRun so the admin UI can display
real-time progress for the image_download and syncing phases:
  - images_downloaded / images_failed  (set at end of image_download phase)
  - places_synced / places_sync_failed (updated per-batch during syncing phase)
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "scraperrun",
        sa.Column("images_downloaded", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "scraperrun", sa.Column("images_failed", sa.Integer(), nullable=False, server_default="0")
    )
    op.add_column(
        "scraperrun", sa.Column("places_synced", sa.Integer(), nullable=False, server_default="0")
    )
    op.add_column(
        "scraperrun",
        sa.Column("places_sync_failed", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("scraperrun", "places_sync_failed")
    op.drop_column("scraperrun", "places_synced")
    op.drop_column("scraperrun", "images_failed")
    op.drop_column("scraperrun", "images_downloaded")
