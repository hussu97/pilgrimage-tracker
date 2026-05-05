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


def _column_exists(table_name: str, column_name: str) -> bool:
    columns = sa.inspect(op.get_bind()).get_columns(table_name)
    return any(column["name"] == column_name for column in columns)


def _add_column_if_missing(table_name: str, column: sa.Column) -> None:
    if not _column_exists(table_name, column.name):
        op.add_column(table_name, column)


def _drop_column_if_present(table_name: str, column_name: str) -> None:
    if _column_exists(table_name, column_name):
        op.drop_column(table_name, column_name)


def upgrade() -> None:
    _add_column_if_missing(
        "blog_post",
        sa.Column("view_count", sa.Integer(), nullable=False, server_default="0"),
    )
    _add_column_if_missing(
        "blog_post",
        sa.Column("link_click_count", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    _drop_column_if_present("blog_post", "link_click_count")
    _drop_column_if_present("blog_post", "view_count")
