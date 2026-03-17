"""Multi-language SEO template system

Revision ID: 0025
Revises: 0024
Create Date: 2026-03-17

Adds:
- seo_label table (translated labels for religions/place types)
- seo_content_template table (template patterns per lang)
- place_seo_translation table (per-language SEO content)
- place_seo.template_version column
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0025"
down_revision: str | None = "0024"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # seo_label table
    op.create_table(
        "seo_label",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("label_type", sa.String(), nullable=False),
        sa.Column("label_key", sa.String(), nullable=False),
        sa.Column("lang", sa.String(), nullable=False),
        sa.Column("label_text", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("label_type", "label_key", "lang"),
    )
    op.create_index("ix_seo_label_label_type", "seo_label", ["label_type"])
    op.create_index("ix_seo_label_label_key", "seo_label", ["label_key"])
    op.create_index("ix_seo_label_lang", "seo_label", ["lang"])

    # seo_content_template table
    op.create_table(
        "seo_content_template",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("template_code", sa.String(), nullable=False),
        sa.Column("lang", sa.String(), nullable=False),
        sa.Column("template_text", sa.String(), nullable=False),
        sa.Column("fallback_text", sa.String(), nullable=True),
        sa.Column("static_phrases", sa.JSON(), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default="1",
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("template_code", "lang"),
    )
    op.create_index(
        "ix_seo_content_template_template_code",
        "seo_content_template",
        ["template_code"],
    )
    op.create_index("ix_seo_content_template_lang", "seo_content_template", ["lang"])

    # place_seo_translation table
    op.create_table(
        "place_seo_translation",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("place_code", sa.String(), nullable=False),
        sa.Column("lang", sa.String(), nullable=False),
        sa.Column("seo_title", sa.String(), nullable=False),
        sa.Column("meta_description", sa.String(), nullable=False),
        sa.Column("rich_description", sa.String(), nullable=True),
        sa.Column("faq_json", sa.JSON(), nullable=True),
        sa.Column("template_version", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "is_manually_edited",
            sa.Boolean(),
            nullable=False,
            server_default="0",
        ),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["place_code"], ["place.place_code"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("place_code", "lang"),
    )
    op.create_index(
        "ix_place_seo_translation_place_code",
        "place_seo_translation",
        ["place_code"],
    )
    op.create_index("ix_place_seo_translation_lang", "place_seo_translation", ["lang"])

    # Add template_version to place_seo
    op.add_column(
        "place_seo",
        sa.Column("template_version", sa.Integer(), nullable=True, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("place_seo", "template_version")
    op.drop_table("place_seo_translation")
    op.drop_table("seo_content_template")
    op.drop_table("seo_label")
