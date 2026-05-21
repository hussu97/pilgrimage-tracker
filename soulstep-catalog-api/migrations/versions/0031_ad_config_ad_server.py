"""add ad_server to ad_config

Revision ID: 0031
Revises: 0030
Create Date: 2026-05-21
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0031"
down_revision: str | None = "0030"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "ad_config",
        sa.Column("ad_server", sa.String(), nullable=False, server_default="adsense"),
    )


def downgrade() -> None:
    op.drop_column("ad_config", "ad_server")
