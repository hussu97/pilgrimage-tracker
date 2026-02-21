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
                        log_record["level"] = log_record.pop("levelname")

            handler = logging.StreamHandler()
            handler.setFormatter(
                _CustomJsonFormatter("%(timestamp)s %(level)s %(name)s %(message)s")
            )
        except ImportError:
            # Fallback to text if python-json-logger is not installed
            handler = logging.StreamHandler()
            handler.setFormatter(
                logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s")
            )
    else:
        # Human-readable format for local development
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))

    root_logger.setLevel(log_level)
    root_logger.addHandler(handler)
