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
    assert isinstance(data, list)
    if data:
        entry = data[0]
        assert "key" in entry
        assert "values" in entry
        assert "overridden_langs" in entry
        assert isinstance(entry["values"], dict)


def test_list_translations_includes_all_seeded_languages(client, db_session):
    """Every entry's values dict should include en, ar, hi, te, ml."""
    headers = _admin_headers(client, db_session)
    resp = client.get("/api/v1/admin/translations", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    # seed_i18n fixture loads all 5 langs
    if data:
        langs = set(data[0]["values"].keys())
        for expected in ("en", "ar", "hi", "te", "ml"):
            assert expected in langs, f"Language '{expected}' missing from values"


def test_list_translations_shows_db_override(client, db_session):
    headers = _admin_headers(client, db_session)
    _seed_override(db_session, "some.test.key", "en", "DB Value EN")
    resp = client.get("/api/v1/admin/translations", headers=headers)
    assert resp.status_code == 200
    entries = {e["key"]: e for e in resp.json()}
    assert "some.test.key" in entries
    entry = entries["some.test.key"]
    assert entry["values"]["en"] == "DB Value EN"
    assert "en" in entry["overridden_langs"]


def test_list_translations_search(client, db_session):
    headers = _admin_headers(client, db_session)
    _seed_override(db_session, "unique.search.abc", "en", "Hello")
    resp = client.get("/api/v1/admin/translations?search=unique.search", headers=headers)
    assert resp.status_code == 200
    keys = [e["key"] for e in resp.json()]
    assert "unique.search.abc" in keys
    assert all("unique.search" in k for k in keys)


# ── Tests: get single translation ─────────────────────────────────────────────


def test_get_translation_404_for_unknown_key(client, db_session):
    headers = _admin_headers(client, db_session)
    resp = client.get("/api/v1/admin/translations/totally.nonexistent.key.xyz", headers=headers)
    assert resp.status_code == 404


def test_get_translation_returns_value(client, db_session):
    _seed_override(db_session, "test.get.key", "en", "Test Value")
    headers = _admin_headers(client, db_session)
    resp = client.get("/api/v1/admin/translations/test.get.key", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["key"] == "test.get.key"
    assert data["values"]["en"] == "Test Value"
    assert "en" in data["overridden_langs"]


def test_get_translation_returns_all_langs(client, db_session):
    """A DB-overridden key should still have values for all supported langs."""
    _seed_override(db_session, "test.all.langs", "hi", "हिंदी मूल्य")
    headers = _admin_headers(client, db_session)
    resp = client.get("/api/v1/admin/translations/test.all.langs", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["values"]["hi"] == "हिंदी मूल्य"
    assert "hi" in data["overridden_langs"]
    # Other langs present (even if None)
    assert "te" in data["values"]
    assert "ml" in data["values"]


# ── Tests: upsert translation ──────────────────────────────────────────────────


def test_put_translation_creates_override(client, db_session):
    headers = _admin_headers(client, db_session)
    resp = client.put(
        "/api/v1/admin/translations/test.upsert.key",
        json={"values": {"en": "New English", "ar": "Arabic Value"}},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["values"]["en"] == "New English"
    assert data["values"]["ar"] == "Arabic Value"
    assert "en" in data["overridden_langs"]
    assert "ar" in data["overridden_langs"]

    rows = db_session.exec(
        select(UITranslation).where(UITranslation.key == "test.upsert.key")
    ).all()
    assert len(rows) == 2


def test_put_translation_updates_existing_override(client, db_session):
    headers = _admin_headers(client, db_session)
    _seed_override(db_session, "test.update.key", "en", "Old Value")

    resp = client.put(
        "/api/v1/admin/translations/test.update.key",
        json={"values": {"en": "Updated Value"}},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["values"]["en"] == "Updated Value"

    rows = db_session.exec(
        select(UITranslation).where(
            UITranslation.key == "test.update.key", UITranslation.lang == "en"
        )
    ).all()
    assert len(rows) == 1
    assert rows[0].value == "Updated Value"


def test_put_translation_supports_telugu_and_malayalam(client, db_session):
    """Overrides for te and ml should work just like en/ar/hi."""
    headers = _admin_headers(client, db_session)
    resp = client.put(
        "/api/v1/admin/translations/test.te.ml.key",
        json={"values": {"te": "తెలుగు విలువ", "ml": "മലയാളം മൂല്യം"}},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["values"]["te"] == "తెలుగు విలువ"
    assert data["values"]["ml"] == "മലയാളം മൂല്യം"
    assert "te" in data["overridden_langs"]
    assert "ml" in data["overridden_langs"]


def test_put_translation_requires_values(client, db_session):
    headers = _admin_headers(client, db_session)
    resp = client.put(
        "/api/v1/admin/translations/some.key",
        json={"values": {}},
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
    headers = _admin_headers(client, db_session)
    resp = client.delete("/api/v1/admin/translations/no.overrides.here", headers=headers)
    assert resp.status_code == 204


# ── Tests: create translation ──────────────────────────────────────────────────


def test_create_translation_new_key(client, db_session):
    headers = _admin_headers(client, db_session)
    resp = client.post(
        "/api/v1/admin/translations",
        json={"key": "brand.new.key", "values": {"en": "Brand New", "ar": "جديد", "te": "కొత్తది"}},
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["key"] == "brand.new.key"
    assert data["values"]["en"] == "Brand New"
    assert data["values"]["ar"] == "جديد"
    assert data["values"]["te"] == "కొత్తది"
    assert "en" in data["overridden_langs"]
    assert "ar" in data["overridden_langs"]
    assert "te" in data["overridden_langs"]


# ── Tests: i18n merge endpoint ─────────────────────────────────────────────────


def test_i18n_translations_merges_db_override(client, db_session):
    _seed_override(db_session, "override.merge.test", "en", "DB Override Value")

    resp = client.get("/api/v1/translations?lang=en")
    assert resp.status_code == 200
    assert resp.json().get("override.merge.test") == "DB Override Value"


def test_i18n_translations_merges_telugu_override(client, db_session):
    """DB overrides for te and ml should also be returned by the public endpoint."""
    _seed_override(db_session, "override.te.test", "te", "తెలుగు ఓవర్‌రైడ్")

    resp = client.get("/api/v1/translations?lang=te")
    assert resp.status_code == 200
    assert resp.json().get("override.te.test") == "తెలుగు ఓవర్‌రైడ్"


def test_i18n_translations_no_override_returns_seed(client, db_session):
    resp = client.get("/api/v1/translations?lang=en")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)
    assert len(data) > 0
