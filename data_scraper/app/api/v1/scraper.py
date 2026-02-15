from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from sqlmodel import Session, select
from typing import List, Optional
import os

from app.db.session import get_session
from app.db.models import DataLocation, ScraperRun, ScrapedPlace
from app.models.schemas import (
    DataLocationCreate, DataLocationResponse,
    ScraperRunCreate, ScraperRunResponse
)
from app.db.scraper import generate_code, run_scraper_task, sync_run_to_server

router = APIRouter()

@router.post("/data-locations", response_model=DataLocationResponse)
def create_data_location(body: DataLocationCreate, session: Session = Depends(get_session)):
    # Extract sheet code from URL
    # Format: https://docs.google.com/spreadsheets/d/ID/edit...
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

    loc = DataLocation(
        code=generate_code("loc"),
        name=body.name,
        sheet_code=sheet_code
    )
    session.add(loc)
    session.commit()
    session.refresh(loc)
    return loc

@router.get("/data-locations", response_model=List[DataLocationResponse])
def list_locations(session: Session = Depends(get_session)):
    locs = session.exec(select(DataLocation)).all()
    return locs

@router.post("/runs", response_model=ScraperRunResponse)
def create_run(
    body: ScraperRunCreate, 
    background_tasks: BackgroundTasks, 
    session: Session = Depends(get_session)
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
def get_run(run_code: str, session: Session = Depends(get_session)):
    run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run

@router.get("/runs/{run_code}/data")
def view_data(
    run_code: str, 
    search: Optional[str] = Query(None), 
    session: Session = Depends(get_session)
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
    session: Session = Depends(get_session)
):
    run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    
    server_url = os.getenv("MAIN_SERVER_URL", "http://127.0.0.1:3000")
    
    background_tasks.add_task(sync_run_to_server, run.run_code, server_url)
    
    return {"status": "sync_started", "run_code": run_code, "target_server": server_url}

@router.post("/runs/{run_code}/cancel")
def cancel_run(run_code: str, session: Session = Depends(get_session)):
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
