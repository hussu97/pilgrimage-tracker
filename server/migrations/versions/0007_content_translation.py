"""add ContentTranslation table for system/scraped content localization

Revision ID: 0007
Revises: 0006
Create Date: 2026-02-21

Adds:
  - content_translation table (id, entity_type, entity_code, field, lang,
    translated_text, source, created_at, updated_at)
  - Composite UNIQUE(entity_type, entity_code, field, lang)
  - Composite index on (entity_type, lang, entity_code) for bulk-query pattern
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TSTZ = sa.DateTime(timezone=True)


def upgrade() -> None:
    op.create_table(
        "contenttranslation",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("entity_type", sa.String, nullable=False, index=True),
        sa.Column("entity_code", sa.String, nullable=False, index=True),
        sa.Column("field", sa.String, nullable=False),
        sa.Column("lang", sa.String, nullable=False, index=True),
        sa.Column("translated_text", sa.String, nullable=False),
        sa.Column("source", sa.String, nullable=False, server_default="scraper"),
        sa.Column("created_at", _TSTZ, nullable=False),
        sa.Column("updated_at", _TSTZ, nullable=False),
        sa.UniqueConstraint(
            "entity_type", "entity_code", "field", "lang", name="uq_content_translation"
        ),
    )
    op.create_index(
        "ix_content_translation_type_lang_code",
        "contenttranslation",
        ["entity_type", "lang", "entity_code"],
    )


def downgrade() -> None:
    op.drop_index("ix_content_translation_type_lang_code", table_name="contenttranslation")
    op.drop_table("contenttranslation")
