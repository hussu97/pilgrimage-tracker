import requests
from sqlmodel import Session, select
from app.db.models import DataLocation, ScraperRun, ScrapedPlace
from app.db.session import engine
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


BATCH_SIZE = 25


def sync_run_to_server(run_code: str, server_url: str):
    """
    Syncs scraped places to the main server using batch requests.
    Places are sent in groups of BATCH_SIZE to reduce HTTP overhead.
    Falls back to individual POSTs if the batch endpoint is unavailable.
    """
    import json as _json

    with Session(engine) as session:
        places = session.exec(select(ScrapedPlace).where(ScrapedPlace.run_code == run_code)).all()

        total = len(places)
        print(f"Syncing {total} places to {server_url} in batches of {BATCH_SIZE}")

        synced_count = 0
        failure_details: list[str] = []

        # Build all payloads up front
        payloads = []
        for p in places:
            data = p.raw_data
            payloads.append({
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
            })

        # Send in batches
        for batch_start in range(0, len(payloads), BATCH_SIZE):
            batch = payloads[batch_start: batch_start + BATCH_SIZE]
            batch_codes = [p["place_code"] for p in batch]
            print(f"  Sending batch {batch_start // BATCH_SIZE + 1}: {len(batch)} places")

            try:
                resp = requests.post(
                    f"{server_url}/api/v1/places/batch",
                    json={"places": batch},
                )
                if resp.status_code in [200, 201]:
                    data = resp.json()
                    synced_count += data.get("synced", 0)
                    for r in data.get("results", []):
                        if not r.get("ok"):
                            reason = r.get("error", "unknown error")
                            failure_details.append(f"{r['place_code']}: {reason}")
                            print(f"  [FAIL] {r['place_code']}: {reason}")
                        else:
                            print(f"  [OK]   {r['place_code']}")
                else:
                    # Batch endpoint unavailable — fall back to individual POSTs
                    print(f"  Batch endpoint returned {resp.status_code}, falling back to individual POSTs")
                    for payload in batch:
                        place_code = payload["place_code"]
                        try:
                            r = requests.post(f"{server_url}/api/v1/places", json=payload)
                            if r.status_code not in [200, 201]:
                                reason = f"HTTP {r.status_code}"
                                failure_details.append(f"{place_code}: {reason}")
                                print(f"  [FAIL] {place_code}: {reason} — {r.text[:200]}")
                                if r.status_code == 422:
                                    print("  Payload that caused 422:")
                                    print(_json.dumps(payload, indent=2, default=str))
                            else:
                                synced_count += 1
                                print(f"  [OK]   {place_code}")
                        except Exception as e:
                            reason = f"{type(e).__name__}: {e}"
                            failure_details.append(f"{place_code}: {reason}")
                            print(f"  [FAIL] {place_code}: {reason}")
            except Exception as e:
                reason = f"{type(e).__name__}: {e}"
                for code in batch_codes:
                    failure_details.append(f"{code}: {reason}")
                print(f"  [FAIL] Batch request failed: {reason}")

        # Summary
        failed_count = len(failure_details)
        print(f"\nSync complete: {synced_count}/{total} places synced. {failed_count} failure(s).")
        if failure_details:
            print("Failed places:")
            for detail in failure_details:
                print(f"  - {detail}")
