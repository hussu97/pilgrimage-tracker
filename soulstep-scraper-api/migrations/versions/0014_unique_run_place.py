"""Add unique constraint on (run_code, place_code) in scrapedplace

Revision ID: 0014
Revises: 0013
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0014"
down_revision: str | None = "0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Remove duplicate rows before adding the constraint (keep the latest by id)
    op.execute(
        """
        DELETE FROM scrapedplace
        WHERE id NOT IN (
            SELECT MAX(id)
            FROM scrapedplace
            GROUP BY run_code, place_code
        )
        """
    )
    op.create_index(
        "uq_scrapedplace_run_place",
        "scrapedplace",
        ["run_code", "place_code"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_scrapedplace_run_place", table_name="scrapedplace")
