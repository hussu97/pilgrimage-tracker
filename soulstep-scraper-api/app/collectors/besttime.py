"""
BestTimeCollector — fetches busyness/foot-traffic forecasts from BestTime API.

Optional, requires BESTTIME_API_KEY.
"""

from __future__ import annotations

from typing import Any

import httpx

from app.collectors.base import BaseCollector, CollectorResult
from app.logger import get_logger

logger = get_logger(__name__)


class BestTimeCollector(BaseCollector):
    """Fetches busyness forecasts from BestTime.app (optional, paid)."""

    name = "besttime"
    requires_api_key = True
    api_key_env_var = "BESTTIME_API_KEY"

    FORECAST_URL = "https://besttime.app/api/v1/forecasts"

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
            forecast = await self._fetch_forecast(name, lat, lng, api_key)
            if not forecast:
                return self._skip_result("No BestTime forecast available")

            return self._extract(forecast)
        except Exception as e:
            return self._fail_result(str(e))

    async def _fetch_forecast(
        self, name: str, lat: float, lng: float, api_key: str
    ) -> dict[str, Any] | None:
        """Fetch foot traffic forecast from BestTime API."""
        params = {
            "api_key_private": api_key,
            "venue_name": name,
            "venue_address": f"{lat},{lng}",
        }
        async with httpx.AsyncClient(timeout=35.0) as client:
            resp = await client.post(self.FORECAST_URL, json=params)
        if resp.status_code != 200:
            logger.warning("besttime HTTP %d for %r", resp.status_code, name)
            return None

        data = resp.json()
        if data.get("status") != "OK":
            logger.warning("besttime 200 but status=%r for %r", data.get("status"), name)
            return None

        logger.info("besttime 200 OK for %r", name)
        return data

    def _extract(self, data: dict[str, Any]) -> CollectorResult:
        """Extract busyness attributes from BestTime response."""
        result = CollectorResult(collector_name=self.name, raw_response=data)

        analysis = data.get("analysis", {})

        # Build busyness forecast — hourly data per day of week
        forecast = {}
        peak_hours = []

        for day_info in analysis.get("week_raw", []):
            day_name = day_info.get("day_info", {}).get("day_text", "")
            hour_analysis = day_info.get("hour_analysis", [])

            if day_name and hour_analysis:
                forecast[day_name] = [
                    {"hour": h.get("hour", 0), "intensity": h.get("intensity_nr", 0)}
                    for h in hour_analysis
                ]

            # Peak hour for this day
            peak = day_info.get("peak_hours", [])
            if peak and day_name:
                peak_hours.append(f"{day_name}: {', '.join(str(h) for h in peak)}")

        if forecast:
            result.attributes.append({"attribute_code": "busyness_forecast", "value": forecast})
        if peak_hours:
            result.attributes.append(
                {"attribute_code": "peak_hours", "value": "; ".join(peak_hours)}
            )

        return result
