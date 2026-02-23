"""Tests for admin notifications endpoints — POST/GET /api/v1/admin/notifications/..."""

from sqlmodel import select

from app.db.models import AdminBroadcast, Notification, User

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


def _deactivate_user(db_session, user_code: str) -> None:
    user = db_session.exec(select(User).where(User.user_code == user_code)).first()
    user.is_active = False
    db_session.add(user)
    db_session.commit()


# ── Broadcast notifications ───────────────────────────────────────────────────


class TestBroadcastNotification:
    def test_requires_admin(self, client, db_session):
        data = _register(client, email="user_nbc_caller@example.com")
        token = data["token"]
        resp = client.post(
            "/api/v1/admin/notifications/broadcast",
            json={"type": "info", "payload": {}},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403

    def test_requires_auth(self, client):
        resp = client.post(
            "/api/v1/admin/notifications/broadcast",
            json={"type": "info", "payload": {}},
        )
        assert resp.status_code == 401

    def test_broadcast_returns_broadcast_code_and_count(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_nbc_ret@example.com")
        _register_user(client, email="user_nbc_ret1@example.com")
        _register_user(client, email="user_nbc_ret2@example.com")

        resp = client.post(
            "/api/v1/admin/notifications/broadcast",
            json={"type": "announcement", "payload": {"message": "Hello!"}},
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "broadcast_code" in data
        assert "recipient_count" in data
        assert isinstance(data["broadcast_code"], str)
        assert data["broadcast_code"].startswith("brd_")

    def test_broadcast_sends_to_all_active_users(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_nbc_all@example.com")
        uc1 = _register_user(client, email="user_nbc_all1@example.com")
        uc2 = _register_user(client, email="user_nbc_all2@example.com")
        uc3 = _register_user(client, email="user_nbc_all3@example.com")

        # Deactivate uc3 — should not receive broadcast
        _deactivate_user(db_session, uc3)

        resp = client.post(
            "/api/v1/admin/notifications/broadcast",
            json={"type": "test", "payload": {}},
            headers=headers,
        )
        assert resp.status_code == 200

        # Check notifications were created for active users only
        ntf_uc1 = db_session.exec(select(Notification).where(Notification.user_code == uc1)).all()
        ntf_uc2 = db_session.exec(select(Notification).where(Notification.user_code == uc2)).all()
        ntf_uc3 = db_session.exec(select(Notification).where(Notification.user_code == uc3)).all()

        assert len(ntf_uc1) >= 1
        assert len(ntf_uc2) >= 1
        assert len(ntf_uc3) == 0  # inactive — should not receive

    def test_broadcast_recipient_count_matches_active_users(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_nbc_rc@example.com")
        _register_user(client, email="user_nbc_rc1@example.com")
        _register_user(client, email="user_nbc_rc2@example.com")

        # Count active users before broadcast
        active_users = db_session.exec(select(User).where(User.is_active == True)).all()  # noqa: E712
        expected_count = len(active_users)

        resp = client.post(
            "/api/v1/admin/notifications/broadcast",
            json={"type": "update", "payload": {"key": "val"}},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["recipient_count"] == expected_count

    def test_broadcast_creates_admin_broadcast_row(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_nbc_row@example.com")

        resp = client.post(
            "/api/v1/admin/notifications/broadcast",
            json={"type": "maintenance", "payload": {"window": "2h"}},
            headers=headers,
        )
        assert resp.status_code == 200
        broadcast_code = resp.json()["broadcast_code"]

        row = db_session.exec(
            select(AdminBroadcast).where(AdminBroadcast.broadcast_code == broadcast_code)
        ).first()
        assert row is not None
        assert row.recipient_type == "all"
        assert row.type == "maintenance"

    def test_broadcast_recipient_type_is_all(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_nbc_rtype@example.com")
        resp = client.post(
            "/api/v1/admin/notifications/broadcast",
            json={"type": "info", "payload": {}},
            headers=headers,
        )
        assert resp.status_code == 200
        broadcast_code = resp.json()["broadcast_code"]

        row = db_session.exec(
            select(AdminBroadcast).where(AdminBroadcast.broadcast_code == broadcast_code)
        ).first()
        assert row.recipient_type == "all"

    def test_broadcast_payload_stored_correctly(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_nbc_pl@example.com")
        payload = {"title": "New Feature", "body": "Check out the new thing!"}

        resp = client.post(
            "/api/v1/admin/notifications/broadcast",
            json={"type": "feature", "payload": payload},
            headers=headers,
        )
        assert resp.status_code == 200
        broadcast_code = resp.json()["broadcast_code"]

        row = db_session.exec(
            select(AdminBroadcast).where(AdminBroadcast.broadcast_code == broadcast_code)
        ).first()
        assert row.payload == payload

    def test_broadcast_no_active_users_recipient_count_zero(self, client, db_session):
        # Register admin, deactivate all non-admin users, then broadcast
        data = _register(client, email="admin_nbc_0@example.com")
        _make_admin(db_session, data["user"]["user_code"])
        headers = {"Authorization": f"Bearer {data['token']}"}

        uc = _register_user(client, email="user_nbc_0@example.com")
        _deactivate_user(db_session, uc)

        # Count truly active users
        active = db_session.exec(select(User).where(User.is_active == True)).all()  # noqa: E712
        expected = len(active)

        resp = client.post(
            "/api/v1/admin/notifications/broadcast",
            json={"type": "test", "payload": {}},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["recipient_count"] == expected


# ── Send targeted notifications ───────────────────────────────────────────────


class TestSendNotification:
    def test_requires_admin(self, client, db_session):
        data = _register(client, email="user_nbs_caller@example.com")
        token = data["token"]
        resp = client.post(
            "/api/v1/admin/notifications/send",
            json={"user_codes": ["usr_fake"], "type": "info", "payload": {}},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403

    def test_requires_auth(self, client):
        resp = client.post(
            "/api/v1/admin/notifications/send",
            json={"user_codes": ["usr_fake"], "type": "info", "payload": {}},
        )
        assert resp.status_code == 401

    def test_empty_user_codes_returns_400(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_nbs_400@example.com")
        resp = client.post(
            "/api/v1/admin/notifications/send",
            json={"user_codes": [], "type": "info", "payload": {}},
            headers=headers,
        )
        assert resp.status_code == 400

    def test_invalid_user_codes_returns_404(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_nbs_404@example.com")
        resp = client.post(
            "/api/v1/admin/notifications/send",
            json={
                "user_codes": ["usr_nonexistent1", "usr_nonexistent2"],
                "type": "info",
                "payload": {},
            },
            headers=headers,
        )
        assert resp.status_code == 404

    def test_sends_only_to_specified_users(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_nbs_tgt@example.com")
        uc1 = _register_user(client, email="user_nbs_tgt1@example.com")
        uc2 = _register_user(client, email="user_nbs_tgt2@example.com")
        uc_excluded = _register_user(client, email="user_nbs_excl@example.com")

        resp = client.post(
            "/api/v1/admin/notifications/send",
            json={"user_codes": [uc1, uc2], "type": "direct", "payload": {}},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["recipient_count"] == 2

        ntf_uc1 = db_session.exec(
            select(Notification).where(
                Notification.user_code == uc1,
                Notification.type == "direct",
            )
        ).all()
        ntf_uc2 = db_session.exec(
            select(Notification).where(
                Notification.user_code == uc2,
                Notification.type == "direct",
            )
        ).all()
        ntf_excl = db_session.exec(
            select(Notification).where(
                Notification.user_code == uc_excluded,
                Notification.type == "direct",
            )
        ).all()

        assert len(ntf_uc1) == 1
        assert len(ntf_uc2) == 1
        assert len(ntf_excl) == 0

    def test_send_returns_broadcast_code_and_count(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_nbs_ret@example.com")
        uc = _register_user(client, email="user_nbs_ret@example.com")

        resp = client.post(
            "/api/v1/admin/notifications/send",
            json={"user_codes": [uc], "type": "notice", "payload": {"msg": "hi"}},
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "broadcast_code" in data
        assert data["broadcast_code"].startswith("brd_")
        assert data["recipient_count"] == 1

    def test_send_creates_admin_broadcast_row_targeted(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_nbs_row@example.com")
        uc = _register_user(client, email="user_nbs_row@example.com")

        resp = client.post(
            "/api/v1/admin/notifications/send",
            json={"user_codes": [uc], "type": "targeted_type", "payload": {}},
            headers=headers,
        )
        assert resp.status_code == 200
        broadcast_code = resp.json()["broadcast_code"]

        row = db_session.exec(
            select(AdminBroadcast).where(AdminBroadcast.broadcast_code == broadcast_code)
        ).first()
        assert row is not None
        assert row.recipient_type == "targeted"
        assert row.type == "targeted_type"
        assert row.recipient_count == 1

    def test_send_single_user_creates_one_notification(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_nbs_one@example.com")
        uc = _register_user(client, email="user_nbs_one@example.com")

        resp = client.post(
            "/api/v1/admin/notifications/send",
            json={"user_codes": [uc], "type": "single_send", "payload": {}},
            headers=headers,
        )
        assert resp.status_code == 200

        ntfs = db_session.exec(
            select(Notification).where(
                Notification.user_code == uc,
                Notification.type == "single_send",
            )
        ).all()
        assert len(ntfs) == 1

    def test_send_payload_stored_on_notification(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_nbs_pl@example.com")
        uc = _register_user(client, email="user_nbs_pl@example.com")
        payload = {"deep_link": "/offers/42"}

        resp = client.post(
            "/api/v1/admin/notifications/send",
            json={"user_codes": [uc], "type": "promo", "payload": payload},
            headers=headers,
        )
        assert resp.status_code == 200

        ntf = db_session.exec(
            select(Notification).where(
                Notification.user_code == uc,
                Notification.type == "promo",
            )
        ).first()
        assert ntf is not None
        assert ntf.payload == payload


# ── Notification history ──────────────────────────────────────────────────────


class TestNotificationHistory:
    def test_requires_admin(self, client, db_session):
        data = _register(client, email="user_nbh_caller@example.com")
        token = data["token"]
        resp = client.get(
            "/api/v1/admin/notifications/history",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403

    def test_requires_auth(self, client):
        resp = client.get("/api/v1/admin/notifications/history")
        assert resp.status_code == 401

    def test_empty_when_no_broadcasts(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_nbh_empty@example.com")
        resp = client.get("/api/v1/admin/notifications/history", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["items"] == []

    def test_response_shape(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_nbh_shape@example.com")
        resp = client.get("/api/v1/admin/notifications/history", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        for field in ("items", "total", "page", "page_size"):
            assert field in data
        assert data["page"] == 1

    def test_history_includes_broadcast_after_broadcast(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_nbh_brd@example.com")

        client.post(
            "/api/v1/admin/notifications/broadcast",
            json={"type": "test_brd", "payload": {}},
            headers=headers,
        )

        resp = client.get("/api/v1/admin/notifications/history", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1

        brd_items = [i for i in data["items"] if i["type"] == "test_brd"]
        assert len(brd_items) == 1
        assert brd_items[0]["recipient_type"] == "all"

    def test_history_includes_targeted_send(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_nbh_tgt@example.com")
        uc = _register_user(client, email="user_nbh_tgt@example.com")

        client.post(
            "/api/v1/admin/notifications/send",
            json={"user_codes": [uc], "type": "test_tgt", "payload": {}},
            headers=headers,
        )

        resp = client.get("/api/v1/admin/notifications/history", headers=headers)
        data = resp.json()
        tgt_items = [i for i in data["items"] if i["type"] == "test_tgt"]
        assert len(tgt_items) == 1
        assert tgt_items[0]["recipient_type"] == "targeted"

    def test_history_item_fields(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_nbh_fields@example.com")

        client.post(
            "/api/v1/admin/notifications/broadcast",
            json={"type": "fields_check", "payload": {"k": "v"}},
            headers=headers,
        )

        resp = client.get("/api/v1/admin/notifications/history", headers=headers)
        item = resp.json()["items"][0]
        for field in (
            "broadcast_code",
            "admin_user_code",
            "admin_display_name",
            "type",
            "payload",
            "recipient_type",
            "recipient_count",
            "created_at",
        ):
            assert field in item

    def test_history_multiple_broadcasts_counted(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_nbh_multi@example.com")

        for i in range(3):
            client.post(
                "/api/v1/admin/notifications/broadcast",
                json={"type": f"multi_test_{i}", "payload": {}},
                headers=headers,
            )

        resp = client.get("/api/v1/admin/notifications/history", headers=headers)
        assert resp.json()["total"] >= 3

    def test_history_pagination(self, client, db_session):
        headers = _admin_headers(client, db_session, email="admin_nbh_pag@example.com")
        _register_user(client, email="user_nbh_pag@example.com")

        # Create enough broadcasts to paginate
        for i in range(5):
            client.post(
                "/api/v1/admin/notifications/broadcast",
                json={"type": f"pag_test_{i}", "payload": {}},
                headers=headers,
            )

        resp = client.get(
            "/api/v1/admin/notifications/history?page=1&page_size=3",
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["page"] == 1
        assert data["page_size"] == 3
        assert len(data["items"]) == 3
        assert data["total"] >= 5

    def test_history_admin_display_name_populated(self, client, db_session):
        data = _register(
            client,
            email="admin_nbh_dn@example.com",
            display_name="Broadcast Admin",
        )
        _make_admin(db_session, data["user"]["user_code"])
        headers = {"Authorization": f"Bearer {data['token']}"}

        client.post(
            "/api/v1/admin/notifications/broadcast",
            json={"type": "dn_check", "payload": {}},
            headers=headers,
        )

        resp = client.get("/api/v1/admin/notifications/history", headers=headers)
        items = resp.json()["items"]
        dn_items = [i for i in items if i["type"] == "dn_check"]
        assert len(dn_items) == 1
        assert dn_items[0]["admin_display_name"] == "Broadcast Admin"
