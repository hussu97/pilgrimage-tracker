"""
Place quality scoring engine.

Computes a 0.0–1.0 quality score from Google Maps metadata stored in raw_data
(available after the detail-fetch phase). Used to gate expensive downstream
operations: image download, enrichment, and sync.

Gate thresholds
---------------
GATE_IMAGE_DOWNLOAD : 0.80  — filters junk places (permanently closed, zero data)
GATE_ENRICHMENT     : 0.80  — main cost saver (no reviews, no photos, vague names)
GATE_SYNC           : 0.80  — ensures only solid places reach the platform

Filtered places are still stored in ScrapedPlace with their score and gate label
so runs can be re-processed with different thresholds without re-scraping.

Name specificity hard gate
--------------------------
Places with a name shorter than 2 meaningful words (e.g. "Mosque", "Hagia") are
blocked from enrichment and sync regardless of quality score.  Use
`is_name_specific_enough()` for this check.

Backwards-compat: quality_score IS NULL passes through all gates (existing runs).
"""

from __future__ import annotations

# ── Gate thresholds ──────────────────────────────────────────────────────────

GATE_IMAGE_DOWNLOAD: float = 0.80
GATE_ENRICHMENT: float = 0.80
GATE_SYNC: float = 0.80

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


def is_name_specific_enough(name: str) -> bool:
    """Return True if the name is specific enough for enrichment and sync.

    Requires at least 2 meaningful words (specificity score ≥ 0.7).
    Single-word names (e.g. "Hagia") and bare type words (e.g. "Mosque") are
    not specific enough — external collectors would find nothing useful.
    """
    return _name_specificity(name) >= 0.7


# ── Score computation ────────────────────────────────────────────────────────


def score_place_quality(raw_data: dict) -> float:
    """Compute a 0.0–1.0 quality score from GMaps metadata in raw_data.

    Factors and weights:
      rating + review count  0.30  (Bayesian-adjusted)
      business status        0.15
      photo count            0.15  (5-tier: 0 / 1 / 2-4 / 5-9 / 10+)
      editorial summary      0.05  (bonus only — rare field, no penalty for absence)
      has website            0.05
      has opening hours      0.05
      name specificity       0.25  (higher weight — also a hard gate for enrichment/sync)

    raw_data fields used:
      rating, user_rating_count  — added by build_place_data (direct fields)
      business_status            — added by build_place_data
      image_urls, image_blobs    — photo count proxy
      has_editorial              — added by build_place_data
      website_url                — added by build_place_data
      opening_hours              — added by build_place_data
      name                       — added by build_place_data

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

    # ── 3. Photo count (0.15) — 3-tier (scraper fetches max 3 images) ───────────
    # 3+: best (1.0) | 2: medium (0.40) | 1: low (0.10) | 0: none (0.0)
    photo_count = len(raw_data.get("image_urls") or []) + len(raw_data.get("image_blobs") or [])
    if photo_count >= 3:
        score += 0.15
    elif photo_count >= 2:
        score += 0.06  # 0.40 * 0.15
    elif photo_count >= 1:
        score += 0.015  # 0.10 * 0.15

    # ── 4. Editorial summary (0.05, bonus only) ───────────────────────────────
    if raw_data.get("has_editorial"):
        score += 0.05

    # ── 5. Has website (0.05) ────────────────────────────────────────────────
    if raw_data.get("website_url"):
        score += 0.05

    # ── 6. Has opening hours (0.05) ──────────────────────────────────────────
    opening_hours = raw_data.get("opening_hours") or {}
    if opening_hours and any(v != "Hours not available" for v in opening_hours.values()):
        score += 0.05

    # ── 7. Name specificity (0.25) ───────────────────────────────────────────
    score += _name_specificity(raw_data.get("name", "")) * 0.25

    return min(1.0, max(0.0, score))


# ── Quality breakdown ────────────────────────────────────────────────────────


def score_place_quality_breakdown(raw_data: dict) -> dict:
    """Return a factor-by-factor breakdown of the quality score.

    Returns a dict with:
      total_score  float          capped 0.0–1.0
      gate         str | None     gate label or None if all gates passed
      factors      list[dict]     7 entries, one per scoring factor
    """
    factors = []

    # ── 1. Rating + review count (0.30) ──────────────────────────────────────
    rating: float = float(raw_data.get("rating") or 0.0)
    review_count: int = int(raw_data.get("user_rating_count") or 0)
    if not review_count:
        for attr in raw_data.get("attributes") or []:
            code = attr.get("attribute_code", "")
            if code == "rating" and not rating:
                rating = float(attr.get("value") or 0.0)
            elif code == "reviews_count" and not review_count:
                review_count = int(attr.get("value") or 0)
    bayesian = (rating * review_count + 10 * 3.0) / (review_count + 10) / 5.0
    weight_1 = 0.30
    raw_1 = bayesian
    factors.append(
        {
            "name": "Rating & Reviews",
            "weight": weight_1,
            "raw_score": round(raw_1, 4),
            "weighted": round(raw_1 * weight_1, 4),
            "detail": f"rating={rating}, reviews={review_count}, bayesian={round(bayesian, 4)}",
        }
    )

    # ── 2. Business status (0.15) ─────────────────────────────────────────────
    status = raw_data.get("business_status", "")
    if status == "OPERATIONAL":
        raw_2 = 1.0
    elif status == "CLOSED_TEMPORARILY":
        raw_2 = 0.5
    else:
        raw_2 = 0.0
    weight_2 = 0.15
    factors.append(
        {
            "name": "Business Status",
            "weight": weight_2,
            "raw_score": round(raw_2, 4),
            "weighted": round(raw_2 * weight_2, 4),
            "detail": f"status={status or 'unknown'}",
        }
    )

    # ── 3. Photo count (0.15) — 3-tier (scraper fetches max 3 images) ───────────
    # 3+: best (1.0) | 2: medium (0.40) | 1: low (0.10) | 0: none (0.0)
    photo_count = len(raw_data.get("image_urls") or []) + len(raw_data.get("image_blobs") or [])
    if photo_count >= 3:
        raw_3 = 1.0
    elif photo_count >= 2:
        raw_3 = 0.40
    elif photo_count >= 1:
        raw_3 = 0.10
    else:
        raw_3 = 0.0
    weight_3 = 0.15
    factors.append(
        {
            "name": "Photo Count",
            "weight": weight_3,
            "raw_score": round(raw_3, 4),
            "weighted": round(raw_3 * weight_3, 4),
            "detail": f"photos={photo_count} (tiers: 0=none/1=low/2=medium/3+=best)",
        }
    )

    # ── 4. Editorial summary (0.05, bonus only) ───────────────────────────────
    has_editorial: bool = bool(raw_data.get("has_editorial", False))
    raw_4 = 1.0 if has_editorial else 0.0
    weight_4 = 0.05
    factors.append(
        {
            "name": "Editorial Summary",
            "weight": weight_4,
            "raw_score": round(raw_4, 4),
            "weighted": round(raw_4 * weight_4, 4),
            "detail": f"has_editorial={has_editorial}",
        }
    )

    # ── 5. Has website (0.05) ────────────────────────────────────────────────
    has_website = bool(raw_data.get("website_url"))
    raw_5 = 1.0 if has_website else 0.0
    weight_5 = 0.05
    factors.append(
        {
            "name": "Has Website",
            "weight": weight_5,
            "raw_score": round(raw_5, 4),
            "weighted": round(raw_5 * weight_5, 4),
            "detail": f"website_url={'present' if has_website else 'absent'}",
        }
    )

    # ── 6. Has opening hours (0.05) ──────────────────────────────────────────
    opening_hours = raw_data.get("opening_hours") or {}
    has_hours = bool(
        opening_hours and any(v != "Hours not available" for v in opening_hours.values())
    )
    raw_6 = 1.0 if has_hours else 0.0
    weight_6 = 0.05
    factors.append(
        {
            "name": "Opening Hours",
            "weight": weight_6,
            "raw_score": round(raw_6, 4),
            "weighted": round(raw_6 * weight_6, 4),
            "detail": f"has_hours={has_hours}, days={len(opening_hours)}",
        }
    )

    # ── 7. Name specificity (0.25) ───────────────────────────────────────────
    name = raw_data.get("name") or ""
    raw_7 = _name_specificity(name)
    weight_7 = 0.25
    factors.append(
        {
            "name": "Name Specificity",
            "weight": weight_7,
            "raw_score": round(raw_7, 4),
            "weighted": round(raw_7 * weight_7, 4),
            "detail": f"name={name!r}, specificity={raw_7}",
        }
    )

    total = sum(f["weighted"] for f in factors)
    total = min(1.0, max(0.0, total))
    return {
        "total_score": round(total, 4),
        "gate": get_quality_gate(total),
        "factors": factors,
    }


# ── Gate helpers ─────────────────────────────────────────────────────────────


def get_quality_gate(quality_score: float) -> str | None:
    """Return the lowest gate label the score fails, or None if it passes all.

    "below_image_gate"      → score < GATE_IMAGE_DOWNLOAD (0.80)
    "below_enrichment_gate" → GATE_IMAGE_DOWNLOAD <= score < GATE_ENRICHMENT (0.80)
    "below_sync_gate"       → GATE_ENRICHMENT <= score < GATE_SYNC (0.80)
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
