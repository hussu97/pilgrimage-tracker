"""Add run-level visibility fields and per-place detail-fetch / sync status.

Unlocks:
- P0.3 — per-place detail-fetch retry (detail_fetch_status + detail_fetch_error
  on scrapedplace so one bad place doesn't kill the whole run)
- P0.7 — fail-fast threshold needs a queryable failure count (uses the new
  detail_fetch_status column rather than a separate counter)
- P1.10 — sync lock (last_sync_at on scraperrun disables double-sync in the
  admin UI and gives operators the timestamp of the most recent successful sync)
- P1.11 — per-place sync_status so "Sync Failed Only" has real state to filter
  on instead of the opaque sync_failure_details JSON blob
- P2 admin visibility — rate_limit_events JSON column aggregates 429/403 events
  per collector for the upcoming admin UI error-summary card

Revision ID: 0023
Revises: 0022
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "0023"
down_revision: str | None = "0022"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _columns(table: str) -> set[str]:
    conn = op.get_context().connection
    return {c["name"] for c in inspect(conn).get_columns(table)}


def upgrade() -> None:
    run_cols = _columns("scraperrun")
    with op.batch_alter_table("scraperrun") as batch_op:
        if "last_sync_at" not in run_cols:
            batch_op.add_column(
                sa.Column("last_sync_at", sa.DateTime(timezone=True), nullable=True)
            )
        if "rate_limit_events" not in run_cols:
            batch_op.add_column(
                sa.Column(
                    "rate_limit_events",
                    sa.JSON(),
                    nullable=False,
                    server_default=sa.text("'{}'"),
                )
            )

    place_cols = _columns("scrapedplace")
    with op.batch_alter_table("scrapedplace") as batch_op:
        if "detail_fetch_status" not in place_cols:
            batch_op.add_column(
                sa.Column(
                    "detail_fetch_status",
                    sa.String(),
                    nullable=False,
                    server_default="pending",
                )
            )
            batch_op.create_index("ix_scrapedplace_detail_fetch_status", ["detail_fetch_status"])
        if "detail_fetch_error" not in place_cols:
            batch_op.add_column(sa.Column("detail_fetch_error", sa.String(), nullable=True))
        if "sync_status" not in place_cols:
            batch_op.add_column(
                sa.Column(
                    "sync_status",
                    sa.String(),
                    nullable=False,
                    server_default="pending",
                )
            )
            batch_op.create_index("ix_scrapedplace_sync_status", ["sync_status"])


def downgrade() -> None:
    place_cols = _columns("scrapedplace")
    with op.batch_alter_table("scrapedplace") as batch_op:
        if "sync_status" in place_cols:
            batch_op.drop_index("ix_scrapedplace_sync_status")
            batch_op.drop_column("sync_status")
        if "detail_fetch_error" in place_cols:
            batch_op.drop_column("detail_fetch_error")
        if "detail_fetch_status" in place_cols:
            batch_op.drop_index("ix_scrapedplace_detail_fetch_status")
            batch_op.drop_column("detail_fetch_status")

    run_cols = _columns("scraperrun")
    with op.batch_alter_table("scraperrun") as batch_op:
        if "rate_limit_events" in run_cols:
            batch_op.drop_column("rate_limit_events")
        if "last_sync_at" in run_cols:
            batch_op.drop_column("last_sync_at")
