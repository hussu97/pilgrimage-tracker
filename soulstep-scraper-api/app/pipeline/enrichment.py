"""
Enrichment pipeline orchestrator — runs collectors in dependency phases,
stores raw data, and merges results into the final ScrapedPlace.

Parallelism:
  - Within a single place: collectors run in dependency-ordered phases.
    Phase 0 (OSM) runs first (sequential), Phase 1 (Wikipedia/Wikidata) and
    Phase 2 (everything else) run concurrently within their phase.
  - Across places: up to 3 places are enriched concurrently, each in its
    own thread with its own DB Session.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed

from sqlmodel import Session, select

from app.collectors.base import BaseCollector, CollectorResult
from app.collectors.registry import get_enrichment_collectors
from app.db.models import RawCollectorData, ScrapedPlace, ScraperRun
from app.db.session import engine
from app.pipeline.merger import merge_collector_results

# Collectors that belong to each dependency phase (identified by name)
_PHASE0_NAMES = frozenset({"osm"})
_PHASE1_NAMES = frozenset({"wikipedia", "wikidata"})


def _group_into_phases(collectors: list[BaseCollector]) -> list[list[BaseCollector]]:
    """Split a flat collector list into dependency phases."""
    phase0 = [c for c in collectors if c.name in _PHASE0_NAMES]
    phase1 = [c for c in collectors if c.name in _PHASE1_NAMES]
    phase2 = [c for c in collectors if c.name not in _PHASE0_NAMES | _PHASE1_NAMES]
    return [p for p in [phase0, phase1, phase2] if p]


def _run_collector_safe(
    collector: BaseCollector,
    place_code: str,
    lat: float,
    lng: float,
    name: str,
    accumulated: dict,
) -> CollectorResult:
    """Execute a single collector, catching any exception as a failed result."""
    try:
        return collector.collect(
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


def run_enrichment_pipeline(run_code: str):
    """
    Run the enrichment pipeline for all places in a scraper run.

    Uses up to 3 concurrent worker threads, each with its own DB Session.
    Cancellation is checked after every place completes.
    """
    with Session(engine) as session:
        run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
        if not run:
            print(f"Enrichment: Run {run_code} not found")
            return

        if run.status == "cancelled":
            print(f"Enrichment: Run {run_code} is already cancelled")
            return

        places = session.exec(select(ScrapedPlace).where(ScrapedPlace.run_code == run_code)).all()

        if not places:
            print(f"Enrichment: No places found for run {run_code}")
            return

        place_codes = [p.place_code for p in places]
        collectors = get_enrichment_collectors()

    collector_names = [c.name for c in collectors]
    print("\n=== Enrichment Pipeline ===")
    print(f"Run: {run_code}, Places: {len(place_codes)}, Collectors: {collector_names}")

    completed_count = 0

    def _worker(place_code: str) -> None:
        """Enrich a single place using its own DB session."""
        with Session(engine) as worker_session:
            place = worker_session.exec(
                select(ScrapedPlace).where(ScrapedPlace.place_code == place_code)
            ).first()
            if not place:
                return
            try:
                _enrich_place(place, run_code, collectors, worker_session)
            except Exception as exc:
                print(f"  {place_code}: enrichment failed: {exc}")
                place.enrichment_status = "failed"
                worker_session.add(place)
                worker_session.commit()

    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = {pool.submit(_worker, code): code for code in place_codes}

        for future in as_completed(futures):
            # Cancellation check after each place completes
            with Session(engine) as check_session:
                run_check = check_session.exec(
                    select(ScraperRun).where(ScraperRun.run_code == run_code)
                ).first()
                if run_check and run_check.status == "cancelled":
                    print(f"Enrichment cancelled after {completed_count}/{len(place_codes)} places")
                    pool.shutdown(wait=False)
                    return

            try:
                future.result()
                completed_count += 1
                place_code = futures[future]
                print(f"  [{completed_count}/{len(place_codes)}] {place_code}: enriched")
            except Exception as exc:
                print(f"  Worker error: {exc}")

    print("\n=== Enrichment Complete ===")


def _enrich_place(
    place: ScrapedPlace,
    run_code: str,
    collectors: list[BaseCollector],
    session: Session,
) -> None:
    """
    Run all collectors (in dependency phases) for a single place.

    Phase 0 (OSM) runs sequentially first so its tags are available
    to Phase 1 (Wikipedia / Wikidata).  Phases 1 and 2 run collectors
    in parallel within the phase.  All RawCollectorData records are
    written in a single batch at the end.
    """
    place.enrichment_status = "enriching"
    session.add(place)
    session.commit()

    raw_data = place.raw_data or {}
    lat = raw_data.get("lat", 0)
    lng = raw_data.get("lng", 0)
    name = place.name

    accumulated: dict = {
        "tags": {},
        "google_place_id": raw_data.get("google_place_id"),
    }

    results: dict[str, CollectorResult] = {}

    for phase in _group_into_phases(collectors):
        if len(phase) == 1:
            # Single collector in this phase — run sequentially
            collector = phase[0]
            result = _run_collector_safe(collector, place.place_code, lat, lng, name, accumulated)
            results[collector.name] = result
            if result.status == "success" and result.tags:
                accumulated["tags"].update(result.tags)
        else:
            # Multiple independent collectors — run in parallel
            phase_results: dict[str, CollectorResult] = {}
            with ThreadPoolExecutor(max_workers=len(phase)) as phase_pool:
                future_map = {
                    phase_pool.submit(
                        _run_collector_safe,
                        c,
                        place.place_code,
                        lat,
                        lng,
                        name,
                        accumulated,
                    ): c
                    for c in phase
                }
                for future in as_completed(future_map):
                    collector = future_map[future]
                    try:
                        result = future.result()
                    except Exception as exc:
                        result = CollectorResult(
                            collector_name=collector.name,
                            status="failed",
                            error_message=str(exc),
                        )
                    phase_results[collector.name] = result

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
    merged = merge_collector_results(raw_data, results, name)
    place.raw_data = merged
    place.description_source = merged.get("_description_source")
    place.description_score = merged.get("_description_score")
    place.enrichment_status = "complete"

    session.add(place)
    session.commit()
