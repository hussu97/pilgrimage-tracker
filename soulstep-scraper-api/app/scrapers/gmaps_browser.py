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
import random
import re

from sqlmodel import Session, select

from app.config import settings
from app.constants import (
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

# Zoom level corresponding to approximate search radius
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
        # ChIJ canonical place ID (preferred)
        match = re.search(r"!1s(ChIJ[a-zA-Z0-9_\-]+)", href)
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
                "recaptcha",
                "access denied",
                "enable javascript",
                "your computer or network may be sending automated queries",
            ]
        ):
            return True
        captcha = await page.query_selector("iframe[src*='recaptcha'], #captcha, .captcha")
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

            await page.goto(search_url, wait_until="networkidle", timeout=30000)

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

            # Scroll to load more results
            try:
                feed = await page.query_selector('[role="feed"]')
                if feed:
                    for _ in range(3):
                        await page.evaluate("el => el.scrollTop += 400", feed)
                        await asyncio.sleep(random.uniform(0.5, 1.0))
            except Exception:
                pass

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
    from app.scrapers.gmaps import (
        STALE_THRESHOLD_DAYS,
        fetch_place_details,
        get_gmaps_type_to_our_type,
    )

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

    logger.info("=== Browser: Searching for religious places in %s ===", boundary_name)
    logger.info("Place types (%d): %s", len(all_gmaps_types), all_gmaps_types)

    run.stage = "discovery"
    session.add(run)
    session.commit()

    max_results = config.get("max_results")
    browser_sem = asyncio.Semaphore(settings.discovery_concurrency)

    # Shared dedup set — cross-type deduplication so the same place isn't fetched twice
    existing_ids = ThreadSafeIdSet()
    global_cache = GlobalCellStore(_engine)

    for i, place_type in enumerate(all_gmaps_types):
        logger.info("=== Browser pass %d/%d: type=%s ===", i + 1, len(all_gmaps_types), place_type)

        # Each type gets its own cell store (keyed by place_type) for resumability
        type_cell_store = DiscoveryCellStore(run_code, _engine, place_type=place_type)
        type_cell_store.pre_seed_id_set(existing_ids)

        prev_count = len(existing_ids)
        await search_area_browser(
            boundary.lat_min,
            boundary.lat_max,
            boundary.lng_min,
            boundary.lng_max,
            place_type=place_type,
            existing_ids=existing_ids,
            depth=0,
            max_results=max_results,
            cell_store=type_cell_store,
            global_cache=global_cache,
            semaphore=browser_sem,
        )
        type_count = len(existing_ids) - prev_count
        logger.info(
            "Type %s done: found=%d, cumulative=%d", place_type, type_count, len(existing_ids)
        )

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
