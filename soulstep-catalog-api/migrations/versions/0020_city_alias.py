"""add cityalias table for dirty/localized city name normalization

Revision ID: 0020
Revises: 0019
Create Date: 2026-03-13

Maps localized or administrative-area city name variants (e.g. "دبي", "Deira")
to canonical English City rows so that get_or_create_city() is bypassed in favour
of the correct canonical city_code.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0020"
down_revision: str | None = "0019"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "cityalias",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("alias_name", sa.String(), nullable=False),
        sa.Column("canonical_city_code", sa.String(), nullable=False),
        sa.Column("country_code", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["canonical_city_code"], ["city.city_code"]),
        sa.ForeignKeyConstraint(["country_code"], ["country.country_code"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("alias_name", "country_code"),
    )
    op.create_index("ix_cityalias_alias_name", "cityalias", ["alias_name"])
    op.create_index("ix_cityalias_canonical_city_code", "cityalias", ["canonical_city_code"])
    op.create_index("ix_cityalias_country_code", "cityalias", ["country_code"])


def downgrade() -> None:
    op.drop_index("ix_cityalias_country_code", "cityalias")
    op.drop_index("ix_cityalias_canonical_city_code", "cityalias")
    op.drop_index("ix_cityalias_alias_name", "cityalias")
    op.drop_table("cityalias")
