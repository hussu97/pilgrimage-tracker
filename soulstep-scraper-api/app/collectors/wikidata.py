"""
WikidataCollector — fetches structured data from Wikidata SPARQL/API.

Uses the Wikidata QID from OSM tags to look up founding date, heritage status,
social media accounts, and multilingual labels/descriptions.
"""

from __future__ import annotations

from typing import Any

from app.collectors.base import BaseCollector, CollectorResult
from app.scrapers.base import async_request_with_backoff
from app.utils.extractors import make_description

HEADERS = {"User-Agent": "SoulStepBot/1.0 (contact@soul-step.org)"}

# Wikidata property IDs we care about
PROPERTY_MAP = {
    "P571": "founded_year",  # inception/founding date
    "P1435": "heritage_status",  # heritage designation
    "P856": "website",  # official website
    "P2002": "social_twitter",  # Twitter/X handle
    "P2003": "social_instagram",  # Instagram username
    "P2013": "social_facebook",  # Facebook page/profile ID
}


class WikidataCollector(BaseCollector):
    """Fetches structured data from Wikidata (free, no key)."""

    name = "wikidata"
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
        existing_data = existing_data or {}

        # Get Wikidata QID from OSM tags
        qid = existing_data.get("tags", {}).get("wikidata")
        if not qid:
            return self._skip_result("No Wikidata QID available (needs OSM wikidata tag)")

        try:
            entity_data = await self._fetch_entity(qid)
            if not entity_data:
                return self._fail_result(f"Could not fetch Wikidata entity {qid}")

            return self._extract(entity_data, qid)
        except Exception as e:
            return self._fail_result(str(e))

    async def _fetch_entity(self, qid: str) -> dict[str, Any] | None:
        """Fetch a Wikidata entity by QID via the wbgetentities API."""
        url = (
            f"https://www.wikidata.org/w/api.php"
            f"?action=wbgetentities&ids={qid}&format=json"
            f"&languages=en|ar|hi|te&props=labels|descriptions|claims"
        )
        response = await async_request_with_backoff("GET", url, headers=HEADERS)
        if not response or response.status_code != 200:
            return None

        try:
            data = response.json()
            entities = data.get("entities", {})
            return entities.get(qid)
        except Exception:
            return None

    def _extract(self, entity: dict[str, Any], qid: str) -> CollectorResult:
        """Extract structured data from a Wikidata entity."""
        result = CollectorResult(collector_name=self.name, raw_response=entity)

        claims = entity.get("claims", {})

        # --- Attributes from properties ---
        for prop_id, attr_code in PROPERTY_MAP.items():
            claim_list = claims.get(prop_id, [])
            if not claim_list:
                continue

            value = self._extract_claim_value(claim_list[0])
            if value is None:
                continue

            if attr_code in ("website", "social_twitter", "social_instagram", "social_facebook"):
                result.contact[attr_code] = value
            else:
                result.attributes.append({"attribute_code": attr_code, "value": value})

        # --- Multilingual descriptions ---
        descriptions = entity.get("descriptions", {})
        for lang in ["en", "ar", "hi", "te"]:
            desc_obj = descriptions.get(lang, {})
            desc_text = desc_obj.get("value") if isinstance(desc_obj, dict) else None
            if desc_text:
                result.descriptions.append(make_description(desc_text, lang, "wikidata"))

        # --- Multilingual labels (names) ---
        labels = entity.get("labels", {})
        for lang_code in ("ar", "hi", "te"):
            label_obj = labels.get(lang_code)
            label_val = label_obj.get("value") if isinstance(label_obj, dict) else None
            if label_val:
                result.attributes.append(
                    {"attribute_code": f"name_{lang_code}", "value": label_val}
                )

        return result

    def _extract_claim_value(self, claim: dict) -> str | None:
        """Extract a human-readable value from a Wikidata claim."""
        mainsnak = claim.get("mainsnak", {})
        datavalue = mainsnak.get("datavalue", {})
        value_type = datavalue.get("type")
        value = datavalue.get("value")

        if value is None:
            return None

        if value_type == "string":
            return value

        if value_type == "time":
            # Extract year from Wikidata time format: "+YYYY-MM-DDT00:00:00Z"
            time_str = value.get("time", "")
            if time_str:
                # Strip leading + and extract year
                year_str = time_str.lstrip("+").split("-")[0]
                return year_str
            return None

        if value_type == "monolingualtext":
            return value.get("text")

        if value_type == "wikibase-entityid":
            # For heritage designations, return the label if possible
            entity_id = value.get("id")
            return entity_id  # Could be resolved to a label in a future enhancement

        return str(value)
