"""add ui_translation table for runtime translation overrides

Revision ID: 0010
Revises: 0009
Create Date: 2026-02-23

Adds:
  - ui_translation table (id, key, lang, value, updated_at)
    with unique constraint on (key, lang)
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TSTZ = sa.DateTime(timezone=True)


def upgrade() -> None:
    op.create_table(
        "ui_translation",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("key", sa.Text, nullable=False),
        sa.Column("lang", sa.String(5), nullable=False),
        sa.Column("value", sa.Text, nullable=False),
        sa.Column("updated_at", _TSTZ, nullable=False),
        sa.UniqueConstraint("key", "lang", name="uq_ui_translation_key_lang"),
    )
    op.create_index("ix_ui_translation_key", "ui_translation", ["key"])


def downgrade() -> None:
    op.drop_index("ix_ui_translation_key", "ui_translation")
    op.drop_table("ui_translation")
