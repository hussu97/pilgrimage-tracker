"""
Place quality scoring engine.

Computes a 0.0–1.0 quality score from Google Maps metadata stored in raw_data
(available after the detail-fetch phase). Used to gate expensive downstream
operations: image download, enrichment, and sync.

Gate thresholds
---------------
GATE_IMAGE_DOWNLOAD : 0.20  — filters truly junk places (permanently closed, zero data)
GATE_ENRICHMENT     : 0.35  — main cost saver (no reviews, no photos, generic names)
GATE_SYNC           : 0.40  — ensures only minimum-viable places reach the platform

Filtered places are still stored in ScrapedPlace with their score and gate label
so runs can be re-processed with different thresholds without re-scraping.

Backwards-compat: quality_score IS NULL passes through all gates (existing runs).
"""

from __future__ import annotations

# ── Gate thresholds ──────────────────────────────────────────────────────────

GATE_IMAGE_DOWNLOAD: float = 0.20
GATE_ENRICHMENT: float = 0.35
GATE_SYNC: float = 0.40

# ── Generic place-type words (shared with enrichment.py) ─────────────────────

_GENERIC_PLACE_TERMS = frozenset(
    {
        # Mosques
        "mosque",
        "masjid",
        "masjed",
        "jama",
        "jamia",
        # Churches
        "church",
        "chapel",
        "cathedral",
        "basilica",
        # Temples / Hindu / Buddhist
        "temple",
        "mandir",
        "pagoda",
        "stupa",
        # Sikh
        "gurudwara",
        "gurdwara",
        # Jewish
        "synagogue",
        "shul",
        # Shrines / tombs / sufi
        "shrine",
        "dargah",
        "darga",
        "mazar",
        "mausoleum",
        # Monasteries
        "monastery",
        "convent",
    }
)

_LEADING_ARTICLES = ("the ", "a ", "an ", "al ", "al-", "el ", "el-")


# ── Name specificity ─────────────────────────────────────────────────────────


def _name_specificity(name: str) -> float:
    """Score name specificity on 0.0–1.0 scale.

    generic type word → 0.0
    1 word (non-generic) → 0.3
    2 words → 0.7
    3+ words → 1.0
    """
    normalized = name.strip().lower()
    for article in _LEADING_ARTICLES:
        if normalized.startswith(article):
            normalized = normalized[len(article) :].strip()
            break
    if normalized in _GENERIC_PLACE_TERMS:
        return 0.0
    words = normalized.split()
    if len(words) == 1:
        return 0.3
    elif len(words) == 2:
        return 0.7
    return 1.0


def is_generic_name(name: str) -> bool:
    """Return True if the place name is a bare generic type word.

    Shared with enrichment.py to avoid duplication.
    """
    normalized = name.strip().lower()
    for article in _LEADING_ARTICLES:
        if normalized.startswith(article):
            normalized = normalized[len(article) :].strip()
            break
    return normalized in _GENERIC_PLACE_TERMS


# ── Score computation ────────────────────────────────────────────────────────


def score_place_quality(raw_data: dict) -> float:
    """Compute a 0.0–1.0 quality score from GMaps metadata in raw_data.

    Factors and weights:
      rating + review count  0.30  (Bayesian-adjusted)
      business status        0.15
      photo count            0.10
      editorial/generative   0.10
      has website            0.05
      has opening hours      0.05
      name specificity       0.15
      place type bonus       0.10

    raw_data fields used:
      rating, user_rating_count  — added by build_place_data (direct fields)
      business_status            — added by build_place_data
      image_urls, image_blobs    — photo count proxy
      has_editorial              — added by build_place_data
      has_generative             — added by build_place_data
      website_url                — added by build_place_data
      opening_hours              — added by build_place_data
      name                       — added by build_place_data
      gmaps_types                — added by build_place_data (list of raw gmaps types)

    Falls back gracefully for older raw_data that lacks the new direct fields.
    """
    score = 0.0

    # ── 1. Rating + review count (0.30) ──────────────────────────────────────
    # Prefer direct fields added by build_place_data; fall back to attributes dict.
    rating: float = float(raw_data.get("rating") or 0.0)
    review_count: int = int(raw_data.get("user_rating_count") or 0)

    if not review_count:
        # Fallback: look in attributes list
        for attr in raw_data.get("attributes") or []:
            code = attr.get("attribute_code", "")
            if code == "rating" and not rating:
                rating = float(attr.get("value") or 0.0)
            elif code == "reviews_count" and not review_count:
                review_count = int(attr.get("value") or 0)

    # Bayesian adjustment: penalises low review counts
    bayesian = (rating * review_count + 10 * 3.0) / (review_count + 10) / 5.0
    score += bayesian * 0.30

    # ── 2. Business status (0.15) ─────────────────────────────────────────────
    status = raw_data.get("business_status", "")
    if status == "OPERATIONAL":
        score += 0.15
    elif status == "CLOSED_TEMPORARILY":
        score += 0.075

    # ── 3. Photo count (0.10) ─────────────────────────────────────────────────
    photo_count = len(raw_data.get("image_urls") or []) + len(raw_data.get("image_blobs") or [])
    if photo_count >= 2:
        score += 0.10
    elif photo_count == 1:
        score += 0.05

    # ── 4. Editorial / generative summary (0.10) ─────────────────────────────
    has_editorial: bool = bool(raw_data.get("has_editorial", False))
    has_generative: bool = bool(raw_data.get("has_generative", False))
    if has_editorial:
        score += 0.10
    elif has_generative:
        score += 0.05

    # ── 5. Has website (0.05) ────────────────────────────────────────────────
    if raw_data.get("website_url"):
        score += 0.05

    # ── 6. Has opening hours (0.05) ──────────────────────────────────────────
    opening_hours = raw_data.get("opening_hours") or {}
    if opening_hours and any(v != "Hours not available" for v in opening_hours.values()):
        score += 0.05

    # ── 7. Name specificity (0.15) ───────────────────────────────────────────
    score += _name_specificity(raw_data.get("name", "")) * 0.15

    # ── 8. Place type bonus (0.10) ───────────────────────────────────────────
    # base 0.5 + 0.25 per qualifying type (tourist_attraction, point_of_interest)
    gmaps_types: list[str] = raw_data.get("gmaps_types") or []
    type_factor = 0.5
    if "tourist_attraction" in gmaps_types:
        type_factor += 0.25
    if "point_of_interest" in gmaps_types:
        type_factor += 0.25
    score += type_factor * 0.10

    return min(1.0, max(0.0, score))


# ── Gate helpers ─────────────────────────────────────────────────────────────


def get_quality_gate(quality_score: float) -> str | None:
    """Return the lowest gate label the score fails, or None if it passes all.

    "below_image_gate"      → score < GATE_IMAGE_DOWNLOAD
    "below_enrichment_gate" → GATE_IMAGE_DOWNLOAD <= score < GATE_ENRICHMENT
    "below_sync_gate"       → GATE_ENRICHMENT <= score < GATE_SYNC
    None                    → score >= GATE_SYNC (passes all gates)
    """
    if quality_score < GATE_IMAGE_DOWNLOAD:
        return "below_image_gate"
    if quality_score < GATE_ENRICHMENT:
        return "below_enrichment_gate"
    if quality_score < GATE_SYNC:
        return "below_sync_gate"
    return None


def passes_gate(quality_score: float | None, threshold: float) -> bool:
    """Return True if the score meets the threshold or is NULL (backwards-compat)."""
    if quality_score is None:
        return True
    return quality_score >= threshold
