"""
Tests for make_request_with_backoff and CircuitBreaker in app.scrapers.base.

Verifies retry logic, exponential back-off durations, and early-exit
behaviour on non-rate-limit errors.  Also tests circuit-breaker open/close
transitions.
"""

from unittest.mock import MagicMock, patch

import pytest

from app.scrapers.base import CircuitBreaker, make_request_with_backoff


def _make_response(status_code: int) -> MagicMock:
    """Return a minimal mock response with the given status code."""
    r = MagicMock()
    r.status_code = status_code
    return r


class TestMakeRequestWithBackoff:
    def test_first_attempt_success_no_sleep(self):
        """200 on first attempt → returns immediately, never sleeps."""
        ok_resp = _make_response(200)
        with (
            patch("requests.request", return_value=ok_resp) as mock_req,
            patch("time.sleep") as mock_sleep,
        ):
            result = make_request_with_backoff("GET", "http://example.com/test")
            assert result is ok_resp
            mock_req.assert_called_once()
            mock_sleep.assert_not_called()

    def test_single_429_then_success(self):
        """One 429 → sleep 5 s → then 200."""
        rate_resp = _make_response(429)
        ok_resp = _make_response(200)
        with (
            patch("requests.request", side_effect=[rate_resp, ok_resp]),
            patch("time.sleep") as mock_sleep,
        ):
            result = make_request_with_backoff("GET", "http://example.com/test")
            assert result is ok_resp
            mock_sleep.assert_called_once_with(5)

    def test_two_429_then_success(self):
        """Two 429s then 200 → two sleeps with durations 5 and 10."""
        responses = [_make_response(429), _make_response(429), _make_response(200)]
        with (
            patch("requests.request", side_effect=responses),
            patch("time.sleep") as mock_sleep,
        ):
            result = make_request_with_backoff("GET", "http://example.com/test")
            assert result.status_code == 200
            assert mock_sleep.call_count == 2
            mock_sleep.assert_any_call(5)
            mock_sleep.assert_any_call(10)

    def test_max_retries_on_repeated_429(self):
        """Five consecutive 429s → returns None after max_retries exhausted."""
        responses = [_make_response(429)] * 5
        with (
            patch("requests.request", side_effect=responses),
            patch("time.sleep") as mock_sleep,
        ):
            result = make_request_with_backoff("GET", "http://example.com/test")
            assert result is None
            assert mock_sleep.call_count == 5

    def test_exponential_sleep_durations(self):
        """Sleep durations double each retry: 5, 10, 20, 40, 80."""
        responses = [_make_response(429)] * 5
        with (
            patch("requests.request", side_effect=responses),
            patch("time.sleep") as mock_sleep,
        ):
            make_request_with_backoff("GET", "http://example.com/test")
            sleep_args = [c.args[0] for c in mock_sleep.call_args_list]
            assert sleep_args == [5, 10, 20, 40, 80]

    def test_connection_error_returns_none(self):
        """ConnectionError → returns None immediately (no retry)."""
        with (
            patch("requests.request", side_effect=ConnectionError("refused")),
            patch("time.sleep") as mock_sleep,
        ):
            result = make_request_with_backoff("GET", "http://example.com/test")
            assert result is None
            mock_sleep.assert_not_called()

    def test_non_429_error_code_returns_immediately(self):
        """Non-429 status (e.g. 500) is returned immediately without retrying."""
        server_err = _make_response(500)
        with (
            patch("requests.request", return_value=server_err) as mock_req,
            patch("time.sleep") as mock_sleep,
        ):
            result = make_request_with_backoff("GET", "http://example.com/test")
            assert result is server_err
            assert mock_req.call_count == 1
            mock_sleep.assert_not_called()

    def test_404_returned_without_retry(self):
        """404 is not a rate-limit response — returned immediately."""
        not_found = _make_response(404)
        with (
            patch("requests.request", return_value=not_found) as mock_req,
            patch("time.sleep") as mock_sleep,
        ):
            result = make_request_with_backoff("GET", "http://example.com/test")
            assert result is not_found
            mock_req.assert_called_once()
            mock_sleep.assert_not_called()

    def test_kwargs_passed_to_request(self):
        """Extra kwargs (headers, params) are forwarded to requests.request."""
        ok_resp = _make_response(200)
        with patch("requests.request", return_value=ok_resp) as mock_req:
            make_request_with_backoff(
                "GET",
                "http://example.com/test",
                headers={"X-Key": "val"},
                params={"q": "test"},
            )
            call_kwargs = mock_req.call_args.kwargs
            assert call_kwargs["headers"] == {"X-Key": "val"}
            assert call_kwargs["params"] == {"q": "test"}


# ── CircuitBreaker ─────────────────────────────────────────────────────────────


class TestCircuitBreaker:
    async def test_success_passes_through(self):
        """Successful coroutine returns its result."""
        cb = CircuitBreaker(failure_threshold=3, reset_timeout_s=60.0, name="test")
        result = await cb.call(_async_ok("hello"))
        assert result == "hello"

    async def test_circuit_stays_closed_below_threshold(self):
        """Fewer than failure_threshold errors keep the circuit closed."""
        cb = CircuitBreaker(failure_threshold=3, reset_timeout_s=60.0, name="test")
        for _ in range(2):
            with pytest.raises(ValueError):
                await cb.call(_async_fail())
        # Circuit still closed — next call should still execute (and fail)
        with pytest.raises(ValueError):
            await cb.call(_async_fail())

    async def test_circuit_opens_after_threshold(self):
        """After failure_threshold consecutive failures the circuit opens."""
        cb = CircuitBreaker(failure_threshold=3, reset_timeout_s=60.0, name="test")
        for _ in range(3):
            with pytest.raises(ValueError):
                await cb.call(_async_fail())
        # Circuit is now open — must raise RuntimeError without executing coro
        # Close the coroutine to avoid ResourceWarning about unawaited coroutine
        coro = _async_ok("should not execute")
        with pytest.raises(RuntimeError, match="open"):
            await cb.call(coro)
        coro.close()  # clean up if RuntimeError was raised before awaiting

    async def test_success_resets_failure_count(self):
        """A successful call after failures resets consecutive failure count."""
        cb = CircuitBreaker(failure_threshold=3, reset_timeout_s=60.0, name="test")
        # Two failures
        for _ in range(2):
            with pytest.raises(ValueError):
                await cb.call(_async_fail())
        # Successful call resets counter
        await cb.call(_async_ok("ok"))
        assert cb._consecutive_failures == 0
        assert cb._opened_at is None

    async def test_circuit_half_open_after_timeout(self):
        """After reset_timeout_s, circuit enters half-open and allows a call."""

        cb = CircuitBreaker(failure_threshold=2, reset_timeout_s=0.0, name="test")
        for _ in range(2):
            with pytest.raises(ValueError):
                await cb.call(_async_fail())
        # reset_timeout_s=0 → already past timeout
        assert not cb.is_open
        # Should execute (and fail) rather than raise RuntimeError
        with pytest.raises(ValueError):
            await cb.call(_async_fail())

    async def test_is_open_returns_false_when_closed(self):
        cb = CircuitBreaker(failure_threshold=3, name="test")
        assert not cb.is_open

    async def test_is_open_returns_true_when_opened(self):
        cb = CircuitBreaker(failure_threshold=2, reset_timeout_s=9999, name="test")
        for _ in range(2):
            with pytest.raises(ValueError):
                await cb.call(_async_fail())
        assert cb.is_open


# ── helpers ───────────────────────────────────────────────────────────────────


async def _async_ok(value):
    return value


async def _async_fail():
    raise ValueError("simulated failure")
