"""Add run handoffs, durable scraped assets, and discovery idempotency key.

Revision ID: 0024
Revises: 0023
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "0024"
down_revision: str | None = "0023"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _columns(table: str) -> set[str]:
    conn = op.get_context().connection
    return {c["name"] for c in inspect(conn).get_columns(table)}


def _unique_names(table: str) -> set[str]:
    conn = op.get_context().connection
    return {c["name"] for c in inspect(conn).get_unique_constraints(table)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "runhandoff" not in existing_tables:
        op.create_table(
            "runhandoff",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("handoff_code", sa.String(), nullable=False),
            sa.Column(
                "run_code", sa.String(), sa.ForeignKey("scraperrun.run_code"), nullable=False
            ),
            sa.Column("state", sa.String(), nullable=False, server_default="quiescing"),
            sa.Column("lease_owner", sa.String(), nullable=True),
            sa.Column("exported_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("finalized_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("resume_from_stage", sa.String(), nullable=True),
            sa.Column("bundle_uri", sa.String(), nullable=True),
            sa.Column("manifest_sha256", sa.String(), nullable=True),
            sa.Column("error_message", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint("handoff_code", name="uq_runhandoff_handoff_code"),
        )
        op.create_index("ix_runhandoff_handoff_code", "runhandoff", ["handoff_code"])
        op.create_index("ix_runhandoff_run_code", "runhandoff", ["run_code"])
        op.create_index("ix_runhandoff_state", "runhandoff", ["state"])

    if "scrapedasset" not in existing_tables:
        op.create_table(
            "scrapedasset",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column(
                "run_code", sa.String(), sa.ForeignKey("scraperrun.run_code"), nullable=False
            ),
            sa.Column("place_code", sa.String(), nullable=False),
            sa.Column("asset_kind", sa.String(), nullable=False),
            sa.Column("review_index", sa.Integer(), nullable=True),
            sa.Column("asset_index", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("source_url", sa.String(), nullable=True),
            sa.Column("gcs_url", sa.String(), nullable=True),
            sa.Column("status", sa.String(), nullable=False, server_default="pending_upload"),
            sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("captured_via", sa.String(), nullable=True),
            sa.Column("last_error", sa.String(), nullable=True),
            sa.Column("inline_bytes_b64", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint(
                "run_code",
                "place_code",
                "asset_kind",
                "review_index",
                "asset_index",
                name="uq_scrapedasset_identity",
            ),
        )
        op.create_index("ix_scrapedasset_run_code", "scrapedasset", ["run_code"])
        op.create_index("ix_scrapedasset_place_code", "scrapedasset", ["place_code"])
        op.create_index("ix_scrapedasset_asset_kind", "scrapedasset", ["asset_kind"])
        op.create_index("ix_scrapedasset_status", "scrapedasset", ["status"])

    discovery_uniques = _unique_names("discoverycell")
    if "uq_discoverycell_run_scope_bbox" not in discovery_uniques:
        with op.batch_alter_table("discoverycell") as batch_op:
            batch_op.create_unique_constraint(
                "uq_discoverycell_run_scope_bbox",
                [
                    "run_code",
                    "place_type",
                    "discovery_method",
                    "lat_min",
                    "lat_max",
                    "lng_min",
                    "lng_max",
                ],
            )


def downgrade() -> None:
    discovery_uniques = _unique_names("discoverycell")
    if "uq_discoverycell_run_scope_bbox" in discovery_uniques:
        with op.batch_alter_table("discoverycell") as batch_op:
            batch_op.drop_constraint("uq_discoverycell_run_scope_bbox", type_="unique")

    bind = op.get_bind()
    inspector = inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "scrapedasset" in existing_tables:
        op.drop_index("ix_scrapedasset_status", table_name="scrapedasset")
        op.drop_index("ix_scrapedasset_asset_kind", table_name="scrapedasset")
        op.drop_index("ix_scrapedasset_place_code", table_name="scrapedasset")
        op.drop_index("ix_scrapedasset_run_code", table_name="scrapedasset")
        op.drop_table("scrapedasset")

    if "runhandoff" in existing_tables:
        op.drop_index("ix_runhandoff_state", table_name="runhandoff")
        op.drop_index("ix_runhandoff_run_code", table_name="runhandoff")
        op.drop_index("ix_runhandoff_handoff_code", table_name="runhandoff")
        op.drop_table("runhandoff")
