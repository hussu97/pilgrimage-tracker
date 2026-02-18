"""
Integration tests for the Groups API.

Covers app/api/v1/groups.py and app/db/groups.py.
"""


# ── helpers ───────────────────────────────────────────────────────────────────

SAMPLE_PLACE = {
    "place_code": "plc_test0001",
    "name": "Test Mosque",
    "religion": "islam",
    "place_type": "mosque",
    "lat": 25.2048,
    "lng": 55.2708,
    "address": "123 Test St, Dubai",
    "opening_hours": {},
    "utc_offset_minutes": 240,
}


def _register_and_login(client, email="user@example.com", password="Testpass123!", name="User"):
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "display_name": name},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    return data["token"], data["user"]["user_code"]


def _auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def _create_group(client, token, name="Test Group", description="A test group"):
    resp = client.post(
        "/api/v1/groups",
        json={"name": name, "description": description},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


# ── TestCreateGroup ────────────────────────────────────────────────────────────


class TestCreateGroup:
    def test_create_group_success(self, client):
        token, _ = _register_and_login(client)
        resp = client.post(
            "/api/v1/groups",
            json={"name": "Pilgrims Group", "description": "Group for pilgrims"},
            headers=_auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "Pilgrims Group"
        assert "group_code" in data
        assert "invite_code" in data

    def test_create_group_without_auth_returns_401(self, client):
        resp = client.post("/api/v1/groups", json={"name": "No Auth Group"})
        assert resp.status_code in (401, 403)

    def test_create_group_with_path(self, client):
        token, _ = _register_and_login(client)
        resp = client.post(
            "/api/v1/groups",
            json={"name": "Path Group", "path_place_codes": ["plc_001", "plc_002"]},
            headers=_auth_headers(token),
        )
        assert resp.status_code == 200

    def test_create_private_group(self, client):
        token, _ = _register_and_login(client)
        resp = client.post(
            "/api/v1/groups",
            json={"name": "Private Group", "is_private": True},
            headers=_auth_headers(token),
        )
        assert resp.status_code == 200
        assert resp.json()["is_private"] is True


# ── TestListGroups ─────────────────────────────────────────────────────────────


class TestListGroups:
    def test_list_groups_empty(self, client):
        token, _ = _register_and_login(client)
        resp = client.get("/api/v1/groups", headers=_auth_headers(token))
        assert resp.status_code == 200
        assert resp.json() == []

    def test_list_groups_after_creation(self, client):
        token, _ = _register_and_login(client)
        _create_group(client, token, "My Group")
        resp = client.get("/api/v1/groups", headers=_auth_headers(token))
        assert resp.status_code == 200
        groups = resp.json()
        assert len(groups) == 1
        assert groups[0]["name"] == "My Group"

    def test_list_groups_returns_featured_flag(self, client):
        token, _ = _register_and_login(client)
        _create_group(client, token, "Featured Group")
        resp = client.get("/api/v1/groups", headers=_auth_headers(token))
        data = resp.json()
        assert data[0]["featured"] is True

    def test_list_groups_includes_member_count(self, client):
        token, _ = _register_and_login(client)
        _create_group(client, token)
        resp = client.get("/api/v1/groups", headers=_auth_headers(token))
        data = resp.json()
        assert data[0]["member_count"] == 1  # creator is admin member


# ── TestGetGroup ───────────────────────────────────────────────────────────────


class TestGetGroup:
    def test_get_group_success(self, client):
        token, _ = _register_and_login(client)
        created = _create_group(client, token)
        group_code = created["group_code"]

        resp = client.get(f"/api/v1/groups/{group_code}", headers=_auth_headers(token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["group_code"] == group_code
        assert data["name"] == "Test Group"

    def test_get_group_not_found(self, client):
        token, _ = _register_and_login(client)
        resp = client.get("/api/v1/groups/grp_nonexistent", headers=_auth_headers(token))
        assert resp.status_code == 404

    def test_get_group_non_member_forbidden(self, client):
        token1, _ = _register_and_login(client, email="owner@example.com")
        token2, _ = _register_and_login(client, email="other@example.com")

        created = _create_group(client, token1)
        group_code = created["group_code"]

        resp = client.get(f"/api/v1/groups/{group_code}", headers=_auth_headers(token2))
        assert resp.status_code == 403


# ── TestUpdateGroup ────────────────────────────────────────────────────────────


class TestUpdateGroup:
    def test_admin_can_update_name(self, client):
        token, _ = _register_and_login(client)
        created = _create_group(client, token)
        group_code = created["group_code"]

        resp = client.patch(
            f"/api/v1/groups/{group_code}",
            json={"name": "Updated Name"},
            headers=_auth_headers(token),
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "Updated Name"

    def test_non_admin_cannot_update(self, client):
        token1, _ = _register_and_login(client, email="admin@example.com")
        token2, _ = _register_and_login(client, email="member@example.com")

        created = _create_group(client, token1)
        group_code = created["group_code"]

        # Member joins the group
        client.post(
            f"/api/v1/groups/{group_code}/join",
            headers=_auth_headers(token2),
        )

        resp = client.patch(
            f"/api/v1/groups/{group_code}",
            json={"name": "Hacked Name"},
            headers=_auth_headers(token2),
        )
        assert resp.status_code == 403

    def test_update_group_not_found(self, client):
        token, _ = _register_and_login(client)
        resp = client.patch(
            "/api/v1/groups/grp_nonexistent",
            json={"name": "X"},
            headers=_auth_headers(token),
        )
        assert resp.status_code == 404


# ── TestJoinGroup ──────────────────────────────────────────────────────────────


class TestJoinGroup:
    def test_join_group_success(self, client):
        token1, _ = _register_and_login(client, email="creator@example.com")
        token2, _ = _register_and_login(client, email="joiner@example.com")

        created = _create_group(client, token1)
        group_code = created["group_code"]

        resp = client.post(
            f"/api/v1/groups/{group_code}/join",
            headers=_auth_headers(token2),
        )
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_join_group_already_member(self, client):
        token, _ = _register_and_login(client)
        created = _create_group(client, token)
        group_code = created["group_code"]

        # Creator is already member — joining again should succeed gracefully
        resp = client.post(
            f"/api/v1/groups/{group_code}/join",
            headers=_auth_headers(token),
        )
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_join_nonexistent_group(self, client):
        token, _ = _register_and_login(client)
        resp = client.post(
            "/api/v1/groups/grp_nonexistent/join",
            headers=_auth_headers(token),
        )
        assert resp.status_code == 404

    def test_join_by_invite_code_success(self, client):
        token1, _ = _register_and_login(client, email="host@example.com")
        token2, _ = _register_and_login(client, email="guest@example.com")

        created = _create_group(client, token1)
        invite_code = created["invite_code"]

        resp = client.post(
            "/api/v1/groups/join-by-code",
            json={"invite_code": invite_code},
            headers=_auth_headers(token2),
        )
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_join_by_invalid_invite_code(self, client):
        token, _ = _register_and_login(client)
        resp = client.post(
            "/api/v1/groups/join-by-code",
            json={"invite_code": "invalidcode"},
            headers=_auth_headers(token),
        )
        assert resp.status_code == 404

    def test_join_by_code_missing_code(self, client):
        token, _ = _register_and_login(client)
        resp = client.post(
            "/api/v1/groups/join-by-code",
            json={},
            headers=_auth_headers(token),
        )
        assert resp.status_code == 400


# ── TestGroupByInvite ──────────────────────────────────────────────────────────


class TestGroupByInvite:
    def test_get_group_by_invite_success(self, client):
        token, _ = _register_and_login(client)
        created = _create_group(client, token)
        invite_code = created["invite_code"]

        resp = client.get(
            f"/api/v1/groups/by-invite/{invite_code}",
            headers=_auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["group_code"] == created["group_code"]
        assert data["name"] == "Test Group"

    def test_get_group_by_invalid_invite(self, client):
        token, _ = _register_and_login(client)
        resp = client.get(
            "/api/v1/groups/by-invite/badcode123",
            headers=_auth_headers(token),
        )
        assert resp.status_code == 404


# ── TestGroupMembers ───────────────────────────────────────────────────────────


class TestGroupMembers:
    def test_get_members_creator_is_admin(self, client):
        token, user_code = _register_and_login(client)
        created = _create_group(client, token)
        group_code = created["group_code"]

        resp = client.get(
            f"/api/v1/groups/{group_code}/members",
            headers=_auth_headers(token),
        )
        assert resp.status_code == 200
        members = resp.json()
        assert len(members) == 1
        assert members[0]["user_code"] == user_code
        assert members[0]["role"] == "admin"

    def test_get_members_not_found(self, client):
        token, _ = _register_and_login(client)
        resp = client.get(
            "/api/v1/groups/grp_nonexistent/members",
            headers=_auth_headers(token),
        )
        assert resp.status_code == 404

    def test_get_members_non_member_forbidden(self, client):
        token1, _ = _register_and_login(client, email="g_owner@example.com")
        token2, _ = _register_and_login(client, email="g_other@example.com")
        created = _create_group(client, token1)
        resp = client.get(
            f"/api/v1/groups/{created['group_code']}/members",
            headers=_auth_headers(token2),
        )
        assert resp.status_code == 403


# ── TestGroupLeaderboard ───────────────────────────────────────────────────────


class TestGroupLeaderboard:
    def test_leaderboard_returns_list(self, client):
        token, _ = _register_and_login(client)
        created = _create_group(client, token)
        group_code = created["group_code"]

        resp = client.get(
            f"/api/v1/groups/{group_code}/leaderboard",
            headers=_auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)

    def test_leaderboard_not_found(self, client):
        token, _ = _register_and_login(client)
        resp = client.get(
            "/api/v1/groups/grp_nonexistent/leaderboard",
            headers=_auth_headers(token),
        )
        assert resp.status_code == 404

    def test_leaderboard_non_member_forbidden(self, client):
        token1, _ = _register_and_login(client, email="lb_owner@example.com")
        token2, _ = _register_and_login(client, email="lb_other@example.com")
        created = _create_group(client, token1)
        resp = client.get(
            f"/api/v1/groups/{created['group_code']}/leaderboard",
            headers=_auth_headers(token2),
        )
        assert resp.status_code == 403


# ── TestGroupActivity ──────────────────────────────────────────────────────────


class TestGroupActivity:
    def test_activity_returns_list(self, client):
        token, _ = _register_and_login(client)
        created = _create_group(client, token)
        group_code = created["group_code"]

        resp = client.get(
            f"/api/v1/groups/{group_code}/activity",
            headers=_auth_headers(token),
        )
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_activity_not_found(self, client):
        token, _ = _register_and_login(client)
        resp = client.get(
            "/api/v1/groups/grp_nonexistent/activity",
            headers=_auth_headers(token),
        )
        assert resp.status_code == 404

    def test_activity_non_member_forbidden(self, client):
        token1, _ = _register_and_login(client, email="act_owner@example.com")
        token2, _ = _register_and_login(client, email="act_other@example.com")
        created = _create_group(client, token1)
        resp = client.get(
            f"/api/v1/groups/{created['group_code']}/activity",
            headers=_auth_headers(token2),
        )
        assert resp.status_code == 403


# ── TestCreateInvite ───────────────────────────────────────────────────────────


class TestCreateInvite:
    def test_create_invite_returns_code_and_url(self, client):
        token, _ = _register_and_login(client)
        created = _create_group(client, token)
        group_code = created["group_code"]

        resp = client.post(
            f"/api/v1/groups/{group_code}/invite",
            headers=_auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "invite_code" in data
        assert "invite_url" in data

    def test_create_invite_not_found(self, client):
        token, _ = _register_and_login(client)
        resp = client.post(
            "/api/v1/groups/grp_nonexistent/invite",
            headers=_auth_headers(token),
        )
        assert resp.status_code == 404

    def test_create_invite_non_member_forbidden(self, client):
        token1, _ = _register_and_login(client, email="inv_owner@example.com")
        token2, _ = _register_and_login(client, email="inv_other@example.com")
        created = _create_group(client, token1)
        resp = client.post(
            f"/api/v1/groups/{created['group_code']}/invite",
            headers=_auth_headers(token2),
        )
        assert resp.status_code == 403
