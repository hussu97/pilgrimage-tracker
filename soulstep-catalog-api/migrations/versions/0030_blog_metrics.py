"""Blog post view and link-click metrics

Revision ID: 0030
Revises: 0029
Create Date: 2026-05-05

Adds:
- blog_post.view_count       INT NOT NULL DEFAULT 0
- blog_post.link_click_count INT NOT NULL DEFAULT 0
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0030"
down_revision: str | None = "0029"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "blog_post",
        sa.Column("view_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "blog_post",
        sa.Column("link_click_count", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("blog_post", "link_click_count")
    op.drop_column("blog_post", "view_count")
