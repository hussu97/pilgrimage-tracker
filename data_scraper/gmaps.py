import requests
import time
import csv
import re
import os
import secrets
from datetime import datetime, timedelta
from typing import List, Dict, Optional

# --- CONFIGURATION ---
API_KEY = os.environ.get("GOOGLE_MAPS_API_KEY", "")
if not API_KEY:
    print("⚠️  GOOGLE_MAPS_API_KEY environment variable not set!")
    print("Set it via: export GOOGLE_MAPS_API_KEY=your_key_here")
    exit(1)

SEARCH_RADIUS = 10000  # 10km radius per grid point

# Country bounding boxes
COUNTRY_BOUNDS = {
    "UAE": {"lat_min": 22.5, "lat_max": 26.0, "lng_min": 51.5, "lng_max": 56.5},
    "India": {"lat_min": 8.0, "lat_max": 35.5, "lng_min": 68.0, "lng_max": 97.5},
    "USA": {"lat_min": 24.5, "lat_max": 49.0, "lng_min": -125.0, "lng_max": -66.0},
}

# Place type mappings: Google type -> religion
PLACE_TYPE_MAP = {
    "mosque": {"religion": "islam", "type": "mosque"},
    "hindu_temple": {"religion": "hinduism", "type": "temple"},
    "church": {"religion": "christianity", "type": "church"},
}

STEP = 0.1  # Approx 11km per step to ensure overlap


def clean_address(address):
    """Removes Google Plus Codes (e.g., G2F5+WCM) from the start of an address."""
    return re.sub(r'^[A-Z0-9]{4}\+[A-Z0-9]{2,3}\s*(-\s*)?', '', address).strip()


def convert_to_utc_24h(time_str):
    """Converts a local UAE time string (12h) to a UTC time string (24h)."""
    if "open 24 hours" in time_str.lower():
        return "00:00-23:59 (UTC)"
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


def get_places_in_circle(lat: float, lng: float, place_type: str) -> List[str]:
    """Find all places of a given type within radius of a lat/lng point."""
    url = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
    places = []
    params = {
        "location": f"{lat},{lng}",
        "radius": SEARCH_RADIUS,
        "type": place_type,
        "key": API_KEY
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


def get_place_details(place_id: str, religion: str) -> Dict:
    """Fetch detailed information for a single place and map to attribute codes."""
    url = "https://maps.googleapis.com/maps/api/place/details/json"

    fields = "name,formatted_address,vicinity,geometry,opening_hours,wheelchair_accessible_entrance,rating,user_ratings_total,url,photos,reviews,business_status"

    params = {
        "place_id": place_id,
        "fields": fields,
        "language": "en",
        "key": API_KEY
    }

    response = requests.get(url, params=params).json()
    result = response.get("result", {})

    # Process images (up to 3)
    photo_urls = []
    for photo in result.get("photos", [])[:3]:
        ref = photo.get("photo_reference")
        photo_urls.append(f"https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference={ref}&key={API_KEY}")

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
    weekly_hours = process_weekly_hours(result.get("opening_hours", {}))

    # Build place data
    place_data = {
        "place_code": f"plc_{secrets.token_hex(8)}",
        "name": result.get("name", "N/A"),
        "religion": religion,
        "place_type": PLACE_TYPE_MAP.get(result.get("types", [""])[0], {}).get("type", "unknown"),
        "lat": result.get("geometry", {}).get("location", {}).get("lat", 0),
        "lng": result.get("geometry", {}).get("location", {}).get("lng", 0),
        "address": clean_address(result.get("formatted_address", "")),
        "image_urls": photo_urls,
        "description": f"Discovered via Google Maps. Status: {result.get('business_status', 'N/A')}",
        "website_url": result.get("url", ""),
        "attributes": attributes,
        # CSV-only fields (for legacy export)
        "_vicinity": result.get("vicinity", "N/A"),
        "_status": result.get("business_status", "N/A"),
        "_weekly_hours": weekly_hours,
        "_google_place_id": place_id,
    }

    return place_data


def search_grid(country: str, place_type: str) -> List[str]:
    """Grid search over a country for a given place type."""
    bounds = COUNTRY_BOUNDS.get(country)
    if not bounds:
        print(f"❌ Unknown country: {country}")
        return []

    print(f"🔍 Searching {country} for {place_type}...")
    unique_place_ids = set()

    lat = bounds["lat_min"]
    while lat <= bounds["lat_max"]:
        lng = bounds["lng_min"]
        while lng <= bounds["lng_max"]:
            unique_place_ids.update(get_places_in_circle(lat, lng, place_type))
            lng += STEP
        lat += STEP

    print(f"   Found {len(unique_place_ids)} unique places")
    return list(unique_place_ids)


def export_to_csv(places_data: List[Dict], output_file: str):
    """Export places to CSV (legacy mode)."""
    if not places_data:
        return

    # Flatten for CSV
    csv_rows = []
    for p in places_data:
        row = {
            "Place ID": p["_google_place_id"],
            "Name": p["name"],
            "Address": p["address"],
            "Vicinity": p["_vicinity"],
            "Latitude": p["lat"],
            "Longitude": p["lng"],
            "Status": p["_status"],
            "Wheelchair Accessible": next((a["value"] for a in p["attributes"] if a["attribute_code"] == "wheelchair_accessible"), "N/A"),
            "Rating": next((a["value"] for a in p["attributes"] if a["attribute_code"] == "google_rating"), "N/A"),
            "Total Reviews": next((a["value"] for a in p["attributes"] if a["attribute_code"] == "google_reviews_count"), "N/A"),
            "Google Maps URL": p["website_url"],
            "Image URLs": " | ".join(p["image_urls"])
        }
        row.update(p["_weekly_hours"])
        csv_rows.append(row)

    with open(output_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=csv_rows[0].keys())
        writer.writeheader()
        writer.writerows(csv_rows)
    print(f"✅ Saved CSV: {output_file}")


def post_to_api(places_data: List[Dict], api_url: str):
    """POST scraped places directly to the API."""
    for place in places_data:
        # Remove CSV-only fields
        api_payload = {k: v for k, v in place.items() if not k.startswith("_")}

        try:
            response = requests.post(api_url, json=api_payload)
            if response.status_code in (200, 201):
                print(f"✅ Posted: {place['name']}")
            else:
                print(f"❌ Failed to post {place['name']}: {response.status_code} {response.text}")
        except Exception as e:
            print(f"❌ Error posting {place['name']}: {e}")


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Generalized Google Maps scraper for pilgrimage places")
    parser.add_argument("--country", default="UAE", choices=COUNTRY_BOUNDS.keys(), help="Country to search")
    parser.add_argument("--type", default="mosque", choices=PLACE_TYPE_MAP.keys(), help="Place type to search for")
    parser.add_argument("--mode", default="csv", choices=["csv", "api"], help="Export mode: csv or api")
    parser.add_argument("--api-url", default="http://localhost:8000/api/v1/places", help="API endpoint for posting")
    parser.add_argument("--output", default="places.csv", help="Output CSV file (csv mode only)")

    args = parser.parse_args()

    place_type = args.type
    religion = PLACE_TYPE_MAP[place_type]["religion"]

    print(f"🌍 Country: {args.country}")
    print(f"🕌 Type: {place_type} ({religion})")
    print(f"📤 Mode: {args.mode}")
    print()

    # Step 1: Grid search
    place_ids = search_grid(args.country, place_type)

    # Step 2: Fetch details
    print(f"\n📋 Fetching details for {len(place_ids)} places...")
    places_data = []
    for i, pid in enumerate(place_ids, 1):
        try:
            details = get_place_details(pid, religion)
            places_data.append(details)
            print(f"  [{i}/{len(place_ids)}] {details['name']}")
        except Exception as e:
            print(f"  [{i}/{len(place_ids)}] Error: {e}")

    # Step 3: Export
    print(f"\n📤 Exporting {len(places_data)} places...")
    if args.mode == "csv":
        export_to_csv(places_data, args.output)
    elif args.mode == "api":
        post_to_api(places_data, args.api_url)

    print("\n✅ Done!")


if __name__ == "__main__":
    main()
