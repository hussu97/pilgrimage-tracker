"""
GmapsCollector — fetches detailed place information from Google Places API (New).

Extracted from scrapers/gmaps.py detail-fetching logic with enhanced field mask.
"""

from __future__ import annotations

import base64
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

import requests
from requests.exceptions import ConnectionError as RequestsConnectionError
from requests.exceptions import SSLError
from sqlmodel import Session, select

from app.collectors.base import BaseCollector, CollectorResult
from app.logger import get_logger
from app.scrapers.gmaps import (
    clean_address,
    detect_religion_from_types,
    get_gmaps_type_to_our_type,
    process_weekly_hours,
)
from app.utils.extractors import ContactExtractor, ReviewExtractor, make_description

logger = get_logger(__name__)

_MAX_IMAGE_ATTEMPTS = 3


def _download_image(url: str, http_session: requests.Session | None = None) -> bytes | None:
    """Download an image with retries on transient SSL/connection errors.

    Google Places photo URLs occasionally fail with UNEXPECTED_EOF_WHILE_READING
    due to Cloud Run egress dropping the connection. A short backoff retry fixes it.
    """
    fetcher = http_session or requests
    for attempt in range(_MAX_IMAGE_ATTEMPTS):
        try:
            resp = fetcher.get(url, timeout=20)
            if resp.status_code == 200:
                return resp.content
            return None
        except (SSLError, RequestsConnectionError) as e:
            if attempt < _MAX_IMAGE_ATTEMPTS - 1:
                time.sleep(attempt + 1)  # 1 s, 2 s
                continue
            logger.warning(
                "Failed to download image %s after %d attempts: %s", url, _MAX_IMAGE_ATTEMPTS, e
            )
            return None
        except Exception as e:
            logger.warning("Failed to download image %s: %s", url, e)
            return None


def download_place_images(run_code: str, engine, max_workers: int = 20) -> None:
    """Phase 3: Download images for all places in a run and store blobs in raw_data.

    This is called after fetch_place_details() so that detail fetching is not
    blocked by image downloads. Uses a shared requests.Session for connection
    reuse and a ThreadPoolExecutor for parallelism.

    CDN photo URLs (places.googleapis.com/v1/.../media) are not billed API calls,
    so no rate limiting is needed here.
    """
    from app.db.models import ScrapedPlace

    with Session(engine) as session:
        places = session.exec(select(ScrapedPlace).where(ScrapedPlace.run_code == run_code)).all()

    # Collect (place_id, url_index, url) tuples to download
    tasks: list[tuple[int, int, str]] = []
    place_map: dict[int, dict] = {}  # place.id → raw_data

    for place in places:
        raw = place.raw_data or {}
        urls = raw.get("image_urls") or []
        if not urls or raw.get("image_blobs"):
            continue  # already downloaded or no URLs
        place_map[place.id] = raw
        for idx, url in enumerate(urls):
            tasks.append((place.id, idx, url))

    if not tasks:
        logger.info("Image download: no pending images for run %s", run_code)
        return

    logger.info("Image download: downloading %d images for %d places", len(tasks), len(place_map))

    # Download in parallel using a shared session for connection reuse
    results: dict[tuple[int, int], bytes] = {}
    with requests.Session() as http_session, ThreadPoolExecutor(max_workers=max_workers) as pool:
        future_to_key = {
            pool.submit(_download_image, url, http_session): (place_id, idx)
            for place_id, idx, url in tasks
        }
        for future in as_completed(future_to_key):
            key = future_to_key[future]
            try:
                content = future.result()
                if content is not None:
                    results[key] = content
            except Exception as e:
                logger.warning("Image download error for key %s: %s", key, e)

    # Group results by place and write back
    blobs_by_place: dict[int, list[dict]] = {}
    for (place_id, idx), content in results.items():
        blobs_by_place.setdefault(place_id, []).append((idx, content))

    with Session(engine) as session:
        for place_id, blob_list in blobs_by_place.items():
            place = session.get(ScrapedPlace, place_id)
            if not place:
                continue
            raw = dict(place.raw_data or {})
            sorted_blobs = [
                {
                    "data": base64.b64encode(content).decode("ascii"),
                    "mime_type": "image/jpeg",
                }
                for _, content in sorted(blob_list, key=lambda x: x[0])
            ]
            raw["image_blobs"] = sorted_blobs
            raw["image_urls"] = []  # clear URLs now that blobs exist
            place.raw_data = raw
            session.add(place)
        session.commit()

    downloaded = sum(len(v) for v in blobs_by_place.values())
    logger.info(
        "Image download complete: %d/%d images downloaded for run %s",
        downloaded,
        len(tasks),
        run_code,
    )


class GmapsCollector(BaseCollector):
    """Fetches place details from Google Places API (New) with enhanced field mask."""

    name = "gmaps"
    requires_api_key = True
    api_key_env_var = "GOOGLE_MAPS_API_KEY"

    # Essential fields — cheaper SKU, always fetched first.
    FIELD_MASK_ESSENTIAL = [
        "name",
        "id",
        "displayName",
        "formattedAddress",
        "location",
        "types",
        "photos",
        "businessStatus",
        "regularOpeningHours",
        "websiteUri",
        "utcOffsetMinutes",
        "nationalPhoneNumber",
        "internationalPhoneNumber",
        "googleMapsUri",
        "rating",
        "userRatingCount",
        "editorialSummary",
    ]

    # Extended fields — Atmosphere-tier (more expensive), only fetched for
    # qualifying places (businessStatus=OPERATIONAL, rating >= 1.0).
    FIELD_MASK_EXTENDED = [
        "reviews",
        "accessibilityOptions",
        "generativeSummary",
        "parkingOptions",
        "paymentOptions",
        "allowsDogs",
        "goodForChildren",
        "goodForGroups",
        "restroom",
        "outdoorSeating",
    ]

    # Combined mask used when fetching a single place (e.g. GmapsCollector.collect())
    FIELD_MASK = FIELD_MASK_ESSENTIAL + FIELD_MASK_EXTENDED

    def collect(
        self,
        place_code: str,
        lat: float,
        lng: float,
        name: str,
        existing_data: dict[str, Any] | None = None,
    ) -> CollectorResult:
        api_key = self._get_api_key()
        if not api_key:
            return self._not_configured_result()

        # We need the place resource name (places/ChIJ...) to call the details API
        # Extract from place_code which has format gplc_ChIJ...
        if place_code.startswith("gplc_"):
            place_id = place_code[5:]
        else:
            return self._skip_result(f"Invalid place_code format: {place_code}")

        place_resource_name = f"places/{place_id}"

        try:
            response = self._fetch_details(place_resource_name, api_key)
            result = self._extract(response, place_code, api_key)
            result.raw_response = response
            return result
        except Exception as e:
            return self._fail_result(str(e))

    def _fetch_details(
        self,
        place_name: str,
        api_key: str,
        field_mask: list[str] | None = None,
        http_session: requests.Session | None = None,
    ) -> dict:
        """Fetch place details from Google Places API.

        Uses field_mask if provided, otherwise falls back to the full combined FIELD_MASK.
        Accepts an optional requests.Session for connection reuse.
        """
        url = f"https://places.googleapis.com/v1/{place_name}"
        mask = field_mask if field_mask is not None else self.FIELD_MASK
        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": api_key,
            "X-Goog-FieldMask": ",".join(mask),
            "languageCode": "en",
        }
        fetcher = http_session or requests
        resp = fetcher.get(url, headers=headers, timeout=(5, 30))

        if resp.status_code != 200:
            error_data = resp.json() if resp.content else {}
            error_msg = error_data.get("error", {}).get("message", "Unknown error")
            raise Exception(
                f"Places API get place details failed (HTTP {resp.status_code}): {error_msg}"
            )

        return resp.json()

    # Minimum quality bar for fetching extended (expensive) fields
    _EXTENDED_MIN_RATING: float = 1.0

    def fetch_details_split(
        self,
        place_name: str,
        api_key: str,
        rate_limiter,
        http_session: requests.Session | None = None,
    ) -> dict:
        """Two-stage detail fetch: essential fields first, extended fields conditionally.

        Places with businessStatus != OPERATIONAL or rating < _EXTENDED_MIN_RATING
        skip the extended (Atmosphere-tier) call, saving ~15-30% in API cost.
        Returns the merged response dict.
        """
        rate_limiter.acquire("gmaps_details")
        essential = self._fetch_details(
            place_name, api_key, self.FIELD_MASK_ESSENTIAL, http_session
        )

        # Quality gate: only fetch expensive extended fields for live, rated places
        status = essential.get("businessStatus", "")
        rating = essential.get("rating") or 0.0
        if status == "OPERATIONAL" and float(rating) >= self._EXTENDED_MIN_RATING:
            rate_limiter.acquire("gmaps_details")
            extended = self._fetch_details(
                place_name, api_key, self.FIELD_MASK_EXTENDED, http_session
            )
            essential.update(extended)

        return essential

    def _extract(self, response: dict, place_code: str, api_key: str) -> CollectorResult:
        """Extract structured data from the API response."""
        result = CollectorResult(collector_name=self.name)

        # --- Descriptions ---
        # Editorial summary (short, human-curated)
        editorial = response.get("editorialSummary", {})
        if isinstance(editorial, dict):
            editorial_text = editorial.get("text", "")
        else:
            editorial_text = ""

        if editorial_text:
            result.descriptions.append(make_description(editorial_text, "en", "gmaps_editorial"))

        # Generative summary (longer, AI-generated)
        generative = response.get("generativeSummary", {})
        if isinstance(generative, dict):
            gen_text = generative.get("overview", {})
            if isinstance(gen_text, dict):
                gen_text = gen_text.get("text", "")
            elif not isinstance(gen_text, str):
                gen_text = ""
        else:
            gen_text = ""

        if gen_text:
            result.descriptions.append(make_description(gen_text, "en", "gmaps_generative"))

        # --- Contact ---
        result.contact.update(ContactExtractor.from_gmaps_response(response))

        # --- Attributes ---
        # Accessibility (expanded)
        accessibility = response.get("accessibilityOptions", {})
        if isinstance(accessibility, dict):
            for key, attr_code in [
                ("wheelchairAccessibleEntrance", "wheelchair_accessible"),
                ("wheelchairAccessibleParking", "wheelchair_accessible_parking"),
                ("wheelchairAccessibleRestroom", "wheelchair_accessible_restroom"),
                ("wheelchairAccessibleSeating", "wheelchair_accessible_seating"),
            ]:
                val = accessibility.get(key)
                if val is not None:
                    result.attributes.append({"attribute_code": attr_code, "value": val})

        # Rating and reviews
        rating = response.get("rating")
        if rating:
            result.attributes.append({"attribute_code": "rating", "value": rating})

        reviews_count = response.get("userRatingCount")
        if reviews_count:
            result.attributes.append({"attribute_code": "reviews_count", "value": reviews_count})

        # Boolean amenities
        for api_field, attr_code in [
            ("allowsDogs", "allows_dogs"),
            ("goodForChildren", "good_for_children"),
            ("goodForGroups", "good_for_groups"),
            ("restroom", "has_restroom"),
            ("outdoorSeating", "has_outdoor_seating"),
        ]:
            val = response.get(api_field)
            if val is not None:
                result.attributes.append({"attribute_code": attr_code, "value": val})

        # Parking details (JSON)
        parking = response.get("parkingOptions")
        if parking and isinstance(parking, dict):
            result.attributes.append({"attribute_code": "parking_details", "value": parking})

        # Payment options (JSON)
        payment = response.get("paymentOptions")
        if payment and isinstance(payment, dict):
            result.attributes.append({"attribute_code": "payment_options", "value": payment})

        # Accessibility details (JSON — full object for richer display)
        if accessibility and isinstance(accessibility, dict) and accessibility:
            result.attributes.append(
                {"attribute_code": "accessibility_details", "value": accessibility}
            )

        # --- Images ---
        for photo in response.get("photos", [])[:3]:
            photo_name = photo.get("name")
            if not photo_name:
                continue
            photo_url = (
                f"https://places.googleapis.com/v1/{photo_name}/media?maxWidthPx=800&key={api_key}"
            )
            result.images.append({"url": photo_url, "source": "gmaps"})

        # --- Reviews ---
        result.reviews = ReviewExtractor.from_gmaps(response.get("reviews", []))

        return result

    def build_place_data(
        self,
        response: dict,
        place_code: str,
        api_key: str,
        session: Session | None,
        *,
        type_map: dict[str, str] | None = None,
        religion_type_map: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """
        Build the full place_data dict from a gmaps response.

        This is used during the discovery phase to create the initial ScrapedPlace.raw_data.
        Images are stored as URLs only — actual blob download is deferred to the
        download_place_images() phase after detail fetch.

        When type_map and religion_type_map are supplied (pre-loaded before entering a thread
        pool), this method performs no DB access and is fully thread-safe.  When they are
        None a session must be provided and the maps are queried on the fly.
        """
        # Process images (up to 3) — URLs only, no download during detail fetch
        photo_urls = []

        for photo in response.get("photos", [])[:3]:
            photo_name = photo.get("name")
            if not photo_name:
                continue

            photo_url = (
                f"https://places.googleapis.com/v1/{photo_name}/media?maxWidthPx=800&key={api_key}"
            )
            photo_urls.append(photo_url)

        # Process external reviews (up to 5)
        external_reviews = ReviewExtractor.from_gmaps(response.get("reviews", []))

        # Build attributes
        attributes = []

        accessibility = response.get("accessibilityOptions", {})
        wheelchair = (
            accessibility.get("wheelchairAccessibleEntrance")
            if isinstance(accessibility, dict)
            else None
        )
        if wheelchair is not None:
            attributes.append({"attribute_code": "wheelchair_accessible", "value": wheelchair})

        rating = response.get("rating")
        if rating:
            attributes.append({"attribute_code": "rating", "value": rating})

        reviews_count = response.get("userRatingCount")
        if reviews_count:
            attributes.append({"attribute_code": "reviews_count", "value": reviews_count})

        # New enhanced attributes
        for api_field, attr_code in [
            ("allowsDogs", "allows_dogs"),
            ("goodForChildren", "good_for_children"),
            ("goodForGroups", "good_for_groups"),
            ("restroom", "has_restroom"),
            ("outdoorSeating", "has_outdoor_seating"),
        ]:
            val = response.get(api_field)
            if val is not None:
                attributes.append({"attribute_code": attr_code, "value": val})

        parking = response.get("parkingOptions")
        if parking and isinstance(parking, dict):
            attributes.append({"attribute_code": "parking_details", "value": parking})

        payment = response.get("paymentOptions")
        if payment and isinstance(payment, dict):
            attributes.append({"attribute_code": "payment_options", "value": payment})

        if accessibility and isinstance(accessibility, dict) and accessibility:
            attributes.append({"attribute_code": "accessibility_details", "value": accessibility})

        # Phone numbers
        national_phone = response.get("nationalPhoneNumber")
        intl_phone = response.get("internationalPhoneNumber")
        if national_phone:
            attributes.append({"attribute_code": "phone_national", "value": national_phone})
        if intl_phone:
            attributes.append({"attribute_code": "phone_international", "value": intl_phone})

        # Google Maps URL
        gmaps_uri = response.get("googleMapsUri")
        if gmaps_uri:
            attributes.append({"attribute_code": "google_maps_url", "value": gmaps_uri})

        # Process opening hours
        opening_hours_data = response.get("regularOpeningHours", {})
        opening_hours = {}
        weekday_descriptions = opening_hours_data.get("weekdayDescriptions", [])
        if weekday_descriptions:
            legacy_format = {"weekday_text": weekday_descriptions}
            opening_hours = process_weekly_hours(legacy_format)
        else:
            opening_hours = dict.fromkeys(
                ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
                "Hours not available",
            )

        # Extract place_id
        place_id = place_code[5:] if place_code.startswith("gplc_") else place_code

        # Auto-detect religion and place_type
        result_types = response.get("types", [])

        if religion_type_map is not None:
            # Use pre-loaded map (thread-safe, no DB access)
            religion = None
            for gmaps_type in result_types:
                if gmaps_type in religion_type_map:
                    religion = religion_type_map[gmaps_type]
                    break
        else:
            religion = detect_religion_from_types(session, result_types)

        if not religion:
            logger.warning(
                "Could not detect religion for %s with types: %s", place_id, result_types
            )
            religion = "unknown"

        place_type_name = "place of worship"
        gmaps_type_map = type_map if type_map is not None else get_gmaps_type_to_our_type(session)
        for gmaps_type in result_types:
            if gmaps_type in gmaps_type_map:
                place_type_name = gmaps_type_map[gmaps_type]
                break

        # Get editorial summary
        editorial_summary = response.get("editorialSummary", {})
        if isinstance(editorial_summary, dict):
            editorial = editorial_summary.get("text", "")
        else:
            editorial = ""

        formatted_address = response.get("formattedAddress", "")
        if editorial:
            description = editorial
        else:
            description = f"A {place_type_name} located in {clean_address(formatted_address)}."

        location = response.get("location", {})
        lat = location.get("latitude", 0)
        lng = location.get("longitude", 0)

        display_name = response.get("displayName", {})
        if isinstance(display_name, dict):
            name = display_name.get("text", "N/A")
        else:
            name = "N/A"

        website_url = response.get("websiteUri", "")
        business_status = response.get("businessStatus", "N/A")

        utc_offset_minutes = response.get("utcOffsetMinutes")
        if utc_offset_minutes is None:
            scraper_tz = os.environ.get("SCRAPER_TIMEZONE")
            if scraper_tz:
                try:
                    from datetime import datetime as _dt
                    from zoneinfo import ZoneInfo

                    utc_offset_minutes = int(
                        _dt.now(ZoneInfo(scraper_tz)).utcoffset().total_seconds() / 60
                    )
                except Exception:
                    pass

        return {
            "place_code": place_code,
            "name": name,
            "religion": religion,
            "place_type": place_type_name,
            "lat": lat,
            "lng": lng,
            "address": clean_address(formatted_address),
            "image_urls": photo_urls,
            "image_blobs": [],
            "description": description,
            "website_url": website_url,
            "opening_hours": opening_hours,
            "utc_offset_minutes": utc_offset_minutes,
            "attributes": attributes,
            "external_reviews": external_reviews,
            "source": "gmaps",
            "vicinity": formatted_address,
            "business_status": business_status,
            "google_place_id": place_id,
        }
