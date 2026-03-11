"""add city, state, country to scrapedplace

Revision ID: 0009
Revises: 0008
Create Date: 2026-03-11

Adds three nullable columns to scrapedplace for structured location tagging
extracted from the GMaps addressComponents field during detail fetch:
  - city    (locality / sublocality / admin_area_level_2)
  - state   (administrative_area_level_1)
  - country (country longText, e.g. "United Arab Emirates")
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("scrapedplace", sa.Column("city", sa.String(), nullable=True))
    op.add_column("scrapedplace", sa.Column("state", sa.String(), nullable=True))
    op.add_column("scrapedplace", sa.Column("country", sa.String(), nullable=True))
    op.create_index("ix_scrapedplace_city", "scrapedplace", ["city"])
    op.create_index("ix_scrapedplace_state", "scrapedplace", ["state"])
    op.create_index("ix_scrapedplace_country", "scrapedplace", ["country"])


def downgrade() -> None:
    op.drop_index("ix_scrapedplace_country", table_name="scrapedplace")
    op.drop_index("ix_scrapedplace_state", table_name="scrapedplace")
    op.drop_index("ix_scrapedplace_city", table_name="scrapedplace")
    op.drop_column("scrapedplace", "country")
    op.drop_column("scrapedplace", "state")
    op.drop_column("scrapedplace", "city")
