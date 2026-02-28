"""Tests for analytics ingestion and admin query endpoints."""

import secrets
from datetime import UTC, datetime

from sqlmodel import select

from app.db.models import AnalyticsEvent, User

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


def _user_headers(client, email="user@example.com"):
    data = _register(client, email=email)
    return {"Authorization": f"Bearer {data['token']}"}, data["user"]["user_code"]


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _make_event(event_type: str = "page_view", session_id: str = "sess-abc-123") -> dict:
    return {
        "event_type": event_type,
        "properties": {"page_path": "/home"},
        "client_timestamp": _now_iso(),
        "session_id": session_id,
    }


def _seed_event(
    db_session, event_type="page_view", platform="web", user_code=None, visitor_code=None
):
    ev = AnalyticsEvent(
        event_code=f"evt_{secrets.token_hex(8)}",
        event_type=event_type,
        user_code=user_code,
        visitor_code=visitor_code,
        session_id="test-sess-001",
        properties={"place_code": "plc_abc01"} if event_type == "place_view" else None,
        platform=platform,
        device_type="desktop",
        client_timestamp=datetime.now(UTC),
        created_at=datetime.now(UTC),
    )
    db_session.add(ev)
    db_session.commit()
    return ev


# ── POST /api/v1/analytics/events — anonymous ──────────────────────────────────


def test_ingest_anonymous_events(client):
    resp = client.post(
        "/api/v1/analytics/events",
        json={
            "events": [_make_event("page_view"), _make_event("place_view")],
            "platform": "web",
            "device_type": "desktop",
            "visitor_code": "vis_abc001",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["accepted"] == 2


def test_ingest_authenticated_events(client, db_session):
    headers, user_code = _user_headers(client, email="evtuser@example.com")
    resp = client.post(
        "/api/v1/analytics/events",
        json={
            "events": [_make_event("login")],
            "platform": "web",
            "device_type": "desktop",
        },
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["accepted"] == 1

    events = db_session.exec(
        select(AnalyticsEvent).where(AnalyticsEvent.event_type == "login")
    ).all()
    assert len(events) == 1
    assert events[0].user_code == user_code


def test_ingest_missing_identity_rejected(client):
    resp = client.post(
        "/api/v1/analytics/events",
        json={
            "events": [_make_event()],
            "platform": "web",
        },
    )
    assert resp.status_code == 400
    assert "visitor_code" in resp.json()["detail"]


def test_ingest_max_50_events_enforced(client):
    resp = client.post(
        "/api/v1/analytics/events",
        json={
            "events": [_make_event() for _ in range(51)],
            "platform": "web",
            "visitor_code": "vis_abc001",
        },
    )
    assert resp.status_code == 422


def test_ingest_unknown_event_type_rejected(client):
    resp = client.post(
        "/api/v1/analytics/events",
        json={
            "events": [
                {
                    "event_type": "not_a_real_event",
                    "client_timestamp": _now_iso(),
                    "session_id": "sess-123",
                }
            ],
            "platform": "web",
            "visitor_code": "vis_abc001",
        },
    )
    assert resp.status_code == 422


def test_ingest_stores_all_fields(client, db_session):
    resp = client.post(
        "/api/v1/analytics/events",
        json={
            "events": [
                {
                    "event_type": "place_view",
                    "properties": {"place_code": "plc_abc01", "religion": "islam"},
                    "client_timestamp": _now_iso(),
                    "session_id": "my-session-id",
                }
            ],
            "platform": "ios",
            "device_type": "mobile",
            "app_version": "2.0.0",
            "visitor_code": "vis_xyz999",
        },
    )
    assert resp.status_code == 200
    ev = db_session.exec(
        select(AnalyticsEvent).where(AnalyticsEvent.event_type == "place_view")
    ).first()
    assert ev is not None
    assert ev.platform == "ios"
    assert ev.device_type == "mobile"
    assert ev.app_version == "2.0.0"
    assert ev.visitor_code == "vis_xyz999"
    assert ev.session_id == "my-session-id"
    assert ev.event_code.startswith("evt_")
    assert ev.properties == {"place_code": "plc_abc01", "religion": "islam"}


# ── Admin endpoints ────────────────────────────────────────────────────────────


def test_admin_overview_requires_admin(client, db_session):
    headers, _ = _user_headers(client, email="nonadmin@example.com")
    resp = client.get("/api/v1/admin/analytics/overview", headers=headers)
    assert resp.status_code == 403


def test_admin_overview_returns_counts(client, db_session):
    headers = _admin_headers(client, db_session)
    _seed_event(db_session, "page_view", "web", visitor_code="vis_001")
    _seed_event(db_session, "place_view", "ios", visitor_code="vis_002")

    resp = client.get("/api/v1/admin/analytics/overview", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_events"] >= 2
    assert data["unique_visitors"] >= 2
    assert isinstance(data["top_event_types"], list)
    assert isinstance(data["platform_breakdown"], list)


def test_admin_top_places_requires_admin(client, db_session):
    headers, _ = _user_headers(client, email="nonadmin2@example.com")
    resp = client.get("/api/v1/admin/analytics/top-places", headers=headers)
    assert resp.status_code == 403


def test_admin_trends_requires_admin(client, db_session):
    headers, _ = _user_headers(client, email="nonadmin3@example.com")
    resp = client.get("/api/v1/admin/analytics/trends", headers=headers)
    assert resp.status_code == 403


def test_admin_trends_returns_data(client, db_session):
    headers = _admin_headers(client, db_session, email="admin2@example.com")
    _seed_event(db_session, "page_view", "web", visitor_code="vis_001")

    resp = client.get("/api/v1/admin/analytics/trends?interval=day&period=7d", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) == 7  # 7-day period returns 7 entries
    for point in data:
        assert "period" in point
        assert "count" in point


def test_admin_events_requires_admin(client, db_session):
    headers, _ = _user_headers(client, email="nonadmin4@example.com")
    resp = client.get("/api/v1/admin/analytics/events", headers=headers)
    assert resp.status_code == 403


def test_admin_events_pagination(client, db_session):
    headers = _admin_headers(client, db_session, email="admin3@example.com")
    for i in range(5):
        _seed_event(db_session, "page_view", "web", visitor_code=f"vis_{i:03d}")

    resp = client.get("/api/v1/admin/analytics/events?page=1&page_size=3", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["page"] == 1
    assert data["page_size"] == 3
    assert data["total"] >= 5
    assert len(data["items"]) == 3


def test_admin_events_filter_by_type(client, db_session):
    headers = _admin_headers(client, db_session, email="admin4@example.com")
    _seed_event(db_session, "page_view", "web", visitor_code="vis_001")
    _seed_event(db_session, "login", "web", visitor_code="vis_002")

    resp = client.get("/api/v1/admin/analytics/events?event_type=login", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert all(item["event_type"] == "login" for item in data["items"])


def test_admin_events_filter_by_platform(client, db_session):
    headers = _admin_headers(client, db_session, email="admin5@example.com")
    _seed_event(db_session, "page_view", "web", visitor_code="vis_001")
    _seed_event(db_session, "page_view", "ios", visitor_code="vis_002")

    resp = client.get("/api/v1/admin/analytics/events?platform=ios", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert all(item["platform"] == "ios" for item in data["items"])
