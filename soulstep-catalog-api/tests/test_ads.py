"""Tests for public ads/consent endpoints and admin ad management."""

from datetime import UTC, datetime

import pytest
from sqlmodel import select

from app.api.v1 import ads as ads_module
from app.db.models import AdConfig, ConsentRecord, User
from app.db.seed import _default_ad_slots, _normalize_ad_server, _parse_ad_slots_json

# ── Helpers ────────────────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def clear_ad_config_cache():
    with ads_module._ad_config_lock:
        ads_module._ad_config_cache.clear()
    yield
    with ads_module._ad_config_lock:
        ads_module._ad_config_cache.clear()


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


def _seed_ad_config(db_session, platform="web", ads_enabled=False, ad_server="adsense"):
    row = AdConfig(
        platform=platform,
        ads_enabled=ads_enabled,
        ad_server=ad_server,
        adsense_publisher_id="ca-pub-test123",
        ad_slots={"place-detail-mid": "slot-111"},
        updated_at=datetime.now(UTC),
    )
    db_session.add(row)
    db_session.commit()
    db_session.refresh(row)
    return row


# ── Public: GET /api/v1/ads/config ────────────────────────────────────────────


def test_get_ad_config_default_no_rows(client):
    """When no ad_config rows exist, return disabled defaults."""
    resp = client.get("/api/v1/ads/config")
    assert resp.status_code == 200
    data = resp.json()
    assert data["platform"] == "web"
    assert data["ads_enabled"] is False
    assert data["ad_server"] == "adsense"
    assert data["ad_slots"] == {}


def test_get_ad_config_for_platform(client, db_session):
    _seed_ad_config(db_session, "web", ads_enabled=True)
    resp = client.get("/api/v1/ads/config", params={"platform": "web"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["platform"] == "web"
    assert data["ads_enabled"] is True
    assert data["ad_server"] == "adsense"
    assert data["adsense_publisher_id"] == "ca-pub-test123"
    assert data["ad_slots"] == {"place-detail-mid": "slot-111"}


def test_get_ad_config_filters_slots_by_ad_server(client, db_session):
    db_session.add(
        AdConfig(
            platform="web",
            ads_enabled=True,
            ad_server="adsterra",
            adsense_publisher_id="",
            ad_slots={
                "home-feed": {
                    "provider": "adsterra",
                    "type": "banner",
                    "key": "adsterra-zone-key",
                    "width": 320,
                    "height": 50,
                },
                "place-detail-mid": "ca-pub-test/111",
            },
            updated_at=datetime.now(UTC),
        )
    )
    db_session.commit()

    resp = client.get("/api/v1/ads/config", params={"platform": "web"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["ad_server"] == "adsterra"
    assert data["adsense_publisher_id"] == ""
    assert data["ad_slots"] == {
        "home-feed": {
            "provider": "adsterra",
            "type": "banner",
            "key": "adsterra-zone-key",
            "width": 320,
            "height": 50,
        }
    }


def test_ad_slot_seed_helpers_parse_configurable_slots():
    raw = '{"home-feed":{"provider":"adsterra","type":"banner","key":"zone"}}'
    assert _parse_ad_slots_json(raw) == {
        "home-feed": {"provider": "adsterra", "type": "banner", "key": "zone"}
    }
    assert _parse_ad_slots_json("[]") is None
    assert _normalize_ad_server("adsterra") == "adsterra"
    assert _normalize_ad_server("bad-value") == "adsense"
    assert _default_ad_slots("ca-pub-test")["places-feed"] == "ca-pub-test/places-feed"


def test_get_ad_config_invalid_platform(client):
    resp = client.get("/api/v1/ads/config", params={"platform": "ios"})
    assert resp.status_code == 422


# ── Public: POST /api/v1/consent ──────────────────────────────────────────────


def test_record_consent_as_visitor(client):
    resp = client.post(
        "/api/v1/consent",
        json={"consent_type": "ads", "granted": True, "visitor_code": "vis_test001"},
    )
    assert resp.status_code == 201
    assert resp.json()["status"] == "ok"


def test_record_consent_as_user(client):
    data = _register(client)
    token = data["token"]
    resp = client.post(
        "/api/v1/consent",
        json={"consent_type": "analytics", "granted": False},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201


def test_record_consent_invalid_type(client):
    resp = client.post(
        "/api/v1/consent",
        json={"consent_type": "tracking", "granted": True, "visitor_code": "vis_test002"},
    )
    assert resp.status_code == 400


def test_record_consent_no_identity(client):
    """Anonymous call without visitor_code should fail."""
    resp = client.post(
        "/api/v1/consent",
        json={"consent_type": "ads", "granted": True},
    )
    assert resp.status_code == 400


# ── Public: GET /api/v1/consent ───────────────────────────────────────────────


def test_get_consent_status_as_user(client, db_session):
    data = _register(client)
    token = data["token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Record ads consent
    client.post("/api/v1/consent", json={"consent_type": "ads", "granted": True}, headers=headers)

    resp = client.get("/api/v1/consent", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["ads"] is True
    assert body["analytics"] is None  # not yet set


def test_get_consent_status_as_visitor(client, db_session):
    vc = "vis_consent_test"
    client.post(
        "/api/v1/consent",
        json={"consent_type": "ads", "granted": False, "visitor_code": vc},
    )
    client.post(
        "/api/v1/consent",
        json={"consent_type": "analytics", "granted": True, "visitor_code": vc},
    )
    resp = client.get("/api/v1/consent", params={"visitor_code": vc})
    assert resp.status_code == 200
    body = resp.json()
    assert body["ads"] is False
    assert body["analytics"] is True


def test_get_consent_latest_wins(client, db_session):
    """The most recent consent record should take precedence."""
    vc = "vis_latest_test"
    client.post(
        "/api/v1/consent",
        json={"consent_type": "ads", "granted": True, "visitor_code": vc},
    )
    client.post(
        "/api/v1/consent",
        json={"consent_type": "ads", "granted": False, "visitor_code": vc},
    )
    resp = client.get("/api/v1/consent", params={"visitor_code": vc})
    assert resp.status_code == 200
    assert resp.json()["ads"] is False


def test_get_consent_no_identity(client):
    """No user or visitor_code returns null for both."""
    resp = client.get("/api/v1/consent")
    assert resp.status_code == 200
    body = resp.json()
    assert body["ads"] is None
    assert body["analytics"] is None


# ── Admin: GET /api/v1/admin/ads/config ───────────────────────────────────────


def test_admin_list_ad_configs_requires_admin(client):
    resp = client.get("/api/v1/admin/ads/config")
    assert resp.status_code == 401


def test_admin_list_ad_configs_empty(client, db_session):
    headers = _admin_headers(client, db_session)
    resp = client.get("/api/v1/admin/ads/config", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["items"] == []


def test_admin_list_ad_configs_with_data(client, db_session):
    _seed_ad_config(db_session, "web")
    headers = _admin_headers(client, db_session)
    resp = client.get("/api/v1/admin/ads/config", headers=headers)
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 1
    assert items[0]["platform"] == "web"
    assert items[0]["ad_server"] == "adsense"


# ── Admin: PATCH /api/v1/admin/ads/config/:id ────────────────────────────────


def test_admin_patch_ad_config(client, db_session):
    row = _seed_ad_config(db_session, "web", ads_enabled=False)
    headers = _admin_headers(client, db_session)
    resp = client.patch(
        f"/api/v1/admin/ads/config/{row.id}",
        json={"ads_enabled": True},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["ads_enabled"] is True
    assert data["ad_server"] == "adsense"
    assert data["platform"] == "web"


def test_admin_patch_ad_config_updates_ad_server_and_clears_public_cache(client, db_session):
    row = _seed_ad_config(db_session, "web", ads_enabled=True, ad_server="adsense")
    client.get("/api/v1/ads/config", params={"platform": "web"})
    headers = _admin_headers(client, db_session)

    resp = client.patch(
        f"/api/v1/admin/ads/config/{row.id}",
        json={
            "ad_server": "adsterra",
            "ad_slots": {
                "home-feed": {
                    "provider": "adsterra",
                    "type": "banner",
                    "key": "zone",
                },
                "place-detail-mid": "ca-pub-test/111",
            },
        },
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["ad_server"] == "adsterra"

    public_resp = client.get("/api/v1/ads/config", params={"platform": "web"})
    assert public_resp.status_code == 200
    public_data = public_resp.json()
    assert public_data["ad_server"] == "adsterra"
    assert public_data["ad_slots"] == {
        "home-feed": {"provider": "adsterra", "type": "banner", "key": "zone"}
    }


def test_admin_patch_ad_config_rejects_invalid_ad_server(client, db_session):
    row = _seed_ad_config(db_session, "web")
    headers = _admin_headers(client, db_session)
    resp = client.patch(
        f"/api/v1/admin/ads/config/{row.id}",
        json={"ad_server": "unknown"},
        headers=headers,
    )
    assert resp.status_code == 422


def test_admin_patch_ad_config_not_found(client, db_session):
    headers = _admin_headers(client, db_session)
    resp = client.patch(
        "/api/v1/admin/ads/config/9999",
        json={"ads_enabled": True},
        headers=headers,
    )
    assert resp.status_code == 404


def test_admin_patch_ad_config_updates_slots(client, db_session):
    row = _seed_ad_config(db_session, "android")
    headers = _admin_headers(client, db_session)
    new_slots = {"home-feed": "slot-222", "detail-top": "slot-333"}
    resp = client.patch(
        f"/api/v1/admin/ads/config/{row.id}",
        json={"ad_slots": new_slots},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["ad_slots"] == new_slots


# ── Admin: GET /api/v1/admin/ads/consent-stats ───────────────────────────────


def test_admin_consent_stats_requires_admin(client):
    resp = client.get("/api/v1/admin/ads/consent-stats")
    assert resp.status_code == 401


def test_admin_consent_stats_empty(client, db_session):
    headers = _admin_headers(client, db_session)
    resp = client.get("/api/v1/admin/ads/consent-stats", headers=headers)
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 2
    for item in items:
        assert item["total"] == 0
        assert item["grant_rate"] == 0.0


def test_admin_consent_stats_with_data(client, db_session):
    # Create some consent records
    for granted in [True, True, False]:
        db_session.add(
            ConsentRecord(
                visitor_code="vis_stat",
                consent_type="ads",
                granted=granted,
                created_at=datetime.now(UTC),
            )
        )
    db_session.add(
        ConsentRecord(
            visitor_code="vis_stat",
            consent_type="analytics",
            granted=True,
            created_at=datetime.now(UTC),
        )
    )
    db_session.commit()

    headers = _admin_headers(client, db_session)
    resp = client.get("/api/v1/admin/ads/consent-stats", headers=headers)
    assert resp.status_code == 200
    items = {i["consent_type"]: i for i in resp.json()["items"]}
    assert items["ads"]["total"] == 3
    assert items["ads"]["granted"] == 2
    assert items["ads"]["denied"] == 1
    assert items["analytics"]["total"] == 1
    assert items["analytics"]["granted"] == 1


# ── Model: is_premium on User ────────────────────────────────────────────────


def test_user_is_premium_default_false(client, db_session):
    data = _register(client)
    user = db_session.exec(select(User).where(User.user_code == data["user"]["user_code"])).first()
    assert user.is_premium is False
