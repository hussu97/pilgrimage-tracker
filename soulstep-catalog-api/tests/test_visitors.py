"""Tests for /api/v1/visitors endpoints and visitor settings merge on auth."""

VISITORS_URL = "/api/v1/visitors"
REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"


def _create_visitor(client):
    resp = client.post(VISITORS_URL)
    assert resp.status_code == 200
    return resp.json()


# ── Visitor creation ───────────────────────────────────────────────────────────


class TestCreateVisitor:
    def test_create_visitor_returns_code(self, client):
        resp = client.post(VISITORS_URL)
        assert resp.status_code == 200
        data = resp.json()
        assert "visitor_code" in data
        assert data["visitor_code"].startswith("vis_")
        assert "created_at" in data

    def test_create_visitor_creates_unique_codes(self, client):
        code1 = client.post(VISITORS_URL).json()["visitor_code"]
        code2 = client.post(VISITORS_URL).json()["visitor_code"]
        assert code1 != code2


# ── Visitor settings (default) ─────────────────────────────────────────────────


class TestGetVisitorSettings:
    def test_get_visitor_settings_defaults(self, client):
        v = _create_visitor(client)
        resp = client.get(f"{VISITORS_URL}/{v['visitor_code']}/settings")
        assert resp.status_code == 200
        data = resp.json()
        assert data["theme"] == "system"
        assert data["units"] == "km"
        assert data["language"] == "en"
        assert data["religions"] == []

    def test_get_visitor_not_found(self, client):
        resp = client.get(f"{VISITORS_URL}/vis_nonexistent/settings")
        assert resp.status_code == 404


# ── Visitor settings update ────────────────────────────────────────────────────


class TestUpdateVisitorSettings:
    def test_patch_updates_settings(self, client):
        v = _create_visitor(client)
        code = v["visitor_code"]
        resp = client.patch(
            f"{VISITORS_URL}/{code}/settings",
            json={"language": "ar", "theme": "dark", "units": "miles"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["language"] == "ar"
        assert data["theme"] == "dark"
        assert data["units"] == "miles"

    def test_patch_reflects_on_get(self, client):
        v = _create_visitor(client)
        code = v["visitor_code"]
        client.patch(f"{VISITORS_URL}/{code}/settings", json={"language": "hi"})
        resp = client.get(f"{VISITORS_URL}/{code}/settings")
        assert resp.json()["language"] == "hi"

    def test_patch_religions(self, client):
        v = _create_visitor(client)
        code = v["visitor_code"]
        resp = client.patch(
            f"{VISITORS_URL}/{code}/settings",
            json={"religions": ["islam"]},
        )
        assert resp.status_code == 200
        assert resp.json()["religions"] == ["islam"]

    def test_patch_visitor_not_found(self, client):
        resp = client.patch(
            f"{VISITORS_URL}/vis_nonexistent/settings",
            json={"language": "ar"},
        )
        assert resp.status_code == 404


# ── Visitor merge on login/register ───────────────────────────────────────────


class TestMergeVisitorOnRegister:
    def test_merge_visitor_on_register(self, client):
        # Create visitor and set language to Arabic
        v = _create_visitor(client)
        code = v["visitor_code"]
        client.patch(f"{VISITORS_URL}/{code}/settings", json={"language": "ar"})

        # Register with visitor_code
        resp = client.post(
            REGISTER_URL,
            json={
                "email": "merge_reg@example.com",
                "password": "Pass1234!",
                "visitor_code": code,
            },
        )
        assert resp.status_code == 200
        _user_code = resp.json()["user"]["user_code"]

        # Check user settings were merged (language = ar)
        token = resp.json()["token"]
        settings_resp = client.get(
            "/api/v1/users/me/settings",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert settings_resp.status_code == 200
        assert settings_resp.json()["language"] == "ar"

    def test_merge_visitor_not_found_ignored(self, client):
        # Using a non-existent visitor_code should not cause an error
        resp = client.post(
            REGISTER_URL,
            json={
                "email": "no_visitor@example.com",
                "password": "Pass1234!",
                "visitor_code": "vis_doesnotexist",
            },
        )
        assert resp.status_code == 200


class TestMergeVisitorOnLogin:
    def test_merge_visitor_on_login(self, client):
        # Register a user first (no visitor)
        client.post(
            REGISTER_URL,
            json={"email": "login_merge@example.com", "password": "Pass1234!"},
        )

        # Create visitor and change language
        v = _create_visitor(client)
        code = v["visitor_code"]
        client.patch(f"{VISITORS_URL}/{code}/settings", json={"language": "hi"})

        # Login with visitor_code
        resp = client.post(
            LOGIN_URL,
            json={
                "email": "login_merge@example.com",
                "password": "Pass1234!",
                "visitor_code": code,
            },
        )
        assert resp.status_code == 200
        token = resp.json()["token"]

        # Verify language merged
        settings_resp = client.get(
            "/api/v1/users/me/settings",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert settings_resp.status_code == 200
        assert settings_resp.json()["language"] == "hi"

    def test_merge_not_found_on_login_ignored(self, client):
        client.post(
            REGISTER_URL,
            json={"email": "login_nv@example.com", "password": "Pass1234!"},
        )
        resp = client.post(
            LOGIN_URL,
            json={
                "email": "login_nv@example.com",
                "password": "Pass1234!",
                "visitor_code": "vis_doesnotexist",
            },
        )
        assert resp.status_code == 200
