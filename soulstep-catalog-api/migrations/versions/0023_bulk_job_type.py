"""add job_type column to bulk_translation_job

Revision ID: 0023
Revises: 0022
Create Date: 2026-03-14

Adds a job_type column to distinguish browser-driven bulk translation jobs
from .txt import jobs created via the manual translation workflow.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0023"
down_revision: str | None = "0022"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "bulk_translation_job",
        sa.Column(
            "job_type",
            sa.String(50),
            nullable=False,
            server_default="browser",
        ),
    )


def downgrade() -> None:
    op.drop_column("bulk_translation_job", "job_type")
