"""
External query logger for the Catalog API.

Records every outbound API call (Google Places autocomplete, place details, etc.)
with timing, status, and caller context — without leaking API keys.

Environment:
    K_SERVICE   : set by Cloud Run → JSON mode, stdout only (Cloud Logging)
    LOG_FORMAT  : "json" (default) | "text" → "text" forces local file logging
"""

from __future__ import annotations

import logging
import os
import re
from logging.handlers import RotatingFileHandler
from pathlib import Path

_LOGGER_NAME = "external_query"

# Mask API keys / secrets that may appear in log messages.
_SECRET_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"(api[_-]?key\s*[=:]\s*)([^\s&\"'\\,]+)", re.IGNORECASE), r"\1***"),
    (re.compile(r"(password\s*[=:]\s*)([^\s&\"'\\,]+)", re.IGNORECASE), r"\1***"),
    (re.compile(r"(\bsecret\s*[=:]\s*)([^\s&\"'\\,]+)", re.IGNORECASE), r"\1***"),
    (re.compile(r"(\btoken\s*[=:]\s*)([^\s&\"'\\,]+)", re.IGNORECASE), r"\1***"),
]


def _mask_message(msg: str) -> str:
    for pattern, replacement in _SECRET_PATTERNS:
        msg = pattern.sub(replacement, msg)
    return msg


class _MaskingFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        record = logging.makeLogRecord(record.__dict__)
        record.msg = _mask_message(str(record.msg))
        if record.args:
            try:
                record.msg = record.msg % record.args
                record.args = None
            except Exception:
                pass
        return super().format(record)


def _setup_query_logger() -> logging.Logger:
    qlog = logging.getLogger(_LOGGER_NAME)
    if qlog.handlers:  # idempotent — already configured
        return qlog

    qlog.propagate = True  # inherit root handler → stdout (Cloud Run / JSON)

    is_local = (
        os.environ.get("K_SERVICE") is None
        and os.environ.get("LOG_FORMAT", "json").lower() != "json"
    )
    if is_local:
        log_dir = Path(__file__).resolve().parents[2] / "logs"
        log_dir.mkdir(exist_ok=True)
        fh = RotatingFileHandler(
            log_dir / "external_queries.log",
            maxBytes=5_242_880,  # 5 MB
            backupCount=3,
        )
        fmt = "%(asctime)s [%(levelname)-8s] %(message)s"
        fh.setFormatter(_MaskingFormatter(fmt=fmt, datefmt="%Y-%m-%d %H:%M:%S"))
        qlog.addHandler(fh)

    return qlog


_qlog = _setup_query_logger()


def log_query(
    service: str,
    endpoint: str,
    method: str,
    status_code: int | None,
    duration_ms: float,
    caller: str,
    request_info: dict | None = None,
    response_info: dict | None = None,
    run_code: str | None = None,
    error: str | None = None,
) -> None:
    """Log a single outbound API call.

    Args:
        service:       External service name, e.g. "gmaps".
        endpoint:      API endpoint/method name, e.g. "autocomplete", "placeDetails".
        method:        HTTP verb — "GET" or "POST".
        status_code:   HTTP response status code, or None on network error.
        duration_ms:   Round-trip time in milliseconds.
        caller:        Python function name that made the call.
        request_info:  Sanitized request params (must NOT contain API keys).
        response_info: Key result fields (e.g. result counts).
        run_code:      Optional run identifier.
        error:         Exception message if the call raised.
    """
    level = (
        logging.ERROR
        if (error or (status_code is not None and status_code >= 500))
        else logging.WARNING
        if (status_code is not None and status_code >= 400)
        else logging.INFO
    )

    extra = {
        k: v
        for k, v in {
            "event": "external_query",
            "service": service,
            "endpoint": endpoint,
            "method": method,
            "status_code": status_code,
            "duration_ms": round(duration_ms, 2),
            "caller": caller,
            "request": request_info,
            "response": response_info,
            "run_code": run_code,
            "error": error,
        }.items()
        if v is not None
    }

    _qlog.log(
        level,
        "%s.%s %s %.0fms",
        service,
        endpoint,
        status_code,
        duration_ms,
        extra=extra,
    )
