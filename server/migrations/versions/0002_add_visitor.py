"""add visitor and visitor_settings tables

Revision ID: 0002
Revises: 0001
Create Date: 2026-02-18

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "visitor",
        sa.Column("visitor_code", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("visitor_code"),
    )
    op.create_table(
        "visitor_settings",
        sa.Column("visitor_code", sa.String(), nullable=False),
        sa.Column("theme", sa.String(), nullable=False),
        sa.Column("units", sa.String(), nullable=False),
        sa.Column("language", sa.String(), nullable=False),
        sa.Column("religions", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["visitor_code"], ["visitor.visitor_code"]),
        sa.PrimaryKeyConstraint("visitor_code"),
    )


def downgrade() -> None:
    op.drop_table("visitor_settings")
    op.drop_table("visitor")
