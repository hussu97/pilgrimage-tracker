"""Tests for the health check endpoint."""


def test_health_returns_ok(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["db"] == "ok"


def test_health_includes_db_field(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert "db" in resp.json()
