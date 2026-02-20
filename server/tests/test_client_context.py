"""Tests for the client context middleware, hard-update middleware, and
GET /api/v1/app-version endpoint."""

from unittest.mock import patch

# ─── client_context utilities ─────────────────────────────────────────────────


def test_parse_semver_basic():
    from app.core.client_context import parse_semver

    assert parse_semver("1.2.3") == (1, 2, 3)


def test_parse_semver_short():
    from app.core.client_context import parse_semver

    assert parse_semver("2.0") == (2, 0, 0)
    assert parse_semver("3") == (3, 0, 0)


def test_parse_semver_non_numeric():
    from app.core.client_context import parse_semver

    assert parse_semver("1.0.0-beta") == (1, 0, 0)


def test_version_meets_minimum_equal():
    from app.core.client_context import version_meets_minimum

    assert version_meets_minimum("1.0.0", "1.0.0") is True


def test_version_meets_minimum_above():
    from app.core.client_context import version_meets_minimum

    assert version_meets_minimum("1.1.0", "1.0.0") is True
    assert version_meets_minimum("2.0.0", "1.9.9") is True


def test_version_meets_minimum_below():
    from app.core.client_context import version_meets_minimum

    assert version_meets_minimum("0.9.9", "1.0.0") is False


def test_version_meets_minimum_empty_minimum():
    from app.core.client_context import version_meets_minimum

    # Empty minimum means enforcement is disabled — always passes
    assert version_meets_minimum("0.0.1", "") is True


# ─── Client context middleware ─────────────────────────────────────────────────


def test_client_context_middleware_sets_context(client):
    """A request with client headers populates the context."""
    # Reach into the health endpoint just to trigger the middleware
    res = client.get(
        "/health",
        headers={
            "X-Content-Type": "mobile",
            "X-App-Type": "app",
            "X-Platform": "ios",
            "X-App-Version": "1.2.3",
        },
    )
    assert res.status_code == 200


def test_client_context_middleware_defaults(client):
    """Missing headers get sensible defaults."""
    res = client.get("/health")
    assert res.status_code == 200


# ─── Hard-update middleware ────────────────────────────────────────────────────


def test_hard_update_blocks_old_app_version(client):
    """Mobile app below MIN_APP_VERSION_HARD gets HTTP 426."""
    with (
        patch("app.main.config.MIN_APP_VERSION_HARD", "2.0.0"),
        patch("app.main.config.APP_STORE_URL_IOS", "https://apps.apple.com/test"),
    ):
        res = client.get(
            "/api/v1/languages",
            headers={
                "X-App-Type": "app",
                "X-Platform": "ios",
                "X-App-Version": "1.0.0",
            },
        )
    assert res.status_code == 426
    body = res.json()
    assert body["detail"] == "update_required"
    assert body["min_version"] == "2.0.0"
    assert "apps.apple.com" in body["store_url"]


def test_hard_update_passes_current_app_version(client):
    """Mobile app at or above MIN_APP_VERSION_HARD is not blocked."""
    with patch("app.main.config.MIN_APP_VERSION_HARD", "1.0.0"):
        res = client.get(
            "/api/v1/languages",
            headers={
                "X-App-Type": "app",
                "X-Platform": "ios",
                "X-App-Version": "1.0.0",
            },
        )
    assert res.status_code == 200


def test_hard_update_not_applied_to_web_clients(client):
    """Web clients are never blocked by hard-update middleware."""
    with patch("app.main.config.MIN_APP_VERSION_HARD", "99.0.0"):
        res = client.get(
            "/api/v1/languages",
            headers={
                "X-App-Type": "web",
                "X-Platform": "web",
            },
        )
    assert res.status_code == 200


def test_hard_update_not_applied_when_no_version_header(client):
    """App clients without X-App-Version are let through (no version to compare)."""
    with patch("app.main.config.MIN_APP_VERSION_HARD", "99.0.0"):
        res = client.get(
            "/api/v1/languages",
            headers={
                "X-App-Type": "app",
                "X-Platform": "ios",
                # intentionally omit X-App-Version
            },
        )
    assert res.status_code == 200


def test_hard_update_disabled_when_min_version_empty(client):
    """Hard-update is disabled when MIN_APP_VERSION_HARD is empty."""
    with patch("app.main.config.MIN_APP_VERSION_HARD", ""):
        res = client.get(
            "/api/v1/languages",
            headers={
                "X-App-Type": "app",
                "X-Platform": "android",
                "X-App-Version": "0.0.1",
            },
        )
    assert res.status_code == 200


# ─── GET /api/v1/app-version ───────────────────────────────────────────────────


def test_app_version_endpoint_env_fallback(client):
    """Endpoint returns env-var values when no DB row exists."""
    with (
        patch("app.core.config.MIN_APP_VERSION_SOFT", "1.1.0"),
        patch("app.core.config.MIN_APP_VERSION_HARD", "1.0.0"),
        patch("app.core.config.LATEST_APP_VERSION", "1.2.0"),
        patch("app.core.config.APP_STORE_URL_IOS", "https://apps.apple.com/test"),
    ):
        res = client.get("/api/v1/app-version?platform=ios")
    assert res.status_code == 200
    body = res.json()
    assert body["min_version_soft"] == "1.1.0"
    assert body["min_version_hard"] == "1.0.0"
    assert body["latest_version"] == "1.2.0"
    assert "apps.apple.com" in body["store_url"]


def test_app_version_endpoint_db_row(client, db_session):
    """Endpoint returns DB values when a row exists for the platform."""
    from datetime import UTC, datetime

    from app.db.models import AppVersionConfig

    row = AppVersionConfig(
        platform="android",
        min_version_hard="2.0.0",
        min_version_soft="2.1.0",
        latest_version="2.2.0",
        store_url="https://play.google.com/test",
        updated_at=datetime.now(UTC),
    )
    db_session.add(row)
    db_session.commit()

    res = client.get("/api/v1/app-version?platform=android")
    assert res.status_code == 200
    body = res.json()
    assert body["min_version_hard"] == "2.0.0"
    assert body["min_version_soft"] == "2.1.0"
    assert body["latest_version"] == "2.2.0"
    assert "play.google.com" in body["store_url"]


def test_app_version_endpoint_android_store_url(client):
    """Default platform for android returns android store URL from env."""
    with patch("app.core.config.APP_STORE_URL_ANDROID", "https://play.google.com/test"):
        res = client.get("/api/v1/app-version?platform=android")
    assert res.status_code == 200
    body = res.json()
    assert "play.google.com" in body["store_url"]
