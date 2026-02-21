"""Tests for the X-Request-ID middleware."""

import uuid


def test_request_id_header_present(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert "X-Request-ID" in resp.headers


def test_request_id_is_valid_uuid(client):
    resp = client.get("/health")
    rid = resp.headers.get("X-Request-ID", "")
    # Should parse as a valid UUID without raising
    parsed = uuid.UUID(rid)
    assert str(parsed) == rid


def test_different_requests_get_different_ids(client):
    rid1 = client.get("/health").headers.get("X-Request-ID")
    rid2 = client.get("/health").headers.get("X-Request-ID")
    assert rid1 is not None
    assert rid2 is not None
    assert rid1 != rid2
