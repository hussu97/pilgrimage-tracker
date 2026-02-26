"""add ad_config, consent_record tables and is_premium on user

Revision ID: 0014
Revises: 0013
Create Date: 2026-02-26

Adds:
  - ad_config table — server-driven feature flag and ad-unit config per platform
  - consent_record table — GDPR/CCPA audit trail for consent choices
  - is_premium column on user table — hook for future subscription tier
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0014"
down_revision: str | None = "0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # -- ad_config --
    op.create_table(
        "ad_config",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("platform", sa.String, nullable=False, unique=True),
        sa.Column("ads_enabled", sa.Boolean, nullable=False, server_default="0"),
        sa.Column("adsense_publisher_id", sa.String, nullable=False, server_default=""),
        sa.Column("ad_slots", sa.JSON, nullable=False, server_default="{}"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_ad_config_platform", "ad_config", ["platform"])

    # -- consent_record --
    op.create_table(
        "consent_record",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("user_code", sa.String, nullable=True),
        sa.Column("visitor_code", sa.String, nullable=True),
        sa.Column("consent_type", sa.String, nullable=False),
        sa.Column("granted", sa.Boolean, nullable=False),
        sa.Column("ip_address", sa.String, nullable=True),
        sa.Column("user_agent", sa.String, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_consent_record_user_code", "consent_record", ["user_code"])
    op.create_index("ix_consent_record_visitor_code", "consent_record", ["visitor_code"])

    # -- is_premium on user --
    op.add_column("user", sa.Column("is_premium", sa.Boolean, nullable=False, server_default="0"))


def downgrade() -> None:
    op.drop_column("user", "is_premium")
    op.drop_index("ix_consent_record_visitor_code", "consent_record")
    op.drop_index("ix_consent_record_user_code", "consent_record")
    op.drop_table("consent_record")
    op.drop_index("ix_ad_config_platform", "ad_config")
    op.drop_table("ad_config")
