import os

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from sqlmodel import select

from app.db.models import (
    DataLocation,
    GeoBoundary,
    PlaceTypeMapping,
    RawCollectorData,
    ScrapedPlace,
    ScraperRun,
)
from app.db.scraper import generate_code, run_scraper_task, sync_run_to_server
from app.db.session import SessionDep
from app.models.schemas import (
    CollectorStatusResponse,
    DataLocationCreate,
    DataLocationResponse,
    PlaceTypeMappingCreate,
    PlaceTypeMappingResponse,
    PlaceTypeMappingUpdate,
    RawCollectorDataResponse,
    ScraperRunCreate,
    ScraperRunResponse,
)

router = APIRouter()


@router.post("/data-locations", response_model=DataLocationResponse)
def create_data_location(body: DataLocationCreate, session: SessionDep):
    # Validate either city or country is provided
    if not body.city and not body.country:
        raise HTTPException(
            status_code=400, detail="Either city or country is required for gmaps source"
        )

    # Validate the boundary exists in DB
    boundary_name = body.city if body.city else body.country
    boundary = session.exec(select(GeoBoundary).where(GeoBoundary.name == boundary_name)).first()
    if not boundary:
        raise HTTPException(
            status_code=400, detail=f"Geographic boundary not found: {boundary_name}"
        )

    config = {
        "max_results": body.max_results or 5  # Default to 5 for testing
    }

    # Add city or country to config
    if body.city:
        config["city"] = body.city
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
def view_data(run_code: str, session: SessionDep, search: str | None = Query(None)):
    query = select(ScrapedPlace).where(ScrapedPlace.run_code == run_code)
    if search:
        query = query.where(ScrapedPlace.name.contains(search))

    results = session.exec(query).all()
    out = []
    for r in results:
        data = r.raw_data
        data["_scraped_id"] = r.place_code
        data["_enrichment_status"] = r.enrichment_status
        data["_description_source"] = r.description_source
        data["_description_score"] = r.description_score
        out.append(data)
    return out


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


@router.post("/runs/{run_code}/cancel")
def cancel_run(run_code: str, session: SessionDep):
    run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    if run.status not in ["pending", "running"]:
        raise HTTPException(status_code=400, detail=f"Cannot cancel run with status: {run.status}")

    run.status = "cancelled"
    session.add(run)
    session.commit()
    session.refresh(run)

    return {"status": "cancelled", "run_code": run_code}


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
