"""add is_admin column to user table

Revision ID: 0008
Revises: 0007
Create Date: 2026-02-22

Adds:
  - user.is_admin BOOLEAN NOT NULL DEFAULT FALSE
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "user",
        sa.Column(
            "is_admin",
            sa.Boolean,
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("user", "is_admin")
