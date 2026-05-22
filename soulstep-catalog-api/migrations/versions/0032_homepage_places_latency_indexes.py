"""add indexes for homepage and place retrieval latency

Revision ID: 0032
Revises: 0031
Create Date: 2026-05-22
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0032"
down_revision: str | None = "0031"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index("ix_place_lat_lng", "place", ["lat", "lng"])
    op.create_index("ix_place_religion_type_city", "place", ["religion", "place_type", "city"])
    op.create_index(
        "ix_placeimage_place_order",
        "placeimage",
        ["place_code", "display_order", "id"],
    )
    op.create_index(
        "ix_review_place_deleted_rating",
        "review",
        ["place_code", "deleted_at", "rating"],
    )
    op.create_index("ix_group_featured", "group", ["is_featured"])


def downgrade() -> None:
    op.drop_index("ix_group_featured", table_name="group")
    op.drop_index("ix_review_place_deleted_rating", table_name="review")
    op.drop_index("ix_placeimage_place_order", table_name="placeimage")
    op.drop_index("ix_place_religion_type_city", table_name="place")
    op.drop_index("ix_place_lat_lng", table_name="place")
