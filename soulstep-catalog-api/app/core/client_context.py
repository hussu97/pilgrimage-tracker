"""Per-request client context using Python ContextVars.

Populated by the client_context_middleware in main.py on every incoming
request. Any downstream function can call get_client_context() without
needing it passed as a parameter.
"""

from contextvars import ContextVar
from dataclasses import dataclass


@dataclass
class ClientContext:
    content_type: str  # "desktop" | "mobile"
    app_type: str  # always "web" for current clients
    platform: str  # always "web" for current clients


_client_context: ContextVar[ClientContext | None] = ContextVar("client_context", default=None)


def set_client_context(ctx: ClientContext) -> object:
    """Set the current request's client context. Returns a token for reset."""
    return _client_context.set(ctx)


def reset_client_context(token: object) -> None:
    """Reset the ContextVar after the request finishes."""
    _client_context.reset(token)  # type: ignore[arg-type]


def get_client_context() -> ClientContext | None:
    """Return the client context for the current request, or None."""
    return _client_context.get()
