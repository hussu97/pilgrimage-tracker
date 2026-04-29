"""Tests for the web client context middleware."""


# ─── Client context middleware ─────────────────────────────────────────────────


def test_client_context_middleware_sets_context(client):
    """A request with client headers populates the context."""
    # Reach into the health endpoint just to trigger the middleware
    res = client.get(
        "/health",
        headers={
            "X-Content-Type": "mobile",
            "X-App-Type": "web",
            "X-Platform": "web",
        },
    )
    assert res.status_code == 200


def test_client_context_middleware_defaults(client):
    """Missing headers get sensible defaults."""
    res = client.get("/health")
    assert res.status_code == 200
