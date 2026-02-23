"""
Integration tests for the Groups API.

Covers app/api/v1/groups.py and app/db/groups.py.
"""

from app.db.models import Place

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


def _make_place(db_session, code: str = "plc_tst00001", name: str = "Test Place"):
    """Insert a Place row directly into the test DB."""
    place = Place(
        place_code=code,
        name=name,
        religion="islam",
        place_type="mosque",
        lat=25.0,
        lng=55.0,
        address="Test St",
    )
    db_session.add(place)
    db_session.commit()
    return place


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


# ── TestDeleteGroup ────────────────────────────────────────────────────────────


class TestDeleteGroup:
    def test_admin_can_delete_group(self, client):
        token, _ = _register_and_login(client, email="delg_admin@example.com")
        group = _create_group(client, token, name="Delete Me")
        group_code = group["group_code"]

        resp = client.delete(f"/api/v1/groups/{group_code}", headers=_auth_headers(token))
        assert resp.status_code == 200

        # Group should no longer be accessible
        resp2 = client.get(f"/api/v1/groups/{group_code}", headers=_auth_headers(token))
        assert resp2.status_code == 404

    def test_non_admin_member_cannot_delete_group(self, client):
        token1, _ = _register_and_login(client, email="delg_owner@example.com")
        token2, _ = _register_and_login(client, email="delg_member@example.com")
        group = _create_group(client, token1, name="Delete Me 2")
        group_code = group["group_code"]

        # token2 joins as member
        client.post(f"/api/v1/groups/{group_code}/join", headers=_auth_headers(token2))

        resp = client.delete(f"/api/v1/groups/{group_code}", headers=_auth_headers(token2))
        assert resp.status_code == 403

    def test_delete_nonexistent_group_returns_404(self, client):
        token, _ = _register_and_login(client, email="delg_404@example.com")
        resp = client.delete("/api/v1/groups/grp_nonexistent", headers=_auth_headers(token))
        assert resp.status_code == 404


# ── TestLeaveGroup ─────────────────────────────────────────────────────────────


class TestLeaveGroup:
    def test_member_can_leave_group(self, client):
        token1, _ = _register_and_login(client, email="leave_owner@example.com")
        token2, _ = _register_and_login(client, email="leave_member@example.com")
        group = _create_group(client, token1, name="Leave Group")
        group_code = group["group_code"]

        client.post(f"/api/v1/groups/{group_code}/join", headers=_auth_headers(token2))

        resp = client.post(f"/api/v1/groups/{group_code}/leave", headers=_auth_headers(token2))
        assert resp.status_code == 200

        # Confirm member is no longer in members list
        members_resp = client.get(
            f"/api/v1/groups/{group_code}/members", headers=_auth_headers(token1)
        )
        assert all("leave_member" not in m.get("display_name", "") for m in members_resp.json())

    def test_creator_cannot_leave_group(self, client):
        token, _ = _register_and_login(client, email="leave_creator@example.com")
        group = _create_group(client, token, name="Creator Leave")
        group_code = group["group_code"]

        resp = client.post(f"/api/v1/groups/{group_code}/leave", headers=_auth_headers(token))
        assert resp.status_code == 400

    def test_non_member_cannot_leave(self, client):
        token1, _ = _register_and_login(client, email="leave_nm_owner@example.com")
        token2, _ = _register_and_login(client, email="leave_nm_other@example.com")
        group = _create_group(client, token1, name="Non Member Leave")
        group_code = group["group_code"]

        resp = client.post(f"/api/v1/groups/{group_code}/leave", headers=_auth_headers(token2))
        assert resp.status_code == 403


# ── TestRemoveMember ───────────────────────────────────────────────────────────


class TestRemoveMember:
    def test_admin_can_remove_member(self, client):
        token1, _ = _register_and_login(client, email="rm_admin@example.com")
        token2, user2_code = _register_and_login(client, email="rm_member@example.com")
        group = _create_group(client, token1, name="Remove Member Group")
        group_code = group["group_code"]

        client.post(f"/api/v1/groups/{group_code}/join", headers=_auth_headers(token2))

        resp = client.delete(
            f"/api/v1/groups/{group_code}/members/{user2_code}",
            headers=_auth_headers(token1),
        )
        assert resp.status_code == 200

    def test_non_admin_cannot_remove_member(self, client):
        token1, _ = _register_and_login(client, email="rm_owner@example.com")
        token2, _ = _register_and_login(client, email="rm_m1@example.com")
        token3, user3_code = _register_and_login(client, email="rm_m2@example.com")
        group = _create_group(client, token1, name="Remove Member 2")
        group_code = group["group_code"]

        client.post(f"/api/v1/groups/{group_code}/join", headers=_auth_headers(token2))
        client.post(f"/api/v1/groups/{group_code}/join", headers=_auth_headers(token3))

        resp = client.delete(
            f"/api/v1/groups/{group_code}/members/{user3_code}",
            headers=_auth_headers(token2),
        )
        assert resp.status_code == 403

    def test_remove_nonexistent_member_returns_404(self, client):
        token, _ = _register_and_login(client, email="rm_404@example.com")
        group = _create_group(client, token, name="Remove 404 Group")
        group_code = group["group_code"]

        resp = client.delete(
            f"/api/v1/groups/{group_code}/members/usr_nonexistent",
            headers=_auth_headers(token),
        )
        assert resp.status_code == 404


# ── TestUpdateMemberRole ───────────────────────────────────────────────────────


class TestUpdateMemberRole:
    def test_admin_can_promote_member(self, client):
        token1, _ = _register_and_login(client, email="role_admin@example.com")
        token2, user2_code = _register_and_login(client, email="role_member@example.com")
        group = _create_group(client, token1, name="Role Group")
        group_code = group["group_code"]

        client.post(f"/api/v1/groups/{group_code}/join", headers=_auth_headers(token2))

        resp = client.patch(
            f"/api/v1/groups/{group_code}/members/{user2_code}",
            json={"role": "admin"},
            headers=_auth_headers(token1),
        )
        assert resp.status_code == 200

        # Verify role changed
        members_resp = client.get(
            f"/api/v1/groups/{group_code}/members", headers=_auth_headers(token1)
        )
        member = next(m for m in members_resp.json() if m["user_code"] == user2_code)
        assert member["role"] == "admin"

    def test_admin_can_demote_admin(self, client):
        token1, _ = _register_and_login(client, email="role_demote_owner@example.com")
        token2, user2_code = _register_and_login(client, email="role_demote_m@example.com")
        group = _create_group(client, token1, name="Role Demote Group")
        group_code = group["group_code"]

        client.post(f"/api/v1/groups/{group_code}/join", headers=_auth_headers(token2))
        # Promote first
        client.patch(
            f"/api/v1/groups/{group_code}/members/{user2_code}",
            json={"role": "admin"},
            headers=_auth_headers(token1),
        )
        # Then demote
        resp = client.patch(
            f"/api/v1/groups/{group_code}/members/{user2_code}",
            json={"role": "member"},
            headers=_auth_headers(token1),
        )
        assert resp.status_code == 200

    def test_invalid_role_rejected(self, client):
        token1, _ = _register_and_login(client, email="role_inv_owner@example.com")
        token2, user2_code = _register_and_login(client, email="role_inv_m@example.com")
        group = _create_group(client, token1, name="Invalid Role Group")
        group_code = group["group_code"]

        client.post(f"/api/v1/groups/{group_code}/join", headers=_auth_headers(token2))

        resp = client.patch(
            f"/api/v1/groups/{group_code}/members/{user2_code}",
            json={"role": "superuser"},
            headers=_auth_headers(token1),
        )
        assert resp.status_code == 400


# ── TestUpdateGroupPath ────────────────────────────────────────────────────────


class TestUpdateGroupPath:
    def test_admin_can_set_path_place_codes(self, client, db_session):
        token, _ = _register_and_login(client, email="path_admin@example.com")
        group = _create_group(client, token, name="Path Group")
        group_code = group["group_code"]
        _make_place(db_session, "plc_path0001", "Path Place")

        resp = client.patch(
            f"/api/v1/groups/{group_code}",
            json={"name": "Path Group", "path_place_codes": ["plc_path0001"]},
            headers=_auth_headers(token),
        )
        assert resp.status_code == 200
        assert "plc_path0001" in resp.json().get("path_place_codes", [])

    def test_admin_can_set_start_end_dates(self, client):
        token, _ = _register_and_login(client, email="dates_admin@example.com")
        group = _create_group(client, token, name="Dates Group")
        group_code = group["group_code"]

        resp = client.patch(
            f"/api/v1/groups/{group_code}",
            json={"name": "Dates Group", "start_date": "2025-03-15", "end_date": "2025-03-22"},
            headers=_auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["start_date"] == "2025-03-15"
        assert data["end_date"] == "2025-03-22"

    def test_non_admin_cannot_update_group(self, client):
        token1, _ = _register_and_login(client, email="path_owner@example.com")
        token2, _ = _register_and_login(client, email="path_member@example.com")
        group = _create_group(client, token1, name="Path Owner Group")
        group_code = group["group_code"]

        client.post(f"/api/v1/groups/{group_code}/join", headers=_auth_headers(token2))

        resp = client.patch(
            f"/api/v1/groups/{group_code}",
            json={"name": "Hacked"},
            headers=_auth_headers(token2),
        )
        assert resp.status_code == 403


# ── TestGroupChecklist ─────────────────────────────────────────────────────────


class TestGroupChecklist:
    def test_checklist_returns_empty_for_no_places(self, client):
        token, _ = _register_and_login(client, email="chk_empty@example.com")
        group = _create_group(client, token, name="Empty Checklist")
        group_code = group["group_code"]

        resp = client.get(f"/api/v1/groups/{group_code}/checklist", headers=_auth_headers(token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["places"] == []
        assert data["total_places"] == 0

    def test_checklist_includes_place_with_check_in_status(self, client, db_session):
        token, _ = _register_and_login(client, email="chk_with@example.com")
        group = _create_group(client, token, name="Checklist With Place")
        group_code = group["group_code"]
        _make_place(db_session, "plc_chk0001", "Checklist Place")

        # Set path
        client.patch(
            f"/api/v1/groups/{group_code}",
            json={"name": "Checklist With Place", "path_place_codes": ["plc_chk0001"]},
            headers=_auth_headers(token),
        )

        resp = client.get(f"/api/v1/groups/{group_code}/checklist", headers=_auth_headers(token))
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["places"]) == 1
        assert data["places"][0]["place_code"] == "plc_chk0001"
        assert data["places"][0]["user_checked_in"] is False
        assert data["total_places"] == 1

    def test_checklist_non_member_forbidden(self, client):
        token1, _ = _register_and_login(client, email="chk_owner@example.com")
        token2, _ = _register_and_login(client, email="chk_other@example.com")
        group = _create_group(client, token1, name="Checklist Forbidden")
        group_code = group["group_code"]

        resp = client.get(f"/api/v1/groups/{group_code}/checklist", headers=_auth_headers(token2))
        assert resp.status_code == 403


# ── TestGroupCheckIn ───────────────────────────────────────────────────────────


class TestGroupCheckIn:
    def test_check_in_with_group_code_success(self, client, db_session):
        token, _ = _register_and_login(client, email="gci_user@example.com")
        group = _create_group(client, token, name="Check In Group")
        group_code = group["group_code"]
        _make_place(db_session, "plc_gci0001", "GCI Place")

        # Add place to group itinerary
        client.patch(
            f"/api/v1/groups/{group_code}",
            json={"name": "Check In Group", "path_place_codes": ["plc_gci0001"]},
            headers=_auth_headers(token),
        )

        resp = client.post(
            "/api/v1/places/plc_gci0001/check-in",
            json={"group_code": group_code},
            headers=_auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("group_code") == group_code

    def test_check_in_with_group_code_place_not_in_itinerary(self, client, db_session):
        token, _ = _register_and_login(client, email="gci_notpath@example.com")
        group = _create_group(client, token, name="Check In Not Path")
        group_code = group["group_code"]
        _make_place(db_session, "plc_gci0002", "Not Path Place")
        _make_place(db_session, "plc_gci0004", "Itinerary Place")

        # Add a DIFFERENT place to the itinerary
        client.patch(
            f"/api/v1/groups/{group_code}",
            json={"name": "Check In Not Path", "path_place_codes": ["plc_gci0004"]},
            headers=_auth_headers(token),
        )

        # Try to check in at plc_gci0002 which is NOT in the itinerary
        resp = client.post(
            "/api/v1/places/plc_gci0002/check-in",
            json={"group_code": group_code},
            headers=_auth_headers(token),
        )
        assert resp.status_code == 400

    def test_check_in_without_group_code_still_works(self, client, db_session):
        token, _ = _register_and_login(client, email="gci_nogc@example.com")
        _make_place(db_session, "plc_gci0003", "No GC Place")

        resp = client.post(
            "/api/v1/places/plc_gci0003/check-in",
            json={},
            headers=_auth_headers(token),
        )
        assert resp.status_code == 200
        assert resp.json().get("group_code") is None


# ── TestPlaceNotes ─────────────────────────────────────────────────────────────


class TestPlaceNotes:
    def test_member_can_add_and_list_note(self, client, db_session):
        token, _ = _register_and_login(client, email="note_user@example.com")
        group = _create_group(client, token, name="Notes Group")
        group_code = group["group_code"]
        _make_place(db_session, "plc_note001", "Notes Place")

        # Add place to group
        client.patch(
            f"/api/v1/groups/{group_code}",
            json={"name": "Notes Group", "path_place_codes": ["plc_note001"]},
            headers=_auth_headers(token),
        )

        # Add note
        resp = client.post(
            f"/api/v1/groups/{group_code}/places/plc_note001/notes",
            json={"text": "Meet at 9am"},
            headers=_auth_headers(token),
        )
        assert resp.status_code == 200
        note = resp.json()
        assert note["text"] == "Meet at 9am"

        # List notes
        list_resp = client.get(
            f"/api/v1/groups/{group_code}/places/plc_note001/notes",
            headers=_auth_headers(token),
        )
        assert list_resp.status_code == 200
        notes = list_resp.json()
        assert any(n["text"] == "Meet at 9am" for n in notes)

    def test_author_can_delete_note(self, client, db_session):
        token, _ = _register_and_login(client, email="note_del@example.com")
        group = _create_group(client, token, name="Notes Del Group")
        group_code = group["group_code"]
        _make_place(db_session, "plc_note002", "Notes Del Place")

        client.patch(
            f"/api/v1/groups/{group_code}",
            json={"name": "Notes Del Group", "path_place_codes": ["plc_note002"]},
            headers=_auth_headers(token),
        )

        note_resp = client.post(
            f"/api/v1/groups/{group_code}/places/plc_note002/notes",
            json={"text": "Delete me"},
            headers=_auth_headers(token),
        )
        note_code = note_resp.json()["note_code"]

        del_resp = client.delete(
            f"/api/v1/groups/{group_code}/notes/{note_code}",
            headers=_auth_headers(token),
        )
        assert del_resp.status_code == 200

        # Verify deleted
        list_resp = client.get(
            f"/api/v1/groups/{group_code}/places/plc_note002/notes",
            headers=_auth_headers(token),
        )
        notes = list_resp.json()
        assert not any(n["note_code"] == note_code for n in notes)

    def test_non_member_cannot_add_note(self, client, db_session):
        token1, _ = _register_and_login(client, email="note_owner@example.com")
        token2, _ = _register_and_login(client, email="note_outsider@example.com")
        group = _create_group(client, token1, name="Notes Non Member")
        group_code = group["group_code"]
        _make_place(db_session, "plc_note003", "Notes NM Place")

        client.patch(
            f"/api/v1/groups/{group_code}",
            json={"name": "Notes Non Member", "path_place_codes": ["plc_note003"]},
            headers=_auth_headers(token1),
        )

        resp = client.post(
            f"/api/v1/groups/{group_code}/places/plc_note003/notes",
            json={"text": "Unauthorized"},
            headers=_auth_headers(token2),
        )
        assert resp.status_code == 403


# ── TestAddPlaceToItinerary ────────────────────────────────────────────────────


class TestAddPlaceToItinerary:
    def test_member_can_add_place(self, client, db_session):
        token, _ = _register_and_login(client, email="itin_member@example.com")
        group = _create_group(client, token, name="Itinerary Group")
        group_code = group["group_code"]
        _make_place(db_session, "plc_itin001", "Itinerary Place")

        resp = client.post(
            f"/api/v1/groups/{group_code}/places/plc_itin001",
            headers=_auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert data["already_exists"] is False

        # Confirm the group now contains the place
        group_resp = client.get(f"/api/v1/groups/{group_code}", headers=_auth_headers(token))
        assert "plc_itin001" in group_resp.json()["path_place_codes"]

    def test_adding_duplicate_place_returns_already_exists(self, client, db_session):
        token, _ = _register_and_login(client, email="itin_dup@example.com")
        group = _create_group(client, token, name="Dup Group")
        group_code = group["group_code"]
        _make_place(db_session, "plc_itin002", "Dup Place")

        # Add once
        client.post(
            f"/api/v1/groups/{group_code}/places/plc_itin002",
            headers=_auth_headers(token),
        )

        # Add again — should return already_exists=true
        resp = client.post(
            f"/api/v1/groups/{group_code}/places/plc_itin002",
            headers=_auth_headers(token),
        )
        assert resp.status_code == 200
        assert resp.json()["already_exists"] is True

    def test_non_member_cannot_add_place(self, client, db_session):
        token1, _ = _register_and_login(client, email="itin_owner@example.com")
        token2, _ = _register_and_login(client, email="itin_other@example.com")
        group = _create_group(client, token1, name="Member Only Group")
        group_code = group["group_code"]
        _make_place(db_session, "plc_itin003", "Member Only Place")

        resp = client.post(
            f"/api/v1/groups/{group_code}/places/plc_itin003",
            headers=_auth_headers(token2),
        )
        assert resp.status_code == 403

    def test_invalid_group_returns_404(self, client, db_session):
        token, _ = _register_and_login(client, email="itin_404g@example.com")
        _make_place(db_session, "plc_itin004", "404 Place")

        resp = client.post(
            "/api/v1/groups/grp_nonexistent/places/plc_itin004",
            headers=_auth_headers(token),
        )
        assert resp.status_code == 404

    def test_invalid_place_returns_404(self, client):
        token, _ = _register_and_login(client, email="itin_404p@example.com")
        group = _create_group(client, token, name="Bad Place Group")
        group_code = group["group_code"]

        resp = client.post(
            f"/api/v1/groups/{group_code}/places/plc_nonexistent",
            headers=_auth_headers(token),
        )
        assert resp.status_code == 404
