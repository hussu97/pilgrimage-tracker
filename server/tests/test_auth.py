"""Tests for /api/v1/auth endpoints: register, login, refresh, logout, field-rules."""


REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REFRESH_URL = "/api/v1/auth/refresh"
LOGOUT_URL = "/api/v1/auth/logout"
FIELD_RULES_URL = "/api/v1/auth/field-rules"


def _register(client, email="user@example.com", password="Pass1234!", display_name="Test User"):
    return client.post(REGISTER_URL, json={"email": email, "password": password, "display_name": display_name})


# ── register ───────────────────────────────────────────────────────────────────

class TestRegister:
    def test_register_success(self, client):
        resp = _register(client)
        assert resp.status_code == 200
        data = resp.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["email"] == "user@example.com"
        assert data["user"]["display_name"] == "Test User"
        assert data["user"]["user_code"].startswith("usr_")

    def test_register_duplicate_email(self, client):
        _register(client, email="dup@example.com")
        resp = _register(client, email="dup@example.com")
        assert resp.status_code == 400

    def test_register_sets_refresh_cookie(self, client):
        resp = _register(client, email="cookie@example.com")
        assert resp.status_code == 200
        assert "refresh_token" in resp.cookies


# ── login ──────────────────────────────────────────────────────────────────────

class TestLogin:
    def test_login_success(self, client):
        _register(client, email="login@example.com", password="Mypassw0rd!")
        resp = client.post(LOGIN_URL, json={"email": "login@example.com", "password": "Mypassw0rd!"})
        assert resp.status_code == 200
        assert "token" in resp.json()

    def test_login_wrong_password(self, client):
        _register(client, email="wp@example.com", password="Correct1!")
        resp = client.post(LOGIN_URL, json={"email": "wp@example.com", "password": "wrongwrong"})
        assert resp.status_code == 401

    def test_login_unknown_email(self, client):
        resp = client.post(LOGIN_URL, json={"email": "nobody@example.com", "password": "whatever"})
        assert resp.status_code == 401


# ── refresh ────────────────────────────────────────────────────────────────────

class TestRefresh:
    def test_refresh_with_valid_cookie(self, client):
        resp = _register(client, email="refresh@example.com")
        assert resp.status_code == 200
        refresh_token = resp.cookies.get("refresh_token")
        assert refresh_token

        resp2 = client.post(REFRESH_URL, cookies={"refresh_token": refresh_token})
        assert resp2.status_code == 200
        assert "token" in resp2.json()

    def test_refresh_without_cookie(self, client):
        resp = client.post(REFRESH_URL)
        assert resp.status_code == 401

    def test_refresh_with_invalid_cookie(self, client):
        resp = client.post(REFRESH_URL, cookies={"refresh_token": "totally-fake-token"})
        assert resp.status_code == 401


# ── logout ─────────────────────────────────────────────────────────────────────

class TestLogout:
    def test_logout_clears_cookie(self, client):
        resp = _register(client, email="logout@example.com")
        refresh_token = resp.cookies.get("refresh_token")

        resp2 = client.post(LOGOUT_URL, cookies={"refresh_token": refresh_token})
        assert resp2.status_code == 200
        assert resp2.json().get("ok") is True

    def test_logout_invalidates_refresh_token(self, client):
        resp = _register(client, email="logout2@example.com")
        refresh_token = resp.cookies.get("refresh_token")

        client.post(LOGOUT_URL, cookies={"refresh_token": refresh_token})

        # After logout, refresh should fail
        resp3 = client.post(REFRESH_URL, cookies={"refresh_token": refresh_token})
        assert resp3.status_code == 401


# ── field-rules ────────────────────────────────────────────────────────────────

class TestFieldRules:
    def test_field_rules_returns_fields(self, client):
        resp = client.get(FIELD_RULES_URL)
        assert resp.status_code == 200
        data = resp.json()
        assert "fields" in data
        assert isinstance(data["fields"], list)
        assert len(data["fields"]) > 0

    def test_field_rules_contains_password_field(self, client):
        resp = client.get(FIELD_RULES_URL)
        fields = resp.json()["fields"]
        names = [f["name"] for f in fields]
        assert "password" in names

    def test_field_rules_password_has_min_length_8(self, client):
        resp = client.get(FIELD_RULES_URL)
        fields = resp.json()["fields"]
        pw_field = next(f for f in fields if f["name"] == "password")
        assert pw_field["required"] is True
        min_rule = next((r for r in pw_field["rules"] if r["type"] == "min_length"), None)
        assert min_rule is not None
        assert min_rule["value"] == 8

    def test_field_rules_password_has_character_class_rules(self, client):
        resp = client.get(FIELD_RULES_URL)
        fields = resp.json()["fields"]
        pw_field = next(f for f in fields if f["name"] == "password")
        rule_types = {r["type"] for r in pw_field["rules"]}
        assert "require_uppercase" in rule_types
        assert "require_lowercase" in rule_types
        assert "require_digit" in rule_types

    def test_field_rules_no_auth_required(self, client):
        """Field rules endpoint must be publicly accessible (no auth needed)."""
        resp = client.get(FIELD_RULES_URL)
        assert resp.status_code == 200
