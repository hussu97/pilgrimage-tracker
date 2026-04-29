"""drop app version config

Revision ID: 0029
Revises: 0028
Create Date: 2026-04-29
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0029"
down_revision: str | None = "0028"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TSTZ = sa.DateTime(timezone=True)


def upgrade() -> None:
    op.drop_table("appversionconfig")


def downgrade() -> None:
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
