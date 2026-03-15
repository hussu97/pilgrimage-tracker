"""
Shared test fixtures for the server test suite.

Uses an in-memory SQLite database (StaticPool) so tests are fully isolated
from any real data files and run without any filesystem side-effects.

The engine is session-scoped (schema created once). Per-test data isolation
is provided by the `_reset_db` autouse fixture, which deletes all rows after
each test — far faster than recreating the schema 900+ times.

Performance budget vs naïve per-test engine:
  - Schema create_all × N tests  → schema create_all × 1        (~15 s saved)
  - bcrypt rounds=12 per register → bcrypt rounds=4              (~100 s saved)
  - IMAGE_STORAGE=gcs (real GCS)  → IMAGE_STORAGE=blob (no-op)  (fixes 13 failures)
"""

import json
import os
from pathlib import Path
from unittest.mock import patch

# ── Force in-memory SQLite BEFORE any app module is imported ──────────────────
# config.py calls load_dotenv() at import time, which would load DATABASE_URL
# from .env (pointing at prod). Setting it here first wins because os.environ
# takes priority over dotenv values when the key is already present.
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

import bcrypt as _bcrypt_lib  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402
from sqlmodel import Session, SQLModel, create_engine  # noqa: E402

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


# ── Session-wide performance fixtures ─────────────────────────────────────────


@pytest.fixture(scope="session", autouse=True)
def _force_blob_storage():
    """Override IMAGE_STORAGE=blob for all tests — prevents real GCS calls."""
    from app.services.image_storage import reset_storage_instance

    reset_storage_instance()
    with patch.dict(os.environ, {"IMAGE_STORAGE": "blob"}, clear=False):
        yield
    reset_storage_instance()


@pytest.fixture(scope="session", autouse=True)
def _fast_bcrypt():
    """Patch bcrypt to use rounds=4 for the whole session — ~100× faster than rounds=12."""
    # Capture the real function BEFORE the patch replaces it, to avoid recursion.
    _orig_gensalt = _bcrypt_lib.gensalt
    with patch("bcrypt.gensalt", side_effect=lambda *a, **kw: _orig_gensalt(rounds=4)):
        yield


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
    # Import all models so SQLModel.metadata knows about them before create_all
    import app.db.models  # noqa: F401

    SQLModel.metadata.create_all(engine)
    yield engine
    SQLModel.metadata.drop_all(engine)


@pytest.fixture(autouse=True)
def _reset_db(test_engine):
    """Delete all rows after each test — provides isolation without recreating the schema."""
    yield
    with Session(test_engine) as session:
        for table in reversed(SQLModel.metadata.sorted_tables):
            session.execute(table.delete())
        session.commit()


@pytest.fixture(autouse=True)
def _clear_autocomplete_cache():
    """Clear the in-process autocomplete cache before each test to prevent cross-test pollution."""
    import app.api.v1.search as _search_mod

    _search_mod._autocomplete_cache.clear()
    yield
    _search_mod._autocomplete_cache.clear()


@pytest.fixture(autouse=True)
def _clear_i18n_overrides_cache():
    """Clear the in-process DB-overrides TTL cache before each test.

    _db_overrides_cache in app.api.v1.i18n is a module-level dict with a 1-hour
    TTL.  Without this fixture a test that seeds a DB override populates the
    cache, then _reset_db removes the DB row, but the cached value remains and
    leaks into the next test (e.g. test_unknown_lang_falls_back_to_english sees
    a stale 'override.merge.test' key in the English response).
    """
    import app.api.v1.i18n as _i18n_mod

    _i18n_mod._db_overrides_cache.clear()
    yield
    _i18n_mod._db_overrides_cache.clear()


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
    import app.api.v1.auth as auth_module
    from app.db.session import get_db_session
    from app.main import app

    def override_get_db():
        with Session(test_engine) as session:
            yield session

    app.dependency_overrides[get_db_session] = override_get_db

    with (
        patch("app.main.run_migrations"),
        patch("app.main.run_seed_system"),
        patch("app.api.v1.places.engine", test_engine),
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
