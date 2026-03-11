"""
Shared HTTP header helpers for collector requests.

Provides per-request header diversification so that each outbound request
carries a randomly selected User-Agent and Accept-Language, making it harder
for server-side rate limiters that bucket by header fingerprint to group all
concurrent enrichment workers as a single aggressive client.
"""

from __future__ import annotations

import random

# Pool of realistic bot User-Agent strings (varied versions / contacts)
_USER_AGENTS = [
    "SoulStepBot/1.0 (contact@soul-step.org; +https://soul-step.org/bot)",
    "SoulStepBot/1.1 (bot@soul-step.org; OSM data enrichment)",
    "SoulStepBot/1.2 (data@soul-step.org; sacred-sites indexer)",
    "Mozilla/5.0 (compatible; SoulStepCrawler/2.0; +https://soul-step.org)",
    "SoulStepScraper/3.0 (hello@soul-step.org; research bot)",
]

_ACCEPT_LANGUAGES = [
    "en-US,en;q=0.9",
    "en-GB,en;q=0.8",
    "en;q=0.9,ar;q=0.8",
    "en-US,en;q=0.8,ar;q=0.5",
    "en;q=1.0",
]


def varied_headers(base: dict | None = None) -> dict:
    """Return headers with a randomly chosen User-Agent and Accept-Language.

    Call once per HTTP request so each request has a unique fingerprint.
    The `base` dict is not mutated — a fresh copy is returned.
    """
    headers = dict(base or {})
    headers["User-Agent"] = random.choice(_USER_AGENTS)
    headers["Accept-Language"] = random.choice(_ACCEPT_LANGUAGES)
    headers["Accept"] = "application/json, */*;q=0.8"
    return headers
