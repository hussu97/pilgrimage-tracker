"""Umami analytics proxy.

Forwards /umami/script.js and /umami/api/send to cloud.umami.is so the
Umami script is served same-origin from the catalog API, bypassing
adblockers that block direct requests to cloud.umami.is.

Firebase Hosting routes /umami/** to this Cloud Run service via a rewrite
rule in firebase.json.
"""

import logging

import httpx
from fastapi import APIRouter, Request, Response

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/umami", include_in_schema=False)

_UMAMI_BASE = "https://cloud.umami.is"
_SCRIPT_CACHE = b""
_TIMEOUT = httpx.Timeout(10.0)


@router.get("/script.js")
async def proxy_script() -> Response:
    """Proxy the Umami script from cloud.umami.is with a 24-hour cache."""
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            r = await client.get(f"{_UMAMI_BASE}/script.js")
            r.raise_for_status()
        return Response(
            content=r.content,
            media_type="application/javascript",
            headers={"Cache-Control": "public, max-age=86400"},
        )
    except Exception:
        logger.warning("umami_proxy: failed to fetch script.js from cloud.umami.is")
        return Response(content=b"", media_type="application/javascript", status_code=502)


@router.post("/api/send")
async def proxy_send(request: Request) -> Response:
    """Forward a page-view or custom event payload to cloud.umami.is/api/send."""
    try:
        body = await request.body()
        headers = {
            "Content-Type": request.headers.get("Content-Type", "application/json"),
            "User-Agent": request.headers.get("User-Agent", ""),
        }
        if client_ip := request.headers.get("X-Forwarded-For") or (
            request.client.host if request.client else None
        ):
            headers["X-Forwarded-For"] = client_ip

        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            r = await client.post(
                f"{_UMAMI_BASE}/api/send",
                content=body,
                headers=headers,
            )
        return Response(
            content=r.content,
            status_code=r.status_code,
            media_type=r.headers.get("content-type", "application/json"),
        )
    except Exception:
        logger.warning("umami_proxy: failed to forward event to cloud.umami.is")
        return Response(status_code=202)  # silently accept to avoid client-side noise
