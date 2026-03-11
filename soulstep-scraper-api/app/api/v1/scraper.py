import math

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
    MapCellItem,
    MapPlaceItem,
    PlaceTypeMappingCreate,
    PlaceTypeMappingResponse,
    PlaceTypeMappingUpdate,
    QualityMetricsResponse,
    RawCollectorDataResponse,
    ScraperRunCreate,
    ScraperRunResponse,
    ScraperStatsResponse,
)
from app.services.quality_metrics import compute_quality_metrics
from app.services.run_activity import get_activity_snapshot

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
def sync_run(run_code: str, background_tasks: BackgroundTasks, session: SessionDep):
    run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    from app.config import settings

    server_url = settings.main_server_url

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
def get_map_places(session: SessionDep, run_code: str | None = Query(None)):
    """Return all scraped places with valid lat/lng, optionally filtered by run."""
    q = select(ScrapedPlace)
    if run_code:
        q = q.where(ScrapedPlace.run_code == run_code)
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


@router.get("/quality-metrics", response_model=QualityMetricsResponse)
def get_quality_metrics(
    session: SessionDep,
    run_code: str | None = Query(None),
):
    """Aggregate quality scoring statistics across all runs (or a single run)."""
    return compute_quality_metrics(session, run_code)
