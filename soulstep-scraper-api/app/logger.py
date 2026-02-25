"""
Centralized logging configuration for SoulStep Scraper API.

Usage:
    from app.logger import get_logger
    logger = get_logger(__name__)

Environment variables:
    LOG_LEVEL  : DEBUG | INFO | WARNING | ERROR | CRITICAL  (default: INFO)
    LOG_FORMAT : text | json                                  (default: text)
"""

from __future__ import annotations

import json
import logging
import os
import re
import sys
from datetime import UTC, datetime

# Regex patterns to mask secrets inside log message strings.
# Each tuple is (compiled_pattern, replacement).
_SECRET_PATTERNS: list[tuple[re.Pattern, str]] = [
    # api_key=VALUE  /  api-key: VALUE  /  api_key: VALUE
    (re.compile(r"(api[_-]?key\s*[=:]\s*)([^\s&\"'\\,]+)", re.IGNORECASE), r"\1***"),
    # password=VALUE
    (re.compile(r"(password\s*[=:]\s*)([^\s&\"'\\,]+)", re.IGNORECASE), r"\1***"),
    # secret=VALUE
    (re.compile(r"(\bsecret\s*[=:]\s*)([^\s&\"'\\,]+)", re.IGNORECASE), r"\1***"),
    # token=VALUE
    (re.compile(r"(\btoken\s*[=:]\s*)([^\s&\"'\\,]+)", re.IGNORECASE), r"\1***"),
]

# Environment variable names whose values must be masked when logging config.
SECRET_ENV_VARS: frozenset[str] = frozenset(
    {
        "GOOGLE_MAPS_API_KEY",
        "BESTTIME_API_KEY",
        "FOURSQUARE_API_KEY",
        "OUTSCRAPER_API_KEY",
        "ANTHROPIC_API_KEY",
        "DATABASE_URL",
        "SECRET_KEY",
    }
)


def mask_secret(value: str) -> str:
    """Mask a secret value for display — shows only the first 4 chars."""
    if not value:
        return "***"
    if len(value) <= 4:
        return "***"
    return value[:4] + "***"


def mask_message(msg: str) -> str:
    """Apply all secret-masking patterns to *msg* and return the safe string."""
    for pattern, replacement in _SECRET_PATTERNS:
        msg = pattern.sub(replacement, msg)
    return msg


class _SecretMaskingFormatter(logging.Formatter):
    """Text formatter that scrubs API keys / secrets from every log record."""

    def format(self, record: logging.LogRecord) -> str:
        # Copy to avoid mutating the original record (other handlers may use it)
        record = logging.makeLogRecord(record.__dict__)
        record.msg = mask_message(str(record.msg))
        # Resolve %-style args so they are included in the masked message
        if record.args:
            try:
                record.msg = record.msg % record.args
                record.args = None
            except Exception:
                pass
        return super().format(record)


class _JSONFormatter(logging.Formatter):
    """JSON structured formatter for production / log-aggregation pipelines."""

    def format(self, record: logging.LogRecord) -> str:
        entry: dict = {
            "timestamp": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": mask_message(record.getMessage()),
        }
        if record.exc_info:
            entry["exception"] = self.formatException(record.exc_info)
        return json.dumps(entry, ensure_ascii=False)


def setup_logging() -> None:
    """
    Configure the root logger once at application startup.

    Reads LOG_LEVEL and LOG_FORMAT from environment variables.
    Idempotent — safe to call multiple times (clears existing handlers first).
    """
    level_name = os.environ.get("LOG_LEVEL", "INFO").upper()
    log_level = getattr(logging, level_name, logging.INFO)
    log_format = os.environ.get("LOG_FORMAT", "text").lower()

    root = logging.getLogger()
    root.setLevel(log_level)
    # Remove existing handlers to avoid duplicates on reload
    root.handlers.clear()

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(log_level)

    if log_format == "json":
        handler.setFormatter(_JSONFormatter())
    else:
        fmt = "%(asctime)s [%(levelname)-8s] %(name)s: %(message)s"
        handler.setFormatter(_SecretMaskingFormatter(fmt=fmt, datefmt="%Y-%m-%d %H:%M:%S"))

    root.addHandler(handler)


def get_logger(name: str) -> logging.Logger:
    """Return a named logger.  Call ``setup_logging()`` once at startup before use."""
    return logging.getLogger(name)
