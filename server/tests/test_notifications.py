"""Tests for /api/v1/notifications: list, mark-as-read, and the DB layer."""

REGISTER_URL = "/api/v1/auth/register"
NOTIF_URL = "/api/v1/notifications"

_UID = 0


def _uid():
    global _UID
    _UID += 1
    return _UID


def _register(client):
    uid = _uid()
    resp = client.post(
        REGISTER_URL,
        json={"email": f"notif{uid}@ex.com", "password": "Pass1234!", "display_name": "N"},
    )
    assert resp.status_code == 200
    return resp.json()["token"], resp.json()["user"]["user_code"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# ── DB layer tests (via db_session fixture) ────────────────────────────────────

class TestNotificationsDb:
    def test_create_and_list(self, db_session):
        from app.db import notifications as notif_db

        code = notif_db.create_notification(
            "usr_notif001", "check_in", {"place": "Dubai"}, db_session
        )
        assert code.notification_code.startswith("notif_")
        rows = notif_db.get_notifications_for_user("usr_notif001", db_session)
        assert len(rows) == 1
        assert rows[0].type == "check_in"

    def test_mark_read(self, db_session):
        from app.db import notifications as notif_db

        notif = notif_db.create_notification("usr_notif002", "join", {}, db_session)
        assert notif.read_at is None
        ok = notif_db.mark_read(notif.notification_code, "usr_notif002", db_session)
        assert ok is True

        rows = notif_db.get_notifications_for_user("usr_notif002", db_session)
        assert rows[0].read_at is not None

    def test_mark_read_wrong_user_returns_false(self, db_session):
        from app.db import notifications as notif_db

        notif = notif_db.create_notification("usr_notif003", "join", {}, db_session)
        ok = notif_db.mark_read(notif.notification_code, "usr_other", db_session)
        assert ok is False

    def test_pagination(self, db_session):
        from app.db import notifications as notif_db

        for i in range(5):
            notif_db.create_notification("usr_notif004", f"type_{i}", {}, db_session)

        page1 = notif_db.get_notifications_for_user("usr_notif004", db_session, limit=2, offset=0)
        page2 = notif_db.get_notifications_for_user("usr_notif004", db_session, limit=2, offset=2)
        assert len(page1) == 2
        assert len(page2) == 2
        # Codes should be different pages
        codes1 = {n.notification_code for n in page1}
        codes2 = {n.notification_code for n in page2}
        assert codes1.isdisjoint(codes2)


# ── API endpoint tests ──────────────────────────────────────────────────────────

class TestNotificationsApi:
    def test_list_notifications_requires_auth(self, client):
        resp = client.get(NOTIF_URL)
        assert resp.status_code == 401

    def test_list_notifications_empty(self, client):
        token, _ = _register(client)
        resp = client.get(NOTIF_URL, headers=_auth(token))
        assert resp.status_code == 200
        data = resp.json()
        assert "notifications" in data
        assert data["notifications"] == []
        assert "unread_count" in data

    def test_mark_notification_read(self, client, db_session):
        from app.db import notifications as notif_db

        token, user_code = _register(client)
        # Seed a notification directly in the DB
        notif = notif_db.create_notification(user_code, "test", {"k": "v"}, db_session)

        resp = client.patch(
            f"{NOTIF_URL}/{notif.notification_code}/read",
            headers=_auth(token),
        )
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_mark_nonexistent_notification_returns_404(self, client):
        token, _ = _register(client)
        resp = client.patch(f"{NOTIF_URL}/notif_notreal/read", headers=_auth(token))
        assert resp.status_code == 404

    def test_mark_read_requires_auth(self, client):
        resp = client.patch(f"{NOTIF_URL}/notif_any/read")
        assert resp.status_code == 401
