"""add discoverycell table for discovery cell persistence and resumability

Revision ID: 0005
Revises: 0004
Create Date: 2026-02-27

Adds the discoverycell table which records each bounding box searched via
the Google Places API during discovery. This enables interrupted runs to
resume by skipping already-searched bounding boxes.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "discoverycell",
        sa.Column("id", sa.Integer(), nullable=False, primary_key=True),
        sa.Column("run_code", sa.String(), nullable=False),
        sa.Column("lat_min", sa.Float(), nullable=False),
        sa.Column("lat_max", sa.Float(), nullable=False),
        sa.Column("lng_min", sa.Float(), nullable=False),
        sa.Column("lng_max", sa.Float(), nullable=False),
        sa.Column("depth", sa.Integer(), nullable=False),
        sa.Column("radius_m", sa.Float(), nullable=False),
        sa.Column("result_count", sa.Integer(), nullable=False),
        sa.Column("saturated", sa.Boolean(), nullable=False),
        sa.Column("resource_names", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_discoverycell_run_code", "discoverycell", ["run_code"])


def downgrade() -> None:
    op.drop_index("ix_discoverycell_run_code", table_name="discoverycell")
    op.drop_table("discoverycell")
