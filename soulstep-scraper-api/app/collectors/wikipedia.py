"""
WikipediaCollector — fetches descriptions and images from Wikipedia REST API.

Uses the OSM wikipedia tag if available, otherwise falls back to search.
Fetches English, Arabic, and Hindi extracts when available.

Search-based lookups are validated for relevance before use, because Wikipedia's
keyword search may return unrelated articles (e.g. "Al Futtaim Masjid" → "Dubai Marina").
OSM-tag-based lookups bypass this check because OSM tags are human-curated.
"""

from __future__ import annotations

import math
import os
import re
import urllib.parse
from typing import Any

from app.collectors.base import BaseCollector, CollectorResult
from app.logger import get_logger
from app.scrapers.base import async_request_with_backoff
from app.utils.extractors import make_description
from app.utils.http_helpers import varied_headers

logger = get_logger(__name__)

# Maximum distance (km) between place coordinates and Wikipedia article
# coordinates before the article is rejected.  Override via env var.
_DEFAULT_MAX_DISTANCE_KM = 100.0

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
# person, not a physical place.  Wikidata short descriptions follow a
# "[nationality] [profession]" pattern (e.g. "Saudi politician"), so matching
# on the profession noun is reliable.  Checked before all other layers —
# a biography is never relevant to a sacred-site place search.
_PERSON_TERMS: frozenset[str] = frozenset(
    {
        # Civic / political
        "politician",
        "minister",
        "president",
        "governor",
        "senator",
        "parliamentarian",
        "diplomat",
        "ambassador",
        # Business
        "businessman",
        "businesswoman",
        "entrepreneur",
        "executive",
        # Academic / professional
        "scholar",
        "academic",
        "professor",
        "researcher",
        "scientist",
        "engineer",
        "architect",
        "lawyer",
        "judge",
        "physician",
        "doctor",
        # Arts / media
        "writer",
        "author",
        "novelist",
        "poet",
        "journalist",
        "artist",
        "painter",
        "sculptor",
        "musician",
        "singer",
        "rapper",
        "actor",
        "actress",
        "filmmaker",
        "director",
        # Sport
        "athlete",
        "footballer",
        "cricketer",
        "swimmer",
        "boxer",
        "wrestler",
        # Religious roles (people, not places)
        "imam",
        "cleric",
        "preacher",
        # Military
        "general",
        "admiral",
        "colonel",
        "soldier",
        "officer",
        # Generic Wikidata literal
        "person",
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


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return the great-circle distance in kilometres between two points."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    )
    return R * 2 * math.asin(math.sqrt(a))


class WikipediaCollector(BaseCollector):
    """Fetches descriptions and images from Wikipedia (free, no key)."""

    name = "wikipedia"
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

        # Determine lookup strategy
        wiki_tag = existing_data.get("tags", {}).get("wikipedia")

        try:
            if wiki_tag:
                # Use OSM wikipedia tag (e.g., "en:Al-Aqsa Mosque").
                # OSM tags are human-curated — skip relevance validation.
                en_info = await self._fetch_from_tag(wiki_tag)
                from_search = False
            else:
                # Build a location-aware query when city context is available
                # (Layer 3: reduces false positives from famous same-name articles)
                _tags = existing_data.get("tags") or {}
                city_hint = (
                    existing_data.get("city")
                    or (existing_data.get("address") or {}).get("city")
                    or _tags.get("addr:city")
                )
                search_query = f"{name} {city_hint}" if city_hint else name

                # Fallback: search Wikipedia by place name.
                en_info = await self._search_wikipedia(search_query, "en", lat=lat, lng=lng)
                from_search = True

            if not en_info:
                return self._skip_result("No Wikipedia article found")

            # Validate that a search-based result is actually about this place.
            # OSM-tag results are already precise, so they bypass this check.
            if from_search and not self._is_article_relevant(en_info, name, lat=lat, lng=lng):
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
                    make_description(en_info["description"], "en", "wikipedia")
                )

            # Short description (one-liner from Wikidata-backed field)
            if en_info.get("short_description"):
                result.descriptions.append(
                    make_description(en_info["short_description"], "en", "wikipedia_short")
                )

            # Images
            if en_info.get("image_url"):
                result.images.append({"url": en_info["image_url"], "source": "wikipedia"})

            # Try to get the article title for other languages
            title = en_info.get("title", name)

            # Arabic, Hindi, and Telugu extracts
            import asyncio as _asyncio

            lang_results = await _asyncio.gather(
                *[self._fetch_by_title(title, lang) for lang in ["ar", "hi", "te"]],
                return_exceptions=True,
            )
            for lang, lang_info in zip(["ar", "hi", "te"], lang_results, strict=False):
                if isinstance(lang_info, Exception) or not lang_info:
                    continue
                if lang_info.get("description"):
                    result.raw_response[lang] = lang_info
                    result.descriptions.append(
                        make_description(lang_info["description"], lang, "wikipedia")
                    )

            return result
        except Exception as e:
            return self._fail_result(str(e))

    async def _fetch_from_tag(self, wiki_tag: str) -> dict[str, Any]:
        """Fetch Wikipedia summary using an OSM wikipedia tag (e.g., 'en:Article Title')."""
        parts = wiki_tag.split(":", 1)
        if len(parts) == 2:
            lang, title = parts
        else:
            lang = "en"
            title = parts[0]

        return await self._fetch_by_title(title, lang) or {}

    async def _fetch_by_title(self, title: str, lang: str = "en") -> dict[str, Any] | None:
        """Fetch Wikipedia summary by title and language."""
        encoded_title = urllib.parse.quote(title)
        url = f"https://{lang}.wikipedia.org/api/rest_v1/page/summary/{encoded_title}"

        response = await async_request_with_backoff("GET", url, headers=varied_headers())
        if not response or response.status_code != 200:
            status = response.status_code if response else "no response"
            logger.warning("wikipedia HTTP %s for title=%r lang=%s", status, title, lang)
            return None

        logger.info("wikipedia 200 for title=%r lang=%s", title, lang)
        try:
            data = response.json()
            info: dict[str, Any] = {
                "title": data.get("title", title),
                "description": data.get("extract"),
                "short_description": data.get("description"),
                "image_url": None,
                "original_image": None,
                "coordinates": {},
            }
            if "thumbnail" in data:
                info["image_url"] = data["thumbnail"].get("source")
            if "originalimage" in data:
                info["original_image"] = data["originalimage"].get("source")
                if info["original_image"]:
                    info["image_url"] = info["original_image"]
            # Layer 1: extract article coordinates when present
            coords = data.get("coordinates")
            if coords and "lat" in coords and "lon" in coords:
                info["coordinates"] = {"lat": coords["lat"], "lon": coords["lon"]}
            return info
        except Exception:
            return None

    async def _search_wikipedia(
        self,
        query: str,
        lang: str = "en",
        lat: float | None = None,
        lng: float | None = None,
    ) -> dict[str, Any] | None:
        """Search Wikipedia and return the best-matching article from top-3 results.

        Layer 2: Fetches up to 3 candidates, scores each by Jaccard similarity
        against the original place name (stripping any appended city hint), then
        returns the highest-scoring candidate.  When coordinates are available,
        ties are broken by geographic proximity.
        """
        search_url = (
            f"https://{lang}.wikipedia.org/w/api.php"
            f"?action=query&list=search&srsearch={urllib.parse.quote(query)}"
            f"&format=json&srlimit=3"
        )
        response = await async_request_with_backoff("GET", search_url, headers=varied_headers())
        if not response or response.status_code != 200:
            status = response.status_code if response else "no response"
            logger.warning("wikipedia search HTTP %s for query=%r lang=%s", status, query, lang)
            return None

        try:
            data = response.json()
            results = data.get("query", {}).get("search", [])
            if not results:
                logger.info("wikipedia search 200 for query=%r lang=%s — 0 results", query, lang)
                return None

            # Normalize the full query (including city hint) for candidate scoring.
            # The city words will also appear in geographically correct articles,
            # so including them doesn't hurt and may strengthen correct matches.
            query_tokens = _normalize_name_tokens(query)

            candidates: list[tuple[float, float, dict[str, Any]]] = []
            import asyncio as _asyncio

            infos = await _asyncio.gather(
                *[self._fetch_by_title(r["title"], lang) for r in results],
                return_exceptions=True,
            )

            for r, info in zip(results, infos, strict=False):
                if isinstance(info, Exception) or not info:
                    continue
                title_tokens = _normalize_name_tokens(info.get("title", r["title"]))
                if query_tokens and title_tokens:
                    union = query_tokens | title_tokens
                    intersection = query_tokens & title_tokens
                    jaccard = len(intersection) / len(union)
                else:
                    jaccard = 0.0

                # Distance score: lower is better → negate for sorting
                dist_km = float("inf")
                article_coords = info.get("coordinates", {})
                if article_coords and lat is not None and lng is not None:
                    dist_km = _haversine_km(lat, lng, article_coords["lat"], article_coords["lon"])

                candidates.append((jaccard, dist_km, info))
                logger.info(
                    "wikipedia search candidate %r — jaccard=%.2f dist_km=%.1f",
                    info.get("title"),
                    jaccard,
                    dist_km,
                )

            if not candidates:
                return None

            # Sort by jaccard descending, then distance ascending (ties broken by proximity)
            candidates.sort(key=lambda c: (-c[0], c[1]))
            best_jaccard, best_dist, best_info = candidates[0]
            logger.info(
                "wikipedia search 200 for query=%r lang=%s — top result: %r (jaccard=%.2f, dist_km=%.1f)",
                query,
                lang,
                best_info.get("title"),
                best_jaccard,
                best_dist,
            )
            return best_info
        except Exception:
            return None

    def _is_article_relevant(
        self,
        article_info: dict[str, Any],
        place_name: str,
        lat: float | None = None,
        lng: float | None = None,
    ) -> bool:
        """Determine whether a Wikipedia article found via search is relevant to the place.

        Only applied to search-based lookups (OSM-tag lookups are already
        human-curated and precise).

        Layer 0 — Distance gate (runs first when coordinates are available):
          If the Wikipedia article has coordinates and the place has coordinates,
          reject immediately if distance > WIKIPEDIA_MAX_DISTANCE_KM (default 100 km).

        Layer 0.5 — Person gate:
          If the article's Wikidata short description contains a profession/role
          term that identifies a person (politician, scholar, footballer, …),
          reject outright.  A biography is never relevant to a physical-place
          search regardless of name similarity.

        Layer 1 — Token overlap (Jaccard):
          Normalize both the article title and the place name to token sets
          (applying synonym mapping so "masjid" == "mosque", etc.).
          If the Jaccard similarity ≥ 0.3, the article is provisionally accepted.
          If below 0.3, a quick Layer 2 contradiction check still runs, then
          falls through to Layer 3 (no early accept on low overlap).

        Layer 2 — Wikidata short description contradiction:
          If the place name contains a religious-site token (mosque, temple,
          shrine, …) but the article's Wikidata short description contains a
          term associated with districts, malls, roads, etc., reject outright.

        Layer 3 — Distinctive token gap penalty:
          If the place name contains tokens absent from the article title (after
          excluding noise and religious tokens) AND the Jaccard score is below 0.6,
          reject.  The missing-token threshold depends on the Jaccard score:
          • jaccard == 0.0 → threshold 1 (zero shared tokens means any mismatch rejects)
          • jaccard  > 0.0 → threshold 2 (some overlap; require 2+ unmatched tokens)

        When neither layer gives a definitive answer, the article is accepted so
        that downstream quality scoring can make the final call.
        """
        article_title = article_info.get("title", "")
        short_desc = (article_info.get("short_description") or "").lower()

        place_tokens = _normalize_name_tokens(place_name)
        title_tokens = _normalize_name_tokens(article_title)

        # Layer 0: distance gate
        max_dist_km = float(os.environ.get("WIKIPEDIA_MAX_DISTANCE_KM", _DEFAULT_MAX_DISTANCE_KM))
        article_coords = article_info.get("coordinates", {})
        if article_coords and lat is not None and lng is not None:
            dist_km = _haversine_km(lat, lng, article_coords["lat"], article_coords["lon"])
            if dist_km > max_dist_km:
                logger.info(
                    "wikipedia relevance rejected %r — distance %.1f km > limit %.1f km",
                    article_title,
                    dist_km,
                    max_dist_km,
                )
                return False

        # Layer 0.5: person gate — reject biographies regardless of name similarity
        if short_desc and any(term in short_desc for term in _PERSON_TERMS):
            logger.info(
                "wikipedia relevance rejected %r — article appears to be about a person (%r)",
                article_title,
                short_desc[:80],
            )
            return False

        # Layer 1: Jaccard token overlap
        jaccard = 0.0
        if place_tokens and title_tokens:
            union = place_tokens | title_tokens
            intersection = place_tokens & title_tokens
            jaccard = len(intersection) / len(union)
            if jaccard >= 0.3:
                # Provisionally accepted — still check Layer 3 below
                pass
            else:
                # Low overlap — check Layer 2 before giving up
                place_is_religious = bool(place_tokens & _RELIGIOUS_TOKENS)
                if place_is_religious and short_desc:
                    if any(term in short_desc for term in _NON_PLACE_TERMS):
                        return False
                # Fall through to Layer 3 — low jaccard alone is not enough to accept

        # Layer 2: explicit contradiction via Wikidata short description
        place_is_religious = bool(place_tokens & _RELIGIOUS_TOKENS)
        if place_is_religious and short_desc:
            if any(term in short_desc for term in _NON_PLACE_TERMS):
                return False

        # Layer 3: distinctive token gap penalty
        # Tokens in the place name that are absent from the article title,
        # excluding noise words and generic religious terms.
        # When jaccard is exactly 0.0 (zero shared tokens), even 1 missing distinctive
        # token is enough to reject — there is no overlap to justify the match at all.
        distinctive_missing = place_tokens - title_tokens - _NOISE_TOKENS - _RELIGIOUS_TOKENS
        gap_threshold = 1 if jaccard == 0.0 else 2
        if len(distinctive_missing) >= gap_threshold and jaccard < 0.6:
            logger.info(
                "wikipedia relevance rejected %r — %d distinctive tokens missing %s (jaccard=%.2f)",
                article_title,
                len(distinctive_missing),
                distinctive_missing,
                jaccard,
            )
            return False

        # No strong signal either way — accept and let quality scoring decide
        return True
