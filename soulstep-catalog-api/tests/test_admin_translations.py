"""Tests for admin translation endpoints — CRUD /api/v1/admin/translations/..."""

from sqlmodel import select

from app.db.models import UITranslation, User

# ── Helpers ────────────────────────────────────────────────────────────────────


def _register(client, email="user@example.com", password="Testpass123!", display_name="Tester"):
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "display_name": display_name},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def _make_admin(db_session, user_code: str) -> None:
    user = db_session.exec(select(User).where(User.user_code == user_code)).first()
    user.is_admin = True
    db_session.add(user)
    db_session.commit()


def _admin_headers(client, db_session, email="admin@example.com"):
    data = _register(client, email=email)
    token = data["token"]
    _make_admin(db_session, data["user"]["user_code"])
    return {"Authorization": f"Bearer {token}"}


def _seed_override(db_session, key: str, lang: str, value: str):
    from datetime import UTC, datetime

    row = UITranslation(key=key, lang=lang, value=value, updated_at=datetime.now(UTC))
    db_session.add(row)
    db_session.commit()
    return row


# ── Tests: list translations ───────────────────────────────────────────────────


def test_list_translations_requires_admin(client):
    resp = client.get("/api/v1/admin/translations")
    assert resp.status_code == 401


def test_list_translations_returns_seed_keys(client, db_session):
    headers = _admin_headers(client, db_session)
    resp = client.get("/api/v1/admin/translations", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    # Seed data should have keys; list must be a list of entries
    assert isinstance(data, list)
    if data:
        entry = data[0]
        assert "key" in entry
        assert "en" in entry
        assert "ar" in entry
        assert "hi" in entry
        assert "overridden_langs" in entry


def test_list_translations_shows_db_override(client, db_session):
    headers = _admin_headers(client, db_session)
    _seed_override(db_session, "some.test.key", "en", "DB Value EN")
    resp = client.get("/api/v1/admin/translations", headers=headers)
    assert resp.status_code == 200
    entries = {e["key"]: e for e in resp.json()}
    assert "some.test.key" in entries
    entry = entries["some.test.key"]
    assert entry["en"] == "DB Value EN"
    assert "en" in entry["overridden_langs"]


def test_list_translations_search(client, db_session):
    headers = _admin_headers(client, db_session)
    _seed_override(db_session, "unique.search.abc", "en", "Hello")
    resp = client.get("/api/v1/admin/translations?search=unique.search", headers=headers)
    assert resp.status_code == 200
    keys = [e["key"] for e in resp.json()]
    assert "unique.search.abc" in keys
    # Ensure only matching keys returned
    assert all("unique.search" in k for k in keys)


# ── Tests: get single translation ─────────────────────────────────────────────


def test_get_translation_404_for_unknown_key(client, db_session):
    headers = _admin_headers(client, db_session)
    resp = client.get("/api/v1/admin/translations/totally.nonexistent.key.xyz", headers=headers)
    assert resp.status_code == 404


def test_get_translation_returns_seed_value(client, db_session):
    # Insert a known key in DB first to ensure it exists
    _seed_override(db_session, "test.get.key", "en", "Test Value")
    headers = _admin_headers(client, db_session)
    resp = client.get("/api/v1/admin/translations/test.get.key", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["key"] == "test.get.key"
    assert data["en"] == "Test Value"
    assert "en" in data["overridden_langs"]


# ── Tests: upsert translation ──────────────────────────────────────────────────


def test_put_translation_creates_override(client, db_session):
    headers = _admin_headers(client, db_session)
    resp = client.put(
        "/api/v1/admin/translations/test.upsert.key",
        json={"en": "New English", "ar": "Arabic Value"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["en"] == "New English"
    assert data["ar"] == "Arabic Value"
    assert "en" in data["overridden_langs"]
    assert "ar" in data["overridden_langs"]

    # Verify in DB
    rows = db_session.exec(
        select(UITranslation).where(UITranslation.key == "test.upsert.key")
    ).all()
    assert len(rows) == 2


def test_put_translation_updates_existing_override(client, db_session):
    headers = _admin_headers(client, db_session)
    _seed_override(db_session, "test.update.key", "en", "Old Value")

    resp = client.put(
        "/api/v1/admin/translations/test.update.key",
        json={"en": "Updated Value"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["en"] == "Updated Value"

    rows = db_session.exec(
        select(UITranslation).where(
            UITranslation.key == "test.update.key", UITranslation.lang == "en"
        )
    ).all()
    assert len(rows) == 1
    assert rows[0].value == "Updated Value"


def test_put_translation_requires_at_least_one_lang(client, db_session):
    headers = _admin_headers(client, db_session)
    resp = client.put(
        "/api/v1/admin/translations/some.key",
        json={},
        headers=headers,
    )
    assert resp.status_code == 400


# ── Tests: delete translation ──────────────────────────────────────────────────


def test_delete_translation_removes_overrides(client, db_session):
    _seed_override(db_session, "test.delete.key", "en", "To be deleted")
    _seed_override(db_session, "test.delete.key", "ar", "Arabic to delete")
    headers = _admin_headers(client, db_session)

    resp = client.delete("/api/v1/admin/translations/test.delete.key", headers=headers)
    assert resp.status_code == 204

    remaining = db_session.exec(
        select(UITranslation).where(UITranslation.key == "test.delete.key")
    ).all()
    assert len(remaining) == 0


def test_delete_translation_no_op_for_nonexistent(client, db_session):
    """Deleting a key with no overrides should return 204 (no-op)."""
    headers = _admin_headers(client, db_session)
    resp = client.delete("/api/v1/admin/translations/no.overrides.here", headers=headers)
    assert resp.status_code == 204


# ── Tests: create translation ──────────────────────────────────────────────────


def test_create_translation_new_key(client, db_session):
    headers = _admin_headers(client, db_session)
    resp = client.post(
        "/api/v1/admin/translations",
        json={"key": "brand.new.key", "en": "Brand New", "ar": "جديد"},
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["key"] == "brand.new.key"
    assert data["en"] == "Brand New"
    assert data["ar"] == "جديد"
    assert "en" in data["overridden_langs"]
    assert "ar" in data["overridden_langs"]


# ── Tests: i18n merge endpoint ─────────────────────────────────────────────────


def test_i18n_translations_merges_db_override(client, db_session):
    """GET /api/v1/i18n/translations should apply DB overrides on top of seed."""
    _seed_override(db_session, "override.merge.test", "en", "DB Override Value")

    resp = client.get("/api/v1/translations?lang=en")
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("override.merge.test") == "DB Override Value"


def test_i18n_translations_no_override_returns_seed(client, db_session):
    """If no DB override, seed values should be returned unchanged."""
    resp = client.get("/api/v1/translations?lang=en")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)
    # At least some seed keys should exist
    assert len(data) > 0
