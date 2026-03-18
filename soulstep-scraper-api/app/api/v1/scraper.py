import math

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from sqlalchemy import delete as _delete
from sqlalchemy import update as _update
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
from app.db.scraper import generate_code, sync_run_to_server
from app.db.session import SessionDep
from app.jobs.dispatcher import cancel_cloud_run_execution, dispatch_resume, dispatch_run
from app.logger import get_logger
from app.models.schemas import (
    CollectorStatusResponse,
    DataLocationCreate,
    DataLocationResponse,
    MapCellItem,
    MapPlaceItem,
    PlaceTypeMappingCreate,
    PlaceTypeMappingResponse,
    PlaceTypeMappingUpdate,
    QualityMetricsResponse,
    RawCollectorDataResponse,
    ScraperRunCreate,
    ScraperRunResponse,
    ScraperRunsCreateResponse,
    ScraperStatsResponse,
)
from app.services.quality_metrics import compute_quality_metrics
from app.services.run_activity import get_activity_snapshot

logger = get_logger(__name__)
router = APIRouter()

_TERMINAL_STATUSES = {"completed", "interrupted", "failed", "cancelled"}


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

    run_codes = session.exec(
        select(ScraperRun.run_code).where(ScraperRun.location_code == code)
    ).all()
    for run_code in run_codes:
        session.exec(_delete(ScrapedPlace).where(ScrapedPlace.run_code == run_code))
        session.exec(_delete(RawCollectorData).where(RawCollectorData.run_code == run_code))
        session.exec(_delete(DiscoveryCell).where(DiscoveryCell.run_code == run_code))
    session.exec(_delete(ScraperRun).where(ScraperRun.location_code == code))

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


@router.post("/runs", response_model=ScraperRunsCreateResponse)
def create_run(body: ScraperRunCreate, background_tasks: BackgroundTasks, session: SessionDep):
    from app.config import settings
    from app.scrapers.geo_utils import get_boundary_boxes

    loc = session.exec(select(DataLocation).where(DataLocation.code == body.location_code)).first()
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")

    is_country = "country" in loc.config
    should_fan_out = is_country and settings.scraper_dispatch == "cloud_run"
    created_runs: list[ScraperRun] = []

    if should_fan_out:
        country_name = loc.config["country"]
        boundary = session.exec(select(GeoBoundary).where(GeoBoundary.name == country_name)).first()
        boxes = get_boundary_boxes(boundary, session) if boundary else []
        for box in boxes:
            run = ScraperRun(
                run_code=generate_code("run"),
                location_code=body.location_code,
                status="pending",
                geo_box_label=box.label,
            )
            session.add(run)
            created_runs.append(run)
        session.commit()
        for run in created_runs:
            session.refresh(run)
            dispatch_run(run.run_code, background_tasks)
    else:
        run = ScraperRun(
            run_code=generate_code("run"), location_code=body.location_code, status="pending"
        )
        session.add(run)
        session.commit()
        session.refresh(run)
        dispatch_run(run.run_code, background_tasks)
        created_runs = [run]

    return ScraperRunsCreateResponse(
        runs=[ScraperRunResponse.model_validate(r, from_attributes=True) for r in created_runs]
    )


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
        search_filter = (ScrapedPlace.name.contains(search)) | (
            ScrapedPlace.place_code.contains(search)
        )
        base_query = base_query.where(search_filter)
        count_query = count_query.where(search_filter)

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
def sync_run(
    run_code: str,
    background_tasks: BackgroundTasks,
    session: SessionDep,
    failed_only: bool = Query(
        False, description="Retry only places that failed in the previous sync"
    ),
):
    run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    if run.status not in _TERMINAL_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot sync run with status '{run.status}'. Run must be completed, interrupted, failed, or cancelled.",
        )

    if failed_only and not run.sync_failure_details:
        raise HTTPException(status_code=400, detail="No sync failures recorded for this run")

    from app.config import settings

    server_url = settings.main_server_url

    background_tasks.add_task(sync_run_to_server, run.run_code, server_url, failed_only)

    return {
        "status": "sync_started",
        "run_code": run_code,
        "target_server": server_url,
        "failed_only": failed_only,
    }


@router.post("/runs/{run_code}/re-enrich")
def re_enrich_run(run_code: str, background_tasks: BackgroundTasks, session: SessionDep):
    """Re-run enrichment pipeline without re-doing discovery."""
    run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    if run.status not in _TERMINAL_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot re-enrich run with status '{run.status}'. Run must be completed, interrupted, failed, or cancelled.",
        )

    place_count = session.exec(
        select(func.count()).select_from(ScrapedPlace).where(ScrapedPlace.run_code == run_code)
    ).one()
    if not place_count:
        raise HTTPException(status_code=400, detail="No places found for this run")

    session.exec(
        _update(ScrapedPlace)
        .where(ScrapedPlace.run_code == run_code)
        .values(enrichment_status="pending", description_source=None, description_score=None)
    )
    session.commit()

    from app.pipeline.enrichment import run_enrichment_pipeline

    background_tasks.add_task(run_enrichment_pipeline, run_code)

    return {
        "status": "re_enrichment_started",
        "run_code": run_code,
        "place_count": place_count,
    }


@router.post("/runs/{run_code}/resume")
def resume_run(run_code: str, background_tasks: BackgroundTasks, session: SessionDep):
    """Resume an interrupted, failed, or cancelled run from where it left off.

    Cloud Run mode: checks whether the existing Cloud Run execution is still
    active before dispatching.  If it is, returns 409 so the caller knows not
    to double-dispatch.  If it has finished (or no execution was ever recorded),
    a new execution is created and its name stored on the run.
    """
    from app.config import settings
    from app.jobs.dispatcher import is_cloud_run_execution_active

    run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    if run.status not in ["interrupted", "failed", "cancelled"]:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot resume run with status: {run.status}. Only interrupted, failed, or cancelled runs can be resumed.",
        )

    if settings.scraper_dispatch == "cloud_run" and run.cloud_run_execution:
        if is_cloud_run_execution_active(run.cloud_run_execution):
            raise HTTPException(
                status_code=409,
                detail=f"Cloud Run execution {run.cloud_run_execution} is still active. Wait for it to finish or cancel it before resuming.",
            )

    dispatch_resume(run.run_code, background_tasks)

    return {
        "status": run.status,
        "run_code": run_code,
        "resume_from_stage": run.stage,
        "processed_items": run.processed_items,
        "total_items": run.total_items,
    }


@router.post("/runs/{run_code}/cancel")
def cancel_run(run_code: str, session: SessionDep):
    from app.config import settings

    run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    if run.status not in ["pending", "running", "interrupted"]:
        raise HTTPException(status_code=400, detail=f"Cannot cancel run with status: {run.status}")

    run.status = "cancelled"
    session.add(run)
    session.commit()
    session.refresh(run)

    # Terminate the Cloud Run execution so the container stops immediately
    # rather than waiting for the scraper's next DB-poll cycle (up to ~10 s).
    if settings.scraper_dispatch == "cloud_run" and run.cloud_run_execution:
        cancel_cloud_run_execution(run.cloud_run_execution)

    return {"status": "cancelled", "run_code": run_code}


@router.get("/runs/{run_code}/place-codes")
def get_run_place_codes(run_code: str, session: SessionDep) -> list[str]:
    """Return all place_codes scraped in a given run (lightweight list for deletion)."""
    run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    places = session.exec(
        select(ScrapedPlace.place_code).where(ScrapedPlace.run_code == run_code)
    ).all()
    return list(places)


@router.delete("/runs/{run_code}")
def delete_run(run_code: str, session: SessionDep):
    run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    session.exec(_delete(ScrapedPlace).where(ScrapedPlace.run_code == run_code))
    session.exec(_delete(RawCollectorData).where(RawCollectorData.run_code == run_code))
    session.exec(_delete(DiscoveryCell).where(DiscoveryCell.run_code == run_code))

    session.delete(run)
    session.commit()
    return {"status": "deleted", "run_code": run_code}


@router.get("/runs/{run_code}/activity")
def get_run_activity(run_code: str, session: SessionDep):
    """Lightweight live snapshot of a run's progress — polled by the admin UI."""
    run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    return get_activity_snapshot(run_code, session)


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


def _cell_dimensions(c) -> dict:
    center_lat = (c.lat_min + c.lat_max) / 2
    height_m = abs(c.lat_max - c.lat_min) * 111_000
    width_m = abs(c.lng_max - c.lng_min) * 111_000 * abs(math.cos(math.radians(center_lat)))
    area_m2 = height_m * width_m
    return {
        "width_m": round(width_m),
        "height_m": round(height_m),
        "area_m2": round(area_m2),
    }


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
                **_cell_dimensions(c),
            }
            for c in cells
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


# ===== Map Endpoints =====


def _extract_lat_lng(raw_data: dict) -> tuple[float, float] | None:
    try:
        lat = float(raw_data.get("lat") or 0)
        lng = float(raw_data.get("lng") or 0)
        return (lat, lng) if lat != 0.0 or lng != 0.0 else None
    except (TypeError, ValueError):
        return None


@router.get("/map/cells", response_model=list[MapCellItem])
def get_map_cells(session: SessionDep, run_code: str | None = Query(None)):
    """Return all leaf (non-saturated) discovery cells, optionally filtered by run."""
    q = select(DiscoveryCell).where(DiscoveryCell.saturated == False)  # noqa: E712
    if run_code:
        q = q.where(DiscoveryCell.run_code == run_code)
    return [
        MapCellItem(
            lat_min=c.lat_min,
            lat_max=c.lat_max,
            lng_min=c.lng_min,
            lng_max=c.lng_max,
            depth=c.depth,
            result_count=c.result_count,
            run_code=c.run_code,
        )
        for c in session.exec(q).all()
    ]


@router.get("/map/places", response_model=list[MapPlaceItem])
def get_map_places(
    session: SessionDep,
    run_code: str | None = Query(None),
    limit: int = Query(5000, ge=1, le=10000),
):
    """Return scraped places with valid lat/lng, optionally filtered by run."""
    q = select(ScrapedPlace)
    if run_code:
        q = q.where(ScrapedPlace.run_code == run_code)
    q = q.limit(limit)
    out = []
    for p in session.exec(q).all():
        coords = _extract_lat_lng(p.raw_data or {})
        if coords:
            lat, lng = coords
            out.append(
                MapPlaceItem(
                    place_code=p.place_code,
                    name=p.name,
                    lat=lat,
                    lng=lng,
                    enrichment_status=p.enrichment_status,
                    quality_gate=p.quality_gate,
                    quality_score=p.quality_score,
                    run_code=p.run_code,
                )
            )
    return out


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


@router.get("/runs/{run_code}/sync-report")
def get_sync_report(run_code: str, session: SessionDep):
    """Return a detailed sync report for a completed run.

    Includes:
    - Summary counts (synced, failed, quality-filtered, name-filtered)
    - List of failed place codes with error reasons (up to 500)
    - Quality breakdown by enrichment status
    """
    run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    def _count_enrichment(status: str) -> int:
        return session.exec(
            select(func.count())
            .select_from(ScrapedPlace)
            .where(ScrapedPlace.run_code == run_code)
            .where(ScrapedPlace.enrichment_status == status)
        ).one()

    total_scraped = session.exec(
        select(func.count()).select_from(ScrapedPlace).where(ScrapedPlace.run_code == run_code)
    ).one()
    enrichment_complete = _count_enrichment("complete")
    enrichment_failed = _count_enrichment("failed")
    enrichment_filtered = _count_enrichment("filtered")

    gate_counts = session.exec(
        select(ScrapedPlace.quality_gate, func.count())
        .where(ScrapedPlace.run_code == run_code)
        .where(ScrapedPlace.quality_gate.is_not(None))
        .group_by(ScrapedPlace.quality_gate)
    ).all()
    quality_by_gate = dict(gate_counts)

    return {
        "run_code": run_code,
        "status": run.status,
        "summary": {
            "total_scraped": total_scraped,
            "places_synced": run.places_synced,
            "places_sync_failed": run.places_sync_failed,
            "places_quality_filtered": run.places_sync_quality_filtered,
            "places_name_filtered": run.places_sync_name_filtered,
        },
        "enrichment": {
            "complete": enrichment_complete,
            "failed": enrichment_failed,
            "filtered": enrichment_filtered,
        },
        "quality_gate_breakdown": quality_by_gate,
        "sync_failures": run.sync_failure_details or [],
    }


@router.get("/quality-metrics", response_model=QualityMetricsResponse)
def get_quality_metrics(
    session: SessionDep,
    run_code: str | None = Query(None),
):
    """Aggregate quality scoring statistics across all runs (or a single run)."""
    return compute_quality_metrics(session, run_code)


# ── Debug / Diagnostic ───────────────────────────────────────────────────────


@router.get("/debug/cell-viewport")
async def debug_cell_viewport(
    lat_min: float = Query(..., description="South edge of cell"),
    lat_max: float = Query(..., description="North edge of cell"),
    lng_min: float = Query(..., description="West edge of cell"),
    lng_max: float = Query(..., description="East edge of cell"),
    place_type: str = Query("mosque", description="Google Maps place type to search"),
):
    """Navigate the browser to a cell and return a screenshot + zoom info.

    Useful for verifying that the computed zoom level tightly constrains the
    Maps viewport to the cell's bounding box before running a full scrape.

    Returns JSON with:
    - zoom: zoom level that will be used for this cell
    - url: the exact Google Maps URL the scraper will navigate to
    - place_ids_found: number of place IDs extracted after scrolling
    - place_ids: list of resource names (places/ChIJ...)
    - screenshot_b64: base64-encoded PNG of the Maps viewport
    - cell_size_km: approximate cell dimensions
    """
    import base64

    from app.scrapers.gmaps_browser import (
        _cell_size_to_zoom,
        _check_for_block,
        _dismiss_consent,
        _extract_place_ids_from_links,
        _scroll_until_stable,
    )
    from app.services.browser_pool import get_maps_pool

    center_lat = (lat_min + lat_max) / 2.0
    center_lng = (lng_min + lng_max) / 2.0
    zoom = _cell_size_to_zoom(lat_min, lat_max, lng_min, lng_max)

    cos_lat = abs(math.cos(math.radians(center_lat)))
    cell_height_km = abs(lat_max - lat_min) * 111.0
    cell_width_km = abs(lng_max - lng_min) * 111.0 * cos_lat

    search_url = (
        f"https://www.google.com/maps/search/{place_type}"
        f"/@{center_lat:.6f},{center_lng:.6f},{zoom}z"
        f"?hl=en"
    )

    pool = get_maps_pool()
    session_obj = await pool.acquire(lat=center_lat, lng=center_lng)
    place_ids: list[str] = []
    screenshot_b64 = ""
    blocked = False

    try:
        page = session_obj.page
        await page.goto(search_url, wait_until="domcontentloaded", timeout=30000)

        import asyncio as _asyncio

        await _asyncio.sleep(2.5)
        await _dismiss_consent(page)

        if await _check_for_block(page):
            blocked = True
        else:
            pool.record_success()
            try:
                await page.wait_for_selector(
                    '[role="feed"], .m6QErb, [aria-label*="Results"]',
                    timeout=15000,
                )
            except Exception:
                pass

            await _asyncio.sleep(1.5)
            await _scroll_until_stable(page)

            hrefs = await page.evaluate(
                """
                () => {
                    const links = document.querySelectorAll('a[href*="/maps/place/"]');
                    return Array.from(links).map(a => a.href).filter(h => h.includes('/maps/place/'));
                }
                """
            )
            place_ids = _extract_place_ids_from_links(hrefs)

        screenshot_bytes = await page.screenshot(full_page=False)
        screenshot_b64 = base64.b64encode(screenshot_bytes).decode()
        session_obj.nav_count += 1

    except Exception as exc:
        await pool.release(session_obj, recycle=True)
        raise HTTPException(status_code=500, detail=f"Browser error: {exc}") from exc

    await pool.release(session_obj, recycle=blocked)

    return {
        "zoom": zoom,
        "url": search_url,
        "center": {"lat": center_lat, "lng": center_lng},
        "cell_size_km": {
            "width": round(cell_width_km, 3),
            "height": round(cell_height_km, 3),
        },
        "place_ids_found": len(place_ids),
        "place_ids": place_ids,
        "blocked": blocked,
        "screenshot_b64": screenshot_b64,
    }
