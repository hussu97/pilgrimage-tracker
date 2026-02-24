"""
GmapsCollector — fetches detailed place information from Google Places API (New).

Extracted from scrapers/gmaps.py detail-fetching logic with enhanced field mask.
"""

from __future__ import annotations

import base64
import os
from datetime import datetime
from typing import Any

import requests
from sqlmodel import Session

from app.collectors.base import BaseCollector, CollectorResult
from app.scrapers.gmaps import (
    clean_address,
    detect_religion_from_types,
    get_gmaps_type_to_our_type,
    process_weekly_hours,
)


class GmapsCollector(BaseCollector):
    """Fetches place details from Google Places API (New) with enhanced field mask."""

    name = "gmaps"
    requires_api_key = True
    api_key_env_var = "GOOGLE_MAPS_API_KEY"

    # Enhanced field mask — adds generativeSummary, phone, parking, etc.
    FIELD_MASK = [
        # Basic tier (free)
        "name",
        "id",
        "displayName",
        "formattedAddress",
        "location",
        "types",
        "photos",
        "businessStatus",
        # Contact tier
        "regularOpeningHours",
        "websiteUri",
        "utcOffsetMinutes",
        "nationalPhoneNumber",
        "internationalPhoneNumber",
        "googleMapsUri",
        # Atmosphere tier
        "rating",
        "userRatingCount",
        "reviews",
        "accessibilityOptions",
        "editorialSummary",
        "generativeSummary",
        # Additional details
        "parkingOptions",
        "paymentOptions",
        "allowsDogs",
        "goodForChildren",
        "goodForGroups",
        "restroom",
        "outdoorSeating",
    ]

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

    def _fetch_details(self, place_name: str, api_key: str) -> dict:
        """Fetch place details from Google Places API."""
        url = f"https://places.googleapis.com/v1/{place_name}"
        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": api_key,
            "X-Goog-FieldMask": ",".join(self.FIELD_MASK),
            "languageCode": "en",
        }
        resp = requests.get(url, headers=headers)

        if resp.status_code != 200:
            error_data = resp.json() if resp.content else {}
            error_msg = error_data.get("error", {}).get("message", "Unknown error")
            raise Exception(
                f"Places API get place details failed (HTTP {resp.status_code}): {error_msg}"
            )

        return resp.json()

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
            result.descriptions.append(
                {
                    "text": editorial_text,
                    "lang": "en",
                    "source": "gmaps_editorial",
                    "score": None,
                }
            )

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
            result.descriptions.append(
                {
                    "text": gen_text,
                    "lang": "en",
                    "source": "gmaps_generative",
                    "score": None,
                }
            )

        # --- Contact ---
        national_phone = response.get("nationalPhoneNumber")
        intl_phone = response.get("internationalPhoneNumber")
        gmaps_uri = response.get("googleMapsUri")
        website = response.get("websiteUri")

        if national_phone:
            result.contact["phone_national"] = national_phone
        if intl_phone:
            result.contact["phone_international"] = intl_phone
        if gmaps_uri:
            result.contact["google_maps_url"] = gmaps_uri
        if website:
            result.contact["website"] = website

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
        for review in response.get("reviews", [])[:5]:
            review_text = review.get("text", {})
            if isinstance(review_text, dict):
                review_text = review_text.get("text", "")

            author_name = review.get("authorAttribution", {}).get("displayName", "")

            publish_time = review.get("publishTime", "")
            time_unix = 0
            try:
                if publish_time:
                    dt = datetime.fromisoformat(publish_time.replace("Z", "+00:00"))
                    time_unix = int(dt.timestamp())
            except Exception:
                pass

            result.reviews.append(
                {
                    "author_name": author_name,
                    "rating": review.get("rating", 0),
                    "text": review_text,
                    "time": time_unix,
                    "relative_time_description": review.get("relativePublishTimeDescription", ""),
                    "language": "en",
                }
            )

        return result

    def build_place_data(
        self, response: dict, place_code: str, api_key: str, session: Session
    ) -> dict[str, Any]:
        """
        Build the full place_data dict from a gmaps response.

        This is used during the discovery phase to create the initial ScrapedPlace.raw_data.
        It preserves the existing behavior from scrapers/gmaps.py get_place_details().
        """
        # Process images (up to 3)
        photo_urls = []
        image_blobs = []
        download_failures = []

        for photo in response.get("photos", [])[:3]:
            photo_name = photo.get("name")
            if not photo_name:
                continue

            photo_url = (
                f"https://places.googleapis.com/v1/{photo_name}/media?maxWidthPx=800&key={api_key}"
            )
            photo_urls.append(photo_url)

            try:
                resp = requests.get(photo_url, timeout=15)
                if resp.status_code == 200:
                    mime = resp.headers.get("Content-Type", "image/jpeg")
                    image_blobs.append(
                        {
                            "data": base64.b64encode(resp.content).decode("ascii"),
                            "mime_type": mime,
                        }
                    )
                else:
                    download_failures.append(photo_url)
            except Exception as e:
                print(f"Failed to download image {photo_url}: {e}")
                download_failures.append(photo_url)

        # Process external reviews (up to 5)
        external_reviews = []
        for review in response.get("reviews", [])[:5]:
            review_text = review.get("text", {})
            if isinstance(review_text, dict):
                review_text = review_text.get("text", "")

            author_name = review.get("authorAttribution", {}).get("displayName", "")

            publish_time = review.get("publishTime", "")
            time_unix = 0
            try:
                if publish_time:
                    dt = datetime.fromisoformat(publish_time.replace("Z", "+00:00"))
                    time_unix = int(dt.timestamp())
            except Exception:
                pass

            external_reviews.append(
                {
                    "author_name": author_name,
                    "rating": review.get("rating", 0),
                    "text": review_text,
                    "time": time_unix,
                    "relative_time_description": review.get("relativePublishTimeDescription", ""),
                    "language": "en",
                }
            )

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
        religion = detect_religion_from_types(session, result_types)
        if not religion:
            print(f"Warning: Could not detect religion for {place_id} with types: {result_types}")
            religion = "unknown"

        place_type_name = "place of worship"
        gmaps_type_map = get_gmaps_type_to_our_type(session)
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

        use_blobs = len(image_blobs) == len(photo_urls) and len(photo_urls) > 0

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
            "image_urls": [] if use_blobs else photo_urls,
            "image_blobs": image_blobs if use_blobs else [],
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
