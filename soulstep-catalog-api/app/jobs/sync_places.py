"""Cloud Run Job: Sync places from scraper DB to catalog DB.

Reads all ScrapedPlace rows from the scraper PostgreSQL DB (via SCRAPER_DATABASE_URL),
filters by quality score, builds PlaceCreate objects from raw_data JSON, and calls
_process_chunk() from app.api.v1.places in batches of 50.

Usage:
    SCRAPER_DATABASE_URL=postgresql://... python -m app.jobs.sync_places
"""

import logging
import time

from sqlalchemy import create_engine, text

from app.api.v1.places import _process_chunk
from app.db.session import run_migrations
from app.models.schemas import (
    ExternalReviewInput,
    PlaceAttributeInput,
    PlaceCreate,
    PlaceTranslationInput,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# Quality gate — mirrors GATE_SYNC threshold in scraper
_QUALITY_GATE = 0.75
_BATCH_SIZE = 50

# Religion values accepted by the catalog schema
_VALID_RELIGIONS = {"islam", "hinduism", "christianity", "all"}


# ── Inline sanitize helpers (mirrors scraper logic; ~30 lines) ────────────────


def _sanitize_religion(religion: str | None) -> str:
    """Map unrecognised/unknown religion strings to 'all'."""
    if religion and religion in _VALID_RELIGIONS:
        return religion
    return "all"


def _sanitize_attributes(attributes: list[dict]) -> list[PlaceAttributeInput]:
    """Drop attributes whose values are not accepted by PlaceAttributeInput."""
    result = []
    for attr in attributes:
        val = attr.get("value")
        if isinstance(val, dict):
            continue
        if isinstance(val, list):
            if all(isinstance(item, str) for item in val):
                result.append(PlaceAttributeInput(attribute_code=attr["attribute_code"], value=val))
        elif isinstance(val, str | int | float | bool):
            result.append(PlaceAttributeInput(attribute_code=attr["attribute_code"], value=val))
    return result


def _sanitize_reviews(reviews: list[dict]) -> list[ExternalReviewInput]:
    """Drop reviews with out-of-range rating (e.g. Foursquare tips use 0)."""
    result = []
    for r in reviews:
        rating = r.get("rating")
        if not isinstance(rating, int) or not (1 <= rating <= 5):
            continue
        try:
            result.append(
                ExternalReviewInput(
                    author_name=r.get("author_name", ""),
                    rating=rating,
                    text=r.get("text", ""),
                    time=r.get("time", 0),
                    language=r.get("language", "en"),
                    photo_urls=r.get("photo_urls") or [],
                )
            )
        except Exception:
            pass
    return result


def _is_name_specific_enough(name: str) -> bool:
    """Return False for overly generic single-word place names (e.g. 'Mosque')."""
    _GENERIC = frozenset(
        {
            "mosque",
            "masjid",
            "masjed",
            "jama",
            "jamia",
            "church",
            "chapel",
            "cathedral",
            "basilica",
            "temple",
            "mandir",
            "pagoda",
            "stupa",
            "gurudwara",
            "gurdwara",
            "synagogue",
            "shul",
            "shrine",
            "dargah",
            "darga",
            "mazar",
            "mausoleum",
            "monastery",
            "convent",
        }
    )
    words = name.lower().split()
    meaningful = [w for w in words if w not in ("the", "a", "an", "al", "al-", "el", "el-")]
    if len(meaningful) < 2:
        return meaningful[0] not in _GENERIC if meaningful else False
    return True


def _build_place_create(place_code: str, name: str, raw_data: dict) -> PlaceCreate | None:
    """Build a PlaceCreate from a ScrapedPlace row. Returns None if data is invalid."""
    data = raw_data

    image_urls = data.get("image_urls") or []

    translations_raw = data.get("translations")
    translations = None
    if isinstance(translations_raw, dict):
        translations = PlaceTranslationInput(
            name=translations_raw.get("name"),
            description=translations_raw.get("description"),
            address=translations_raw.get("address"),
        )

    try:
        return PlaceCreate(
            place_code=place_code,
            name=name or data.get("name", ""),
            religion=_sanitize_religion(data.get("religion")),
            place_type=data.get("place_type", "unknown"),
            lat=float(data.get("lat", 0)),
            lng=float(data.get("lng", 0)),
            address=data.get("address", ""),
            opening_hours=data.get("opening_hours"),
            utc_offset_minutes=data.get("utc_offset_minutes"),
            image_urls=image_urls,
            description=data.get("description"),
            website_url=data.get("website_url"),
            source=data.get("source"),
            city=data.get("city"),
            state=data.get("state"),
            country=data.get("country"),
            attributes=_sanitize_attributes(data.get("attributes") or []) or None,
            external_reviews=_sanitize_reviews(data.get("external_reviews") or []) or None,
            translations=translations,
        )
    except Exception as e:
        logger.warning("Failed to build PlaceCreate for %s: %s", place_code, e)
        return None


def main() -> None:
    import os

    scraper_db_url = os.environ.get("SCRAPER_DATABASE_URL")
    if not scraper_db_url:
        raise RuntimeError("SCRAPER_DATABASE_URL environment variable is required")

    start_time = time.time()
    logger.info("sync_places: starting")

    # ── Step 1: Run catalog migrations ───────────────────────────────────────
    logger.info("sync_places: running catalog migrations")
    run_migrations()
    logger.info("sync_places: migrations complete")

    # ── Step 2: Read all scraped places from scraper DB ──────────────────────
    logger.info("sync_places: connecting to scraper DB")
    scraper_engine = create_engine(scraper_db_url, echo=False)

    with scraper_engine.connect() as conn:
        rows = conn.execute(
            text("SELECT place_code, name, raw_data, quality_score " "FROM scrapedplace")
        ).fetchall()

    logger.info("sync_places: read %d rows from scraper DB", len(rows))

    # ── Step 3: Filter + build PlaceCreate objects ───────────────────────────
    places: list[PlaceCreate] = []
    skipped_quality = 0
    skipped_name = 0
    skipped_build = 0

    for row in rows:
        place_code, name, raw_data, quality_score = row

        # Quality gate (NULL passes through — legacy rows without a score)
        if quality_score is not None and quality_score < _QUALITY_GATE:
            skipped_quality += 1
            continue

        # Name specificity gate
        if not _is_name_specific_enough(name or ""):
            skipped_name += 1
            continue

        place = _build_place_create(place_code, name, raw_data or {})
        if place is None:
            skipped_build += 1
            continue

        places.append(place)

    logger.info(
        "sync_places: %d places to sync (%d skipped quality, %d skipped name, %d build errors)",
        len(places),
        skipped_quality,
        skipped_name,
        skipped_build,
    )

    # ── Step 4: Process in batches of 50 ────────────────────────────────────
    created = 0
    updated = 0
    failed = 0

    for i in range(0, len(places), _BATCH_SIZE):
        chunk = places[i : i + _BATCH_SIZE]
        logger.info(
            "sync_places: processing batch %d/%d (%d places)",
            i // _BATCH_SIZE + 1,
            (len(places) + _BATCH_SIZE - 1) // _BATCH_SIZE,
            len(chunk),
        )
        results = _process_chunk(chunk)
        for r in results:
            if r["ok"]:
                if r.get("action") == "created":
                    created += 1
                else:
                    updated += 1
            else:
                failed += 1
                logger.warning("sync_places: failed place %s: %s", r["place_code"], r.get("error"))

    elapsed = time.time() - start_time
    logger.info(
        "sync_places: done in %.1fs — created=%d updated=%d failed=%d",
        elapsed,
        created,
        updated,
        failed,
    )

    if failed > 0:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
