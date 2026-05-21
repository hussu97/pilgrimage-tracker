"""Regression tests for the ad config Alembic migration."""

from __future__ import annotations

import importlib.util
from pathlib import Path

import sqlalchemy as sa
from sqlalchemy.pool import StaticPool


def _load_migration():
    migration_path = (
        Path(__file__).parents[1] / "migrations" / "versions" / "0031_ad_config_ad_server.py"
    )
    spec = importlib.util.spec_from_file_location(
        "migration_0031_ad_config_ad_server", migration_path
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


def test_ad_config_migration_skips_existing_ad_server_column():
    engine = _migration_engine()
    migration = _load_migration()
    metadata = sa.MetaData()
    table = sa.Table(
        "ad_config",
        metadata,
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("ad_server", sa.String(), nullable=False, server_default="adsense"),
    )
    table.create(engine)

    with engine.connect() as connection:
        fake_op = _RecordingOp(connection)
        migration.op = fake_op

        migration.upgrade()

    assert fake_op.added_columns == []


def test_ad_config_migration_adds_missing_ad_server_column():
    engine = _migration_engine()
    migration = _load_migration()
    metadata = sa.MetaData()
    table = sa.Table("ad_config", metadata, sa.Column("id", sa.Integer(), primary_key=True))
    table.create(engine)

    with engine.connect() as connection:
        fake_op = _RecordingOp(connection)
        migration.op = fake_op

        migration.upgrade()

    assert fake_op.added_columns == ["ad_server"]


def test_ad_config_downgrade_skips_missing_ad_server_column():
    engine = _migration_engine()
    migration = _load_migration()
    metadata = sa.MetaData()
    table = sa.Table("ad_config", metadata, sa.Column("id", sa.Integer(), primary_key=True))
    table.create(engine)

    with engine.connect() as connection:
        fake_op = _RecordingOp(connection)
        migration.op = fake_op

        migration.downgrade()

    assert fake_op.dropped_columns == []
