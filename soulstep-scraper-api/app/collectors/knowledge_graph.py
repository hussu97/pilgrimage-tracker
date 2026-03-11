"""
KnowledgeGraphCollector — fetches entity info from Google Knowledge Graph Search API.

Free with 100k daily quota. Provides entity descriptions, schema.org types, and images.
"""

from __future__ import annotations

from typing import Any

import httpx

from app.collectors.base import BaseCollector, CollectorResult
from app.logger import get_logger
from app.utils.extractors import make_description

logger = get_logger(__name__)


class KnowledgeGraphCollector(BaseCollector):
    """Fetches entity info from Google Knowledge Graph Search API (free, uses GOOGLE_MAPS_API_KEY)."""

    name = "knowledge_graph"
    requires_api_key = True
    api_key_env_var = "GOOGLE_MAPS_API_KEY"  # Same key, separate quota (100k/day)

    KG_URL = "https://kgsearch.googleapis.com/v1/entities:search"

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
            response = await self._search(name, api_key)
            if not response:
                return self._skip_result("No Knowledge Graph results found")

            return self._extract(response)
        except Exception as e:
            return self._fail_result(str(e))

    async def _search(self, name: str, api_key: str) -> dict[str, Any] | None:
        """Search Knowledge Graph by name with Place type constraint."""
        params = {
            "query": name,
            "key": api_key,
            "limit": 1,
            "types": "Place",
            "languages": "en",
        }
        async with httpx.AsyncClient(timeout=35.0) as client:
            resp = await client.get(self.KG_URL, params=params)
        if resp.status_code != 200:
            logger.warning("knowledge_graph HTTP %d for %r", resp.status_code, name)
            return None

        data = resp.json()
        elements = data.get("itemListElement", [])
        logger.info("knowledge_graph 200 for %r — %d result(s)", name, len(elements))
        if not elements:
            return None

        return elements[0]

    def _extract(self, element: dict[str, Any]) -> CollectorResult:
        """Extract structured data from a Knowledge Graph element."""
        result_item = element.get("result", {})
        result_score = element.get("resultScore", 0)

        result = CollectorResult(
            collector_name=self.name,
            raw_response=element,
        )

        # --- Description ---
        detailed_desc = result_item.get("detailedDescription", {})
        if detailed_desc:
            article_body = detailed_desc.get("articleBody", "")
            if article_body:
                result.descriptions.append(make_description(article_body, "en", "knowledge_graph"))

        # Short description
        short_desc = result_item.get("description", "")
        if short_desc:
            result.descriptions.append(make_description(short_desc, "en", "knowledge_graph_short"))

        # --- Entity types ---
        entity_types = result_item.get("@type", [])
        if isinstance(entity_types, str):
            entity_types = [entity_types]
        result.entity_types = entity_types

        # --- Image ---
        image = result_item.get("image", {})
        if image:
            content_url = image.get("contentUrl")
            if content_url:
                result.images.append({"url": content_url, "source": "knowledge_graph"})

        # --- Website (another source for contact) ---
        url = result_item.get("url")
        if url:
            result.contact["website"] = url

        # Store result score as metadata
        result.tags["kg_result_score"] = str(result_score)

        return result
