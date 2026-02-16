import pandas as pd
import time
import urllib.parse
from typing import Dict, Any
from sqlmodel import Session, select
from app.db.models import ScraperRun, ScrapedPlace
from app.scrapers.base import generate_code, make_request_with_backoff

OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter"
HEADERS = {
    "User-Agent": "PilgrimageTrackerBot/1.0 (hussain@example.com)"
}

def get_wikipedia_info(wiki_tag: str) -> Dict[str, Any]:
    """Fetch Wikipedia summary for a given tag."""
    if not wiki_tag:
        return {}

    parts = wiki_tag.split(":", 1)
    if len(parts) == 2:
        lang, title = parts
    else:
        lang = "en"
        title = parts[0]

    encoded_title = urllib.parse.quote(title)
    url = f"https://{lang}.wikipedia.org/api/rest_v1/page/summary/{encoded_title}"

    response = make_request_with_backoff("GET", url, headers=HEADERS)
    if not response or response.status_code != 200:
        return {}

    try:
        data = response.json()
        info = {
            "description": data.get("extract"),
            "image_url": None,
            "original_image": None
        }
        if "thumbnail" in data:
             info["image_url"] = data["thumbnail"].get("source")
        if "originalimage" in data:
            info["original_image"] = data["originalimage"].get("source")
            if info["original_image"]:
                 info["image_url"] = info["original_image"]
        return info
    except Exception as e:
        print(f"Error parsing Wikipedia for {wiki_tag}: {e}")
        return {}

def get_osm_info(lat: float, lon: float, radius: int = 200) -> Dict[str, Any]:
    """Query OpenStreetMap for place of worship near coordinates."""
    overpass_query = f"""
    [out:json][timeout:25];
    (
      node["amenity"="place_of_worship"](around:{radius},{lat},{lon});
      way["amenity"="place_of_worship"](around:{radius},{lat},{lon});
      relation["amenity"="place_of_worship"](around:{radius},{lat},{lon});
    );
    out center;
    """
    response = make_request_with_backoff("POST", OVERPASS_ENDPOINT, data=overpass_query, headers=HEADERS)
    if not response:
        return {}

    try:
        data = response.json()
    except Exception:
        return {}

    if not data.get("elements"):
        return {}

    for element in data["elements"]:
        if "tags" in element:
            return element["tags"]
    return {}

def map_to_schema(row: Any, wiki_info: Dict, osm_tags: Dict) -> Dict[str, Any]:
    """Map CSV row + enriched data to place schema."""
    place_data = {
        "place_code": row.get("overture_id"),
        "name": row.get("place_name"),
        "religion": row.get("primary_religion"),
        "place_type": row.get("primary_category"),
        "lat": row.get("latitude"),
        "lng": row.get("longitude"),
        "address": row.get("street_address") or row.get("city"),
        "image_urls": [],
        "description": wiki_info.get("description"),
        "website_url": row.get("websites") or osm_tags.get("website"),
        "religion_specific": {},
        "source": "overpass",
        "attributes": []
    }

    religion_map = {
        "islam": "islam",
        "hinduism": "hinduism",
        "christianity": "christianity"
    }
    csv_religion = str(row.get("primary_religion")).lower()
    if csv_religion in religion_map:
        place_data["religion"] = religion_map[csv_religion]

    if wiki_info.get("image_url"):
        place_data["image_urls"].append(wiki_info["image_url"])

    if "name:ar" in osm_tags:
        place_data["religion_specific"]["name_ar"] = osm_tags["name:ar"]

    place_data["religion_specific"].update(osm_tags)
    return place_data

def run_gsheet_scraper(run_code: str, config: dict, session: Session):
    """
    Runs the Google Sheet scraper.
    config must contain 'sheet_code'.
    Stores ScrapedPlace records with raw_data including an 'attributes' array.
    """
    sheet_code = config.get("sheet_code")
    if not sheet_code:
        raise ValueError("sheet_code missing from config")

    run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
    if not run:
        raise ValueError(f"Run {run_code} not found")

    csv_url = f"https://docs.google.com/spreadsheets/d/{sheet_code}/export?format=csv"

    print(f"Fetching CSV from {csv_url}")
    df = pd.read_csv(csv_url)
    df = df.replace({float('nan'): None})

    run.total_items = len(df)
    session.add(run)
    session.commit()

    print(f"Processing {len(df)} rows for run {run_code}")

    for index, row in df.iterrows():
        # Check for cancellation
        session.expire(run)
        session.refresh(run)
        if run.status == "cancelled":
            print(f"Run {run_code} was cancelled at row {index}")
            return

        try:
            lat = row.get("latitude")
            lon = row.get("longitude")
            if not lat or not lon:
                continue

            osm_tags = get_osm_info(lat, lon)
            time.sleep(1)

            wiki_info = {}
            if "wikipedia" in osm_tags:
                wiki_info = get_wikipedia_info(osm_tags["wikipedia"])
                time.sleep(1)

            place_obj = map_to_schema(row, wiki_info, osm_tags)

            scraped_place = ScrapedPlace(
                run_code=run_code,
                place_code=place_obj.get("place_code") or generate_code("plc"),
                name=place_obj.get("name") or "Unknown",
                raw_data=place_obj
            )
            session.add(scraped_place)
            session.commit()

            run.processed_items = index + 1
            session.add(run)
            session.commit()

        except Exception as e:
            print(f"Error processing row {index}: {e}")
            session.rollback()
            continue
