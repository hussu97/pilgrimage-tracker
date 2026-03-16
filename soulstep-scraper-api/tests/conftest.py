"""
Shared test fixtures for the data_scraper test suite.

Uses an in-memory SQLite database (StaticPool) so tests are fully isolated
from any real data files and run without filesystem side-effects.

The engine is session-scoped (schema created once). Per-test data isolation
is provided by the `_reset_db` autouse fixture, which deletes only dirty
tables after each test — far faster than recreating the schema 686+ times.
"""

import os
import sys
from unittest.mock import patch

# ── Force in-memory SQLite BEFORE any app module is imported ──────────────────
# session.py reads DATABASE_URL from os.environ at module level and creates the
# engine immediately. Setting it here first ensures tests never touch the real DB.
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import event  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402
from sqlmodel import Session, SQLModel, create_engine  # noqa: E402

# Make the data_scraper package importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# ── Capture real startup functions before session-scoped patches ──────────────
# The session-scoped `client` fixture patches these at module level for the
# entire session.  Tests that need the real function must use this reference.
from app.main import _mark_interrupted_runs as _real_mark_interrupted_runs  # noqa: E402


@pytest.fixture()
def real_mark_interrupted_runs():
    """Provide the real _mark_interrupted_runs, unaffected by session-scoped patches."""
    return _real_mark_interrupted_runs


# ── Dirty-table tracking for smart _reset_db ─────────────────────────────────
_dirty_tables: set[str] = set()


# ── Rate limiter reset ────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def reset_rate_limiter():
    """
    Reset the global RateLimiter and AsyncRateLimiter singletons before each test.

    Without this, the last-call timestamps from one test would carry over
    into the next, causing unexpected sleeps and slow test suites.
    """
    import app.scrapers.base as _base

    _base._rate_limiter_instance = None
    _base._async_rate_limiter_instance = None
    yield
    _base._rate_limiter_instance = None
    _base._async_rate_limiter_instance = None


# ── DB / session fixtures ──────────────────────────────────────────────────────


@pytest.fixture(scope="session")
def test_engine():
    """
    Single in-memory SQLite engine shared across the entire test session.
    Schema is created once; per-test isolation is handled by `_reset_db`.
    """
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    import app.db.models  # noqa: F401

    SQLModel.metadata.create_all(engine)

    # Track which tables receive writes so _reset_db can skip clean tables
    @event.listens_for(engine, "before_cursor_execute")
    def _track_writes(conn, cursor, statement, parameters, context, executemany):
        upper = statement.lstrip().upper()
        if upper.startswith(("INSERT", "UPDATE")):
            parts = statement.split()
            if upper.startswith("INSERT") and len(parts) >= 3:
                _dirty_tables.add(parts[2].strip('"').strip("'").strip("`"))
            elif upper.startswith("UPDATE") and len(parts) >= 2:
                _dirty_tables.add(parts[1].strip('"').strip("'").strip("`"))

    yield engine
    event.remove(engine, "before_cursor_execute", _track_writes)
    SQLModel.metadata.drop_all(engine)


@pytest.fixture(autouse=True)
def _reset_db(test_engine):
    """Delete rows only from tables that received writes — provides isolation efficiently."""
    _dirty_tables.clear()
    yield
    if _dirty_tables:
        with Session(test_engine) as session:
            for table in reversed(SQLModel.metadata.sorted_tables):
                if table.name in _dirty_tables:
                    session.execute(table.delete())
            session.commit()
    _dirty_tables.clear()


@pytest.fixture()
def db_session(test_engine):
    """Per-test database session."""
    with Session(test_engine) as session:
        yield session


# ── HTTP client fixture ────────────────────────────────────────────────────────


@pytest.fixture(scope="session")
def client(test_engine):
    """
    FastAPI TestClient backed by the in-memory test DB.

    Session-scoped: the ASGI lifespan starts once for the entire test run.
    Per-test DB isolation is handled by `_reset_db`.

    Patches out create_db_and_tables(), seed_geo_boundaries(), and
    seed_place_type_mappings() so no real startup side-effects occur.
    """
    from app.db.session import get_db_session
    from app.main import app

    def override_get_db():
        with Session(test_engine) as session:
            yield session

    app.dependency_overrides[get_db_session] = override_get_db

    with (
        patch("app.main.run_migrations"),
        patch("app.main.seed_geo_boundaries"),
        patch("app.main.seed_place_type_mappings"),
        patch("app.main._mark_interrupted_runs"),
    ):
        with TestClient(app, raise_server_exceptions=True) as c:
            yield c

    app.dependency_overrides.clear()


@pytest.fixture()
def error_client(test_engine):
    """
    FastAPI TestClient with raise_server_exceptions=False.

    Allows exception handlers to run and produce proper HTTP responses,
    enabling tests of the error handling middleware in main.py.

    Preserves the session-scoped client's dependency overrides on teardown.
    """
    from app.db.session import get_db_session
    from app.main import app

    # Save existing overrides so the session-scoped client's override survives
    saved_overrides = dict(app.dependency_overrides)

    def override_get_db():
        with Session(test_engine) as session:
            yield session

    app.dependency_overrides[get_db_session] = override_get_db

    with (
        patch("app.main.run_migrations"),
        patch("app.main.seed_geo_boundaries"),
        patch("app.main.seed_place_type_mappings"),
        patch("app.main._mark_interrupted_runs"),
    ):
        with TestClient(app, raise_server_exceptions=False) as c:
            yield c

    # Restore session-scoped overrides instead of clearing all
    app.dependency_overrides.clear()
    app.dependency_overrides.update(saved_overrides)
