"""Make Place.lat and Place.lng nullable; set (0.0, 0.0) rows to NULL

Revision ID: 0028
Revises: 0027
Create Date: 2026-04-16

Changes:
- place.lat  REAL NOT NULL → REAL nullable
- place.lng  REAL NOT NULL → REAL nullable
- Backfill: rows where lat=0.0 AND lng=0.0 are set to NULL (sentinel values
  written by the old scraper when the Google Maps API returned no location)
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0028"
down_revision: str | None = "0027"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("place") as batch_op:
        batch_op.alter_column("lat", existing_type=sa.Float(), nullable=True)
        batch_op.alter_column("lng", existing_type=sa.Float(), nullable=True)

    # Backfill sentinel (0.0, 0.0) → NULL
    op.execute("UPDATE place SET lat = NULL, lng = NULL WHERE lat = 0.0 AND lng = 0.0")


def downgrade() -> None:
    # Restore NULLs to 0.0 before making columns NOT NULL again
    op.execute("UPDATE place SET lat = 0.0, lng = 0.0 WHERE lat IS NULL OR lng IS NULL")

    with op.batch_alter_table("place") as batch_op:
        batch_op.alter_column("lat", existing_type=sa.Float(), nullable=False)
        batch_op.alter_column("lng", existing_type=sa.Float(), nullable=False)
