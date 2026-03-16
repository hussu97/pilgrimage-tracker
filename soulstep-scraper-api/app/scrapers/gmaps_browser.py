"""
Browser-based Google Maps discovery and scraper orchestration.

Replaces Google Places API calls with Playwright-based web scraping when
SCRAPER_BACKEND=browser is set. Mirrors the quadtree search pattern from
scrapers/gmaps.py but uses browser navigation instead of API calls.

Discovery returns the same "places/{id}" resource name format consumed by
fetch_place_details() so all downstream phases remain unchanged.

Each active place type gets an independent quadtree search pass so no types
are silently dropped and the cell cache is keyed per-type.
"""

from __future__ import annotations

import asyncio
import math
import random
import re

from sqlmodel import Session, select

from app.config import settings
from app.constants import (
    BROWSER_SCROLL_MAX_ATTEMPTS,
    BROWSER_SCROLL_PIXEL_STEP,
    BROWSER_SCROLL_STABLE_THRESHOLD,
    MAX_DISCOVERY_RADIUS_M,
    MIN_DISCOVERY_RADIUS_M,
)
from app.db.models import GeoBoundary, PlaceTypeMapping, ScraperRun
from app.logger import get_logger
from app.scrapers.base import ThreadSafeIdSet
from app.scrapers.cell_store import DiscoveryCellStore, GlobalCellStore
from app.scrapers.gmaps import calculate_search_radius
from app.services.browser_pool import BlockedError, CircuitOpenError, get_maps_pool

logger = get_logger(__name__)

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
    """Return True if Maps has detected bot activity or access is denied."""
    try:
        content = await page.content()
        lower = content.lower()
        if any(
            indicator in lower
            for indicator in [
                "unusual traffic",
                "access denied",
                "your computer or network may be sending automated queries",
            ]
        ):
            return True
        # "enable javascript" is a <noscript> fallback present on every Maps page — do NOT use it.
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
    """Dismiss cookie consent banners if present (first visit only)."""
    try:
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
    prev_count = 0
    stable_count = 0

    for _ in range(max_attempts):
        # Count place links currently visible in the DOM
        current_count: int = await page.evaluate(
            "document.querySelectorAll('a[href*=\"/maps/place/\"]').length"
        )

        if current_count == prev_count:
            stable_count += 1
        else:
            stable_count = 0
        prev_count = current_count

        if stable_count >= stable_threshold:
            logger.debug("_scroll_until_stable: stable after %d links", current_count)
            break

        # Check for explicit end-of-list marker emitted by Maps
        end_marker = await page.evaluate(
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
            logger.debug("_scroll_until_stable: end-of-list marker found")
            break

        # Scroll inside the results feed element; fall back to window scroll
        try:
            feed = await page.query_selector('[role="feed"]')
            if feed:
                await page.evaluate(f"el => el.scrollTop += {pixel_step}", feed)
            else:
                await page.evaluate(f"window.scrollBy(0, {pixel_step})")
        except Exception:
            pass

        await asyncio.sleep(random.uniform(0.5, 1.5))


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
            new_ids = existing_ids.add_new(cached.resource_names)
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
    async with _sem_ctx:
        session = await pool.acquire(lat=center_lat, lng=center_lng)
        recycle = False
        try:
            page = session.page

            await page.goto(search_url, wait_until="domcontentloaded", timeout=30000)

            title = await page.title()
            url = page.url
            logger.info("%s[%s] Page loaded: title=%r url=%s", indent, place_type, title, url)

            await asyncio.sleep(random.uniform(2, 4))

            if not _consent_dismissed:
                await _dismiss_consent(page)
                _consent_dismissed = True
                await asyncio.sleep(random.uniform(0.5, 1.5))

            if await _check_for_block(page):
                logger.warning(
                    "%s[%s] Maps blocked browser — recycling context", indent, place_type
                )
                pool.record_block()
                recycle = True
                return []

            logger.debug(
                "%s[%s] Page content_len=%d",
                indent,
                place_type,
                len(await page.content()),
            )

            pool.record_success()

            # Wait for results panel
            try:
                await page.wait_for_selector(
                    '[role="feed"], .m6QErb, [aria-label*="Results"]',
                    timeout=15000,
                )
                logger.info("%s[%s] Results panel found", indent, place_type)
            except Exception:
                logger.warning(
                    "%s[%s] Results panel not found (timeout) — page may be empty or layout changed",
                    indent,
                    place_type,
                )

            await asyncio.sleep(random.uniform(1, 3))

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
                snippet = (await page.content())[:2000]
                logger.debug("%s[%s] No hrefs found. Page snippet: %s", indent, place_type, snippet)

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

        except (BlockedError, CircuitOpenError) as e:
            logger.warning("%s[%s] Browser pool error: %s", indent, place_type, e)
            recycle = True
            return []
        except Exception as e:
            logger.warning("%s[%s] Browser search error: %s", indent, place_type, e)
            recycle = True
            return []
        finally:
            await pool.release(session, recycle=recycle)

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
    from app.scrapers.gmaps import calculate_search_radius

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
            new_ids = existing_ids.add_new(cached.resource_names)
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

    session_obj = await pool.acquire(lat=center_lat, lng=center_lng)
    recycle = False
    try:
        page = session_obj.page

        await page.goto(search_url, wait_until="domcontentloaded", timeout=30000)

        title = await page.title()
        url = page.url
        logger.info(
            "[grid][%s] Page loaded: title=%r url=%s",
            place_type,
            title,
            url,
            extra={"center_lat": center_lat, "center_lng": center_lng},
        )

        await asyncio.sleep(random.uniform(2, 4))

        await _dismiss_consent(page)

        if await _check_for_block(page):
            logger.warning(
                "[grid][%s] Maps blocked browser — recycling context",
                place_type,
                extra={"center_lat": center_lat, "center_lng": center_lng},
            )
            pool.record_block()
            recycle = True
            return []

        pool.record_success()

        # Wait for results panel
        try:
            await page.wait_for_selector(
                '[role="feed"], .m6QErb, [aria-label*="Results"]',
                timeout=15000,
            )
            logger.info(
                "[grid][%s] Results panel found at (%.4f,%.4f)",
                place_type,
                center_lat,
                center_lng,
            )
        except Exception:
            logger.warning(
                "[grid][%s] Results panel not found at (%.4f,%.4f)",
                place_type,
                center_lat,
                center_lng,
            )

        await asyncio.sleep(random.uniform(1, 2))

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
            snippet = (await page.content())[:1000]
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

    except Exception as e:
        logger.warning(
            "[grid][%s] Cell error at (%.4f,%.4f): %s",
            place_type,
            center_lat,
            center_lng,
            e,
            exc_info=True,
        )
        recycle = True
        return []
    finally:
        await pool.release(session_obj, recycle=recycle)

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

    Returns:
        List of new place resource names found during this grid pass.
    """
    all_new: list[str] = []
    _sem = semaphore if semaphore is not None else _NullSemaphore()

    async def _bounded_cell(cell: tuple) -> list[str]:
        if max_results and len(existing_ids) >= max_results:
            return []
        async with _sem:
            if max_results and len(existing_ids) >= max_results:
                return []
            # Inter-cell human-like delay to avoid concurrent-request bot detection
            delay = random.uniform(
                settings.maps_browser_cell_delay_min,
                settings.maps_browser_cell_delay_max,
            )
            await asyncio.sleep(delay)
            lat_min, lat_max, lng_min, lng_max = cell
            return await _search_single_grid_cell(
                lat_min,
                lat_max,
                lng_min,
                lng_max,
                place_type,
                existing_ids,
                cell_store=cell_store,
                global_cache=global_cache,
            )

    results = await asyncio.gather(*[_bounded_cell(c) for c in grid_cells], return_exceptions=True)
    for result in results:
        if isinstance(result, Exception):
            logger.warning("[grid][%s] Cell task error: %s", place_type, result)
        else:
            all_new.extend(result)

    return all_new


async def run_gmaps_scraper_browser(run_code: str, config: dict, session: Session) -> None:
    """
    Browser-based orchestrator: discover places → fetch details → download images.

    Drop-in replacement for run_gmaps_scraper() when SCRAPER_BACKEND=browser.
    Each active place type gets an independent quadtree search pass; results are
    deduplicated across passes. All downstream phases (image download, enrichment,
    sync) are unchanged.
    """
    from app.collectors.gmaps import download_place_images
    from app.collectors.gmaps_browser import BrowserGmapsCollector
    from app.db.session import engine as _engine
    from app.scrapers.geo_utils import get_boundary_boxes
    from app.scrapers.gmaps import (
        STALE_THRESHOLD_DAYS,
        fetch_place_details,
        get_gmaps_type_to_our_type,
    )
    from app.scrapers.grid import generate_multi_box_grid_cells

    city = config.get("city")
    country = config.get("country")
    force_refresh = config.get("force_refresh", False)
    stale_threshold_days = config.get("stale_threshold_days", STALE_THRESHOLD_DAYS)

    if not city and not country:
        raise ValueError("Either city or country required in config")

    run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
    if not run:
        raise ValueError(f"Run {run_code} not found")

    boundary_name = city if city else country
    boundary = session.exec(select(GeoBoundary).where(GeoBoundary.name == boundary_name)).first()
    if not boundary:
        raise ValueError(f"Geographic boundary not found for: {boundary_name}")

    place_type_mappings = session.exec(
        select(PlaceTypeMapping)
        .where(PlaceTypeMapping.is_active)
        .where(PlaceTypeMapping.source_type == "gmaps")
        .order_by(PlaceTypeMapping.religion)
        .order_by(PlaceTypeMapping.display_order)
    ).all()

    if not place_type_mappings:
        raise ValueError("No active place type mappings found in database.")

    all_gmaps_types = list({m.gmaps_type for m in place_type_mappings})
    type_map = get_gmaps_type_to_our_type(session)
    religion_type_map = {m.gmaps_type: m.religion for m in place_type_mappings}

    logger.info("=== Browser Grid: Searching for religious places in %s ===", boundary_name)
    logger.info("Place types (%d): %s", len(all_gmaps_types), all_gmaps_types)

    run.stage = "discovery"
    session.add(run)
    session.commit()

    max_results = config.get("max_results")
    browser_sem = asyncio.Semaphore(settings.maps_browser_concurrency)

    # Build grid from multi-box boundary (falls back to single box when no sub-boxes seeded)
    boxes = get_boundary_boxes(boundary, session)
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

    pool = get_maps_pool()

    for i, place_type in enumerate(all_gmaps_types):
        # Reset circuit breaker between types so one type's failures don't cascade
        if i > 0:
            pool.reset_breaker()

        logger.info(
            "=== Browser grid pass %d/%d: type=%s cells=%d ===",
            i + 1,
            len(all_gmaps_types),
            place_type,
            len(grid_cells),
        )

        # Each type gets its own cell store keyed by (place_type, "grid") for resumability
        type_cell_store = DiscoveryCellStore(
            run_code, _engine, place_type=place_type, discovery_method="grid"
        )
        type_cell_store.pre_seed_id_set(existing_ids)

        prev_count = len(existing_ids)
        await search_grid_browser(
            grid_cells,
            place_type=place_type,
            existing_ids=existing_ids,
            max_results=max_results,
            cell_store=type_cell_store,
            global_cache=global_cache,
            semaphore=browser_sem,
        )
        type_count = len(existing_ids) - prev_count
        logger.info(
            "Type %s done: found=%d, cumulative=%d", place_type, type_count, len(existing_ids)
        )

        if max_results and len(existing_ids) >= max_results:
            logger.info(
                "max_results=%d reached after type %s — skipping remaining %d type(s)",
                max_results,
                place_type,
                len(all_gmaps_types) - i - 1,
            )
            break

    all_resource_names = existing_ids.to_list()
    logger.info("Browser discovery complete: %d places found", len(all_resource_names))

    run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
    if run:
        run.total_items = len(all_resource_names)
        run.stage = "detail_fetch"
        session.add(run)
        session.commit()

    # Detail fetch phase — uses BrowserGmapsCollector instead of GmapsCollector
    logger.info("Fetching details for %d places (browser mode)...", len(all_resource_names))
    await fetch_place_details(
        all_resource_names,
        run_code,
        session,
        BrowserGmapsCollector(),
        "",  # No API key needed
        type_map,
        religion_type_map,
        force_refresh,
        stale_threshold_days,
    )

    # Image download phase (unchanged — downloads from URLs extracted by browser)
    logger.info("Downloading images for run %s...", run_code)
    run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
    if run:
        run.stage = "image_download"
        session.add(run)
        session.commit()

    await download_place_images(run_code, _engine)
