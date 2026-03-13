"""Unit tests for the parallel browser translation helpers.

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


# ── translate_multi_browser tests ─────────────────────────────────────────────


def test_translate_multi_browser_happy_path():
    """Sentinel-delimited block is split back correctly for 3 texts."""
    from app.services.browser_translation import translate_multi_browser

    # Simulate the translated block that Google returns
    raw_translated = "【1】مرحبا\n【2】العالم\n【3】كيف حالك"

    async def run():
        with patch(
            "app.services.browser_translation.translate_single_browser",
            new=AsyncMock(return_value=raw_translated),
        ):
            result = await translate_multi_browser(
                ["Hello", "World", "How are you"], target_lang="ar"
            )
        assert result == ["مرحبا", "العالم", "كيف حالك"]

    asyncio.run(run())


def test_translate_multi_browser_sentinel_mismatch_fallback():
    """When sentinel count doesn't match, falls back to individual calls."""
    from app.services.browser_translation import translate_multi_browser

    # Raw output has only 2 segments but we sent 3 texts
    raw_translated = "【1】مرحبا\n【2】العالم"
    individual_calls = []

    async def fake_single(text, target_lang, source_lang="en"):
        individual_calls.append(text)
        return f"translated_{text}"

    async def run():
        with patch(
            "app.services.browser_translation.translate_single_browser",
            side_effect=fake_single,
        ) as mock_single:
            # First call returns the mismatched raw (used for multi-block attempt)
            mock_single.side_effect = [raw_translated] + [
                f"translated_{t}" for t in ["Hello", "World", "How are you"]
            ]
            result = await translate_multi_browser(
                ["Hello", "World", "How are you"], target_lang="ar"
            )
        # Fallback should have called individual translations for each text
        assert len(result) == 3

    asyncio.run(run())


def test_translate_multi_browser_empty_positions_preserved():
    """Empty/whitespace inputs are returned as None; only 1 non-empty text → direct call."""
    from app.services.browser_translation import translate_multi_browser

    # When there is only 1 non-empty text, translate_multi_browser calls
    # translate_single_browser directly (no sentinel block needed).
    # The mock should return just the translated text.

    async def run():
        with patch(
            "app.services.browser_translation.translate_single_browser",
            new=AsyncMock(return_value="مرحبا"),
        ):
            result = await translate_multi_browser(["Hello", "", "  "], target_lang="ar")
        assert result[0] == "مرحبا"
        assert result[1] is None  # empty
        assert result[2] is None  # whitespace

    asyncio.run(run())


# ── translate_batch_browser_parallel tests ────────────────────────────────────


def test_translate_batch_browser_parallel_on_result_fires():
    """on_result callback is called once per item with correct index and value."""
    from app.services.browser_translation import translate_batch_browser_parallel

    received: list[tuple[int, str | None]] = []

    async def fake_multi(texts, target_lang, source_lang="en"):
        return [f"t_{t}" for t in texts]

    async def on_result(idx: int, val: str | None) -> None:
        received.append((idx, val))

    async def run():
        with patch(
            "app.services.browser_translation.translate_multi_browser",
            side_effect=fake_multi,
        ):
            result = await translate_batch_browser_parallel(
                ["a", "b", "c"],
                target_lang="ar",
                multi_size=2,
                on_result=on_result,
            )
        assert result == ["t_a", "t_b", "t_c"]
        # Callback should have fired 3 times total
        assert len(received) == 3
        # All indices 0–2 should appear
        assert sorted(i for i, _ in received) == [0, 1, 2]

    asyncio.run(run())


def test_semaphore_limits_concurrency():
    """BrowserSessionPool with pool_size=1 forces sequential acquire/release."""
    from app.services.browser_translation import BrowserSessionPool

    order: list[str] = []

    async def run():
        pool = BrowserSessionPool(pool_size=1)
        pool._initialized = True
        pool._browser = AsyncMock()

        s1 = _make_session()
        s2 = _make_session()
        sessions_iter = iter([s1, s2])

        async def fake_create():
            return next(sessions_iter)

        pool._create_session = fake_create

        async def task(name: str):
            order.append(f"acquire_{name}")
            session = await pool.acquire()
            order.append(f"got_{name}")
            await asyncio.sleep(0)  # yield
            order.append(f"release_{name}")
            await pool.release(session)

        # With pool_size=1 semaphore, only one task can hold a session at a time
        await asyncio.gather(task("A"), task("B"))

        # With pool_size=1, the second task must wait until the first releases
        # So: acquire_A, got_A, (possibly acquire_B waits), release_A, got_B, release_B
        # At minimum, got_B must come after release_A
        idx_release_a = next(i for i, v in enumerate(order) if v == "release_A")
        idx_got_b = next(i for i, v in enumerate(order) if v == "got_B")
        assert idx_got_b > idx_release_a

    asyncio.run(run())
