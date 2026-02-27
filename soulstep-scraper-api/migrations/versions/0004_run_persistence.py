"""add stage, discovered_resource_names, error_message to scraperrun

Revision ID: 0004
Revises: 0003
Create Date: 2026-02-27

Adds three columns to the scraperrun table to support run resumability:
  - stage: tracks the current pipeline phase (discovery/detail_fetch/enrichment)
  - discovered_resource_names: JSON array of Google Maps resource names from discovery
  - error_message: stores failure/interruption reason for debugging
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("scraperrun", sa.Column("stage", sa.String(), nullable=True))
    op.add_column(
        "scraperrun",
        sa.Column("discovered_resource_names", sa.JSON(), nullable=True, server_default="[]"),
    )
    op.add_column("scraperrun", sa.Column("error_message", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("scraperrun", "error_message")
    op.drop_column("scraperrun", "discovered_resource_names")
    op.drop_column("scraperrun", "stage")
