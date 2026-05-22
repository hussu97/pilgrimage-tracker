"""Regression tests for the homepage/place latency index migration."""

from __future__ import annotations

import importlib.util
from pathlib import Path

import sqlalchemy as sa
from sqlalchemy.pool import StaticPool


def _load_migration():
    migration_path = (
        Path(__file__).parents[1]
        / "migrations"
        / "versions"
        / "0032_homepage_places_latency_indexes.py"
    )
    spec = importlib.util.spec_from_file_location(
        "migration_0032_homepage_places_latency_indexes", migration_path
    )
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _migration_engine():
    return sa.create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )


def _create_tables(engine, *, existing_indexes: list[tuple[str, str, list[str]]] | None = None):
    metadata = sa.MetaData()
    place = sa.Table(
        "place",
        metadata,
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("lat", sa.Float()),
        sa.Column("lng", sa.Float()),
        sa.Column("religion", sa.String()),
        sa.Column("place_type", sa.String()),
        sa.Column("city", sa.String()),
    )
    placeimage = sa.Table(
        "placeimage",
        metadata,
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("place_code", sa.String()),
        sa.Column("display_order", sa.Integer()),
    )
    review = sa.Table(
        "review",
        metadata,
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("place_code", sa.String()),
        sa.Column("deleted_at", sa.DateTime()),
        sa.Column("rating", sa.Integer()),
    )
    group = sa.Table(
        "group",
        metadata,
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("is_featured", sa.Boolean()),
    )
    table_map = {"place": place, "placeimage": placeimage, "review": review, "group": group}
    for index_name, table_name, columns in existing_indexes or []:
        sa.Index(index_name, *(table_map[table_name].c[column] for column in columns))
    metadata.create_all(engine)


class _RecordingOp:
    def __init__(self, connection):
        self.connection = connection
        self.created_indexes: list[str] = []
        self.dropped_indexes: list[str] = []

    def get_bind(self):
        return self.connection

    def create_index(self, index_name: str, _table_name: str, _columns: list[str]) -> None:
        self.created_indexes.append(index_name)

    def drop_index(self, index_name: str, table_name: str) -> None:
        self.dropped_indexes.append(f"{table_name}.{index_name}")


def test_homepage_latency_indexes_migration_skips_partial_existing_indexes():
    engine = _migration_engine()
    migration = _load_migration()
    _create_tables(
        engine,
        existing_indexes=[
            ("ix_place_lat_lng", "place", ["lat", "lng"]),
            ("ix_placeimage_place_order", "placeimage", ["place_code", "display_order", "id"]),
        ],
    )

    with engine.connect() as connection:
        fake_op = _RecordingOp(connection)
        migration.op = fake_op

        migration.upgrade()

    assert fake_op.created_indexes == [
        "ix_place_religion_type_city",
        "ix_review_place_deleted_rating",
        "ix_group_featured",
    ]


def test_homepage_latency_indexes_downgrade_skips_missing_indexes():
    engine = _migration_engine()
    migration = _load_migration()
    _create_tables(
        engine,
        existing_indexes=[
            ("ix_place_lat_lng", "place", ["lat", "lng"]),
            ("ix_group_featured", "group", ["is_featured"]),
        ],
    )

    with engine.connect() as connection:
        fake_op = _RecordingOp(connection)
        migration.op = fake_op

        migration.downgrade()

    assert fake_op.dropped_indexes == ["group.ix_group_featured", "place.ix_place_lat_lng"]
