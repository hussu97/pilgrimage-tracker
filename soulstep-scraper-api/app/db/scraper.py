import secrets

import requests
from sqlmodel import Session, select

from app.db.models import DataLocation, ScrapedPlace, ScraperRun
from app.db.session import engine
from app.logger import get_logger
from app.scrapers.gmaps import run_gmaps_scraper

logger = get_logger(__name__)


def generate_code(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(4)}"


def run_scraper_task(run_code: str):
    """
    Background task dispatcher that runs the gmaps scraper, then the enrichment pipeline.
    """
    with Session(engine) as session:
        run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
        if not run:
            logger.error("Run %s not found", run_code)
            return

        run.status = "running"
        session.add(run)
        session.commit()

        location = session.exec(
            select(DataLocation).where(DataLocation.code == run.location_code)
        ).first()
        if not location:
            run.status = "failed"
            session.add(run)
            session.commit()
            return

        try:
            # Phase 1-3: Discovery + Detail fetching via gmaps
            run_gmaps_scraper(run_code, location.config, session)

            # Phase 4: Enrichment pipeline
            from app.pipeline.enrichment import run_enrichment_pipeline

            run_enrichment_pipeline(run_code)

            # Final check to ensure we don't overwrite "cancelled" with "completed"
            session.refresh(run)
            if run.status != "cancelled":
                run.status = "completed"
                session.add(run)
                session.commit()
                logger.info("Run %s completed", run_code)

        except Exception as e:
            logger.error("Run %s failed: %s", run_code, e, exc_info=True)
            run.status = "failed"
            session.add(run)
            session.commit()


BATCH_SIZE = 25

# Religion values accepted by the server schema.
_VALID_RELIGIONS = {"islam", "hinduism", "christianity", "all"}


def _sanitize_religion(religion: str | None) -> str:
    """Map unrecognised/unknown religion strings to 'all'."""
    if religion and religion in _VALID_RELIGIONS:
        return religion
    return "all"


def _sanitize_attributes(attributes: list[dict]) -> list[dict]:
    """
    Drop attributes whose values are not accepted by PlaceAttributeInput on the server.
    Allowed types: str, int, float, bool, list[str].
    Dict values (e.g. parking_details, accessibility_details) are filtered out.
    """
    result = []
    for attr in attributes:
        val = attr.get("value")
        if isinstance(val, dict):
            continue  # dict not accepted by server schema
        if isinstance(val, list):
            if all(isinstance(item, str) for item in val):
                result.append(attr)
            # mixed/non-string lists → skip
        elif isinstance(val, str | int | float | bool):
            result.append(attr)
    return result


def _sanitize_reviews(reviews: list[dict]) -> list[dict]:
    """
    Drop reviews whose rating is outside the server-validated range 1–5.
    Foursquare tips use rating=0 (no rating) which would cause a 422.
    """
    return [r for r in reviews if isinstance(r.get("rating"), int) and 1 <= r["rating"] <= 5]


def build_sync_payloads(places: list[ScrapedPlace]) -> list[dict]:
    """Sanitize and build a payload dict for each place."""
    payloads = []
    for p in places:
        data = p.raw_data
        payloads.append(
            {
                "place_code": p.place_code,
                "name": data.get("name"),
                "religion": _sanitize_religion(data.get("religion")),
                "place_type": data.get("place_type"),
                "lat": data.get("lat"),
                "lng": data.get("lng"),
                "address": data.get("address"),
                "opening_hours": data.get("opening_hours"),
                "utc_offset_minutes": data.get("utc_offset_minutes"),
                # Server rejects payloads with both fields populated.
                # Prefer image_blobs (self-contained) over image_urls when both exist.
                "image_urls": []
                if (data.get("image_blobs") or [])
                else (data.get("image_urls") or []),
                "image_blobs": data.get("image_blobs") or [],
                "description": data.get("description"),
                "website_url": data.get("website_url"),
                "source": data.get("source"),
                "attributes": _sanitize_attributes(data.get("attributes") or []),
                "external_reviews": _sanitize_reviews(data.get("external_reviews") or []),
                "translations": data.get("translations") or None,
            }
        )
    return payloads


def post_batch(
    batch: list[dict],
    server_url: str,
    http_session: requests.Session,
) -> tuple[int, list[str]]:
    """POST one batch to /api/v1/places/batch. Returns (synced_count, failed_place_codes)."""

    batch_codes = [p["place_code"] for p in batch]
    try:
        resp = http_session.post(
            f"{server_url}/api/v1/places/batch",
            json={"places": batch},
        )
        if resp.status_code in [200, 201]:
            data = resp.json()
            synced = data.get("synced", 0)
            failed: list[str] = []
            for r in data.get("results", []):
                if not r.get("ok"):
                    reason = r.get("error", "unknown error")
                    failed.append(f"{r['place_code']}: {reason}")
                    logger.warning("[FAIL] %s: %s", r["place_code"], reason)
                else:
                    logger.debug("[OK]   %s", r["place_code"])
            return synced, failed
        else:
            logger.warning(
                "Batch endpoint returned %d, falling back to individual POSTs", resp.status_code
            )
            return 0, [f"{code}: batch HTTP {resp.status_code}" for code in batch_codes]
    except Exception as e:
        reason = f"{type(e).__name__}: {e}"
        logger.error("[FAIL] Batch request failed: %s", reason)
        return 0, [f"{code}: {reason}" for code in batch_codes]


def handle_sync_failures(
    failed_payloads: list[dict],
    server_url: str,
    http_session: requests.Session,
) -> tuple[int, list[str]]:
    """Fall back to individual POSTs for each failed place. Returns (synced_count, failure_details)."""
    import json as _json

    synced = 0
    failure_details: list[str] = []
    for payload in failed_payloads:
        place_code = payload["place_code"]
        try:
            r = http_session.post(f"{server_url}/api/v1/places", json=payload)
            if r.status_code not in [200, 201]:
                reason = f"HTTP {r.status_code}"
                failure_details.append(f"{place_code}: {reason}")
                logger.warning("[FAIL] %s: %s — %s", place_code, reason, r.text[:200])
                if r.status_code == 422:
                    logger.debug(
                        "Payload that caused 422:\n%s",
                        _json.dumps(payload, indent=2, default=str),
                    )
            else:
                synced += 1
                logger.debug("[OK]   %s", place_code)
        except Exception as e:
            reason = f"{type(e).__name__}: {e}"
            failure_details.append(f"{place_code}: {reason}")
            logger.warning("[FAIL] %s: %s", place_code, reason)
    return synced, failure_details


def sync_run_to_server(run_code: str, server_url: str) -> None:
    """
    Orchestrator: build payloads → batch POST → handle individual failures.

    Places are sent in groups of BATCH_SIZE to reduce HTTP overhead.
    Falls back to individual POSTs for any batch that the endpoint rejects.
    """
    # Ensure the URL has an http(s) scheme so requests doesn't raise InvalidSchema.
    if not server_url.startswith(("http://", "https://")):
        server_url = f"http://{server_url}"
    server_url = server_url.rstrip("/")

    with Session(engine) as session:
        places = session.exec(select(ScrapedPlace).where(ScrapedPlace.run_code == run_code)).all()

        total = len(places)
        logger.info("Syncing %d places to %s in batches of %d", total, server_url, BATCH_SIZE)

        payloads = build_sync_payloads(list(places))
        payloads_by_code = {p["place_code"]: p for p in payloads}

        synced_count = 0
        all_failure_details: list[str] = []

        http_session = requests.Session()
        for batch_start in range(0, len(payloads), BATCH_SIZE):
            batch = payloads[batch_start : batch_start + BATCH_SIZE]
            logger.info("Sending batch %d: %d places", batch_start // BATCH_SIZE + 1, len(batch))

            batch_synced, failed_entries = post_batch(batch, server_url, http_session)

            if batch_synced > 0:
                synced_count += batch_synced
            else:
                # Entire batch failed — retry individually
                failed_codes = [e.split(":")[0] for e in failed_entries]
                retry_payloads = [
                    payloads_by_code[c] for c in failed_codes if c in payloads_by_code
                ]
                if retry_payloads:
                    extra_synced, extra_failures = handle_sync_failures(
                        retry_payloads, server_url, http_session
                    )
                    synced_count += extra_synced
                    all_failure_details.extend(extra_failures)
                else:
                    all_failure_details.extend(failed_entries)

            all_failure_details.extend(
                e for e in failed_entries if e.split(":")[0] not in payloads_by_code
            )

        failed_count = len(all_failure_details)
        logger.info(
            "Sync complete: %d/%d places synced. %d failure(s).", synced_count, total, failed_count
        )
        if all_failure_details:
            logger.warning("Failed places:\n%s", "\n".join(f"  - {d}" for d in all_failure_details))
