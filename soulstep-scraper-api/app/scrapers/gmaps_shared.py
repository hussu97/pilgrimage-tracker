"""
Google Maps shared scraper utilities.

Collector-agnostic helpers used by the browser-backed Google Maps scraper
(`gmaps_browser.py`). Covers place-type mapping lookups, address/hours
normalization, search-radius math, the shared detail-fetch orchestrator
(`fetch_place_details`), and fail-fast bookkeeping.
"""

import asyncio
import math
import re
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
from app.db.models import PlaceTypeMapping, RawCollectorData, ScrapedPlace, ScraperRun
from app.logger import get_logger
from app.scrapers.base import (
    AtomicCounter,
    get_async_rate_limiter,
)
from app.services.scraped_assets import (
    build_assets_for_place,
    drain_scraped_assets,
    preserve_source_media_fields,
)

logger = get_logger(__name__)


def _safe_float(val: Any) -> float | None:
    if val is None:
        return None
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


def _safe_int(val: Any) -> int | None:
    if val is None:
        return None
    try:
        return int(val)
    except (TypeError, ValueError):
        return None


# Configuration (kept as module-level aliases for code that reads them directly)
MIN_RADIUS = MIN_DISCOVERY_RADIUS_M
MAX_RADIUS = MAX_DISCOVERY_RADIUS_M
STALE_THRESHOLD_DAYS = DEFAULT_STALE_THRESHOLD_DAYS


class PlaceTypeMaps:
    """Pre-loaded place type mapping data — avoids repeated DB queries.

    Call ``load_place_type_maps(session)`` once, then pass this object around.
    """

    __slots__ = (
        "religion_to_gmaps_types",
        "gmaps_type_to_our_type",
        "gmaps_type_to_religion",
        "all_gmaps_types",
        "_mappings",
    )

    def __init__(self, mappings: list[PlaceTypeMapping]) -> None:
        self._mappings = mappings
        self.religion_to_gmaps_types: dict[str, list[str]] = {}
        self.gmaps_type_to_our_type: dict[str, str] = {}
        self.gmaps_type_to_religion: dict[str, str] = {}

        for m in mappings:
            self.religion_to_gmaps_types.setdefault(m.religion, []).append(m.gmaps_type)
            self.gmaps_type_to_our_type[m.gmaps_type] = m.our_place_type
            self.gmaps_type_to_religion[m.gmaps_type] = m.religion

        self.all_gmaps_types = list(self.gmaps_type_to_our_type.keys())

    def detect_religion(self, gmaps_types: list[str]) -> str | None:
        """Return the religion for the first matching gmaps type, or None."""
        for gtype in gmaps_types:
            if gtype in self.gmaps_type_to_religion:
                return self.gmaps_type_to_religion[gtype]
        return None

    def get_default_place_type(self, religion: str) -> str:
        """Return the first our_place_type for a religion, or 'place of worship'."""
        for m in self._mappings:
            if m.religion == religion:
                return m.our_place_type
        return "place of worship"


def load_place_type_maps(session: Session) -> PlaceTypeMaps:
    """Query PlaceTypeMapping once and return all derived lookup dicts."""
    mappings = session.exec(
        select(PlaceTypeMapping)
        .where(PlaceTypeMapping.is_active)
        .where(PlaceTypeMapping.source_type == "gmaps")
        .order_by(PlaceTypeMapping.religion)
        .order_by(PlaceTypeMapping.display_order)
    ).all()
    return PlaceTypeMaps(list(mappings))


# ── Legacy wrappers (kept for backward compatibility with tests) ───────────


def get_place_type_mappings(session: Session) -> dict[str, list[str]]:
    """Query database for active place type mappings.
    Returns a dict mapping religion to list of Google Maps types.
    """
    return load_place_type_maps(session).religion_to_gmaps_types


def get_gmaps_type_to_our_type(session: Session) -> dict[str, str]:
    """Query database for active place type mappings.
    Returns a dict mapping Google Maps type to our internal type name.
    """
    return load_place_type_maps(session).gmaps_type_to_our_type


def get_default_place_type(session: Session, religion: str) -> str:
    """Get the default place type name for a religion (first active mapping)."""
    return load_place_type_maps(session).get_default_place_type(religion)


def detect_religion_from_types(session: Session, gmaps_types: list[str]) -> str | None:
    """Detect religion from Google Maps types by querying active mappings."""
    return load_place_type_maps(session).detect_religion(gmaps_types)


def clean_address(address):
    """Removes Google Plus Codes from address."""
    return re.sub(r"^[A-Z0-9]{4}\+[A-Z0-9]{2,3}\s*(-\s*)?", "", address).strip()


def normalize_to_24h(time_str):
    """
    Converts local time string from 12h format to 24h format, keeping it in local time.
    Supports comma-separated multi-slot ranges (e.g., "9:00 AM - 12:00 PM, 2:00 PM - 6:00 PM").
    Handles en/em dashes with or without surrounding spaces and times without minutes
    (e.g. "9 AM–12 PM" and "9\u202fAM\u20136\u202fPM" from Google Places API v1).
    """
    if "open 24 hours" in time_str.lower():
        return "00:00-23:59"
    if "closed" in time_str.lower():
        return "Closed"

    segments = [s.strip() for s in time_str.split(",")]
    normalized_segments = []

    for segment in segments:
        seg_clean = segment.replace("\u202f", " ").strip()
        # Split on en/em dash (with or without surrounding spaces) or spaced hyphen
        times = re.split(r"\s*[–—]\s*|\s+-\s+", seg_clean)
        if len(times) != 2:
            return time_str

        local_times = []
        for t in times:
            t = t.strip()
            parsed = False
            for fmt in ("%I:%M %p", "%I %p"):
                try:
                    dt = datetime.strptime(t, fmt)
                    local_times.append(dt.strftime("%H:%M"))
                    parsed = True
                    break
                except ValueError:
                    continue
            if not parsed:
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


# ── Per-place detail-fetch resilience (P0.3 / P0.7) ────────────────────────
# Threshold values for auto-pausing a run on a cascading failure. We need at
# least _FAIL_FAST_MIN_ATTEMPTS places fetched before the ratio is meaningful
# (otherwise a run with 10 attempts and 8 failures would immediately trip).

_FAIL_FAST_MIN_ATTEMPTS = settings.fail_fast_min_attempts
_FAIL_FAST_FAILURE_RATIO = 0.5


class FailFastError(Exception):
    # Raised when the detail-fetch stage sees >50% failures after at least
    # 500 attempts — keeps a systemic outage (expired API key, bot-walled IP,
    # etc.) from burning quota for hours. Caught at the top of run_scraper_task
    # and flips the run to status="interrupted" so the admin can fix root
    # cause and resume.
    pass


def _should_fail_fast(attempted: int, failed: int) -> bool:
    if attempted < _FAIL_FAST_MIN_ATTEMPTS:
        return False
    return failed / attempted >= _FAIL_FAST_FAILURE_RATIO


def _flush_failed_places_buffer(
    failed: list[tuple[str, str, str]],
    run_code: str,
    session: Session,
) -> None:
    # Persist per-place detail-fetch failures as minimal ScrapedPlace stubs
    # so the admin UI can surface which places failed and why, and so sync /
    # enrichment / fail-fast can query actual per-place state rather than
    # scraping logs. Each stub sets enrichment_status="filtered" which is
    # already in the enrichment skip set (complete / filtered), so downstream
    # stages naturally bypass these rows.
    for place_name, place_code, error in failed:
        session.add(
            ScrapedPlace(
                run_code=run_code,
                place_code=place_code,
                name=place_name,
                raw_data={},
                detail_fetch_status="failed",
                detail_fetch_error=error,
                enrichment_status="filtered",
            )
        )
    try:
        session.commit()
    except Exception as exc:
        logger.warning("Failed-places flush commit error: %s", exc)
        try:
            session.rollback()
        except Exception:
            pass


def _build_flush_objects(
    buffer: list[tuple],
    run_code: str,
    run: ScraperRun,
) -> list[tuple]:
    """Build ScrapedPlace + RawCollectorData objects from the buffer.

    Returns a list of (scraped_place, raw_record) tuples ready to be added
    to a session.  Handles GCS uploads for browser-captured images/reviews.
    """
    from app.pipeline.place_quality import get_quality_gate, score_place_quality

    objects: list[tuple] = []

    for _place_name, details, response in buffer:
        quality_score = score_place_quality(details)
        quality_gate = get_quality_gate(quality_score)
        normalized_details = preserve_source_media_fields(details)

        scraped_place = ScrapedPlace(
            run_code=run_code,
            place_code=normalized_details["place_code"],
            name=normalized_details["name"],
            raw_data=normalized_details,
            detail_fetch_status="success",
            quality_score=quality_score,
            quality_gate=quality_gate,
            city=normalized_details.get("city"),
            state=normalized_details.get("state"),
            country=normalized_details.get("country"),
            lat=_safe_float(normalized_details.get("lat")),
            lng=_safe_float(normalized_details.get("lng")),
            rating=_safe_float(normalized_details.get("rating")),
            user_rating_count=_safe_int(normalized_details.get("user_rating_count")),
            google_place_id=normalized_details.get("google_place_id"),
            address=normalized_details.get("address"),
            religion=normalized_details.get("religion"),
            place_type=normalized_details.get("place_type"),
            business_status=normalized_details.get("business_status"),
        )

        raw_record = RawCollectorData(
            place_code=normalized_details["place_code"],
            collector_name="gmaps",
            run_code=run_code,
            raw_response=response,
            status="success",
        )
        assets = build_assets_for_place(run_code, normalized_details, response)
        objects.append((scraped_place, raw_record, assets))

    return objects


def _filter_new_detail_buffer(
    buffer: list[tuple],
    run_code: str,
    session: Session,
) -> tuple[list[tuple], int]:
    """Drop places already persisted for this run before writing a flush batch.

    Resumed local handoffs can see duplicate resolved place IDs when Google
    redirects multiple discovery results to the same place, or when an old
    worker committed a row just before a restarted worker flushes its batch.
    """

    incoming_codes = [
        details.get("place_code")
        for _place_name, details, _response in buffer
        if details.get("place_code")
    ]
    existing_codes = set()
    if incoming_codes:
        existing_codes = set(
            session.exec(
                select(ScrapedPlace.place_code)
                .where(ScrapedPlace.run_code == run_code)
                .where(ScrapedPlace.place_code.in_(incoming_codes))
            ).all()
        )

    seen_codes: set[str] = set()
    filtered_buffer: list[tuple] = []
    skipped_duplicates = 0
    for item in buffer:
        _place_name, details, _response = item
        place_code = details.get("place_code")
        if place_code and (place_code in existing_codes or place_code in seen_codes):
            skipped_duplicates += 1
            continue
        if place_code:
            seen_codes.add(place_code)
        filtered_buffer.append(item)
    return filtered_buffer, skipped_duplicates


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

    If the primary session's commit fails (stale connection, FK violation from
    a dead connection, etc.), retries once with a fresh session.
    """
    from app.db.session import engine

    original_count = len(buffer)
    filtered_buffer, skipped_duplicates = _filter_new_detail_buffer(buffer, run_code, session)

    if skipped_duplicates:
        logger.info(
            "Skipping %d duplicate resolved places during detail flush for run %s",
            skipped_duplicates,
            run_code,
        )

    objects = _build_flush_objects(filtered_buffer, run_code, run)

    for scraped_place, raw_record, assets in objects:
        session.add(scraped_place)
        session.add(raw_record)
        for asset in assets:
            session.add(asset)

    new_count = counter.increment(original_count)
    run.processed_items = new_count
    session.add(run)

    try:
        session.commit()
    except Exception as exc:
        logger.warning("Flush commit failed (%s) — retrying with fresh session", exc)
        try:
            session.rollback()
        except Exception:
            pass

        # Retry with a brand-new session to bypass stale connections and to
        # re-check duplicate rows that may have been committed by an old worker
        # between the first duplicate scan and the failed commit.
        with Session(engine) as fresh:
            fresh_run = fresh.exec(
                select(ScraperRun).where(ScraperRun.run_code == run_code)
            ).first()
            if not fresh_run:
                raise RuntimeError(f"Run {run_code} not found during flush retry") from exc

            retry_buffer, retry_skipped_duplicates = _filter_new_detail_buffer(
                buffer, run_code, fresh
            )
            if retry_skipped_duplicates:
                logger.info(
                    "Skipping %d duplicate resolved places during detail flush retry for run %s",
                    retry_skipped_duplicates,
                    run_code,
                )

            retry_objects = _build_flush_objects(retry_buffer, run_code, fresh_run)
            for scraped_place, raw_record, assets in retry_objects:
                fresh.add(scraped_place)
                fresh.add(raw_record)
                for asset in assets:
                    fresh.add(asset)
            fresh_run.processed_items = new_count
            fresh.add(fresh_run)
            fresh.commit()
            logger.info(
                "Flush retry succeeded with fresh session (%d/%d new places)",
                len(retry_buffer),
                len(buffer),
            )

    logger.debug("Flushed %d places (%d/%d total)", len(buffer), new_count, total)

    # Compatibility path for sync callers (mainly unit tests) that exercise
    # _flush_detail_buffer directly outside the async detail-fetch pipeline.
    # In the real scraper flow a long-lived background asset worker already
    # drains the queue in parallel while detail fetch is still running.
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        sync_engine = session.get_bind()
        asyncio.run(
            drain_scraped_assets(run_code, sync_engine, max_workers=settings.image_concurrency)
        )


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
    from app.db.session import engine

    stale_cutoff = datetime.now() - timedelta(days=stale_threshold_days)

    # Build place_code → place_name mapping
    name_to_code: dict[str, str] = {}
    for place_name in place_ids:
        extracted_id = place_name[7:] if place_name.startswith("places/") else place_name
        name_to_code[place_name] = f"gplc_{extracted_id}"

    # Idempotency guard: select only place_code — never load raw_data (20-50 KB each)
    # Loading full rows here caused OOM on resumed country-level runs (40K × 30KB ≈ 1.2 GB).
    already_fetched_codes = set(
        session.exec(select(ScrapedPlace.place_code).where(ScrapedPlace.run_code == run_code)).all()
    )
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
        # Chunk into batches of 500 — a single IN(50K) clause causes the DB query planner
        # to abandon the index and do a full table scan, stalling country-level runs.
        _CACHE_CHUNK = 500
        for _ci in range(0, len(all_place_codes), _CACHE_CHUNK):
            _chunk = all_place_codes[_ci : _ci + _CACHE_CHUNK]
            for ep in session.exec(
                select(ScrapedPlace)
                .where(ScrapedPlace.place_code.in_(_chunk))
                .where(ScrapedPlace.created_at >= stale_cutoff)
                .order_by(desc(ScrapedPlace.created_at))
            ).all():
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
                raw_data=cached_place.raw_data or {},
                detail_fetch_status="success",
                lat=cached_place.lat,
                lng=cached_place.lng,
                rating=cached_place.rating,
                user_rating_count=cached_place.user_rating_count,
                google_place_id=cached_place.google_place_id,
                address=cached_place.address,
                religion=cached_place.religion,
                place_type=cached_place.place_type,
                business_status=cached_place.business_status,
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
    # Detail-fetch workers are sized by settings.detail_concurrency, but the
    # real active-navigation limit is the browser pool sem
    # (MAPS_BROWSER_CONCURRENCY). We cap at that so extra workers don't just
    # queue on pool.acquire() until the 90 s acquire timeout fires.
    concurrency = min(settings.detail_concurrency, settings.maps_browser_concurrency)
    fetch_sem = asyncio.Semaphore(concurrency)

    # Buffer and lock for thread-safe batch writes (asyncio is single-threaded,
    # but we still need the buffer list to be consistent across await points)
    buffer: list[tuple] = []

    asset_stop_event = asyncio.Event()
    asset_worker = asyncio.create_task(
        drain_scraped_assets(
            run_code, engine, max_workers=settings.image_concurrency, stop_event=asset_stop_event
        )
    )

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

        # Process to_fetch in bounded task batches — creating 50K+ futures at once causes
        # significant memory pressure (each coroutine holds a stack frame) and bloats the
        # event-loop task queue. Batching to _TASK_BATCH keeps at most that many tasks
        # in-flight; the semaphore still bounds actual API concurrency within each batch.
        _TASK_BATCH = 500
        processed_since_cancel_check = 0
        CANCEL_CHECK_INTERVAL = flush_batch_size * 3
        _cancelled = False

        # Per-place failure accumulator (P0.3). Persisted as ScrapedPlace stubs with
        # detail_fetch_status="failed" and enrichment_status="filtered" so downstream
        # enrichment skips them naturally. Track counts for the fail-fast check (P0.7).
        failed_buffer: list[tuple[str, str, str]] = []  # (place_name, place_code, error)
        attempted_total = 0
        failed_total = 0

        for _batch_start in range(0, len(to_fetch), _TASK_BATCH):
            if _cancelled:
                break
            _batch = to_fetch[_batch_start : _batch_start + _TASK_BATCH]
            tasks = [asyncio.ensure_future(_bounded_fetch(pn)) for pn in _batch]

            # Process results incrementally as they arrive — this makes processed_items
            # tick up in real time so the admin UI progress bar updates every batch.
            for coro in asyncio.as_completed(tasks):
                attempted_total += 1

                try:
                    result = await coro
                except Exception as exc:
                    logger.warning("Detail fetch task error: %s", exc)
                    counter.increment()
                    failed_total += 1
                    continue

                if isinstance(result, Exception):
                    logger.warning("Detail fetch task error: %s", result)
                    counter.increment()
                    failed_total += 1
                    continue

                place_name, details, response, error = result

                if error is not None:
                    logger.warning("Error fetching %s: %s", place_name, error)
                    counter.increment()
                    failed_total += 1
                    failed_buffer.append((place_name, name_to_code[place_name], error[:500]))
                    if len(failed_buffer) >= flush_batch_size:
                        _flush_failed_places_buffer(failed_buffer, run_code, session)
                        failed_buffer.clear()
                    if _should_fail_fast(attempted_total, failed_total):
                        for t in tasks:
                            t.cancel()
                        raise FailFastError(
                            f"Detail-fetch failure rate {failed_total}/{attempted_total} "
                            f"exceeded {int(_FAIL_FAST_FAILURE_RATIO * 100)}% after "
                            f"{attempted_total} attempts — auto-paused"
                        )
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
                        _cancelled = True
                        break

        if buffer:
            _flush_detail_buffer(buffer, run_code, session, run, counter, len(place_ids))
        if failed_buffer:
            _flush_failed_places_buffer(failed_buffer, run_code, session)
            failed_buffer.clear()

    asset_stop_event.set()
    await asset_worker

    logger.info(
        "=== Details Fetch Summary === fresh=%d  cached=%d  failed=%d  total=%d",
        counter.value - cached_count - failed_total,
        cached_count,
        failed_total,
        len(place_ids),
    )
