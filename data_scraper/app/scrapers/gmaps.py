import requests
import time
import re
import os
import base64
from datetime import datetime, timedelta
from typing import List, Dict, Optional
from sqlmodel import Session, select
from app.db.models import ScraperRun, ScrapedPlace, GeoBoundary, PlaceTypeMapping

# Configuration
SEARCH_RADIUS = 10000  # 10km radius per grid point
STEP = 0.1  # Approx 11km per step to ensure overlap


def get_place_type_mappings(session: Session) -> Dict[str, List[str]]:
    """
    Query database for active place type mappings.
    Returns a dict mapping religion to list of Google Maps types.
    """
    mappings = session.exec(
        select(PlaceTypeMapping)
        .where(PlaceTypeMapping.is_active == True)
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


def get_gmaps_type_to_our_type(session: Session) -> Dict[str, str]:
    """
    Query database for active place type mappings.
    Returns a dict mapping Google Maps type to our internal type name.
    """
    mappings = session.exec(
        select(PlaceTypeMapping)
        .where(PlaceTypeMapping.is_active == True)
        .where(PlaceTypeMapping.source_type == "gmaps")
    ).all()

    return {m.gmaps_type: m.our_place_type for m in mappings}


def get_default_place_type(session: Session, religion: str) -> str:
    """Get the default place type name for a religion (first active mapping)."""
    mapping = session.exec(
        select(PlaceTypeMapping)
        .where(PlaceTypeMapping.religion == religion)
        .where(PlaceTypeMapping.is_active == True)
        .where(PlaceTypeMapping.source_type == "gmaps")
        .order_by(PlaceTypeMapping.display_order)
    ).first()

    return mapping.our_place_type if mapping else "place of worship"


def detect_religion_from_types(session: Session, gmaps_types: List[str]) -> Optional[str]:
    """Detect religion from Google Maps types by querying active mappings."""
    for gmaps_type in gmaps_types:
        mapping = session.exec(
            select(PlaceTypeMapping)
            .where(PlaceTypeMapping.gmaps_type == gmaps_type)
            .where(PlaceTypeMapping.is_active == True)
            .where(PlaceTypeMapping.source_type == "gmaps")
        ).first()
        if mapping:
            return mapping.religion
    return None

def clean_address(address):
    """Removes Google Plus Codes from address."""
    return re.sub(r'^[A-Z0-9]{4}\+[A-Z0-9]{2,3}\s*(-\s*)?', '', address).strip()

def convert_to_utc_24h(time_str):
    """Converts local UAE time string (12h) to UTC time string (24h)."""
    if "open 24 hours" in time_str.lower():
        return "00:00-23:59"
    if "closed" in time_str.lower():
        return "Closed"

    times = re.split(r' – | - | to ', time_str.replace('\u202f', ' ').strip())
    if len(times) != 2:
        return time_str

    utc_times = []
    for t in times:
        try:
            dt = datetime.strptime(t.strip(), "%I:%M %p")
            utc_dt = dt - timedelta(hours=4)
            utc_times.append(utc_dt.strftime("%H:%M"))
        except ValueError:
            return time_str

    return f"{utc_times[0]}-{utc_times[1]}"

def process_weekly_hours(opening_hours_dict):
    """Returns a dictionary with a key for each day of the week in UTC."""
    schedule = {day: "Hours not available" for day in
                ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]}

    weekday_text = opening_hours_dict.get("weekday_text", [])
    for day_string in weekday_text:
        parts = day_string.split(": ", 1)
        if len(parts) == 2:
            day, hours_str = parts[0], parts[1]
            schedule[day] = convert_to_utc_24h(hours_str)

    return schedule

def get_places_in_circle(lat: float, lng: float, place_type: str, api_key: str) -> List[str]:
    """Find all places of a given type within radius."""
    url = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
    places = []
    params = {
        "location": f"{lat},{lng}",
        "radius": SEARCH_RADIUS,
        "type": place_type,
        "key": api_key
    }

    while True:
        response = requests.get(url, params=params).json()
        if "results" in response:
            for place in response["results"]:
                places.append(place["place_id"])

        next_page_token = response.get("next_page_token")
        if next_page_token:
            params["pagetoken"] = next_page_token
            time.sleep(2)
        else:
            break
    return places

def get_place_details(place_id: str, api_key: str, session: Session) -> Dict:
    """Fetch detailed information for a single place. Auto-detects religion from types."""
    url = "https://maps.googleapis.com/maps/api/place/details/json"

    fields = "name,formatted_address,vicinity,geometry,opening_hours,wheelchair_accessible_entrance,rating,user_ratings_total,url,photos,business_status,reviews,editorial_summary,types"
    params = {
        "place_id": place_id,
        "fields": fields,
        "language": "en",
        "key": api_key
    }

    response = requests.get(url, params=params).json()
    result = response.get("result", {})

    # Process images (up to 3)
    photo_urls = []
    image_blobs = []
    for photo in result.get("photos", [])[:3]:
        ref = photo.get("photo_reference")
        url = f"https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference={ref}&key={api_key}"
        photo_urls.append(url)

        # Download the image as blob
        try:
            resp = requests.get(url, timeout=15)
            if resp.status_code == 200:
                mime = resp.headers.get("Content-Type", "image/jpeg")
                image_blobs.append({
                    "data": base64.b64encode(resp.content).decode("ascii"),
                    "mime_type": mime,
                })
        except Exception as e:
            print(f"Failed to download image {url}: {e}")
            pass

    # Process external reviews (up to 5)
    external_reviews = []
    for review in result.get("reviews", [])[:5]:
        external_reviews.append({
            "author_name": review.get("author_name", ""),
            "rating": review.get("rating", 0),
            "text": review.get("text", ""),
            "time": review.get("time", 0),
            "relative_time_description": review.get("relative_time_description", ""),
            "language": review.get("language", "en"),
        })

    # Build attributes for API ingestion
    attributes = []

    # Wheelchair accessibility
    wheelchair = result.get("wheelchair_accessible_entrance")
    if wheelchair is not None:
        attributes.append({"attribute_code": "wheelchair_accessible", "value": wheelchair})

    # Rating and reviews
    rating = result.get("rating")
    if rating:
        attributes.append({"attribute_code": "rating", "value": rating})

    reviews_count = result.get("user_ratings_total")
    if reviews_count:
        attributes.append({"attribute_code": "reviews_count", "value": reviews_count})

    # Process opening hours
    opening_hours = process_weekly_hours(result.get("opening_hours", {}))

    # Generate stable place_code from place_id
    place_code = f"gplc_{place_id}"

    # Build place data
    # Auto-detect religion and place_type from the result's types array
    result_types = result.get("types", [])

    # Detect religion first
    religion = detect_religion_from_types(session, result_types)
    if not religion:
        # Fallback if no religion detected (shouldn't happen for scraped religious places)
        print(f"Warning: Could not detect religion for place {place_id} with types: {result_types}")
        religion = "unknown"

    # Detect our internal place_type name
    place_type_name = "place of worship"  # default fallback
    gmaps_type_map = get_gmaps_type_to_our_type(session)
    for gmaps_type in result_types:
        if gmaps_type in gmaps_type_map:
            place_type_name = gmaps_type_map[gmaps_type]
            break

    # Get editorial summary for better description
    editorial = result.get("editorial_summary", {}).get("overview", "")
    if editorial:
        description = editorial
    else:
        # Fallback: generate a basic description
        description = f"A {place_type_name} located in {clean_address(result.get('formatted_address', ''))}."

    place_data = {
        "place_code": place_code,
        "name": result.get("name", "N/A"),
        "religion": religion,
        "place_type": place_type_name,
        "lat": result.get("geometry", {}).get("location", {}).get("lat", 0),
        "lng": result.get("geometry", {}).get("location", {}).get("lng", 0),
        "address": clean_address(result.get("formatted_address", "")),
        "image_urls": photo_urls,
        "image_blobs": image_blobs,
        "description": description,
        "website_url": result.get("url", ""),
        "opening_hours": opening_hours,
        "attributes": attributes,
        "external_reviews": external_reviews,
        "source": "gmaps",
        # Additional metadata
        "vicinity": result.get("vicinity", "N/A"),
        "business_status": result.get("business_status", "N/A"),
        "google_place_id": place_id,
    }

    return place_data

def search_grid(lat_min: float, lat_max: float, lng_min: float, lng_max: float, place_type: str, api_key: str, max_results: Optional[int] = None) -> List[str]:
    """Grid search over a geographic area for a given place type."""
    print(f"Searching area (lat: {lat_min}-{lat_max}, lng: {lng_min}-{lng_max}) for {place_type}...")
    unique_place_ids = set()

    lat = lat_min
    while lat <= lat_max:
        lng = lng_min
        while lng <= lng_max:
            print('Searching:',lat,':',lng)
            unique_place_ids.update(get_places_in_circle(lat, lng, place_type, api_key))
            # Check if we've reached the limit
            if max_results and len(unique_place_ids) >= max_results:
                print(f"Reached max_results limit: {max_results}")
                return list(unique_place_ids)[:max_results]

            time.sleep(0.5)  # Rate limiting
            lng += STEP
        lat += STEP

    print(f"Found {len(unique_place_ids)} unique places")
    return list(unique_place_ids)

def run_gmaps_scraper(run_code: str, config: dict, session: Session):
    """
    Runs the Google Maps grid scraper.
    Automatically searches for ALL active place types from the database.
    config must contain ('country' OR 'city').
    Optional: 'max_results' to limit for testing.
    """
    city = config.get("city")
    country = config.get("country")
    max_results = config.get("max_results")

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
        .where(PlaceTypeMapping.is_active == True)
        .where(PlaceTypeMapping.source_type == "gmaps")
        .order_by(PlaceTypeMapping.religion)
        .order_by(PlaceTypeMapping.display_order)
    ).all()

    if not place_type_mappings:
        raise ValueError("No active place type mappings found in database. Please seed PlaceTypeMapping table.")

    # Group by religion for logging
    religion_types_map = {}
    for mapping in place_type_mappings:
        if mapping.religion not in religion_types_map:
            religion_types_map[mapping.religion] = []
        religion_types_map[mapping.religion].append(mapping.gmaps_type)

    print(f"\n=== Searching for religious places in {boundary_name} ===")
    for religion, types in religion_types_map.items():
        print(f"  {religion}: {types}")

    # Step 2: Search for all place types
    all_place_ids = set()
    religions_found = {}

    for mapping in place_type_mappings:
        gmaps_type = mapping.gmaps_type
        religion = mapping.religion

        print(f"\n--- Searching for {religion} type: {gmaps_type} ---")
        type_place_ids = search_grid(
            boundary.lat_min, boundary.lat_max, boundary.lng_min, boundary.lng_max,
            gmaps_type, api_key, None  # Don't limit per type
        )

        new_ids = set(type_place_ids) - all_place_ids
        all_place_ids.update(type_place_ids)

        if religion not in religions_found:
            religions_found[religion] = 0
        religions_found[religion] += len(new_ids)

        print(f"Found {len(type_place_ids)} places for {gmaps_type} ({len(new_ids)} new), total unique: {len(all_place_ids)}")

        # Check if we've reached the overall limit
        if max_results and len(all_place_ids) >= max_results:
            print(f"Reached max_results limit: {max_results}")
            break

    # Apply max_results limit if specified
    place_ids = list(all_place_ids)
    if max_results and len(place_ids) > max_results:
        place_ids = place_ids[:max_results]

    print(f"\n=== Summary ===")
    for religion, count in religions_found.items():
        print(f"  {religion}: {count} unique places")
    print(f"Total unique places found: {len(place_ids)}")

    run.total_items = len(place_ids)
    session.add(run)
    session.commit()

    # Step 2: Fetch details and store each as ScrapedPlace
    print(f"Fetching details for {len(place_ids)} places...")
    for i, pid in enumerate(place_ids):
        # Check for cancellation
        session.expire(run)
        session.refresh(run)
        if run.status == "cancelled":
            print(f"Run {run_code} was cancelled at place {i}")
            return

        try:
            details = get_place_details(pid, api_key, session)

            scraped_place = ScrapedPlace(
                run_code=run_code,
                place_code=details["place_code"],
                name=details["name"],
                raw_data=details
            )
            session.add(scraped_place)
            session.commit()

            run.processed_items = i + 1
            session.add(run)
            session.commit()

            print(f"  [{i+1}/{len(place_ids)}] {details['name']}")
            time.sleep(0.5)  # Rate limiting

        except Exception as e:
            print(f"  [{i+1}/{len(place_ids)}] Error: {e}")
            continue
