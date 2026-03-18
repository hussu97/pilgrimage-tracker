"""Add cloud_run_execution column to scraperrun for execution-level cancellation.

Revision ID: 0019
Revises: 0018
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "0019"
down_revision: str | None = "0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _columns(table: str) -> set[str]:
    conn = op.get_context().connection
    return {c["name"] for c in inspect(conn).get_columns(table)}


def upgrade() -> None:
    if "cloud_run_execution" not in _columns("scraperrun"):
        with op.batch_alter_table("scraperrun") as batch_op:
            batch_op.add_column(sa.Column("cloud_run_execution", sa.Text(), nullable=True))


def downgrade() -> None:
    if "cloud_run_execution" in _columns("scraperrun"):
        with op.batch_alter_table("scraperrun") as batch_op:
            batch_op.drop_column("cloud_run_execution")
