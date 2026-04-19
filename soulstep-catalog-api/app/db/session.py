import os
import time as _time
from typing import Annotated

from fastapi import Depends
from sqlalchemy import event
from sqlmodel import Session, SQLModel, create_engine

from app.core.config import DATABASE_URL as database_url

# connect_args={"check_same_thread": False} is required for SQLite
connect_args = (
    {"check_same_thread": False}
    if database_url.startswith("sqlite")
    else {"connect_timeout": 5}  # TCP timeout for initial Cloud SQL connection (seconds)
)

# Connection pool configuration
pool_config = {}
if not database_url.startswith("sqlite"):
    # For PostgreSQL/Cloud SQL: pool_size + max_overflow must stay under the
    # instance's max_connections limit (db-f1-micro=25, db-g1-small=50).
    # Multiply by the number of worker processes when sizing — e.g. 2 workers
    # × 15 total = 30, which fits a g1-small but not f1-micro.
    # pool_timeout is intentionally short: fail fast so requests don't queue
    # up behind a saturated pool and cause cascading latency.
    pool_config = {
        "pool_size": 8,  # persistent connections per process
        "max_overflow": 4,  # burst headroom — 12 total per process
        "pool_timeout": 5,  # fail fast — surface pool pressure quickly
        "pool_recycle": 120,  # recycle idle connections every 2 min
        "pool_pre_ping": True,  # drop stale connections before use
    }
engine = create_engine(database_url, echo=False, connect_args=connect_args, **pool_config)


# ── Per-request query timing hooks (used by ?_trace=1) ───────────────────────


@event.listens_for(engine, "before_cursor_execute")
def _trace_before(conn, cursor, statement, parameters, context, executemany):
    conn.info["_qs"] = _time.perf_counter()


@event.listens_for(engine, "after_cursor_execute")
def _trace_after(conn, cursor, statement, parameters, context, executemany):
    start = conn.info.pop("_qs", None)
    if start is None:
        return
    from app.lib.tracer import get_tracer  # lazy import avoids circular dependency

    t = get_tracer()
    if t:
        t.record_query(statement, (_time.perf_counter() - start) * 1000)


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

            # Fast-path: skip upgrade if already at head (avoids full migration
            # script traversal on every startup when no migrations are pending).
            from alembic.script import ScriptDirectory

            script = ScriptDirectory.from_config(cfg)
            head_rev = script.get_current_head()
            if ver and ver[0] == head_rev:
                return  # Already at head — nothing to run

        command.upgrade(cfg, "head")
