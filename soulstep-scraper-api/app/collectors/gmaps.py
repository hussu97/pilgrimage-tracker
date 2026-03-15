"""
GmapsCollector — fetches detailed place information from Google Places API (New).

Extracted from scrapers/gmaps.py detail-fetching logic with enhanced field mask.
"""

from __future__ import annotations

import asyncio
import os
import time
from typing import Any

import httpx
from sqlmodel import Session, select

from app.collectors.base import BaseCollector, CollectorResult
from app.config import settings
from app.logger import get_logger
from app.scrapers.gmaps import (
    clean_address,
    detect_religion_from_types,
    get_gmaps_type_to_our_type,
    process_weekly_hours,
)
from app.services.query_log import log_query
from app.utils.extractors import ContactExtractor, ReviewExtractor, make_description

logger = get_logger(__name__)

_MAX_IMAGE_ATTEMPTS = 3


async def _download_image(url: str, client: httpx.AsyncClient | None = None) -> bytes | None:
    """Download an image with retries on transient errors.

    Google Places photo URLs occasionally fail with UNEXPECTED_EOF_WHILE_READING
    due to Cloud Run egress dropping the connection. A short backoff retry fixes it.
    """
    for attempt in range(_MAX_IMAGE_ATTEMPTS):
        try:
            if client is not None:
                resp = await client.get(url, timeout=20.0)
            else:
                async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as c:
                    resp = await c.get(url)
            if resp.status_code == 200:
                content = resp.content
                # Validate JPEG magic bytes (\xff\xd8\xff) and minimum size (>1 KB)
                if len(content) < 1024:
                    logger.warning(
                        "Downloaded image too small (%d bytes), skipping: %s",
                        len(content),
                        url,
                    )
                    return None
                if content[:3] != b"\xff\xd8\xff":
                    logger.warning("Downloaded image failed JPEG header check, skipping: %s", url)
                    return None
                return content
            return None
        except (httpx.ConnectError, httpx.RemoteProtocolError) as e:
            if attempt < _MAX_IMAGE_ATTEMPTS - 1:
                await asyncio.sleep(attempt + 1)  # 1 s, 2 s
                continue
            logger.warning(
                "Failed to download image %s after %d attempts: %s", url, _MAX_IMAGE_ATTEMPTS, e
            )
            return None
        except Exception as e:
            logger.warning("Failed to download image %s: %s", url, e)
            return None


_IMAGE_DB_BATCH = 50  # places committed per DB transaction during image write-back


async def download_place_images(run_code: str, engine, max_workers: int | None = None) -> None:
    """Phase 3: Download images and upload directly to GCS.

    Called after fetch_place_details() so detail fetching is not blocked.
    Uses a shared httpx.AsyncClient + asyncio.gather for parallel operations.

    For each place: downloads the photo media URL, uploads bytes to GCS, and
    stores the public GCS URL back in raw_data["image_urls"].

    Skips places where all URLs already start with the GCS prefix (already uploaded).

    Photo media requests (places.googleapis.com/v1/.../media) ARE billed by
    Google at $0.007 per 1000 requests. Photo count per place is capped by
    SCRAPER_MAX_PHOTOS (default 3) to control cost and download time.

    Quality gate: places below GATE_IMAGE_DOWNLOAD are skipped.
    DB writes: committed in batches of _IMAGE_DB_BATCH places to avoid a
    single giant transaction that blocks the DB and spikes memory usage.
    """
    from app.db.models import ScrapedPlace
    from app.pipeline.place_quality import GATE_IMAGE_DOWNLOAD, passes_gate
    from app.services.gcs import upload_image_bytes

    concurrency = max_workers if max_workers is not None else settings.image_concurrency

    _GCS_PREFIX = "https://storage.googleapis.com/"

    with Session(engine) as session:
        places = session.exec(select(ScrapedPlace).where(ScrapedPlace.run_code == run_code)).all()

    # Collect (place_id, url_index, url) tuples to process
    tasks: list[tuple[int, int, str]] = []
    place_map: dict[int, dict] = {}  # place.id → raw_data

    for place in places:
        if not passes_gate(place.quality_score, GATE_IMAGE_DOWNLOAD):
            continue  # filtered by quality gate
        raw = place.raw_data or {}
        urls = raw.get("image_urls") or []
        if not urls or all(u.startswith(_GCS_PREFIX) for u in urls):
            continue  # no URLs or already uploaded to GCS
        place_map[place.id] = raw
        for idx, url in enumerate(urls):
            if not url.startswith(_GCS_PREFIX):
                tasks.append((place.id, idx, url))

    if not tasks:
        logger.info("Image download: no pending images for run %s", run_code)
        return

    logger.info(
        "Image download: %d images for %d places (concurrency=%d)",
        len(tasks),
        len(place_map),
        concurrency,
    )

    # Download and upload to GCS in parallel
    sem = asyncio.Semaphore(concurrency)
    gcs_urls_by_place: dict[int, list[tuple[int, str]]] = {}

    async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as http_client:

        async def _fetch_and_upload(place_id: int, idx: int, url: str) -> None:
            async with sem:
                content = await _download_image(url, http_client)
                if content is not None:
                    gcs_url = upload_image_bytes(content)
                    if gcs_url:
                        gcs_urls_by_place.setdefault(place_id, []).append((idx, gcs_url))

        await asyncio.gather(*[_fetch_and_upload(pid, idx, url) for pid, idx, url in tasks])

    uploaded = sum(len(v) for v in gcs_urls_by_place.values())
    images_failed = len(tasks) - uploaded

    # Write GCS URLs back in batches to keep transactions small
    place_ids = list(gcs_urls_by_place.keys())
    for batch_start in range(0, len(place_ids), _IMAGE_DB_BATCH):
        batch = place_ids[batch_start : batch_start + _IMAGE_DB_BATCH]
        with Session(engine) as session:
            for place_id in batch:
                place = session.get(ScrapedPlace, place_id)
                if not place:
                    continue
                raw = dict(place.raw_data or {})
                sorted_urls = [
                    gcs_url
                    for _, gcs_url in sorted(gcs_urls_by_place[place_id], key=lambda x: x[0])
                ]
                raw["image_urls"] = sorted_urls
                place.raw_data = raw
                session.add(place)
            session.commit()
        logger.debug(
            "Image write-back: committed batch %d/%d",
            min(batch_start + _IMAGE_DB_BATCH, len(place_ids)),
            len(place_ids),
        )

    # Persist final counters in a separate small transaction
    from app.db.models import ScraperRun

    with Session(engine) as session:
        run_record = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
        if run_record:
            run_record.images_downloaded = uploaded
            run_record.images_failed = images_failed
            session.add(run_record)
        session.commit()

    logger.info(
        "Image download complete: %d/%d images uploaded to GCS for run %s",
        uploaded,
        len(tasks),
        run_code,
    )


def _extract_address_components(
    components: list[dict],
) -> tuple[str | None, str | None, str | None]:
    """Extract (city, state, country) from a GMaps addressComponents list.

    GMaps types hierarchy used:
      city    → locality > sublocality_level_1 > administrative_area_level_2
      state   → administrative_area_level_1
      country → country (longText e.g. "United Arab Emirates")
    """
    city = state = country = None
    city_priority = ["locality", "sublocality_level_1", "administrative_area_level_2"]
    city_found_at: int | None = None

    for component in components:
        types = component.get("types") or []
        long_text = component.get("longText", "").strip() or None
        if not long_text:
            continue

        if "country" in types:
            country = long_text
        elif "administrative_area_level_1" in types:
            state = long_text
        else:
            for priority, type_name in enumerate(city_priority):
                if type_name in types:
                    if city_found_at is None or priority < city_found_at:
                        city = long_text
                        city_found_at = priority
                    break

    return city, state, country


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
        "addressComponents",
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

    async def collect(
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
            response = await self._fetch_details(place_resource_name, api_key)
            result = self._extract(response, place_code, api_key)
            result.raw_response = response
            return result
        except Exception as e:
            return self._fail_result(str(e))

    async def _fetch_details(
        self,
        place_name: str,
        api_key: str,
        field_mask: list[str] | None = None,
        client: httpx.AsyncClient | None = None,
    ) -> dict:
        """Fetch place details from Google Places API.

        Uses field_mask if provided, otherwise falls back to the full combined FIELD_MASK.
        Accepts an optional httpx.AsyncClient for connection reuse.
        """
        url = f"https://places.googleapis.com/v1/{place_name}"
        mask = field_mask if field_mask is not None else self.FIELD_MASK
        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": api_key,
            "X-Goog-FieldMask": ",".join(mask),
        }
        params = {"languageCode": "en"}
        # Determine which tier is being fetched for the log
        tier = (
            "ESSENTIAL"
            if field_mask == self.FIELD_MASK_ESSENTIAL
            else ("EXTENDED" if field_mask == self.FIELD_MASK_EXTENDED else "FULL")
        )

        t0 = time.perf_counter()
        if client is not None:
            resp = await client.get(url, headers=headers, params=params)
        else:
            async with httpx.AsyncClient(timeout=35.0) as c:
                resp = await c.get(url, headers=headers, params=params)
        duration_ms = (time.perf_counter() - t0) * 1000

        if resp.status_code != 200:
            error_data = resp.json() if resp.content else {}
            error_msg = error_data.get("error", {}).get("message", "Unknown error")
            log_query(
                service="gmaps",
                endpoint="getPlace",
                method="GET",
                status_code=resp.status_code,
                duration_ms=duration_ms,
                caller="_fetch_details",
                request_info={"place_name": place_name, "tier": tier},
                error=error_msg,
            )
            raise Exception(
                f"Places API get place details failed (HTTP {resp.status_code}): {error_msg}"
            )

        log_query(
            service="gmaps",
            endpoint="getPlace",
            method="GET",
            status_code=resp.status_code,
            duration_ms=duration_ms,
            caller="_fetch_details",
            request_info={"place_name": place_name, "tier": tier},
        )

        return resp.json()

    async def fetch_details_split(
        self,
        place_name: str,
        api_key: str,
        rate_limiter,
        client: httpx.AsyncClient | None = None,
    ) -> dict:
        """Single-call detail fetch using the full combined field mask.

        Previously used a two-stage approach (ESSENTIAL then conditional EXTENDED),
        but at typical qualification rates (>57.5% of places are OPERATIONAL + rated),
        the merged call is cheaper and halves the API call count for detail fetching.

        Breakeven: if >57.5% of places qualify for EXTENDED, merged is cheaper.
        At 70% qual. rate: saves ~11% cost + 70 API calls per 100 places.
        """
        await rate_limiter.acquire("gmaps_details")
        return await self._fetch_details(place_name, api_key, self.FIELD_MASK, client)

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
        for photo in response.get("photos", [])[: settings.max_photos]:
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
        Images are stored as Google Places photo media URLs — download and GCS upload
        is performed in the download_place_images() phase after detail fetch.

        When type_map and religion_type_map are supplied (pre-loaded before entering the
        async gather), this method performs no DB access and is fully coroutine-safe.
        When they are None a session must be provided and the maps are queried on the fly.
        """
        # Process images — URLs only, no download during detail fetch.
        # Count capped by SCRAPER_MAX_PHOTOS (default 3); each photo media
        # request is billed at $0.007/1000, so fewer photos = lower cost.
        photo_urls = []

        for photo in response.get("photos", [])[: settings.max_photos]:
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
            # Use pre-loaded map (no DB access)
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

        address_components = response.get("addressComponents") or []
        city, state, country = _extract_address_components(address_components)

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
            "description": description,
            "website_url": website_url,
            "opening_hours": opening_hours,
            "utc_offset_minutes": utc_offset_minutes,
            "attributes": attributes,
            "external_reviews": external_reviews,
            "city": city,
            "state": state,
            "country": country,
            "source": "gmaps",
            "vicinity": formatted_address,
            "business_status": business_status,
            "google_place_id": place_id,
            # Quality scoring helpers — stored for score_place_quality()
            "rating": response.get("rating"),
            "user_rating_count": response.get("userRatingCount"),
            "has_editorial": bool(editorial),
            "gmaps_types": result_types,
        }
