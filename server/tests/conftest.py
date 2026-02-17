"""
Shared test fixtures for the server test suite.

Uses an in-memory SQLite database (StaticPool) so tests are fully isolated
from any real data files and run without any filesystem side-effects.

Each test gets a fresh database (function-scoped engine) so there is no
state leakage between tests.
"""
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine
from unittest.mock import patch


# ── i18n seed (session-scoped — loads once, in-memory, no DB needed) ──────────

@pytest.fixture(scope="session", autouse=True)
def seed_i18n():
    """Load i18n data from seed_data.json into the in-memory i18n store once."""
    from app.db import i18n as i18n_db
    seed_path = Path(__file__).parent.parent / "app" / "db" / "seed_data.json"
    if seed_path.exists():
        data = json.loads(seed_path.read_text(encoding="utf-8"))
        if "languages" in data:
            i18n_db.set_languages(data["languages"])
        if "translations" in data:
            i18n_db.set_translations(data["translations"])


# ── DB / session fixtures ──────────────────────────────────────────────────────

@pytest.fixture()
def test_engine():
    """Fresh in-memory SQLite engine per test — guarantees data isolation."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    # Import all models so SQLModel.metadata knows about them before create_all
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

    - Patches out run_migrations() and run_seed_system() (lifespan hooks).
    - Disables slowapi rate limiting on both the app-level and auth-router
      limiter instances so tests are not constrained by per-IP request rates.
    """
    from app.main import app
    from app.db.session import get_db_session
    import app.api.v1.auth as auth_module

    def override_get_db():
        with Session(test_engine) as session:
            yield session

    app.dependency_overrides[get_db_session] = override_get_db

    with (
        patch("app.main.run_migrations"),
        patch("app.main.run_seed_system"),
    ):
        with TestClient(app, raise_server_exceptions=True) as c:
            # Disable rate limiting on both limiter instances AFTER app startup
            app.state.limiter.enabled = False
            auth_module.limiter.enabled = False
            yield c
            # Re-enable so future test sessions start clean
            app.state.limiter.enabled = True
            auth_module.limiter.enabled = True

    app.dependency_overrides.clear()


# ── Auth helper ────────────────────────────────────────────────────────────────

@pytest.fixture()
def auth_client(client):
    """
    Client with a registered + logged-in user.
    Yields (client, access_token, user_code).
    """
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": "test@example.com", "password": "Testpass123!", "display_name": "Tester"},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    token = data["token"]
    user_code = data["user"]["user_code"]
    client.headers.update({"Authorization": f"Bearer {token}"})
    yield client, token, user_code
    client.headers.pop("Authorization", None)


# ── Place helper ───────────────────────────────────────────────────────────────

SAMPLE_PLACE = {
    "place_code": "plc_test0001",
    "name": "Test Mosque",
    "religion": "islam",
    "place_type": "mosque",
    "lat": 25.2048,
    "lng": 55.2708,
    "address": "123 Test St, Dubai",
    "opening_hours": {
        "Monday": "05:00-22:00",
        "Tuesday": "05:00-22:00",
        "Wednesday": "05:00-22:00",
        "Thursday": "05:00-22:00",
        "Friday": "05:00-23:00",
        "Saturday": "05:00-22:00",
        "Sunday": "05:00-22:00",
    },
    "utc_offset_minutes": 240,
}
