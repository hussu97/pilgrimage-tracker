"""Sentry event filters for low-signal framework log noise."""

_UVI_LOGGER = "uvicorn.error"
_TRACEBACK_PREFIX = "Traceback (most recent call last):"


def _event_message(event: dict) -> str:
    logentry = event.get("logentry") or {}
    return str(logentry.get("formatted") or logentry.get("message") or event.get("message") or "")


def _has_structured_exception(event: dict) -> bool:
    return bool((event.get("exception") or {}).get("values"))


def should_drop_uvicorn_traceback_log(event: dict) -> bool:
    """Drop log-only uvicorn traceback events that duplicate app errors.

    Sentry's logging integration can turn uvicorn's plain text traceback log
    into an issue titled only "Traceback (most recent call last)", without the
    route-level context emitted by our exception handler. Keep structured
    exception events; only suppress the low-signal log-only duplicate.
    """
    if event.get("logger") != _UVI_LOGGER:
        return False
    if _has_structured_exception(event):
        return False
    return _event_message(event).lstrip().startswith(_TRACEBACK_PREFIX)


def before_send(event: dict, hint: dict | None = None) -> dict | None:
    del hint
    if should_drop_uvicorn_traceback_log(event):
        return None
    return event
