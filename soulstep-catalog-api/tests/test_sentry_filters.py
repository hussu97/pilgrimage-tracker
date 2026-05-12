from app.core.sentry_filters import before_send, should_drop_uvicorn_traceback_log


def test_drops_log_only_uvicorn_traceback_event():
    event = {
        "logger": "uvicorn.error",
        "level": "error",
        "logentry": {
            "formatted": "Traceback (most recent call last):\n  File ...",
        },
    }

    assert should_drop_uvicorn_traceback_log(event) is True
    assert before_send(event) is None


def test_keeps_structured_uvicorn_exception_event():
    event = {
        "logger": "uvicorn.error",
        "level": "error",
        "logentry": {
            "formatted": "Traceback (most recent call last):\n  File ...",
        },
        "exception": {
            "values": [{"type": "RuntimeError", "value": "database unavailable"}],
        },
    }

    assert should_drop_uvicorn_traceback_log(event) is False
    assert before_send(event) is event


def test_keeps_application_error_logs():
    event = {
        "logger": "app.main",
        "level": "error",
        "logentry": {
            "formatted": "GET /api/v1/places/plc_123 -> 500: An unexpected error occurred",
        },
    }

    assert should_drop_uvicorn_traceback_log(event) is False
    assert before_send(event) is event
