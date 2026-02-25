"""
FoursquareCollector — fetches tips and popularity data from Foursquare Places API.

Optional, requires FOURSQUARE_API_KEY.
"""

from __future__ import annotations

from typing import Any

import requests

from app.collectors.base import BaseCollector, CollectorResult


class FoursquareCollector(BaseCollector):
    """Fetches tips and popularity from Foursquare (optional, paid)."""

    name = "foursquare"
    requires_api_key = True
    api_key_env_var = "FOURSQUARE_API_KEY"

    SEARCH_URL = "https://api.foursquare.com/v3/places/match"
    TIPS_URL = "https://api.foursquare.com/v3/places/{fsq_id}/tips"

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

        try:
            # Step 1: Match place
            fsq_id = self._match_place(name, lat, lng, api_key)
            if not fsq_id:
                return self._skip_result("No Foursquare match found")

            # Step 2: Fetch tips
            tips = self._fetch_tips(fsq_id, api_key)

            result = CollectorResult(
                collector_name=self.name,
                raw_response={"fsq_id": fsq_id, "tips": tips},
            )

            # Convert tips to reviews format
            for tip in tips:
                result.reviews.append(
                    {
                        "author_name": tip.get("created_by", "Foursquare User"),
                        "rating": 0,  # Foursquare tips don't have individual ratings
                        "text": tip.get("text", ""),
                        "time": 0,
                        "relative_time_description": "",
                        "language": tip.get("lang", "en"),
                    }
                )

            return result
        except Exception as e:
            return self._fail_result(str(e))

    def _match_place(self, name: str, lat: float, lng: float, api_key: str) -> str | None:
        """Match a place by name and coordinates."""
        headers = {
            "Authorization": api_key,
            "Accept": "application/json",
        }
        params = {
            "name": name,
            "ll": f"{lat},{lng}",
        }
        resp = requests.get(self.SEARCH_URL, headers=headers, params=params, timeout=(5, 30))
        if resp.status_code != 200:
            return None

        data = resp.json()
        place = data.get("place", {})
        return place.get("fsq_id")

    def _fetch_tips(self, fsq_id: str, api_key: str) -> list[dict]:
        """Fetch tips for a Foursquare place."""
        headers = {
            "Authorization": api_key,
            "Accept": "application/json",
        }
        url = self.TIPS_URL.format(fsq_id=fsq_id)
        resp = requests.get(url, headers=headers, params={"limit": 10}, timeout=(5, 30))
        if resp.status_code != 200:
            return []

        return resp.json()
