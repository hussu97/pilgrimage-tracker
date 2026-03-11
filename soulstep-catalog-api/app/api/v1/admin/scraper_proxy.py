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

# GCP metadata server — available on Cloud Run, GCE, etc.
_METADATA_TOKEN_URL = (
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity"
)


async def _identity_token(audience: str) -> str | None:
    """Fetch a GCP OIDC identity token for service-to-service auth.

    The scraper is deployed with --no-allow-unauthenticated, so the catalog
    API must present a valid identity token signed for the scraper's URL.
    Returns None when not running on GCP (local dev) so the proxy still
    works without a token in that environment.
    """
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                _METADATA_TOKEN_URL,
                params={"audience": audience},
                headers={"Metadata-Flavor": "Google"},
            )
            resp.raise_for_status()
            return resp.text
    except Exception:
        return None


async def _proxy(method: str, path: str, **kwargs) -> JSONResponse:
    """Forward a request to the scraper service and return its response."""
    base = config.DATA_SCRAPER_URL.rstrip("/")
    url = base + "/api/v1/scraper" + path
    try:
        token = await _identity_token(base)
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.request(method, url, headers=headers, **kwargs)
        try:
            content = resp.json() if resp.content else None
        except Exception:
            content = {"detail": resp.text}
        return JSONResponse(status_code=resp.status_code, content=content)
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
async def get_run_data(run_code: str, admin: AdminDep, request: Request):
    params = dict(request.query_params)
    return await _proxy("GET", f"/runs/{run_code}/data", params=params)


@router.get("/runs/{run_code}/raw-data")
async def get_run_raw_data(run_code: str, admin: AdminDep, request: Request):
    params = dict(request.query_params)
    return await _proxy("GET", f"/runs/{run_code}/raw-data", params=params)


@router.post("/runs/{run_code}/sync")
async def sync_run(run_code: str, admin: AdminDep):
    return await _proxy("POST", f"/runs/{run_code}/sync")


@router.post("/runs/{run_code}/re-enrich")
async def re_enrich_run(run_code: str, admin: AdminDep):
    return await _proxy("POST", f"/runs/{run_code}/re-enrich")


@router.post("/runs/{run_code}/resume")
async def resume_run(run_code: str, admin: AdminDep):
    return await _proxy("POST", f"/runs/{run_code}/resume")


@router.post("/runs/{run_code}/cancel")
async def cancel_run(run_code: str, admin: AdminDep):
    return await _proxy("POST", f"/runs/{run_code}/cancel")


@router.delete("/runs/{run_code}")
async def delete_run(run_code: str, admin: AdminDep):
    return await _proxy("DELETE", f"/runs/{run_code}")


@router.get("/runs/{run_code}/activity")
async def get_run_activity(run_code: str, admin: AdminDep):
    return await _proxy("GET", f"/runs/{run_code}/activity")


@router.get("/runs/{run_code}/cells")
async def get_run_cells(run_code: str, admin: AdminDep, request: Request):
    params = dict(request.query_params)
    return await _proxy("GET", f"/runs/{run_code}/cells", params=params)


@router.get("/stats")
async def get_scraper_stats(admin: AdminDep):
    return await _proxy("GET", "/stats")


@router.get("/collectors")
async def list_collectors(admin: AdminDep):
    return await _proxy("GET", "/collectors")


@router.get("/quality-metrics")
async def get_quality_metrics(admin: AdminDep, request: Request):
    params = dict(request.query_params)
    return await _proxy("GET", "/quality-metrics", params=params)


@router.get("/place-type-mappings")
async def list_place_type_mappings(admin: AdminDep, request: Request):
    params = dict(request.query_params)
    return await _proxy("GET", "/place-type-mappings", params=params)


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
