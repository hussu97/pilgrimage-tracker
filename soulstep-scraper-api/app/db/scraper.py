import asyncio
import secrets

import httpx
from sqlmodel import Session, select

from app.db.models import DataLocation, ScrapedPlace, ScraperRun
from app.db.session import engine
from app.logger import get_logger
from app.pipeline.place_quality import GATE_SYNC, is_name_specific_enough, passes_gate
from app.scrapers.gmaps import run_gmaps_scraper

logger = get_logger(__name__)


def generate_code(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(4)}"


async def run_scraper_task(run_code: str):
    """
    Background task dispatcher that runs the gmaps scraper, then the enrichment pipeline.
    """
    with Session(engine) as session:
        run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
        if not run:
            logger.error("Run %s not found", run_code)
            return

        run.status = "running"
        run.error_message = None
        session.add(run)
        session.commit()

        location = session.exec(
            select(DataLocation).where(DataLocation.code == run.location_code)
        ).first()
        if not location:
            run.status = "failed"
            run.error_message = "Location not found"
            session.add(run)
            session.commit()
            return

        try:
            # Phase 1-3: Discovery + Detail fetching via gmaps
            await run_gmaps_scraper(run_code, location.config, session)

            # Phase 4: Enrichment pipeline
            from app.pipeline.enrichment import run_enrichment_pipeline

            session.refresh(run)
            run.stage = "enrichment"
            session.add(run)
            session.commit()

            await run_enrichment_pipeline(run_code)

            # Final check to ensure we don't overwrite "cancelled" with "completed"
            session.refresh(run)
            if run.status != "cancelled":
                run.status = "completed"
                run.stage = None
                session.add(run)
                session.commit()
                logger.info("Run %s completed", run_code)

        except Exception as e:
            logger.error("Run %s failed: %s", run_code, e, exc_info=True)
            session.refresh(run)
            run.status = "failed"
            run.error_message = str(e)[:500]
            session.add(run)
            session.commit()


async def resume_scraper_task(run_code: str):
    """
    Resume an interrupted or failed scraper run from where it left off.

    Uses run.stage to decide the resume point:
      - None or "discovery" → re-run full pipeline (discovery was incomplete)
      - "detail_fetch" → use persisted discovered_resource_names, skip to detail fetch
      - "enrichment" → skip straight to enrichment (which skips already-enriched places)
    """
    with Session(engine) as session:
        run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
        if not run:
            logger.error("Resume: Run %s not found", run_code)
            return

        resume_from = run.stage
        run.status = "running"
        run.error_message = None
        session.add(run)
        session.commit()

        location = session.exec(
            select(DataLocation).where(DataLocation.code == run.location_code)
        ).first()
        if not location:
            run.status = "failed"
            run.error_message = "Location not found"
            session.add(run)
            session.commit()
            return

        logger.info("Resuming run %s from stage: %s", run_code, resume_from or "beginning")

        try:
            if resume_from in (None, "discovery"):
                # Discovery was incomplete — re-run full pipeline
                await run_gmaps_scraper(run_code, location.config, session)

                from app.pipeline.enrichment import run_enrichment_pipeline

                session.refresh(run)
                run.stage = "enrichment"
                session.add(run)
                session.commit()

                await run_enrichment_pipeline(run_code)

            elif resume_from == "detail_fetch":
                # Discovery completed — derive resource names from DiscoveryCell records
                # (the JSON column is no longer written at 100K-place scale)
                from app.collectors.gmaps import GmapsCollector, download_place_images
                from app.db.models import DiscoveryCell, PlaceTypeMapping
                from app.scrapers.gmaps import (
                    fetch_place_details,
                )

                cells = session.exec(
                    select(DiscoveryCell).where(DiscoveryCell.run_code == run_code)
                ).all()
                place_ids = list({name for cell in cells for name in cell.resource_names})

                # Fallback: if no cells (very old run format), use JSON column
                if not place_ids:
                    place_ids = run.discovered_resource_names or []

                if not place_ids:
                    logger.warning(
                        "Resume: No discovered places found for run %s, re-running discovery",
                        run_code,
                    )
                    await run_gmaps_scraper(run_code, location.config, session)
                else:
                    api_key = __import__("os").environ.get("GOOGLE_MAPS_API_KEY", "")
                    if not api_key:
                        raise ValueError("GOOGLE_MAPS_API_KEY environment variable not set")

                    from sqlmodel import select as _select

                    place_type_mappings = session.exec(
                        _select(PlaceTypeMapping)
                        .where(PlaceTypeMapping.is_active)
                        .where(PlaceTypeMapping.source_type == "gmaps")
                    ).all()
                    type_map = {m.gmaps_type: m.our_place_type for m in place_type_mappings}
                    religion_type_map = {m.gmaps_type: m.religion for m in place_type_mappings}

                    force_refresh = location.config.get("force_refresh", False)
                    stale_threshold_days = location.config.get("stale_threshold_days", 90)

                    await fetch_place_details(
                        place_ids,
                        run_code,
                        session,
                        GmapsCollector(),
                        api_key,
                        type_map,
                        religion_type_map,
                        force_refresh,
                        stale_threshold_days,
                    )

                    session.refresh(run)
                    run.stage = "image_download"
                    session.add(run)
                    session.commit()

                    await download_place_images(run_code, engine)

                from app.pipeline.enrichment import run_enrichment_pipeline

                session.refresh(run)
                run.stage = "enrichment"
                session.add(run)
                session.commit()

                await run_enrichment_pipeline(run_code)

            elif resume_from == "image_download":
                # Detail fetch completed but image download failed — re-run images then enrich
                from app.collectors.gmaps import download_place_images

                await download_place_images(run_code, engine)

                session.refresh(run)
                run.stage = "enrichment"
                session.add(run)
                session.commit()

                from app.pipeline.enrichment import run_enrichment_pipeline

                await run_enrichment_pipeline(run_code)

            elif resume_from == "enrichment":
                # Skip straight to enrichment (already-enriched places are skipped internally)
                from app.pipeline.enrichment import run_enrichment_pipeline

                await run_enrichment_pipeline(run_code)

            session.refresh(run)
            if run.status != "cancelled":
                run.status = "completed"
                run.stage = None
                session.add(run)
                session.commit()
                logger.info("Run %s resumed and completed", run_code)

        except Exception as e:
            logger.error("Resume of run %s failed: %s", run_code, e, exc_info=True)
            session.refresh(run)
            run.status = "failed"
            run.error_message = str(e)[:500]
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
                "city": data.get("city"),
                "state": data.get("state"),
                "country": data.get("country"),
                "attributes": _sanitize_attributes(data.get("attributes") or []),
                "external_reviews": _sanitize_reviews(data.get("external_reviews") or []),
                "translations": data.get("translations") or None,
            }
        )
    return payloads


async def _post_batch_async(
    batch: list[dict],
    server_url: str,
    client: httpx.AsyncClient,
) -> tuple[int, list[str]]:
    """POST one batch to /api/v1/places/batch. Returns (synced_count, failed_entries)."""
    batch_codes = [p["place_code"] for p in batch]
    try:
        resp = await client.post(
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


async def _post_individual_async(
    payload: dict,
    server_url: str,
    client: httpx.AsyncClient,
) -> tuple[int, list[str]]:
    """Fall back to a single individual POST. Returns (synced_count, failure_details)."""
    import json as _json

    place_code = payload["place_code"]
    try:
        r = await client.post(f"{server_url}/api/v1/places", json=payload)
        if r.status_code not in [200, 201]:
            reason = f"HTTP {r.status_code}"
            logger.warning("[FAIL] %s: %s — %s", place_code, reason, r.text[:200])
            if r.status_code == 422:
                logger.debug(
                    "Payload that caused 422:\n%s",
                    _json.dumps(payload, indent=2, default=str),
                )
            return 0, [f"{place_code}: {reason}"]
        else:
            logger.debug("[OK]   %s", place_code)
            return 1, []
    except Exception as e:
        reason = f"{type(e).__name__}: {e}"
        logger.warning("[FAIL] %s: %s", place_code, reason)
        return 0, [f"{place_code}: {reason}"]


# Keep synchronous wrappers for backwards compat with existing tests and call-sites.


def post_batch(
    batch: list[dict],
    server_url: str,
    http_session,
) -> tuple[int, list[str]]:
    """Synchronous wrapper — kept for test backwards-compat."""
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
    http_session,
) -> tuple[int, list[str]]:
    """Synchronous fallback to individual POSTs — kept for test backwards-compat."""
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


async def sync_run_to_server_async(run_code: str, server_url: str) -> None:
    """Async orchestrator: build payloads → concurrent batch POSTs → individual fallbacks.

    Quality gate: places with quality_score below GATE_SYNC are skipped.
    Backwards-compat: quality_score IS NULL passes through (existing runs).

    Batches are sent concurrently (semaphore of 3) to reduce wall-clock time.
    Individual fallback POSTs are also async.
    Progress is persisted after every batch for the admin UI live counter.
    """
    # Ensure the URL has an http(s) scheme
    if not server_url.startswith(("http://", "https://")):
        server_url = f"http://{server_url}"
    server_url = server_url.rstrip("/")

    # Load places and apply quality gate
    with Session(engine) as session:
        all_places = session.exec(
            select(ScrapedPlace).where(ScrapedPlace.run_code == run_code)
        ).all()

        places = [
            p
            for p in all_places
            if passes_gate(p.quality_score, GATE_SYNC) and is_name_specific_enough(p.name or "")
        ]
        filtered_count = len(all_places) - len(places)

        if filtered_count:
            logger.info(
                "Sync gate: skipping %d/%d places (below quality threshold %.2f or name not specific enough)",
                filtered_count,
                len(all_places),
                GATE_SYNC,
            )

        total = len(places)
        payloads = build_sync_payloads(list(places))
        payloads_by_code = {p["place_code"]: p for p in payloads}

        run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
        if run:
            run.stage = "syncing"
            run.places_synced = 0
            run.places_sync_failed = 0
            session.add(run)
        session.commit()

    logger.info("Syncing %d places to %s in batches of %d", total, server_url, BATCH_SIZE)

    synced_count = 0
    all_failure_details: list[str] = []
    batch_sem = asyncio.Semaphore(3)  # max 3 concurrent batch POSTs

    async def _process_batch(batch_start: int) -> None:
        nonlocal synced_count
        batch = payloads[batch_start : batch_start + BATCH_SIZE]
        logger.info("Sending batch %d: %d places", batch_start // BATCH_SIZE + 1, len(batch))

        async with batch_sem:
            async with httpx.AsyncClient(timeout=60.0) as client:
                batch_synced, failed_entries = await _post_batch_async(batch, server_url, client)

                if batch_synced > 0:
                    synced_count += batch_synced
                else:
                    # Entire batch failed — retry individually (concurrently)
                    failed_codes = [e.split(":")[0] for e in failed_entries]
                    retry_payloads = [
                        payloads_by_code[c] for c in failed_codes if c in payloads_by_code
                    ]
                    if retry_payloads:
                        ind_results = await asyncio.gather(
                            *[
                                _post_individual_async(pl, server_url, client)
                                for pl in retry_payloads
                            ]
                        )
                        for extra_synced, extra_failures in ind_results:
                            synced_count += extra_synced
                            all_failure_details.extend(extra_failures)
                    else:
                        all_failure_details.extend(failed_entries)

                all_failure_details.extend(
                    e for e in failed_entries if e.split(":")[0] not in payloads_by_code
                )

        # Persist progress after every batch
        with Session(engine) as session:
            run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
            if run:
                run.places_synced = synced_count
                run.places_sync_failed = len(all_failure_details)
                session.add(run)
                session.commit()

    batch_starts = list(range(0, len(payloads), BATCH_SIZE))
    await asyncio.gather(*[_process_batch(bs) for bs in batch_starts])

    failed_count = len(all_failure_details)
    logger.info(
        "Sync complete: %d/%d places synced. %d failure(s).", synced_count, total, failed_count
    )
    if all_failure_details:
        logger.warning("Failed places:\n%s", "\n".join(f"  - {d}" for d in all_failure_details))

    # Clear syncing stage when done
    with Session(engine) as session:
        run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
        if run:
            run.stage = None
            run.places_synced = synced_count
            run.places_sync_failed = failed_count
            session.add(run)
            session.commit()


def sync_run_to_server(run_code: str, server_url: str) -> None:
    """Synchronous entry-point — runs the async implementation in an event loop.

    Called from FastAPI background tasks (which run in a thread) and from
    existing tests via asyncio.run / monkeypatching.
    """
    asyncio.run(sync_run_to_server_async(run_code, server_url))
