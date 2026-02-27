"""
Tests for app.logger — secret masking, log setup, and named loggers.

Covers:
- mask_secret: shows first 4 chars, masks the rest
- mask_message: scrubs API keys / passwords / secrets / tokens from strings
- setup_logging: configures root logger level and formatter (text and JSON)
- get_logger: returns a correctly named Logger instance
"""

import logging
import os
import sys
from unittest.mock import patch

# ── mask_secret ────────────────────────────────────────────────────────────────


class TestMaskSecret:
    def test_long_value_shows_first_four_chars(self):
        from app.logger import mask_secret

        result = mask_secret("AIzaSyDeadBeef1234")
        assert result.startswith("AIza")
        assert result.endswith("***")

    def test_short_value_fully_masked(self):
        from app.logger import mask_secret

        assert mask_secret("abc") == "***"

    def test_exactly_four_chars_fully_masked(self):
        from app.logger import mask_secret

        assert mask_secret("abcd") == "***"

    def test_empty_string_returns_placeholder(self):
        from app.logger import mask_secret

        assert mask_secret("") == "***"

    def test_secret_value_not_in_output(self):
        from app.logger import mask_secret

        secret = "supersecret123456"
        result = mask_secret(secret)
        assert secret not in result
        assert "***" in result


# ── mask_message ──────────────────────────────────────────────────────────────


class TestMaskMessage:
    def test_masks_api_key_equals_form(self):
        from app.logger import mask_message

        msg = "api_key=mysecretkey123"
        result = mask_message(msg)
        assert "mysecretkey123" not in result
        assert "***" in result

    def test_masks_api_key_colon_form(self):
        from app.logger import mask_message

        msg = "api_key: ABCDEFGHIJ"
        result = mask_message(msg)
        assert "ABCDEFGHIJ" not in result

    def test_masks_password(self):
        from app.logger import mask_message

        msg = "password=supersecret"
        result = mask_message(msg)
        assert "supersecret" not in result
        assert "***" in result

    def test_masks_secret_field(self):
        from app.logger import mask_message

        msg = "secret=mytoken123"
        result = mask_message(msg)
        assert "mytoken123" not in result

    def test_masks_token_field(self):
        from app.logger import mask_message

        msg = "token=jwt_abc_def"
        result = mask_message(msg)
        assert "jwt_abc_def" not in result

    def test_safe_message_unchanged(self):
        from app.logger import mask_message

        msg = "Processing 42 places for run abc_123"
        assert mask_message(msg) == msg

    def test_case_insensitive(self):
        from app.logger import mask_message

        msg = "API_KEY=ABCDEFGH"
        result = mask_message(msg)
        assert "ABCDEFGH" not in result


# ── setup_logging ─────────────────────────────────────────────────────────────


class TestSetupLogging:
    def _reset_root_logger(self):
        """Remove all handlers from root logger so tests start clean."""
        root = logging.getLogger()
        root.handlers.clear()

    def test_default_level_is_info(self):
        from app.logger import setup_logging

        self._reset_root_logger()
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("LOG_LEVEL", None)
            setup_logging()
        assert logging.getLogger().level == logging.INFO

    def test_debug_level_from_env(self):
        from app.logger import setup_logging

        self._reset_root_logger()
        with patch.dict(os.environ, {"LOG_LEVEL": "DEBUG"}):
            setup_logging()
        assert logging.getLogger().level == logging.DEBUG

    def test_warning_level_from_env(self):
        from app.logger import setup_logging

        self._reset_root_logger()
        with patch.dict(os.environ, {"LOG_LEVEL": "WARNING"}):
            setup_logging()
        assert logging.getLogger().level == logging.WARNING

    def test_text_format_uses_masking_formatter(self):
        from app.logger import _SecretMaskingFormatter, setup_logging

        self._reset_root_logger()
        with patch.dict(os.environ, {"LOG_FORMAT": "text"}):
            setup_logging()
        root = logging.getLogger()
        assert any(isinstance(h.formatter, _SecretMaskingFormatter) for h in root.handlers)

    def test_json_format_uses_json_formatter(self):
        from app.logger import _JSONFormatter, setup_logging

        self._reset_root_logger()
        with patch.dict(os.environ, {"LOG_FORMAT": "json"}):
            setup_logging()
        root = logging.getLogger()
        assert any(isinstance(h.formatter, _JSONFormatter) for h in root.handlers)

    def test_handler_writes_to_stdout(self):
        from app.logger import setup_logging

        self._reset_root_logger()
        setup_logging()
        root = logging.getLogger()
        assert any(getattr(h, "stream", None) is sys.stdout for h in root.handlers)

    def test_idempotent_call_does_not_duplicate_handlers(self):
        from app.logger import setup_logging

        self._reset_root_logger()
        setup_logging()
        setup_logging()
        assert len(logging.getLogger().handlers) == 1


# ── get_logger ────────────────────────────────────────────────────────────────


class TestGetLogger:
    def test_returns_logger_instance(self):
        from app.logger import get_logger

        lg = get_logger("soulstep.test")
        assert isinstance(lg, logging.Logger)

    def test_logger_name_matches(self):
        from app.logger import get_logger

        lg = get_logger("soulstep.test.module")
        assert lg.name == "soulstep.test.module"

    def test_same_name_returns_same_instance(self):
        from app.logger import get_logger

        a = get_logger("soulstep.shared")
        b = get_logger("soulstep.shared")
        assert a is b

    def test_dunder_name_pattern_works(self):
        from app.logger import get_logger

        lg = get_logger(__name__)
        assert lg.name == __name__


# ── _JSONFormatter ─────────────────────────────────────────────────────────────


class TestJSONFormatter:
    def test_output_is_valid_json(self):
        import json

        from app.logger import _JSONFormatter

        formatter = _JSONFormatter()
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="",
            lineno=0,
            msg="hello world",
            args=(),
            exc_info=None,
        )
        output = formatter.format(record)
        parsed = json.loads(output)
        assert parsed["severity"] == "INFO"
        assert parsed["message"] == "hello world"
        assert "timestamp" in parsed
        assert "logger" in parsed

    def test_secrets_masked_in_json_output(self):
        import json

        from app.logger import _JSONFormatter

        formatter = _JSONFormatter()
        record = logging.LogRecord(
            name="test",
            level=logging.WARNING,
            pathname="",
            lineno=0,
            msg="api_key=secret123",
            args=(),
            exc_info=None,
        )
        output = formatter.format(record)
        parsed = json.loads(output)
        assert "secret123" not in parsed["message"]
