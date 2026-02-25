"""add place_seo table for SEO metadata per sacred-site page

Revision ID: 0011
Revises: 0010
Create Date: 2026-02-25

Adds:
  - place_seo table with per-place SEO metadata:
    slug, seo_title, meta_description, rich_description,
    faq_json, og_image_url, is_manually_edited, generated_at, updated_at
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TSTZ = sa.DateTime(timezone=True)


def upgrade() -> None:
    op.create_table(
        "place_seo",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("place_code", sa.String, nullable=False),
        sa.Column("slug", sa.String, nullable=False),
        sa.Column("seo_title", sa.Text, nullable=False),
        sa.Column("meta_description", sa.Text, nullable=False),
        sa.Column("rich_description", sa.Text, nullable=True),
        sa.Column("faq_json", sa.JSON, nullable=True),
        sa.Column("og_image_url", sa.Text, nullable=True),
        sa.Column(
            "is_manually_edited",
            sa.Boolean,
            nullable=False,
            server_default="0",
        ),
        sa.Column("generated_at", _TSTZ, nullable=False),
        sa.Column("updated_at", _TSTZ, nullable=False),
        sa.ForeignKeyConstraint(["place_code"], ["place.place_code"]),
        sa.UniqueConstraint("place_code", name="uq_place_seo_place_code"),
        sa.UniqueConstraint("slug", name="uq_place_seo_slug"),
    )
    op.create_index("ix_place_seo_place_code", "place_seo", ["place_code"])
    op.create_index("ix_place_seo_slug", "place_seo", ["slug"])


def downgrade() -> None:
    op.drop_index("ix_place_seo_slug", "place_seo")
    op.drop_index("ix_place_seo_place_code", "place_seo")
    op.drop_table("place_seo")
