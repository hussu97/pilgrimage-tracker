import os

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from sqlmodel import func, select

from app.db.models import (
    DataLocation,
    DiscoveryCell,
    GeoBoundary,
    PlaceTypeMapping,
    RawCollectorData,
    ScrapedPlace,
    ScraperRun,
)
from app.db.scraper import generate_code, resume_scraper_task, run_scraper_task, sync_run_to_server
from app.db.session import SessionDep
from app.models.schemas import (
    CollectorStatusResponse,
    DataLocationCreate,
    DataLocationResponse,
    DescriptionSourceCount,
    EnrichmentStatusCount,
    GateCount,
    NearThresholdCount,
    PerRunSummaryItem,
    PlaceTypeMappingCreate,
    PlaceTypeMappingResponse,
    PlaceTypeMappingUpdate,
    QualityMetricsResponse,
    RawCollectorDataResponse,
    ScoreBucket,
    ScraperRunCreate,
    ScraperRunResponse,
    ScraperStatsResponse,
)

router = APIRouter()


@router.post("/data-locations", response_model=DataLocationResponse)
def create_data_location(body: DataLocationCreate, session: SessionDep):
    # Validate at least one scope is provided (city > state > country priority)
    if not body.city and not body.state and not body.country:
        raise HTTPException(
            status_code=400,
            detail="One of city, state, or country is required for gmaps source",
        )

    # Validate the boundary exists in DB (city takes priority, then state, then country)
    boundary_name = body.city or body.state or body.country
    boundary = session.exec(select(GeoBoundary).where(GeoBoundary.name == boundary_name)).first()
    if not boundary:
        raise HTTPException(
            status_code=400, detail=f"Geographic boundary not found: {boundary_name}"
        )

    config = {
        "max_results": body.max_results or 5  # Default to 5 for testing
    }

    # Store whichever scope was provided
    if body.city:
        config["city"] = body.city
    elif body.state:
        config["state"] = body.state
    else:
        config["country"] = body.country

    loc = DataLocation(
        code=generate_code("loc"),
        name=body.name,
        source_type="gmaps",
        config=config,
    )
    session.add(loc)
    session.commit()
    session.refresh(loc)
    return loc


@router.get("/data-locations", response_model=list[DataLocationResponse])
def list_locations(session: SessionDep):
    locs = session.exec(select(DataLocation)).all()
    return locs


@router.delete("/data-locations/{code}")
def delete_data_location(code: str, session: SessionDep):
    loc = session.exec(select(DataLocation).where(DataLocation.code == code)).first()
    if not loc:
        raise HTTPException(status_code=404, detail="Data location not found")

    runs = session.exec(select(ScraperRun).where(ScraperRun.location_code == code)).all()
    for run in runs:
        for place in session.exec(
            select(ScrapedPlace).where(ScrapedPlace.run_code == run.run_code)
        ).all():
            session.delete(place)
        for rd in session.exec(
            select(RawCollectorData).where(RawCollectorData.run_code == run.run_code)
        ).all():
            session.delete(rd)
        session.delete(run)

    session.delete(loc)
    session.commit()
    return {"status": "deleted", "code": code}


@router.get("/stats", response_model=ScraperStatsResponse)
def get_stats(session: SessionDep):
    total_locations = session.exec(select(func.count()).select_from(DataLocation)).one()
    total_runs = session.exec(select(func.count()).select_from(ScraperRun)).one()
    total_places = session.exec(select(func.count()).select_from(ScrapedPlace)).one()
    last_run = session.exec(select(ScraperRun).order_by(ScraperRun.created_at.desc())).first()
    return ScraperStatsResponse(
        total_locations=total_locations,
        total_runs=total_runs,
        total_places_scraped=total_places,
        last_run_at=last_run.created_at if last_run else None,
        last_run_status=last_run.status if last_run else None,
    )


@router.get("/runs")
def list_runs(
    session: SessionDep,
    status: str | None = Query(None),
    location_code: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=2000),
):
    base_query = select(ScraperRun)
    count_query = select(func.count()).select_from(ScraperRun)

    if status:
        base_query = base_query.where(ScraperRun.status == status)
        count_query = count_query.where(ScraperRun.status == status)
    if location_code:
        base_query = base_query.where(ScraperRun.location_code == location_code)
        count_query = count_query.where(ScraperRun.location_code == location_code)

    total = session.exec(count_query).one()
    runs = session.exec(
        base_query.order_by(ScraperRun.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    return {
        "items": [ScraperRunResponse.model_validate(r, from_attributes=True) for r in runs],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.post("/runs", response_model=ScraperRunResponse)
def create_run(body: ScraperRunCreate, background_tasks: BackgroundTasks, session: SessionDep):
    # Verify location exists
    loc = session.exec(select(DataLocation).where(DataLocation.code == body.location_code)).first()
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")

    run = ScraperRun(
        run_code=generate_code("run"), location_code=body.location_code, status="pending"
    )
    session.add(run)
    session.commit()
    session.refresh(run)

    # Trigger background task
    background_tasks.add_task(run_scraper_task, run.run_code)

    return run


@router.get("/runs/{run_code}", response_model=ScraperRunResponse)
def get_run(run_code: str, session: SessionDep):
    run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run


@router.get("/runs/{run_code}/data")
def view_data(
    run_code: str,
    session: SessionDep,
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=2000),
):
    base_query = select(ScrapedPlace).where(ScrapedPlace.run_code == run_code)
    count_query = (
        select(func.count()).select_from(ScrapedPlace).where(ScrapedPlace.run_code == run_code)
    )
    if search:
        base_query = base_query.where(ScrapedPlace.name.contains(search))
        count_query = count_query.where(ScrapedPlace.name.contains(search))

    total = session.exec(count_query).one()
    results = session.exec(base_query.offset((page - 1) * page_size).limit(page_size)).all()

    out = []
    for r in results:
        data = dict(r.raw_data)
        data["_scraped_id"] = r.place_code
        data["_enrichment_status"] = r.enrichment_status
        data["_description_source"] = r.description_source
        data["_description_score"] = r.description_score
        data["_quality_score"] = r.quality_score
        data["_quality_gate"] = r.quality_gate
        out.append(data)

    return {"items": out, "total": total, "page": page, "page_size": page_size}


@router.get("/runs/{run_code}/raw-data", response_model=list[RawCollectorDataResponse])
def view_raw_collector_data(
    run_code: str,
    session: SessionDep,
    collector: str | None = Query(None),
    place_code: str | None = Query(None),
):
    """View raw collector data for debugging."""
    query = select(RawCollectorData).where(RawCollectorData.run_code == run_code)
    if collector:
        query = query.where(RawCollectorData.collector_name == collector)
    if place_code:
        query = query.where(RawCollectorData.place_code == place_code)

    results = session.exec(query).all()
    return results


@router.post("/runs/{run_code}/sync")
def sync_run(run_code: str, background_tasks: BackgroundTasks, session: SessionDep):
    run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    server_url = os.getenv("MAIN_SERVER_URL", "http://127.0.0.1:3000")

    background_tasks.add_task(sync_run_to_server, run.run_code, server_url)

    return {"status": "sync_started", "run_code": run_code, "target_server": server_url}


@router.post("/runs/{run_code}/re-enrich")
def re_enrich_run(run_code: str, background_tasks: BackgroundTasks, session: SessionDep):
    """Re-run enrichment pipeline without re-doing discovery."""
    run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    places = session.exec(select(ScrapedPlace).where(ScrapedPlace.run_code == run_code)).all()
    if not places:
        raise HTTPException(status_code=400, detail="No places found for this run")

    # Reset enrichment status
    for place in places:
        place.enrichment_status = "pending"
        place.description_source = None
        place.description_score = None
        session.add(place)
    session.commit()

    from app.pipeline.enrichment import run_enrichment_pipeline

    background_tasks.add_task(run_enrichment_pipeline, run_code)

    return {
        "status": "re_enrichment_started",
        "run_code": run_code,
        "place_count": len(places),
    }


@router.post("/runs/{run_code}/resume")
def resume_run(run_code: str, background_tasks: BackgroundTasks, session: SessionDep):
    """Resume an interrupted, failed, or cancelled run from where it left off."""
    run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    if run.status not in ["interrupted", "failed", "cancelled"]:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot resume run with status: {run.status}. Only interrupted, failed, or cancelled runs can be resumed.",
        )

    background_tasks.add_task(resume_scraper_task, run.run_code)

    return {
        "status": run.status,
        "run_code": run_code,
        "resume_from_stage": run.stage,
        "processed_items": run.processed_items,
        "total_items": run.total_items,
    }


@router.post("/runs/{run_code}/cancel")
def cancel_run(run_code: str, session: SessionDep):
    run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    if run.status not in ["pending", "running", "interrupted"]:
        raise HTTPException(status_code=400, detail=f"Cannot cancel run with status: {run.status}")

    run.status = "cancelled"
    session.add(run)
    session.commit()
    session.refresh(run)

    return {"status": "cancelled", "run_code": run_code}


@router.delete("/runs/{run_code}")
def delete_run(run_code: str, session: SessionDep):
    run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    for place in session.exec(select(ScrapedPlace).where(ScrapedPlace.run_code == run_code)).all():
        session.delete(place)
    for rd in session.exec(
        select(RawCollectorData).where(RawCollectorData.run_code == run_code)
    ).all():
        session.delete(rd)

    session.delete(run)
    session.commit()
    return {"status": "deleted", "run_code": run_code}


@router.get("/runs/{run_code}/activity")
def get_run_activity(run_code: str, session: SessionDep):
    """Lightweight live snapshot of a run's progress — polled by the admin UI."""
    run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    cells_total = session.exec(
        select(func.count()).select_from(DiscoveryCell).where(DiscoveryCell.run_code == run_code)
    ).one()
    cells_saturated = session.exec(
        select(func.count())
        .select_from(DiscoveryCell)
        .where(DiscoveryCell.run_code == run_code)
        .where(DiscoveryCell.saturated == True)  # noqa: E712
    ).one()

    places_total = session.exec(
        select(func.count()).select_from(ScrapedPlace).where(ScrapedPlace.run_code == run_code)
    ).one()
    places_complete = session.exec(
        select(func.count())
        .select_from(ScrapedPlace)
        .where(ScrapedPlace.run_code == run_code)
        .where(ScrapedPlace.enrichment_status == "complete")
    ).one()
    places_failed = session.exec(
        select(func.count())
        .select_from(ScrapedPlace)
        .where(ScrapedPlace.run_code == run_code)
        .where(ScrapedPlace.enrichment_status == "failed")
    ).one()

    enriching = session.exec(
        select(ScrapedPlace)
        .where(ScrapedPlace.run_code == run_code)
        .where(ScrapedPlace.enrichment_status == "enriching")
        .limit(5)
    ).all()

    places_filtered = session.exec(
        select(func.count())
        .select_from(ScrapedPlace)
        .where(ScrapedPlace.run_code == run_code)
        .where(ScrapedPlace.enrichment_status == "filtered")
    ).one()

    return {
        "cells_total": cells_total,
        "cells_saturated": cells_saturated,
        "places_total": places_total,
        "places_pending": max(
            0,
            places_total - places_complete - places_failed - places_filtered - len(enriching),
        ),
        "places_enriching": [{"place_code": p.place_code, "name": p.name} for p in enriching],
        "places_complete": places_complete,
        "places_failed": places_failed,
        "places_filtered": places_filtered,
        "images_downloaded": run.images_downloaded,
        "images_failed": run.images_failed,
        "places_synced": run.places_synced,
        "places_sync_failed": run.places_sync_failed,
    }


@router.get("/runs/{run_code}/places/{place_code}/quality-breakdown")
def get_place_quality_breakdown(run_code: str, place_code: str, session: SessionDep):
    """Return a factor-by-factor quality score breakdown for a single scraped place."""
    place = session.exec(
        select(ScrapedPlace)
        .where(ScrapedPlace.run_code == run_code)
        .where(ScrapedPlace.place_code == place_code)
    ).first()
    if not place:
        raise HTTPException(status_code=404, detail="Place not found")

    from app.pipeline.place_quality import score_place_quality_breakdown

    return score_place_quality_breakdown(place.raw_data or {})


@router.get("/runs/{run_code}/cells")
def get_run_cells(
    run_code: str,
    session: SessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=2000),
):
    """Return discovery cells for a run (paginated)."""
    run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    count_q = (
        select(func.count()).select_from(DiscoveryCell).where(DiscoveryCell.run_code == run_code)
    )
    total = session.exec(count_q).one()

    cells = session.exec(
        select(DiscoveryCell)
        .where(DiscoveryCell.run_code == run_code)
        .order_by(DiscoveryCell.created_at.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    return {
        "items": [
            {
                "lat_min": c.lat_min,
                "lat_max": c.lat_max,
                "lng_min": c.lng_min,
                "lng_max": c.lng_max,
                "depth": c.depth,
                "radius_m": round(c.radius_m),
                "result_count": c.result_count,
                "saturated": c.saturated,
                "resource_names_count": len(c.resource_names or []),
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
            for c in cells
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


# ===== Collectors =====


@router.get("/collectors", response_model=list[CollectorStatusResponse])
def list_collectors():
    """List all collectors with their enabled/available status."""
    from app.collectors.registry import get_all_collectors

    collectors = get_all_collectors()
    return [
        CollectorStatusResponse(
            name=c.name,
            requires_api_key=c.requires_api_key,
            is_available=c.is_available(),
            api_key_env_var=c.api_key_env_var if c.requires_api_key else None,
        )
        for c in collectors
    ]


# ===== PlaceTypeMapping CRUD =====


@router.get("/place-type-mappings", response_model=list[PlaceTypeMappingResponse])
def list_place_type_mappings(
    session: SessionDep,
    religion: str | None = Query(None),
    source_type: str | None = Query(None),
    is_active: bool | None = Query(None),
):
    """List all place type mappings with optional filters."""
    query = select(PlaceTypeMapping)

    if religion:
        query = query.where(PlaceTypeMapping.religion == religion)
    if source_type:
        query = query.where(PlaceTypeMapping.source_type == source_type)
    if is_active is not None:
        query = query.where(PlaceTypeMapping.is_active == is_active)

    query = query.order_by(PlaceTypeMapping.religion, PlaceTypeMapping.display_order)
    mappings = session.exec(query).all()
    return mappings


@router.post("/place-type-mappings", response_model=PlaceTypeMappingResponse)
def create_place_type_mapping(body: PlaceTypeMappingCreate, session: SessionDep):
    """Create a new place type mapping."""
    mapping = PlaceTypeMapping(**body.model_dump())
    session.add(mapping)
    session.commit()
    session.refresh(mapping)
    return mapping


@router.get("/place-type-mappings/{mapping_id}", response_model=PlaceTypeMappingResponse)
def get_place_type_mapping(mapping_id: int, session: SessionDep):
    """Get a single place type mapping by ID."""
    mapping = session.get(PlaceTypeMapping, mapping_id)
    if not mapping:
        raise HTTPException(status_code=404, detail="Mapping not found")
    return mapping


@router.put("/place-type-mappings/{mapping_id}", response_model=PlaceTypeMappingResponse)
def update_place_type_mapping(mapping_id: int, body: PlaceTypeMappingUpdate, session: SessionDep):
    """Update a place type mapping."""
    mapping = session.get(PlaceTypeMapping, mapping_id)
    if not mapping:
        raise HTTPException(status_code=404, detail="Mapping not found")

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(mapping, key, value)

    session.add(mapping)
    session.commit()
    session.refresh(mapping)
    return mapping


@router.delete("/place-type-mappings/{mapping_id}")
def delete_place_type_mapping(mapping_id: int, session: SessionDep):
    """Delete a place type mapping."""
    mapping = session.get(PlaceTypeMapping, mapping_id)
    if not mapping:
        raise HTTPException(status_code=404, detail="Mapping not found")

    session.delete(mapping)
    session.commit()
    return {"status": "deleted", "mapping_id": mapping_id}


# ── Quality Metrics ─────────────────────────────────────────────────────────


@router.get("/quality-metrics", response_model=QualityMetricsResponse)
def get_quality_metrics(
    session: SessionDep,
    run_code: str | None = Query(None),
):
    """Aggregate quality scoring statistics across all runs (or a single run)."""
    # Base filter
    base_filter = [ScrapedPlace.run_code == run_code] if run_code else []

    # Fetch all quality scores for distribution / median computation
    score_query = select(ScrapedPlace.quality_score).where(*base_filter)
    all_scores = [r for r in session.exec(score_query).all() if r is not None]

    # Score distribution — 10 buckets: 0.0-0.1, 0.1-0.2, ..., 0.9-1.0
    buckets: list[ScoreBucket] = []
    for i in range(10):
        lo = round(i * 0.1, 1)
        hi = round((i + 1) * 0.1, 1)
        label = f"{lo}-{hi}"
        count = sum(1 for s in all_scores if lo <= s < hi)
        # Include 1.0 in the last bucket
        if i == 9:
            count = sum(1 for s in all_scores if lo <= s <= hi)
        buckets.append(ScoreBucket(bucket=label, count=count))

    # Gate breakdown
    gate_order = ["below_image_gate", "below_enrichment_gate", "below_sync_gate", "passed"]
    gate_counts: list[GateCount] = []
    for gate in gate_order:
        gate_query = (
            select(func.count())
            .select_from(ScrapedPlace)
            .where(ScrapedPlace.quality_gate == gate, *base_filter)
        )
        cnt = session.exec(gate_query).one()
        gate_counts.append(GateCount(gate=gate, count=cnt))

    # Near-threshold counts (±0.05 band around each gate threshold)
    thresholds = [
        ("below_image_gate", 0.20),
        ("below_enrichment_gate", 0.35),
        ("below_sync_gate", 0.40),
    ]
    near_threshold: list[NearThresholdCount] = []
    for gate_label, threshold in thresholds:
        lo = threshold - 0.05
        hi = threshold + 0.05
        count = sum(1 for s in all_scores if lo <= s <= hi)
        near_threshold.append(NearThresholdCount(gate=gate_label, threshold=threshold, count=count))

    # Avg / median score
    avg_score = (sum(all_scores) / len(all_scores)) if all_scores else None
    median_score: float | None = None
    if all_scores:
        sorted_scores = sorted(all_scores)
        n = len(sorted_scores)
        mid = n // 2
        median_score = (
            sorted_scores[mid] if n % 2 == 1 else (sorted_scores[mid - 1] + sorted_scores[mid]) / 2
        )

    # Description source breakdown
    desc_query = (
        select(ScrapedPlace.description_source, func.count())
        .where(*base_filter)
        .group_by(ScrapedPlace.description_source)
    )
    desc_rows = session.exec(desc_query).all()
    desc_breakdown = [
        DescriptionSourceCount(source=row[0] if row[0] else "none", count=row[1])
        for row in desc_rows
    ]

    # Enrichment status breakdown
    status_query = (
        select(ScrapedPlace.enrichment_status, func.count())
        .where(*base_filter)
        .group_by(ScrapedPlace.enrichment_status)
    )
    status_rows = session.exec(status_query).all()
    status_breakdown = [EnrichmentStatusCount(status=row[0], count=row[1]) for row in status_rows]

    # Per-run summary (if run_code provided, single run; else all runs)
    run_query = select(ScraperRun).order_by(ScraperRun.created_at.desc())
    if run_code:
        run_query = run_query.where(ScraperRun.run_code == run_code)
    runs = session.exec(run_query).all()

    per_run_summary: list[PerRunSummaryItem] = []
    for run in runs:
        run_filter = [ScrapedPlace.run_code == run.run_code]
        run_total = session.exec(
            select(func.count()).select_from(ScrapedPlace).where(*run_filter)
        ).one()
        run_passed = session.exec(
            select(func.count())
            .select_from(ScrapedPlace)
            .where(ScrapedPlace.quality_gate == "passed", *run_filter)
        ).one()
        run_scores = [
            r
            for r in session.exec(select(ScrapedPlace.quality_score).where(*run_filter)).all()
            if r is not None
        ]
        run_avg = (sum(run_scores) / len(run_scores)) if run_scores else None

        # Get location name
        loc = session.exec(
            select(DataLocation).where(DataLocation.code == run.location_code)
        ).first()

        per_run_summary.append(
            PerRunSummaryItem(
                run_code=run.run_code,
                location_name=loc.name if loc else None,
                status=run.status,
                total_scraped=run_total,
                total_passed=run_passed,
                avg_score=round(run_avg, 4) if run_avg is not None else None,
                created_at=run.created_at,
            )
        )

    # Overall stats
    total_scraped = session.exec(
        select(func.count()).select_from(ScrapedPlace).where(*base_filter)
    ).one()
    total_synced = session.exec(
        select(func.count())
        .select_from(ScraperRun)
        .where(
            *(
                ([ScraperRun.run_code == run_code] if run_code else [])
                + [ScraperRun.places_synced > 0]
            )
        )
    ).one()
    # Count passed as proxy for "would sync"
    total_passed_count = next((g.count for g in gate_counts if g.gate == "passed"), 0)
    filter_rate = round(
        ((total_scraped - total_passed_count) / total_scraped * 100) if total_scraped > 0 else 0.0,
        1,
    )

    return QualityMetricsResponse(
        score_distribution=buckets,
        gate_breakdown=gate_counts,
        near_threshold_counts=near_threshold,
        avg_quality_score=round(avg_score, 4) if avg_score is not None else None,
        median_quality_score=round(median_score, 4) if median_score is not None else None,
        description_source_breakdown=desc_breakdown,
        enrichment_status_breakdown=status_breakdown,
        per_run_summary=per_run_summary,
        overall_stats={
            "total_scraped": total_scraped,
            "total_synced": total_synced,
            "overall_filter_rate_pct": filter_rate,
        },
    )
