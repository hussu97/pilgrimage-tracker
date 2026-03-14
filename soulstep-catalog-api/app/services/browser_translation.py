"""Headless browser translation backend using Playwright + translate.google.com.

This module provides a drop-in alternative to the Google Cloud Translation API.
It simulates a real user interacting with translate.google.com via Playwright,
avoiding API costs at the expense of speed and fragility.

Environment variables:
    BROWSER_POOL_SIZE          — concurrent browser contexts (default 20)
    BROWSER_MAX_TRANSLATIONS   — translations per context before recycling (default 50)
    BROWSER_HEADLESS           — run headless (default true)
"""

from __future__ import annotations

import asyncio
import logging
import os
import random
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

# ── Configuration ──────────────────────────────────────────────────────────────
_POOL_SIZE = int(os.environ.get("BROWSER_POOL_SIZE", "20"))
_MAX_TRANSLATIONS = int(os.environ.get("BROWSER_MAX_TRANSLATIONS", "20"))
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


async def _log_page_diagnostics(page, label: str = "") -> None:
    """Log URL, title, and a HTML snippet to help diagnose unexpected page states in GCP logs."""
    try:
        url = page.url
        title = await page.title()
        html = await page.content()
        # Truncate to keep Cloud Logging entries under the 256 KB limit
        html_snippet = html[:3000].replace("\n", " ")
        logger.warning(
            "browser_translation: page-diagnostics %s | url=%r | title=%r | html_snippet=%r",
            label,
            url,
            title,
            html_snippet,
        )
    except Exception as exc:
        logger.warning("browser_translation: _log_page_diagnostics failed: %s", exc)


async def _dismiss_consent_banner(page) -> bool:
    """Accept Google's cookie/consent banner if present (common for Cloud Run IPs).

    Returns True if a banner was found and dismissed.
    """
    # Common selectors used by Google's consent flow across regions
    consent_selectors = [
        "button[aria-label='Accept all']",
        "button[aria-label='Agree to all']",
        "button[id='L2AGLb']",  # Classic "I agree" button id
        "form[action*='consent'] button",
        ".tHlp8d",  # Consent page main accept button class
    ]
    for sel in consent_selectors:
        try:
            btn = await page.query_selector(sel)
            if btn:
                logger.info(
                    "browser_translation: consent banner detected (selector=%r), clicking accept",
                    sel,
                )
                await btn.click()
                await _random_delay(800, 1500)
                return True
        except Exception:
            pass
    return False


async def _check_for_captcha(page) -> bool:
    """Return True if a CAPTCHA or 'unusual traffic' block is visible."""
    try:
        content = await page.content()
        if "unusual traffic" in content.lower() or "recaptcha" in content.lower():
            logger.warning(
                "browser_translation: CAPTCHA / unusual-traffic text found in page content"
            )
            return True
        captcha_frame = await page.query_selector("iframe[src*='recaptcha']")
        if captcha_frame:
            logger.warning("browser_translation: reCAPTCHA iframe detected in DOM")
            return True
    except Exception:
        pass
    logger.debug("browser_translation: no CAPTCHA detected")
    return False


async def _wait_for_translation(page, timeout_ms: int = 10000) -> str | None:
    """Poll output selectors until text stabilises (same value three times in a row).

    An initial 600 ms delay is applied before polling begins so that Google
    Translate's SPA has time to start rendering the output — this prevents
    locking onto a partial/mid-render string that happens to be stable for
    two quick polls in succession.
    """
    # Give the SPA a moment to start rendering before we start sampling.
    await asyncio.sleep(0.6)

    deadline = time.monotonic() + timeout_ms / 1000
    prev_text = ""
    stable_count = 0
    poll_count = 0

    while time.monotonic() < deadline:
        poll_count += 1
        for selector in _OUTPUT_SELECTORS:
            try:
                el = await page.query_selector(selector)
                if el:
                    text = (await el.inner_text()).strip()
                    if text and text == prev_text:
                        stable_count += 1
                        if stable_count >= 3:
                            logger.debug(
                                "browser_translation: output stable after %d polls via selector %r → %r",
                                poll_count,
                                selector,
                                text[:60],
                            )
                            return text
                    elif text:
                        logger.debug(
                            "browser_translation: poll %d — candidate text via %r: %r",
                            poll_count,
                            selector,
                            text[:60],
                        )
                        prev_text = text
                        stable_count = 1
                        break
                    else:
                        stable_count = 0
            except Exception:
                pass
        await asyncio.sleep(0.2)

    remaining = deadline - time.monotonic()
    logger.warning(
        "browser_translation: _wait_for_translation timed out after %d polls (%.1fs elapsed, last candidate: %r)",
        poll_count,
        timeout_ms / 1000 + remaining,  # elapsed ≈ timeout + leftover
        prev_text[:60] if prev_text else "<none>",
    )
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
        # Semaphore prevents thundering-herd spin when asyncio.gather tasks all
        # hit acquire() simultaneously — limits concurrency to pool_size.
        self._sem = asyncio.Semaphore(pool_size)

    async def _init(self) -> None:
        if self._initialized:
            return
        try:
            from playwright.async_api import async_playwright
        except ImportError as exc:
            raise ImportError(
                "Playwright is not installed. "
                "Install it with: pip install playwright && playwright install chromium\n"
                "Only needed when TRANSLATION_BACKEND=browser."
            ) from exc

        try:
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
                    # Required in Docker: /dev/shm is limited to 64 MB by default;
                    # without this flag Chromium writes to shared memory and crashes.
                    "--disable-dev-shm-usage",
                ],
            )
        except Exception:
            # Reset state so the next acquire() attempt can retry from scratch
            # instead of orphaning the Playwright server and trying to start a second one.
            if self._playwright is not None:
                try:
                    await self._playwright.stop()
                except Exception:
                    pass
                self._playwright = None
            self._browser = None
            raise
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
        # Semaphore gates entry so that at most pool_size coroutines proceed
        # concurrently — avoids the spin loop when all pool slots are busy.
        await self._sem.acquire()
        async with self._lock:
            await self._init()
            # Find an idle session that hasn't exceeded max translations
            for session in self._sessions:
                if not session.in_use and session.translation_count < _MAX_TRANSLATIONS:
                    session.in_use = True
                    logger.debug(
                        "BrowserSessionPool: reusing existing session (count=%d/%d, translations=%d/%d)",
                        sum(1 for s in self._sessions if s.in_use),
                        len(self._sessions),
                        session.translation_count,
                        _MAX_TRANSLATIONS,
                    )
                    return session
            # Create a new session if pool isn't full
            if len(self._sessions) < self._pool_size:
                session = await self._create_session()
                session.in_use = True
                self._sessions.append(session)
                logger.info(
                    "BrowserSessionPool: created new session (total=%d, pool_size=%d)",
                    len(self._sessions),
                    self._pool_size,
                )
                return session
            # Should not reach here if semaphore is set correctly, but guard anyway
            logger.warning(
                "BrowserSessionPool: pool full (%d/%d in use) even after semaphore — releasing sem",
                sum(1 for s in self._sessions if s.in_use),
                self._pool_size,
            )
        # Release sem and retry
        self._sem.release()
        await asyncio.sleep(0.5)
        return await self.acquire()

    async def release(self, session: _BrowserSession, recycle: bool = False) -> None:
        async with self._lock:
            if recycle or session.translation_count >= _MAX_TRANSLATIONS:
                # Close and remove this session
                reason = "forced-recycle" if recycle else f"max-translations ({_MAX_TRANSLATIONS})"
                try:
                    await session.context.close()
                except Exception:
                    pass
                if session in self._sessions:
                    self._sessions.remove(session)
                logger.info(
                    "BrowserSessionPool: recycled session (reason=%s, remaining=%d)",
                    reason,
                    len(self._sessions),
                )
            else:
                session.in_use = False
                logger.debug(
                    "BrowserSessionPool: released session back to pool (translations=%d/%d, pool=%d)",
                    session.translation_count,
                    _MAX_TRANSLATIONS,
                    len(self._sessions),
                )
        # Always release the semaphore after the lock block so the next waiter
        # can proceed.
        self._sem.release()

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
            # Brief drain so the Node.js Playwright driver finishes flushing
            # its outgoing message queue before we close the pipe — prevents
            # an EPIPE error on the Node.js side during shutdown.
            await asyncio.sleep(0.2)
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
    pool: BrowserSessionPool | None = None,
) -> str | None:
    """Translate a single string using a headless browser.

    Returns the translated string, or None on failure.
    """
    if not text or not text.strip():
        logger.debug("browser_translation: skipping empty text")
        return None

    logger.info(
        "browser_translation: translating %d chars to %r (source=%r): %r…",
        len(text),
        target_lang,
        source_lang,
        text[:60],
    )

    pool = pool or _get_pool()
    session = await pool.acquire()
    recycle = False

    try:
        page = session.page
        url = f"https://translate.google.com/?sl={source_lang}&tl={target_lang}&op=translate"

        # Navigate if on wrong domain OR wrong target language.
        # The tl= check is critical: sessions are reused across language passes,
        # so a session previously used for Arabic must re-navigate for Malayalam.
        current_url = page.url
        needs_nav = not current_url.startswith("https://translate.google.com") or (
            f"tl={target_lang}" not in current_url
        )
        if needs_nav:
            logger.info(
                "browser_translation: navigating to translate.google.com "
                "(current=%r, target_lang=%r)",
                current_url,
                target_lang,
            )
            await page.goto(url, wait_until="domcontentloaded", timeout=15000)
            logger.debug("browser_translation: navigation complete")
            await _random_delay(500, 1500)
            # Handle cookie/consent banner that Google shows for datacenter IPs
            await _dismiss_consent_banner(page)
        else:
            logger.debug("browser_translation: reusing existing page at %r", current_url)

        # Check for CAPTCHA before proceeding
        if await _check_for_captcha(page):
            logger.warning("browser_translation: CAPTCHA detected, recycling context")
            raise CaptchaDetectedError("CAPTCHA detected on translate.google.com")

        # Find the input area — try multiple selectors as Google changes DOM periodically
        _INPUT_SELECTORS = [
            "textarea[aria-label]",
            "textarea.er8xn",
            "div[aria-label='Source text'][contenteditable='true']",
            "[contenteditable='true'][role='textbox']",
        ]

        async def _find_input_selector(timeout_ms: int) -> str | None:
            deadline = time.monotonic() + timeout_ms / 1000
            while time.monotonic() < deadline:
                for sel in _INPUT_SELECTORS:
                    try:
                        el = await page.query_selector(sel)
                        if el:
                            logger.debug("browser_translation: input found via selector %r", sel)
                            return sel
                    except Exception:
                        pass
                await asyncio.sleep(0.3)
            return None

        input_selector = await _find_input_selector(5000)
        if input_selector is None:
            # Re-navigate once more and log diagnostics to help debug
            logger.warning(
                "browser_translation: input not found — re-navigating and logging diagnostics"
            )
            await _log_page_diagnostics(page, label="before-re-nav")
            await page.goto(url, wait_until="domcontentloaded", timeout=15000)
            await _random_delay(500, 1000)
            await _dismiss_consent_banner(page)
            input_selector = await _find_input_selector(15000)
            if input_selector is None:
                await _log_page_diagnostics(page, label="after-re-nav")
                raise TranslationTimeoutError(
                    "Could not find translation input after re-navigation — "
                    "page may be blocked or DOM changed"
                )
        logger.debug("browser_translation: using input selector %r", input_selector)

        # Clear existing input.
        # page.fill("") is used instead of Ctrl+A + Backspace because the keyboard
        # shortcut does not reliably fire the input/change events that Google Translate's
        # SPA listens to, which causes subsequent calls to append text rather than replace.
        await page.fill(input_selector, "")
        await _random_delay(200, 500)  # let Google's output div update after the clear

        # Type the text in a human-like way
        logger.debug("browser_translation: typing %d chars into input", len(text))
        await _human_type(page, input_selector, text)
        await _random_delay(300, 700)

        # Wait for translation output
        logger.debug("browser_translation: waiting for translation output (attempt 1)")
        result = await _wait_for_translation(page, timeout_ms=10000)

        if result is None:
            # Retry once with a fresh page load
            logger.warning(
                "browser_translation: attempt 1 timed out — retrying with fresh page load"
            )
            await page.goto(url, wait_until="domcontentloaded", timeout=15000)
            await _random_delay(500, 1000)
            await _dismiss_consent_banner(page)
            retry_selector = await _find_input_selector(15000)
            if retry_selector is None:
                await _log_page_diagnostics(page, label="attempt-2-no-input")
                raise TranslationTimeoutError(
                    "Could not find translation input on attempt 2 — page may be blocked"
                )
            await _human_type(page, retry_selector, text)
            await _random_delay(300, 700)
            logger.debug("browser_translation: waiting for translation output (attempt 2)")
            result = await _wait_for_translation(page, timeout_ms=10000)

        if result is None:
            raise TranslationTimeoutError(
                f"Translation output did not stabilise for text: {text[:50]!r}"
            )

        session.translation_count += 1
        logger.info(
            "browser_translation: success — %d chars → %r, result: %r… (session translations=%d)",
            len(text),
            target_lang,
            result[:60],
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
        logger.error(
            "browser_translation: unexpected error: %s: %s", type(exc).__name__, exc, exc_info=True
        )
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

    non_empty = sum(1 for t in texts if t and t.strip())
    logger.info(
        "browser_translation: batch start — %d items (%d non-empty) → %r",
        len(texts),
        non_empty,
        target_lang,
    )

    results: list[str | None] = [None] * len(texts)
    breaker = _CircuitBreaker(max_failures=3)
    backoff_s = 5.0
    success_count = 0

    for i, text in enumerate(texts):
        if not text or not text.strip():
            logger.debug("browser_translation: batch[%d/%d] skipping empty", i + 1, len(texts))
            continue

        if breaker.is_open:
            logger.error(
                "browser_translation: circuit breaker open after 3 consecutive failures — aborting batch at item %d/%d",
                i + 1,
                len(texts),
            )
            break

        logger.debug("browser_translation: batch[%d/%d] translating…", i + 1, len(texts))

        # Delay between translations (1-3s)
        if i > 0:
            delay = random.uniform(1.0, 3.0)
            logger.debug("browser_translation: inter-item delay %.2fs", delay)
            await asyncio.sleep(delay)

        result = await translate_single_browser(
            text, target_lang=target_lang, source_lang=source_lang
        )

        if result is None:
            breaker.record_failure()
            logger.warning(
                "browser_translation: batch[%d/%d] failed (consecutive_failures=%d, backoff=%.1fs)",
                i + 1,
                len(texts),
                breaker._failures,
                backoff_s,
            )
            await asyncio.sleep(backoff_s)
            backoff_s = min(backoff_s * 2, 60.0)
        else:
            breaker.record_success()
            backoff_s = 5.0  # reset backoff on success
            results[i] = result
            success_count += 1

    logger.info(
        "browser_translation: batch complete — %d/%d succeeded, %d/%d failed",
        success_count,
        non_empty,
        non_empty - success_count,
        non_empty,
    )
    return results


# ── Fan-out parallel batch translation ────────────────────────────────────────
async def translate_batch_browser_parallel(
    texts: list[str],
    target_lang: str,
    source_lang: str = "en",
    on_result: Callable[[int, str | None], Awaitable[None]] | None = None,
    pool: BrowserSessionPool | None = None,
    is_cancelled: Callable[[], bool] | None = None,
) -> list[str | None]:
    """Translate a list of texts in parallel using the browser session pool.

    Fans out one coroutine per non-empty text via asyncio.gather. The
    BrowserSessionPool semaphore limits true concurrency to pool_size (default 10).
    For each resolved item, the optional on_result(global_index, text) async
    callback is fired immediately (used for interrupt-resilient DB saves).

    Returns a list of the same length as input.
    """
    if not texts:
        return []

    results: list[str | None] = [None] * len(texts)

    async def translate_one(i: int, text: str) -> None:
        if is_cancelled is not None and is_cancelled():
            return
        translated = await translate_single_browser(
            text, target_lang=target_lang, source_lang=source_lang, pool=pool
        )
        results[i] = translated
        if on_result is not None:
            await on_result(i, translated)

    non_empty_count = sum(1 for t in texts if t and t.strip())
    pool_size = pool._pool_size if pool is not None else _POOL_SIZE
    logger.info(
        "browser_translation: parallel batch — %d texts (%d non-empty) → %r (pool_size=%d)",
        len(texts),
        non_empty_count,
        target_lang,
        pool_size,
    )

    tasks = [translate_one(i, text) for i, text in enumerate(texts) if text and text.strip()]
    await asyncio.gather(*tasks)

    success_count = sum(1 for r in results if r is not None)
    logger.info(
        "browser_translation: parallel batch complete — %d/%d succeeded → %r",
        success_count,
        non_empty_count,
        target_lang,
    )
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
