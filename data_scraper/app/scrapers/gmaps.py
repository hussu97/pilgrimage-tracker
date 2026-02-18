import base64
import math
import os
import re
import time
from datetime import datetime, timedelta

import requests
from sqlmodel import Session, desc, select

from app.db.models import GeoBoundary, PlaceTypeMapping, ScrapedPlace, ScraperRun

# Configuration
MIN_RADIUS = 2000  # 2km minimum radius for quadtree subdivision
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

    Args:
        time_str: Time string in 12h format (e.g., "9:00 AM - 5:00 PM")

    Returns:
        Time string in 24h format (e.g., "09:00-17:00") in local time,
        or comma-separated slots (e.g., "09:00-12:00, 14:00-18:00") for multi-slot days.
    """
    if "open 24 hours" in time_str.lower():
        return "00:00-23:59"
    if "closed" in time_str.lower():
        return "Closed"

    # Split on commas to handle multi-slot days
    segments = [s.strip() for s in time_str.split(",")]
    normalized_segments = []

    for segment in segments:
        times = re.split(r" – | - | to ", segment.replace("\u202f", " ").strip())
        if len(times) != 2:
            return time_str  # Return original if any segment is unparseable

        local_times = []
        for t in times:
            try:
                dt = datetime.strptime(t.strip(), "%I:%M %p")
                local_times.append(dt.strftime("%H:%M"))
            except ValueError:
                return time_str  # Return original if any time is unparseable

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
    is_saturated=True when exactly 20 results returned (API max without pagination).
    """
    url = "https://places.googleapis.com/v1/places:searchNearby"
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": "places.name",  # Request resource name (e.g., "places/ChIJ...")
    }
    body = {
        "includedTypes": place_types,
        "locationRestriction": {
            "circle": {"center": {"latitude": lat, "longitude": lng}, "radius": radius}
        },
        "maxResultCount": 20,
    }

    resp = requests.post(url, json=body, headers=headers)

    # Check for errors
    if resp.status_code != 200:
        error_data = resp.json() if resp.content else {}
        error_msg = error_data.get("error", {}).get("message", "Unknown error")
        raise Exception(f"Places API searchNearby failed (HTTP {resp.status_code}): {error_msg}")

    response = resp.json()
    places_data = response.get("places", [])
    place_resource_names = [p["name"] for p in places_data if "name" in p]  # Extract resource name

    # Saturated if we got exactly max results (no pagination available)
    is_saturated = len(place_resource_names) == 20

    return place_resource_names, is_saturated


def get_place_details(place_name: str, api_key: str, session: Session) -> dict:
    """
    Fetch detailed information for a single place using new Places API.
    Auto-detects religion from types.
    Uses field masks to optimize cost: Basic + Contact + Atmosphere tiers.

    Args:
        place_name: Place resource name (format: "places/ChIJ...") from searchNearby
        api_key: Google Maps API key
        session: Database session for querying place type mappings
    """
    url = f"https://places.googleapis.com/v1/{place_name}"
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": ",".join(
            [
                # Basic tier (free)
                "name",
                "id",
                "displayName",
                "formattedAddress",
                "location",
                "types",
                "photos",
                "businessStatus",
                # Contact tier ($0.003)
                "regularOpeningHours",
                "websiteUri",
                "utcOffsetMinutes",
                # Atmosphere tier ($0.005)
                "rating",
                "userRatingCount",
                "reviews",
                "accessibilityOptions",
                "editorialSummary",
            ]
        ),
        "languageCode": "en",
    }
    resp = requests.get(url, headers=headers)

    # Check for errors
    if resp.status_code != 200:
        error_data = resp.json() if resp.content else {}
        error_msg = error_data.get("error", {}).get("message", "Unknown error")
        raise Exception(
            f"Places API get place details failed (HTTP {resp.status_code}): {error_msg}"
        )

    response = resp.json()

    # Process images (up to 3)
    # New API uses photos[].name as resource path (e.g., "places/ChIJ.../photos/...")
    photo_urls = []
    image_blobs = []
    download_failures = []

    for photo in response.get("photos", [])[:3]:
        photo_name = photo.get("name")
        if not photo_name:
            continue

        # Construct photo URL using new API format
        photo_url = (
            f"https://places.googleapis.com/v1/{photo_name}/media?maxWidthPx=800&key={api_key}"
        )
        photo_urls.append(photo_url)

        # Download the image as blob
        try:
            resp = requests.get(photo_url, timeout=15)
            if resp.status_code == 200:
                mime = resp.headers.get("Content-Type", "image/jpeg")
                image_blobs.append(
                    {
                        "data": base64.b64encode(resp.content).decode("ascii"),
                        "mime_type": mime,
                    }
                )
            else:
                download_failures.append(photo_url)
        except Exception as e:
            print(f"Failed to download image {photo_url}: {e}")
            download_failures.append(photo_url)

    # Process external reviews (up to 5)
    # New API format: reviews[].text.text, reviews[].rating, etc.
    external_reviews = []
    for review in response.get("reviews", [])[:5]:
        review_text = review.get("text", {})
        if isinstance(review_text, dict):
            review_text = review_text.get("text", "")

        author_name = review.get("authorAttribution", {}).get("displayName", "")

        # publishTime is ISO format string, convert to unix timestamp
        publish_time = review.get("publishTime", "")
        time_unix = 0
        try:
            if publish_time:
                dt = datetime.fromisoformat(publish_time.replace("Z", "+00:00"))
                time_unix = int(dt.timestamp())
        except Exception:
            pass

        external_reviews.append(
            {
                "author_name": author_name,
                "rating": review.get("rating", 0),
                "text": review_text,
                "time": time_unix,
                "relative_time_description": review.get("relativePublishTimeDescription", ""),
                "language": "en",  # New API doesn't provide language
            }
        )

    # Build attributes for API ingestion
    attributes = []

    # Wheelchair accessibility (new API uses accessibilityOptions object)
    accessibility = response.get("accessibilityOptions", {})
    wheelchair = accessibility.get("wheelchairAccessibleEntrance")
    if wheelchair is not None:
        attributes.append({"attribute_code": "wheelchair_accessible", "value": wheelchair})

    # Rating and reviews
    rating = response.get("rating")
    if rating:
        attributes.append({"attribute_code": "rating", "value": rating})

    reviews_count = response.get("userRatingCount")
    if reviews_count:
        attributes.append({"attribute_code": "reviews_count", "value": reviews_count})

    # Process opening hours (new API format: regularOpeningHours.weekdayDescriptions)
    opening_hours_data = response.get("regularOpeningHours", {})
    opening_hours = {}
    weekday_descriptions = opening_hours_data.get("weekdayDescriptions", [])
    if weekday_descriptions:
        # Convert new format to legacy format for process_weekly_hours
        legacy_format = {"weekday_text": weekday_descriptions}
        opening_hours = process_weekly_hours(legacy_format)
    else:
        opening_hours = dict.fromkeys(
            ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
            "Hours not available",
        )

    # Extract place_id from resource name (e.g., "places/ChIJ..." -> "ChIJ...")
    # The place_name parameter is already the resource name from searchNearby
    if place_name.startswith("places/"):
        extracted_place_id = place_name[7:]  # Remove "places/" prefix
    else:
        extracted_place_id = place_name

    # Generate stable place_code from place_id
    place_code = f"gplc_{extracted_place_id}"

    # Build place data
    # Auto-detect religion and place_type from the result's types array
    result_types = response.get("types", [])

    # Detect religion first
    religion = detect_religion_from_types(session, result_types)
    if not religion:
        # Fallback if no religion detected (shouldn't happen for scraped religious places)
        print(
            f"Warning: Could not detect religion for place {extracted_place_id} with types: {result_types}"
        )
        religion = "unknown"

    # Detect our internal place_type name
    place_type_name = "place of worship"  # default fallback
    gmaps_type_map = get_gmaps_type_to_our_type(session)
    for gmaps_type in result_types:
        if gmaps_type in gmaps_type_map:
            place_type_name = gmaps_type_map[gmaps_type]
            break

    # Get editorial summary (new API format: editorialSummary.text)
    editorial_summary = response.get("editorialSummary", {})
    if isinstance(editorial_summary, dict):
        editorial = editorial_summary.get("text", "")
    else:
        editorial = ""

    formatted_address = response.get("formattedAddress", "")
    if editorial:
        description = editorial
    else:
        # Fallback: generate a basic description
        description = f"A {place_type_name} located in {clean_address(formatted_address)}."

    # Decide whether to use blobs or URLs based on download success
    # Only use blobs if ALL images were successfully downloaded
    use_blobs = len(image_blobs) == len(photo_urls) and len(photo_urls) > 0

    # Extract lat/lng from location object
    location = response.get("location", {})
    lat = location.get("latitude", 0)
    lng = location.get("longitude", 0)

    # Get display name (new API format)
    display_name = response.get("displayName", {})
    if isinstance(display_name, dict):
        name = display_name.get("text", "N/A")
    else:
        name = "N/A"

    # Website URI
    website_url = response.get("websiteUri", "")

    # Business status
    business_status = response.get("businessStatus", "N/A")

    # UTC offset — use Google's value; fall back to SCRAPER_TIMEZONE env var if absent
    utc_offset_minutes = response.get("utcOffsetMinutes")
    if utc_offset_minutes is None:
        scraper_tz = os.environ.get("SCRAPER_TIMEZONE")
        if scraper_tz:
            try:
                from datetime import datetime as _dt
                from zoneinfo import ZoneInfo

                utc_offset_minutes = int(
                    _dt.now(ZoneInfo(scraper_tz)).utcoffset().total_seconds() / 60
                )
            except Exception:
                pass

    place_data = {
        "place_code": place_code,
        "name": name,
        "religion": religion,
        "place_type": place_type_name,
        "lat": lat,
        "lng": lng,
        "address": clean_address(formatted_address),
        "image_urls": [] if use_blobs else photo_urls,  # Empty if using blobs
        "image_blobs": image_blobs if use_blobs else [],  # Empty if using URLs
        "description": description,
        "website_url": website_url,
        "opening_hours": opening_hours,
        "utc_offset_minutes": utc_offset_minutes,
        "attributes": attributes,
        "external_reviews": external_reviews,
        "source": "gmaps",
        # Additional metadata
        "vicinity": formatted_address,  # New API doesn't have vicinity, use full address
        "business_status": business_status,
        "google_place_id": extracted_place_id,
    }

    return place_data


def calculate_search_radius(
    lat_min: float, lat_max: float, lng_min: float, lng_max: float
) -> tuple[float, float, float]:
    """
    Calculate the center point and radius to cover a bounding box.
    Returns (center_lat, center_lng, radius_meters).
    """
    center_lat = (lat_min + lat_max) / 2
    center_lng = (lng_min + lng_max) / 2

    # Calculate diagonal distance in meters (approximation)
    # 1 degree latitude ≈ 111km, 1 degree longitude varies by latitude
    lat_diff = abs(lat_max - lat_min) * 111000  # meters
    lng_diff = abs(lng_max - lng_min) * 111000 * abs(math.cos(math.radians(center_lat)))

    # Diagonal of the box
    diagonal = math.sqrt(lat_diff**2 + lng_diff**2)

    # Radius is half the diagonal (to cover the entire box from center)
    radius = diagonal / 2

    return center_lat, center_lng, radius


def search_area(
    lat_min: float,
    lat_max: float,
    lng_min: float,
    lng_max: float,
    place_types: list[str],
    api_key: str,
    existing_ids: set,
    depth: int = 0,
    max_results: int | None = None,
) -> list[str]:
    """
    Recursive quadtree search for places.
    Returns list of unique place_ids found in this area.

    Args:
        lat_min, lat_max, lng_min, lng_max: Bounding box
        place_types: List of Google Maps types to search for
        api_key: Google Maps API key
        existing_ids: Set of place IDs already found (for deduplication)
        depth: Recursion depth for logging
        max_results: Optional limit on total results (stops recursion when reached)
    """
    indent = "  " * depth
    center_lat, center_lng, radius = calculate_search_radius(lat_min, lat_max, lng_min, lng_max)

    print(
        f"{indent}Searching area (lat: {lat_min:.4f}-{lat_max:.4f}, lng: {lng_min:.4f}-{lng_max:.4f}, radius: {radius:.0f}m, depth: {depth}, total: {len(existing_ids)})"
    )

    # Stop recursing if we've reached the max_results limit
    if max_results and len(existing_ids) >= max_results:
        print(f"{indent}Reached max_results limit ({max_results}), stopping recursion")
        return []

    # Stop recursing if area is too small
    if radius < MIN_RADIUS:
        print(f"{indent}Area too small (radius < {MIN_RADIUS}m), stopping recursion")
        return []

    # Search this area
    place_ids, is_saturated = get_places_in_circle(
        center_lat, center_lng, radius, place_types, api_key
    )
    time.sleep(0.5)  # Rate limiting

    # Filter out already-known places
    new_ids = [pid for pid in place_ids if pid not in existing_ids]
    existing_ids.update(new_ids)

    print(
        f"{indent}Found {len(place_ids)} places ({len(new_ids)} new), saturated: {is_saturated}, total: {len(existing_ids)}"
    )

    # Check if we've exceeded max_results after this search
    if max_results and len(existing_ids) >= max_results:
        print(f"{indent}Reached max_results limit ({max_results}) after this search")
        return new_ids

    # If not saturated, we're done with this area
    if not is_saturated:
        return new_ids

    # If saturated, split into 4 quadrants and recurse
    print(f"{indent}Area saturated, splitting into quadrants...")

    mid_lat = (lat_min + lat_max) / 2
    mid_lng = (lng_min + lng_max) / 2

    quadrants = [
        (lat_min, mid_lat, lng_min, mid_lng),  # SW
        (lat_min, mid_lat, mid_lng, lng_max),  # SE
        (mid_lat, lat_max, lng_min, mid_lng),  # NW
        (mid_lat, lat_max, mid_lng, lng_max),  # NE
    ]

    all_ids = list(new_ids)  # Start with IDs from this level

    for q_lat_min, q_lat_max, q_lng_min, q_lng_max in quadrants:
        # Stop recursing into more quadrants if we've hit the limit
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
        )
        all_ids.extend(quadrant_ids)

    return all_ids


def run_gmaps_scraper(run_code: str, config: dict, session: Session):
    """
    Runs the Google Maps scraper with quadtree search and cross-run deduplication.
    Automatically searches for ALL active place types from the database.
    config must contain ('country' OR 'city').
    Optional: 'max_results' to limit for testing, 'force_refresh' to ignore cache.
    """
    city = config.get("city")
    country = config.get("country")
    max_results = config.get("max_results")
    force_refresh = config.get("force_refresh", False)
    stale_threshold_days = config.get("stale_threshold_days", STALE_THRESHOLD_DAYS)

    if not city and not country:
        raise ValueError("Either city or country required in config")

    # Get API key from environment
    api_key = os.environ.get("GOOGLE_MAPS_API_KEY", "")
    if not api_key:
        raise ValueError("GOOGLE_MAPS_API_KEY environment variable not set")

    run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
    if not run:
        raise ValueError(f"Run {run_code} not found")

    # Look up geographic boundary from DB
    boundary_name = city if city else country
    boundary = session.exec(select(GeoBoundary).where(GeoBoundary.name == boundary_name)).first()
    if not boundary:
        raise ValueError(f"Geographic boundary not found for: {boundary_name}")

    # Step 1: Query all active place type mappings from DB
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

    # Collect all gmaps_types into a single list (Phase 1: multi-type search)
    all_gmaps_types = [m.gmaps_type for m in place_type_mappings]

    # Group by religion for logging
    religion_types_map = {}
    for mapping in place_type_mappings:
        if mapping.religion not in religion_types_map:
            religion_types_map[mapping.religion] = []
        religion_types_map[mapping.religion].append(mapping.gmaps_type)

    print(f"\n=== Searching for religious places in {boundary_name} ===")
    print(f"Place types: {all_gmaps_types}")
    for religion, types in religion_types_map.items():
        print(f"  {religion}: {types}")

    # Step 2: Recursive quadtree search for all types at once (Phase 1 + Phase 2)
    print("\n--- Starting recursive quadtree search ---")
    if max_results:
        print(f"Max results limit: {max_results}")
    existing_ids = set()
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
    )

    print("\n=== Search Summary ===")
    print(f"Total unique places found: {len(place_ids)}")
    if max_results and len(place_ids) >= max_results:
        print(f"Stopped early due to max_results limit ({max_results})")

    run.total_items = len(place_ids)
    session.add(run)
    session.commit()

    # Step 3: Fetch details with cross-run deduplication (Phase 3)
    print(f"\nFetching details for {len(place_ids)} places...")

    # Build a map of existing places for deduplication
    stale_cutoff = datetime.now() - timedelta(days=stale_threshold_days)
    cached_places = {}

    if not force_refresh:
        print(f"Checking for cached places (fresher than {stale_threshold_days} days)...")
        for place_name in place_ids:
            # Extract place ID from resource name (e.g., "places/ChIJ..." -> "ChIJ...")
            extracted_id = place_name[7:] if place_name.startswith("places/") else place_name
            place_code = f"gplc_{extracted_id}"
            existing = session.exec(
                select(ScrapedPlace)
                .where(ScrapedPlace.place_code == place_code)
                .where(ScrapedPlace.created_at >= stale_cutoff)
                .order_by(desc(ScrapedPlace.created_at))
            ).first()

            if existing:
                cached_places[place_name] = existing

        print(
            f"Found {len(cached_places)} cached places, will fetch {len(place_ids) - len(cached_places)} fresh"
        )

    fetched_count = 0
    cached_count = 0

    for i, place_name in enumerate(place_ids):
        # Check for cancellation
        session.expire(run)
        session.refresh(run)
        if run.status == "cancelled":
            print(f"Run {run_code} was cancelled at place {i}")
            return

        try:
            # Check if we have a cached version (Phase 3 deduplication)
            if place_name in cached_places and not force_refresh:
                cached_place = cached_places[place_name]
                # Reuse cached data but associate with current run
                scraped_place = ScrapedPlace(
                    run_code=run_code,
                    place_code=cached_place.place_code,
                    name=cached_place.name,
                    raw_data=cached_place.raw_data,
                )
                session.add(scraped_place)
                session.commit()

                cached_count += 1
                print(f"  [{i + 1}/{len(place_ids)}] {cached_place.name} (cached)")
            else:
                # Fetch fresh details
                details = get_place_details(place_name, api_key, session)

                scraped_place = ScrapedPlace(
                    run_code=run_code,
                    place_code=details["place_code"],
                    name=details["name"],
                    raw_data=details,
                )
                session.add(scraped_place)
                session.commit()

                fetched_count += 1
                print(f"  [{i + 1}/{len(place_ids)}] {details['name']} (fresh)")
                time.sleep(0.5)  # Rate limiting

            run.processed_items = i + 1
            session.add(run)
            session.commit()

        except Exception as e:
            print(f"  [{i + 1}/{len(place_ids)}] Error: {e}")
            continue

    print("\n=== Details Fetch Summary ===")
    print(f"Fresh fetches: {fetched_count}")
    print(f"Cached reuses: {cached_count}")
    print(f"Total: {len(place_ids)}")
