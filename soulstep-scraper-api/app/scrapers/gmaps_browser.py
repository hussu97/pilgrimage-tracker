"""
Browser-based Google Maps discovery and scraper orchestration.

Uses Playwright navigation (no Google Places API) to discover places and
drive detail fetching. Discovery uses a quadtree search pattern and returns
the same "places/{id}" resource name format consumed by fetch_place_details()
so all downstream phases remain unchanged.

Each active place type gets an independent quadtree search pass so no types
are silently dropped and the cell cache is keyed per-type.
"""

from __future__ import annotations

import asyncio
import math
import os
import random
import re
import time
from dataclasses import dataclass, field

from sqlmodel import Session, select

from app.config import settings
from app.constants import (
    BROWSER_CELL_MAX_RETRIES,
    BROWSER_CELL_TIMEOUT_S,
    BROWSER_EVALUATE_TIMEOUT_S,
    BROWSER_SCROLL_MAX_ATTEMPTS,
    BROWSER_SCROLL_PIXEL_STEP,
    BROWSER_SCROLL_STABLE_THRESHOLD,
    BROWSER_SCROLL_TIMEOUT_S,
    MAX_DISCOVERY_RADIUS_M,
    MIN_DISCOVERY_RADIUS_M,
)
from app.db.models import GeoBoundary, ScraperRun
from app.logger import get_logger
from app.scrapers.base import ThreadSafeIdSet
from app.scrapers.cell_store import DiscoveryCellStore, GlobalCellStore
from app.scrapers.gmaps_shared import calculate_search_radius
from app.services.browser_pool import (
    AcquireTimeoutError,
    BlockedError,
    CircuitOpenError,
    get_maps_pool,
)

logger = get_logger(__name__)


@dataclass
class RunMetrics:
    """Aggregated counters for browser discovery operational health."""

    cells_total: int = 0
    cells_cached: int = 0
    cells_searched: int = 0
    cells_empty: int = 0
    places_discovered: int = 0
    blocks_detected: int = 0
    retries: int = 0
    _cell_times: list[float] = field(default_factory=list)

    def record_cell_time(self, elapsed: float) -> None:
        self._cell_times.append(elapsed)

    @property
    def avg_cell_time(self) -> float:
        return sum(self._cell_times) / len(self._cell_times) if self._cell_times else 0.0

    def log_summary(self, place_type: str) -> None:
        logger.info(
            "RunMetrics[%s]: cells=%d (cached=%d, searched=%d, empty=%d) "
            "places=%d blocks=%d retries=%d avg_cell=%.1fs",
            place_type,
            self.cells_total,
            self.cells_cached,
            self.cells_searched,
            self.cells_empty,
            self.places_discovered,
            self.blocks_detected,
            self.retries,
            self.avg_cell_time,
        )


MIN_RADIUS = MIN_DISCOVERY_RADIUS_M
MAX_RADIUS = MAX_DISCOVERY_RADIUS_M

# Zoom level corresponding to approximate search radius (used by quadtree browser path).
_RADIUS_TO_ZOOM: list[tuple[float, int]] = [
    (500, 15),
    (1000, 14),
    (2000, 13),
    (5000, 12),
    (10000, 11),
    (50000, 10),
]


def _radius_to_zoom(radius_m: float) -> int:
    for threshold, zoom in _RADIUS_TO_ZOOM:
        if radius_m <= threshold:
            return zoom
    return 10


# Maps sidebar takes ~400 px; effective map canvas is viewport minus sidebar.
_VIEWPORT_PX = 1280
_SIDEBAR_PX = 400
_MAP_CANVAS_PX = _VIEWPORT_PX - _SIDEBAR_PX  # ~880 px
_TILE_PX = 256


def _cell_size_to_zoom(
    lat_min: float,
    lat_max: float,
    lng_min: float,
    lng_max: float,
) -> int:
    """Return the Google Maps zoom level that makes the map canvas match the cell size.

    Uses the actual map canvas width (viewport minus the results sidebar) so the
    cell's bounding box fills the visible map area rather than the full browser width.

    Clamps between zoom 12 (very large areas) and zoom 22 (very small areas).
    """
    center_lat = (lat_min + lat_max) / 2.0
    cos_lat = abs(math.cos(math.radians(center_lat)))

    # Cell dimensions in km
    cell_height_km = abs(lat_max - lat_min) * 111.0
    cell_width_km = abs(lng_max - lng_min) * 111.0 * (cos_lat if cos_lat > 1e-6 else 1.0)
    # Use the larger dimension so the entire cell fits within the canvas
    cell_size_km = max(cell_height_km, cell_width_km)

    if cell_size_km < 1e-6 or cos_lat < 1e-6:
        return 15  # degenerate cell fallback

    tiles_across = _MAP_CANVAS_PX / _TILE_PX
    # Solve: cell_size_km = tiles_across × (360 / 2^Z) × 111 × cos(lat)
    # → 2^Z = tiles_across × 360 × 111 × cos(lat) / cell_size_km
    z = math.log2(tiles_across * 360.0 * 111.0 * cos_lat / cell_size_km)
    return max(12, min(22, math.floor(z)))


def _extract_place_ids_from_links(hrefs: list[str]) -> list[str]:
    """
    Extract Google Maps place IDs from search result href attributes.

    Returns place resource names in format "places/{id}" where id is either
    ChIJ... (canonical Place ID) or a hex CID pair (fallback).
    Deduplicates results.
    """
    place_ids: list[str] = []
    seen: set[str] = set()
    chij_count = 0
    cid_count = 0

    for href in hrefs:
        # ChIJ canonical place ID (preferred) — stored at !19s in Maps URLs
        match = re.search(r"!19s(ChIJ[a-zA-Z0-9_\-]+)", href)
        if match:
            pid = match.group(1)
            if pid not in seen:
                seen.add(pid)
                place_ids.append(f"places/{pid}")
                chij_count += 1
            continue

        # Hex CID pair (0x{a}:0x{b} or URL-encoded 0x{a}%3A0x{b})
        match = re.search(r"!1s(0x[0-9a-fA-F]+(?:%3A|:)0x[0-9a-fA-F]+)", href, re.IGNORECASE)
        if match:
            cid_raw = match.group(1).replace("%3A", ":").lower()
            if cid_raw not in seen:
                seen.add(cid_raw)
                place_ids.append(f"places/{cid_raw}")
                cid_count += 1

    logger.debug(
        "Extracted %d ChIJ + %d hex CID place IDs from %d hrefs",
        chij_count,
        cid_count,
        len(hrefs),
    )
    return place_ids


async def _check_for_block(page) -> bool:
    """Return True if Maps has detected bot activity or access is denied.

    Uses lightweight JS snippet instead of page.content() to avoid transferring
    the full 1-5MB DOM over CDP on every navigation.
    """
    try:
        # Sorry/bot-wall pages live on a dedicated host — cheapest signal.
        if "/sorry/" in page.url or "sorry.google.com" in page.url:
            return True
        # Extract only the first 2000 chars of visible text — ~99% less data than full DOM
        snippet: str = await page.evaluate(
            "document.body ? document.body.innerText.slice(0, 2000).toLowerCase() : ''"
        )
        if any(
            indicator in snippet
            for indicator in [
                "unusual traffic",
                "access denied",
                "your computer or network may be sending automated queries",
                "before you continue to google",
                "to continue, please type the characters",
                "we've detected unusual activity",
            ]
        ):
            return True
        # Only check for a real reCAPTCHA challenge iframe (not just any recaptcha script reference).
        captcha = await page.query_selector(
            "iframe[src*='google.com/recaptcha'], iframe[title*='reCAPTCHA'], #captcha, .captcha"
        )
        if captcha:
            return True
    except Exception:
        pass
    return False


async def _dismiss_consent(page) -> None:
    """Dismiss cookie consent — handles both full-page redirect and in-page banners.

    Google serves a full-page redirect to consent.google.com for EU data-centres
    (e.g. europe-west1). The browser_pool pre-sets SOCS/CONSENT cookies to prevent
    this, but if the redirect still happens this function clicks through it.

    Strategy: JS form-submit first (markup-agnostic), then button-click fallback.
    On consent.google.com/m the "reject all" form has a hidden input[name='set_eom'];
    the "accept all" form does not. Both choices dismiss the wall and redirect back
    to Maps — we don't care which one wins.
    """
    try:
        current_url = page.url
        if "consent.google.com" not in current_url:
            # In-page consent banner (overlay on Maps itself)
            for selector in [
                "button[aria-label*='Accept all']",
                "button[aria-label*='Reject all']",
                "#L2AGLb",
                "form:nth-child(2) button",
            ]:
                btn = await page.query_selector(selector)
                if btn:
                    await btn.click()
                    await asyncio.sleep(random.uniform(0.5, 1.5))
                    break
            return

        logger.info("Consent redirect detected: %s — clicking through", current_url)

        # Wait for the consent page DOM to be ready
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=8000)
        except Exception:
            pass

        # Primary: direct JS form submission — more reliable than button clicks because
        # it bypasses any click handlers or overlays. Submit the accept-all form first
        # (identified by the absence of set_eom hidden input); fall back to any form.
        try:
            submitted = await page.evaluate("""
                () => {
                    const forms = Array.from(document.querySelectorAll('form'));
                    const accept = forms.find(f => !f.querySelector('input[name="set_eom"]'));
                    const target = accept || forms[forms.length - 1] || forms[0];
                    if (target) { target.submit(); return true; }
                    return false;
                }
            """)
            if submitted:
                try:
                    await page.wait_for_url("**/google.com/maps/**", timeout=10000)
                except Exception:
                    pass
                if "consent.google.com" not in page.url:
                    logger.info("Consent dismissed via JS form submit — now on: %s", page.url)
                    await asyncio.sleep(random.uniform(0.5, 1.0))
                    return
        except Exception:
            pass

        # Button-click fallback — Google changes markup; ordered by specificity
        for selector in [
            "button[jsname='V67aGc']",  # Accept all (consent.google.com/m current)
            "button[jsname='higCR']",  # Accept all (variant)
            "button[aria-label='Accept all']",
            "button[aria-label='Reject all']",
            "form:nth-of-type(2) button[type='submit']",
            "form:nth-of-type(2) button",
            "form:nth-child(2) button",
            "button[type='submit']",
            "button",
        ]:
            try:
                btn = await page.query_selector(selector)
                if btn and await btn.is_visible():
                    await btn.click()
                    try:
                        await page.wait_for_url("**/google.com/maps/**", timeout=8000)
                    except Exception:
                        pass
                    if "consent.google.com" not in page.url:
                        logger.info("Consent dismissed via %s — now on: %s", selector, page.url)
                        await asyncio.sleep(random.uniform(0.5, 1.0))
                        return
            except Exception:
                continue

        logger.warning("Could not dismiss consent wall — still on: %s", page.url)
    except Exception:
        pass


class _NullSemaphore:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        pass


async def _scroll_until_stable(
    page,
    max_attempts: int = BROWSER_SCROLL_MAX_ATTEMPTS,
    stable_threshold: int = BROWSER_SCROLL_STABLE_THRESHOLD,
    pixel_step: int = BROWSER_SCROLL_PIXEL_STEP,
) -> None:
    """Scroll the results feed until no new place links appear for several scrolls.

    Replaces the fixed 3-scroll loop so dense areas get fully loaded.

    Args:
        page: Playwright page object (already on a Maps search URL).
        max_attempts: Hard limit on total scroll attempts (prevents infinite loops).
        stable_threshold: Consecutive scrolls with no new links before stopping.
        pixel_step: Pixels scrolled per step inside the results feed.
    """

    async def _eval_with_timeout(expr, *args):
        """Run page.evaluate with a per-call timeout to prevent silent hangs."""
        return await asyncio.wait_for(
            page.evaluate(expr, *args),
            timeout=BROWSER_EVALUATE_TIMEOUT_S,
        )

    try:
        await asyncio.wait_for(
            _scroll_loop(page, max_attempts, stable_threshold, pixel_step, _eval_with_timeout),
            timeout=BROWSER_SCROLL_TIMEOUT_S,
        )
    except TimeoutError:
        logger.warning(
            "_scroll_until_stable: overall scroll timeout (%.0fs) — proceeding with current results",
            BROWSER_SCROLL_TIMEOUT_S,
        )


async def _scroll_loop(
    page,
    max_attempts: int,
    stable_threshold: int,
    pixel_step: int,
    _eval: object,
) -> None:
    """Inner scroll loop extracted for asyncio.wait_for wrapping."""
    prev_count = 0
    stable_count = 0

    for attempt in range(max_attempts):
        current_count: int = await _eval(
            "document.querySelectorAll('a[href*=\"/maps/place/\"]').length"
        )

        if current_count == prev_count:
            stable_count += 1
        else:
            stable_count = 0
        prev_count = current_count

        if stable_count >= stable_threshold:
            logger.debug("_scroll_loop: stable after %d links", current_count)
            break

        # Progress log every 5th iteration
        if attempt > 0 and attempt % 5 == 0:
            logger.debug(
                "_scroll_loop: attempt=%d/%d links=%d stable=%d",
                attempt,
                max_attempts,
                current_count,
                stable_count,
            )

        end_marker = await _eval(
            """
            (() => {
                const feed = document.querySelector('[role="feed"]');
                if (!feed) return false;
                const last = feed.lastElementChild;
                if (!last) return false;
                const text = last.innerText || last.textContent || '';
                return text.toLowerCase().includes("you've reached the end");
            })()
            """
        )
        if end_marker:
            logger.debug("_scroll_loop: end-of-list marker found")
            break

        try:
            feed = await page.query_selector('[role="feed"]')
            if feed:
                await _eval(f"el => el.scrollTop += {pixel_step}", feed)
            else:
                await _eval(f"window.scrollBy(0, {pixel_step})")
        except Exception:
            pass

        await asyncio.sleep(random.uniform(0.2, 0.6))


async def search_area_browser(
    lat_min: float,
    lat_max: float,
    lng_min: float,
    lng_max: float,
    place_type: str,
    existing_ids: ThreadSafeIdSet,
    depth: int = 0,
    max_results: int | None = None,
    cell_store: DiscoveryCellStore | None = None,
    global_cache: GlobalCellStore | None = None,
    semaphore: asyncio.Semaphore | None = None,
    _consent_dismissed: bool = False,
) -> list[str]:
    """
    Async recursive quadtree browser search for a single place type.

    Mirrors search_area() from scrapers/gmaps.py but replaces API calls with
    Playwright browser navigation. Reuses the same cell_store and global_cache
    for cross-run caching and interruption resumability.

    Returns list of unique place resource names found in this area.
    """
    indent = "  " * depth
    center_lat, center_lng, radius = calculate_search_radius(lat_min, lat_max, lng_min, lng_max)

    if max_results and len(existing_ids) >= max_results:
        return []

    if radius < MIN_RADIUS:
        logger.debug(
            "%s[%s] Area too small (radius < %dm), stopping", indent, place_type, MIN_RADIUS
        )
        return []

    if radius > MAX_RADIUS:
        logger.debug(
            "%s[%s] Radius %.0fm > max (%dm), subdividing without searching",
            indent,
            place_type,
            radius,
            MAX_RADIUS,
        )
        return await _split_quadrants_browser(
            lat_min,
            lat_max,
            lng_min,
            lng_max,
            [],
            place_type,
            existing_ids,
            depth,
            max_results,
            cell_store,
            global_cache,
            semaphore,
            indent,
        )

    # Per-run cell cache check
    if cell_store is not None:
        cached = cell_store.get(lat_min, lat_max, lng_min, lng_max)
        if cached is not None:
            logger.debug(
                "%s[%s] Skipping cached cell (results=%d, saturated=%s)",
                indent,
                place_type,
                cached.result_count,
                cached.saturated,
            )
            cached_names = getattr(cached, "resource_names", None)
            new_ids = existing_ids.add_new(cached_names) if cached_names else []
            if not cached.saturated:
                return list(new_ids)
            return await _split_quadrants_browser(
                lat_min,
                lat_max,
                lng_min,
                lng_max,
                list(new_ids),
                place_type,
                existing_ids,
                depth,
                max_results,
                cell_store,
                global_cache,
                semaphore,
                indent,
            )

    # Cross-run global cache check
    if global_cache is not None:
        global_hit = global_cache.get(lat_min, lat_max, lng_min, lng_max, place_type)
        if global_hit is not None:
            logger.debug(
                "%s[%s] Global cache hit (results=%d, saturated=%s)",
                indent,
                place_type,
                global_hit.result_count,
                global_hit.saturated,
            )
            new_ids = existing_ids.add_new(global_hit.resource_names)
            if cell_store is not None:
                cell_store.save(
                    lat_min,
                    lat_max,
                    lng_min,
                    lng_max,
                    depth,
                    radius,
                    global_hit.resource_names,
                    global_hit.saturated,
                )
            if not global_hit.saturated:
                return list(new_ids)
            return await _split_quadrants_browser(
                lat_min,
                lat_max,
                lng_min,
                lng_max,
                list(new_ids),
                place_type,
                existing_ids,
                depth,
                max_results,
                cell_store,
                global_cache,
                semaphore,
                indent,
            )

    # Browser search — single type, no OR query
    zoom = _radius_to_zoom(radius)
    pool = get_maps_pool()
    place_ids: list[str] = []

    search_url = (
        f"https://www.google.com/maps/search/{place_type}"
        f"/@{center_lat:.6f},{center_lng:.6f},{zoom}z"
        f"?hl=en"
    )
    logger.info("%s[%s] Navigating: %s", indent, place_type, search_url)

    _sem_ctx = semaphore if semaphore is not None else _NullSemaphore()
    for attempt in range(1, BROWSER_CELL_MAX_RETRIES + 1):
        async with _sem_ctx:
            t_acquire = time.monotonic()
            logger.debug("%s[%s] Acquiring browser session...", indent, place_type)
            session = await pool.acquire(lat=center_lat, lng=center_lng)
            logger.debug(
                "%s[%s] Session acquired in %.1fs",
                indent,
                place_type,
                time.monotonic() - t_acquire,
            )
            recycle = False
            try:
                page = session.page

                t_goto = time.monotonic()
                await page.goto(search_url, wait_until="domcontentloaded", timeout=30000)

                title = await page.title()
                url = page.url
                logger.info(
                    "%s[%s] Page loaded in %.1fs: title=%r url=%s",
                    indent,
                    place_type,
                    time.monotonic() - t_goto,
                    title,
                    url,
                )

                # Always dismiss if redirected to consent.google.com (EU GDPR);
                # otherwise only check on the first navigation per search pass.
                if "consent.google.com" in page.url or not _consent_dismissed:
                    await _dismiss_consent(page)
                    _consent_dismissed = True
                    await asyncio.sleep(random.uniform(0.2, 0.5))

                if await _check_for_block(page):
                    logger.warning(
                        "%s[%s] Maps blocked browser — recycling context", indent, place_type
                    )
                    pool.record_block()
                    recycle = True
                    return []

                logger.debug(
                    "%s[%s] Page title=%r url=%s",
                    indent,
                    place_type,
                    await page.title(),
                    page.url,
                )

                pool.record_success()

                # Wait for results panel — accept any of: place link (the actual
                # data), the feed container, or the "no results" empty-state.
                try:
                    await page.wait_for_selector(
                        'a[href*="/maps/place/"], [role="feed"], .m6QErb, '
                        '[aria-label*="Results"], [aria-label*="No results"]',
                        timeout=20000,
                    )
                    logger.info("%s[%s] Results panel found", indent, place_type)
                except Exception:
                    try:
                        diag = await page.evaluate(
                            "({title: document.title, url: location.href, "
                            "feed: !!document.querySelector('[role=\"feed\"]'), "
                            "links: document.querySelectorAll('a[href*=\"/maps/place/\"]').length, "
                            "snippet: (document.body?.innerText || '').slice(0, 300)})"
                        )
                    except Exception:
                        diag = {"error": "evaluate_failed"}
                    logger.warning(
                        "%s[%s] Results panel not found (timeout) — diag=%s",
                        indent,
                        place_type,
                        diag,
                    )
                await asyncio.sleep(random.uniform(0.2, 0.5))

                # Scroll until the results feed stabilises (no new links for N scrolls)
                await _scroll_until_stable(page)

                # Extract all place links
                hrefs = await page.evaluate(
                    """
                    () => {
                        const links = document.querySelectorAll('a[href*="/maps/place/"]');
                        return Array.from(links)
                            .map(a => a.href)
                            .filter(h => h.includes('/maps/place/'));
                    }
                    """
                )

                logger.info("%s[%s] Extracted %d hrefs from page", indent, place_type, len(hrefs))

                if not hrefs:
                    snippet = await page.evaluate(
                        "document.title + ' | ' + (document.body?.innerText?.slice(0, 500) || '')"
                    )
                    logger.debug(
                        "%s[%s] No hrefs found. Page snippet: %s", indent, place_type, snippet
                    )

                place_ids = _extract_place_ids_from_links(hrefs)
                session.nav_count += 1

                logger.info(
                    "%s[%s] Browser cell depth=%d center=(%.4f,%.4f) radius=%.0fm found=%d",
                    indent,
                    place_type,
                    depth,
                    center_lat,
                    center_lng,
                    radius,
                    len(place_ids),
                )
                break  # success

            except (BlockedError, CircuitOpenError, AcquireTimeoutError) as e:
                logger.warning("%s[%s] Browser pool error: %s", indent, place_type, e)
                recycle = True
                return []  # pool-level issue, no point retrying
            except Exception as e:
                logger.warning(
                    "%s[%s] Browser search error — attempt %d/%d: %s",
                    indent,
                    place_type,
                    attempt,
                    BROWSER_CELL_MAX_RETRIES,
                    e,
                )
                recycle = True
                if attempt >= BROWSER_CELL_MAX_RETRIES:
                    return []
            finally:
                await pool.release(session, recycle=recycle)

        # Backoff before retry (outside semaphore so we don't hold the slot)
        backoff = 2**attempt + random.uniform(0, 1)
        logger.info("%s[%s] Retrying in %.1fs...", indent, place_type, backoff)
        await asyncio.sleep(backoff)

    is_saturated = len(place_ids) >= 20
    new_ids = existing_ids.add_new(place_ids)

    if cell_store is not None:
        cell_store.save(lat_min, lat_max, lng_min, lng_max, depth, radius, place_ids, is_saturated)
    if global_cache is not None:
        global_cache.save(lat_min, lat_max, lng_min, lng_max, place_type, place_ids, is_saturated)

    if not is_saturated or (max_results and len(existing_ids) >= max_results):
        return list(new_ids)

    logger.debug(
        "%s[%s] Area saturated (%d results) — splitting into quadrants...",
        indent,
        place_type,
        len(place_ids),
    )
    return await _split_quadrants_browser(
        lat_min,
        lat_max,
        lng_min,
        lng_max,
        list(new_ids),
        place_type,
        existing_ids,
        depth,
        max_results,
        cell_store,
        global_cache,
        semaphore,
        indent,
    )


async def _split_quadrants_browser(
    lat_min: float,
    lat_max: float,
    lng_min: float,
    lng_max: float,
    seed_ids: list[str],
    place_type: str,
    existing_ids: ThreadSafeIdSet,
    depth: int,
    max_results: int | None,
    cell_store: DiscoveryCellStore | None,
    global_cache: GlobalCellStore | None,
    semaphore: asyncio.Semaphore | None,
    indent: str,
) -> list[str]:
    """Recursively search four quadrants concurrently."""
    mid_lat = (lat_min + lat_max) / 2
    mid_lng = (lng_min + lng_max) / 2

    quadrants = [
        (lat_min, mid_lat, lng_min, mid_lng),
        (lat_min, mid_lat, mid_lng, lng_max),
        (mid_lat, lat_max, lng_min, mid_lng),
        (mid_lat, lat_max, mid_lng, lng_max),
    ]

    all_ids = list(seed_ids)
    tasks = []

    for q_lat_min, q_lat_max, q_lng_min, q_lng_max in quadrants:
        if max_results and len(existing_ids) >= max_results:
            break
        tasks.append(
            search_area_browser(
                q_lat_min,
                q_lat_max,
                q_lng_min,
                q_lng_max,
                place_type,
                existing_ids,
                depth + 1,
                max_results,
                cell_store,
                global_cache,
                semaphore,
            )
        )

    results = await asyncio.gather(*tasks, return_exceptions=True)
    for result in results:
        if isinstance(result, Exception):
            logger.warning("%s[%s] Quadrant browser search failed: %s", indent, place_type, result)
        else:
            all_ids.extend(result)

    return all_ids


async def _do_grid_cell_navigation(
    pool,
    place_type: str,
    search_url: str,
    center_lat: float,
    center_lng: float,
) -> list[str]:
    """Core navigation for a single grid cell. Separated for asyncio.wait_for wrapping."""
    t_acquire = time.monotonic()
    logger.debug("[grid][%s] Acquiring browser session...", place_type)
    session_obj = await pool.acquire(lat=center_lat, lng=center_lng)
    logger.debug(
        "[grid][%s] Session acquired in %.1fs",
        place_type,
        time.monotonic() - t_acquire,
    )
    recycle = False
    try:
        page = session_obj.page

        t_goto = time.monotonic()
        await page.goto(search_url, wait_until="domcontentloaded", timeout=30000)

        title = await page.title()
        url = page.url
        logger.info(
            "[grid][%s] Page loaded in %.1fs: title=%r url=%s",
            place_type,
            time.monotonic() - t_goto,
            title,
            url,
            extra={"center_lat": center_lat, "center_lng": center_lng},
        )

        await _dismiss_consent(page)

        if await _check_for_block(page):
            _cur_url = page.url
            _is_sorry = "/sorry/" in _cur_url or "sorry.google.com" in _cur_url
            logger.warning(
                "[grid][%s] Maps blocked browser — recycling context (sorry_wall=%s, url=%s)",
                place_type,
                _is_sorry,
                _cur_url[:200],
                extra={"center_lat": center_lat, "center_lng": center_lng},
            )
            pool.record_block()
            recycle = True
            return []

        pool.record_success()

        # Wait for results panel — accept any of: place link (the actual data),
        # the feed container, or the "no results" empty-state. Whichever appears
        # first means the SPA finished rendering.
        try:
            await page.wait_for_selector(
                'a[href*="/maps/place/"], [role="feed"], .m6QErb, '
                '[aria-label*="Results"], [aria-label*="No results"]',
                timeout=20000,
            )
            logger.info(
                "[grid][%s] Results panel found at (%.4f,%.4f)",
                place_type,
                center_lat,
                center_lng,
            )
        except Exception:
            try:
                diag = await page.evaluate(
                    "({title: document.title, url: location.href, "
                    "feed: !!document.querySelector('[role=\"feed\"]'), "
                    "links: document.querySelectorAll('a[href*=\"/maps/place/\"]').length, "
                    "snippet: (document.body?.innerText || '').slice(0, 300)})"
                )
            except Exception:
                diag = {"error": "evaluate_failed"}
            logger.warning(
                "[grid][%s] Results panel not found at (%.4f,%.4f) — diag=%s",
                place_type,
                center_lat,
                center_lng,
                diag,
            )
        await asyncio.sleep(random.uniform(0.2, 0.5))

        # Scroll until stable
        await _scroll_until_stable(page)

        # Extract all place links
        hrefs = await page.evaluate(
            """
            () => {
                const links = document.querySelectorAll('a[href*="/maps/place/"]');
                return Array.from(links)
                    .map(a => a.href)
                    .filter(h => h.includes('/maps/place/'));
            }
            """
        )

        logger.info(
            "[grid][%s] Extracted %d hrefs at (%.4f,%.4f)",
            place_type,
            len(hrefs),
            center_lat,
            center_lng,
        )

        if not hrefs:
            snippet = await page.evaluate(
                "document.title + ' | ' + (document.body?.innerText?.slice(0, 500) || '')"
            )
            logger.debug(
                "[grid][%s] No hrefs — page snippet: %s",
                place_type,
                snippet,
                extra={"center_lat": center_lat, "center_lng": center_lng},
            )

        place_ids = _extract_place_ids_from_links(hrefs)
        session_obj.nav_count += 1

        logger.info(
            "[grid][%s] Cell (%.4f,%.4f) found=%d",
            place_type,
            center_lat,
            center_lng,
            len(place_ids),
        )
        return place_ids

    except (BlockedError, CircuitOpenError, AcquireTimeoutError) as e:
        logger.warning(
            "[grid][%s] Pool error at (%.4f,%.4f): %s",
            place_type,
            center_lat,
            center_lng,
            e,
        )
        recycle = True
        return []
    except Exception as e:
        logger.warning(
            "[grid][%s] Cell error at (%.4f,%.4f): %s",
            place_type,
            center_lat,
            center_lng,
            e,
        )
        recycle = True
        raise  # let caller retry
    finally:
        await pool.release(session_obj, recycle=recycle)


async def _search_single_grid_cell(
    lat_min: float,
    lat_max: float,
    lng_min: float,
    lng_max: float,
    place_type: str,
    existing_ids: ThreadSafeIdSet,
    cell_store: DiscoveryCellStore | None = None,
    global_cache: GlobalCellStore | None = None,
) -> list[str]:
    """Navigate browser to a single fixed-size grid cell and extract place IDs.

    Unlike search_area_browser this function never recurses — grid cells are
    fixed-size by design and saturation does not trigger subdivision.
    """
    from app.scrapers.gmaps_shared import calculate_search_radius

    center_lat, center_lng, radius = calculate_search_radius(lat_min, lat_max, lng_min, lng_max)

    # Per-run cell cache check
    if cell_store is not None:
        cached = cell_store.get(lat_min, lat_max, lng_min, lng_max)
        if cached is not None:
            logger.debug(
                "[grid][%s] Skipping cached cell (%.4f,%.4f) results=%d",
                place_type,
                center_lat,
                center_lng,
                cached.result_count,
            )
            cached_names = getattr(cached, "resource_names", None)
            new_ids = existing_ids.add_new(cached_names) if cached_names else []
            return list(new_ids)

    # Cross-run global cache check
    if global_cache is not None:
        global_hit = global_cache.get(lat_min, lat_max, lng_min, lng_max, place_type, "grid")
        if global_hit is not None:
            logger.debug(
                "[grid][%s] Global cache hit (%.4f,%.4f) results=%d",
                place_type,
                center_lat,
                center_lng,
                global_hit.result_count,
            )
            new_ids = existing_ids.add_new(global_hit.resource_names)
            if cell_store is not None:
                cell_store.save(
                    lat_min,
                    lat_max,
                    lng_min,
                    lng_max,
                    0,
                    radius,
                    global_hit.resource_names,
                    False,
                )
            return list(new_ids)

    zoom = _cell_size_to_zoom(lat_min, lat_max, lng_min, lng_max)
    pool = get_maps_pool()
    place_ids: list[str] = []

    search_url = (
        f"https://www.google.com/maps/search/{place_type}"
        f"/@{center_lat:.6f},{center_lng:.6f},{zoom}z"
        f"?hl=en"
    )
    logger.info("[grid][%s] Navigating (zoom=%d): %s", place_type, zoom, search_url)

    for attempt in range(1, BROWSER_CELL_MAX_RETRIES + 1):
        try:
            place_ids = await asyncio.wait_for(
                _do_grid_cell_navigation(pool, place_type, search_url, center_lat, center_lng),
                timeout=BROWSER_CELL_TIMEOUT_S,
            )
            break  # success
        except (AcquireTimeoutError, BlockedError, CircuitOpenError) as e:
            logger.warning("[grid][%s] %s at (%.4f,%.4f)", place_type, e, center_lat, center_lng)
            return []  # no point retrying — pool-level issue
        except Exception as e:
            logger.warning(
                "[grid][%s] Cell error at (%.4f,%.4f) — attempt %d/%d: %s",
                place_type,
                center_lat,
                center_lng,
                attempt,
                BROWSER_CELL_MAX_RETRIES,
                e,
            )
            if attempt >= BROWSER_CELL_MAX_RETRIES:
                return []
            backoff = 2**attempt + random.uniform(0, 1)
            logger.info("[grid][%s] Retrying in %.1fs...", place_type, backoff)
            await asyncio.sleep(backoff)

    new_ids = existing_ids.add_new(place_ids)

    if cell_store is not None:
        cell_store.save(lat_min, lat_max, lng_min, lng_max, 0, radius, place_ids, False)
    if global_cache is not None:
        global_cache.save(lat_min, lat_max, lng_min, lng_max, place_type, place_ids, False, "grid")

    return list(new_ids)


async def search_grid_browser(
    grid_cells: list[tuple[float, float, float, float]],
    place_type: str,
    existing_ids: ThreadSafeIdSet,
    max_results: int | None = None,
    cell_store: DiscoveryCellStore | None = None,
    global_cache: GlobalCellStore | None = None,
    semaphore: asyncio.Semaphore | None = None,
    _progress_callback: object | None = None,
    cancel_event: asyncio.Event | None = None,
    metrics: RunMetrics | None = None,
    collect_results: bool = True,
) -> list[str]:
    """Search a pre-computed grid of fixed-size cells for a single place type.

    Each cell is navigated independently by a browser context.  Already-searched
    cells (cached in cell_store or global_cache) are skipped, providing the same
    interrupted-run resumability as the quadtree approach.

    Args:
        grid_cells: List of (lat_min, lat_max, lng_min, lng_max) tuples.
        place_type: Google Maps search type (e.g. "mosque").
        existing_ids: Shared dedup set across all place types.
        max_results: Stop early when this many unique IDs are found.
        cell_store: Per-run cache for resumability.
        global_cache: Cross-run cache to skip re-searching recent cells.
        semaphore: Limits concurrent browser navigations.
        _progress_callback: Optional callable(place_type, cells_done, cells_total, total_ids)
            for updating discovery progress in the DB.
        cancel_event: If set, stops processing remaining cells gracefully.
        collect_results: When False, skips building the extra aggregate list and
            only updates the shared dedup set.

    Returns:
        List of new place resource names found during this grid pass. Returns an
        empty list when collect_results=False.
    """
    all_new: list[str] = []
    total_new = 0
    _sem = semaphore if semaphore is not None else _NullSemaphore()

    async def _bounded_cell(cell: tuple) -> list[str]:
        if cancel_event and cancel_event.is_set():
            return []
        if max_results and len(existing_ids) >= max_results:
            return []
        # Jitter before queueing for a scarce browser slot so we don't spend the
        # active-concurrency budget on sleeping tasks.
        delay = random.uniform(
            settings.maps_browser_cell_delay_min,
            settings.maps_browser_cell_delay_max,
        )
        await asyncio.sleep(delay)
        async with _sem:
            if max_results and len(existing_ids) >= max_results:
                return []
            lat_min, lat_max, lng_min, lng_max = cell
            t0 = time.monotonic()
            result = await _search_single_grid_cell(
                lat_min,
                lat_max,
                lng_min,
                lng_max,
                place_type,
                existing_ids,
                cell_store=cell_store,
                global_cache=global_cache,
            )
            if metrics:
                metrics.record_cell_time(time.monotonic() - t0)
                metrics.cells_searched += 1
                if not result:
                    metrics.cells_empty += 1
                else:
                    metrics.places_discovered += len(result)
            return result

    # Process in batches to avoid creating 50K+ coroutines simultaneously
    BATCH_SIZE = 100
    pool = get_maps_pool()
    for batch_start in range(0, len(grid_cells), BATCH_SIZE):
        if cancel_event and cancel_event.is_set():
            logger.info("[grid][%s] Cancellation requested — stopping", place_type)
            break
        if max_results and len(existing_ids) >= max_results:
            break
        # Abort early if the circuit breaker has permanently given up — every
        # remaining cell would fail instantly with CircuitOpenError, wasting
        # inter-cell delays and log volume.
        if pool.is_permanently_blocked:
            logger.error(
                "[grid][%s] Browser pool permanently blocked — aborting remaining "
                "%d cells (IP appears bot-walled). Configure BROWSER_PROXY_LIST.",
                place_type,
                len(grid_cells) - batch_start,
            )
            break
        batch = grid_cells[batch_start : batch_start + BATCH_SIZE]
        results = await asyncio.gather(*[_bounded_cell(c) for c in batch], return_exceptions=True)
        for result in results:
            if isinstance(result, Exception):
                logger.warning("[grid][%s] Cell task error: %s", place_type, result)
            else:
                total_new += len(result)
                if collect_results:
                    all_new.extend(result)

        cells_done = min(batch_start + BATCH_SIZE, len(grid_cells))
        logger.info(
            "[grid][%s] Batch %d-%d/%d done — %d new IDs so far (total=%d)",
            place_type,
            batch_start + 1,
            cells_done,
            len(grid_cells),
            total_new,
            len(existing_ids),
        )

        # Update discovery progress in DB every batch for admin UI visibility
        if _progress_callback is not None:
            _progress_callback(place_type, cells_done, len(grid_cells), len(existing_ids))

    # Log structured metrics summary for this type pass
    if metrics:
        metrics.cells_total = len(grid_cells)
        metrics.log_summary(place_type)

    return all_new if collect_results else []


async def run_gmaps_scraper_browser(run_code: str, config: dict, session: Session) -> None:
    """
    Browser-based orchestrator: discover places → fetch details → download images.

    Each active place type gets an independent quadtree search pass; results are
    deduplicated across passes. All downstream phases (image download, enrichment,
    sync) are unchanged.
    """
    from app.collectors.gmaps_browser import BrowserGmapsCollector
    from app.collectors.image_download import download_place_images
    from app.db.session import engine as _engine
    from app.scrapers.geo_utils import get_boundary_boxes
    from app.scrapers.gmaps_shared import (
        STALE_THRESHOLD_DAYS,
        fetch_place_details,
        load_place_type_maps,
    )
    from app.scrapers.grid import generate_multi_box_grid_cells

    city = config.get("city")
    state = config.get("state")
    country = config.get("country")
    force_refresh = config.get("force_refresh", False)
    stale_threshold_days = config.get("stale_threshold_days", STALE_THRESHOLD_DAYS)

    if not city and not state and not country:
        raise ValueError("Either city, state, or country required in config")

    run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
    if not run:
        raise ValueError(f"Run {run_code} not found")

    boundary_name = city if city else (state if state else country)
    boundary = session.exec(select(GeoBoundary).where(GeoBoundary.name == boundary_name)).first()
    if not boundary:
        raise ValueError(f"Geographic boundary not found for: {boundary_name}")

    pt_maps = load_place_type_maps(session)

    if not pt_maps.all_gmaps_types:
        raise ValueError("No active place type mappings found in database.")

    all_gmaps_types = pt_maps.all_gmaps_types
    type_map = pt_maps.gmaps_type_to_our_type
    religion_type_map = pt_maps.gmaps_type_to_religion

    logger.info("=== Browser Grid: Searching for religious places in %s ===", boundary_name)
    logger.info("Place types (%d): %s", len(all_gmaps_types), all_gmaps_types)

    run.stage = "discovery"
    session.add(run)
    session.commit()

    t_discovery = time.monotonic()
    max_results = config.get("max_results")
    browser_sem = asyncio.Semaphore(settings.maps_browser_concurrency)

    # Extract centre coordinates while the session is still open (used later for
    # detail-fetch browser geolocation so Google doesn't redirect to EU consent).
    _boundary_centre_lat = (boundary.lat_min + boundary.lat_max) / 2
    _boundary_centre_lng = (boundary.lng_min + boundary.lng_max) / 2

    # Build grid from multi-box boundary (falls back to single box when no sub-boxes seeded)
    boxes = get_boundary_boxes(boundary, session)

    # If this run is constrained to a specific geo box, filter to that box only
    if run.geo_box_label:
        boxes = [b for b in boxes if b.label == run.geo_box_label]
        if not boxes:
            raise RuntimeError(
                f"geo_box_label={run.geo_box_label!r} not found in boundary {boundary.name!r}"
            )
        logger.info(
            "run_gmaps_browser_scraper: constrained to box %r for run %s",
            run.geo_box_label,
            run_code,
        )

    cell_size_km = settings.browser_grid_cell_size_km
    grid_cells = generate_multi_box_grid_cells(boxes, cell_size_km)
    logger.info(
        "Grid: %d boxes → %d cells (%.1f km each) for %s",
        len(boxes),
        len(grid_cells),
        cell_size_km,
        boundary_name,
    )

    # Shared dedup set — cross-type deduplication so the same place isn't fetched twice
    existing_ids = ThreadSafeIdSet()
    global_cache = GlobalCellStore(_engine)

    # Memory monitoring — logs RSS every 30s, triggers gc.collect() above threshold
    async def _memory_monitor() -> None:
        try:
            import gc

            import psutil

            process = psutil.Process()
            # Default threshold: 80% of Cloud Run memory limit or 6 GiB
            mem_limit_mb = int(os.environ.get("MEMORY_LIMIT_MB", "6144"))
            threshold_mb = mem_limit_mb * 0.8
            while True:
                await asyncio.sleep(30)
                rss_mb = process.memory_info().rss / (1024 * 1024)
                logger.info("Memory: RSS=%.0f MB (threshold=%.0f MB)", rss_mb, threshold_mb)
                if rss_mb > threshold_mb:
                    logger.warning(
                        "Memory pressure: RSS=%.0f MB > threshold=%.0f MB — forcing gc.collect()",
                        rss_mb,
                        threshold_mb,
                    )
                    gc.collect()
        except ImportError:
            logger.debug("psutil not installed — memory monitoring disabled")
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            logger.debug("Memory monitor error: %s", exc)

    mem_monitor_task = asyncio.create_task(_memory_monitor())

    # Cancellation support — background coroutine checks DB every 10s
    cancel_event = asyncio.Event()

    async def _cancellation_watcher() -> None:
        while not cancel_event.is_set():
            await asyncio.sleep(10)
            try:
                _run = session.exec(
                    select(ScraperRun).where(ScraperRun.run_code == run_code)
                ).first()
                if _run and _run.status == "cancelled":
                    logger.info("Run %s cancelled — signalling stop", run_code)
                    cancel_event.set()
            except Exception:
                pass

    watcher_task = asyncio.create_task(_cancellation_watcher())

    # Progress callback — updates ScraperRun.progress_detail for admin UI visibility
    def _update_progress(
        place_type: str, cells_done: int, cells_total: int, total_ids: int
    ) -> None:
        try:
            _run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
            if _run:
                _run.progress_detail = (
                    f"type={place_type} cells={cells_done}/{cells_total} " f"places={total_ids}"
                )
                session.add(_run)
                session.commit()
        except Exception:
            pass  # non-critical — don't interrupt discovery

    # Run 2-3 place types concurrently — the shared browser_sem still limits total
    # navigations, but overlapping cache lookups and delays cuts total time.
    TYPE_CONCURRENCY = 3
    type_sem = asyncio.Semaphore(TYPE_CONCURRENCY)

    async def _run_type_pass(i: int, place_type: str) -> None:
        async with type_sem:
            if cancel_event.is_set():
                return
            if max_results and len(existing_ids) >= max_results:
                return

            logger.info(
                "=== Browser grid pass %d/%d: type=%s cells=%d ===",
                i + 1,
                len(all_gmaps_types),
                place_type,
                len(grid_cells),
            )

            type_cell_store = DiscoveryCellStore(
                run_code, _engine, place_type=place_type, discovery_method="grid"
            )
            type_cell_store.pre_seed_id_set(existing_ids)

            type_metrics = RunMetrics()
            prev_count = len(existing_ids)
            await search_grid_browser(
                grid_cells,
                place_type=place_type,
                existing_ids=existing_ids,
                max_results=max_results,
                cell_store=type_cell_store,
                global_cache=global_cache,
                semaphore=browser_sem,
                _progress_callback=_update_progress,
                cancel_event=cancel_event,
                metrics=type_metrics,
                collect_results=False,
            )
            type_count = len(existing_ids) - prev_count
            logger.info(
                "Type %s done: found=%d, cumulative=%d",
                place_type,
                type_count,
                len(existing_ids),
            )

    results = await asyncio.gather(
        *[_run_type_pass(i, pt) for i, pt in enumerate(all_gmaps_types)],
        return_exceptions=True,
    )
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            logger.warning("Type pass %s failed: %s", all_gmaps_types[i], result)

    # Stop background watchers
    cancel_event.set()
    watcher_task.cancel()
    mem_monitor_task.cancel()

    discovery_count = len(existing_ids)
    discovery_elapsed = time.monotonic() - t_discovery
    logger.info(
        "Browser discovery complete: %d places found in %.1fs",
        discovery_count,
        discovery_elapsed,
        extra={
            "run_code": run_code,
            "discovery_duration_s": round(discovery_elapsed, 2),
            "places_found": discovery_count,
        },
    )

    # If discovery yielded nothing AND the browser pool permanently gave up,
    # surface the failure clearly instead of silently marking the run
    # "completed" with total_items=0. This is the signature of a Google Maps
    # bot-wall on the Cloud Run egress IP.
    pool_blocked = False
    try:
        pool_blocked = get_maps_pool().is_permanently_blocked
    except Exception:
        pass

    run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
    if run:
        run.total_items = discovery_count
        run.discovery_duration_s = round(discovery_elapsed, 2)
        if pool_blocked and discovery_count == 0:
            run.status = "failed"
            run.stage = "discovery"
            run.error_message = (
                "Discovery blocked: egress IP hit Google Maps bot-wall "
                "(redirected to google.com/sorry/index on first navigation). "
                "Configure BROWSER_PROXY_LIST to route browser traffic through "
                "a clean IP, or check the VM tinyproxy at 10.132.0.2:3128."
            )
            logger.error(
                "Run %s marked FAILED — browser pool permanently blocked, 0 places discovered",
                run_code,
            )
            existing_ids.close()
            session.add(run)
            session.commit()
            # Skip detail/image/sync stages — nothing to process, and the pool
            # is still blocked so they'd all hit the same wall.
            session.close()
            return
        run.stage = "detail_fetch"
        session.add(run)
        session.commit()

    # Close the discovery session — it may have a stale DB connection after hours
    # of discovery. Each subsequent stage opens a fresh session.
    session.close()
    logger.info("Closed discovery session — opening fresh sessions for subsequent stages")

    # Reset browser pool between discovery and detail fetch to free memory
    # (Chromium contexts accumulate ~50MB each over hours of navigation).
    # The pool auto-reinitializes on the first acquire() in detail fetch.
    from app.services.browser_pool import shutdown_maps_pool

    await shutdown_maps_pool()
    logger.info("Browser pool reset between discovery and detail fetch")

    # Detail fetch phase — fresh session + BrowserGmapsCollector
    t_detail = time.monotonic()
    all_resource_names = existing_ids.to_list()
    existing_ids.close()
    logger.info("Fetching details for %d places (browser mode)...", discovery_count)
    with Session(_engine) as detail_session:
        await fetch_place_details(
            all_resource_names,
            run_code,
            detail_session,
            BrowserGmapsCollector(
                session_lat=_boundary_centre_lat,
                session_lng=_boundary_centre_lng,
            ),
            "",  # No API key needed
            type_map,
            religion_type_map,
            force_refresh,
            stale_threshold_days,
        )
        detail_elapsed = time.monotonic() - t_detail
        run = detail_session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
        if run:
            run.detail_fetch_duration_s = round(detail_elapsed, 2)
            detail_session.add(run)
            detail_session.commit()

        # Fail fast if the pool was permanently blocked during detail fetch (consent wall
        # or bot-wall). Continuing to image download / sync would produce zero results.
        try:
            _detail_pool_blocked = get_maps_pool().is_permanently_blocked
        except Exception:
            _detail_pool_blocked = False
        if _detail_pool_blocked:
            _blocked_run = detail_session.exec(
                select(ScraperRun).where(ScraperRun.run_code == run_code)
            ).first()
            if _blocked_run and _blocked_run.processed_items == 0:
                _blocked_run.status = "failed"
                _blocked_run.stage = "detail_fetch"
                _blocked_run.error_message = (
                    "Detail fetch blocked: EU consent wall (SOCS cookies ineffective) "
                    "or Maps bot-wall on detail egress IP. "
                    "Configure BROWSER_PROXY_LIST to route via a clean IP, "
                    "or check VM tinyproxy at 10.132.0.2:3128."
                )
                detail_session.add(_blocked_run)
                detail_session.commit()
                logger.error(
                    "Run %s marked FAILED — pool permanently blocked during detail fetch "
                    "(0 places processed)",
                    run_code,
                )
                return

    logger.info(
        "Detail fetch completed in %.1fs",
        detail_elapsed,
        extra={"run_code": run_code, "detail_fetch_duration_s": round(detail_elapsed, 2)},
    )

    # Image download phase — fresh session (unchanged — downloads from URLs extracted by browser)
    with Session(_engine) as img_session:
        run = img_session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
        if run:
            total_rev = run.review_images_downloaded + run.review_images_failed
            if total_rev:
                logger.info(
                    "Review image upload complete: %d/%d uploaded to GCS for run %s (%d failed)",
                    run.review_images_downloaded,
                    total_rev,
                    run_code,
                    run.review_images_failed,
                )
            else:
                logger.info("Review image upload: no review images captured for run %s", run_code)

            logger.info("Downloading images for run %s...", run_code)
            run.stage = "image_download"
            img_session.add(run)
            img_session.commit()

    t_img = time.monotonic()
    await download_place_images(run_code, _engine)
    img_elapsed = time.monotonic() - t_img
    with Session(_engine) as img_done_session:
        run = img_done_session.exec(
            select(ScraperRun).where(ScraperRun.run_code == run_code)
        ).first()
        if run:
            run.image_download_duration_s = round(img_elapsed, 2)
            img_done_session.add(run)
            img_done_session.commit()
    logger.info(
        "Image download completed in %.1fs",
        img_elapsed,
        extra={"run_code": run_code, "image_download_duration_s": round(img_elapsed, 2)},
    )
