"""MapsBrowserPool — manages a pool of Playwright browser contexts for Maps scraping.

Features:
- Configurable pool size (MAPS_BROWSER_POOL_SIZE, default 3)
- Session recycling after MAPS_BROWSER_MAX_PAGES navigations (default 30)
- Geolocation spoofing per context
- CAPTCHA/block detection with exponential backoff
- Circuit breaker (3 consecutive blocks → 10 min pause)
- Resource blocking (fonts, analytics, tracking scripts)
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field

from app.services.browser_stealth import (
    apply_stealth,
    random_timezone,
    random_user_agent,
    random_viewport,
)

logger = logging.getLogger(__name__)


class BlockedError(Exception):
    """Raised when Maps detects bot activity (CAPTCHA or access denied)."""


class CircuitOpenError(Exception):
    """Raised when circuit breaker is open (too many consecutive blocks)."""


class AcquireTimeoutError(Exception):
    """Raised when acquiring a browser session times out or exceeds max retries."""


@dataclass
class _CircuitBreaker:
    max_failures: int = 3
    pause_seconds: float = 600.0  # 10 minutes
    _failures: int = field(default=0, init=False)
    _open: bool = field(default=False, init=False)
    _open_since: float = field(default=0.0, init=False)

    def record_success(self) -> None:
        self._failures = 0
        self._open = False

    def record_failure(self) -> None:
        self._failures += 1
        if self._failures >= self.max_failures:
            self._open = True
            self._open_since = time.monotonic()
            logger.warning(
                "MapsBrowserPool: circuit breaker opened after %d consecutive failures — "
                "pausing for %.0fs",
                self._failures,
                self.pause_seconds,
            )

    @property
    def is_open(self) -> bool:
        if self._open:
            elapsed = time.monotonic() - self._open_since
            if elapsed >= self.pause_seconds:
                logger.info(
                    "MapsBrowserPool: circuit breaker auto-reset after %.0fs pause", elapsed
                )
                self._open = False
                self._failures = 0
                return False
            return True
        return False

    @property
    def open_since(self) -> float:
        return self._open_since


@dataclass
class _MapsSession:
    context: object
    page: object
    nav_count: int = 0
    in_use: bool = False


class MapsBrowserPool:
    """Pool of reusable Playwright browser contexts for Google Maps scraping."""

    def __init__(self) -> None:
        from app.config import settings

        self._pool_size = settings.maps_browser_pool_size
        self._max_pages = settings.maps_browser_max_pages
        self._headless = settings.maps_browser_headless
        self._sessions: list[_MapsSession] = []
        self._playwright = None
        self._browser = None
        self._lock = asyncio.Lock()
        self._initialized = False
        self._sem = asyncio.Semaphore(self._pool_size)
        self._breaker = _CircuitBreaker()

    async def _init(self) -> None:
        if self._initialized:
            return
        try:
            from playwright.async_api import async_playwright
        except ImportError as exc:
            raise ImportError(
                "Playwright is not installed.\n"
                "Install: pip install playwright && playwright install chromium\n"
                "Only needed when SCRAPER_BACKEND=browser."
            ) from exc

        logger.info("MapsBrowserPool: starting Playwright...")
        self._playwright = await asyncio.wait_for(
            async_playwright().start(),
            timeout=30,
        )
        logger.info("MapsBrowserPool: launching Chromium (headless=%s)...", self._headless)
        self._browser = await asyncio.wait_for(
            self._playwright.chromium.launch(
                headless=self._headless,
                args=[
                    "--disable-blink-features=AutomationControlled",
                    "--no-first-run",
                    "--no-default-browser-check",
                    "--disable-infobars",
                    "--disable-extensions",
                    "--disable-gpu",
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    # Required in Docker/Cloud Run: /dev/shm is limited to 64 MB;
                    # without this flag Chromium writes to shared memory and silently hangs.
                    "--disable-dev-shm-usage",
                ],
            ),
            timeout=30,
        )
        self._initialized = True
        logger.info(
            "MapsBrowserPool: launched Chromium (headless=%s, pool_size=%d)",
            self._headless,
            self._pool_size,
        )

    async def _create_session(
        self, lat: float | None = None, lng: float | None = None
    ) -> _MapsSession:
        ua = random_user_agent()
        viewport = random_viewport()
        timezone = random_timezone()

        context_kwargs: dict = {
            "user_agent": ua,
            "viewport": viewport,
            "timezone_id": timezone,
            "locale": "en-US",
        }
        if lat is not None and lng is not None:
            context_kwargs["geolocation"] = {"latitude": lat, "longitude": lng}
            context_kwargs["permissions"] = ["geolocation"]

        context = await self._browser.new_context(**context_kwargs)

        # Block resource types not needed for scraping (speed up page loads).
        # Must be async — route.abort()/route.continue_() are coroutines that
        # require await; a sync lambda would silently discard them and leave
        # every request unresolved, causing page.goto() to hang indefinitely.
        async def _route_handler(route) -> None:
            try:
                if route.request.resource_type in ("font", "media"):
                    await route.abort()
                else:
                    await route.continue_()
            except Exception:
                # Swallow errors so a failed abort/continue doesn't leave requests
                # unresolved and hang page.goto() indefinitely.
                pass

        await context.route("**/*", _route_handler)

        page = await context.new_page()
        await apply_stealth(page)
        return _MapsSession(context=context, page=page)

    async def acquire(
        self,
        lat: float | None = None,
        lng: float | None = None,
        _retries: int = 0,
    ) -> _MapsSession:
        from app.constants import BROWSER_ACQUIRE_MAX_RETRIES, BROWSER_ACQUIRE_TIMEOUT_S

        if self._breaker.is_open:
            remaining = self._breaker.pause_seconds - (time.monotonic() - self._breaker.open_since)
            raise CircuitOpenError(f"Maps browser circuit breaker open — retry in {remaining:.0f}s")

        if _retries >= BROWSER_ACQUIRE_MAX_RETRIES:
            raise AcquireTimeoutError(f"Failed to acquire browser session after {_retries} retries")

        t0 = time.monotonic()
        try:
            await asyncio.wait_for(self._sem.acquire(), timeout=BROWSER_ACQUIRE_TIMEOUT_S)
        except TimeoutError:
            raise AcquireTimeoutError(
                f"Timed out waiting for browser session ({BROWSER_ACQUIRE_TIMEOUT_S}s)"
            ) from None
        elapsed = time.monotonic() - t0
        logger.debug(
            "MapsBrowserPool: semaphore acquired in %.1fs (retry=%d)",
            elapsed,
            _retries,
        )

        t_lock = time.monotonic()
        async with self._lock:
            logger.debug("MapsBrowserPool: lock acquired in %.1fs", time.monotonic() - t_lock)
            await self._init()
            for session in self._sessions:
                if not session.in_use and session.nav_count < self._max_pages:
                    session.in_use = True
                    logger.debug(
                        "MapsBrowserPool: reusing session (nav_count=%d/%d)",
                        session.nav_count,
                        self._max_pages,
                    )
                    return session
            if len(self._sessions) < self._pool_size:
                logger.debug("MapsBrowserPool: creating new session...")
                session = await asyncio.wait_for(
                    self._create_session(lat, lng),
                    timeout=30,
                )
                session.in_use = True
                self._sessions.append(session)
                logger.info(
                    "MapsBrowserPool: created session (total=%d/%d)",
                    len(self._sessions),
                    self._pool_size,
                )
                return session

        # Pool full — release and retry
        self._sem.release()
        await asyncio.sleep(0.5)
        return await self.acquire(lat, lng, _retries=_retries + 1)

    async def release(self, session: _MapsSession, recycle: bool = False) -> None:
        async with self._lock:
            if recycle or session.nav_count >= self._max_pages:
                reason = "forced" if recycle else f"max-pages ({self._max_pages})"
                try:
                    await session.context.close()
                except Exception:
                    pass
                if session in self._sessions:
                    self._sessions.remove(session)
                logger.info(
                    "MapsBrowserPool: recycled session (reason=%s, remaining=%d)",
                    reason,
                    len(self._sessions),
                )
            else:
                session.in_use = False
                logger.debug(
                    "MapsBrowserPool: released session (nav_count=%d/%d)",
                    session.nav_count,
                    self._max_pages,
                )
        self._sem.release()

    def record_block(self) -> None:
        """Record a CAPTCHA/block detection — may open circuit breaker."""
        self._breaker.record_failure()

    def record_success(self) -> None:
        self._breaker.record_success()

    def reset_breaker(self) -> None:
        """Reset circuit breaker between place-type passes so one type's failures
        don't cascade to the next type."""
        if self._breaker._open:
            logger.info("MapsBrowserPool: circuit breaker reset between type passes")
        self._breaker._open = False
        self._breaker._failures = 0

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
            await asyncio.sleep(0.2)
            if self._playwright:
                try:
                    await self._playwright.stop()
                except Exception:
                    pass
            self._initialized = False
            logger.info("MapsBrowserPool: shutdown complete")


# Module-level singleton
_pool: MapsBrowserPool | None = None


def get_maps_pool() -> MapsBrowserPool:
    global _pool
    if _pool is None:
        _pool = MapsBrowserPool()
    return _pool


async def shutdown_maps_pool() -> None:
    """Gracefully shut down the global Maps browser pool. Call from app lifespan."""
    global _pool
    if _pool is not None:
        await _pool.shutdown()
        _pool = None
