"""Per-request ID tracing using Python ContextVars.

A UUID4 request ID is generated and stored at the start of every incoming
request by request_id_middleware in main.py. Any downstream function can
call get_request_id() to include it in log entries without threading the
value through function arguments.
"""

import uuid
from contextvars import ContextVar, Token

_request_id_var: ContextVar[str] = ContextVar("request_id", default="")


def generate_request_id() -> str:
    """Generate a new UUID4 string to use as a request ID."""
    return str(uuid.uuid4())


def get_request_id() -> str:
    """Return the request ID for the current request, or "" if not set."""
    return _request_id_var.get()


def set_request_id(rid: str) -> Token:
    """Set the request ID for the current request. Returns a token for reset."""
    return _request_id_var.set(rid)


def reset_request_id(token: Token) -> None:
    """Reset the ContextVar after the request finishes."""
    _request_id_var.reset(token)
