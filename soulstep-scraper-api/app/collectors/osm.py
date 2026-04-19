"""
OsmCollector — fetches place data from OpenStreetMap via Overpass API.

Extracts amenities, contact info, wikipedia/wikidata tags, and multilingual names.
"""

from __future__ import annotations

import asyncio
import random
from typing import Any

from app.collectors.base import BaseCollector, CollectorResult
from app.scrapers.base import async_request_with_backoff
from app.utils.extractors import ContactExtractor

# Official public Overpass mirrors — separate servers/networks/IPs.
# Rotating across them spreads load so no single mirror sees all our traffic.
OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",  # DE main
    "https://lz4.overpass-api.de/api/interpreter",  # DE alt node
    "https://overpass.kumi.systems/api/interpreter",  # kumi.systems
    "https://overpass.osm.ch/api/interpreter",  # Swiss
]

# Semaphore is created lazily so it is attached to the running event loop.
_overpass_sem: asyncio.Semaphore | None = None


def _get_overpass_sem() -> asyncio.Semaphore:
    """Return (or lazily create) the module-level Overpass concurrency semaphore."""
    global _overpass_sem
    from app.config import settings

    if _overpass_sem is None:
        _overpass_sem = asyncio.Semaphore(settings.overpass_concurrency)
    return _overpass_sem


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
        """Query OpenStreetMap for place of worship near coordinates.

        Applies three layers of rate-limit resilience:
          1. Acquires from the shared AsyncRateLimiter (1 rps Overpass bucket).
          2. Sleeps a random jitter so concurrent workers don't fire simultaneously.
          3. Holds the module-level semaphore to cap in-flight Overpass calls.
          4. Picks a random mirror so requests hit different servers.
          5. Uses per-request varied headers for fingerprint diversification.
        """
        from app.config import settings
        from app.scrapers.base import get_async_rate_limiter
        from app.utils.http_helpers import varied_headers

        overpass_query = f"""
        [out:json][timeout:25];
        (
          node["amenity"="place_of_worship"](around:{radius},{lat},{lng});
          way["amenity"="place_of_worship"](around:{radius},{lat},{lng});
          relation["amenity"="place_of_worship"](around:{radius},{lat},{lng});
        );
        out center;
        """

        rl = get_async_rate_limiter()
        await rl.acquire("overpass")
        await asyncio.sleep(random.uniform(0.0, settings.overpass_jitter_max))

        endpoint = random.choice(OVERPASS_ENDPOINTS)
        headers = varied_headers({"Content-Type": "application/x-www-form-urlencoded"})

        async with _get_overpass_sem():
            response = await async_request_with_backoff(
                "POST", endpoint, data=overpass_query, headers=headers, max_retries=2
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
