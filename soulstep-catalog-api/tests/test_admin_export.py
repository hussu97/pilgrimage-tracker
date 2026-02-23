"""Tests for admin export endpoints — GET /api/v1/admin/export/..."""

import json
from datetime import UTC, datetime

from sqlmodel import select

from app.db.models import CheckIn, Group, Place, Review, User

# ── Helpers ────────────────────────────────────────────────────────────────────


def _register(client, email="admin@example.com", password="Testpass1!", display_name="Admin"):
    r = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "display_name": display_name},
    )
    assert r.status_code == 200, r.text
    return r.json()


def _make_admin(db_session, user_code: str) -> None:
    user = db_session.exec(select(User).where(User.user_code == user_code)).first()
    user.is_admin = True
    db_session.add(user)
    db_session.commit()


def _admin_headers(client, db_session, email="admin@example.com", password="Testpass1!"):
    data = _register(client, email=email, password=password)
    _make_admin(db_session, data["user"]["user_code"])
    return {"Authorization": f"Bearer {data['token']}"}


def _register_user(client, email):
    data = _register(client, email=email, password="Testpass1!", display_name="User")
    return data["user"]["user_code"]


def _create_place(db_session, place_code: str, name: str = "Export Mosque") -> Place:
    place = Place(
        place_code=place_code,
        name=name,
        religion="islam",
        place_type="mosque",
        lat=25.0,
        lng=55.0,
        address="Export Address",
        created_at=datetime.now(UTC),
    )
    db_session.add(place)
    db_session.commit()
    return place


def _create_review(db_session, user_code: str, place_code: str, review_code: str) -> Review:
    review = Review(
        review_code=review_code,
        user_code=user_code,
        place_code=place_code,
        rating=5,
        is_flagged=False,
        source="user",
        created_at=datetime.now(UTC),
    )
    db_session.add(review)
    db_session.commit()
    return review


def _create_check_in(db_session, user_code: str, place_code: str, code: str) -> CheckIn:
    ci = CheckIn(
        check_in_code=code,
        user_code=user_code,
        place_code=place_code,
        checked_in_at=datetime.now(UTC),
    )
    db_session.add(ci)
    db_session.commit()
    return ci


def _create_group(db_session, user_code: str, group_code: str) -> Group:
    group = Group(
        group_code=group_code,
        name="Export Group",
        created_by_user_code=user_code,
        invite_code=f"inv_{group_code}",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    db_session.add(group)
    db_session.commit()
    return group


def _parse_csv_rows(text: str) -> tuple[list[str], list[list[str]]]:
    """Returns (header_fields, data_rows) from CSV text."""
    lines = [line for line in text.strip().splitlines() if line]
    if not lines:
        return [], []
    header = [col.strip() for col in lines[0].split(",")]
    rows = [[cell.strip() for cell in line.split(",")] for line in lines[1:]]
    return header, rows


# ── Export users ──────────────────────────────────────────────────────────────


class TestExportUsers:
    def test_requires_admin(self, client, db_session):
        data = _register(client, email="user_expu_caller@example.com")
        token = data["token"]
        resp = client.get(
            "/api/v1/admin/export/users",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403

    def test_requires_auth(self, client):
        resp = client.get("/api/v1/admin/export/users")
        assert resp.status_code == 401

    def test_csv_content_type(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_expu_csv@example.com")
        resp = client.get("/api/v1/admin/export/users?format=csv", headers=headers)
        assert resp.status_code == 200
        assert "text/csv" in resp.headers["content-type"]

    def test_json_content_type(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_expu_json@example.com")
        resp = client.get("/api/v1/admin/export/users?format=json", headers=headers)
        assert resp.status_code == 200
        assert "application/json" in resp.headers["content-type"]

    def test_csv_has_correct_header(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_expu_hdr@example.com")
        resp = client.get("/api/v1/admin/export/users?format=csv", headers=headers)
        assert resp.status_code == 200
        csv_header, _ = _parse_csv_rows(resp.text)
        for field in ("user_code", "email", "display_name", "is_active", "is_admin", "created_at"):
            assert field in csv_header

    def test_json_has_correct_fields(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_expu_jf@example.com")
        resp = client.get("/api/v1/admin/export/users?format=json", headers=headers)
        assert resp.status_code == 200
        data = json.loads(resp.text)
        assert isinstance(data, list)
        assert len(data) >= 1
        user_obj = data[0]
        for field in ("user_code", "email", "display_name", "is_active", "is_admin", "created_at"):
            assert field in user_obj

    def test_csv_row_count_matches_users(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_expu_rc@example.com")
        _register_user(client, email="extra_expu1@example.com")
        _register_user(client, email="extra_expu2@example.com")

        resp = client.get("/api/v1/admin/export/users?format=csv", headers=headers)
        _, rows = _parse_csv_rows(resp.text)
        # At minimum 3 rows: admin + 2 extras
        assert len(rows) >= 3

    def test_json_row_count_matches_users(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_expu_jrc@example.com")
        _register_user(client, email="extra_expu_j1@example.com")

        resp = client.get("/api/v1/admin/export/users?format=json", headers=headers)
        data = json.loads(resp.text)
        # At minimum 2: admin + extra
        assert len(data) >= 2

    def test_default_format_is_csv(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_expu_def@example.com")
        resp = client.get("/api/v1/admin/export/users", headers=headers)
        assert resp.status_code == 200
        assert "text/csv" in resp.headers["content-type"]


# ── Export places ─────────────────────────────────────────────────────────────


class TestExportPlaces:
    def test_requires_admin(self, client, db_session):
        data = _register(client, email="user_expp_caller@example.com")
        token = data["token"]
        resp = client.get(
            "/api/v1/admin/export/places",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403

    def test_csv_content_type(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_expp_csv@example.com")
        resp = client.get("/api/v1/admin/export/places?format=csv", headers=headers)
        assert resp.status_code == 200
        assert "text/csv" in resp.headers["content-type"]

    def test_json_content_type(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_expp_json@example.com")
        resp = client.get("/api/v1/admin/export/places?format=json", headers=headers)
        assert resp.status_code == 200
        assert "application/json" in resp.headers["content-type"]

    def test_csv_has_correct_header(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_expp_hdr@example.com")
        resp = client.get("/api/v1/admin/export/places?format=csv", headers=headers)
        csv_header, _ = _parse_csv_rows(resp.text)
        for field in ("place_code", "name", "religion", "place_type", "lat", "lng"):
            assert field in csv_header

    def test_json_has_correct_fields(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_expp_jf@example.com")
        _create_place(db_session, place_code="plc_expp001")
        resp = client.get("/api/v1/admin/export/places?format=json", headers=headers)
        data = json.loads(resp.text)
        assert isinstance(data, list)
        assert len(data) >= 1
        for field in ("place_code", "name", "religion", "place_type", "lat", "lng", "created_at"):
            assert field in data[0]

    def test_csv_row_count_with_data(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_expp_rc@example.com")
        _create_place(db_session, place_code="plc_expp_r1")
        _create_place(db_session, place_code="plc_expp_r2")

        resp = client.get("/api/v1/admin/export/places?format=csv", headers=headers)
        _, rows = _parse_csv_rows(resp.text)
        assert len(rows) >= 2

    def test_empty_db_csv_only_header(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_expp_empty@example.com")
        resp = client.get("/api/v1/admin/export/places?format=csv", headers=headers)
        _, rows = _parse_csv_rows(resp.text)
        assert len(rows) == 0

    def test_empty_db_json_empty_list(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_expp_ej@example.com")
        resp = client.get("/api/v1/admin/export/places?format=json", headers=headers)
        data = json.loads(resp.text)
        assert data == []


# ── Export reviews ────────────────────────────────────────────────────────────


class TestExportReviews:
    def test_requires_admin(self, client, db_session):
        data = _register(client, email="user_expr_caller@example.com")
        token = data["token"]
        resp = client.get(
            "/api/v1/admin/export/reviews",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403

    def test_csv_content_type(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_expr_csv@example.com")
        resp = client.get("/api/v1/admin/export/reviews?format=csv", headers=headers)
        assert resp.status_code == 200
        assert "text/csv" in resp.headers["content-type"]

    def test_json_content_type(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_expr_json@example.com")
        resp = client.get("/api/v1/admin/export/reviews?format=json", headers=headers)
        assert resp.status_code == 200
        assert "application/json" in resp.headers["content-type"]

    def test_csv_has_correct_header(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_expr_hdr@example.com")
        resp = client.get("/api/v1/admin/export/reviews?format=csv", headers=headers)
        csv_header, _ = _parse_csv_rows(resp.text)
        for field in ("review_code", "user_code", "place_code", "rating", "is_flagged"):
            assert field in csv_header

    def test_json_has_correct_fields(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_expr_jf@example.com")
        uc = _register_user(client, email="user_expr_jf@example.com")
        place = _create_place(db_session, place_code="plc_expr_jf")
        _create_review(db_session, uc, place.place_code, "rev_expr_jf")

        resp = client.get("/api/v1/admin/export/reviews?format=json", headers=headers)
        data = json.loads(resp.text)
        assert len(data) >= 1
        for field in (
            "review_code",
            "user_code",
            "place_code",
            "rating",
            "is_flagged",
            "created_at",
        ):
            assert field in data[0]

    def test_csv_row_count_with_data(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_expr_rc@example.com")
        uc = _register_user(client, email="user_expr_rc@example.com")
        place = _create_place(db_session, place_code="plc_expr_rc")
        _create_review(db_session, uc, place.place_code, "rev_expr_rc1")
        _create_review(db_session, uc, place.place_code, "rev_expr_rc2")

        resp = client.get("/api/v1/admin/export/reviews?format=csv", headers=headers)
        _, rows = _parse_csv_rows(resp.text)
        assert len(rows) >= 2


# ── Export check-ins ──────────────────────────────────────────────────────────


class TestExportCheckIns:
    def test_requires_admin(self, client, db_session):
        data = _register(client, email="user_expci_caller@example.com")
        token = data["token"]
        resp = client.get(
            "/api/v1/admin/export/check-ins",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403

    def test_csv_content_type(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_expci_csv@example.com")
        resp = client.get("/api/v1/admin/export/check-ins?format=csv", headers=headers)
        assert resp.status_code == 200
        assert "text/csv" in resp.headers["content-type"]

    def test_json_content_type(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_expci_json@example.com")
        resp = client.get("/api/v1/admin/export/check-ins?format=json", headers=headers)
        assert resp.status_code == 200
        assert "application/json" in resp.headers["content-type"]

    def test_csv_has_correct_header(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_expci_hdr@example.com")
        resp = client.get("/api/v1/admin/export/check-ins?format=csv", headers=headers)
        csv_header, _ = _parse_csv_rows(resp.text)
        for field in ("check_in_code", "user_code", "place_code", "checked_in_at"):
            assert field in csv_header

    def test_json_has_correct_fields(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_expci_jf@example.com")
        uc = _register_user(client, email="user_expci_jf@example.com")
        place = _create_place(db_session, place_code="plc_expci_jf")
        _create_check_in(db_session, uc, place.place_code, "cin_expci_jf")

        resp = client.get("/api/v1/admin/export/check-ins?format=json", headers=headers)
        data = json.loads(resp.text)
        assert len(data) >= 1
        for field in ("check_in_code", "user_code", "place_code", "checked_in_at"):
            assert field in data[0]

    def test_csv_row_count_with_data(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_expci_rc@example.com")
        uc = _register_user(client, email="user_expci_rc@example.com")
        place = _create_place(db_session, place_code="plc_expci_rc")
        _create_check_in(db_session, uc, place.place_code, "cin_expci_rc1")
        _create_check_in(db_session, uc, place.place_code, "cin_expci_rc2")

        resp = client.get("/api/v1/admin/export/check-ins?format=csv", headers=headers)
        _, rows = _parse_csv_rows(resp.text)
        assert len(rows) >= 2


# ── Export groups ─────────────────────────────────────────────────────────────


class TestExportGroups:
    def test_requires_admin(self, client, db_session):
        data = _register(client, email="user_expg_caller@example.com")
        token = data["token"]
        resp = client.get(
            "/api/v1/admin/export/groups",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403

    def test_csv_content_type(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_expg_csv@example.com")
        resp = client.get("/api/v1/admin/export/groups?format=csv", headers=headers)
        assert resp.status_code == 200
        assert "text/csv" in resp.headers["content-type"]

    def test_json_content_type(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_expg_json@example.com")
        resp = client.get("/api/v1/admin/export/groups?format=json", headers=headers)
        assert resp.status_code == 200
        assert "application/json" in resp.headers["content-type"]

    def test_csv_has_correct_header(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_expg_hdr@example.com")
        resp = client.get("/api/v1/admin/export/groups?format=csv", headers=headers)
        csv_header, _ = _parse_csv_rows(resp.text)
        for field in ("group_code", "name", "is_private", "member_count", "created_at"):
            assert field in csv_header

    def test_json_has_correct_fields(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_expg_jf@example.com")
        uc = _register_user(client, email="user_expg_jf@example.com")
        _create_group(db_session, uc, "grp_expg_jf")

        resp = client.get("/api/v1/admin/export/groups?format=json", headers=headers)
        data = json.loads(resp.text)
        assert len(data) >= 1
        for field in ("group_code", "name", "is_private", "member_count", "created_at"):
            assert field in data[0]

    def test_csv_row_count_with_data(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_expg_rc@example.com")
        uc = _register_user(client, email="user_expg_rc@example.com")
        _create_group(db_session, uc, "grp_expg_rc1")
        _create_group(db_session, uc, "grp_expg_rc2")

        resp = client.get("/api/v1/admin/export/groups?format=csv", headers=headers)
        _, rows = _parse_csv_rows(resp.text)
        assert len(rows) >= 2

    def test_json_member_count_is_zero_when_no_members(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_expg_mc@example.com")
        uc = _register_user(client, email="user_expg_mc@example.com")
        group = _create_group(db_session, uc, "grp_expg_mc")

        resp = client.get("/api/v1/admin/export/groups?format=json", headers=headers)
        data = json.loads(resp.text)
        by_code = {g["group_code"]: g for g in data}
        assert by_code[group.group_code]["member_count"] == 0
