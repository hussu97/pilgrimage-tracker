"""Tests for admin audit log endpoints — GET /api/v1/admin/audit-log/..."""

from datetime import UTC, datetime

from sqlmodel import select

from app.db.models import Place, Review, User

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


def _create_place(db_session, place_code: str) -> Place:
    place = Place(
        place_code=place_code,
        name="Audit Mosque",
        religion="islam",
        place_type="mosque",
        lat=25.0,
        lng=55.0,
        address="Test Address",
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
        rating=4,
        is_flagged=False,
        source="user",
        created_at=datetime.now(UTC),
    )
    db_session.add(review)
    db_session.commit()
    return review


# ── List audit log ────────────────────────────────────────────────────────────


class TestListAuditLog:
    def test_requires_admin(self, client, db_session):
        data = _register(client, email="user_alaul_caller@example.com")
        token = data["token"]
        resp = client.get(
            "/api/v1/admin/audit-log",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403

    def test_requires_auth(self, client):
        resp = client.get("/api/v1/admin/audit-log")
        assert resp.status_code == 401

    def test_empty_when_no_audit_entries(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_al_empty@example.com")
        resp = client.get("/api/v1/admin/audit-log", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["items"] == []

    def test_response_shape(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_al_shape@example.com")
        resp = client.get("/api/v1/admin/audit-log", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        for field in ("items", "total", "page", "page_size"):
            assert field in data
        assert data["page"] == 1

    def test_deactivate_user_creates_audit_entry(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_al_del@example.com")
        uc = _register_user(client, email="target_al_del@example.com")

        client.delete(f"/api/v1/admin/users/{uc}", headers=headers)

        resp = client.get("/api/v1/admin/audit-log", headers=headers)
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert len(items) >= 1

        user_delete_entries = [
            e
            for e in items
            if e["entity_type"] == "user" and e["action"] == "delete" and e["entity_code"] == uc
        ]
        assert len(user_delete_entries) >= 1

    def test_patch_review_flag_creates_audit_entry(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_al_flag@example.com")
        uc = _register_user(client, email="user_al_flag@example.com")
        place = _create_place(db_session, "plc_al_flag")
        review = _create_review(db_session, uc, place.place_code, "rev_al_flag")

        client.patch(
            f"/api/v1/admin/reviews/{review.review_code}",
            json={"is_flagged": True},
            headers=headers,
        )

        resp = client.get("/api/v1/admin/audit-log", headers=headers)
        items = resp.json()["items"]
        flag_entries = [e for e in items if e["entity_type"] == "review" and e["action"] == "flag"]
        assert len(flag_entries) >= 1

    def test_patch_review_unflag_creates_audit_entry(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_al_unflag@example.com")
        uc = _register_user(client, email="user_al_unflag@example.com")
        place = _create_place(db_session, "plc_al_unflag")
        review = _create_review(db_session, uc, place.place_code, "rev_al_unflag")

        # First flag, then unflag
        client.patch(
            f"/api/v1/admin/reviews/{review.review_code}",
            json={"is_flagged": True},
            headers=headers,
        )
        client.patch(
            f"/api/v1/admin/reviews/{review.review_code}",
            json={"is_flagged": False},
            headers=headers,
        )

        resp = client.get("/api/v1/admin/audit-log", headers=headers)
        items = resp.json()["items"]
        unflag_entries = [
            e for e in items if e["entity_type"] == "review" and e["action"] == "unflag"
        ]
        assert len(unflag_entries) >= 1

    def test_patch_user_creates_audit_entry(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_al_patch@example.com")
        uc = _register_user(client, email="target_al_patch@example.com")

        client.patch(
            f"/api/v1/admin/users/{uc}",
            json={"display_name": "Updated Name"},
            headers=headers,
        )

        resp = client.get("/api/v1/admin/audit-log", headers=headers)
        items = resp.json()["items"]
        update_entries = [
            e
            for e in items
            if e["entity_type"] == "user" and e["action"] == "update" and e["entity_code"] == uc
        ]
        assert len(update_entries) >= 1

    def test_audit_entry_fields(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_al_fields@example.com")
        uc = _register_user(client, email="target_al_fields@example.com")

        client.delete(f"/api/v1/admin/users/{uc}", headers=headers)

        resp = client.get("/api/v1/admin/audit-log", headers=headers)
        items = resp.json()["items"]
        entry = items[0]
        for field in (
            "log_code",
            "admin_user_code",
            "admin_display_name",
            "action",
            "entity_type",
            "entity_code",
            "changes",
            "created_at",
        ):
            assert field in entry

    def test_multiple_operations_counted(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_al_multi@example.com")
        uc1 = _register_user(client, email="target_al_m1@example.com")
        uc2 = _register_user(client, email="target_al_m2@example.com")

        client.delete(f"/api/v1/admin/users/{uc1}", headers=headers)
        client.delete(f"/api/v1/admin/users/{uc2}", headers=headers)

        resp = client.get("/api/v1/admin/audit-log", headers=headers)
        assert resp.json()["total"] >= 2


# ── Filter audit log ──────────────────────────────────────────────────────────


class TestFilterAuditLog:
    def test_filter_by_entity_type(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_alfet@example.com")
        uc = _register_user(client, email="target_alfet@example.com")
        place = _create_place(db_session, "plc_alfet")
        review = _create_review(db_session, uc, place.place_code, "rev_alfet")

        # Create a user delete entry and a review flag entry
        client.delete(f"/api/v1/admin/users/{uc}", headers=headers)
        client.patch(
            f"/api/v1/admin/reviews/{review.review_code}",
            json={"is_flagged": True},
            headers=headers,
        )

        resp = client.get(
            "/api/v1/admin/audit-log?entity_type=review",
            headers=headers,
        )
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert all(e["entity_type"] == "review" for e in items)
        assert len(items) >= 1

    def test_filter_by_action(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_alfa@example.com")
        uc = _register_user(client, email="target_alfa@example.com")
        place = _create_place(db_session, "plc_alfa")
        review = _create_review(db_session, uc, place.place_code, "rev_alfa")

        # Perform a delete (action="delete") and a flag (action="flag")
        client.delete(f"/api/v1/admin/users/{uc}", headers=headers)
        client.patch(
            f"/api/v1/admin/reviews/{review.review_code}",
            json={"is_flagged": True},
            headers=headers,
        )

        resp = client.get("/api/v1/admin/audit-log?action=delete", headers=headers)
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert all(e["action"] == "delete" for e in items)
        assert len(items) >= 1

    def test_filter_by_entity_type_returns_no_results_for_unknown(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_alfe_unk@example.com")
        resp = client.get(
            "/api/v1/admin/audit-log?entity_type=nonexistent_type",
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["total"] == 0
        assert resp.json()["items"] == []

    def test_filter_by_admin_user_code(self, client, db_session):
        # Register two admins and verify filtering by admin_user_code works
        data1 = _register(client, email="admin_alfc1@example.com")
        _make_admin(db_session, data1["user"]["user_code"])
        headers1 = {"Authorization": f"Bearer {data1['token']}"}

        data2 = _register(client, email="admin_alfc2@example.com")
        _make_admin(db_session, data2["user"]["user_code"])
        headers2 = {"Authorization": f"Bearer {data2['token']}"}

        uc = _register_user(client, email="target_alfc@example.com")

        # Admin1 deactivates a user
        client.delete(f"/api/v1/admin/users/{uc}", headers=headers1)

        # Filter by admin1 code
        admin1_code = data1["user"]["user_code"]
        resp = client.get(
            f"/api/v1/admin/audit-log?admin_user_code={admin1_code}",
            headers=headers2,
        )
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert all(e["admin_user_code"] == admin1_code for e in items)
        assert len(items) >= 1


# ── Get single audit log entry ────────────────────────────────────────────────


class TestGetAuditLogEntry:
    def test_requires_admin(self, client, db_session):
        data = _register(client, email="user_algse_caller@example.com")
        token = data["token"]
        resp = client.get(
            "/api/v1/admin/audit-log/log_fake",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403

    def test_get_nonexistent_returns_404(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_algse_404@example.com")
        resp = client.get("/api/v1/admin/audit-log/log_nonexistent", headers=headers)
        assert resp.status_code == 404

    def test_get_existing_entry(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_algse@example.com")
        uc = _register_user(client, email="target_algse@example.com")

        # Trigger an audit log entry
        client.delete(f"/api/v1/admin/users/{uc}", headers=headers)

        # Fetch list to get log_code
        list_resp = client.get("/api/v1/admin/audit-log", headers=headers)
        items = list_resp.json()["items"]
        assert len(items) >= 1
        log_code = items[0]["log_code"]

        # Fetch single entry
        resp = client.get(f"/api/v1/admin/audit-log/{log_code}", headers=headers)
        assert resp.status_code == 200
        entry = resp.json()
        assert entry["log_code"] == log_code
        for field in (
            "log_code",
            "admin_user_code",
            "admin_display_name",
            "action",
            "entity_type",
            "entity_code",
            "changes",
            "created_at",
        ):
            assert field in entry

    def test_get_entry_admin_display_name_populated(self, client, db_session):
        data = _register(
            client,
            email="admin_algse_dn@example.com",
            display_name="Named Admin",
        )
        _make_admin(db_session, data["user"]["user_code"])
        headers = {"Authorization": f"Bearer {data['token']}"}

        uc = _register_user(client, email="target_algse_dn@example.com")
        client.delete(f"/api/v1/admin/users/{uc}", headers=headers)

        list_resp = client.get("/api/v1/admin/audit-log", headers=headers)
        log_code = list_resp.json()["items"][0]["log_code"]

        resp = client.get(f"/api/v1/admin/audit-log/{log_code}", headers=headers)
        assert resp.json()["admin_display_name"] == "Named Admin"

    def test_get_entry_entity_code_matches(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_algse_ec@example.com")
        uc = _register_user(client, email="target_algse_ec@example.com")

        client.delete(f"/api/v1/admin/users/{uc}", headers=headers)

        list_resp = client.get("/api/v1/admin/audit-log", headers=headers)
        entry = list_resp.json()["items"][0]
        log_code = entry["log_code"]

        resp = client.get(f"/api/v1/admin/audit-log/{log_code}", headers=headers)
        assert resp.json()["entity_code"] == uc
        assert resp.json()["entity_type"] == "user"
        assert resp.json()["action"] == "delete"

    def test_patch_user_audit_includes_changes(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_algse_ch@example.com")
        uc = _register_user(client, email="target_algse_ch@example.com")

        client.patch(
            f"/api/v1/admin/users/{uc}",
            json={"display_name": "New Name"},
            headers=headers,
        )

        list_resp = client.get("/api/v1/admin/audit-log", headers=headers)
        items = list_resp.json()["items"]
        update_entries = [e for e in items if e["action"] == "update" and e["entity_code"] == uc]
        assert len(update_entries) >= 1
        log_code = update_entries[0]["log_code"]

        resp = client.get(f"/api/v1/admin/audit-log/{log_code}", headers=headers)
        entry = resp.json()
        assert entry["changes"] is not None
        assert "display_name" in entry["changes"]


# ── Pagination ────────────────────────────────────────────────────────────────


class TestAuditLogPagination:
    def test_pagination_page_and_page_size(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_alpag@example.com")
        # Create 3 audit entries by deactivating users
        for i in range(3):
            uc = _register_user(client, email=f"target_alpag{i}@example.com")
            client.delete(f"/api/v1/admin/users/{uc}", headers=headers)

        resp = client.get("/api/v1/admin/audit-log?page=1&page_size=2", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["page"] == 1
        assert data["page_size"] == 2
        assert len(data["items"]) == 2
        assert data["total"] >= 3

    def test_pagination_page_2(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_alpag2@example.com")
        for i in range(3):
            uc = _register_user(client, email=f"target_alpag2_{i}@example.com")
            client.delete(f"/api/v1/admin/users/{uc}", headers=headers)

        resp = client.get("/api/v1/admin/audit-log?page=2&page_size=2", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["page"] == 2
        # With 3 items and page_size=2, page 2 should have 1
        assert len(data["items"]) >= 1
