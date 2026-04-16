"""Blog post SEO fields: author_name, tags, faq_json, cover_image_url

Revision ID: 0027
Revises: 0026
Create Date: 2026-04-16

Adds:
- author_name  TEXT nullable
- tags         JSON nullable
- faq_json     JSON nullable
- cover_image_url TEXT nullable
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0027"
down_revision: str | None = "0026"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("blog_post") as batch_op:
        batch_op.add_column(sa.Column("author_name", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("tags", sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column("faq_json", sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column("cover_image_url", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("blog_post") as batch_op:
        batch_op.drop_column("cover_image_url")
        batch_op.drop_column("faq_json")
        batch_op.drop_column("tags")
        batch_op.drop_column("author_name")
