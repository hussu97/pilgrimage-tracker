import os
from typing import Annotated

from fastapi import Depends
from sqlmodel import Session, SQLModel, create_engine

# SCRAPER_DB_PATH lets you relocate the SQLite file to a persistent volume.
# Default: scraper.db in the working directory (fine for local dev).
# Production: set to /data/scraper.db and mount a volume at /data.
_db_path = os.environ.get("SCRAPER_DB_PATH", "scraper.db")
sqlite_url = f"sqlite:///{_db_path}"

connect_args = {"check_same_thread": False}
engine = create_engine(sqlite_url, echo=False, connect_args=connect_args)


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
    cfg.set_main_option("sqlalchemy.url", sqlite_url)

    with engine.begin() as connection:
        cfg.attributes["connection"] = connection

        inspector = inspect(connection)
        existing_tables = set(inspector.get_table_names())
        if existing_tables:
            needs_stamp = "alembic_version" not in existing_tables
            if not needs_stamp:
                ver = connection.execute(text("SELECT version_num FROM alembic_version")).fetchone()
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
