"""
FoursquareCollector — fetches tips and popularity data from Foursquare Places API.

Optional, requires FOURSQUARE_API_KEY.
"""

from __future__ import annotations

from typing import Any

import httpx

from app.collectors.base import BaseCollector, CollectorResult
from app.logger import get_logger
from app.utils.extractors import ReviewExtractor

logger = get_logger(__name__)


class FoursquareCollector(BaseCollector):
    """Fetches tips and popularity from Foursquare (optional, paid)."""

    name = "foursquare"
    requires_api_key = True
    api_key_env_var = "FOURSQUARE_API_KEY"

    SEARCH_URL = "https://api.foursquare.com/v3/places/match"
    TIPS_URL = "https://api.foursquare.com/v3/places/{fsq_id}/tips"

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

        try:
            # Step 1: Match place
            fsq_id = await self._match_place(name, lat, lng, api_key)
            if not fsq_id:
                return self._skip_result("No Foursquare match found")

            # Step 2: Fetch tips
            tips = await self._fetch_tips(fsq_id, api_key)

            result = CollectorResult(
                collector_name=self.name,
                raw_response={"fsq_id": fsq_id, "tips": tips},
            )
            result.reviews = ReviewExtractor.from_foursquare_tips(tips)
            return result
        except Exception as e:
            return self._fail_result(str(e))

    async def _match_place(self, name: str, lat: float, lng: float, api_key: str) -> str | None:
        """Match a place by name and coordinates."""
        headers = {
            "Authorization": api_key,
            "Accept": "application/json",
        }
        params = {
            "name": name,
            "ll": f"{lat},{lng}",
        }
        async with httpx.AsyncClient(timeout=35.0) as client:
            resp = await client.get(self.SEARCH_URL, headers=headers, params=params)
        if resp.status_code != 200:
            logger.warning("foursquare match HTTP %d for %r", resp.status_code, name)
            return None

        data = resp.json()
        place = data.get("place", {})
        fsq_id = place.get("fsq_id")
        logger.info("foursquare match 200 for %r — fsq_id=%s", name, fsq_id)
        return fsq_id

    async def _fetch_tips(self, fsq_id: str, api_key: str) -> list[dict]:
        """Fetch tips for a Foursquare place."""
        headers = {
            "Authorization": api_key,
            "Accept": "application/json",
        }
        url = self.TIPS_URL.format(fsq_id=fsq_id)
        async with httpx.AsyncClient(timeout=35.0) as client:
            resp = await client.get(url, headers=headers, params={"limit": 10})
        if resp.status_code != 200:
            logger.warning("foursquare tips HTTP %d for fsq_id=%s", resp.status_code, fsq_id)
            return []

        tips = resp.json()
        logger.info("foursquare tips 200 for fsq_id=%s — %d tip(s)", fsq_id, len(tips))
        return tips
