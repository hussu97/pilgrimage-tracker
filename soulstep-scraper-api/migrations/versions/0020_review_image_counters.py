"""Add review_images_downloaded and review_images_failed columns to scraperrun.

Revision ID: 0020
Revises: 0019
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "0020"
down_revision: str | None = "0019"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _columns(table: str) -> set[str]:
    conn = op.get_context().connection
    return {c["name"] for c in inspect(conn).get_columns(table)}


def upgrade() -> None:
    existing = _columns("scraperrun")
    with op.batch_alter_table("scraperrun") as batch_op:
        if "review_images_downloaded" not in existing:
            batch_op.add_column(
                sa.Column(
                    "review_images_downloaded", sa.Integer(), nullable=False, server_default="0"
                )
            )
        if "review_images_failed" not in existing:
            batch_op.add_column(
                sa.Column("review_images_failed", sa.Integer(), nullable=False, server_default="0")
            )


def downgrade() -> None:
    existing = _columns("scraperrun")
    with op.batch_alter_table("scraperrun") as batch_op:
        if "review_images_downloaded" in existing:
            batch_op.drop_column("review_images_downloaded")
        if "review_images_failed" in existing:
            batch_op.drop_column("review_images_failed")
