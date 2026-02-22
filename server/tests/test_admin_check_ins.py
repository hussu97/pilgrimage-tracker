"""Tests for admin check-ins endpoints — /api/v1/admin/check-ins/..."""

import secrets

from app.db.models import CheckIn, Place

# ── Helpers ────────────────────────────────────────────────────────────────────


def _register(client, email="user@example.com", password="Testpass123!", display_name="Tester"):
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "display_name": display_name},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def _make_admin(db_session, user_code: str) -> None:
    from sqlmodel import select

    from app.db.models import User

    user = db_session.exec(select(User).where(User.user_code == user_code)).first()
    user.is_admin = True
    db_session.add(user)
    db_session.commit()


def _admin_headers(client, db_session, email="admin@aci.com"):
    data = _register(client, email=email)
    token = data["token"]
    user_code = data["user"]["user_code"]
    _make_admin(db_session, user_code)
    return {"Authorization": f"Bearer {token}"}


def _make_place(db_session, code="plc_aci0001"):
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


def _make_check_in(db_session, user_code, place_code, code=None, group_code=None, note=None):
    code = code or ("ci_" + secrets.token_hex(4))
    ci = CheckIn(
        check_in_code=code,
        user_code=user_code,
        place_code=place_code,
        group_code=group_code,
        note=note,
    )
    db_session.add(ci)
    db_session.commit()
    return ci


# ── Tests: List check-ins ──────────────────────────────────────────────────────


class TestListCheckIns:
    def test_requires_auth(self, client):
        resp = client.get("/api/v1/admin/check-ins")
        assert resp.status_code == 401

    def test_requires_admin(self, client):
        data = _register(client, email="nonadmin@aci.com")
        token = data["token"]
        resp = client.get("/api/v1/admin/check-ins", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 403

    def test_admin_can_list_check_ins(self, client, db_session):
        headers = _admin_headers(client, db_session)
        resp = client.get("/api/v1/admin/check-ins", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert "total" in data

    def test_list_returns_check_ins(self, client, db_session):
        headers = _admin_headers(client, db_session)
        reg = _register(client, email="checkinuser@aci.com")
        user_code = reg["user"]["user_code"]
        place = _make_place(db_session, "plc_aci0010")
        _make_check_in(db_session, user_code, place.place_code, "ci_aci00010")
        resp = client.get("/api/v1/admin/check-ins", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        codes = [c["check_in_code"] for c in data["items"]]
        assert "ci_aci00010" in codes

    def test_filter_by_place_code(self, client, db_session):
        headers = _admin_headers(client, db_session)
        reg = _register(client, email="placefilter@aci.com")
        user_code = reg["user"]["user_code"]
        place = _make_place(db_session, "plc_aci0011")
        _make_check_in(db_session, user_code, place.place_code, "ci_aci00011")
        resp = client.get(f"/api/v1/admin/check-ins?place_code={place.place_code}", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert all(c["place_code"] == place.place_code for c in data["items"])

    def test_filter_by_user_code(self, client, db_session):
        headers = _admin_headers(client, db_session)
        reg = _register(client, email="userfilter@aci.com")
        user_code = reg["user"]["user_code"]
        place = _make_place(db_session, "plc_aci0012")
        _make_check_in(db_session, user_code, place.place_code, "ci_aci00012")
        resp = client.get(f"/api/v1/admin/check-ins?user_code={user_code}", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert all(c["user_code"] == user_code for c in data["items"])

    def test_filter_by_group_code(self, client, db_session):
        headers = _admin_headers(client, db_session)
        reg = _register(client, email="groupfilter@aci.com")
        user_code = reg["user"]["user_code"]
        place = _make_place(db_session, "plc_aci0013")
        _make_check_in(
            db_session, user_code, place.place_code, "ci_aci00013", group_code="grp_test001"
        )
        _make_check_in(db_session, user_code, place.place_code, "ci_aci00014", group_code=None)
        resp = client.get("/api/v1/admin/check-ins?group_code=grp_test001", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert all(c["group_code"] == "grp_test001" for c in data["items"])

    def test_pagination(self, client, db_session):
        headers = _admin_headers(client, db_session)
        reg = _register(client, email="pageci@aci.com")
        user_code = reg["user"]["user_code"]
        place = _make_place(db_session, "plc_aci0014")
        _make_check_in(db_session, user_code, place.place_code, "ci_aci00015")
        _make_check_in(db_session, user_code, place.place_code, "ci_aci00016")
        resp = client.get("/api/v1/admin/check-ins?page=1&page_size=1", headers=headers)
        assert resp.status_code == 200
        assert len(resp.json()["items"]) <= 1

    def test_check_in_includes_place_name(self, client, db_session):
        headers = _admin_headers(client, db_session)
        reg = _register(client, email="nameci@aci.com")
        user_code = reg["user"]["user_code"]
        place = _make_place(db_session, "plc_aci0015")
        _make_check_in(db_session, user_code, place.place_code, "ci_aci00017")
        resp = client.get(f"/api/v1/admin/check-ins?user_code={user_code}", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["items"][0]["place_name"] == "Test Place"


# ── Tests: Delete check-in ─────────────────────────────────────────────────────


class TestDeleteCheckIn:
    def test_delete_check_in(self, client, db_session):
        headers = _admin_headers(client, db_session)
        reg = _register(client, email="delci@aci.com")
        user_code = reg["user"]["user_code"]
        place = _make_place(db_session, "plc_aci0020")
        ci = _make_check_in(db_session, user_code, place.place_code, "ci_aci00020")
        resp = client.delete(f"/api/v1/admin/check-ins/{ci.check_in_code}", headers=headers)
        assert resp.status_code == 204

    def test_delete_nonexistent_404(self, client, db_session):
        headers = _admin_headers(client, db_session)
        resp = client.delete("/api/v1/admin/check-ins/ci_ghost", headers=headers)
        assert resp.status_code == 404

    def test_delete_requires_admin(self, client):
        data = _register(client, email="nonadmin2@aci.com")
        token = data["token"]
        resp = client.delete(
            "/api/v1/admin/check-ins/ci_any",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403

    def test_delete_requires_auth(self, client):
        resp = client.delete("/api/v1/admin/check-ins/ci_any")
        assert resp.status_code == 401
