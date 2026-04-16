"""Blog posts table

Revision ID: 0026
Revises: 0025
Create Date: 2026-04-16

Adds:
- blog_post table with post_code PK, slug, title, description,
  published_at, updated_at, reading_time, category, cover_gradient,
  content (JSON), is_published
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0026"
down_revision: str | None = "0025"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "blog_post",
        sa.Column("post_code", sa.String(), nullable=False),
        sa.Column("slug", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reading_time", sa.Integer(), nullable=False),
        sa.Column("category", sa.String(), nullable=False),
        sa.Column("cover_gradient", sa.String(), nullable=False),
        sa.Column("content", sa.JSON(), nullable=True),
        sa.Column(
            "is_published",
            sa.Boolean(),
            nullable=False,
            server_default="1",
        ),
        sa.PrimaryKeyConstraint("post_code"),
    )
    op.create_index("ix_blog_post_slug", "blog_post", ["slug"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_blog_post_slug", table_name="blog_post")
    op.drop_table("blog_post")
