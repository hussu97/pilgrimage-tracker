"""Tests for browser_translation.py and translation_service.py routing.

All Playwright I/O is mocked — no real browser is launched.
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch


# ── Helpers ────────────────────────────────────────────────────────────────────
def _make_session(translation_count: int = 0, in_use: bool = False):
    """Return a mock _BrowserSession."""
    from app.services.browser_translation import _BrowserSession

    ctx = AsyncMock()
    page = AsyncMock()
    page.url = "https://translate.google.com/?sl=en&tl=ar&op=translate"
    page.content = AsyncMock(return_value="<html></html>")
    page.query_selector = AsyncMock(return_value=None)
    page.goto = AsyncMock()
    page.click = AsyncMock()
    page.keyboard = AsyncMock()
    page.keyboard.type = AsyncMock()
    page.keyboard.press = AsyncMock()
    page.wait_for_selector = AsyncMock()
    page.add_init_script = AsyncMock()

    session = _BrowserSession(context=ctx, page=page)
    session.translation_count = translation_count
    session.in_use = in_use
    return session


# ── Pool tests ─────────────────────────────────────────────────────────────────
class TestBrowserSessionPool:
    def test_pool_creates_sessions_on_acquire(self):
        """Pool creates a new session when empty."""
        from app.services.browser_translation import BrowserSessionPool

        pool = BrowserSessionPool(pool_size=2)
        session = _make_session()

        async def run():
            pool._initialized = True
            pool._browser = AsyncMock()
            pool._browser.new_context = AsyncMock(return_value=session.context)
            session.context.new_page = AsyncMock(return_value=session.page)

            with patch("app.services.browser_translation._apply_stealth", new=AsyncMock()):
                with patch.object(pool, "_create_session", new=AsyncMock(return_value=session)):
                    acquired = await pool.acquire()
                    assert acquired.in_use is True

        asyncio.run(run())

    def test_pool_recycles_after_max_translations(self):
        """release() with recycle=True removes session from pool."""
        from app.services.browser_translation import BrowserSessionPool

        pool = BrowserSessionPool(pool_size=2)
        session = _make_session(translation_count=50)
        pool._sessions.append(session)
        session.in_use = True

        async def run():
            await pool.release(session, recycle=True)
            assert session not in pool._sessions

        asyncio.run(run())

    def test_pool_shutdown_closes_all_contexts(self):
        """shutdown() closes every context and the browser."""
        from app.services.browser_translation import BrowserSessionPool

        pool = BrowserSessionPool(pool_size=2)
        s1 = _make_session()
        s2 = _make_session()
        pool._sessions = [s1, s2]
        pool._browser = AsyncMock()
        pool._playwright = AsyncMock()
        pool._initialized = True

        async def run():
            await pool.shutdown()
            s1.context.close.assert_called_once()
            s2.context.close.assert_called_once()
            pool._browser.close.assert_called_once()
            assert pool._sessions == []

        asyncio.run(run())

    def test_release_marks_session_idle(self):
        """release() without recycle=True marks the session as not in use."""
        from app.services.browser_translation import BrowserSessionPool

        pool = BrowserSessionPool(pool_size=2)
        session = _make_session()
        session.in_use = True
        pool._sessions.append(session)

        async def run():
            await pool.release(session, recycle=False)
            assert session.in_use is False

        asyncio.run(run())


# ── Stealth patch test ─────────────────────────────────────────────────────────
def test_stealth_js_applied():
    """_apply_stealth calls page.add_init_script with the JS snippet."""
    from app.services.browser_translation import _STEALTH_JS, _apply_stealth

    page = AsyncMock()

    async def run():
        await _apply_stealth(page)
        page.add_init_script.assert_called_once_with(_STEALTH_JS)

    asyncio.run(run())


# ── translate_single_browser happy path ───────────────────────────────────────
def test_translate_single_browser_happy_path():
    """translate_single_browser returns translated text on success."""
    from app.services.browser_translation import translate_single_browser

    session = _make_session()
    mock_pool = AsyncMock()
    mock_pool.acquire = AsyncMock(return_value=session)
    mock_pool.release = AsyncMock()

    # Simulate stable output
    output_el = AsyncMock()
    output_el.inner_text = AsyncMock(side_effect=["مرحبا", "مرحبا", "مرحبا"])

    input_el = AsyncMock()

    async def mock_query_selector(selector):
        if "HwtZe" in selector or "result" in selector or "W297wb" in selector:
            return output_el
        if "textarea" in selector or "contenteditable" in selector:
            return input_el
        return None

    session.page.query_selector = mock_query_selector

    async def run():
        with patch("app.services.browser_translation._get_pool", return_value=mock_pool):
            with patch(
                "app.services.browser_translation._check_for_captcha",
                new=AsyncMock(return_value=False),
            ):
                with patch("app.services.browser_translation._human_type", new=AsyncMock()):
                    with patch("app.services.browser_translation._random_delay", new=AsyncMock()):
                        result = await translate_single_browser("Hello", "ar")
        assert result == "مرحبا"

    asyncio.run(run())


# ── CAPTCHA detection ──────────────────────────────────────────────────────────
def test_captcha_detected_returns_none():
    """translate_single_browser returns None when CAPTCHA is detected."""
    from app.services.browser_translation import translate_single_browser

    session = _make_session()
    mock_pool = AsyncMock()
    mock_pool.acquire = AsyncMock(return_value=session)
    mock_pool.release = AsyncMock()

    async def run():
        with patch("app.services.browser_translation._get_pool", return_value=mock_pool):
            with patch(
                "app.services.browser_translation._check_for_captcha",
                new=AsyncMock(return_value=True),
            ):
                with patch("app.services.browser_translation._random_delay", new=AsyncMock()):
                    result = await translate_single_browser("Hello", "ar")
        assert result is None
        # Session should be recycled (recycle=True)
        _, kwargs = mock_pool.release.call_args
        assert kwargs.get("recycle") is True

    asyncio.run(run())


# ── Timeout / retry ────────────────────────────────────────────────────────────
def test_translation_timeout_returns_none():
    """translate_single_browser returns None when output never stabilises."""
    from app.services.browser_translation import translate_single_browser

    session = _make_session()
    mock_pool = AsyncMock()
    mock_pool.acquire = AsyncMock(return_value=session)
    mock_pool.release = AsyncMock()

    async def run():
        with patch("app.services.browser_translation._get_pool", return_value=mock_pool):
            with patch(
                "app.services.browser_translation._check_for_captcha",
                new=AsyncMock(return_value=False),
            ):
                with patch("app.services.browser_translation._human_type", new=AsyncMock()):
                    with patch("app.services.browser_translation._random_delay", new=AsyncMock()):
                        # _wait_for_translation always returns None (timeout)
                        with patch(
                            "app.services.browser_translation._wait_for_translation",
                            new=AsyncMock(return_value=None),
                        ):
                            result = await translate_single_browser("Hello", "ar")
        assert result is None

    asyncio.run(run())


# ── Circuit breaker ────────────────────────────────────────────────────────────
def test_circuit_breaker_trips_after_3_failures():
    """_CircuitBreaker opens after 3 consecutive failures."""
    from app.services.browser_translation import _CircuitBreaker

    cb = _CircuitBreaker(max_failures=3)
    assert not cb.is_open
    cb.record_failure()
    assert not cb.is_open
    cb.record_failure()
    assert not cb.is_open
    cb.record_failure()
    assert cb.is_open


def test_circuit_breaker_resets_on_success():
    """_CircuitBreaker resets on success."""
    from app.services.browser_translation import _CircuitBreaker

    cb = _CircuitBreaker(max_failures=3)
    cb.record_failure()
    cb.record_failure()
    cb.record_success()
    assert not cb.is_open
    assert cb._failures == 0


def test_batch_aborts_when_circuit_breaker_opens():
    """translate_batch_browser stops translating when circuit breaker opens."""
    from app.services.browser_translation import translate_batch_browser

    call_count = 0

    async def fake_single(text, target_lang, source_lang="en"):
        nonlocal call_count
        call_count += 1
        return None  # always fail

    async def run():
        with patch(
            "app.services.browser_translation.translate_single_browser",
            side_effect=fake_single,
        ):
            with patch("asyncio.sleep", new=AsyncMock()):
                results = await translate_batch_browser(["a", "b", "c", "d", "e"], target_lang="ar")
        # Should abort after 3 failures
        assert call_count == 3
        assert all(r is None for r in results)

    asyncio.run(run())


# ── Batch preserves positions for empty inputs ────────────────────────────────
def test_batch_preserves_empty_positions():
    """translate_batch_browser leaves None for empty/whitespace texts."""
    from app.services.browser_translation import translate_batch_browser

    async def fake_single(text, target_lang, source_lang="en"):
        return "translated"

    async def run():
        with patch(
            "app.services.browser_translation.translate_single_browser",
            side_effect=fake_single,
        ):
            with patch("asyncio.sleep", new=AsyncMock()):
                results = await translate_batch_browser(
                    ["hello", "", "  ", "world"], target_lang="ar"
                )

        assert results[0] == "translated"
        assert results[1] is None  # empty
        assert results[2] is None  # whitespace
        assert results[3] == "translated"

    asyncio.run(run())


# ── Routing: translation_service.py ───────────────────────────────────────────
def test_routing_api_backend(monkeypatch):
    """TRANSLATION_BACKEND=api routes to the Google API backend."""
    monkeypatch.setenv("TRANSLATION_BACKEND", "api")

    import app.services.translation_service as ts

    with patch.object(ts, "_translate_text_api", return_value="مرحبا") as mock_api:
        result = ts.translate_text("Hello", "ar")
    mock_api.assert_called_once_with("Hello", "ar", "en")
    assert result == "مرحبا"


def test_routing_browser_backend(monkeypatch):
    """TRANSLATION_BACKEND=browser routes to the browser backend."""
    monkeypatch.setenv("TRANSLATION_BACKEND", "browser")

    import app.services.translation_service as ts

    with patch.object(ts, "_translate_text_browser", return_value="مرحبا") as mock_browser:
        result = ts.translate_text("Hello", "ar")
    mock_browser.assert_called_once_with("Hello", "ar", "en")
    assert result == "مرحبا"


def test_fallback_to_api_when_browser_fails(monkeypatch):
    """TRANSLATION_FALLBACK=true falls back to API when browser returns None."""
    monkeypatch.setenv("TRANSLATION_BACKEND", "browser")
    monkeypatch.setenv("TRANSLATION_FALLBACK", "true")

    import app.services.translation_service as ts

    with patch.object(ts, "_translate_text_browser", return_value=None):
        with patch.object(ts, "_translate_text_api", return_value="مرحبا") as mock_api:
            result = ts.translate_text("Hello", "ar")
    mock_api.assert_called_once()
    assert result == "مرحبا"


def test_no_fallback_when_disabled(monkeypatch):
    """TRANSLATION_FALLBACK=false does NOT call API when browser returns None."""
    monkeypatch.setenv("TRANSLATION_BACKEND", "browser")
    monkeypatch.setenv("TRANSLATION_FALLBACK", "false")

    import app.services.translation_service as ts

    with patch.object(ts, "_translate_text_browser", return_value=None):
        with patch.object(ts, "_translate_text_api") as mock_api:
            result = ts.translate_text("Hello", "ar")
    mock_api.assert_not_called()
    assert result is None
