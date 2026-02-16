from fastapi import APIRouter, HTTPException, BackgroundTasks, Query
from sqlmodel import select
from typing import List, Optional
import os

from app.db.session import SessionDep
from app.db.models import DataLocation, ScraperRun, ScrapedPlace, GeoBoundary, PlaceTypeMapping
from app.models.schemas import (
    DataLocationCreate, DataLocationResponse,
    ScraperRunCreate, ScraperRunResponse,
    PlaceTypeMappingCreate, PlaceTypeMappingUpdate, PlaceTypeMappingResponse
)
from app.db.scraper import generate_code, run_scraper_task, sync_run_to_server

router = APIRouter()

@router.post("/data-locations", response_model=DataLocationResponse)
def create_data_location(body: DataLocationCreate, session: SessionDep):
    config = {}

    if body.source_type == "gsheet":
        if not body.sheet_url:
            raise HTTPException(status_code=400, detail="sheet_url is required for gsheet source")

        # Extract sheet code from URL
        sheet_url = body.sheet_url
        sheet_code = None

        if "/d/" in sheet_url:
            parts = sheet_url.split("/d/")
            if len(parts) > 1:
                sheet_code = parts[1].split("/")[0]

        if not sheet_code:
            # Maybe they just provided the code?
            if len(sheet_url) > 20 and "/" not in sheet_url:
                sheet_code = sheet_url
            else:
                raise HTTPException(status_code=400, detail="Could not extract Google Sheet code from URL")

        config = {"sheet_code": sheet_code}

    elif body.source_type == "gmaps":
        # Validate either city or country is provided
        if not body.city and not body.country:
            raise HTTPException(status_code=400, detail="Either city or country is required for gmaps source")

        # Validate the boundary exists in DB
        boundary_name = body.city if body.city else body.country
        boundary = session.exec(select(GeoBoundary).where(GeoBoundary.name == boundary_name)).first()
        if not boundary:
            raise HTTPException(status_code=400, detail=f"Geographic boundary not found: {boundary_name}")

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
        source_type=body.source_type,
        config=config,
        sheet_code=config.get("sheet_code"),  # backward compat
    )
    session.add(loc)
    session.commit()
    session.refresh(loc)
    return loc

@router.get("/data-locations", response_model=List[DataLocationResponse])
def list_locations(session: SessionDep):
    locs = session.exec(select(DataLocation)).all()
    return locs

@router.post("/runs", response_model=ScraperRunResponse)
def create_run(
    body: ScraperRunCreate, 
    background_tasks: BackgroundTasks, 
    session: SessionDep
):
    # Verify location exists
    loc = session.exec(select(DataLocation).where(DataLocation.code == body.location_code)).first()
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")

    run = ScraperRun(
        run_code=generate_code("run"),
        location_code=body.location_code,
        status="pending"
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
    search: Optional[str] = Query(None)
):
    query = select(ScrapedPlace).where(ScrapedPlace.run_code == run_code)
    if search:
        # Simple wildcard search
        query = query.where(ScrapedPlace.name.contains(search))
    
    results = session.exec(query).all()
    # Return as list of raw_data enriched with our ID
    out = []
    for r in results:
        data = r.raw_data
        data["_scraped_id"] = r.place_code
        out.append(data)
    return out

@router.post("/runs/{run_code}/sync")
def sync_run(
    run_code: str, 
    background_tasks: BackgroundTasks, 
    session: SessionDep
):
    run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    
    server_url = os.getenv("MAIN_SERVER_URL", "http://127.0.0.1:3000")
    
    background_tasks.add_task(sync_run_to_server, run.run_code, server_url)
    
    return {"status": "sync_started", "run_code": run_code, "target_server": server_url}

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


# ===== PlaceTypeMapping CRUD =====

@router.get("/place-type-mappings", response_model=List[PlaceTypeMappingResponse])
def list_place_type_mappings(
    session: SessionDep,
    religion: Optional[str] = Query(None),
    source_type: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None)
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
def create_place_type_mapping(
    body: PlaceTypeMappingCreate,
    session: SessionDep
):
    """Create a new place type mapping."""
    mapping = PlaceTypeMapping(**body.model_dump())
    session.add(mapping)
    session.commit()
    session.refresh(mapping)
    return mapping


@router.get("/place-type-mappings/{mapping_id}", response_model=PlaceTypeMappingResponse)
def get_place_type_mapping(
    mapping_id: int,
    session: SessionDep
):
    """Get a single place type mapping by ID."""
    mapping = session.get(PlaceTypeMapping, mapping_id)
    if not mapping:
        raise HTTPException(status_code=404, detail="Mapping not found")
    return mapping


@router.put("/place-type-mappings/{mapping_id}", response_model=PlaceTypeMappingResponse)
def update_place_type_mapping(
    mapping_id: int,
    body: PlaceTypeMappingUpdate,
    session: SessionDep
):
    """Update a place type mapping."""
    mapping = session.get(PlaceTypeMapping, mapping_id)
    if not mapping:
        raise HTTPException(status_code=404, detail="Mapping not found")

    # Update only provided fields
    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(mapping, key, value)

    session.add(mapping)
    session.commit()
    session.refresh(mapping)
    return mapping


@router.delete("/place-type-mappings/{mapping_id}")
def delete_place_type_mapping(
    mapping_id: int,
    session: SessionDep
):
    """Delete a place type mapping."""
    mapping = session.get(PlaceTypeMapping, mapping_id)
    if not mapping:
        raise HTTPException(status_code=404, detail="Mapping not found")

    session.delete(mapping)
    session.commit()
    return {"status": "deleted", "mapping_id": mapping_id}
