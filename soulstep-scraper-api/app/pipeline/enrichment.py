"""
Enrichment pipeline orchestrator — runs collectors in dependency phases,
stores raw data, and merges results into the final ScrapedPlace.

Parallelism:
  - Within a single place: collectors run in dependency-ordered phases.
    Phase 0 (OSM) runs first (sequential), Phase 1 (Wikipedia/Wikidata) and
    Phase 2 (everything else) run concurrently within their phase via asyncio.gather().
  - Across places: up to 10 places are enriched concurrently via asyncio.gather()
    with an asyncio.Semaphore(10).
"""

from __future__ import annotations

import asyncio

from sqlmodel import Session, select

from app.collectors.base import BaseCollector, CollectorResult
from app.collectors.registry import get_enrichment_collectors
from app.config import settings
from app.db.models import RawCollectorData, ScrapedPlace, ScraperRun
from app.db.session import engine
from app.logger import get_logger
from app.pipeline.merger import merge_collector_results
from app.pipeline.place_quality import (
    GATE_ENRICHMENT,
    is_generic_name,
    is_name_specific_enough,
    passes_gate,
)

logger = get_logger(__name__)

# Collectors that belong to each dependency phase (identified by name)
_PHASE0_NAMES = frozenset({"osm"})
_PHASE1_NAMES = frozenset({"wikipedia", "wikidata"})

# _is_generic_name is now provided by place_quality.is_generic_name.
# Keep a local alias for backwards-compat with existing tests that import it
# directly from this module.
_is_generic_name = is_generic_name


def _group_into_phases(collectors: list[BaseCollector]) -> list[list[BaseCollector]]:
    """Split a flat collector list into dependency phases."""
    phase0 = [c for c in collectors if c.name in _PHASE0_NAMES]
    phase1 = [c for c in collectors if c.name in _PHASE1_NAMES]
    phase2 = [c for c in collectors if c.name not in _PHASE0_NAMES | _PHASE1_NAMES]
    return [p for p in [phase0, phase1, phase2] if p]


async def _run_collector_safe(
    collector: BaseCollector,
    place_code: str,
    lat: float,
    lng: float,
    name: str,
    accumulated: dict,
) -> CollectorResult:
    """Execute a single collector, catching any exception as a failed result."""
    try:
        return await collector.collect(
            place_code=place_code,
            lat=lat,
            lng=lng,
            name=name,
            existing_data=dict(accumulated),  # pass a copy so parallel readers are safe
        )
    except Exception as exc:
        return CollectorResult(
            collector_name=collector.name,
            status="failed",
            error_message=str(exc),
        )


async def run_enrichment_pipeline(run_code: str):
    """
    Run the enrichment pipeline for all places in a scraper run.

    Enriches up to 10 places concurrently via asyncio.gather() + asyncio.Semaphore(10).
    Cancellation is checked after every place completes.
    """
    with Session(engine) as session:
        run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
        if not run:
            logger.error("Enrichment: Run %s not found", run_code)
            return

        if run.status == "cancelled":
            logger.warning("Enrichment: Run %s is already cancelled", run_code)
            return

        all_places = session.exec(
            select(ScrapedPlace).where(ScrapedPlace.run_code == run_code)
        ).all()

        if not all_places:
            logger.warning("Enrichment: No places found for run %s", run_code)
            return

        places = [p for p in all_places if p.enrichment_status not in ("complete", "filtered")]
        if len(places) < len(all_places):
            logger.info(
                "Enrichment: skipping %d already-enriched/filtered places, %d remaining",
                len(all_places) - len(places),
                len(places),
            )

        if not places:
            logger.info("Enrichment: all places already enriched for run %s", run_code)
            return

        # Quality gate: mark places below GATE_ENRICHMENT as filtered
        below_gate = [p for p in places if not passes_gate(p.quality_score, GATE_ENRICHMENT)]
        if below_gate:
            for p in below_gate:
                p.enrichment_status = "filtered"
                session.add(p)
            session.commit()

            # Update places_filtered counter on the run
            run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
            if run:
                run.places_filtered = len(below_gate)
                session.add(run)
                session.commit()

            logger.info(
                "Enrichment: filtered %d places below quality gate (%.2f), %d remaining",
                len(below_gate),
                GATE_ENRICHMENT,
                len(places) - len(below_gate),
            )

        places = [p for p in places if passes_gate(p.quality_score, GATE_ENRICHMENT)]

        if not places:
            logger.info("Enrichment: all places filtered by quality gate for run %s", run_code)
            return

        place_codes = [p.place_code for p in places]
        collectors = get_enrichment_collectors()

    collector_names = [c.name for c in collectors]
    logger.info(
        "=== Enrichment Pipeline === run=%s  places=%d  collectors=%s",
        run_code,
        len(place_codes),
        collector_names,
    )
    logger.info("Enrichment: processing %d places", len(place_codes))

    # Configurable via SCRAPER_ENRICHMENT_CONCURRENCY env var (default 10).
    sem = asyncio.Semaphore(settings.enrichment_concurrency)
    completed_count = 0
    cancelled = False

    async def _worker(place_code: str) -> None:
        nonlocal completed_count, cancelled
        async with sem:
            if cancelled:
                return
            with Session(engine) as worker_session:
                place = worker_session.exec(
                    select(ScrapedPlace)
                    .where(ScrapedPlace.place_code == place_code)
                    .where(ScrapedPlace.run_code == run_code)
                ).first()
                if not place:
                    return
                place_name = place.name
                remaining = len(place_codes) - completed_count
                logger.info(
                    "Enriching %r (%s) — %d remaining",
                    place_name,
                    place_code,
                    remaining,
                )
                try:
                    await _enrich_place(place, run_code, collectors, worker_session)
                except Exception as exc:
                    logger.error("%s: enrichment failed: %s", place_code, exc)
                    place.enrichment_status = "failed"
                    worker_session.add(place)
                    worker_session.commit()

            completed_count += 1
            logger.info(
                "[%d/%d] Enriched %r (%s)",
                completed_count,
                len(place_codes),
                place_name,
                place_code,
            )

            # Cancellation check after each place completes
            with Session(engine) as check_session:
                run_check = check_session.exec(
                    select(ScraperRun).where(ScraperRun.run_code == run_code)
                ).first()
                if run_check and run_check.status == "cancelled":
                    logger.warning(
                        "Enrichment cancelled after %d/%d places", completed_count, len(place_codes)
                    )
                    cancelled = True

    await asyncio.gather(*[_worker(code) for code in place_codes])

    logger.info("=== Enrichment Complete ===")


async def _enrich_place(
    place: ScrapedPlace,
    run_code: str,
    collectors: list[BaseCollector],
    session: Session,
) -> None:
    """
    Run all collectors (in dependency phases) for a single place.

    Phase 0 (OSM) runs sequentially first so its tags are available
    to Phase 1 (Wikipedia / Wikidata).  Phases 1 and 2 run collectors
    concurrently via asyncio.gather().  All RawCollectorData records are
    written in a single batch at the end.
    """
    raw_data = place.raw_data or {}
    name = place.name

    # Skip enrichment for places whose name is not specific enough to search on
    # (bare type words like "Mosque" or single-word names like "Hagia").
    # External collectors would find nothing useful without a proper noun.
    # Use the Google Maps description stored during the detail-fetch phase.
    if not is_name_specific_enough(name):
        logger.info(
            "Skipping enrichment for insufficiently specific name %r (%s) — using gmaps description",
            name,
            place.place_code,
        )
        place.enrichment_status = "complete"
        place.description_source = "gmaps"
        place.description_score = 0.3
        session.add(place)
        session.commit()
        return

    place.enrichment_status = "enriching"
    session.add(place)
    session.commit()

    lat = raw_data.get("lat", 0)
    lng = raw_data.get("lng", 0)

    accumulated: dict = {
        "tags": {},
        "google_place_id": raw_data.get("google_place_id"),
    }

    results: dict[str, CollectorResult] = {}

    for phase in _group_into_phases(collectors):
        if len(phase) == 1:
            # Single collector in this phase — run sequentially
            collector = phase[0]
            result = await _run_collector_safe(
                collector, place.place_code, lat, lng, name, accumulated
            )
            results[collector.name] = result
            if result.status == "success" and result.tags:
                accumulated["tags"].update(result.tags)
        else:
            # Multiple independent collectors — run concurrently
            phase_results_list = await asyncio.gather(
                *[
                    _run_collector_safe(c, place.place_code, lat, lng, name, accumulated)
                    for c in phase
                ],
                return_exceptions=True,
            )
            phase_results: dict[str, CollectorResult] = {}
            for c, r in zip(phase, phase_results_list, strict=False):
                if isinstance(r, BaseException):
                    phase_results[c.name] = CollectorResult(
                        collector_name=c.name,
                        status="failed",
                        error_message=str(r),
                    )
                else:
                    phase_results[c.name] = r
            results.update(phase_results)
            # Propagate any tags emitted by this phase
            for result in phase_results.values():
                if result.status == "success" and result.tags:
                    accumulated["tags"].update(result.tags)

    # Batch-write all RawCollectorData records at once
    for coll_name, result in results.items():
        raw_record = RawCollectorData(
            place_code=place.place_code,
            collector_name=coll_name,
            run_code=run_code,
            raw_response=result.raw_response,
            status=result.status,
            error_message=result.error_message,
        )
        session.add(raw_record)

    # Include gmaps collector result if raw data was stored during discovery
    gmaps_raw = session.exec(
        select(RawCollectorData)
        .where(RawCollectorData.place_code == place.place_code)
        .where(RawCollectorData.collector_name == "gmaps")
        .where(RawCollectorData.run_code == run_code)
    ).first()

    if gmaps_raw and gmaps_raw.status == "success":
        from app.collectors.gmaps import GmapsCollector

        gmaps_result = GmapsCollector()._extract(gmaps_raw.raw_response, place.place_code, "")
        results["gmaps"] = gmaps_result

    # Merge all results into final raw_data
    merged = await merge_collector_results(raw_data, results, name)
    place.raw_data = merged
    place.description_source = merged.get("_description_source")
    place.description_score = merged.get("_description_score")
    place.enrichment_status = "complete"

    session.add(place)
    session.commit()
