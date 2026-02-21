"""
WikipediaCollector — fetches descriptions and images from Wikipedia REST API.

Uses the OSM wikipedia tag if available, otherwise falls back to search.
Fetches English, Arabic, and Hindi extracts when available.
"""

from __future__ import annotations

import urllib.parse
from typing import Any

from app.collectors.base import BaseCollector, CollectorResult
from app.scrapers.base import make_request_with_backoff

HEADERS = {"User-Agent": "PilgrimageTrackerBot/1.0 (hussain@example.com)"}


class WikipediaCollector(BaseCollector):
    """Fetches descriptions and images from Wikipedia (free, no key)."""

    name = "wikipedia"
    requires_api_key = False
    api_key_env_var = ""

    def collect(
        self,
        place_code: str,
        lat: float,
        lng: float,
        name: str,
        existing_data: dict[str, Any] | None = None,
    ) -> CollectorResult:
        existing_data = existing_data or {}

        # Determine lookup strategy
        wiki_tag = existing_data.get("tags", {}).get("wikipedia")

        try:
            if wiki_tag:
                # Use OSM wikipedia tag (e.g., "en:Al-Aqsa Mosque")
                en_info = self._fetch_from_tag(wiki_tag)
            else:
                # Fallback: search Wikipedia by place name
                en_info = self._search_wikipedia(name, "en")

            if not en_info:
                return self._skip_result("No Wikipedia article found")

            result = CollectorResult(
                collector_name=self.name,
                raw_response={"en": en_info},
            )

            # English description
            if en_info.get("description"):
                result.descriptions.append(
                    {
                        "text": en_info["description"],
                        "lang": "en",
                        "source": "wikipedia",
                        "score": None,
                    }
                )

            # Short description (one-liner from Wikidata-backed field)
            if en_info.get("short_description"):
                result.descriptions.append(
                    {
                        "text": en_info["short_description"],
                        "lang": "en",
                        "source": "wikipedia_short",
                        "score": None,
                    }
                )

            # Images
            if en_info.get("image_url"):
                result.images.append({"url": en_info["image_url"], "source": "wikipedia"})

            # Try to get the article title for other languages
            title = en_info.get("title", name)

            # Arabic and Hindi extracts
            for lang in ["ar", "hi"]:
                lang_info = self._fetch_by_title(title, lang)
                if lang_info and lang_info.get("description"):
                    result.raw_response[lang] = lang_info
                    result.descriptions.append(
                        {
                            "text": lang_info["description"],
                            "lang": lang,
                            "source": "wikipedia",
                            "score": None,
                        }
                    )

            return result
        except Exception as e:
            return self._fail_result(str(e))

    def _fetch_from_tag(self, wiki_tag: str) -> dict[str, Any]:
        """Fetch Wikipedia summary using an OSM wikipedia tag (e.g., 'en:Article Title')."""
        parts = wiki_tag.split(":", 1)
        if len(parts) == 2:
            lang, title = parts
        else:
            lang = "en"
            title = parts[0]

        return self._fetch_by_title(title, lang) or {}

    def _fetch_by_title(self, title: str, lang: str = "en") -> dict[str, Any] | None:
        """Fetch Wikipedia summary by title and language."""
        encoded_title = urllib.parse.quote(title)
        url = f"https://{lang}.wikipedia.org/api/rest_v1/page/summary/{encoded_title}"

        response = make_request_with_backoff("GET", url, headers=HEADERS)
        if not response or response.status_code != 200:
            return None

        try:
            data = response.json()
            info = {
                "title": data.get("title", title),
                "description": data.get("extract"),
                "short_description": data.get("description"),
                "image_url": None,
                "original_image": None,
            }
            if "thumbnail" in data:
                info["image_url"] = data["thumbnail"].get("source")
            if "originalimage" in data:
                info["original_image"] = data["originalimage"].get("source")
                if info["original_image"]:
                    info["image_url"] = info["original_image"]
            return info
        except Exception:
            return None

    def _search_wikipedia(self, query: str, lang: str = "en") -> dict[str, Any] | None:
        """Search Wikipedia and fetch summary of the first result."""
        search_url = (
            f"https://{lang}.wikipedia.org/w/api.php"
            f"?action=query&list=search&srsearch={urllib.parse.quote(query)}"
            f"&format=json&srlimit=1"
        )
        response = make_request_with_backoff("GET", search_url, headers=HEADERS)
        if not response or response.status_code != 200:
            return None

        try:
            data = response.json()
            results = data.get("query", {}).get("search", [])
            if not results:
                return None

            title = results[0]["title"]
            return self._fetch_by_title(title, lang)
        except Exception:
            return None
