"""initial

Revision ID: 0001
Revises:
Create Date: 2026-02-21

"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # --- datalocation ---
    op.create_table(
        "datalocation",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("code", sqlmodel.sql.sqltypes.AutoString, nullable=False),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString, nullable=False),
        sa.Column(
            "source_type", sqlmodel.sql.sqltypes.AutoString, nullable=False, server_default="gmaps"
        ),
        sa.Column("config", sa.JSON, nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False),
    )
    op.create_index("ix_datalocation_code", "datalocation", ["code"], unique=True)
    op.create_index("ix_datalocation_name", "datalocation", ["name"], unique=False)

    # --- scraperrun ---
    op.create_table(
        "scraperrun",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("run_code", sqlmodel.sql.sqltypes.AutoString, nullable=False),
        sa.Column("location_code", sqlmodel.sql.sqltypes.AutoString, nullable=False),
        sa.Column(
            "status", sqlmodel.sql.sqltypes.AutoString, nullable=False, server_default="pending"
        ),
        sa.Column("total_items", sa.Integer, nullable=True),
        sa.Column("processed_items", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.ForeignKeyConstraint(["location_code"], ["datalocation.code"]),
    )
    op.create_index("ix_scraperrun_run_code", "scraperrun", ["run_code"], unique=True)

    # --- scrapedplace ---
    op.create_table(
        "scrapedplace",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("run_code", sqlmodel.sql.sqltypes.AutoString, nullable=False),
        sa.Column("place_code", sqlmodel.sql.sqltypes.AutoString, nullable=False),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString, nullable=False),
        sa.Column("raw_data", sa.JSON, nullable=False),
        sa.Column(
            "enrichment_status",
            sqlmodel.sql.sqltypes.AutoString,
            nullable=False,
            server_default="pending",
        ),
        sa.Column("description_source", sqlmodel.sql.sqltypes.AutoString, nullable=True),
        sa.Column("description_score", sa.Float, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.ForeignKeyConstraint(["run_code"], ["scraperrun.run_code"]),
    )
    op.create_index("ix_scrapedplace_run_code", "scrapedplace", ["run_code"], unique=False)
    op.create_index("ix_scrapedplace_place_code", "scrapedplace", ["place_code"], unique=False)

    # --- rawcollectordata ---
    op.create_table(
        "rawcollectordata",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("place_code", sqlmodel.sql.sqltypes.AutoString, nullable=False),
        sa.Column("collector_name", sqlmodel.sql.sqltypes.AutoString, nullable=False),
        sa.Column("run_code", sqlmodel.sql.sqltypes.AutoString, nullable=False),
        sa.Column("raw_response", sa.JSON, nullable=False),
        sa.Column(
            "status", sqlmodel.sql.sqltypes.AutoString, nullable=False, server_default="success"
        ),
        sa.Column("error_message", sqlmodel.sql.sqltypes.AutoString, nullable=True),
        sa.Column("collected_at", sa.DateTime, nullable=False),
        sa.ForeignKeyConstraint(["run_code"], ["scraperrun.run_code"]),
    )
    op.create_index(
        "ix_rawcollectordata_place_code", "rawcollectordata", ["place_code"], unique=False
    )
    op.create_index(
        "ix_rawcollectordata_collector_name", "rawcollectordata", ["collector_name"], unique=False
    )
    op.create_index("ix_rawcollectordata_run_code", "rawcollectordata", ["run_code"], unique=False)

    # --- geoboundary ---
    op.create_table(
        "geoboundary",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString, nullable=False),
        sa.Column("boundary_type", sqlmodel.sql.sqltypes.AutoString, nullable=False),
        sa.Column("country", sqlmodel.sql.sqltypes.AutoString, nullable=True),
        sa.Column("lat_min", sa.Float, nullable=False),
        sa.Column("lat_max", sa.Float, nullable=False),
        sa.Column("lng_min", sa.Float, nullable=False),
        sa.Column("lng_max", sa.Float, nullable=False),
    )
    op.create_index("ix_geoboundary_name", "geoboundary", ["name"], unique=False)

    # --- placetypemapping ---
    op.create_table(
        "placetypemapping",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("religion", sqlmodel.sql.sqltypes.AutoString, nullable=False),
        sa.Column(
            "source_type", sqlmodel.sql.sqltypes.AutoString, nullable=False, server_default="gmaps"
        ),
        sa.Column("gmaps_type", sqlmodel.sql.sqltypes.AutoString, nullable=False),
        sa.Column("our_place_type", sqlmodel.sql.sqltypes.AutoString, nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="1"),
        sa.Column("display_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime, nullable=False),
    )
    op.create_index("ix_placetypemapping_religion", "placetypemapping", ["religion"], unique=False)


def downgrade() -> None:
    op.drop_table("placetypemapping")
    op.drop_table("geoboundary")
    op.drop_table("rawcollectordata")
    op.drop_table("scrapedplace")
    op.drop_table("scraperrun")
    op.drop_table("datalocation")
