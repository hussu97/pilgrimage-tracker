import os
from typing import Annotated

from fastapi import Depends
from sqlmodel import Session, SQLModel, create_engine

# DATABASE_URL takes priority — set to a PostgreSQL connection string for
# persistent run history that survives Cloud Run cold starts (PRODUCTION.md §7f).
# Falls back to SQLite via SCRAPER_DB_PATH for local dev / ephemeral deployments.
_database_url = os.environ.get("DATABASE_URL")

if _database_url:
    db_url = _database_url
    # f1-micro has 25 max connections shared across all services.
    # Scraper gets 5 total (pool_size + max_overflow) leaving 12 for catalog-api
    # and 8 reserved for admin/migrations.
    connect_args: dict = {"connect_timeout": 5}
    _pool_config: dict = {
        "pool_size": 3,  # persistent connections per process
        "max_overflow": 2,  # burst headroom — 5 total per process
        "pool_timeout": 5,  # fail fast
        "pool_recycle": 120,  # recycle idle connections every 2 min
        "pool_pre_ping": True,
    }
    engine = create_engine(db_url, echo=False, connect_args=connect_args, **_pool_config)
else:
    # SCRAPER_DB_PATH lets you relocate the SQLite file to a persistent volume.
    # Default: scraper.db in the working directory (fine for local dev).
    # Production: set to /data/scraper.db and mount a volume at /data.
    _db_path = os.environ.get("SCRAPER_DB_PATH", "scraper.db")
    db_url = f"sqlite:///{_db_path}"
    connect_args = {"check_same_thread": False}
    # NullPool gives each Session its own fresh connection and closes it on
    # checkin.  This prevents SQLAlchemy's default SingletonThreadPool from
    # sharing one DBAPI connection across concurrent async sessions, which
    # can cause StaleDataError / PendingRollbackError when the enrichment
    # pipeline runs up to 10 workers concurrently in the same asyncio thread.
    from sqlalchemy.pool import NullPool

    engine = create_engine(db_url, echo=False, connect_args=connect_args, poolclass=NullPool)


def create_db_and_tables():
    SQLModel.metadata.create_all(engine)


def run_migrations() -> None:
    """Apply all pending Alembic migrations to head.

    Uses a single connection from the application engine for every Alembic
    operation (bootstrap stamp + upgrade). This avoids the SQLite write-lock
    contention that occurs when env.py creates its own engine from config while
    the application engine already holds a connection.

    Bootstrap logic: if the DB already has tables but no alembic_version stamp
    (e.g. the schema was created via create_all), the current state is stamped
    as head so Alembic skips re-creating tables that already exist.
    """
    from alembic import command
    from alembic.config import Config
    from sqlalchemy import inspect, text

    ini_path = os.path.normpath(os.path.join(os.path.dirname(__file__), "../..", "alembic.ini"))
    migrations_path = os.path.normpath(
        os.path.join(os.path.dirname(__file__), "../..", "migrations")
    )

    cfg = Config(ini_path)
    cfg.set_main_option("script_location", migrations_path)
    cfg.set_main_option("sqlalchemy.url", db_url)

    # The scraper uses its own version table to avoid colliding with the
    # catalog-api's alembic_version table (both services share the same DB).
    _VERSION_TABLE = "scraper_alembic_version"

    with engine.begin() as connection:
        cfg.attributes["connection"] = connection

        inspector = inspect(connection)
        existing_tables = set(inspector.get_table_names())

        # Check for scraper-specific tables, NOT just any table.  The scraper
        # shares a PostgreSQL DB with the catalog-api, so existing_tables is
        # always non-empty (catalog-api tables are present).  We only skip
        # running migrations if the scraper's own core table already exists.
        scraper_bootstrapped = "datalocation" in existing_tables

        if scraper_bootstrapped:
            needs_stamp = _VERSION_TABLE not in existing_tables
            if not needs_stamp:
                ver = connection.execute(
                    text(f"SELECT version_num FROM {_VERSION_TABLE}")
                ).fetchone()
                needs_stamp = ver is None
            if needs_stamp:
                command.stamp(cfg, "head")
                return

        command.upgrade(cfg, "head")


def get_db_session():
    """Dependency for database session management.

    Creates one database session per HTTP request and automatically
    closes it when the request completes.
    """
    with Session(engine) as session:
        yield session


# Type alias for FastAPI dependency injection
# Usage: def my_endpoint(session: SessionDep, ...):
SessionDep = Annotated[Session, Depends(get_db_session)]
