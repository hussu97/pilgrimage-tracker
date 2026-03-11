"""Clear circle-based discovery cells for rectangle query migration

Revision ID: 0010
Revises: 0009
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("DELETE FROM discoverycell")
    op.execute("DELETE FROM globaldiscoverycell")


def downgrade() -> None:
    pass  # Data cannot be restored
