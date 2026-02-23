"""Tests for admin groups endpoints — CRUD /api/v1/admin/groups/..."""

import secrets

from app.db.models import Group, GroupMember, User, UserSettings

# ── Helpers ────────────────────────────────────────────────────────────────────


def _register(client, email="user@example.com", password="Testpass123!", display_name="Tester"):
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "display_name": display_name},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def _make_admin_user(db_session, user_code: str) -> None:
    from sqlmodel import select

    user = db_session.exec(select(User).where(User.user_code == user_code)).first()
    user.is_admin = True
    db_session.add(user)
    db_session.commit()


def _admin_headers(client, db_session, email="admin@ag.com"):
    data = _register(client, email=email)
    token = data["token"]
    user_code = data["user"]["user_code"]
    _make_admin_user(db_session, user_code)
    return {"Authorization": f"Bearer {token}"}, user_code


def _make_group(db_session, user_code, code=None, name="Test Group"):
    code = code or ("grp_" + secrets.token_hex(4))
    invite = "inv_" + secrets.token_hex(4)
    group = Group(
        group_code=code,
        name=name,
        description="A test group",
        created_by_user_code=user_code,
        invite_code=invite,
        is_private=False,
        path_place_codes=["plc_1", "plc_2"],
    )
    db_session.add(group)
    db_session.commit()
    return group


def _make_group_member(db_session, group_code, user_code, role="member"):
    member = GroupMember(group_code=group_code, user_code=user_code, role=role)
    db_session.add(member)
    db_session.commit()
    return member


def _create_extra_user(db_session, email="extra@ag.com", display_name="Extra User"):
    """Create a user directly in DB without going through HTTP."""
    from app.core.security import hash_password

    user_code = "usr_" + secrets.token_hex(4)
    user = User(
        user_code=user_code,
        email=email,
        password_hash=hash_password("Testpass123!"),
        display_name=display_name,
        is_admin=False,
    )
    settings = UserSettings(user_code=user_code)
    db_session.add(user)
    db_session.add(settings)
    db_session.commit()
    return user


# ── Tests: List groups ─────────────────────────────────────────────────────────


class TestListGroups:
    def test_requires_auth(self, client):
        resp = client.get("/api/v1/admin/groups")
        assert resp.status_code == 401

    def test_requires_admin(self, client):
        data = _register(client, email="nonadmin@ag.com")
        token = data["token"]
        resp = client.get("/api/v1/admin/groups", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 403

    def test_admin_can_list_groups(self, client, db_session):
        headers, user_code = _admin_headers(client, db_session)
        _make_group(db_session, user_code)
        resp = client.get("/api/v1/admin/groups", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert data["total"] >= 1

    def test_search_filter(self, client, db_session):
        headers, user_code = _admin_headers(client, db_session)
        _make_group(db_session, user_code, name="Unique Group XYZ")
        resp = client.get("/api/v1/admin/groups?search=Unique+Group+XYZ", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert any(g["name"] == "Unique Group XYZ" for g in data["items"])

    def test_pagination(self, client, db_session):
        headers, user_code = _admin_headers(client, db_session)
        _make_group(db_session, user_code, name="Group A")
        _make_group(db_session, user_code, name="Group B")
        resp = client.get("/api/v1/admin/groups?page=1&page_size=1", headers=headers)
        assert resp.status_code == 200
        assert len(resp.json()["items"]) <= 1

    def test_list_includes_member_count(self, client, db_session):
        headers, user_code = _admin_headers(client, db_session)
        group = _make_group(db_session, user_code, code="grp_ag00001")
        _make_group_member(db_session, group.group_code, user_code, role="admin")
        resp = client.get(f"/api/v1/admin/groups?search={group.name}", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["items"][0]["member_count"] >= 1

    def test_list_includes_place_count(self, client, db_session):
        headers, user_code = _admin_headers(client, db_session)
        group = _make_group(db_session, user_code, code="grp_ag00002")
        resp = client.get(f"/api/v1/admin/groups?search={group.name}", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        # path_place_codes has ["plc_1", "plc_2"]
        assert data["items"][0]["place_count"] == 2


# ── Tests: Get group ───────────────────────────────────────────────────────────


class TestGetGroup:
    def test_get_existing_group(self, client, db_session):
        headers, user_code = _admin_headers(client, db_session)
        group = _make_group(db_session, user_code, code="grp_ag00010")
        resp = client.get(f"/api/v1/admin/groups/{group.group_code}", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["group_code"] == group.group_code
        assert data["name"] == group.name
        assert "invite_code" in data
        assert "created_by_user_code" in data
        assert "path_place_codes" in data

    def test_get_nonexistent_group_404(self, client, db_session):
        headers, _ = _admin_headers(client, db_session)
        resp = client.get("/api/v1/admin/groups/grp_notexist", headers=headers)
        assert resp.status_code == 404

    def test_requires_admin(self, client, db_session):
        _, user_code = _admin_headers(client, db_session)
        group = _make_group(db_session, user_code, code="grp_ag00011")
        data = _register(client, email="nonadmin2@ag.com")
        token = data["token"]
        resp = client.get(
            f"/api/v1/admin/groups/{group.group_code}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403


# ── Tests: Patch group ─────────────────────────────────────────────────────────


class TestPatchGroup:
    def test_patch_name(self, client, db_session):
        headers, user_code = _admin_headers(client, db_session)
        group = _make_group(db_session, user_code, code="grp_ag00020")
        resp = client.patch(
            f"/api/v1/admin/groups/{group.group_code}",
            json={"name": "Renamed Group"},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "Renamed Group"

    def test_patch_description(self, client, db_session):
        headers, user_code = _admin_headers(client, db_session)
        group = _make_group(db_session, user_code, code="grp_ag00021")
        resp = client.patch(
            f"/api/v1/admin/groups/{group.group_code}",
            json={"description": "New description"},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["description"] == "New description"

    def test_patch_is_private(self, client, db_session):
        headers, user_code = _admin_headers(client, db_session)
        group = _make_group(db_session, user_code, code="grp_ag00022")
        resp = client.patch(
            f"/api/v1/admin/groups/{group.group_code}",
            json={"is_private": True},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["is_private"] is True

    def test_patch_nonexistent_404(self, client, db_session):
        headers, _ = _admin_headers(client, db_session)
        resp = client.patch(
            "/api/v1/admin/groups/grp_ghost",
            json={"name": "Ghost"},
            headers=headers,
        )
        assert resp.status_code == 404

    def test_patch_requires_admin(self, client, db_session):
        _, user_code = _admin_headers(client, db_session)
        group = _make_group(db_session, user_code, code="grp_ag00023")
        data = _register(client, email="nonadmin3@ag.com")
        token = data["token"]
        resp = client.patch(
            f"/api/v1/admin/groups/{group.group_code}",
            json={"name": "X"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403


# ── Tests: Delete group ────────────────────────────────────────────────────────


class TestDeleteGroup:
    def test_delete_group(self, client, db_session):
        headers, user_code = _admin_headers(client, db_session)
        group = _make_group(db_session, user_code, code="grp_ag00030")
        resp = client.delete(f"/api/v1/admin/groups/{group.group_code}", headers=headers)
        assert resp.status_code == 204

    def test_delete_nonexistent_404(self, client, db_session):
        headers, _ = _admin_headers(client, db_session)
        resp = client.delete("/api/v1/admin/groups/grp_ghost", headers=headers)
        assert resp.status_code == 404

    def test_delete_requires_admin(self, client, db_session):
        _, user_code = _admin_headers(client, db_session)
        group = _make_group(db_session, user_code, code="grp_ag00031")
        data = _register(client, email="nonadmin4@ag.com")
        token = data["token"]
        resp = client.delete(
            f"/api/v1/admin/groups/{group.group_code}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403


# ── Tests: List group members ──────────────────────────────────────────────────


class TestListGroupMembers:
    def test_list_members_empty(self, client, db_session):
        headers, user_code = _admin_headers(client, db_session)
        group = _make_group(db_session, user_code, code="grp_ag00040")
        resp = client.get(f"/api/v1/admin/groups/{group.group_code}/members", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["items"] == []

    def test_list_members_returns_members(self, client, db_session):
        headers, user_code = _admin_headers(client, db_session)
        group = _make_group(db_session, user_code, code="grp_ag00041")
        extra = _create_extra_user(db_session, email="member1@ag.com")
        _make_group_member(db_session, group.group_code, extra.user_code, role="member")
        resp = client.get(f"/api/v1/admin/groups/{group.group_code}/members", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["user_code"] == extra.user_code
        assert data["items"][0]["role"] == "member"

    def test_list_members_404_for_unknown_group(self, client, db_session):
        headers, _ = _admin_headers(client, db_session)
        resp = client.get("/api/v1/admin/groups/grp_notexist/members", headers=headers)
        assert resp.status_code == 404

    def test_requires_admin_for_members(self, client):
        data = _register(client, email="nonadmin5@ag.com")
        token = data["token"]
        resp = client.get(
            "/api/v1/admin/groups/grp_any/members",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403


# ── Tests: Remove group member ─────────────────────────────────────────────────


class TestRemoveGroupMember:
    def test_remove_member(self, client, db_session):
        headers, user_code = _admin_headers(client, db_session)
        group = _make_group(db_session, user_code, code="grp_ag00050")
        extra = _create_extra_user(db_session, email="removeme@ag.com")
        _make_group_member(db_session, group.group_code, extra.user_code)
        resp = client.delete(
            f"/api/v1/admin/groups/{group.group_code}/members/{extra.user_code}",
            headers=headers,
        )
        assert resp.status_code == 204

    def test_remove_nonexistent_member_404(self, client, db_session):
        headers, user_code = _admin_headers(client, db_session)
        group = _make_group(db_session, user_code, code="grp_ag00051")
        resp = client.delete(
            f"/api/v1/admin/groups/{group.group_code}/members/usr_nobody",
            headers=headers,
        )
        assert resp.status_code == 404

    def test_remove_from_nonexistent_group_404(self, client, db_session):
        headers, _ = _admin_headers(client, db_session)
        resp = client.delete(
            "/api/v1/admin/groups/grp_ghost/members/usr_any",
            headers=headers,
        )
        assert resp.status_code == 404

    def test_remove_requires_admin(self, client, db_session):
        _, user_code = _admin_headers(client, db_session)
        group = _make_group(db_session, user_code, code="grp_ag00052")
        data = _register(client, email="nonadmin6@ag.com")
        token = data["token"]
        resp = client.delete(
            f"/api/v1/admin/groups/{group.group_code}/members/usr_any",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403
