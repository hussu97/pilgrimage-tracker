"""
Extended tests for main.py exception handlers and db/session utilities.

Covers:
- http_exception_handler for 401, 403, 500 status codes
- log_error with query params and 500 trace logging
- validation_exception_handler with non-serializable ctx values
- general_exception_handler for unhandled exceptions
- create_db_and_tables() and get_db_session() in db/session.py
"""

import asyncio
import os
import sys
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


# ── Helpers ───────────────────────────────────────────────────────────────────


def _mock_request(path="/test", query_params=None):
    mock = MagicMock()
    mock.method = "GET"
    mock.url.path = path
    mock.query_params = query_params or {}
    return mock


# ── TestHttpExceptionHandler ──────────────────────────────────────────────────


class TestHttpExceptionHandler:
    def test_http_401_unauthorized(self):
        from starlette.exceptions import HTTPException as StarletteHTTPException

        from app.main import http_exception_handler

        request = _mock_request()
        exc = StarletteHTTPException(status_code=401, detail="Unauthorized")
        response = asyncio.run(http_exception_handler(request, exc))

        assert response.status_code == 401

    def test_http_403_forbidden(self):
        from starlette.exceptions import HTTPException as StarletteHTTPException

        from app.main import http_exception_handler

        request = _mock_request()
        exc = StarletteHTTPException(status_code=403, detail="Forbidden")
        response = asyncio.run(http_exception_handler(request, exc))

        assert response.status_code == 403

    def test_http_500_server_error(self):
        from starlette.exceptions import HTTPException as StarletteHTTPException

        from app.main import http_exception_handler

        request = _mock_request()
        exc = StarletteHTTPException(status_code=500, detail="Internal error")
        response = asyncio.run(http_exception_handler(request, exc))

        assert response.status_code == 500

    def test_http_400_bad_request(self):
        from starlette.exceptions import HTTPException as StarletteHTTPException

        from app.main import http_exception_handler

        request = _mock_request()
        exc = StarletteHTTPException(status_code=400, detail="Bad request data")
        response = asyncio.run(http_exception_handler(request, exc))

        assert response.status_code == 400

    def test_http_404_not_found(self):
        from starlette.exceptions import HTTPException as StarletteHTTPException

        from app.main import http_exception_handler

        request = _mock_request()
        exc = StarletteHTTPException(status_code=404, detail="Resource not found")
        response = asyncio.run(http_exception_handler(request, exc))

        assert response.status_code == 404

    def test_http_handler_with_query_params(self):
        """log_error should print query params when request has them."""
        from starlette.exceptions import HTTPException as StarletteHTTPException

        from app.main import http_exception_handler

        request = _mock_request(query_params={"search": "mosque", "page": "1"})
        exc = StarletteHTTPException(status_code=400, detail="Bad query")
        response = asyncio.run(http_exception_handler(request, exc))

        assert response.status_code == 400


# ── TestGeneralExceptionHandler ───────────────────────────────────────────────


class TestGeneralExceptionHandler:
    def test_unhandled_exception_returns_500(self):
        from app.main import general_exception_handler

        request = _mock_request()
        exc = RuntimeError("Something went very wrong")
        response = asyncio.run(general_exception_handler(request, exc))

        assert response.status_code == 500

    def test_unhandled_exception_returns_generic_body(self):
        import json

        from app.main import general_exception_handler

        request = _mock_request()
        exc = ValueError("Value error occurred")
        response = asyncio.run(general_exception_handler(request, exc))

        body = json.loads(response.body)
        # error.type is now a structured log field, not exposed in the response body
        assert body["detail"] == "Internal server error"
        assert response.status_code == 500


# ── TestValidationExceptionHandler ───────────────────────────────────────────


class TestValidationExceptionHandler:
    def test_validation_error_with_non_serializable_ctx(self):
        """ctx values that cannot be JSON serialized should be converted to strings."""
        import json

        from app.main import validation_exception_handler

        request = _mock_request()
        exc = MagicMock()
        exc.errors.return_value = [
            {
                "loc": ("body", "name"),
                "msg": "value is not valid",
                "type": "type_error",
                "ctx": {
                    "serializable": "normal string",
                    "non_serializable": ValueError("bad value"),
                },
            }
        ]
        response = asyncio.run(validation_exception_handler(request, exc))

        assert response.status_code == 422
        body = json.loads(response.body)
        detail = body["detail"]
        assert len(detail) == 1
        ctx = detail[0].get("ctx", {})
        # serializable stays as-is
        assert ctx["serializable"] == "normal string"
        # non-serializable is converted to string representation
        assert "bad value" in ctx["non_serializable"]

    def test_validation_error_without_ctx(self):
        """Validation error without ctx should be handled cleanly."""
        import json

        from app.main import validation_exception_handler

        request = _mock_request()
        exc = MagicMock()
        exc.errors.return_value = [
            {
                "loc": ("body", "field"),
                "msg": "field required",
                "type": "missing",
            }
        ]
        response = asyncio.run(validation_exception_handler(request, exc))

        assert response.status_code == 422
        body = json.loads(response.body)
        assert body["detail"][0]["type"] == "missing"
        assert "ctx" not in body["detail"][0]

    def test_validation_error_with_serializable_ctx(self):
        """Serializable ctx values should pass through unchanged."""
        import json

        from app.main import validation_exception_handler

        request = _mock_request()
        exc = MagicMock()
        exc.errors.return_value = [
            {
                "loc": ("body", "age"),
                "msg": "ensure this value is greater than or equal to 0",
                "type": "value_error.number.not_ge",
                "ctx": {"limit_value": 0},
            }
        ]
        response = asyncio.run(validation_exception_handler(request, exc))

        body = json.loads(response.body)
        ctx = body["detail"][0]["ctx"]
        assert ctx["limit_value"] == 0  # Unchanged (int is serializable)


# ── TestLogError ──────────────────────────────────────────────────────────────


class TestLogError:
    def test_log_error_with_query_params(self):
        """_log_http_error should run without error when query_params is non-empty."""
        from app.main import _log_http_error

        request = _mock_request(query_params={"city": "Dubai"})
        _log_http_error(request, 400, "Test error detail")

    def test_log_error_500_with_traceback(self):
        """_log_http_error at 500 level should attach exc_info."""
        from app.main import _log_http_error

        request = _mock_request()
        exc = RuntimeError("Something failed")
        _log_http_error(request, 500, "Unexpected failure", exc=exc)

    def test_log_error_without_exception(self):
        """_log_http_error without an exception arg should run without error."""
        from app.main import _log_http_error

        request = _mock_request()
        _log_http_error(request, 404, "Resource missing")


# ── TestDbSession ─────────────────────────────────────────────────────────────


class TestDbSession:
    def test_create_db_and_tables(self):
        """create_db_and_tables() should run without raising."""
        from sqlalchemy.pool import StaticPool
        from sqlmodel import create_engine

        test_engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        import app.db.models  # noqa: F401 — register models before create_all

        with patch("app.db.session.engine", test_engine):
            from app.db.session import create_db_and_tables

            create_db_and_tables()  # Idempotent — safe to call again

    def test_get_db_session_yields_session(self):
        """get_db_session() generator yields a valid Session object."""
        from sqlmodel import Session

        from app.db.session import get_db_session

        gen = get_db_session()
        session = next(gen)
        assert isinstance(session, Session)
        gen.close()  # Close without iteration to avoid StopIteration noise
