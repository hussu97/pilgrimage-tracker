"""add analytics_event table

Revision ID: 0016
Revises: 0015
Create Date: 2026-02-28

Adds:
  - analytics_event table for tracking user behaviour events
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0016"
down_revision: str | None = "0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "analytics_event",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("event_code", sa.String, nullable=False, unique=True),
        sa.Column("event_type", sa.String, nullable=False),
        sa.Column("user_code", sa.String, nullable=True),
        sa.Column("visitor_code", sa.String, nullable=True),
        sa.Column("session_id", sa.String, nullable=False),
        sa.Column("properties", sa.JSON, nullable=True),
        sa.Column("platform", sa.String, nullable=False),
        sa.Column("device_type", sa.String, nullable=True),
        sa.Column("app_version", sa.String, nullable=True),
        sa.Column("client_timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_analytics_event_event_code", "analytics_event", ["event_code"], unique=True)
    op.create_index("ix_analytics_event_event_type", "analytics_event", ["event_type"])
    op.create_index("ix_analytics_event_user_code", "analytics_event", ["user_code"])
    op.create_index("ix_analytics_event_visitor_code", "analytics_event", ["visitor_code"])
    op.create_index("ix_analytics_event_session_id", "analytics_event", ["session_id"])
    op.create_index("ix_analytics_event_platform", "analytics_event", ["platform"])
    op.create_index("ix_analytics_event_created_at", "analytics_event", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_analytics_event_created_at", table_name="analytics_event")
    op.drop_index("ix_analytics_event_platform", table_name="analytics_event")
    op.drop_index("ix_analytics_event_session_id", table_name="analytics_event")
    op.drop_index("ix_analytics_event_visitor_code", table_name="analytics_event")
    op.drop_index("ix_analytics_event_user_code", table_name="analytics_event")
    op.drop_index("ix_analytics_event_event_type", table_name="analytics_event")
    op.drop_index("ix_analytics_event_event_code", table_name="analytics_event")
    op.drop_table("analytics_event")
