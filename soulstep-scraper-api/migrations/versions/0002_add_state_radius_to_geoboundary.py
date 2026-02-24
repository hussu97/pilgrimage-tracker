"""add state and radius_km to geoboundary

Revision ID: 0002
Revises: 0001
Create Date: 2026-02-24

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "geoboundary",
        sa.Column("state", sa.String, nullable=True),
    )
    op.add_column(
        "geoboundary",
        sa.Column("radius_km", sa.Float, nullable=True),
    )


def downgrade() -> None:
    op.drop_column("geoboundary", "state")
    op.drop_column("geoboundary", "radius_km")
