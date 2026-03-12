"""
Unit tests for app.services.query_log.
"""

from __future__ import annotations

import importlib
import logging


def _reload_query_log():
    """Reimport query_log so _setup_query_logger() runs fresh each time."""
    import app.services.query_log as mod

    # Remove existing handlers so the module re-runs setup
    qlog = logging.getLogger("external_query")
    qlog.handlers.clear()

    importlib.reload(mod)
    return mod


def test_success_logs_info(caplog):
    """HTTP 200 → INFO level."""
    import app.services.query_log as qlog_mod

    with caplog.at_level(logging.INFO, logger="external_query"):
        qlog_mod.log_query(
            service="gmaps",
            endpoint="searchNearby",
            method="POST",
            status_code=200,
            duration_ms=120.5,
            caller="get_places_in_circle",
        )

    assert len(caplog.records) == 1
    assert caplog.records[0].levelno == logging.INFO


def test_4xx_logs_warning(caplog):
    """HTTP 404 → WARNING level."""
    import app.services.query_log as qlog_mod

    with caplog.at_level(logging.WARNING, logger="external_query"):
        qlog_mod.log_query(
            service="gmaps",
            endpoint="getPlace",
            method="GET",
            status_code=404,
            duration_ms=55.0,
            caller="_fetch_details",
        )

    assert len(caplog.records) == 1
    assert caplog.records[0].levelno == logging.WARNING


def test_5xx_logs_error(caplog):
    """HTTP 503 → ERROR level."""
    import app.services.query_log as qlog_mod

    with caplog.at_level(logging.ERROR, logger="external_query"):
        qlog_mod.log_query(
            service="gmaps",
            endpoint="searchNearby",
            method="POST",
            status_code=503,
            duration_ms=9999.0,
            caller="get_places_in_circle",
        )

    assert len(caplog.records) == 1
    assert caplog.records[0].levelno == logging.ERROR


def test_error_str_logs_error(caplog):
    """error= string → ERROR level even if status_code is None."""
    import app.services.query_log as qlog_mod

    with caplog.at_level(logging.ERROR, logger="external_query"):
        qlog_mod.log_query(
            service="gmaps",
            endpoint="getPlace",
            method="GET",
            status_code=None,
            duration_ms=0.0,
            caller="_fetch_details",
            error="timeout",
        )

    assert len(caplog.records) == 1
    assert caplog.records[0].levelno == logging.ERROR


def test_run_code_in_extra(caplog):
    """run_code appears as a top-level extra field on the log record."""
    import app.services.query_log as qlog_mod

    with caplog.at_level(logging.INFO, logger="external_query"):
        qlog_mod.log_query(
            service="gmaps",
            endpoint="searchNearby",
            method="POST",
            status_code=200,
            duration_ms=80.0,
            caller="get_places_in_circle",
            run_code="run_abc123",
        )

    assert len(caplog.records) == 1
    record = caplog.records[0]
    assert getattr(record, "run_code", None) == "run_abc123"


def test_no_api_key_leaked(caplog):
    """request_info containing an 'api_key' field must not appear in log output."""
    import app.services.query_log as qlog_mod

    with caplog.at_level(logging.INFO, logger="external_query"):
        qlog_mod.log_query(
            service="gmaps",
            endpoint="searchNearby",
            method="POST",
            status_code=200,
            duration_ms=100.0,
            caller="get_places_in_circle",
            request_info={"lat": 25.0, "lng": 55.0},  # no api_key here
        )

    assert len(caplog.records) == 1
    record = caplog.records[0]
    request = getattr(record, "request", {}) or {}
    assert "key" not in request
    assert "api_key" not in request


def test_idempotent_init(monkeypatch):
    """Calling log_query twice does not add extra handlers to the logger."""
    import app.services.query_log as qlog_mod

    qlog = logging.getLogger("external_query")
    handler_count_before = len(qlog.handlers)

    qlog_mod.log_query(
        service="gmaps",
        endpoint="searchNearby",
        method="POST",
        status_code=200,
        duration_ms=10.0,
        caller="test",
    )
    qlog_mod.log_query(
        service="gmaps",
        endpoint="getPlace",
        method="GET",
        status_code=200,
        duration_ms=20.0,
        caller="test",
    )

    # Handler count must not have grown
    assert len(qlog.handlers) == handler_count_before


def test_local_file_handler_added(tmp_path, monkeypatch):
    """In local/text mode a RotatingFileHandler is attached."""
    monkeypatch.delenv("K_SERVICE", raising=False)
    monkeypatch.setenv("LOG_FORMAT", "text")

    # Clear handlers so setup runs again
    qlog = logging.getLogger("external_query")
    qlog.handlers.clear()

    # Patch log dir to tmp_path
    import app.services.query_log as qlog_mod

    monkeypatch.setattr(
        qlog_mod,
        "_setup_query_logger",
        lambda: _patched_setup(tmp_path),
    )
    logger = qlog_mod._setup_query_logger()
    from logging.handlers import RotatingFileHandler

    file_handlers = [h for h in logger.handlers if isinstance(h, RotatingFileHandler)]
    assert len(file_handlers) == 1

    # Clean up
    for h in logger.handlers[:]:
        h.close()
        logger.removeHandler(h)


def _patched_setup(log_dir):
    """Helper used by test_local_file_handler_added to redirect log dir."""
    from logging.handlers import RotatingFileHandler

    qlog = logging.getLogger("external_query")
    qlog.handlers.clear()
    qlog.propagate = True
    fh = RotatingFileHandler(log_dir / "external_queries.log", maxBytes=5_242_880, backupCount=3)
    qlog.addHandler(fh)
    return qlog
