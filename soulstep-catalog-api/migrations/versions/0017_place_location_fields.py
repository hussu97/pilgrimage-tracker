"""add city, state, country to place

Revision ID: 0017
Revises: 0016
Create Date: 2026-03-11

Adds three nullable, indexed columns to the place table for structured
location tagging populated by the scraper sync pipeline:
  - city    (e.g. "Dubai", "Mumbai")
  - state   (e.g. "Dubai Emirate", "Maharashtra")
  - country (e.g. "United Arab Emirates", "India")
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0017"
down_revision: str | None = "0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("place", sa.Column("city", sa.String(), nullable=True))
    op.add_column("place", sa.Column("state", sa.String(), nullable=True))
    op.add_column("place", sa.Column("country", sa.String(), nullable=True))
    op.create_index("ix_place_city", "place", ["city"])
    op.create_index("ix_place_state", "place", ["state"])
    op.create_index("ix_place_country", "place", ["country"])


def downgrade() -> None:
    op.drop_index("ix_place_country", table_name="place")
    op.drop_index("ix_place_state", table_name="place")
    op.drop_index("ix_place_city", table_name="place")
    op.drop_column("place", "country")
    op.drop_column("place", "state")
    op.drop_column("place", "city")
