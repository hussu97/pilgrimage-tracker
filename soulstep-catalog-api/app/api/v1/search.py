"""
Search proxy endpoints — keeps Google Places API key server-side.
"""

import logging
import threading
import time

import requests
from fastapi import APIRouter, Query, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core import config
from app.services.query_log import log_query

logger = logging.getLogger(__name__)

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

GOOGLE_PLACES_AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete"
GOOGLE_PLACE_DETAILS_URL = "https://places.googleapis.com/v1/places/{place_id}"

# ---------------------------------------------------------------------------
# In-process TTL cache for autocomplete (avoids redundant Google API calls
# from keystroke-by-keystroke typing). Thread-safe via a single lock.
# TTL: 10 minutes. Max: 500 entries (oldest evicted when full).
# ---------------------------------------------------------------------------
_AUTOCOMPLETE_CACHE_TTL = 600  # seconds
_AUTOCOMPLETE_CACHE_MAX = 500
_autocomplete_cache: dict[tuple, tuple[float, dict]] = {}  # key → (expires_at, result)
_autocomplete_lock = threading.Lock()


def _cache_key(q: str, lat: float | None, lng: float | None) -> tuple:
    """Stable cache key: normalise query, bucket lat/lng to 0.1° (~11 km)."""
    lat_bucket = round(lat, 1) if lat is not None else None
    lng_bucket = round(lng, 1) if lng is not None else None
    return (q.lower().strip(), lat_bucket, lng_bucket)


def _cache_get(key: tuple) -> dict | None:
    with _autocomplete_lock:
        entry = _autocomplete_cache.get(key)
        if entry is None:
            return None
        expires_at, result = entry
        if time.monotonic() > expires_at:
            del _autocomplete_cache[key]
            return None
        return result


def _cache_set(key: tuple, result: dict) -> None:
    with _autocomplete_lock:
        # Evict oldest entry if at capacity (simple FIFO)
        if len(_autocomplete_cache) >= _AUTOCOMPLETE_CACHE_MAX:
            oldest = next(iter(_autocomplete_cache))
            del _autocomplete_cache[oldest]
        _autocomplete_cache[key] = (time.monotonic() + _AUTOCOMPLETE_CACHE_TTL, result)


@router.get("/autocomplete")
@limiter.limit("30/minute")
def autocomplete(
    request: Request,
    q: str = Query(..., min_length=2),
    lat: float | None = Query(default=None),
    lng: float | None = Query(default=None),
):
    """Proxy to Google Places autocomplete. Returns suggestions list.

    Results are cached in-process for 10 minutes to avoid redundant API calls
    from keystroke-by-keystroke typing in the frontend search box.
    """
    api_key = config.GOOGLE_MAPS_API_KEY
    if not api_key:
        logger.warning("GOOGLE_MAPS_API_KEY is not configured — autocomplete disabled")
        return {"suggestions": [], "error": "search_not_configured"}

    # Cache hit — return without calling Google
    ck = _cache_key(q, lat, lng)
    cached = _cache_get(ck)
    if cached is not None:
        return cached

    payload: dict = {"input": q}
    if lat is not None and lng is not None:
        payload["locationBias"] = {
            "circle": {
                "center": {"latitude": lat, "longitude": lng},
                "radius": 50000.0,
            }
        }

    try:
        t0 = time.perf_counter()
        resp = requests.post(
            GOOGLE_PLACES_AUTOCOMPLETE_URL,
            json=payload,
            headers={
                "Content-Type": "application/json",
                "X-Goog-Api-Key": api_key,
            },
            timeout=5,
        )
        duration_ms = (time.perf_counter() - t0) * 1000
        resp.raise_for_status()
        data = resp.json()
        log_query(
            "gmaps",
            "autocomplete",
            "POST",
            resp.status_code,
            duration_ms,
            "autocomplete",
            request_info={"q": q[:50]},
            response_info={"count": len(data.get("suggestions", []))},
        )
    except Exception as exc:
        logger.error("Google Places autocomplete failed: %s", exc)
        log_query(
            "gmaps",
            "autocomplete",
            "POST",
            None,
            0.0,
            "autocomplete",
            request_info={"q": q[:50]},
            error=str(exc),
        )
        return {"suggestions": [], "error": "search_unavailable"}

    suggestions = []
    for item in data.get("suggestions", []):
        place_pred = item.get("placePrediction", {})
        place_id = place_pred.get("placeId", "")
        structured = place_pred.get("structuredFormat", {})
        main_text = structured.get("mainText", {}).get(
            "text", place_pred.get("text", {}).get("text", "")
        )
        secondary_text = structured.get("secondaryText", {}).get("text", "")
        if place_id and main_text:
            suggestions.append(
                {
                    "place_id": place_id,
                    "main_text": main_text,
                    "secondary_text": secondary_text,
                }
            )

    result = {"suggestions": suggestions}
    _cache_set(ck, result)
    return result


@router.get("/place-details")
@limiter.limit("30/minute")
def place_details(request: Request, place_id: str = Query(...)):
    """Proxy to Google Place Details. Returns lat/lng and display info."""
    api_key = config.GOOGLE_MAPS_API_KEY
    if not api_key:
        logger.warning("GOOGLE_MAPS_API_KEY is not configured — place details disabled")
        return {
            "error": "search_not_configured",
            "place_id": place_id,
            "name": "",
            "address": "",
            "lat": 0.0,
            "lng": 0.0,
        }

    url = GOOGLE_PLACE_DETAILS_URL.format(place_id=place_id)
    try:
        t0 = time.perf_counter()
        resp = requests.get(
            url,
            headers={
                "X-Goog-Api-Key": api_key,
                "X-Goog-FieldMask": "id,displayName,formattedAddress,location",
            },
            timeout=5,
        )
        duration_ms = (time.perf_counter() - t0) * 1000
        resp.raise_for_status()
        data = resp.json()
        log_query(
            "gmaps",
            "placeDetails",
            "GET",
            resp.status_code,
            duration_ms,
            "place_details",
            request_info={"place_id": place_id},
        )
    except Exception as exc:
        logger.error("Google Places details failed for %s: %s", place_id, exc)
        log_query(
            "gmaps",
            "placeDetails",
            "GET",
            None,
            0.0,
            "place_details",
            request_info={"place_id": place_id},
            error=str(exc),
        )
        return {
            "error": "search_unavailable",
            "place_id": place_id,
            "name": "",
            "address": "",
            "lat": 0.0,
            "lng": 0.0,
        }

    location = data.get("location", {})
    return {
        "place_id": place_id,
        "name": data.get("displayName", {}).get("text", ""),
        "address": data.get("formattedAddress", ""),
        "lat": location.get("latitude", 0.0),
        "lng": location.get("longitude", 0.0),
    }
