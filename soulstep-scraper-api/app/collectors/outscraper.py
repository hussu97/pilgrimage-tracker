"""
OutscraperCollector — fetches extended Google reviews via Outscraper API.

Optional, requires OUTSCRAPER_API_KEY. Particularly valuable for popular
pilgrimage sites with thousands of reviews (Google Maps API caps at 5).
"""

from __future__ import annotations

from typing import Any

import requests

from app.collectors.base import BaseCollector, CollectorResult
from app.utils.extractors import ReviewExtractor


class OutscraperCollector(BaseCollector):
    """Fetches extended Google reviews via Outscraper (optional, paid)."""

    name = "outscraper"
    requires_api_key = True
    api_key_env_var = "OUTSCRAPER_API_KEY"

    REVIEWS_URL = "https://api.app.outscraper.com/maps/reviews-v3"

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

        existing_data = existing_data or {}

        # We need the Google Place ID
        google_place_id = existing_data.get("google_place_id")
        if not google_place_id and place_code.startswith("gplc_"):
            google_place_id = place_code[5:]

        if not google_place_id:
            return self._skip_result("No Google Place ID available")

        try:
            reviews = self._fetch_reviews(google_place_id, api_key)
            if not reviews:
                return self._skip_result("No Outscraper reviews returned")

            return self._extract(reviews)
        except Exception as e:
            return self._fail_result(str(e))

    def _fetch_reviews(self, place_id: str, api_key: str, limit: int = 50) -> list[dict]:
        """Fetch reviews from Outscraper API."""
        headers = {"X-API-KEY": api_key}
        params = {
            "query": place_id,
            "reviewsLimit": limit,
            "language": "en",
            "sort": "newest",
        }
        resp = requests.get(self.REVIEWS_URL, headers=headers, params=params, timeout=(5, 30))
        if resp.status_code != 200:
            return []

        data = resp.json()
        if not data.get("data"):
            return []

        # Outscraper returns nested structure: data[0] is the place, reviews_data has reviews
        place_data = data["data"][0] if data["data"] else {}
        return place_data.get("reviews_data", [])

    def _extract(self, reviews: list[dict]) -> CollectorResult:
        """Extract reviews into standard format."""
        result = CollectorResult(
            collector_name=self.name,
            raw_response={"reviews": reviews},
        )
        result.reviews = ReviewExtractor.from_outscraper(reviews)
        return result
