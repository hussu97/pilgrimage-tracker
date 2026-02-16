import requests
from sqlmodel import Session, select
from app.db.models import DataLocation, ScraperRun, ScrapedPlace
from app.db.session import engine
from app.scrapers.base import generate_code
from app.scrapers.gsheet import run_gsheet_scraper
from app.scrapers.gmaps import run_gmaps_scraper

def run_scraper_task(run_code: str):
    """
    Background task dispatcher that runs the appropriate scraper based on source_type.
    """
    with Session(engine) as session:
        run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
        if not run:
            print(f"Run {run_code} not found")
            return

        run.status = "running"
        session.add(run)
        session.commit()

        location = session.exec(select(DataLocation).where(DataLocation.code == run.location_code)).first()
        if not location:
            run.status = "failed"
            session.add(run)
            session.commit()
            return

        try:
            if location.source_type == "gsheet":
                run_gsheet_scraper(run_code, location.config, session)
            elif location.source_type == "gmaps":
                run_gmaps_scraper(run_code, location.config, session)
            else:
                raise ValueError(f"Unknown source_type: {location.source_type}")

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
    """
    Syncs scraped places to the main server.
    Includes attributes and source in the payload.
    """
    with Session(engine) as session:
        places = session.exec(select(ScrapedPlace).where(ScrapedPlace.run_code == run_code)).all()

        print(f"Syncing {len(places)} places to {server_url}")

        for p in places:
            data = p.raw_data

            payload = {
                "place_code": p.place_code,
                "name": data.get("name"),
                "religion": data.get("religion"),
                "place_type": data.get("place_type"),
                "lat": data.get("lat"),
                "lng": data.get("lng"),
                "address": data.get("address"),
                "opening_hours": data.get("opening_hours"),
                "utc_offset_minutes": data.get("utc_offset_minutes"),
                "image_urls": data.get("image_urls") or [],
                "image_blobs": data.get("image_blobs") or [],
                "description": data.get("description"),
                "website_url": data.get("website_url"),
                "source": data.get("source"),
                "attributes": data.get("attributes") or [],
                "external_reviews": data.get("external_reviews") or [],
            }

            try:
                resp = requests.post(f"{server_url}/api/v1/places", json=payload)
                if resp.status_code not in [200, 201]:
                    print(f"Failed to sync {p.place_code}: {resp.status_code}")
                    print(f"Error response: {resp.text}")
                    if resp.status_code == 422:
                        # Print payload for debugging validation errors
                        print(f"Payload that caused 422:")
                        import json
                        print(json.dumps(payload, indent=2, default=str))
                else:
                    print(f"Synced {p.place_code}")
            except Exception as e:
                print(f"Error syncing {p.place_code}: {e}")
