"""
WikipediaCollector — fetches descriptions and images from Wikipedia REST API.

Uses the OSM wikipedia tag if available, otherwise falls back to search.
Fetches English, Arabic, and Hindi extracts when available.

Search-based lookups are validated for relevance before use, because Wikipedia's
keyword search may return unrelated articles (e.g. "Al Futtaim Masjid" → "Dubai Marina").
OSM-tag-based lookups bypass this check because OSM tags are human-curated.
"""

from __future__ import annotations

import re
import urllib.parse
from typing import Any

from app.collectors.base import BaseCollector, CollectorResult
from app.scrapers.base import make_request_with_backoff

HEADERS = {"User-Agent": "PilgrimageTrackerBot/1.0 (hussain@example.com)"}

# ── Relevance-validation helpers ───────────────────────────────────────────────

# Arabic/common prefix "al-" variants and other noise words to strip during
# token normalization so that "Al-Futtaim" and "Futtaim" share a token.
_NOISE_TOKENS: frozenset[str] = frozenset(
    {
        "the",
        "a",
        "an",
        "of",
        "in",
        "at",
        "and",
        "al",
        "el",
        "bin",
        "bint",
        "ibn",
        "grand",
        "great",
        "new",
        "old",
    }
)

# Synonym map: normalize regional/script variants to a shared canonical token so
# that "masjid" and "mosque" are treated as the same word during overlap scoring.
_NAME_SYNONYMS: dict[str, str] = {
    "masjid": "mosque",
    "jami": "mosque",
    "jame": "mosque",
    "jamia": "mosque",
    "jameh": "mosque",
    "mandir": "temple",
    "devalaya": "temple",
    "kovil": "temple",
}

# Tokens that indicate a religious/sacred site in the place name.
_RELIGIOUS_TOKENS: frozenset[str] = frozenset(
    {
        "mosque",
        "church",
        "temple",
        "shrine",
        "cathedral",
        "synagogue",
        "gurdwara",
        "chapel",
        "basilica",
        "pagoda",
    }
)

# Terms in a Wikidata short description that signal the article is about a
# geographic/administrative area or commercial/civic feature — NOT a place of
# worship.  When the place name implies a religious site and the article's short
# description contains one of these, we treat it as a definite mismatch.
_NON_PLACE_TERMS: frozenset[str] = frozenset(
    {
        "district",
        "neighborhood",
        "neighbourhood",
        "suburb",
        "borough",
        "quarter",
        "road",
        "street",
        "avenue",
        "highway",
        "mall",
        "shopping",
        "tower",
        "hotel",
        "restaurant",
        "cafe",
        "park",
        "garden",
        "waterfront",
        "marina",
        "airport",
        "station",
        "terminal",
        "university",
        "school",
        "college",
        "hospital",
        "residential",
        "community",
    }
)


def _normalize_name_tokens(name: str) -> frozenset[str]:
    """Tokenize and normalize a place name for overlap comparison.

    Steps:
      1. Lowercase and split on whitespace / hyphens / underscores / commas.
      2. Strip surrounding punctuation from each token.
      3. Apply synonym mapping (e.g. "masjid" → "mosque").
      4. Drop noise/stop words.
    """
    raw_tokens = re.split(r"[\s\-_/,]+", name.lower())
    result: set[str] = set()
    for tok in raw_tokens:
        tok = tok.strip("'\".()")
        if not tok:
            continue
        tok = _NAME_SYNONYMS.get(tok, tok)
        if tok in _NOISE_TOKENS:
            continue
        result.add(tok)
    return frozenset(result)


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
                # Use OSM wikipedia tag (e.g., "en:Al-Aqsa Mosque").
                # OSM tags are human-curated — skip relevance validation.
                en_info = self._fetch_from_tag(wiki_tag)
                from_search = False
            else:
                # Fallback: search Wikipedia by place name.
                en_info = self._search_wikipedia(name, "en")
                from_search = True

            if not en_info:
                return self._skip_result("No Wikipedia article found")

            # Validate that a search-based result is actually about this place.
            # OSM-tag results are already precise, so they bypass this check.
            if from_search and not self._is_article_relevant(en_info, name):
                article_title = en_info.get("title", "")
                return self._skip_result(
                    f"Wikipedia search result '{article_title}' is not relevant to '{name}'"
                )

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

            # Arabic, Hindi, and Telugu extracts
            for lang in ["ar", "hi", "te"]:
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

    def _is_article_relevant(self, article_info: dict[str, Any], place_name: str) -> bool:
        """Determine whether a Wikipedia article found via search is relevant to the place.

        Only applied to search-based lookups (OSM-tag lookups are already
        human-curated and precise).

        Two-layer check:
          Layer 1 — Token overlap (Jaccard):
            Normalize both the article title and the place name to token sets
            (applying synonym mapping so "masjid" == "mosque", etc.).
            If the Jaccard similarity ≥ 0.3, the article is accepted.

          Layer 2 — Wikidata short description contradiction:
            If the place name contains a religious-site token (mosque, temple,
            shrine, …) but the article's Wikidata short description contains a
            term associated with districts, malls, roads, etc., reject outright.

        When neither layer gives a definitive answer, the article is accepted so
        that downstream quality scoring can make the final call.
        """
        article_title = article_info.get("title", "")
        short_desc = (article_info.get("short_description") or "").lower()

        place_tokens = _normalize_name_tokens(place_name)
        title_tokens = _normalize_name_tokens(article_title)

        # Layer 1: Jaccard token overlap
        if place_tokens and title_tokens:
            union = place_tokens | title_tokens
            intersection = place_tokens & title_tokens
            jaccard = len(intersection) / len(union)
            if jaccard >= 0.3:
                return True

        # Layer 2: explicit contradiction via Wikidata short description
        place_is_religious = bool(place_tokens & _RELIGIOUS_TOKENS)
        if place_is_religious and short_desc:
            if any(term in short_desc for term in _NON_PLACE_TERMS):
                return False

        # No strong signal either way — accept and let quality scoring decide
        return True
