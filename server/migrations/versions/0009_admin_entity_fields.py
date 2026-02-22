"""add is_active to user, is_flagged to review

Revision ID: 0009
Revises: 0008
Create Date: 2026-02-22

Adds:
  - user.is_active BOOLEAN NOT NULL DEFAULT TRUE
  - review.is_flagged BOOLEAN NOT NULL DEFAULT FALSE
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "user",
        sa.Column(
            "is_active",
            sa.Boolean,
            nullable=False,
            server_default=sa.true(),
        ),
    )
    op.add_column(
        "review",
        sa.Column(
            "is_flagged",
            sa.Boolean,
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("user", "is_active")
    op.drop_column("review", "is_flagged")
