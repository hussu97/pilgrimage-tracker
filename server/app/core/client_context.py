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
    app_type: str  # "app" | "web"
    platform: str  # "ios" | "android" | "web"
    app_version: str | None  # e.g. "1.2.3" — mobile only; None for web


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


# ─── Semver utilities ─────────────────────────────────────────────────────────


def parse_semver(version: str) -> tuple[int, int, int]:
    """Parse a semver string like '1.2.3' into (major, minor, patch).

    Non-numeric segments are treated as 0.
    """
    parts = version.strip().split(".")[:3]
    result: list[int] = []
    for p in parts:
        try:
            result.append(int(p))
        except ValueError:
            result.append(0)
    while len(result) < 3:
        result.append(0)
    return (result[0], result[1], result[2])


def version_meets_minimum(current: str, minimum: str) -> bool:
    """Return True if *current* >= *minimum* (semver comparison).

    Returns True when minimum is empty (enforcement disabled).
    """
    if not minimum:
        return True
    return parse_semver(current) >= parse_semver(minimum)
