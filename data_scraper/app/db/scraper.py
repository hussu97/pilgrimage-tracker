import pandas as pd
import requests
import json
import time
import urllib.parse
import secrets
from datetime import datetime
from typing import Optional, Dict, Any, List
from sqlmodel import Session, select
from app.db.models import DataLocation, ScraperRun, ScrapedPlace
from app.db.session import engine

# --- Config & Helpers ---

OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter"
HEADERS = {
    "User-Agent": "PilgrimageTrackerBot/1.0 (hussain@example.com)"
}

def generate_code(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(4)}"

def make_request_with_backoff(method: str, url: str, **kwargs) -> Optional[requests.Response]:
    wait_time = 5
    retries = 0
    max_retries = 5
    while retries < max_retries:
        try:
            response = requests.request(method, url, **kwargs)
            if response.status_code == 429:
                print(f"Rate limit hit (429). Retrying in {wait_time}s...")
                time.sleep(wait_time)
                wait_time *= 2
                retries += 1
                continue
            return response
        except Exception as e:
            print(f"Request error: {e}")
            return None
    return None

# --- Scraping Logic ---

def get_wikipedia_info(wiki_tag: str) -> Dict[str, Any]:
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
    except requests.exceptions.JSONDecodeError:
        return {}
    
    if not data.get("elements"):
        return {}

    for element in data["elements"]:
        if "tags" in element:
            return element["tags"]
    return {}

def map_to_schema(row: pd.Series, wiki_info: Dict, osm_tags: Dict) -> Dict[str, Any]:
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
        "religion_specific": {}
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

# --- Service Functions ---

def run_scraper_task(run_code: str):
    """
    Background task to run scraper.
    """
    with Session(engine) as session:
        run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
        if not run:
            print(f"Run {run_code} not found")
            return
        
        run.status = "running"
        session.add(run)
        session.commit()
        session.refresh(run) # Refresh to get latest token if any
        
        location = session.exec(select(DataLocation).where(DataLocation.code == run.location_code)).first()
        if not location:
            run.status = "failed"
            session.add(run)
            session.commit()
            return
            
        try:
            # Construct CSV export URL from sheet_code
            csv_url = f"https://docs.google.com/spreadsheets/d/{location.sheet_code}/export?format=csv"
            
            print(f"Fetching CSV from {csv_url}")
            df = pd.read_csv(csv_url)
            df = df.replace({float('nan'): None})
            
            # Limit for testing/safety if needed, or process all. 
            # For now process all.
            
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
                    session.commit() # Save each row's progress
                    
                except Exception as e:
                    print(f"Error processing row {index}: {e}")
                    session.rollback() # Rollback only this row if it failed
                    continue
            
            # Final check to ensure we don't overwrite "cancelled" with "completed"
            session.refresh(run)
            if run.status != "cancelled":
                run.status = "completed"
                session.add(run)
                session.commit()
                print(f"Run {run_code} completed")

        except Exception as e:
            print(f"Run {run_code} failed: {e}")
            run.status = "failed"
            session.add(run)
            session.commit()


def sync_run_to_server(run_code: str, server_url: str):
    with Session(engine) as session:
        places = session.exec(select(ScrapedPlace).where(ScrapedPlace.run_code == run_code)).all()
        
        print(f"Syncing {len(places)} places to {server_url}")
        
        for p in places:
            data = p.raw_data
            # Transform to PlaceCreate schema (should match map_to_schema output mostly)
            # map_to_schema output: {place_code, name, religion, place_type, lat, lng, address, image_urls, description, website_url, religion_specific}
            # PlaceCreate: name, religion, place_type, lat, lng, address, opening_hours, image_urls, description, religion_specific, website_url
            
            payload = {
                "place_code": p.place_code,
                "name": data.get("name"),
                "religion": data.get("religion"),
                "place_type": data.get("place_type"),
                "lat": data.get("lat"),
                "lng": data.get("lng"),
                "address": data.get("address"),
                "opening_hours": None, # Not scraped yet
                "image_urls": data.get("image_urls") or [],
                "description": data.get("description"),
                "religion_specific": data.get("religion_specific") or {},
                "website_url": data.get("website_url")
            }

            
            try:
                resp = requests.post(f"{server_url}/api/v1/places", json=payload)
                if resp.status_code not in [200, 201]:
                    print(f"Failed to sync {p.place_code}: {resp.status_code} - {resp.text}")
                else:
                    print(f"Synced {p.place_code}")
            except Exception as e:
                print(f"Error syncing {p.place_code}: {e}")
