"""add country/state/city tables and location_code FKs on place

Revision ID: 0019
Revises: 0018
Create Date: 2026-03-11

Creates canonical Country, State, City tables with stable *_code identifiers
and multilingual translations JSON. Adds nullable city_code, state_code,
country_code foreign key columns to the place table.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0019"
down_revision: str | None = "0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "country",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("country_code", sa.String(), nullable=False),
        sa.Column("iso_code", sa.String(), nullable=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("translations", sa.JSON(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("country_code"),
        sa.UniqueConstraint("name"),
    )
    op.create_index("ix_country_country_code", "country", ["country_code"])
    op.create_index("ix_country_iso_code", "country", ["iso_code"])
    op.create_index("ix_country_name", "country", ["name"])

    op.create_table(
        "state",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("state_code", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("country_code", sa.String(), nullable=False),
        sa.Column("translations", sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(["country_code"], ["country.country_code"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("state_code"),
        sa.UniqueConstraint("name", "country_code"),
    )
    op.create_index("ix_state_state_code", "state", ["state_code"])
    op.create_index("ix_state_name", "state", ["name"])
    op.create_index("ix_state_country_code", "state", ["country_code"])

    op.create_table(
        "city",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("city_code", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("country_code", sa.String(), nullable=False),
        sa.Column("state_code", sa.String(), nullable=True),
        sa.Column("translations", sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(["country_code"], ["country.country_code"]),
        sa.ForeignKeyConstraint(["state_code"], ["state.state_code"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("city_code"),
        sa.UniqueConstraint("name", "country_code"),
    )
    op.create_index("ix_city_city_code", "city", ["city_code"])
    op.create_index("ix_city_name", "city", ["name"])
    op.create_index("ix_city_country_code", "city", ["country_code"])
    op.create_index("ix_city_state_code", "city", ["state_code"])

    op.add_column("place", sa.Column("city_code", sa.String(), nullable=True))
    op.add_column("place", sa.Column("state_code", sa.String(), nullable=True))
    op.add_column("place", sa.Column("country_code", sa.String(), nullable=True))
    op.create_index("ix_place_city_code", "place", ["city_code"])
    op.create_index("ix_place_state_code", "place", ["state_code"])
    op.create_index("ix_place_country_code", "place", ["country_code"])


def downgrade() -> None:
    op.drop_index("ix_place_country_code", "place")
    op.drop_index("ix_place_state_code", "place")
    op.drop_index("ix_place_city_code", "place")
    op.drop_column("place", "country_code")
    op.drop_column("place", "state_code")
    op.drop_column("place", "city_code")
    op.drop_table("city")
    op.drop_table("state")
    op.drop_table("country")
