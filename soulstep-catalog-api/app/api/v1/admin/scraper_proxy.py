"""Scraper proxy endpoints.

All requests are forwarded to the data_scraper service at DATA_SCRAPER_URL.
Every endpoint requires AdminDep — non-admins receive HTTP 403.
"""

import logging

import httpx
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import JSONResponse

from app.api.deps import AdminDep
from app.core import config
from app.db.session import SessionDep

logger = logging.getLogger(__name__)

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
            logger.debug(
                "scraper_proxy: identity token obtained",
                extra={"audience": audience},
            )
            return resp.text
    except Exception as exc:
        logger.warning(
            "scraper_proxy: failed to fetch identity token — request will proceed without auth"
            " (expected in local dev; in production this means the metadata server is unreachable"
            " and the scraper will reject the request with 403)",
            extra={
                "audience": audience,
                "error.type": type(exc).__name__,
                "error.message": str(exc),
            },
        )
        return None


async def _proxy(method: str, path: str, **kwargs) -> JSONResponse:
    """Forward a request to the scraper service and return its response."""
    base = config.DATA_SCRAPER_URL.rstrip("/")
    url = base + "/api/v1/scraper" + path
    logger.info(
        "scraper_proxy: forwarding request",
        extra={"proxy.method": method, "proxy.url": url},
    )
    try:
        token = await _identity_token(base)
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        if not token:
            logger.warning(
                "scraper_proxy: no identity token — forwarding without Authorization header",
                extra={"proxy.method": method, "proxy.url": url},
            )
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.request(method, url, headers=headers, **kwargs)
        try:
            content = resp.json() if resp.content else None
        except Exception:
            content = {"detail": resp.text}
        if resp.status_code >= 400:
            logger.warning(
                "scraper_proxy: upstream returned error",
                extra={
                    "proxy.method": method,
                    "proxy.url": url,
                    "proxy.status_code": resp.status_code,
                    "proxy.response_body": resp.text[:500] if resp.text else None,
                },
            )
        else:
            logger.info(
                "scraper_proxy: upstream responded",
                extra={
                    "proxy.method": method,
                    "proxy.url": url,
                    "proxy.status_code": resp.status_code,
                },
            )
        return JSONResponse(status_code=resp.status_code, content=content)
    except httpx.ConnectError as exc:
        logger.error(
            "scraper_proxy: connection error — scraper service unreachable",
            extra={
                "proxy.method": method,
                "proxy.url": url,
                "proxy.scraper_base_url": base,
                "error.type": type(exc).__name__,
                "error.message": str(exc),
            },
        )
        raise HTTPException(status_code=503, detail="Scraper service unavailable")
    except httpx.TimeoutException as exc:
        logger.error(
            "scraper_proxy: timeout waiting for scraper service",
            extra={
                "proxy.method": method,
                "proxy.url": url,
                "error.type": type(exc).__name__,
            },
        )
        raise HTTPException(status_code=504, detail="Scraper service timed out")


async def _proxy_json(method: str, path: str, **kwargs):
    """Forward a request to the scraper service and return parsed JSON content."""
    base = config.DATA_SCRAPER_URL.rstrip("/")
    url = base + "/api/v1/scraper" + path
    try:
        token = await _identity_token(base)
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.request(method, url, headers=headers, **kwargs)
        if not resp.content:
            return None
        try:
            return resp.json()
        except Exception:
            return None
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
async def resume_run(run_code: str, admin: AdminDep, force: bool = Query(False)):
    params = {"force": str(force).lower()} if force else None
    return await _proxy("POST", f"/runs/{run_code}/resume", params=params)


@router.post("/runs/{run_code}/cancel")
async def cancel_run(run_code: str, admin: AdminDep):
    return await _proxy("POST", f"/runs/{run_code}/cancel")


@router.post("/runs/{run_code}/retry-images")
async def retry_images(run_code: str, admin: AdminDep):
    return await _proxy("POST", f"/runs/{run_code}/retry-images")


@router.delete("/runs/{run_code}")
async def delete_run(
    run_code: str,
    admin: AdminDep,
    session: SessionDep,
    delete_catalog_places: bool = Query(False),
):
    if delete_catalog_places:
        from sqlmodel import select

        from app.api.v1.admin.places import _delete_place_records
        from app.db.models import Place

        place_codes = await _proxy_json("GET", f"/runs/{run_code}/place-codes")
        if isinstance(place_codes, list) and place_codes:
            for pc in place_codes:
                place = session.exec(select(Place).where(Place.place_code == pc)).first()
                if place:
                    _delete_place_records(session, pc)
            session.commit()

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


@router.post("/cleanup/images")
async def cleanup_images(admin: AdminDep):
    """Trigger the scraper's image cleanup worker.

    Retries image downloads for all ScrapedPlaces that have pending image_urls
    but no image_blobs. Runs in the background on the scraper service; results
    are written to the scraper service logs.
    """
    return await _proxy("POST", "/cleanup/images")


@router.get("/runs/{run_code}/places/{place_code}/quality-breakdown")
async def get_place_quality_breakdown(run_code: str, place_code: str, admin: AdminDep):
    return await _proxy("GET", f"/runs/{run_code}/places/{place_code}/quality-breakdown")


@router.get("/map/cells")
async def get_map_cells(admin: AdminDep, request: Request):
    params = dict(request.query_params)
    return await _proxy("GET", "/map/cells", params=params)


@router.get("/map/places")
async def get_map_places(admin: AdminDep, request: Request):
    params = dict(request.query_params)
    return await _proxy("GET", "/map/places", params=params)


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
