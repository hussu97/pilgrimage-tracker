"""Backfill translations for existing Place rows that lack non-English content.

Usage (from the server/ directory with venv active):
    python -m scripts.backfill_translations [--langs ar hi te] [--dry-run] [--batch-size 50]

What it does:
1. Iterates all Place rows.
2. For each place × field × language combination missing a ContentTranslation row,
   batch-translates the English text via Google Cloud Translation API v2.
3. Inserts results with source="google_translate".
4. Also migrates existing name_ar / name_hi PlaceAttribute values into
   ContentTranslation rows (source="scraper") if not already present.

Environment:
    GOOGLE_TRANSLATE_API_KEY — required for auto-translation. Without it only the
                               attribute migration step runs.
"""

import argparse
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
from app.db.models import Place, PlaceAttribute  # noqa: E402
from app.db.session import engine  # noqa: E402
from app.services.translation_service import translate_batch  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)
# Ensure translation_service logs are also visible
logging.getLogger("app.services.translation_service").setLevel(logging.INFO)

_SUPPORTED_LANGS = ["ar", "hi", "te"]
_TRANSLATABLE_FIELDS = ["name", "description", "address"]

# Legacy attribute codes that map to ContentTranslation rows
_LEGACY_ATTR_LANGS: dict[str, tuple[str, str]] = {
    "name_ar": ("name", "ar"),
    "name_hi": ("name", "hi"),
    "name_te": ("name", "te"),
}


def _migrate_legacy_attributes(session: Session, dry_run: bool) -> int:
    """Copy name_ar / name_hi / name_te PlaceAttributes into ContentTranslation."""
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
    api_key = os.environ.get("GOOGLE_TRANSLATE_API_KEY")
    if not api_key:
        logger.error(
            "GOOGLE_TRANSLATE_API_KEY is NOT set. "
            "Export it before running: export GOOGLE_TRANSLATE_API_KEY=your_key"
        )
        return 0
    logger.info("GOOGLE_TRANSLATE_API_KEY is set (length=%d)", len(api_key))

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


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill ContentTranslation rows")
    parser.add_argument(
        "--langs",
        nargs="+",
        default=_SUPPORTED_LANGS,
        help=f"Languages to backfill (default: {_SUPPORTED_LANGS})",
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
        logger.info("Translated %d new rows", translated)

    logger.info("Done.")


if __name__ == "__main__":
    main()
