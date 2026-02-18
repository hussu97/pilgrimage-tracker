import os
from typing import Annotated

from fastapi import Depends
from sqlmodel import Session, SQLModel, create_engine

# Use DATABASE_URL from environment or fallback to local sqlite
sqlite_file_name = "pilgrimage.db"
sqlite_url = f"sqlite:///{sqlite_file_name}"
database_url = os.environ.get("DATABASE_URL", sqlite_url)

# connect_args={"check_same_thread": False} is required for SQLite
connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}

# Connection pool configuration
pool_config = {}
if not database_url.startswith("sqlite"):
    # For PostgreSQL/MySQL, configure connection pool
    pool_config = {
        "pool_size": 20,  # Increase from default 5
        "max_overflow": 30,  # Increase from default 10
        "pool_timeout": 30,  # Timeout in seconds
        "pool_recycle": 3600,  # Recycle connections after 1 hour
        "pool_pre_ping": True,  # Verify connections before using
    }
engine = create_engine(database_url, echo=False, connect_args=connect_args, **pool_config)


def create_db_and_tables():
    SQLModel.metadata.create_all(engine)


def get_db_session():
    """Dependency for database session management.

    Creates one database session per HTTP request and automatically
    closes it when the request completes. This prevents connection
    pool exhaustion by reusing a single session throughout the request.
    """
    with Session(engine) as session:
        yield session


# Type alias for FastAPI dependency injection
# Usage: def my_endpoint(session: SessionDep, ...):
SessionDep = Annotated[Session, Depends(get_db_session)]


def run_migrations() -> None:
    """Apply all pending Alembic migrations to head.

    Uses a single connection from the application engine for every Alembic
    operation (bootstrap stamp + upgrade). This avoids the SQLite write-lock
    contention that occurs when env.py creates its own engine from config while
    the application engine already holds a connection.

    Bootstrap logic: if the DB already has tables but no alembic_version stamp
    (e.g. the schema was created via create_all, or a previous startup was
    interrupted before the stamp committed), the current state is stamped as
    head so Alembic skips re-creating tables that already exist.
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
    cfg.set_main_option("sqlalchemy.url", database_url)

    # Open ONE connection and keep it open for the entire operation.
    # Pass it to env.py via cfg.attributes so env.py reuses it instead of
    # creating a second engine (which would deadlock on SQLite).
    with engine.begin() as connection:
        cfg.attributes["connection"] = connection

        # Bootstrap: stamp head if tables exist with no version row so that
        # upgrade below is a no-op (doesn't try to re-create existing tables).
        inspector = inspect(connection)
        existing_tables = set(inspector.get_table_names())
        if existing_tables:
            needs_stamp = "alembic_version" not in existing_tables
            if not needs_stamp:
                ver = connection.execute(text("SELECT version_num FROM alembic_version")).fetchone()
                needs_stamp = ver is None
            if needs_stamp:
                command.stamp(cfg, "head")
                return  # Already at current head; upgrade would be a no-op

        command.upgrade(cfg, "head")
