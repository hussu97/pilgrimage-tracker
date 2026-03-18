"""
Google Maps discovery scraper — quadtree search for places.

Detail-fetching has been moved to collectors/gmaps.py (GmapsCollector).
This module handles discovery (finding places) and orchestrating the initial
detail fetch during the scraper run.
"""

import asyncio
import math
import os
import re
import time
from datetime import datetime, timedelta
from typing import Any

import httpx
from sqlmodel import Session, desc, select

from app.config import settings
from app.constants import (
    DEFAULT_STALE_THRESHOLD_DAYS,
    DETAIL_FLUSH_BATCH_SIZE,
    MAX_DISCOVERY_RADIUS_M,
    MIN_DISCOVERY_RADIUS_M,
)
from app.db.models import GeoBoundary, PlaceTypeMapping, RawCollectorData, ScrapedPlace, ScraperRun
from app.logger import get_logger
from app.scrapers.base import (
    AsyncRateLimiter,
    AtomicCounter,
    ThreadSafeIdSet,
    get_async_rate_limiter,
)
from app.scrapers.cell_store import DiscoveryCellStore, GlobalCellStore
from app.services.query_log import log_query

logger = get_logger(__name__)

# Configuration (kept as module-level aliases for code that reads them directly)
MIN_RADIUS = MIN_DISCOVERY_RADIUS_M
MAX_RADIUS = MAX_DISCOVERY_RADIUS_M
STALE_THRESHOLD_DAYS = DEFAULT_STALE_THRESHOLD_DAYS


def get_place_type_mappings(session: Session) -> dict[str, list[str]]:
    """
    Query database for active place type mappings.
    Returns a dict mapping religion to list of Google Maps types.
    """
    mappings = session.exec(
        select(PlaceTypeMapping)
        .where(PlaceTypeMapping.is_active)
        .where(PlaceTypeMapping.source_type == "gmaps")
        .order_by(PlaceTypeMapping.religion)
        .order_by(PlaceTypeMapping.display_order)
    ).all()

    result = {}
    for mapping in mappings:
        if mapping.religion not in result:
            result[mapping.religion] = []
        result[mapping.religion].append(mapping.gmaps_type)

    return result


def get_gmaps_type_to_our_type(session: Session) -> dict[str, str]:
    """
    Query database for active place type mappings.
    Returns a dict mapping Google Maps type to our internal type name.
    """
    mappings = session.exec(
        select(PlaceTypeMapping)
        .where(PlaceTypeMapping.is_active)
        .where(PlaceTypeMapping.source_type == "gmaps")
    ).all()

    return {m.gmaps_type: m.our_place_type for m in mappings}


def get_default_place_type(session: Session, religion: str) -> str:
    """Get the default place type name for a religion (first active mapping)."""
    mapping = session.exec(
        select(PlaceTypeMapping)
        .where(PlaceTypeMapping.religion == religion)
        .where(PlaceTypeMapping.is_active)
        .where(PlaceTypeMapping.source_type == "gmaps")
        .order_by(PlaceTypeMapping.display_order)
    ).first()

    return mapping.our_place_type if mapping else "place of worship"


def detect_religion_from_types(session: Session, gmaps_types: list[str]) -> str | None:
    """Detect religion from Google Maps types by querying active mappings."""
    for gmaps_type in gmaps_types:
        mapping = session.exec(
            select(PlaceTypeMapping)
            .where(PlaceTypeMapping.gmaps_type == gmaps_type)
            .where(PlaceTypeMapping.is_active)
            .where(PlaceTypeMapping.source_type == "gmaps")
        ).first()
        if mapping:
            return mapping.religion
    return None


def clean_address(address):
    """Removes Google Plus Codes from address."""
    return re.sub(r"^[A-Z0-9]{4}\+[A-Z0-9]{2,3}\s*(-\s*)?", "", address).strip()


def normalize_to_24h(time_str):
    """
    Converts local time string from 12h format to 24h format, keeping it in local time.
    Supports comma-separated multi-slot ranges (e.g., "9:00 AM - 12:00 PM, 2:00 PM - 6:00 PM").
    """
    if "open 24 hours" in time_str.lower():
        return "00:00-23:59"
    if "closed" in time_str.lower():
        return "Closed"

    segments = [s.strip() for s in time_str.split(",")]
    normalized_segments = []

    for segment in segments:
        times = re.split(r" – | - | to ", segment.replace("\u202f", " ").strip())
        if len(times) != 2:
            return time_str

        local_times = []
        for t in times:
            try:
                dt = datetime.strptime(t.strip(), "%I:%M %p")
                local_times.append(dt.strftime("%H:%M"))
            except ValueError:
                return time_str

        normalized_segments.append(f"{local_times[0]}-{local_times[1]}")

    return ", ".join(normalized_segments)


def process_weekly_hours(opening_hours_dict):
    """Returns a dictionary with a key for each day of the week in local time (24h format)."""
    schedule = dict.fromkeys(
        ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
        "Hours not available",
    )

    weekday_text = opening_hours_dict.get("weekday_text", [])
    for day_string in weekday_text:
        parts = day_string.split(": ", 1)
        if len(parts) == 2:
            day, hours_str = parts[0], parts[1]
            schedule[day] = normalize_to_24h(hours_str)

    return schedule


async def get_places_in_circle(
    lat: float,
    lng: float,
    radius: float,
    place_types: list[str],
    api_key: str,
    client: httpx.AsyncClient | None = None,
) -> tuple[list[str], bool]:
    """
    Find all places of given types within a circle using the Places API
    (searchNearby endpoint — supports circle restriction + includedTypes filtering).

    Returns (deduplicated list of place resource names, is_saturated).
    is_saturated is True if the maximum 20 results were returned.

    Accepts an optional httpx.AsyncClient for connection reuse across calls.
    """
    url = "https://places.googleapis.com/v1/places:searchNearby"
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": "places.name",
    }
    body = {
        "includedTypes": place_types,
        "languageCode": "en",
        "locationRestriction": {
            "circle": {"center": {"latitude": lat, "longitude": lng}, "radius": radius}
        },
        "maxResultCount": 20,
    }

    t0 = time.perf_counter()
    if client is not None:
        resp = await client.post(url, json=body, headers=headers)
    else:
        async with httpx.AsyncClient(timeout=35.0) as c:
            resp = await c.post(url, json=body, headers=headers)
    duration_ms = (time.perf_counter() - t0) * 1000

    if resp.status_code != 200:
        error_data = resp.json() if resp.content else {}
        error_msg = error_data.get("error", {}).get("message", "Unknown error")
        log_query(
            service="gmaps",
            endpoint="searchNearby",
            method="POST",
            status_code=resp.status_code,
            duration_ms=duration_ms,
            caller="get_places_in_circle",
            request_info={"lat": lat, "lng": lng, "radius_m": radius, "types": place_types},
            error=error_msg,
        )
        raise Exception(f"Places API searchNearby failed (HTTP {resp.status_code}): {error_msg}")

    places_data = resp.json().get("places", [])
    names = [p["name"] for p in places_data if "name" in p]
    is_saturated = len(names) == 20

    log_query(
        service="gmaps",
        endpoint="searchNearby",
        method="POST",
        status_code=resp.status_code,
        duration_ms=duration_ms,
        caller="get_places_in_circle",
        request_info={"lat": lat, "lng": lng, "radius_m": radius, "types": place_types},
        response_info={"count": len(names), "saturated": is_saturated},
    )

    return names, is_saturated


def calculate_search_radius(
    lat_min: float, lat_max: float, lng_min: float, lng_max: float
) -> tuple[float, float, float]:
    """
    Calculate the center point and radius to cover a bounding box.
    Returns (center_lat, center_lng, radius_meters).
    """
    center_lat = (lat_min + lat_max) / 2
    center_lng = (lng_min + lng_max) / 2

    lat_diff = abs(lat_max - lat_min) * 111000
    lng_diff = abs(lng_max - lng_min) * 111000 * abs(math.cos(math.radians(center_lat)))

    diagonal = math.sqrt(lat_diff**2 + lng_diff**2)
    radius = diagonal / 2

    return center_lat, center_lng, radius


async def search_area(
    lat_min: float,
    lat_max: float,
    lng_min: float,
    lng_max: float,
    place_types: list[str],
    api_key: str,
    existing_ids: ThreadSafeIdSet,
    depth: int = 0,
    max_results: int | None = None,
    client: httpx.AsyncClient | None = None,
    cell_store: DiscoveryCellStore | None = None,
    semaphore: asyncio.Semaphore | None = None,
    rate_limiter: AsyncRateLimiter | None = None,
    global_cache: GlobalCellStore | None = None,
) -> list[str]:
    """
    Async recursive quadtree search for places.

    When a semaphore is provided, concurrent API calls are capped at the
    semaphore value so Google rate limits are respected.  All children at
    every depth are gathered concurrently via asyncio.gather().

    When cell_store is provided, already-searched bounding boxes are loaded
    from cache (skipping the API call) to support interrupted-run resumability.

    Returns list of unique place_ids found in this area.
    """
    indent = "  " * depth
    center_lat, center_lng, radius = calculate_search_radius(lat_min, lat_max, lng_min, lng_max)

    logger.debug(
        "%sSearching area (lat: %.4f-%.4f, lng: %.4f-%.4f, radius: %.0fm, depth: %d, total: %d)",
        indent,
        lat_min,
        lat_max,
        lng_min,
        lng_max,
        radius,
        depth,
        len(existing_ids),
    )

    if max_results and len(existing_ids) >= max_results:
        logger.info("%sReached max_results limit (%d), stopping recursion", indent, max_results)
        return []

    if radius < MIN_RADIUS:
        logger.debug("%sArea too small (radius < %dm), stopping recursion", indent, MIN_RADIUS)
        return []

    if radius > MAX_RADIUS:
        logger.debug(
            "%sRadius %.0fm exceeds API limit (%dm), subdividing without searching",
            indent,
            radius,
            MAX_RADIUS,
        )
        new_ids = []
        is_saturated = True
    else:
        # Check cell store cache before making an API call
        if cell_store is not None:
            cached = cell_store.get(lat_min, lat_max, lng_min, lng_max)
            if cached is not None:
                logger.debug(
                    "%sSkipping cached cell (lat: %.4f-%.4f, lng: %.4f-%.4f, results: %d)",
                    indent,
                    lat_min,
                    lat_max,
                    lng_min,
                    lng_max,
                    cached.result_count,
                )
                new_ids = existing_ids.add_new(cached.resource_names)
                if not cached.saturated:
                    return new_ids
                is_saturated = True
                if max_results and len(existing_ids) >= max_results:
                    return new_ids
                return await _split_quadrants(
                    lat_min,
                    lat_max,
                    lng_min,
                    lng_max,
                    list(new_ids),
                    place_types,
                    api_key,
                    existing_ids,
                    depth,
                    max_results,
                    client,
                    cell_store,
                    semaphore,
                    rate_limiter,
                    global_cache,
                    indent,
                )

        # Check global cross-run cache before making an API call
        # Try each place type in order; all types share the same combined API results
        global_hit = None
        if global_cache is not None:
            for _pt in place_types:
                global_hit = global_cache.get(lat_min, lat_max, lng_min, lng_max, _pt)
                if global_hit is not None:
                    break

        if global_hit is not None:
            logger.debug(
                "%sGlobal cache hit (lat: %.4f-%.4f, lng: %.4f-%.4f, results: %d)",
                indent,
                lat_min,
                lat_max,
                lng_min,
                lng_max,
                global_hit.result_count,
            )
            place_ids = global_hit.resource_names
            is_saturated = global_hit.saturated
        else:
            # Acquire semaphore if provided (limits concurrent API calls)
            _sem_ctx = semaphore if semaphore is not None else _NullSemaphore()
            async with _sem_ctx:
                if rate_limiter is not None:
                    await rate_limiter.acquire("gmaps_search")
                place_ids, is_saturated = await get_places_in_circle(
                    center_lat, center_lng, radius, place_types, api_key, client
                )

            # Save to global cache for future runs — one row per type so browser
            # passes can hit the cache after an API run populates it
            if global_cache is not None:
                for _pt in place_types:
                    global_cache.save(
                        lat_min, lat_max, lng_min, lng_max, _pt, place_ids, is_saturated
                    )

        new_ids = existing_ids.add_new(place_ids)

        if new_ids:
            logger.info(
                "Cell depth=%d found=%d new_in_cell=%d total_so_far=%d saturated=%s",
                depth,
                len(new_ids),
                len(place_ids),
                len(existing_ids),
                is_saturated,
            )
        else:
            logger.debug(
                "%sFound %d places (%d new), saturated: %s, total: %d",
                indent,
                len(place_ids),
                len(new_ids),
                is_saturated,
                len(existing_ids),
            )

        # Persist this cell immediately so interrupted runs can resume
        if cell_store is not None:
            cell_store.save(
                lat_min, lat_max, lng_min, lng_max, depth, radius, place_ids, is_saturated
            )

    if max_results and len(existing_ids) >= max_results:
        return new_ids

    if not is_saturated:
        return new_ids

    logger.debug("%sArea saturated, splitting into quadrants...", indent)
    return await _split_quadrants(
        lat_min,
        lat_max,
        lng_min,
        lng_max,
        list(new_ids),
        place_types,
        api_key,
        existing_ids,
        depth,
        max_results,
        client,
        cell_store,
        semaphore,
        rate_limiter,
        global_cache,
        indent,
    )


class _NullSemaphore:
    """No-op async context manager used when no semaphore is configured."""

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        pass


async def _split_quadrants(
    lat_min: float,
    lat_max: float,
    lng_min: float,
    lng_max: float,
    seed_ids: list[str],
    place_types: list[str],
    api_key: str,
    existing_ids: ThreadSafeIdSet,
    depth: int,
    max_results: int | None,
    client: httpx.AsyncClient | None,
    cell_store: DiscoveryCellStore | None,
    semaphore: asyncio.Semaphore | None,
    rate_limiter: AsyncRateLimiter | None,
    global_cache: GlobalCellStore | None,
    indent: str,
) -> list[str]:
    """Recursively search four quadrants concurrently using asyncio.gather()."""
    mid_lat = (lat_min + lat_max) / 2
    mid_lng = (lng_min + lng_max) / 2

    quadrants = [
        (lat_min, mid_lat, lng_min, mid_lng),  # SW
        (lat_min, mid_lat, mid_lng, lng_max),  # SE
        (mid_lat, lat_max, lng_min, mid_lng),  # NW
        (mid_lat, lat_max, mid_lng, lng_max),  # NE
    ]

    all_ids = list(seed_ids)

    tasks = []
    for q_lat_min, q_lat_max, q_lng_min, q_lng_max in quadrants:
        if max_results and len(existing_ids) >= max_results:
            logger.info(
                "%sStopping quadrant submission — max_results (%d) reached", indent, max_results
            )
            break
        tasks.append(
            search_area(
                q_lat_min,
                q_lat_max,
                q_lng_min,
                q_lng_max,
                place_types,
                api_key,
                existing_ids,
                depth + 1,
                max_results,
                client,
                cell_store,
                semaphore,
                rate_limiter,
                global_cache,
            )
        )

    results = await asyncio.gather(*tasks, return_exceptions=True)
    for result in results:
        if isinstance(result, Exception):
            logger.warning("%sQuadrant search failed: %s", indent, result)
        else:
            all_ids.extend(result)

    return all_ids


def _flush_detail_buffer(
    buffer: list[tuple],
    run_code: str,
    session: Session,
    run: ScraperRun,
    counter: AtomicCounter,
    total: int,
) -> None:
    """Batch-write a buffer of fetched place details to the database.

    Computes quality score and gate label for each place immediately after
    detail fetch so downstream phases can gate on these values.
    """
    from app.pipeline.place_quality import get_quality_gate, score_place_quality

    for _place_name, details, response in buffer:
        quality_score = score_place_quality(details)
        quality_gate = get_quality_gate(quality_score)

        scraped_place = ScrapedPlace(
            run_code=run_code,
            place_code=details["place_code"],
            name=details["name"],
            raw_data=details,
            quality_score=quality_score,
            quality_gate=quality_gate,
            city=details.get("city"),
            state=details.get("state"),
            country=details.get("country"),
        )

        # Handle browser-captured image bytes: upload directly to GCS
        image_bytes: list[bytes] = response.pop("_image_bytes", None) or []
        if image_bytes:
            from app.services.gcs import upload_image_bytes as gcs_upload

            gcs_urls = []
            for img_data in image_bytes:
                url = gcs_upload(img_data)
                if url:
                    gcs_urls.append(url)
            if gcs_urls:
                raw = dict(scraped_place.raw_data or {})
                raw["image_urls"] = gcs_urls
                scraped_place.raw_data = raw

        session.add(scraped_place)

        raw_record = RawCollectorData(
            place_code=details["place_code"],
            collector_name="gmaps",
            run_code=run_code,
            raw_response=response,
            status="success",
        )
        session.add(raw_record)

    new_count = counter.increment(len(buffer))
    run.processed_items = new_count
    session.add(run)
    session.commit()
    logger.debug("Flushed %d places (%d/%d total)", len(buffer), new_count, total)


async def discover_places(
    config: dict,
    run_code: str,
    session: Session,
    type_map: dict,
    religion_type_map: dict,
    api_key: str,
    all_gmaps_types: list[str],
    boundary: GeoBoundary,
) -> list[str]:
    """
    Phase 1: Async parallel quadtree search → deduplicated list of discovered place resource names.

    Returns the list of unique Google Maps place resource names (e.g. "places/ChIJ…") found
    within the boundary. The run's total_items is updated and committed after discovery.
    """
    from app.db.session import engine as _engine
    from app.scrapers.geo_utils import get_boundary_boxes

    max_results = config.get("max_results")

    logger.info("Starting recursive quadtree search (all-depth async parallel, semaphore=10)")
    if max_results:
        logger.info("Max results limit: %d", max_results)

    # Build cell store — pre-loads existing cells so interrupted runs can resume
    cell_store = DiscoveryCellStore(run_code, _engine)
    existing_ids = ThreadSafeIdSet()
    cell_store.pre_seed_id_set(existing_ids)  # seed dedup set from prior cells

    # Global cross-run cache — skips API calls for cells searched within TTL
    global_cache = GlobalCellStore(_engine)

    # Semaphore caps concurrent API calls across all coroutines.
    # Configurable via SCRAPER_DISCOVERY_CONCURRENCY env var (default 10).
    api_semaphore = asyncio.Semaphore(settings.discovery_concurrency)
    rate_limiter = get_async_rate_limiter()

    # Multi-box: use sub-boxes if seeded, otherwise fall back to single boundary box
    boxes = get_boundary_boxes(boundary, session)
    logger.info("discover_places: %d box(es) for %r", len(boxes), boundary.name)

    # If this run is constrained to a specific geo box, filter to that box only
    run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
    if run and run.geo_box_label:
        boxes = [b for b in boxes if b.label == run.geo_box_label]
        if not boxes:
            raise RuntimeError(
                f"geo_box_label={run.geo_box_label!r} not found in boundary {boundary.name!r}"
            )
        logger.info(
            "discover_places: constrained to box %r for run %s", run.geo_box_label, run_code
        )

    async with httpx.AsyncClient(timeout=35.0) as discovery_client:
        for box in boxes:
            await search_area(
                box.lat_min,
                box.lat_max,
                box.lng_min,
                box.lng_max,
                all_gmaps_types,
                api_key,
                existing_ids,
                depth=0,
                max_results=max_results,
                client=discovery_client,
                cell_store=cell_store,
                semaphore=api_semaphore,
                rate_limiter=rate_limiter,
                global_cache=global_cache,
            )
            if max_results and len(existing_ids) >= max_results:
                logger.info("Reached max_results limit (%d), stopping after this box", max_results)
                break

    # Use existing_ids.to_list() — includes pre-seeded IDs from resumed runs
    all_resource_names = existing_ids.to_list()

    logger.info("=== Search Summary ===")
    logger.info("Total unique places found: %d", len(all_resource_names))
    if max_results and len(all_resource_names) >= max_results:
        logger.info("Stopped early due to max_results limit (%d)", max_results)

    run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
    if run:
        run.total_items = len(all_resource_names)
        # Resource names are derived from DiscoveryCell records — no longer written to
        # the run's JSON column to avoid 3MB+ serialization at 100K-place scale.
        run.stage = "detail_fetch"
        session.add(run)
        session.commit()

    return all_resource_names


async def fetch_place_details(
    place_ids: list[str],
    run_code: str,
    session: Session,
    collector: Any,
    api_key: str,
    type_map: dict,
    religion_type_map: dict,
    force_refresh: bool,
    stale_threshold_days: int,
) -> None:
    """
    Phase 2: Async parallel detail fetching → batch DB writes.

    Checks cache first, then fetches fresh details for uncached places using
    asyncio.gather() with a concurrency semaphore (max 20 concurrent).
    Results are committed to the DB in batches of 10.
    """
    stale_cutoff = datetime.now() - timedelta(days=stale_threshold_days)

    # Build place_code → place_name mapping
    name_to_code: dict[str, str] = {}
    for place_name in place_ids:
        extracted_id = place_name[7:] if place_name.startswith("places/") else place_name
        name_to_code[place_name] = f"gplc_{extracted_id}"

    # Idempotency guard: skip places already stored for this run (resume support)
    existing_in_run = session.exec(
        select(ScrapedPlace).where(ScrapedPlace.run_code == run_code)
    ).all()
    already_fetched_codes = {p.place_code for p in existing_in_run}
    if already_fetched_codes:
        original_count = len(place_ids)
        place_ids = [pn for pn in place_ids if name_to_code[pn] not in already_fetched_codes]
        logger.info(
            "Resume: skipping %d already-fetched places, %d remaining",
            original_count - len(place_ids),
            len(place_ids),
        )
        if not place_ids:
            logger.info("All places already fetched for run %s, skipping detail fetch", run_code)
            return

    # Single bulk query for cached places
    cached_places: dict[str, ScrapedPlace] = {}
    if not force_refresh:
        logger.info("Checking for cached places (fresher than %d days)...", stale_threshold_days)
        all_place_codes = list(name_to_code.values())
        existing = session.exec(
            select(ScrapedPlace)
            .where(ScrapedPlace.place_code.in_(all_place_codes))
            .where(ScrapedPlace.created_at >= stale_cutoff)
            .order_by(desc(ScrapedPlace.created_at))
        ).all()
        for ep in existing:
            if ep.place_code not in cached_places:
                cached_places[ep.place_code] = ep
        logger.info(
            "Found %d cached places, will fetch %d fresh",
            len(cached_places),
            len(place_ids) - len(cached_places),
        )

    # Store cached places immediately (no API call)
    cached_count = 0
    for place_name in place_ids:
        place_code = name_to_code[place_name]
        if place_code in cached_places and not force_refresh:
            cached_place = cached_places[place_code]
            scraped_place = ScrapedPlace(
                run_code=run_code,
                place_code=cached_place.place_code,
                name=cached_place.name,
                raw_data=cached_place.raw_data,
            )
            session.add(scraped_place)
            cached_count += 1

    if cached_count:
        _run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
        if _run:
            _run.detail_fetch_cached = cached_count
            session.add(_run)
        session.commit()
        logger.info("Stored %d cached places", cached_count)

    to_fetch = [
        pn for pn in place_ids if not (name_to_code[pn] in cached_places and not force_refresh)
    ]

    if not to_fetch:
        logger.info(
            "=== Details Fetch Summary === fresh=0  cached=%d  total=%d",
            cached_count,
            len(place_ids),
        )
        return

    run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
    if not run:
        raise ValueError(f"Run {run_code} not found during detail fetch")

    rate_limiter = get_async_rate_limiter()
    counter = AtomicCounter(initial=cached_count)
    flush_batch_size = DETAIL_FLUSH_BATCH_SIZE
    # Configurable via SCRAPER_DETAIL_CONCURRENCY env var (default 20).
    fetch_sem = asyncio.Semaphore(settings.detail_concurrency)

    # Buffer and lock for thread-safe batch writes (asyncio is single-threaded,
    # but we still need the buffer list to be consistent across await points)
    buffer: list[tuple] = []

    async with httpx.AsyncClient(timeout=35.0) as detail_client:

        async def _fetch_worker(place_name: str) -> tuple[str, dict, dict, str | None]:
            """Fetch place details for a single place."""
            try:
                place_code = name_to_code[place_name]
                response = await collector.fetch_details_split(
                    place_name, api_key, rate_limiter, detail_client
                )
                details = collector.build_place_data(
                    response,
                    place_code,
                    api_key,
                    None,
                    type_map=type_map,
                    religion_type_map=religion_type_map,
                )
                return place_name, details, response, None
            except Exception as e:
                return place_name, {}, {}, str(e)

        async def _bounded_fetch(place_name: str) -> tuple:
            async with fetch_sem:
                return await _fetch_worker(place_name)

        # Launch all fetch tasks (concurrency still governed by fetch_sem)
        tasks = [asyncio.ensure_future(_bounded_fetch(pn)) for pn in to_fetch]

        # Process results incrementally as they arrive — this makes processed_items
        # tick up in real time so the admin UI progress bar updates every batch.
        processed_since_cancel_check = 0
        CANCEL_CHECK_INTERVAL = flush_batch_size * 3

        for coro in asyncio.as_completed(tasks):
            try:
                result = await coro
            except Exception as exc:
                logger.warning("Detail fetch task error: %s", exc)
                counter.increment()
                continue

            if isinstance(result, Exception):
                logger.warning("Detail fetch task error: %s", result)
                counter.increment()
                continue

            place_name, details, response, error = result

            if error is not None:
                logger.warning("Error fetching %s: %s", place_name, error)
                counter.increment()
                continue

            buffer.append((place_name, details, response))

            if len(buffer) >= flush_batch_size:
                _flush_detail_buffer(buffer, run_code, session, run, counter, len(place_ids))
                buffer.clear()

            # Periodic cancellation check so we don't hold locks until all fetches finish
            processed_since_cancel_check += 1
            if processed_since_cancel_check >= CANCEL_CHECK_INTERVAL:
                processed_since_cancel_check = 0
                session.expire(run)
                session.refresh(run)
                if run.status == "cancelled":
                    logger.warning("Run %s was cancelled during detail fetching", run_code)
                    for t in tasks:
                        t.cancel()
                    return

        if buffer:
            _flush_detail_buffer(buffer, run_code, session, run, counter, len(place_ids))

    logger.info(
        "=== Details Fetch Summary === fresh=%d  cached=%d  total=%d",
        counter.value - cached_count,
        cached_count,
        len(place_ids),
    )


async def run_gmaps_scraper(run_code: str, config: dict, session: Session) -> None:
    """
    Async orchestrator: discover places → fetch and cache details → download images.

    Delegates to the browser-based implementation when SCRAPER_BACKEND=browser.
    All downstream phases (enrichment, sync) are unchanged regardless of backend.
    """
    if settings.scraper_backend == "browser":
        from app.scrapers.gmaps_browser import run_gmaps_scraper_browser

        return await run_gmaps_scraper_browser(run_code, config, session)

    from app.collectors.gmaps import GmapsCollector

    city = config.get("city")
    country = config.get("country")
    force_refresh = config.get("force_refresh", False)
    stale_threshold_days = config.get("stale_threshold_days", STALE_THRESHOLD_DAYS)

    if not city and not country:
        raise ValueError("Either city or country required in config")

    api_key = os.environ.get("GOOGLE_MAPS_API_KEY", "")
    if not api_key:
        raise ValueError("GOOGLE_MAPS_API_KEY environment variable not set")

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
        raise ValueError(
            "No active place type mappings found in database. Please seed PlaceTypeMapping table."
        )

    all_gmaps_types = [m.gmaps_type for m in place_type_mappings]

    religion_types_map: dict[str, list[str]] = {}
    for mapping in place_type_mappings:
        if mapping.religion not in religion_types_map:
            religion_types_map[mapping.religion] = []
        religion_types_map[mapping.religion].append(mapping.gmaps_type)

    logger.info("=== Searching for religious places in %s ===", boundary_name)
    logger.info("Place types: %s", all_gmaps_types)
    for religion, types in religion_types_map.items():
        logger.info("  %s: %s", religion, types)

    # Pre-load type maps once so coroutines don't need a DB session
    type_map = get_gmaps_type_to_our_type(session)
    religion_type_map = {m.gmaps_type: m.religion for m in place_type_mappings}

    run.stage = "discovery"
    session.add(run)
    session.commit()

    place_ids = await discover_places(
        config, run_code, session, type_map, religion_type_map, api_key, all_gmaps_types, boundary
    )

    logger.info("Fetching details for %d places...", len(place_ids))
    await fetch_place_details(
        place_ids,
        run_code,
        session,
        GmapsCollector(),
        api_key,
        type_map,
        religion_type_map,
        force_refresh,
        stale_threshold_days,
    )

    # Phase 3: Download images in a dedicated parallel phase (no rate limiting needed —
    # CDN media URLs are not billed API calls)
    logger.info("Downloading images for places in run %s...", run_code)
    from app.collectors.gmaps import download_place_images
    from app.db.session import engine as _img_engine

    run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
    if run:
        run.stage = "image_download"
        session.add(run)
        session.commit()

    await download_place_images(run_code, _img_engine)
