"""Scraper proxy endpoints.

All requests are forwarded to the data_scraper service at DATA_SCRAPER_URL.
Every endpoint requires AdminDep — non-admins receive HTTP 403.
"""

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from app.api.deps import AdminDep
from app.core import config

router = APIRouter()


async def _proxy(method: str, path: str, **kwargs) -> JSONResponse:
    """Forward a request to the scraper service and return its response."""
    url = config.DATA_SCRAPER_URL.rstrip("/") + path
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.request(method, url, **kwargs)
        return JSONResponse(status_code=resp.status_code, content=resp.json())
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="Scraper service unavailable")
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Scraper service timed out")


@router.get("/data-locations")
async def list_data_locations(admin: AdminDep):
    return await _proxy("GET", "/data-locations")


@router.post("/data-locations")
async def create_data_location(request: Request, admin: AdminDep):
    body = await request.json()
    return await _proxy("POST", "/data-locations", json=body)


@router.delete("/data-locations/{code}")
async def delete_data_location(code: str, admin: AdminDep):
    return await _proxy("DELETE", f"/data-locations/{code}")


@router.get("/runs")
async def list_runs(admin: AdminDep, request: Request):
    params = dict(request.query_params)
    return await _proxy("GET", "/runs", params=params)


@router.post("/runs")
async def start_run(request: Request, admin: AdminDep):
    body = await request.json()
    return await _proxy("POST", "/runs", json=body)


@router.get("/runs/{run_code}")
async def get_run(run_code: str, admin: AdminDep):
    return await _proxy("GET", f"/runs/{run_code}")


@router.get("/runs/{run_code}/data")
async def get_run_data(run_code: str, admin: AdminDep):
    return await _proxy("GET", f"/runs/{run_code}/data")


@router.get("/runs/{run_code}/raw-data")
async def get_run_raw_data(run_code: str, admin: AdminDep):
    return await _proxy("GET", f"/runs/{run_code}/raw-data")


@router.post("/runs/{run_code}/sync")
async def sync_run(run_code: str, admin: AdminDep):
    return await _proxy("POST", f"/runs/{run_code}/sync")


@router.post("/runs/{run_code}/re-enrich")
async def re_enrich_run(run_code: str, admin: AdminDep):
    return await _proxy("POST", f"/runs/{run_code}/re-enrich")


@router.post("/runs/{run_code}/cancel")
async def cancel_run(run_code: str, admin: AdminDep):
    return await _proxy("POST", f"/runs/{run_code}/cancel")


@router.delete("/runs/{run_code}")
async def delete_run(run_code: str, admin: AdminDep):
    return await _proxy("DELETE", f"/runs/{run_code}")


@router.get("/stats")
async def get_scraper_stats(admin: AdminDep):
    return await _proxy("GET", "/stats")


@router.get("/collectors")
async def list_collectors(admin: AdminDep):
    return await _proxy("GET", "/collectors")


@router.get("/place-type-mappings")
async def list_place_type_mappings(admin: AdminDep):
    return await _proxy("GET", "/place-type-mappings")


@router.post("/place-type-mappings")
async def create_place_type_mapping(request: Request, admin: AdminDep):
    body = await request.json()
    return await _proxy("POST", "/place-type-mappings", json=body)


@router.put("/place-type-mappings/{mapping_id}")
async def update_place_type_mapping(mapping_id: int, request: Request, admin: AdminDep):
    body = await request.json()
    return await _proxy("PUT", f"/place-type-mappings/{mapping_id}", json=body)


@router.delete("/place-type-mappings/{mapping_id}")
async def delete_place_type_mapping(mapping_id: int, admin: AdminDep):
    return await _proxy("DELETE", f"/place-type-mappings/{mapping_id}")
