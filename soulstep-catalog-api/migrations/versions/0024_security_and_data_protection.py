"""Security and data protection: account lockout, email verification, soft-delete

Revision ID: 0024
Revises: 0023
Create Date: 2026-03-16

Adds:
- user.failed_login_attempts  (Integer, default 0)
- user.locked_until           (TIMESTAMPTZ, nullable)
- user.email_verified_at      (TIMESTAMPTZ, nullable)
- checkin.deleted_at          (TIMESTAMPTZ, nullable)
- review.deleted_at           (TIMESTAMPTZ, nullable)
- emailverification table
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0024"
down_revision: str | None = "0023"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # User: account lockout fields
    op.add_column(
        "user",
        sa.Column(
            "failed_login_attempts",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "user",
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
    )
    # User: email verification
    op.add_column(
        "user",
        sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True),
    )
    # CheckIn: soft-delete
    op.add_column(
        "checkin",
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    # Review: soft-delete
    op.add_column(
        "review",
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    # EmailVerification table
    op.create_table(
        "emailverification",
        sa.Column("token", sa.String(), nullable=False),
        sa.Column("user_code", sa.String(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_code"], ["user.user_code"]),
        sa.PrimaryKeyConstraint("token"),
    )


def downgrade() -> None:
    op.drop_table("emailverification")
    op.drop_column("review", "deleted_at")
    op.drop_column("checkin", "deleted_at")
    op.drop_column("user", "email_verified_at")
    op.drop_column("user", "locked_until")
    op.drop_column("user", "failed_login_attempts")
