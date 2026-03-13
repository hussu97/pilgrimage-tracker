"""add bulk_translation_job table

Revision ID: 0022
Revises: 0021
Create Date: 2026-03-13

Adds the BulkTranslationJob table to track long-running parallel browser
translation jobs started from the admin dashboard.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0022"
down_revision: str | None = "0021"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "bulk_translation_job",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("job_code", sa.String(), nullable=False),
        sa.Column("created_by_user_code", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("target_langs", sa.JSON(), nullable=True),
        sa.Column("entity_types", sa.JSON(), nullable=True),
        sa.Column("source_lang", sa.String(), nullable=False),
        sa.Column("total_items", sa.Integer(), nullable=False),
        sa.Column("completed_items", sa.Integer(), nullable=False),
        sa.Column("failed_items", sa.Integer(), nullable=False),
        sa.Column("skipped_items", sa.Integer(), nullable=False),
        sa.Column("error_message", sa.String(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancel_requested_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_code"], ["user.user_code"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_bulk_translation_job_job_code"),
        "bulk_translation_job",
        ["job_code"],
        unique=True,
    )
    op.create_index(
        op.f("ix_bulk_translation_job_status"),
        "bulk_translation_job",
        ["status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_bulk_translation_job_status"), table_name="bulk_translation_job")
    op.drop_index(op.f("ix_bulk_translation_job_job_code"), table_name="bulk_translation_job")
    op.drop_table("bulk_translation_job")
