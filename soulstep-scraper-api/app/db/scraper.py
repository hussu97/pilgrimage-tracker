import asyncio
import secrets
import time

import httpx
from sqlmodel import Session, select

from app.constants import SYNC_BATCH_SIZE
from app.db.models import DataLocation, ScrapedPlace, ScraperRun
from app.db.session import engine
from app.logger import get_logger
from app.pipeline.place_quality import GATE_SYNC, is_name_specific_enough, passes_gate
from app.scrapers.base import AtomicCounter
from app.scrapers.gmaps import run_gmaps_scraper

logger = get_logger(__name__)


def _persist_stage_duration(session: Session, run: ScraperRun, field: str, duration: float) -> None:
    """Write a single stage duration to the run record and commit."""
    setattr(run, field, round(duration, 2))
    session.add(run)
    session.commit()
    logger.info(
        "Stage %s completed in %.1fs",
        field.replace("_duration_s", ""),
        duration,
        extra={"run_code": run.run_code, "stage": field, "duration_s": round(duration, 2)},
    )


def _persist_avg_time(session: Session, run: ScraperRun) -> None:
    """Compute and persist avg_time_per_place_s from total stage durations."""
    total = sum(
        getattr(run, f, None) or 0.0
        for f in (
            "discovery_duration_s",
            "detail_fetch_duration_s",
            "image_download_duration_s",
            "enrichment_duration_s",
            "sync_duration_s",
        )
    )
    if run.processed_items and run.processed_items > 0:
        run.avg_time_per_place_s = round(total / run.processed_items, 3)
    session.add(run)
    session.commit()
    logger.info(
        "Run %s total pipeline: %.1fs, %d places, avg %.3fs/place",
        run.run_code,
        total,
        run.processed_items or 0,
        run.avg_time_per_place_s or 0.0,
        extra={
            "run_code": run.run_code,
            "total_duration_s": round(total, 2),
            "processed_items": run.processed_items or 0,
            "avg_time_per_place_s": run.avg_time_per_place_s,
        },
    )


def generate_code(prefix: str) -> str:
    """Generate a unique opaque code with the given prefix (e.g. 'plc_a1b2c3d4')."""
    return f"{prefix}_{secrets.token_hex(4)}"


_HTTPX_RETRYABLE: tuple[type[BaseException], ...] = (
    httpx.ConnectTimeout,
    httpx.ReadTimeout,
    httpx.ConnectError,
    httpx.RemoteProtocolError,
    httpx.PoolTimeout,
)
_CANCEL_POLL_INTERVAL_S = 30.0


async def _cancel_watcher(run_code: str, parent_task: asyncio.Task) -> None:
    # Watchdog for DB-set cancel when the main pipeline is stuck in a block-page
    # loop that never reaches the per-batch cancel-check. Polls status every 30s
    # on a fresh session; if the run is marked cancelled, cancels the parent task
    # so asyncio cancellation propagates down the entire call stack.
    while not parent_task.done():
        try:
            await asyncio.sleep(_CANCEL_POLL_INTERVAL_S)
        except asyncio.CancelledError:
            return
        try:
            with Session(engine) as s:
                run = s.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
                if run and run.status == "cancelled":
                    logger.info(
                        "Cancel watcher: run %s marked cancelled — interrupting pipeline",
                        run_code,
                        extra={"run_code": run_code},
                    )
                    parent_task.cancel()
                    return
        except Exception as exc:
            logger.warning(
                "Cancel watcher DB error for run %s: %s",
                run_code,
                exc,
                extra={"run_code": run_code},
            )


async def _run_gmaps_with_retry(run_code: str, location_config: dict, session: Session) -> None:
    # One retry on transient httpx network errors. At 100k-place scale a single
    # DNS blip or connection reset during discovery would otherwise mark the
    # whole run failed. Retry is limited to 1 attempt so a systemic outage
    # still fails fast instead of spinning forever.
    for attempt in range(2):
        try:
            await run_gmaps_scraper(run_code, location_config, session)
            return
        except _HTTPX_RETRYABLE as exc:
            if attempt == 0:
                logger.warning(
                    "gmaps pipeline transient %s (attempt 1/2) — retrying in 10s: %s",
                    type(exc).__name__,
                    exc,
                    extra={"run_code": run_code, "exc_type": type(exc).__name__},
                    exc_info=True,
                )
                await asyncio.sleep(10)
                try:
                    session.expire_all()
                except Exception:
                    pass
                continue
            raise


async def run_scraper_task(run_code: str):
    """
    Background task dispatcher that runs the gmaps scraper, then the enrichment pipeline.
    """
    parent_task = asyncio.current_task()
    watcher = asyncio.create_task(_cancel_watcher(run_code, parent_task)) if parent_task else None
    try:
        await _run_scraper_task_body(run_code)
    except asyncio.CancelledError:
        logger.info(
            "Run %s cancelled via watcher — exiting cleanly",
            run_code,
            extra={"run_code": run_code},
        )
    finally:
        if watcher and not watcher.done():
            watcher.cancel()
            try:
                await watcher
            except (asyncio.CancelledError, Exception):
                pass


async def _run_scraper_task_body(run_code: str):
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
            # Phase 1-3: Discovery + Detail fetching + Image download via gmaps
            t_gmaps = time.monotonic()
            await _run_gmaps_with_retry(run_code, location.config, session)
            # run_gmaps_scraper covers discovery, detail_fetch, and image_download;
            # per-stage durations are recorded inside that function via stage transitions.
            # Record the total gmaps duration across all three sub-stages.
            gmaps_elapsed = time.monotonic() - t_gmaps
            logger.info(
                "GMaps pipeline (discovery+detail+images) completed in %.1fs",
                gmaps_elapsed,
                extra={"run_code": run_code, "gmaps_duration_s": round(gmaps_elapsed, 2)},
            )

        except Exception as e:
            logger.error("Run %s failed during gmaps pipeline: %s", run_code, e, exc_info=True)
            try:
                session.rollback()
            except Exception:
                pass
            # Persist failure with a fresh session (original may be broken)
            with Session(engine) as err_session:
                try:
                    err_run = err_session.exec(
                        select(ScraperRun).where(ScraperRun.run_code == run_code)
                    ).first()
                    if err_run:
                        err_run.status = "failed"
                        err_run.error_message = str(e)[:500]
                        err_session.add(err_run)
                        err_session.commit()
                except Exception as save_err:
                    logger.error(
                        "Could not persist failed status for run %s: %s", run_code, save_err
                    )
            return

        # Close the gmaps session — it may be stale after hours of scraping.
        # All subsequent stages use fresh sessions.
        session.close()
        logger.info("Closed gmaps session — using fresh sessions for enrichment/sync")

        try:
            # Phase 4: Enrichment pipeline (fresh session)
            from app.pipeline.enrichment import run_enrichment_pipeline

            with Session(engine) as enrich_session:
                run = enrich_session.exec(
                    select(ScraperRun).where(ScraperRun.run_code == run_code)
                ).first()
                if run:
                    run.stage = "enrichment"
                    enrich_session.add(run)
                    enrich_session.commit()

            t_enrich = time.monotonic()
            await run_enrichment_pipeline(run_code)

            with Session(engine) as enrich_done_session:
                run = enrich_done_session.exec(
                    select(ScraperRun).where(ScraperRun.run_code == run_code)
                ).first()
                if run:
                    _persist_stage_duration(
                        enrich_done_session,
                        run,
                        "enrichment_duration_s",
                        time.monotonic() - t_enrich,
                    )

            # Auto-sync: push to catalog immediately after enrichment if enabled
            from app.config import settings as _settings

            with Session(engine) as sync_session:
                run = sync_session.exec(
                    select(ScraperRun).where(ScraperRun.run_code == run_code)
                ).first()
                if run and _settings.auto_sync_after_run and run.status != "cancelled":
                    logger.info(
                        "Auto-sync enabled — syncing run %s to %s",
                        run_code,
                        _settings.main_server_url,
                        extra={"run_code": run_code},
                    )
                    t_sync = time.monotonic()
                    await sync_run_to_server_async(run_code, _settings.main_server_url)
                    sync_session.refresh(run)
                    _persist_stage_duration(
                        sync_session, run, "sync_duration_s", time.monotonic() - t_sync
                    )

            # Final check to ensure we don't overwrite "cancelled" with "completed"
            with Session(engine) as final_session:
                run = final_session.exec(
                    select(ScraperRun).where(ScraperRun.run_code == run_code)
                ).first()
                if run and run.status != "cancelled":
                    _persist_avg_time(final_session, run)
                    run.status = "completed"
                    run.stage = None
                    final_session.add(run)
                    final_session.commit()
                    logger.info("Run %s completed", run_code, extra={"run_code": run_code})

        except Exception as e:
            logger.error("Run %s failed: %s", run_code, e, exc_info=True)
            with Session(engine) as err_session:
                try:
                    err_run = err_session.exec(
                        select(ScraperRun).where(ScraperRun.run_code == run_code)
                    ).first()
                    if err_run:
                        err_run.status = "failed"
                        err_run.error_message = str(e)[:500]
                        err_session.add(err_run)
                        err_session.commit()
                except Exception as save_err:
                    logger.error(
                        "Could not persist failed status for run %s: %s", run_code, save_err
                    )


async def resume_scraper_task(run_code: str):
    """
    Resume an interrupted or failed scraper run from where it left off.

    Uses run.stage to decide the resume point:
      - None or "discovery" → re-run full pipeline (discovery was incomplete)
      - "detail_fetch" → use persisted discovered_resource_names, skip to detail fetch
      - "enrichment" → skip straight to enrichment (which skips already-enriched places)

    Each stage uses a fresh DB session to avoid stale-connection issues in long runs.
    """
    parent_task = asyncio.current_task()
    watcher = asyncio.create_task(_cancel_watcher(run_code, parent_task)) if parent_task else None
    try:
        await _resume_scraper_task_body(run_code)
    except asyncio.CancelledError:
        logger.info(
            "Resume of run %s cancelled via watcher — exiting cleanly",
            run_code,
            extra={"run_code": run_code},
        )
    finally:
        if watcher and not watcher.done():
            watcher.cancel()
            try:
                await watcher
            except (asyncio.CancelledError, Exception):
                pass


async def _resume_scraper_task_body(run_code: str):
    with Session(engine) as session:
        run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
        if not run:
            logger.error("Resume: Run %s not found", run_code)
            return

        resume_from = run.stage
        location_code = run.location_code
        run.status = "running"
        run.error_message = None
        session.add(run)
        session.commit()

        location = session.exec(
            select(DataLocation).where(DataLocation.code == location_code)
        ).first()
        if not location:
            run.status = "failed"
            run.error_message = "Location not found"
            session.add(run)
            session.commit()
            return

        location_config = dict(location.config)  # snapshot for use after session closes

    logger.info("Resuming run %s from stage: %s", run_code, resume_from or "beginning")

    try:
        if resume_from in (None, "discovery"):
            # Discovery was incomplete — re-run full pipeline
            with Session(engine) as gmaps_session:
                t_gmaps = time.monotonic()
                await _run_gmaps_with_retry(run_code, location_config, gmaps_session)
                logger.info(
                    "GMaps pipeline completed in %.1fs",
                    time.monotonic() - t_gmaps,
                    extra={"run_code": run_code},
                )

            from app.pipeline.enrichment import run_enrichment_pipeline

            with Session(engine) as enrich_session:
                run = enrich_session.exec(
                    select(ScraperRun).where(ScraperRun.run_code == run_code)
                ).first()
                if run:
                    run.stage = "enrichment"
                    enrich_session.add(run)
                    enrich_session.commit()

            t_enrich = time.monotonic()
            await run_enrichment_pipeline(run_code)
            with Session(engine) as ed_session:
                run = ed_session.exec(
                    select(ScraperRun).where(ScraperRun.run_code == run_code)
                ).first()
                if run:
                    _persist_stage_duration(
                        ed_session, run, "enrichment_duration_s", time.monotonic() - t_enrich
                    )

        elif resume_from == "detail_fetch":
            # Discovery completed — derive resource names from DiscoveryCell records
            from app.collectors.gmaps import GmapsCollector, download_place_images
            from app.db.models import DiscoveryCell
            from app.scrapers.gmaps import (
                fetch_place_details,
                load_place_type_maps,
            )

            with Session(engine) as detail_session:
                cells = detail_session.exec(
                    select(DiscoveryCell).where(DiscoveryCell.run_code == run_code)
                ).all()
                place_ids = list({name for cell in cells for name in cell.resource_names})

                # Fallback: if no cells (very old run format), use JSON column
                if not place_ids:
                    run = detail_session.exec(
                        select(ScraperRun).where(ScraperRun.run_code == run_code)
                    ).first()
                    place_ids = (run.discovered_resource_names if run else None) or []

            if not place_ids:
                logger.warning(
                    "Resume: No discovered places found for run %s, re-running discovery",
                    run_code,
                )
                with Session(engine) as gmaps_session:
                    await _run_gmaps_with_retry(run_code, location_config, gmaps_session)
            else:
                api_key = __import__("os").environ.get("GOOGLE_MAPS_API_KEY", "")
                if not api_key:
                    raise ValueError("GOOGLE_MAPS_API_KEY environment variable not set")

                with Session(engine) as df_session:
                    pt_maps = load_place_type_maps(df_session)
                    type_map = pt_maps.gmaps_type_to_our_type
                    religion_type_map = pt_maps.gmaps_type_to_religion

                force_refresh = location_config.get("force_refresh", False)
                stale_threshold_days = location_config.get("stale_threshold_days", 90)

                t_detail = time.monotonic()
                with Session(engine) as df_session:
                    await fetch_place_details(
                        place_ids,
                        run_code,
                        df_session,
                        GmapsCollector(),
                        api_key,
                        type_map,
                        religion_type_map,
                        force_refresh,
                        stale_threshold_days,
                    )
                    run = df_session.exec(
                        select(ScraperRun).where(ScraperRun.run_code == run_code)
                    ).first()
                    if run:
                        _persist_stage_duration(
                            df_session, run, "detail_fetch_duration_s", time.monotonic() - t_detail
                        )

                with Session(engine) as img_session:
                    run = img_session.exec(
                        select(ScraperRun).where(ScraperRun.run_code == run_code)
                    ).first()
                    if run:
                        run.stage = "image_download"
                        img_session.add(run)
                        img_session.commit()

                t_img = time.monotonic()
                await download_place_images(run_code, engine)
                with Session(engine) as img_done_session:
                    run = img_done_session.exec(
                        select(ScraperRun).where(ScraperRun.run_code == run_code)
                    ).first()
                    if run:
                        _persist_stage_duration(
                            img_done_session,
                            run,
                            "image_download_duration_s",
                            time.monotonic() - t_img,
                        )

            from app.pipeline.enrichment import run_enrichment_pipeline

            with Session(engine) as enrich_session:
                run = enrich_session.exec(
                    select(ScraperRun).where(ScraperRun.run_code == run_code)
                ).first()
                if run:
                    run.stage = "enrichment"
                    enrich_session.add(run)
                    enrich_session.commit()

            t_enrich = time.monotonic()
            await run_enrichment_pipeline(run_code)
            with Session(engine) as ed_session:
                run = ed_session.exec(
                    select(ScraperRun).where(ScraperRun.run_code == run_code)
                ).first()
                if run:
                    _persist_stage_duration(
                        ed_session, run, "enrichment_duration_s", time.monotonic() - t_enrich
                    )

        elif resume_from == "image_download":
            # Detail fetch completed but image download failed — re-run images then enrich
            from app.collectors.gmaps import download_place_images

            t_img = time.monotonic()
            await download_place_images(run_code, engine)
            with Session(engine) as img_done_session:
                run = img_done_session.exec(
                    select(ScraperRun).where(ScraperRun.run_code == run_code)
                ).first()
                if run:
                    _persist_stage_duration(
                        img_done_session,
                        run,
                        "image_download_duration_s",
                        time.monotonic() - t_img,
                    )

            with Session(engine) as enrich_session:
                run = enrich_session.exec(
                    select(ScraperRun).where(ScraperRun.run_code == run_code)
                ).first()
                if run:
                    run.stage = "enrichment"
                    enrich_session.add(run)
                    enrich_session.commit()

            from app.pipeline.enrichment import run_enrichment_pipeline

            t_enrich = time.monotonic()
            await run_enrichment_pipeline(run_code)
            with Session(engine) as ed_session:
                run = ed_session.exec(
                    select(ScraperRun).where(ScraperRun.run_code == run_code)
                ).first()
                if run:
                    _persist_stage_duration(
                        ed_session, run, "enrichment_duration_s", time.monotonic() - t_enrich
                    )

        elif resume_from == "enrichment":
            # Skip straight to enrichment (already-enriched places are skipped internally)
            from app.pipeline.enrichment import run_enrichment_pipeline

            t_enrich = time.monotonic()
            await run_enrichment_pipeline(run_code)
            with Session(engine) as ed_session:
                run = ed_session.exec(
                    select(ScraperRun).where(ScraperRun.run_code == run_code)
                ).first()
                if run:
                    _persist_stage_duration(
                        ed_session, run, "enrichment_duration_s", time.monotonic() - t_enrich
                    )

        # Auto-sync: push to catalog immediately after enrichment if enabled
        from app.config import settings as _settings

        with Session(engine) as sync_session:
            run = sync_session.exec(
                select(ScraperRun).where(ScraperRun.run_code == run_code)
            ).first()
            if run and _settings.auto_sync_after_run and run.status != "cancelled":
                logger.info(
                    "Auto-sync enabled — syncing run %s to %s",
                    run_code,
                    _settings.main_server_url,
                    extra={"run_code": run_code},
                )
                t_sync = time.monotonic()
                await sync_run_to_server_async(run_code, _settings.main_server_url)
                sync_session.refresh(run)
                _persist_stage_duration(
                    sync_session, run, "sync_duration_s", time.monotonic() - t_sync
                )

        with Session(engine) as final_session:
            run = final_session.exec(
                select(ScraperRun).where(ScraperRun.run_code == run_code)
            ).first()
            if run and run.status != "cancelled":
                _persist_avg_time(final_session, run)
                run.status = "completed"
                run.stage = None
                final_session.add(run)
                final_session.commit()
                logger.info("Run %s resumed and completed", run_code, extra={"run_code": run_code})

    except Exception as e:
        logger.error("Resume of run %s failed: %s", run_code, e, exc_info=True)
        with Session(engine) as err_session:
            try:
                err_run = err_session.exec(
                    select(ScraperRun).where(ScraperRun.run_code == run_code)
                ).first()
                if err_run:
                    err_run.status = "failed"
                    err_run.error_message = str(e)[:500]
                    err_session.add(err_run)
                    err_session.commit()
            except Exception as save_err:
                logger.error("Could not persist failed status for run %s: %s", run_code, save_err)


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
    """Sanitize and build a payload dict for each place.

    Uses promoted columns (lat, lng, religion, place_type, address) directly
    instead of parsing the raw_data JSON blob.  Falls back to raw_data only
    for fields that have NOT been promoted (opening_hours, image_urls, etc.).
    """
    payloads = []
    for p in places:
        data = p.raw_data or {}
        payloads.append(
            {
                "place_code": p.place_code,
                "name": p.name,
                "religion": _sanitize_religion(p.religion),
                "place_type": p.place_type,
                "lat": p.lat,
                "lng": p.lng,
                "address": p.address,
                "opening_hours": data.get("opening_hours"),
                "utc_offset_minutes": data.get("utc_offset_minutes"),
                "image_urls": data.get("image_urls") or [],
                "description": data.get("description"),
                "website_url": data.get("website_url"),
                "source": data.get("source"),
                "city": p.city,
                "state": p.state,
                "country": p.country,
                "attributes": _sanitize_attributes(data.get("attributes") or []),
                "external_reviews": _sanitize_reviews(data.get("external_reviews") or []),
                "translations": data.get("translations") or None,
            }
        )
    return payloads


_TRANSIENT_HTTP = {503, 504, 429}
_MAX_HTTP_RETRIES = 3


async def _post_batch_async(
    batch: list[dict],
    server_url: str,
    client: httpx.AsyncClient,
    api_key: str = "",
) -> tuple[int, list[str]]:
    """POST one batch to /api/v1/places/batch. Returns (synced_count, failed_entries).

    Retries up to _MAX_HTTP_RETRIES times on 503/504/429 or network errors
    with exponential backoff (2s, 4s). Non-transient errors (4xx, 500) are
    returned immediately as failures without retrying.
    """
    batch_codes = [p["place_code"] for p in batch]

    for attempt in range(_MAX_HTTP_RETRIES):
        if attempt:
            await asyncio.sleep(2**attempt)  # 2s, 4s

        try:
            resp = await client.post(
                f"{server_url}/api/v1/places/batch",
                json={"places": batch},
                headers={"X-API-Key": api_key} if api_key else {},
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
            elif resp.status_code in _TRANSIENT_HTTP:
                logger.warning(
                    "Batch endpoint returned %d (attempt %d/%d) — retrying",
                    resp.status_code,
                    attempt + 1,
                    _MAX_HTTP_RETRIES,
                )
                continue
            else:
                logger.warning(
                    "Batch endpoint returned %d, falling back to individual POSTs",
                    resp.status_code,
                )
                return 0, [f"{code}: batch HTTP {resp.status_code}" for code in batch_codes]
        except (httpx.TimeoutException, httpx.ConnectError) as e:
            logger.warning(
                "Batch network error (attempt %d/%d): %s(%s) — retrying",
                attempt + 1,
                _MAX_HTTP_RETRIES,
                type(e).__name__,
                e,
            )
            if attempt == _MAX_HTTP_RETRIES - 1:
                return 0, [f"{code}: {type(e).__name__}: {e}" for code in batch_codes]
        except Exception as e:
            reason = f"{type(e).__name__}: {e}"
            logger.error("[FAIL] Batch request failed: %s", reason)
            return 0, [f"{code}: {reason}" for code in batch_codes]

    logger.error("[FAIL] Batch retries exhausted for %d places", len(batch))
    return 0, [f"{code}: retries_exhausted" for code in batch_codes]


async def _post_individual_async(
    payload: dict,
    server_url: str,
    client: httpx.AsyncClient,
    api_key: str = "",
) -> tuple[int, list[str]]:
    """Fall back to a single individual POST. Returns (synced_count, failure_details).

    Retries on 503/504/429 and network errors with exponential backoff (2s, 4s).
    """
    import json as _json

    place_code = payload["place_code"]

    for attempt in range(_MAX_HTTP_RETRIES):
        if attempt:
            await asyncio.sleep(2**attempt)  # 2s, 4s

        try:
            r = await client.post(
                f"{server_url}/api/v1/places",
                json=payload,
                headers={"X-API-Key": api_key} if api_key else {},
            )
            if r.status_code in [200, 201]:
                logger.debug("[OK]   %s", place_code)
                return 1, []
            elif r.status_code in _TRANSIENT_HTTP:
                logger.warning(
                    "[RETRY] %s: HTTP %d (attempt %d/%d)",
                    place_code,
                    r.status_code,
                    attempt + 1,
                    _MAX_HTTP_RETRIES,
                )
                continue
            else:
                reason = f"HTTP {r.status_code}"
                logger.warning("[FAIL] %s: %s — %s", place_code, reason, r.text[:200])
                if r.status_code == 422:
                    logger.debug(
                        "Payload that caused 422:\n%s",
                        _json.dumps(payload, indent=2, default=str),
                    )
                return 0, [f"{place_code}: {reason}"]
        except (httpx.TimeoutException, httpx.ConnectError) as e:
            logger.warning(
                "[RETRY] %s: %s (attempt %d/%d)", place_code, e, attempt + 1, _MAX_HTTP_RETRIES
            )
            if attempt == _MAX_HTTP_RETRIES - 1:
                return 0, [f"{place_code}: {type(e).__name__}: {e}"]
        except Exception as e:
            reason = f"{type(e).__name__}: {e}"
            logger.warning("[FAIL] %s: %s", place_code, reason)
            return 0, [f"{place_code}: {reason}"]

    logger.warning("[FAIL] %s: retries exhausted", place_code)
    return 0, [f"{place_code}: retries_exhausted"]


async def _trigger_seo_generation_async(server_url: str, api_key: str) -> None:
    """POST to the catalog API's bulk SEO generation endpoint after sync.

    Fire-and-forget: logs results but never raises so that a slow or failing
    SEO generation step cannot roll back a completed sync.
    """
    url = f"{server_url}/api/v1/admin/seo/generate"
    headers = {
        "X-API-Key": api_key,
        "Content-Type": "application/json",
    }
    logger.info("Auto-SEO: triggering bulk generation at %s", url)
    try:
        async with httpx.AsyncClient(timeout=600.0) as client:
            resp = await client.post(url, json={"force": False}, headers=headers)
        if resp.status_code == 200:
            data = resp.json()
            logger.info(
                "Auto-SEO complete: %d generated, %d skipped, %d errors",
                data.get("generated", 0),
                data.get("skipped", 0),
                data.get("errors", 0),
            )
        else:
            logger.warning("Auto-SEO returned HTTP %d: %s", resp.status_code, resp.text[:200])
    except Exception as exc:
        logger.error("Auto-SEO generation failed (sync still succeeded): %s", exc)


async def sync_run_to_server_async(
    run_code: str, server_url: str, failed_only: bool = False
) -> None:
    """Async orchestrator: build payloads → concurrent batch POSTs → individual fallbacks.

    Quality gate: places with quality_score below GATE_SYNC are skipped.
    Backwards-compat: quality_score IS NULL passes through (existing runs).

    When failed_only=True, only the places recorded in sync_failure_details are
    retried.  The existing places_synced count is preserved as a base and the
    new synced count is added on top.

    Batches are sent concurrently (semaphore of 3) to reduce wall-clock time.
    Individual fallback POSTs are also async.
    Progress is persisted after every batch for the admin UI live counter.
    """
    # Ensure the URL has an http(s) scheme
    if not server_url.startswith(("http://", "https://")):
        server_url = f"http://{server_url}"
    server_url = server_url.rstrip("/")

    _LOAD_BATCH = 1000
    quality_filtered: list = []
    name_filtered: list = []
    places = []
    base_synced = 0  # previous synced count to preserve when failed_only=True

    if failed_only:
        # Resolve the set of place codes that previously failed
        with Session(engine) as session:
            run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
            if not run:
                logger.warning("Run %s not found for failed-only resync", run_code)
                return
            failure_details = list(run.sync_failure_details or [])
            base_synced = run.places_synced

        if not failure_details:
            logger.info("No sync failures recorded for run %s — nothing to retry", run_code)
            return

        failed_codes = {entry.split(":")[0].strip() for entry in failure_details}
        logger.info("Retrying %d failed place(s) for run %s", len(failed_codes), run_code)

        offset = 0
        while True:
            with Session(engine) as session:
                batch = session.exec(
                    select(ScrapedPlace)
                    .where(ScrapedPlace.run_code == run_code)
                    .where(ScrapedPlace.place_code.in_(list(failed_codes)))
                    .offset(offset)
                    .limit(_LOAD_BATCH)
                ).all()
            if not batch:
                break
            for p in batch:
                if not passes_gate(p.quality_score, GATE_SYNC):
                    quality_filtered.append(p)
                elif not is_name_specific_enough(p.name or ""):
                    name_filtered.append(p)
                else:
                    places.append(p)
            if len(batch) < _LOAD_BATCH:
                break
            offset += _LOAD_BATCH
    else:
        # Load all places for this run in batches to avoid OOM (10K × 30KB ≈ 300MB)
        offset = 0
        logger.info("Loading places for sync (run=%s, batch_size=%d)...", run_code, _LOAD_BATCH)
        while True:
            with Session(engine) as session:
                batch = session.exec(
                    select(ScrapedPlace)
                    .where(ScrapedPlace.run_code == run_code)
                    .offset(offset)
                    .limit(_LOAD_BATCH)
                ).all()
            if not batch:
                break
            for p in batch:
                if not passes_gate(p.quality_score, GATE_SYNC):
                    quality_filtered.append(p)
                elif not is_name_specific_enough(p.name or ""):
                    name_filtered.append(p)
                else:
                    places.append(p)
            if len(batch) < _LOAD_BATCH:
                break
            offset += _LOAD_BATCH

    if quality_filtered or name_filtered:
        logger.info(
            "Sync gate: skipping %d/%d places (%d below quality threshold %.2f, %d name not specific enough)",
            len(quality_filtered) + len(name_filtered),
            len(quality_filtered) + len(name_filtered) + len(places),
            len(quality_filtered),
            GATE_SYNC,
            len(name_filtered),
            extra={
                "run_code": run_code,
                "quality_filtered": len(quality_filtered),
                "name_filtered": len(name_filtered),
                "passing": len(places),
            },
        )

    total = len(places)
    payloads = build_sync_payloads(list(places))
    payloads_by_code = {p["place_code"]: p for p in payloads}

    with Session(engine) as session:
        run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
        if run:
            run.stage = "syncing"
            run.places_sync_failed = 0
            if not failed_only:
                run.places_synced = 0
                run.places_sync_quality_filtered = len(quality_filtered)
                run.places_sync_name_filtered = len(name_filtered)
            session.add(run)
        session.commit()

    logger.info("Syncing %d places to %s in batches of %d", total, server_url, SYNC_BATCH_SIZE)

    from app.config import settings as _settings

    api_key = _settings.catalog_api_key

    synced_counter = AtomicCounter(0)
    all_failure_details: list[str] = []

    # One shared client for all batches — reuses the underlying connection pool.
    # Batches are sent sequentially (one at a time) so the catalog service is not
    # overwhelmed by concurrent large payloads.
    # Batch payloads can be 15–30 MB (50 places × 3 base64 image blobs each), so
    # the write timeout must be generous enough to finish sending the body, and the
    # read timeout must cover the catalog server's synchronous processing time.
    _batch_timeout = httpx.Timeout(connect=10.0, write=120.0, read=300.0, pool=10.0)
    async with httpx.AsyncClient(timeout=_batch_timeout) as shared_client:
        batch_starts = list(range(0, len(payloads), SYNC_BATCH_SIZE))
        for batch_start in batch_starts:
            batch = payloads[batch_start : batch_start + SYNC_BATCH_SIZE]
            batch_num = batch_start // SYNC_BATCH_SIZE + 1
            logger.info("Sending batch %d/%d: %d places", batch_num, len(batch_starts), len(batch))

            batch_synced, failed_entries = await _post_batch_async(
                batch, server_url, shared_client, api_key
            )

            if batch_synced > 0:
                synced_counter.increment(batch_synced)

            # Retry any per-place failures individually — handles both full batch failure
            # (batch_synced == 0) and partial success (batch_synced > 0, some failed).
            if failed_entries:
                failed_codes = [e.split(":")[0] for e in failed_entries]
                retry_payloads = [
                    payloads_by_code[c] for c in failed_codes if c in payloads_by_code
                ]
                # Entries not matching a known code (e.g. batch-level HTTP errors) → log as-is
                unmatched = [e for e in failed_entries if e.split(":")[0] not in payloads_by_code]
                all_failure_details.extend(unmatched)

                if retry_payloads:
                    for pl in retry_payloads:
                        extra_synced, extra_failures = await _post_individual_async(
                            pl, server_url, shared_client, api_key
                        )
                        synced_counter.increment(extra_synced)
                        all_failure_details.extend(extra_failures)

            # Persist progress after every batch
            with Session(engine) as session:
                run = session.exec(
                    select(ScraperRun).where(ScraperRun.run_code == run_code)
                ).first()
                if run:
                    run.places_synced = base_synced + synced_counter.value
                    run.places_sync_failed = len(all_failure_details)
                    session.add(run)
                    session.commit()

    failed_count = len(all_failure_details)
    logger.info(
        "Sync complete: %d/%d places synced. %d failure(s).",
        synced_counter.value,
        total,
        failed_count,
        extra={
            "run_code": run_code,
            "synced": synced_counter.value,
            "total": total,
            "failed": failed_count,
        },
    )
    if all_failure_details:
        logger.warning("Failed places:\n%s", "\n".join(f"  - {d}" for d in all_failure_details))

    # Clear syncing stage when done; persist failure details for the sync report
    with Session(engine) as session:
        run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
        if run:
            run.stage = None
            run.places_synced = base_synced + synced_counter.value
            run.places_sync_failed = failed_count
            run.sync_failure_details = all_failure_details[:500]  # cap at 500 entries
            session.add(run)
            session.commit()

    # Auto-SEO: if configured, trigger bulk SEO generation for newly synced places
    if _settings.trigger_seo_after_sync:
        if _settings.catalog_api_key:
            await _trigger_seo_generation_async(server_url, _settings.catalog_api_key)
        else:
            logger.warning(
                "SCRAPER_TRIGGER_SEO_AFTER_SYNC=true but CATALOG_API_KEY is not set "
                "— run 'scripts/generate_seo.py --generate' manually after import"
            )


def sync_run_to_server(run_code: str, server_url: str, failed_only: bool = False) -> None:
    """Synchronous entry-point — runs the async implementation in an event loop.

    Called from FastAPI background tasks (which run in a thread) and from
    existing tests via asyncio.run / monkeypatching.
    """
    asyncio.run(sync_run_to_server_async(run_code, server_url, failed_only=failed_only))


def retry_run_images(run_code: str) -> None:
    """Re-download images that failed during the image_download stage.

    Called from FastAPI background tasks. Uses the global engine from db/session.
    download_place_images() skips places whose image URLs already start with the
    GCS prefix, so only genuinely failed (non-GCS) URLs are retried.
    """
    from app.collectors.gmaps import download_place_images

    with Session(engine) as session:
        run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
        if run:
            run.stage = "image_download"
            session.add(run)
            session.commit()

    try:
        asyncio.run(download_place_images(run_code, engine))
    finally:
        with Session(engine) as session:
            run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
            if run:
                run.stage = None
                session.add(run)
                session.commit()
