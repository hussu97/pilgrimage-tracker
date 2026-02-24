"""Backfill translations for existing Place and Review rows that lack non-English content.

Usage (from the soulstep-catalog-api/ directory with venv active):
    python -m scripts.backfill_translations [--langs ar hi] [--dry-run] [--batch-size 50]

What it does:
1. Iterates all Place rows; for each place × field × language combination missing a
   ContentTranslation row, batch-translates via Google Cloud Translation API v3.
2. Iterates all Review rows; same logic for title and body fields.
3. Inserts results with source="google_translate".
4. Also migrates existing name_{lang} PlaceAttribute values into
   ContentTranslation rows (source="scraper") if not already present.

Supported languages are read from seed_data.json (the single source of truth).

Environment:
    GOOGLE_CLOUD_PROJECT — GCP project ID (required for translation).
    Credentials are resolved via Application Default Credentials (ADC).
    Run `gcloud auth application-default login` before running this script.
    Without GOOGLE_CLOUD_PROJECT set, only the attribute migration step runs.
"""

import argparse
import json
import logging
import os
import sys
import time
from pathlib import Path

# Allow running as `python -m scripts.backfill_translations` from server/
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_PROJECT_ROOT))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(_PROJECT_ROOT / ".env")

from sqlmodel import Session, select  # noqa: E402

from app.db import content_translations as ct_db  # noqa: E402
from app.db.models import Place, PlaceAttribute, Review  # noqa: E402
from app.db.session import engine  # noqa: E402
from app.services.translation_service import translate_batch  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)
# Ensure translation_service logs are also visible
logging.getLogger("app.services.translation_service").setLevel(logging.INFO)

# ── Language list from seed_data.json (single source of truth) ────────────────
_SEED_DATA_PATH = _PROJECT_ROOT / "app" / "db" / "seed_data.json"
with open(_SEED_DATA_PATH) as f:
    _seed = json.load(f)
_ALL_LANG_CODES = [lang["code"] for lang in _seed["languages"]]
# Exclude English — we translate *from* English to the rest
_SUPPORTED_LANGS = [code for code in _ALL_LANG_CODES if code != "en"]

_TRANSLATABLE_FIELDS = ["name", "description", "address"]
_REVIEW_TRANSLATABLE_FIELDS = ["title", "body"]

# Legacy attribute codes (e.g. name_ar, name_hi) that the scraper may have
# stored as PlaceAttribute rows. Auto-generated from the languages list so
# new languages are picked up without code changes.
_LEGACY_ATTR_LANGS: dict[str, tuple[str, str]] = {
    f"name_{code}": ("name", code) for code in _SUPPORTED_LANGS
}


def _migrate_legacy_attributes(session: Session, dry_run: bool) -> int:
    """Copy legacy name_{lang} PlaceAttributes into ContentTranslation rows."""
    migrated = 0
    for attr_code, (field, lang) in _LEGACY_ATTR_LANGS.items():
        attrs = session.exec(
            select(PlaceAttribute).where(PlaceAttribute.attribute_code == attr_code)
        ).all()
        for attr in attrs:
            existing = ct_db.get_translation("place", attr.place_code, field, lang, session)
            if existing:
                continue  # already migrated
            text = attr.value_text
            if not text:
                continue
            logger.info(
                "  Migrate %s/%s %s=%s → %r", attr.place_code, field, lang, attr_code, text[:40]
            )
            if not dry_run:
                ct_db.upsert_translation(
                    entity_type="place",
                    entity_code=attr.place_code,
                    field=field,
                    lang=lang,
                    text=text,
                    source="scraper",
                    session=session,
                )
            migrated += 1
    return migrated


def _backfill_places(
    session: Session,
    langs: list[str],
    batch_size: int,
    dry_run: bool,
    rate_limit_delay: float,
) -> int:
    places = session.exec(select(Place)).all()
    logger.info("Found %d places to process", len(places))

    if not places:
        logger.warning("No Place rows in the database — nothing to translate")
        return 0

    # Log a sample place so the user can verify DB connectivity
    sample = places[0]
    logger.info(
        "  Sample place: code=%s name=%r description=%s address=%s",
        sample.place_code,
        (sample.name or "")[:50],
        "yes" if sample.description else "NO",
        "yes" if sample.address else "NO",
    )

    # Check API key early
    project = os.environ.get("GOOGLE_CLOUD_PROJECT")
    if not project:
        logger.error("GOOGLE_CLOUD_PROJECT not set. Add it to soulstep-catalog-api/.env")
        return 0
    logger.info("Credentials OK: GOOGLE_CLOUD_PROJECT=%s (using ADC)", project)

    translated_count = 0

    for lang in langs:
        logger.info("=== Language: %s ===", lang)
        # Collect (place, field, english_text) triples that need translation
        missing: list[tuple[Place, str, str]] = []
        already_exist = 0
        empty_fields = 0
        for place in places:
            for field in _TRANSLATABLE_FIELDS:
                en_text = getattr(place, field, None)
                if not en_text:
                    empty_fields += 1
                    continue
                existing = ct_db.get_translation("place", place.place_code, field, lang, session)
                if existing is None:
                    missing.append((place, field, en_text))
                else:
                    already_exist += 1

        logger.info(
            "  %s summary: %d missing, %d already translated, %d empty source fields",
            lang,
            len(missing),
            already_exist,
            empty_fields,
        )

        if not missing:
            logger.info("  Nothing to translate for %s — skipping", lang)
            continue

        # Process in batches
        for start in range(0, len(missing), batch_size):
            chunk = missing[start : start + batch_size]
            texts = [en_text for _, _, en_text in chunk]
            logger.info("  Translating batch %d–%d …", start + 1, start + len(chunk))

            if dry_run:
                for place, field, _ in chunk:
                    logger.info("    [DRY] would translate %s/%s", place.place_code, field)
                continue

            results = translate_batch(texts, target_lang=lang)
            batch_ok = sum(1 for r in results if r is not None)
            batch_fail = sum(1 for r in results if r is None)
            if batch_fail > 0:
                logger.warning(
                    "  Batch result: %d translated, %d failed (returned None)",
                    batch_ok,
                    batch_fail,
                )
            for (place, field, _), translated in zip(chunk, results, strict=False):
                if translated:
                    ct_db.upsert_translation(
                        entity_type="place",
                        entity_code=place.place_code,
                        field=field,
                        lang=lang,
                        text=translated,
                        source="google_translate",
                        session=session,
                    )
                    translated_count += 1

            if rate_limit_delay > 0:
                time.sleep(rate_limit_delay)

    return translated_count


def _backfill_reviews(
    session: Session,
    langs: list[str],
    batch_size: int,
    dry_run: bool,
    rate_limit_delay: float,
) -> int:
    reviews = session.exec(select(Review)).all()
    logger.info("Found %d reviews to process", len(reviews))

    if not reviews:
        logger.warning("No Review rows in the database — nothing to translate")
        return 0

    project = os.environ.get("GOOGLE_CLOUD_PROJECT")
    if not project:
        logger.error("GOOGLE_CLOUD_PROJECT not set. Add it to soulstep-catalog-api/.env")
        return 0
    logger.info("Credentials OK: GOOGLE_CLOUD_PROJECT=%s (using ADC)", project)

    translated_count = 0

    for lang in langs:
        logger.info("=== Reviews Language: %s ===", lang)
        missing: list[tuple[Review, str, str]] = []
        already_exist = 0
        empty_fields = 0
        for review in reviews:
            for field in _REVIEW_TRANSLATABLE_FIELDS:
                en_text = getattr(review, field, None)
                if not en_text:
                    empty_fields += 1
                    continue
                existing = ct_db.get_translation("review", review.review_code, field, lang, session)
                if existing is None:
                    missing.append((review, field, en_text))
                else:
                    already_exist += 1

        logger.info(
            "  %s summary: %d missing, %d already translated, %d empty source fields",
            lang,
            len(missing),
            already_exist,
            empty_fields,
        )

        if not missing:
            logger.info("  Nothing to translate for %s — skipping", lang)
            continue

        for start in range(0, len(missing), batch_size):
            chunk = missing[start : start + batch_size]
            texts = [en_text for _, _, en_text in chunk]
            logger.info("  Translating batch %d–%d …", start + 1, start + len(chunk))

            if dry_run:
                for review, field, _ in chunk:
                    logger.info("    [DRY] would translate %s/%s", review.review_code, field)
                continue

            results = translate_batch(texts, target_lang=lang)
            batch_ok = sum(1 for r in results if r is not None)
            batch_fail = sum(1 for r in results if r is None)
            if batch_fail > 0:
                logger.warning(
                    "  Batch result: %d translated, %d failed (returned None)",
                    batch_ok,
                    batch_fail,
                )
            for (review, field, _), translated in zip(chunk, results, strict=False):
                if translated:
                    ct_db.upsert_translation(
                        entity_type="review",
                        entity_code=review.review_code,
                        field=field,
                        lang=lang,
                        text=translated,
                        source="google_translate",
                        session=session,
                    )
                    translated_count += 1

            if rate_limit_delay > 0:
                time.sleep(rate_limit_delay)

    return translated_count


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill ContentTranslation rows")
    parser.add_argument(
        "--langs",
        nargs="+",
        default=_SUPPORTED_LANGS,
        help=f"Languages to backfill (from seed_data.json, default: {_SUPPORTED_LANGS})",
    )
    parser.add_argument("--dry-run", action="store_true", help="Print actions without writing")
    parser.add_argument("--batch-size", type=int, default=50, help="Translation batch size")
    parser.add_argument(
        "--rate-limit-delay",
        type=float,
        default=0.5,
        help="Seconds to sleep between API batches (default: 0.5)",
    )
    args = parser.parse_args()

    logger.info("Starting translation backfill (dry_run=%s, langs=%s)", args.dry_run, args.langs)

    with Session(engine) as session:
        migrated = _migrate_legacy_attributes(session, args.dry_run)
        logger.info("Migrated %d legacy attribute rows", migrated)

        translated = _backfill_places(
            session,
            langs=args.langs,
            batch_size=args.batch_size,
            dry_run=args.dry_run,
            rate_limit_delay=args.rate_limit_delay,
        )
        logger.info("Translated %d new place rows", translated)

        translated_reviews = _backfill_reviews(
            session,
            langs=args.langs,
            batch_size=args.batch_size,
            dry_run=args.dry_run,
            rate_limit_delay=args.rate_limit_delay,
        )
        logger.info("Translated %d new review rows", translated_reviews)

    logger.info("Done.")


if __name__ == "__main__":
    main()
