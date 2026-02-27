"""
Shared test fixtures for the data_scraper test suite.

Uses an in-memory SQLite database (StaticPool) so tests are fully isolated
from any real data files and run without filesystem side-effects.

Each test gets a fresh database (function-scoped engine) so there is no
state leakage between tests.
"""

import os
import sys
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

# Make the data_scraper package importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


# ── Rate limiter reset ────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def reset_rate_limiter():
    """
    Reset the global RateLimiter singleton before each test.

    Without this, the last-call timestamps from one test would carry over
    into the next, causing unexpected sleeps and slow test suites.
    """
    import app.scrapers.base as _base

    _base._rate_limiter_instance = None
    yield
    _base._rate_limiter_instance = None


# ── DB / session fixtures ──────────────────────────────────────────────────────


@pytest.fixture()
def test_engine():
    """Fresh in-memory SQLite engine per test — guarantees data isolation."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    import app.db.models  # noqa: F401

    SQLModel.metadata.create_all(engine)
    yield engine
    SQLModel.metadata.drop_all(engine)


@pytest.fixture()
def db_session(test_engine):
    """Per-test database session."""
    with Session(test_engine) as session:
        yield session


# ── HTTP client fixture ────────────────────────────────────────────────────────


@pytest.fixture()
def client(test_engine):
    """
    FastAPI TestClient backed by the in-memory test DB.

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
        with TestClient(app, raise_server_exceptions=False) as c:
            yield c

    app.dependency_overrides.clear()
