"""Regression tests for the blog metrics Alembic migration."""

from __future__ import annotations

import importlib.util
from pathlib import Path

import sqlalchemy as sa
from sqlalchemy.pool import StaticPool


def _load_migration():
    migration_path = Path(__file__).parents[1] / "migrations" / "versions" / "0030_blog_metrics.py"
    spec = importlib.util.spec_from_file_location("migration_0030_blog_metrics", migration_path)
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


class _RecordingOp:
    def __init__(self, connection):
        self.connection = connection
        self.added_columns: list[str] = []
        self.dropped_columns: list[str] = []

    def get_bind(self):
        return self.connection

    def add_column(self, _table_name: str, column: sa.Column) -> None:
        self.added_columns.append(column.name)

    def drop_column(self, _table_name: str, column_name: str) -> None:
        self.dropped_columns.append(column_name)


def test_blog_metrics_migration_skips_existing_columns():
    engine = _migration_engine()
    migration = _load_migration()
    metadata = sa.MetaData()
    table = sa.Table(
        "blog_post",
        metadata,
        sa.Column("post_code", sa.String(), primary_key=True),
        sa.Column("view_count", sa.Integer(), nullable=False, server_default="0"),
    )
    table.create(engine)

    with engine.connect() as connection:
        fake_op = _RecordingOp(connection)
        migration.op = fake_op

        migration.upgrade()

    assert fake_op.added_columns == ["link_click_count"]


def test_blog_metrics_downgrade_skips_missing_columns():
    engine = _migration_engine()
    migration = _load_migration()
    metadata = sa.MetaData()
    table = sa.Table(
        "blog_post",
        metadata,
        sa.Column("post_code", sa.String(), primary_key=True),
        sa.Column("link_click_count", sa.Integer(), nullable=False, server_default="0"),
    )
    table.create(engine)

    with engine.connect() as connection:
        fake_op = _RecordingOp(connection)
        migration.op = fake_op

        migration.downgrade()

    assert fake_op.dropped_columns == ["link_click_count"]
