"""Tests for admin app-versions endpoints — GET/PUT /api/v1/admin/app-versions/..."""

from sqlmodel import select

from app.db.models import AppVersionConfig, User

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


def _create_version_config(db_session, platform: str, latest: str = "1.0.0"):
    from datetime import UTC, datetime

    row = AppVersionConfig(
        platform=platform,
        min_version_hard="0.9.0",
        min_version_soft="0.9.5",
        latest_version=latest,
        store_url=f"https://store.example.com/{platform}",
        updated_at=datetime.now(UTC),
    )
    db_session.add(row)
    db_session.commit()
    return row


# ── Tests: list app versions ───────────────────────────────────────────────────


def test_list_app_versions_requires_admin(client):
    resp = client.get("/api/v1/admin/app-versions")
    assert resp.status_code == 401


def test_list_app_versions_empty(client, db_session):
    headers = _admin_headers(client, db_session)
    resp = client.get("/api/v1/admin/app-versions", headers=headers)
    assert resp.status_code == 200
    assert resp.json() == []


def test_list_app_versions_returns_rows(client, db_session):
    _create_version_config(db_session, "ios", "2.0.0")
    _create_version_config(db_session, "android", "2.0.1")
    headers = _admin_headers(client, db_session)
    resp = client.get("/api/v1/admin/app-versions", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    platforms = {r["platform"] for r in data}
    assert platforms == {"ios", "android"}


# ── Tests: update app version ─────────────────────────────────────────────────


def test_put_app_version_creates_new_row(client, db_session):
    headers = _admin_headers(client, db_session)
    resp = client.put(
        "/api/v1/admin/app-versions/ios",
        json={
            "latest_version": "3.0.0",
            "min_version_hard": "2.0.0",
            "store_url": "https://apple.com",
        },
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["platform"] == "ios"
    assert data["latest_version"] == "3.0.0"
    assert data["min_version_hard"] == "2.0.0"
    assert data["store_url"] == "https://apple.com"


def test_put_app_version_updates_existing_row(client, db_session):
    _create_version_config(db_session, "android", "1.0.0")
    headers = _admin_headers(client, db_session)

    resp = client.put(
        "/api/v1/admin/app-versions/android",
        json={"latest_version": "1.5.0", "min_version_soft": "1.3.0"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["latest_version"] == "1.5.0"
    assert data["min_version_soft"] == "1.3.0"
    # Other fields unchanged
    assert data["min_version_hard"] == "0.9.0"

    # One row in DB
    rows = db_session.exec(
        select(AppVersionConfig).where(AppVersionConfig.platform == "android")
    ).all()
    assert len(rows) == 1


def test_put_app_version_rejects_invalid_platform(client, db_session):
    headers = _admin_headers(client, db_session)
    resp = client.put(
        "/api/v1/admin/app-versions/windows",
        json={"latest_version": "1.0.0"},
        headers=headers,
    )
    assert resp.status_code == 400


def test_put_app_version_partial_update(client, db_session):
    """Only provided fields should be updated; others remain unchanged."""
    _create_version_config(db_session, "ios", "1.0.0")
    headers = _admin_headers(client, db_session)

    resp = client.put(
        "/api/v1/admin/app-versions/ios",
        json={"store_url": "https://newurl.example.com"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["store_url"] == "https://newurl.example.com"
    assert data["latest_version"] == "1.0.0"  # unchanged
