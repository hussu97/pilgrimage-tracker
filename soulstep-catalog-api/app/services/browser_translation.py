"""Headless browser translation backend using Playwright + translate.google.com.

This module provides a drop-in alternative to the Google Cloud Translation API.
It simulates a real user interacting with translate.google.com via Playwright,
avoiding API costs at the expense of speed and fragility.

Environment variables:
    BROWSER_POOL_SIZE          — concurrent browser contexts (default 2)
    BROWSER_MAX_TRANSLATIONS   — translations per context before recycling (default 50)
    BROWSER_HEADLESS           — run headless (default true)
"""

from __future__ import annotations

import asyncio
import logging
import os
import random
import time
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

# ── Configuration ──────────────────────────────────────────────────────────────
_POOL_SIZE = int(os.environ.get("BROWSER_POOL_SIZE", "2"))
_MAX_TRANSLATIONS = int(os.environ.get("BROWSER_MAX_TRANSLATIONS", "50"))
_HEADLESS = os.environ.get("BROWSER_HEADLESS", "true").lower() != "false"

# ── Output selectors (ordered by preference) ──────────────────────────────────
_OUTPUT_SELECTORS = [
    '[data-result-index="0"] span.HwtZe',
    ".result-container",
    "span[jsname='W297wb']",
]

# ── User agents ───────────────────────────────────────────────────────────────
_USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36",
]

_TIMEZONES = [
    "America/New_York",
    "America/Chicago",
    "America/Los_Angeles",
    "America/Toronto",
    "Europe/London",
    "Europe/Paris",
    "Europe/Berlin",
    "Asia/Tokyo",
    "Asia/Singapore",
    "Australia/Sydney",
]

_VIEWPORTS = [
    {"width": 1280, "height": 800},
    {"width": 1366, "height": 768},
    {"width": 1440, "height": 900},
    {"width": 1536, "height": 864},
    {"width": 1600, "height": 900},
    {"width": 1920, "height": 1080},
]


# ── Exceptions ─────────────────────────────────────────────────────────────────
class CaptchaDetectedError(Exception):
    """Raised when a CAPTCHA or 'unusual traffic' block is detected."""


class TranslationTimeoutError(Exception):
    """Raised when the translation output does not stabilise within the timeout."""


# ── Stealth patch ──────────────────────────────────────────────────────────────
_STEALTH_JS = """
() => {
    // Remove navigator.webdriver
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

    // Mock navigator.plugins
    Object.defineProperty(navigator, 'plugins', {
        get: () => [
            { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
            { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
            { name: 'Native Client', filename: 'internal-nacl-plugin' },
        ],
    });

    // Mock navigator.languages
    Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
    });

    // Mock chrome.runtime
    if (!window.chrome) {
        window.chrome = {};
    }
    if (!window.chrome.runtime) {
        window.chrome.runtime = { onConnect: {}, onMessage: {} };
    }

    // Mock permissions
    const originalQuery = window.navigator.permissions && window.navigator.permissions.query;
    if (originalQuery) {
        window.navigator.permissions.query = (parameters) =>
            parameters.name === 'notifications'
                ? Promise.resolve({ state: Notification.permission })
                : originalQuery(parameters);
    }
}
"""


async def _apply_stealth(page) -> None:
    """Inject stealth patches to avoid bot detection."""
    await page.add_init_script(_STEALTH_JS)


# ── Human-like helpers ─────────────────────────────────────────────────────────
async def _random_delay(min_ms: int = 100, max_ms: int = 500) -> None:
    delay = random.randint(min_ms, max_ms) / 1000
    await asyncio.sleep(delay)


async def _human_type(page, selector: str, text: str) -> None:
    """Type text character by character with human-like timing."""
    await page.click(selector)
    for i, char in enumerate(text):
        await page.keyboard.type(char)
        # 50-150ms per character
        await asyncio.sleep(random.randint(50, 150) / 1000)
        # Pause every 20-40 characters
        if i > 0 and i % random.randint(20, 40) == 0:
            await asyncio.sleep(random.randint(200, 600) / 1000)


async def _check_for_captcha(page) -> bool:
    """Return True if a CAPTCHA or 'unusual traffic' block is visible."""
    try:
        content = await page.content()
        if "unusual traffic" in content.lower() or "recaptcha" in content.lower():
            return True
        captcha_frame = await page.query_selector("iframe[src*='recaptcha']")
        if captcha_frame:
            return True
    except Exception:
        pass
    return False


async def _wait_for_translation(page, timeout_ms: int = 10000) -> str | None:
    """Poll output selectors until text stabilises (same value twice)."""
    deadline = time.monotonic() + timeout_ms / 1000
    prev_text = ""

    while time.monotonic() < deadline:
        for selector in _OUTPUT_SELECTORS:
            try:
                el = await page.query_selector(selector)
                if el:
                    text = (await el.inner_text()).strip()
                    if text and text == prev_text:
                        return text
                    if text:
                        prev_text = text
                        break
            except Exception:
                pass
        await asyncio.sleep(0.2)

    return None


# ── Circuit Breaker ────────────────────────────────────────────────────────────
@dataclass
class _CircuitBreaker:
    max_failures: int = 3
    _failures: int = field(default=0, init=False)
    _open: bool = field(default=False, init=False)

    def record_success(self) -> None:
        self._failures = 0
        self._open = False

    def record_failure(self) -> None:
        self._failures += 1
        if self._failures >= self.max_failures:
            self._open = True

    @property
    def is_open(self) -> bool:
        return self._open


# ── Browser Session Pool ───────────────────────────────────────────────────────
@dataclass
class _BrowserSession:
    context: object
    page: object
    translation_count: int = 0
    in_use: bool = False


class BrowserSessionPool:
    """Manages a pool of reusable Playwright browser contexts."""

    def __init__(self, pool_size: int = _POOL_SIZE) -> None:
        self._pool_size = pool_size
        self._sessions: list[_BrowserSession] = []
        self._playwright = None
        self._browser = None
        self._lock = asyncio.Lock()
        self._initialized = False

    async def _init(self) -> None:
        if self._initialized:
            return
        from playwright.async_api import async_playwright

        self._playwright = await async_playwright().start()
        self._browser = await self._playwright.chromium.launch(
            headless=_HEADLESS,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-first-run",
                "--no-default-browser-check",
                "--disable-infobars",
                "--disable-extensions",
                "--disable-gpu",
                "--no-sandbox",
                "--disable-setuid-sandbox",
            ],
        )
        self._initialized = True
        logger.info("BrowserSessionPool: launched Chromium (headless=%s)", _HEADLESS)

    async def _create_session(self) -> _BrowserSession:
        ua = random.choice(_USER_AGENTS)
        viewport = random.choice(_VIEWPORTS)
        timezone = random.choice(_TIMEZONES)

        context = await self._browser.new_context(
            user_agent=ua,
            viewport=viewport,
            timezone_id=timezone,
            locale="en-US",
        )
        page = await context.new_page()
        await _apply_stealth(page)
        return _BrowserSession(context=context, page=page)

    async def acquire(self) -> _BrowserSession:
        async with self._lock:
            await self._init()
            # Find an idle session that hasn't exceeded max translations
            for session in self._sessions:
                if not session.in_use and session.translation_count < _MAX_TRANSLATIONS:
                    session.in_use = True
                    return session
            # Create a new session if pool isn't full
            if len(self._sessions) < self._pool_size:
                session = await self._create_session()
                session.in_use = True
                self._sessions.append(session)
                logger.debug(
                    "BrowserSessionPool: created new session (total=%d)", len(self._sessions)
                )
                return session
            # Pool full — wait for a session to become available (spin)
        # Outside lock: wait briefly and retry
        await asyncio.sleep(0.5)
        return await self.acquire()

    async def release(self, session: _BrowserSession, recycle: bool = False) -> None:
        async with self._lock:
            if recycle or session.translation_count >= _MAX_TRANSLATIONS:
                # Close and remove this session
                try:
                    await session.context.close()
                except Exception:
                    pass
                if session in self._sessions:
                    self._sessions.remove(session)
                logger.debug("BrowserSessionPool: recycled session")
            else:
                session.in_use = False

    async def shutdown(self) -> None:
        async with self._lock:
            for session in self._sessions:
                try:
                    await session.context.close()
                except Exception:
                    pass
            self._sessions.clear()
            if self._browser:
                try:
                    await self._browser.close()
                except Exception:
                    pass
            if self._playwright:
                try:
                    await self._playwright.stop()
                except Exception:
                    pass
            self._initialized = False
            logger.info("BrowserSessionPool: shutdown complete")


# ── Module-level pool singleton ────────────────────────────────────────────────
_pool: BrowserSessionPool | None = None


def _get_pool() -> BrowserSessionPool:
    global _pool
    if _pool is None:
        _pool = BrowserSessionPool()
    return _pool


async def shutdown_pool() -> None:
    """Gracefully shut down the global browser pool. Call from app lifespan."""
    global _pool
    if _pool is not None:
        await _pool.shutdown()
        _pool = None


# ── Core translation function ──────────────────────────────────────────────────
async def translate_single_browser(
    text: str,
    target_lang: str,
    source_lang: str = "en",
) -> str | None:
    """Translate a single string using a headless browser.

    Returns the translated string, or None on failure.
    """
    if not text or not text.strip():
        return None

    pool = _get_pool()
    session = await pool.acquire()
    recycle = False

    try:
        page = session.page
        url = f"https://translate.google.com/?sl={source_lang}&tl={target_lang}&op=translate"

        # Navigate only on first use or if page URL is wrong
        current_url = page.url
        if not current_url.startswith("https://translate.google.com"):
            await page.goto(url, wait_until="domcontentloaded", timeout=15000)
            await _random_delay(500, 1500)

        # Check for CAPTCHA before proceeding
        if await _check_for_captcha(page):
            logger.warning("browser_translation: CAPTCHA detected, recycling context")
            raise CaptchaDetectedError("CAPTCHA detected on translate.google.com")

        # Find the input area
        input_selector = "textarea[aria-label]"
        try:
            await page.wait_for_selector(input_selector, timeout=5000)
        except Exception:
            # Re-navigate on selector miss
            await page.goto(url, wait_until="domcontentloaded", timeout=15000)
            await _random_delay(500, 1000)
            await page.wait_for_selector(input_selector, timeout=5000)

        # Clear existing input
        await page.click(input_selector)
        await page.keyboard.press("Control+a")
        await page.keyboard.press("Backspace")
        await _random_delay(100, 300)

        # Type the text in a human-like way
        await _human_type(page, input_selector, text)
        await _random_delay(300, 700)

        # Wait for translation output
        result = await _wait_for_translation(page, timeout_ms=10000)

        if result is None:
            # Retry once with a fresh page load
            logger.warning("browser_translation: timeout, retrying with fresh page load")
            await page.goto(url, wait_until="domcontentloaded", timeout=15000)
            await _random_delay(500, 1000)
            await page.wait_for_selector(input_selector, timeout=5000)
            await _human_type(page, input_selector, text)
            await _random_delay(300, 700)
            result = await _wait_for_translation(page, timeout_ms=10000)

        if result is None:
            raise TranslationTimeoutError(
                f"Translation output did not stabilise for text: {text[:50]!r}"
            )

        session.translation_count += 1
        logger.debug(
            "browser_translation: translated %d chars → %s (session count=%d)",
            len(text),
            target_lang,
            session.translation_count,
        )
        return result

    except CaptchaDetectedError:
        recycle = True
        return None
    except TranslationTimeoutError as exc:
        logger.warning("browser_translation: %s", exc)
        return None
    except Exception as exc:
        logger.error("browser_translation: unexpected error: %s: %s", type(exc).__name__, exc)
        recycle = True
        return None
    finally:
        await pool.release(session, recycle=recycle)


# ── Batch translation ──────────────────────────────────────────────────────────
async def translate_batch_browser(
    texts: list[str],
    target_lang: str,
    source_lang: str = "en",
) -> list[str | None]:
    """Translate a list of strings sequentially using the browser backend.

    Runs sequentially (not in parallel) to reduce detection risk.
    Includes circuit breaker and exponential backoff.
    """
    if not texts:
        return []

    results: list[str | None] = [None] * len(texts)
    breaker = _CircuitBreaker(max_failures=3)
    backoff_s = 5.0

    for i, text in enumerate(texts):
        if not text or not text.strip():
            continue

        if breaker.is_open:
            logger.error(
                "browser_translation: circuit breaker open after 3 consecutive failures — aborting batch"
            )
            break

        # Delay between translations (1-3s)
        if i > 0:
            await asyncio.sleep(random.uniform(1.0, 3.0))

        result = await translate_single_browser(
            text, target_lang=target_lang, source_lang=source_lang
        )

        if result is None:
            breaker.record_failure()
            logger.warning(
                "browser_translation: failure #%d (backoff=%.1fs)", breaker._failures, backoff_s
            )
            await asyncio.sleep(backoff_s)
            backoff_s = min(backoff_s * 2, 60.0)
        else:
            breaker.record_success()
            backoff_s = 5.0  # reset backoff on success
            results[i] = result

    return results


# ── Sync wrappers ──────────────────────────────────────────────────────────────
def translate_single_browser_sync(
    text: str,
    target_lang: str,
    source_lang: str = "en",
) -> str | None:
    """Synchronous wrapper for script use."""
    return asyncio.run(
        translate_single_browser(text, target_lang=target_lang, source_lang=source_lang)
    )


def translate_batch_browser_sync(
    texts: list[str],
    target_lang: str,
    source_lang: str = "en",
) -> list[str | None]:
    """Synchronous wrapper for script use."""
    return asyncio.run(
        translate_batch_browser(texts, target_lang=target_lang, source_lang=source_lang)
    )
