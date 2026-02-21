"""
Search proxy endpoints — keeps Google Places API key server-side.
"""

import requests
from fastapi import APIRouter, Query

from app.core import config

router = APIRouter()

GOOGLE_PLACES_AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete"
GOOGLE_PLACE_DETAILS_URL = "https://places.googleapis.com/v1/places/{place_id}"


@router.get("/autocomplete")
def autocomplete(
    q: str = Query(..., min_length=2),
    lat: float | None = Query(default=None),
    lng: float | None = Query(default=None),
):
    """Proxy to Google Places autocomplete. Returns suggestions list."""
    api_key = config.GOOGLE_MAPS_API_KEY
    if not api_key:
        return {"suggestions": []}

    payload: dict = {"input": q}
    if lat is not None and lng is not None:
        payload["locationBias"] = {
            "circle": {
                "center": {"latitude": lat, "longitude": lng},
                "radius": 50000.0,
            }
        }

    try:
        resp = requests.post(
            GOOGLE_PLACES_AUTOCOMPLETE_URL,
            json=payload,
            headers={
                "Content-Type": "application/json",
                "X-Goog-Api-Key": api_key,
            },
            timeout=5,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        return {"suggestions": []}

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

    return {"suggestions": suggestions}


@router.get("/place-details")
def place_details(place_id: str = Query(...)):
    """Proxy to Google Place Details. Returns lat/lng and display info."""
    api_key = config.GOOGLE_MAPS_API_KEY
    if not api_key:
        return {
            "error": "Search not configured",
            "place_id": place_id,
            "name": "",
            "address": "",
            "lat": 0.0,
            "lng": 0.0,
        }

    url = GOOGLE_PLACE_DETAILS_URL.format(place_id=place_id)
    try:
        resp = requests.get(
            url,
            headers={
                "X-Goog-Api-Key": api_key,
                "X-Goog-FieldMask": "id,displayName,formattedAddress,location",
            },
            timeout=5,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        return {
            "error": "Failed to fetch place details",
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
