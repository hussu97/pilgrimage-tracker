"""
OsmCollector — fetches place data from OpenStreetMap via Overpass API.

Extracts amenities, contact info, wikipedia/wikidata tags, and multilingual names.
"""

from __future__ import annotations

from typing import Any

from app.collectors.base import BaseCollector, CollectorResult
from app.scrapers.base import async_request_with_backoff
from app.utils.extractors import ContactExtractor

OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter"
HEADERS = {"User-Agent": "SoulStepBot/1.0 (contact@soul-step.org)"}


class OsmCollector(BaseCollector):
    """Fetches place data from OpenStreetMap via Overpass API (free, no key)."""

    name = "osm"
    requires_api_key = False
    api_key_env_var = ""

    async def collect(
        self,
        place_code: str,
        lat: float,
        lng: float,
        name: str,
        existing_data: dict[str, Any] | None = None,
    ) -> CollectorResult:
        try:
            tags = await self._query_overpass(lat, lng)
            if not tags:
                return self._skip_result("No OSM data found near coordinates")

            return self._extract(tags)
        except Exception as e:
            return self._fail_result(str(e))

    async def _query_overpass(self, lat: float, lng: float, radius: int = 200) -> dict[str, Any]:
        """Query OpenStreetMap for place of worship near coordinates."""
        overpass_query = f"""
        [out:json][timeout:25];
        (
          node["amenity"="place_of_worship"](around:{radius},{lat},{lng});
          way["amenity"="place_of_worship"](around:{radius},{lat},{lng});
          relation["amenity"="place_of_worship"](around:{radius},{lat},{lng});
        );
        out center;
        """
        response = await async_request_with_backoff(
            "POST", OVERPASS_ENDPOINT, data=overpass_query, headers=HEADERS
        )
        if not response:
            return {}

        try:
            data = response.json()
        except Exception:
            return {}

        if not data.get("elements"):
            return {}

        for element in data["elements"]:
            if "tags" in element:
                return element["tags"]
        return {}

    def _extract(self, tags: dict[str, Any]) -> CollectorResult:
        """Extract structured data from OSM tags."""
        result = CollectorResult(collector_name=self.name, raw_response=tags)

        # --- Amenity attributes ---
        tag_to_attr = {
            "toilets": "has_toilets",
            "drinking_water": "has_drinking_water",
            "internet_access": "has_internet",
            "capacity": "capacity",
        }

        for tag_key, attr_code in tag_to_attr.items():
            val = tags.get(tag_key)
            if val is not None:
                # Convert "yes"/"no" to boolean for known boolean fields
                if val in ("yes", "no") and attr_code.startswith("has_"):
                    result.attributes.append({"attribute_code": attr_code, "value": val == "yes"})
                else:
                    result.attributes.append({"attribute_code": attr_code, "value": val})

        # Denomination
        denomination = tags.get("denomination")
        if denomination:
            result.attributes.append({"attribute_code": "denomination", "value": denomination})

        # --- Contact info ---
        result.contact.update(ContactExtractor.from_osm_tags(tags))

        # --- Tags for downstream collectors ---
        if "wikipedia" in tags:
            result.tags["wikipedia"] = tags["wikipedia"]
        if "wikidata" in tags:
            result.tags["wikidata"] = tags["wikidata"]

        # --- Multilingual names ---
        for lang_code in ("ar", "hi", "te"):
            name_loc = tags.get(f"name:{lang_code}")
            if name_loc:
                result.attributes.append({"attribute_code": f"name_{lang_code}", "value": name_loc})

        return result
