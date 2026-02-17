"""
Extended auth tests: forgot-password and reset-password flows.
"""
from unittest.mock import patch

REGISTER_URL = "/api/v1/auth/register"
FORGOT_URL = "/api/v1/auth/forgot-password"
RESET_URL = "/api/v1/auth/reset-password"
LOGIN_URL = "/api/v1/auth/login"

_UID = 0


def _uid():
    global _UID
    _UID += 1
    return _UID


def _register(client, password="Pass1234!"):
    uid = _uid()
    email = f"pwreset{uid}@example.com"
    resp = client.post(
        REGISTER_URL,
        json={"email": email, "password": password, "display_name": "Reset User"},
    )
    assert resp.status_code == 200
    return email, resp.json()["user"]["user_code"]


# ── forgot-password ────────────────────────────────────────────────────────────

class TestForgotPassword:
    def test_returns_ok_for_registered_email(self, client):
        email, _ = _register(client)
        with patch("app.api.v1.auth._send_reset_email"):
            resp = client.post(FORGOT_URL, json={"email": email})
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_returns_ok_for_unknown_email(self, client):
        # Should not reveal whether email is registered
        resp = client.post(FORGOT_URL, json={"email": "nobody@example.com"})
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_send_reset_email_called_for_registered_user(self, client):
        email, _ = _register(client)
        with patch("app.api.v1.auth._send_reset_email") as mock_send:
            client.post(FORGOT_URL, json={"email": email})
        mock_send.assert_called_once()

    def test_send_reset_email_not_called_for_unknown_email(self, client):
        with patch("app.api.v1.auth._send_reset_email") as mock_send:
            client.post(FORGOT_URL, json={"email": "ghost@example.com"})
        mock_send.assert_not_called()


# ── reset-password ─────────────────────────────────────────────────────────────

class TestResetPassword:
    def _get_reset_token(self, client, db_session, user_code):
        """Create a valid reset token directly in the DB."""
        from datetime import datetime, timedelta
        from app.db import store
        token = "testresettk0001"
        expires = datetime.utcnow() + timedelta(hours=1)
        store.save_password_reset(token, user_code, expires, db_session)
        return token

    def test_valid_token_resets_password(self, client, db_session):
        email, user_code = _register(client)
        token = self._get_reset_token(client, db_session, user_code)

        resp = client.post(RESET_URL, json={"token": token, "newPassword": "NewPass1234!"})
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_can_login_with_new_password(self, client, db_session):
        email, user_code = _register(client, password="OldPass1234!")
        token = self._get_reset_token(client, db_session, user_code)

        client.post(RESET_URL, json={"token": token, "newPassword": "NewPass5678!"})

        resp = client.post(LOGIN_URL, json={"email": email, "password": "NewPass5678!"})
        assert resp.status_code == 200

    def test_old_password_fails_after_reset(self, client, db_session):
        email, user_code = _register(client, password="OldPass1234!")
        token = self._get_reset_token(client, db_session, user_code)

        client.post(RESET_URL, json={"token": token, "newPassword": "NewPass5678!"})

        resp = client.post(LOGIN_URL, json={"email": email, "password": "OldPass1234!"})
        assert resp.status_code == 401

    def test_invalid_token_returns_400(self, client):
        resp = client.post(RESET_URL, json={"token": "invalid-token", "newPassword": "NewPass1!"})
        assert resp.status_code == 400

    def test_token_can_only_be_used_once(self, client, db_session):
        email, user_code = _register(client)
        token = self._get_reset_token(client, db_session, user_code)

        client.post(RESET_URL, json={"token": token, "newPassword": "NewPass1234!"})
        resp = client.post(RESET_URL, json={"token": token, "newPassword": "AnotherPass1!"})
        assert resp.status_code == 400

    def test_weak_new_password_rejected(self, client, db_session):
        email, user_code = _register(client)
        token = self._get_reset_token(client, db_session, user_code)

        # "weakpass" has no uppercase or digit
        resp = client.post(RESET_URL, json={"token": token, "newPassword": "weakpass"})
        assert resp.status_code == 422
