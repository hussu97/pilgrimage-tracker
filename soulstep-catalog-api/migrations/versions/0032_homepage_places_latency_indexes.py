"""add indexes for homepage and place retrieval latency

Revision ID: 0032
Revises: 0031
Create Date: 2026-05-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0032"
down_revision: str | None = "0031"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _index_exists(table_name: str, index_name: str) -> bool:
    indexes = sa.inspect(op.get_bind()).get_indexes(table_name)
    return any(index["name"] == index_name for index in indexes)


def _create_index_if_missing(index_name: str, table_name: str, columns: list[str]) -> None:
    if not _index_exists(table_name, index_name):
        op.create_index(index_name, table_name, columns)


def _drop_index_if_present(index_name: str, table_name: str) -> None:
    if _index_exists(table_name, index_name):
        op.drop_index(index_name, table_name=table_name)


def upgrade() -> None:
    _create_index_if_missing("ix_place_lat_lng", "place", ["lat", "lng"])
    _create_index_if_missing(
        "ix_place_religion_type_city", "place", ["religion", "place_type", "city"]
    )
    _create_index_if_missing(
        "ix_placeimage_place_order",
        "placeimage",
        ["place_code", "display_order", "id"],
    )
    _create_index_if_missing(
        "ix_review_place_deleted_rating",
        "review",
        ["place_code", "deleted_at", "rating"],
    )
    _create_index_if_missing("ix_group_featured", "group", ["is_featured"])


def downgrade() -> None:
    _drop_index_if_present("ix_group_featured", "group")
    _drop_index_if_present("ix_review_place_deleted_rating", "review")
    _drop_index_if_present("ix_placeimage_place_order", "placeimage")
    _drop_index_if_present("ix_place_religion_type_city", "place")
    _drop_index_if_present("ix_place_lat_lng", "place")
