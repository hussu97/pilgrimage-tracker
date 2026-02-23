"""
Enrichment pipeline orchestrator — runs collectors in dependency order,
stores raw data, and merges results into the final ScrapedPlace.
"""

from __future__ import annotations

import time

from sqlmodel import Session, select

from app.collectors.base import CollectorResult
from app.collectors.registry import get_enrichment_collectors
from app.db.models import RawCollectorData, ScrapedPlace, ScraperRun
from app.db.session import engine
from app.pipeline.merger import merge_collector_results


def run_enrichment_pipeline(run_code: str):
    """
    Run the enrichment pipeline for all places in a scraper run.

    This is called after the gmaps discovery phase completes, or
    independently via the re-enrich API endpoint.
    """
    with Session(engine) as session:
        run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
        if not run:
            print(f"Enrichment: Run {run_code} not found")
            return

        places = session.exec(select(ScrapedPlace).where(ScrapedPlace.run_code == run_code)).all()

        if not places:
            print(f"Enrichment: No places found for run {run_code}")
            return

        collectors = get_enrichment_collectors()
        collector_names = [c.name for c in collectors]
        print("\n=== Enrichment Pipeline ===")
        print(f"Run: {run_code}, Places: {len(places)}, Collectors: {collector_names}")

        for i, place in enumerate(places):
            # Check for cancellation
            session.expire(run)
            session.refresh(run)
            if run.status == "cancelled":
                print(f"Enrichment cancelled at place {i}")
                return

            try:
                _enrich_place(place, run_code, collectors, session)
            except Exception as e:
                print(f"  [{i + 1}/{len(places)}] {place.name}: enrichment failed: {e}")
                place.enrichment_status = "failed"
                session.add(place)
                session.commit()
                continue

            print(
                f"  [{i + 1}/{len(places)}] {place.name}: "
                f"enriched (source={place.description_source}, "
                f"score={place.description_score})"
            )

        print("\n=== Enrichment Complete ===")


def _enrich_place(
    place: ScrapedPlace,
    run_code: str,
    collectors: list,
    session: Session,
):
    """Run all collectors for a single place, merge results, update DB."""
    place.enrichment_status = "enriching"
    session.add(place)
    session.commit()

    raw_data = place.raw_data or {}
    lat = raw_data.get("lat", 0)
    lng = raw_data.get("lng", 0)
    name = place.name

    # Accumulated data passed to downstream collectors
    accumulated: dict = {
        "tags": {},
        "google_place_id": raw_data.get("google_place_id"),
    }

    results: dict[str, CollectorResult] = {}

    for collector in collectors:
        try:
            result = collector.collect(
                place_code=place.place_code,
                lat=lat,
                lng=lng,
                name=name,
                existing_data=accumulated,
            )
        except Exception as e:
            result = CollectorResult(
                collector_name=collector.name,
                status="failed",
                error_message=str(e),
            )

        results[collector.name] = result

        # Store raw collector data
        raw_record = RawCollectorData(
            place_code=place.place_code,
            collector_name=collector.name,
            run_code=run_code,
            raw_response=result.raw_response,
            status=result.status,
            error_message=result.error_message,
        )
        session.add(raw_record)
        session.commit()

        # Pass tags downstream (e.g., OSM wikipedia/wikidata tags)
        if result.status == "success" and result.tags:
            accumulated["tags"].update(result.tags)

        # Rate limiting between collectors
        time.sleep(0.5)

    # Include gmaps collector result if we have raw data
    gmaps_raw = session.exec(
        select(RawCollectorData)
        .where(RawCollectorData.place_code == place.place_code)
        .where(RawCollectorData.collector_name == "gmaps")
        .where(RawCollectorData.run_code == run_code)
    ).first()

    if gmaps_raw and gmaps_raw.status == "success":
        from app.collectors.gmaps import GmapsCollector

        collector = GmapsCollector()
        gmaps_result = collector._extract(gmaps_raw.raw_response, place.place_code, "")
        results["gmaps"] = gmaps_result

    # Merge all results into final raw_data
    merged = merge_collector_results(raw_data, results, name)
    place.raw_data = merged

    # Store description metadata
    place.description_source = merged.get("_description_source")
    place.description_score = merged.get("_description_score")
    place.enrichment_status = "complete"

    session.add(place)
    session.commit()
