"""Tests for the Umami analytics proxy endpoints."""

from unittest.mock import AsyncMock, MagicMock, patch

import httpx


def _mock_response(status_code: int, content: bytes, content_type: str) -> MagicMock:
    """Build a lightweight mock that mimics the httpx.Response interface."""
    r = MagicMock()
    r.status_code = status_code
    r.content = content
    r.headers = {"content-type": content_type}
    r.raise_for_status = MagicMock()  # no-op for success; raise explicitly when needed
    return r


# ── /umami/script.js ──────────────────────────────────────────────────────────


def test_proxy_script_success(client):
    fake_js = b"(function(){/* umami */})();"
    mock_response = _mock_response(200, fake_js, "application/javascript")

    with patch("app.api.v1.umami_proxy.httpx.AsyncClient") as MockClient:
        instance = MockClient.return_value.__aenter__.return_value
        instance.get = AsyncMock(return_value=mock_response)

        resp = client.get("/umami/script.js")

    assert resp.status_code == 200
    assert resp.content == fake_js
    assert "javascript" in resp.headers["content-type"]
    assert "max-age=86400" in resp.headers["cache-control"]


def test_proxy_script_upstream_error_returns_502(client):
    with patch("app.api.v1.umami_proxy.httpx.AsyncClient") as MockClient:
        instance = MockClient.return_value.__aenter__.return_value
        instance.get = AsyncMock(side_effect=httpx.ConnectError("connection refused"))

        resp = client.get("/umami/script.js")

    assert resp.status_code == 502
    assert resp.content == b""


# ── /umami/api/send ───────────────────────────────────────────────────────────


def test_proxy_send_success(client):
    payload = b'{"type":"event","payload":{"website":"abc","url":"/"}}'
    mock_response = _mock_response(200, b"ok", "text/plain")

    with patch("app.api.v1.umami_proxy.httpx.AsyncClient") as MockClient:
        instance = MockClient.return_value.__aenter__.return_value
        instance.post = AsyncMock(return_value=mock_response)

        resp = client.post(
            "/umami/api/send",
            content=payload,
            headers={"Content-Type": "application/json"},
        )

    assert resp.status_code == 200
    instance.post.assert_called_once()
    call_kwargs = instance.post.call_args
    assert call_kwargs.args[0] == "https://cloud.umami.is/api/send"
    assert call_kwargs.kwargs["content"] == payload


def test_proxy_send_forwards_user_agent(client):
    mock_response = _mock_response(200, b"ok", "text/plain")

    with patch("app.api.v1.umami_proxy.httpx.AsyncClient") as MockClient:
        instance = MockClient.return_value.__aenter__.return_value
        instance.post = AsyncMock(return_value=mock_response)

        client.post(
            "/umami/api/send",
            content=b"{}",
            headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"},
        )

    forwarded_headers = instance.post.call_args.kwargs["headers"]
    assert forwarded_headers["User-Agent"] == "Mozilla/5.0"


def test_proxy_send_upstream_error_returns_202(client):
    """On upstream failure silently return 202 to avoid client-side noise."""
    with patch("app.api.v1.umami_proxy.httpx.AsyncClient") as MockClient:
        instance = MockClient.return_value.__aenter__.return_value
        instance.post = AsyncMock(side_effect=httpx.ConnectError("connection refused"))

        resp = client.post(
            "/umami/api/send",
            content=b"{}",
            headers={"Content-Type": "application/json"},
        )

    assert resp.status_code == 202
