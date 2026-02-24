"""
Google Maps discovery scraper — quadtree search for places.

Detail-fetching has been moved to collectors/gmaps.py (GmapsCollector).
This module handles discovery (finding places) and orchestrating the initial
detail fetch during the scraper run.
"""

import math
import os
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta

import requests
from sqlmodel import Session, desc, select

from app.db.models import GeoBoundary, PlaceTypeMapping, RawCollectorData, ScrapedPlace, ScraperRun
from app.scrapers.base import AtomicCounter, ThreadSafeIdSet, get_rate_limiter

# Configuration
MIN_RADIUS = 500  # 2km minimum radius for quadtree subdivision
STALE_THRESHOLD_DAYS = 90  # Re-fetch place details if older than this


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


def get_places_in_circle(
    lat: float, lng: float, radius: float, place_types: list[str], api_key: str
) -> tuple[list[str], bool]:
    """
    Find all places of given types within radius using new Places API.
    Returns (list of place resource names, is_saturated).
    """
    url = "https://places.googleapis.com/v1/places:searchNearby"
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": "places.name",
    }
    body = {
        "includedTypes": place_types,
        "locationRestriction": {
            "circle": {"center": {"latitude": lat, "longitude": lng}, "radius": radius}
        },
        "maxResultCount": 20,
    }

    resp = requests.post(url, json=body, headers=headers)

    if resp.status_code != 200:
        error_data = resp.json() if resp.content else {}
        error_msg = error_data.get("error", {}).get("message", "Unknown error")
        raise Exception(f"Places API searchNearby failed (HTTP {resp.status_code}): {error_msg}")

    response = resp.json()
    places_data = response.get("places", [])
    place_resource_names = [p["name"] for p in places_data if "name" in p]

    is_saturated = len(place_resource_names) == 20

    return place_resource_names, is_saturated


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


def search_area(
    lat_min: float,
    lat_max: float,
    lng_min: float,
    lng_max: float,
    place_types: list[str],
    api_key: str,
    existing_ids: ThreadSafeIdSet,
    depth: int = 0,
    max_results: int | None = None,
    executor: ThreadPoolExecutor | None = None,
) -> list[str]:
    """
    Recursive quadtree search for places.

    At depth 0, the four quadrant sub-searches are submitted concurrently to
    the provided executor (if any).  Deeper levels run sequentially to avoid
    thread-pool exhaustion / deadlock.

    Returns list of unique place_ids found in this area.
    """
    indent = "  " * depth
    center_lat, center_lng, radius = calculate_search_radius(lat_min, lat_max, lng_min, lng_max)

    print(
        f"{indent}Searching area (lat: {lat_min:.4f}-{lat_max:.4f}, lng: {lng_min:.4f}-{lng_max:.4f}, radius: {radius:.0f}m, depth: {depth}, total: {len(existing_ids)})"
    )

    if max_results and len(existing_ids) >= max_results:
        print(f"{indent}Reached max_results limit ({max_results}), stopping recursion")
        return []

    if radius < MIN_RADIUS:
        print(f"{indent}Area too small (radius < {MIN_RADIUS}m), stopping recursion")
        return []

    get_rate_limiter().acquire("gmaps_search")
    place_ids, is_saturated = get_places_in_circle(
        center_lat, center_lng, radius, place_types, api_key
    )

    new_ids = existing_ids.add_new(place_ids)

    print(
        f"{indent}Found {len(place_ids)} places ({len(new_ids)} new), saturated: {is_saturated}, total: {len(existing_ids)}"
    )

    if max_results and len(existing_ids) >= max_results:
        print(f"{indent}Reached max_results limit ({max_results}) after this search")
        return new_ids

    if not is_saturated:
        return new_ids

    print(f"{indent}Area saturated, splitting into quadrants...")

    mid_lat = (lat_min + lat_max) / 2
    mid_lng = (lng_min + lng_max) / 2

    quadrants = [
        (lat_min, mid_lat, lng_min, mid_lng),  # SW
        (lat_min, mid_lat, mid_lng, lng_max),  # SE
        (mid_lat, lat_max, lng_min, mid_lng),  # NW
        (mid_lat, lat_max, mid_lng, lng_max),  # NE
    ]

    all_ids = list(new_ids)

    if executor is not None and depth == 0:
        # Parallelize only the first level of quadrant splitting.
        # Deeper levels run sequentially inside each worker to avoid deadlock
        # with a bounded thread pool.
        futures = []
        for q_lat_min, q_lat_max, q_lng_min, q_lng_max in quadrants:
            if max_results and len(existing_ids) >= max_results:
                print(f"{indent}Stopping quadrant submission - max_results ({max_results}) reached")
                break
            f = executor.submit(
                search_area,
                q_lat_min,
                q_lat_max,
                q_lng_min,
                q_lng_max,
                place_types,
                api_key,
                existing_ids,
                depth + 1,
                max_results,
                None,  # no executor at deeper levels
            )
            futures.append(f)

        for future in as_completed(futures):
            try:
                quadrant_ids = future.result()
                all_ids.extend(quadrant_ids)
            except Exception as e:
                print(f"{indent}Quadrant search failed: {e}")
    else:
        # Sequential fallback (depth > 0 or no executor)
        for q_lat_min, q_lat_max, q_lng_min, q_lng_max in quadrants:
            if max_results and len(existing_ids) >= max_results:
                print(f"{indent}Stopping quadrant recursion - max_results ({max_results}) reached")
                break

            quadrant_ids = search_area(
                q_lat_min,
                q_lat_max,
                q_lng_min,
                q_lng_max,
                place_types,
                api_key,
                existing_ids,
                depth + 1,
                max_results,
                None,
            )
            all_ids.extend(quadrant_ids)

    return all_ids


def _flush_detail_buffer(
    buffer: list[tuple],
    run_code: str,
    session: Session,
    run: ScraperRun,
    counter: AtomicCounter,
    total: int,
) -> None:
    """Batch-write a buffer of fetched place details to the database."""
    for _place_name, details, response in buffer:
        scraped_place = ScrapedPlace(
            run_code=run_code,
            place_code=details["place_code"],
            name=details["name"],
            raw_data=details,
        )
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
    print(f"  Flushed {len(buffer)} places ({new_count}/{total} total)")


def run_gmaps_scraper(run_code: str, config: dict, session: Session):
    """
    Runs the Google Maps scraper with quadtree search and cross-run deduplication.
    Uses GmapsCollector for detail fetching with enhanced field mask.

    Discovery phase uses a parallel quadtree search (4 workers).
    Detail fetching uses a parallel ThreadPoolExecutor (5 workers) with
    batch DB commits every 10 places.
    """
    from app.collectors.gmaps import GmapsCollector

    city = config.get("city")
    country = config.get("country")
    max_results = config.get("max_results")
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

    religion_types_map = {}
    for mapping in place_type_mappings:
        if mapping.religion not in religion_types_map:
            religion_types_map[mapping.religion] = []
        religion_types_map[mapping.religion].append(mapping.gmaps_type)

    print(f"\n=== Searching for religious places in {boundary_name} ===")
    print(f"Place types: {all_gmaps_types}")
    for religion, types in religion_types_map.items():
        print(f"  {religion}: {types}")

    # Pre-load type maps once so workers don't need a DB session
    type_map = get_gmaps_type_to_our_type(session)
    religion_type_map = {m.gmaps_type: m.religion for m in place_type_mappings}

    # ── Discovery phase: parallel quadtree search ──────────────────────────────
    print("\n--- Starting recursive quadtree search (parallel depth-0 quadrants) ---")
    if max_results:
        print(f"Max results limit: {max_results}")
    existing_ids = ThreadSafeIdSet()

    with ThreadPoolExecutor(max_workers=4) as discovery_executor:
        place_ids = search_area(
            boundary.lat_min,
            boundary.lat_max,
            boundary.lng_min,
            boundary.lng_max,
            all_gmaps_types,
            api_key,
            existing_ids,
            depth=0,
            max_results=max_results,
            executor=discovery_executor,
        )

    print("\n=== Search Summary ===")
    print(f"Total unique places found: {len(place_ids)}")
    if max_results and len(place_ids) >= max_results:
        print(f"Stopped early due to max_results limit ({max_results})")

    run.total_items = len(place_ids)
    session.add(run)
    session.commit()

    # ── Detail fetching: bulk cache lookup + parallel fetch ────────────────────
    print(f"\nFetching details for {len(place_ids)} places...")

    collector = GmapsCollector()
    stale_cutoff = datetime.now() - timedelta(days=stale_threshold_days)

    # Build place_code → place_name mapping
    name_to_code: dict[str, str] = {}
    for place_name in place_ids:
        extracted_id = place_name[7:] if place_name.startswith("places/") else place_name
        name_to_code[place_name] = f"gplc_{extracted_id}"

    # Single bulk query for cached places
    cached_places: dict[str, ScrapedPlace] = {}
    if not force_refresh:
        print(f"Checking for cached places (fresher than {stale_threshold_days} days)...")
        all_place_codes = list(name_to_code.values())
        existing = session.exec(
            select(ScrapedPlace)
            .where(ScrapedPlace.place_code.in_(all_place_codes))
            .where(ScrapedPlace.created_at >= stale_cutoff)
            .order_by(desc(ScrapedPlace.created_at))
        ).all()
        # Keep most-recent entry per place_code (ORDER BY desc ensures first = most recent)
        for ep in existing:
            if ep.place_code not in cached_places:
                cached_places[ep.place_code] = ep
        print(
            f"Found {len(cached_places)} cached places, will fetch {len(place_ids) - len(cached_places)} fresh"
        )

    # Process cached places immediately (no API call)
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
        session.commit()
        print(f"  Stored {cached_count} cached places")

    # Parallel fetch for places that need fresh details
    to_fetch = [
        pn for pn in place_ids if not (name_to_code[pn] in cached_places and not force_refresh)
    ]

    if not to_fetch:
        print("\n=== Details Fetch Summary ===")
        print("Fresh fetches: 0")
        print(f"Cached reuses: {cached_count}")
        print(f"Total: {len(place_ids)}")
        return

    rate_limiter = get_rate_limiter()
    counter = AtomicCounter(initial=cached_count)
    BATCH_SIZE = 10

    def _fetch_worker(place_name: str) -> tuple[str, dict, dict, str | None]:
        """Fetch place details in a worker thread (no DB access)."""
        try:
            place_code = name_to_code[place_name]
            rate_limiter.acquire("gmaps_details")
            response = collector._fetch_details(place_name, api_key)
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

    buffer: list[tuple] = []

    with ThreadPoolExecutor(max_workers=5) as detail_executor:
        futures = {detail_executor.submit(_fetch_worker, pn): pn for pn in to_fetch}

        for future in as_completed(futures):
            # Cancellation check
            session.expire(run)
            session.refresh(run)
            if run.status == "cancelled":
                print(f"Run {run_code} was cancelled during detail fetching")
                detail_executor.shutdown(wait=False)
                return

            place_name, details, response, error = future.result()

            if error:
                print(f"  Error fetching {place_name}: {error}")
                counter.increment()
                continue

            buffer.append((place_name, details, response))

            if len(buffer) >= BATCH_SIZE:
                _flush_detail_buffer(buffer, run_code, session, run, counter, len(place_ids))
                buffer.clear()

    # Flush any remaining items
    if buffer:
        _flush_detail_buffer(buffer, run_code, session, run, counter, len(place_ids))

    print("\n=== Details Fetch Summary ===")
    print(f"Fresh fetches: {counter.value - cached_count}")
    print(f"Cached reuses: {cached_count}")
    print(f"Total: {len(place_ids)}")
