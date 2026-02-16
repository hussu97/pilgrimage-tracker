import requests
import time
import re
import os
from datetime import datetime, timedelta
from typing import List, Dict, Optional
from sqlmodel import Session, select
from app.db.models import ScraperRun, ScrapedPlace, GeoBoundary

# Configuration
SEARCH_RADIUS = 10000  # 10km radius per grid point

# Place type mappings
PLACE_TYPE_MAP = {
    "mosque": {"religion": "islam", "type": "mosque"},
    "hindu_temple": {"religion": "hinduism", "type": "temple"},
    "church": {"religion": "christianity", "type": "church"},
}

STEP = 0.1  # Approx 11km per step to ensure overlap

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

def get_place_details(place_id: str, religion: str, api_key: str) -> Dict:
    """Fetch detailed information for a single place."""
    url = "https://maps.googleapis.com/maps/api/place/details/json"

    fields = "name,formatted_address,vicinity,geometry,opening_hours,wheelchair_accessible_entrance,rating,user_ratings_total,url,photos,business_status,reviews"
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
    for photo in result.get("photos", [])[:3]:
        ref = photo.get("photo_reference")
        photo_urls.append(f"https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference={ref}&key={api_key}")

    # Process Google reviews (up to 5)
    google_reviews = []
    for review in result.get("reviews", [])[:5]:
        google_reviews.append({
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

    # Google rating and reviews
    rating = result.get("rating")
    if rating:
        attributes.append({"attribute_code": "google_rating", "value": rating})

    reviews_count = result.get("user_ratings_total")
    if reviews_count:
        attributes.append({"attribute_code": "google_reviews_count", "value": reviews_count})

    # Process opening hours
    opening_hours = process_weekly_hours(result.get("opening_hours", {}))

    # Generate stable place_code from place_id
    place_code = f"gplc_{place_id}"

    # Build place data
    place_data = {
        "place_code": place_code,
        "name": result.get("name", "N/A"),
        "religion": religion,
        "place_type": PLACE_TYPE_MAP.get(result.get("types", [""])[0], {}).get("type", "unknown"),
        "lat": result.get("geometry", {}).get("location", {}).get("lat", 0),
        "lng": result.get("geometry", {}).get("location", {}).get("lng", 0),
        "address": clean_address(result.get("formatted_address", "")),
        "image_urls": photo_urls,
        "description": f"Discovered via Google Maps. Status: {result.get('business_status', 'N/A')}",
        "website_url": result.get("url", ""),
        "opening_hours": opening_hours,
        "attributes": attributes,
        "google_reviews": google_reviews,
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
    config must contain ('country' OR 'city') and 'place_type'.
    Optional: 'max_results' to limit for testing.
    """
    city = config.get("city")
    country = config.get("country")
    place_type = config.get("place_type")
    max_results = config.get("max_results")

    if not place_type:
        raise ValueError("place_type required in config")

    if not city and not country:
        raise ValueError("Either city or country required in config")

    # Get API key from environment
    api_key = os.environ.get("GOOGLE_MAPS_API_KEY", "")
    if not api_key:
        raise ValueError("GOOGLE_MAPS_API_KEY environment variable not set")

    run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
    if not run:
        raise ValueError(f"Run {run_code} not found")

    religion = PLACE_TYPE_MAP[place_type]["religion"]

    # Look up geographic boundary from DB
    boundary_name = city if city else country
    boundary = session.exec(select(GeoBoundary).where(GeoBoundary.name == boundary_name)).first()
    if not boundary:
        raise ValueError(f"Geographic boundary not found for: {boundary_name}")

    # Step 1: Grid search for place IDs (with max_results limit)
    place_ids = search_grid(
        boundary.lat_min, boundary.lat_max, boundary.lng_min, boundary.lng_max,
        place_type, api_key, max_results
    )

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
            details = get_place_details(pid, religion, api_key)

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
