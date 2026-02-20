"""add AppVersionConfig table for per-platform app version requirements

Revision ID: 0006
Revises: 0005
Create Date: 2026-02-21

Adds:
  - appversionconfig table (id, platform, min_version_hard, min_version_soft,
    latest_version, store_url, updated_at)
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TSTZ = sa.DateTime(timezone=True)


def upgrade() -> None:
    op.create_table(
        "appversionconfig",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("platform", sa.String, nullable=False, unique=True, index=True),
        sa.Column("min_version_hard", sa.String, nullable=False, server_default=""),
        sa.Column("min_version_soft", sa.String, nullable=False, server_default=""),
        sa.Column("latest_version", sa.String, nullable=False, server_default=""),
        sa.Column("store_url", sa.String, nullable=False, server_default=""),
        sa.Column("updated_at", _TSTZ, nullable=False),
    )


def downgrade() -> None:
    op.drop_table("appversionconfig")
