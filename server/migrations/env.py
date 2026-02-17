import os
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool
from sqlmodel import SQLModel
from alembic import context

# Import all models so their tables are registered with SQLModel.metadata before
# autogenerate or migration runs inspect the metadata.
import app.db.models  # noqa: F401

config = context.config

# Override sqlalchemy.url from the DATABASE_URL environment variable if set.
# This allows the same alembic.ini to work across dev (SQLite) and prod (PostgreSQL).
database_url = os.environ.get("DATABASE_URL")
if database_url:
    config.set_main_option("sqlalchemy.url", database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Use SQLModel's shared metadata so Alembic sees every table definition.
target_metadata = SQLModel.metadata


def run_migrations_offline() -> None:
    """Run migrations without a live DB connection (generates SQL script)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations against a live DB connection.

    If a connection was injected via config.attributes["connection"] (the normal
    path when called from run_migrations() in session.py), reuse it directly.
    This keeps all Alembic work on a single connection and avoids the SQLite
    write-lock deadlock that occurs when a second engine is created here while
    the application engine already holds a connection open.

    When running via the `alembic` CLI (no injected connection), fall back to
    creating a fresh engine from the config as usual.
    """
    provided = config.attributes.get("connection")
    if provided is not None:
        # Reuse the caller's connection — no new engine created.
        context.configure(connection=provided, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()
        return

    # CLI fallback: create a temporary engine from alembic.ini / env vars.
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
