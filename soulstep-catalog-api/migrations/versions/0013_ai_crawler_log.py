"""add ai_crawler_log table for AI citation monitoring

Revision ID: 0013
Revises: 0012
Create Date: 2026-02-25

Adds:
  - ai_crawler_log table — records visits from AI-assistant crawlers to
    pre-rendered share pages. Used for AI citation monitoring in the admin
    SEO dashboard.

Columns:
  - id              INTEGER PK
  - bot_name        VARCHAR NOT NULL  (e.g. "ChatGPT", "Claude", "Perplexity")
  - path            VARCHAR NOT NULL  (the URL path visited)
  - place_code      VARCHAR NULLABLE  (extracted from path if a place page)
  - visited_at      TIMESTAMPTZ NOT NULL
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "ai_crawler_log",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("bot_name", sa.String, nullable=False, index=True),
        sa.Column("path", sa.String, nullable=False),
        sa.Column("place_code", sa.String, nullable=True, index=True),
        sa.Column("visited_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_ai_crawler_log_bot_name", "ai_crawler_log", ["bot_name"])
    op.create_index("ix_ai_crawler_log_place_code", "ai_crawler_log", ["place_code"])
    op.create_index("ix_ai_crawler_log_visited_at", "ai_crawler_log", ["visited_at"])


def downgrade() -> None:
    op.drop_index("ix_ai_crawler_log_visited_at", "ai_crawler_log")
    op.drop_index("ix_ai_crawler_log_place_code", "ai_crawler_log")
    op.drop_index("ix_ai_crawler_log_bot_name", "ai_crawler_log")
    op.drop_table("ai_crawler_log")
