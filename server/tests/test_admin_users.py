"""Tests for admin users endpoints — GET/PATCH/DELETE /api/v1/admin/users/..."""

import secrets
import string

from sqlmodel import select

from app.db.models import CheckIn, Place, Review, User

# ── Helpers ────────────────────────────────────────────────────────────────────


def _generate_user_code() -> str:
    alphabet = string.ascii_lowercase + string.digits
    return "usr_" + "".join(secrets.choice(alphabet) for _ in range(8))


def _register(client, email="user@example.com", password="Testpass123!", display_name="Tester"):
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "display_name": display_name},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def _make_admin(db_session, user_code: str) -> None:
    user = db_session.exec(select(User).where(User.user_code == user_code)).first()
    assert user is not None
    user.is_admin = True
    db_session.add(user)
    db_session.commit()


def _admin_headers(client, db_session, email="admin@example.com"):
    data = _register(client, email=email)
    token = data["token"]
    user_code = data["user"]["user_code"]
    _make_admin(db_session, user_code)
    return {"Authorization": f"Bearer {token}"}, user_code


def _make_place(db_session, code="plc_au00001"):
    place = Place(
        place_code=code,
        name="Test Place",
        religion="islam",
        place_type="mosque",
        lat=0.0,
        lng=0.0,
        address="Addr",
    )
    db_session.add(place)
    db_session.commit()
    return place


def _make_check_in(db_session, user_code, place_code, code=None):
    code = code or ("ci_" + secrets.token_hex(4))
    ci = CheckIn(check_in_code=code, user_code=user_code, place_code=place_code)
    db_session.add(ci)
    db_session.commit()
    return ci


def _make_review(db_session, user_code, place_code, code=None):
    code = code or ("rev_" + secrets.token_hex(4))
    review = Review(
        review_code=code,
        user_code=user_code,
        place_code=place_code,
        rating=4,
        source="user",
    )
    db_session.add(review)
    db_session.commit()
    return review


# ── Tests: List users ──────────────────────────────────────────────────────────


class TestListUsers:
    def test_requires_auth(self, client):
        resp = client.get("/api/v1/admin/users")
        assert resp.status_code == 401

    def test_requires_admin(self, client):
        data = _register(client, email="nonadmin@example.com")
        token = data["token"]
        resp = client.get("/api/v1/admin/users", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 403

    def test_admin_can_list_users(self, client, db_session):
        headers, _ = _admin_headers(client, db_session)
        resp = client.get("/api/v1/admin/users", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert "total" in data
        assert data["page"] == 1
        assert data["page_size"] == 20

    def test_list_includes_registered_users(self, client, db_session):
        headers, admin_code = _admin_headers(client, db_session)
        _register(client, email="other@example.com")
        resp = client.get("/api/v1/admin/users", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 2

    def test_search_by_email(self, client, db_session):
        headers, _ = _admin_headers(client, db_session)
        _register(client, email="findme@example.com", display_name="FindMe")
        resp = client.get("/api/v1/admin/users?search=findme", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert any(u["email"] == "findme@example.com" for u in data["items"])

    def test_search_by_display_name(self, client, db_session):
        headers, _ = _admin_headers(client, db_session)
        _register(client, email="named@example.com", display_name="UniqueNameXYZ")
        resp = client.get("/api/v1/admin/users?search=UniqueNameXYZ", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert any(u["display_name"] == "UniqueNameXYZ" for u in data["items"])

    def test_filter_by_is_active_true(self, client, db_session):
        headers, _ = _admin_headers(client, db_session)
        resp = client.get("/api/v1/admin/users?is_active=true", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert all(u["is_active"] is True for u in data["items"])

    def test_filter_by_is_admin_true(self, client, db_session):
        headers, admin_code = _admin_headers(client, db_session)
        _register(client, email="regular@example.com")
        resp = client.get("/api/v1/admin/users?is_admin=true", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert all(u["is_admin"] is True for u in data["items"])
        assert any(u["user_code"] == admin_code for u in data["items"])

    def test_pagination(self, client, db_session):
        headers, _ = _admin_headers(client, db_session)
        resp = client.get("/api/v1/admin/users?page=1&page_size=1", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["items"]) <= 1
        assert data["page_size"] == 1


# ── Tests: Get user ────────────────────────────────────────────────────────────


class TestGetUser:
    def test_get_existing_user(self, client, db_session):
        headers, _ = _admin_headers(client, db_session)
        data = _register(client, email="target@example.com")
        user_code = data["user"]["user_code"]
        resp = client.get(f"/api/v1/admin/users/{user_code}", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["user_code"] == user_code
        assert body["email"] == "target@example.com"
        assert "check_in_count" in body
        assert "review_count" in body

    def test_get_nonexistent_user_returns_404(self, client, db_session):
        headers, _ = _admin_headers(client, db_session)
        resp = client.get("/api/v1/admin/users/usr_notexist", headers=headers)
        assert resp.status_code == 404

    def test_check_in_count_included(self, client, db_session):
        headers, _ = _admin_headers(client, db_session)
        data = _register(client, email="ci_user@example.com")
        user_code = data["user"]["user_code"]
        place = _make_place(db_session, "plc_au00011")
        _make_check_in(db_session, user_code, place.place_code)
        _make_check_in(db_session, user_code, place.place_code)
        resp = client.get(f"/api/v1/admin/users/{user_code}", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["check_in_count"] == 2

    def test_review_count_included(self, client, db_session):
        headers, _ = _admin_headers(client, db_session)
        data = _register(client, email="rev_user@example.com")
        user_code = data["user"]["user_code"]
        place = _make_place(db_session, "plc_au00012")
        _make_review(db_session, user_code, place.place_code)
        resp = client.get(f"/api/v1/admin/users/{user_code}", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["review_count"] == 1

    def test_requires_admin(self, client):
        data = _register(client, email="nonadmin2@example.com")
        token = data["token"]
        user_code = data["user"]["user_code"]
        resp = client.get(
            f"/api/v1/admin/users/{user_code}", headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 403


# ── Tests: Patch user ──────────────────────────────────────────────────────────


class TestPatchUser:
    def test_patch_display_name(self, client, db_session):
        headers, _ = _admin_headers(client, db_session)
        data = _register(client, email="patchme@example.com")
        user_code = data["user"]["user_code"]
        resp = client.patch(
            f"/api/v1/admin/users/{user_code}",
            json={"display_name": "NewName"},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["display_name"] == "NewName"

    def test_patch_is_active_false(self, client, db_session):
        headers, _ = _admin_headers(client, db_session)
        data = _register(client, email="deactivate@example.com")
        user_code = data["user"]["user_code"]
        resp = client.patch(
            f"/api/v1/admin/users/{user_code}",
            json={"is_active": False},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["is_active"] is False

    def test_patch_is_admin_true(self, client, db_session):
        headers, _ = _admin_headers(client, db_session)
        data = _register(client, email="promote@example.com")
        user_code = data["user"]["user_code"]
        resp = client.patch(
            f"/api/v1/admin/users/{user_code}",
            json={"is_admin": True},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["is_admin"] is True

    def test_patch_nonexistent_returns_404(self, client, db_session):
        headers, _ = _admin_headers(client, db_session)
        resp = client.patch(
            "/api/v1/admin/users/usr_ghost",
            json={"display_name": "Ghost"},
            headers=headers,
        )
        assert resp.status_code == 404

    def test_patch_requires_admin(self, client):
        data = _register(client, email="nonadmin3@example.com")
        token = data["token"]
        user_code = data["user"]["user_code"]
        resp = client.patch(
            f"/api/v1/admin/users/{user_code}",
            json={"display_name": "X"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403


# ── Tests: Soft-delete user ────────────────────────────────────────────────────


class TestDeactivateUser:
    def test_deactivate_sets_is_active_false(self, client, db_session):
        headers, _ = _admin_headers(client, db_session)
        data = _register(client, email="softdel@example.com")
        user_code = data["user"]["user_code"]
        resp = client.delete(f"/api/v1/admin/users/{user_code}", headers=headers)
        assert resp.status_code == 204
        user = db_session.exec(select(User).where(User.user_code == user_code)).first()
        assert user.is_active is False

    def test_deactivate_nonexistent_returns_404(self, client, db_session):
        headers, _ = _admin_headers(client, db_session)
        resp = client.delete("/api/v1/admin/users/usr_ghost2", headers=headers)
        assert resp.status_code == 404

    def test_deactivate_requires_admin(self, client):
        data = _register(client, email="nonadmin4@example.com")
        token = data["token"]
        user_code = data["user"]["user_code"]
        resp = client.delete(
            f"/api/v1/admin/users/{user_code}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403


# ── Tests: List user check-ins ─────────────────────────────────────────────────


class TestListUserCheckIns:
    def test_list_check_ins_empty(self, client, db_session):
        headers, _ = _admin_headers(client, db_session)
        data = _register(client, email="noci@example.com")
        user_code = data["user"]["user_code"]
        resp = client.get(f"/api/v1/admin/users/{user_code}/check-ins", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 0
        assert body["items"] == []

    def test_list_check_ins_returns_user_check_ins(self, client, db_session):
        headers, _ = _admin_headers(client, db_session)
        data = _register(client, email="withci@example.com")
        user_code = data["user"]["user_code"]
        place = _make_place(db_session, "plc_au00021")
        _make_check_in(db_session, user_code, place.place_code, "ci_au00021")
        resp = client.get(f"/api/v1/admin/users/{user_code}/check-ins", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 1
        assert body["items"][0]["check_in_code"] == "ci_au00021"
        assert body["items"][0]["place_name"] == "Test Place"

    def test_list_check_ins_404_for_unknown_user(self, client, db_session):
        headers, _ = _admin_headers(client, db_session)
        resp = client.get("/api/v1/admin/users/usr_nobody/check-ins", headers=headers)
        assert resp.status_code == 404

    def test_requires_admin_for_check_ins(self, client):
        data = _register(client, email="nonadmin5@example.com")
        token = data["token"]
        user_code = data["user"]["user_code"]
        resp = client.get(
            f"/api/v1/admin/users/{user_code}/check-ins",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403


# ── Tests: List user reviews ───────────────────────────────────────────────────


class TestListUserReviews:
    def test_list_reviews_empty(self, client, db_session):
        headers, _ = _admin_headers(client, db_session)
        data = _register(client, email="norev@example.com")
        user_code = data["user"]["user_code"]
        resp = client.get(f"/api/v1/admin/users/{user_code}/reviews", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 0
        assert body["items"] == []

    def test_list_reviews_returns_user_reviews(self, client, db_session):
        headers, _ = _admin_headers(client, db_session)
        data = _register(client, email="withrev@example.com")
        user_code = data["user"]["user_code"]
        place = _make_place(db_session, "plc_au00031")
        _make_review(db_session, user_code, place.place_code, "rev_au00031")
        resp = client.get(f"/api/v1/admin/users/{user_code}/reviews", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 1
        assert body["items"][0]["review_code"] == "rev_au00031"

    def test_list_reviews_404_for_unknown_user(self, client, db_session):
        headers, _ = _admin_headers(client, db_session)
        resp = client.get("/api/v1/admin/users/usr_nobody/reviews", headers=headers)
        assert resp.status_code == 404

    def test_requires_admin_for_reviews(self, client):
        data = _register(client, email="nonadmin6@example.com")
        token = data["token"]
        user_code = data["user"]["user_code"]
        resp = client.get(
            f"/api/v1/admin/users/{user_code}/reviews",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403
