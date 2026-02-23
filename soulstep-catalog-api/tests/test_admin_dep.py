"""Tests for the AdminDep dependency and admin access control.

Verifies:
- Non-authenticated requests get 401
- Authenticated non-admin users get 403
- Authenticated admin users get 200
- create_admin.py script logic (create new admin, promote existing user)
"""

import secrets
import string

from sqlmodel import Session, select

from app.core.security import hash_password
from app.db.models import User, UserSettings

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _generate_user_code() -> str:
    alphabet = string.ascii_lowercase + string.digits
    suffix = "".join(secrets.choice(alphabet) for _ in range(8))
    return f"usr_{suffix}"


def _register(client, email="user@example.com", password="Testpass123!", display_name="Tester"):
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "display_name": display_name},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def _login(client, email, password="Testpass123!"):
    resp = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    return resp.json()["token"]


def _make_admin(user_code: str, session: Session) -> None:
    """Directly promote a user to admin via the DB session."""
    user = session.exec(select(User).where(User.user_code == user_code)).first()
    assert user is not None
    user.is_admin = True
    session.add(user)
    session.commit()


# ---------------------------------------------------------------------------
# Test: is_admin included in /users/me response
# ---------------------------------------------------------------------------


class TestIsAdminInUserResponse:
    def test_non_admin_me_returns_is_admin_false(self, client):
        data = _register(client)
        token = data["token"]
        resp = client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        assert resp.json()["is_admin"] is False

    def test_admin_me_returns_is_admin_true(self, client, db_session):
        data = _register(client, email="admin@example.com")
        token = data["token"]
        user_code = data["user"]["user_code"]
        _make_admin(user_code, db_session)

        resp = client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        assert resp.json()["is_admin"] is True


# ---------------------------------------------------------------------------
# Test: Admin endpoint access control (using scraper proxy as a canary)
# ---------------------------------------------------------------------------


class TestAdminDep:
    def test_unauthenticated_gets_401(self, client):
        resp = client.get("/api/v1/admin/scraper/data-locations")
        assert resp.status_code == 401

    def test_non_admin_gets_403(self, client):
        data = _register(client)
        token = data["token"]
        resp = client.get(
            "/api/v1/admin/scraper/data-locations",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403
        assert resp.json()["detail"] == "Admin access required"

    def test_admin_passes_dep(self, client, db_session):
        """Admin users pass AdminDep — confirmed by not receiving 401 or 403.
        The scraper may be unreachable (503) or return its own error (non-auth)."""
        from unittest.mock import AsyncMock, patch

        data = _register(client, email="admin2@example.com")
        token = data["token"]
        user_code = data["user"]["user_code"]
        _make_admin(user_code, db_session)

        # Mock the httpx client so the proxy returns a controlled response.
        # Use MagicMock for the response because httpx Response.json() is synchronous.
        from unittest.mock import MagicMock

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = []

        with patch("app.api.v1.admin.scraper_proxy.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.request = AsyncMock(return_value=mock_response)
            mock_client_cls.return_value = mock_client

            resp = client.get(
                "/api/v1/admin/scraper/data-locations",
                headers={"Authorization": f"Bearer {token}"},
            )

        # Admin guard passed; response is from the mocked scraper
        assert resp.status_code == 200
        assert resp.json() == []


# ---------------------------------------------------------------------------
# Test: create_admin script logic
# ---------------------------------------------------------------------------


class TestCreateAdminScript:
    """Unit-test the core logic used by scripts/create_admin.py."""

    def test_create_new_admin_user(self, test_engine):
        user_code = _generate_user_code()
        with Session(test_engine) as session:
            user = User(
                user_code=user_code,
                email="newadmin@example.com",
                password_hash=hash_password("AdminPass1"),
                display_name="Admin",
                is_admin=True,
            )
            settings = UserSettings(user_code=user_code)
            session.add(user)
            session.add(settings)
            session.commit()

        with Session(test_engine) as session:
            created = session.exec(select(User).where(User.email == "newadmin@example.com")).first()
            assert created is not None
            assert created.is_admin is True
            assert created.display_name == "Admin"

    def test_promote_existing_user(self, test_engine):
        user_code = _generate_user_code()
        with Session(test_engine) as session:
            user = User(
                user_code=user_code,
                email="promote@example.com",
                password_hash=hash_password("Testpass123!"),
                display_name="Regular",
                is_admin=False,
            )
            settings = UserSettings(user_code=user_code)
            session.add(user)
            session.add(settings)
            session.commit()

        # Simulate the promotion logic from create_admin.py
        with Session(test_engine) as session:
            existing = session.exec(select(User).where(User.email == "promote@example.com")).first()
            assert existing is not None
            assert existing.is_admin is False
            existing.is_admin = True
            session.add(existing)
            session.commit()

        with Session(test_engine) as session:
            promoted = session.exec(select(User).where(User.email == "promote@example.com")).first()
            assert promoted.is_admin is True

    def test_already_admin_unchanged(self, test_engine):
        user_code = _generate_user_code()
        with Session(test_engine) as session:
            user = User(
                user_code=user_code,
                email="alreadyadmin@example.com",
                password_hash=hash_password("AdminPass1"),
                display_name="Admin",
                is_admin=True,
            )
            settings = UserSettings(user_code=user_code)
            session.add(user)
            session.add(settings)
            session.commit()

        # Verify no change when already admin
        with Session(test_engine) as session:
            existing = session.exec(
                select(User).where(User.email == "alreadyadmin@example.com")
            ).first()
            assert existing.is_admin is True
            # Idempotent — setting True again should be harmless
            existing.is_admin = True
            session.add(existing)
            session.commit()

        with Session(test_engine) as session:
            still_admin = session.exec(
                select(User).where(User.email == "alreadyadmin@example.com")
            ).first()
            assert still_admin.is_admin is True
