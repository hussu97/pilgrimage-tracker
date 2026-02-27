"""Structured logging configuration.

Call setup_logging() once at application startup (before importing any
app modules that use logging) to configure the root logger.

Environment variables:
    LOG_LEVEL  — Python log level name (default: INFO)
    LOG_FORMAT — "json" for structured JSON output (default, production);
                 "text" for human-readable output (development)
"""

import logging
import os
from contextvars import ContextVar

# GCP trace context — populated per-request by the trace middleware in main.py.
# Included in every JSON log entry so Cloud Logging links the app log to the
# corresponding request log ("correlated entries").
_TRACE_CTX: ContextVar[dict | None] = ContextVar("_gcp_trace", default=None)


def set_trace_context(project_id: str, trace_id: str, span_id: str, sampled: bool) -> None:
    """Store GCP trace fields for the current async task context.

    Called by the HTTP middleware in main.py on every incoming request.
    Safe to call with an empty trace_id — does nothing in that case.
    """
    if not trace_id:
        return
    trace_path = f"projects/{project_id}/traces/{trace_id}" if project_id else trace_id
    _TRACE_CTX.set(
        {
            "logging.googleapis.com/trace": trace_path,
            "logging.googleapis.com/spanId": span_id,
            "logging.googleapis.com/traceSampled": sampled,
        }
    )


# Standard LogRecord attributes — anything outside this set is an extra field
# added by the caller and should be included in text output.
_STANDARD_LOG_KEYS: frozenset[str] = frozenset(
    {
        "name",
        "msg",
        "args",
        "levelname",
        "levelno",
        "pathname",
        "filename",
        "module",
        "exc_info",
        "exc_text",
        "stack_info",
        "lineno",
        "funcName",
        "created",
        "msecs",
        "relativeCreated",
        "thread",
        "threadName",
        "processName",
        "process",
        "message",
        "asctime",
        "taskName",
    }
)


class _TextFormatter(logging.Formatter):
    """Human-readable formatter that appends extra key=value pairs.

    Standard logging.Formatter silently drops ``extra`` fields; this subclass
    appends them so they're visible during local development.
    """

    def format(self, record: logging.LogRecord) -> str:
        base = super().format(record)
        extras = {k: v for k, v in record.__dict__.items() if k not in _STANDARD_LOG_KEYS}
        if extras:
            kv = "  ".join(f"{k}={v!r}" for k, v in extras.items())
            return f"{base}  |  {kv}"
        return base


def setup_logging() -> None:
    """Configure the root logger based on LOG_LEVEL and LOG_FORMAT env vars."""
    log_level_name = os.environ.get("LOG_LEVEL", "INFO").upper()
    log_level = getattr(logging, log_level_name, logging.INFO)
    log_format = os.environ.get("LOG_FORMAT", "json").lower()

    # Remove any handlers already attached (e.g. from basicConfig or imports)
    root_logger = logging.getLogger()
    root_logger.handlers.clear()

    if log_format == "json":
        try:
            try:
                from pythonjsonlogger.json import JsonFormatter
            except ImportError:
                from pythonjsonlogger.jsonlogger import JsonFormatter  # type: ignore[no-redef]

            class _CustomJsonFormatter(JsonFormatter):
                """Rename asctime → timestamp and levelname → level."""

                def add_fields(self, log_record, record, message_dict):
                    super().add_fields(log_record, record, message_dict)
                    # Rename fields for consistent key names
                    if "asctime" in log_record:
                        log_record["timestamp"] = log_record.pop("asctime")
                    elif "timestamp" not in log_record:
                        log_record["timestamp"] = self.formatTime(record)
                    if "levelname" in log_record:
                        # Cloud Logging uses "severity" (not "level") to classify
                        # entries. Without this, all logs appear as DEFAULT and
                        # severity-based filters return nothing.
                        log_record["severity"] = log_record.pop("levelname")
                    # Link this log entry to the Cloud Run request log so the app
                    # error/traceback appears in the same "correlated entries" view.
                    if trace := _TRACE_CTX.get():
                        log_record.update(trace)

            handler = logging.StreamHandler()
            handler.setFormatter(
                _CustomJsonFormatter("%(timestamp)s %(levelname)s %(name)s %(message)s")
            )
        except ImportError:
            # Fallback to text if python-json-logger is not installed
            handler = logging.StreamHandler()
            handler.setFormatter(_TextFormatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    else:
        # Human-readable format for local development — includes extra fields
        handler = logging.StreamHandler()
        handler.setFormatter(_TextFormatter("%(asctime)s %(levelname)-8s %(name)s: %(message)s"))

    root_logger.setLevel(log_level)
    root_logger.addHandler(handler)
