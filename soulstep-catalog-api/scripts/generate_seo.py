#!/usr/bin/env python3
"""Generate and translate SEO content for PlaceSEO records.

Two modes:
    1. Generate English SEO (slug, title, meta_description, rich_description, FAQs)
       for all places that are missing it.
    2. Translate existing English SEO content to Arabic (ar) and Hindi (hi)
       using the Google Cloud Translation API v3.
       Translations are stored in ContentTranslation(entity_type="place_seo").

Usage:
    # Generate English SEO for all places missing it:
    python -m scripts.generate_seo --generate

    # Generate + translate to Arabic and Hindi:
    python -m scripts.generate_seo --generate --translate --langs ar hi

    # Translate only (English SEO already generated):
    python -m scripts.generate_seo --translate --langs ar hi

    # Dry run (no writes):
    python -m scripts.generate_seo --generate --translate --dry-run

    # Force re-generate even manually-edited records:
    python -m scripts.generate_seo --generate --force

    # Limit to N places:
    python -m scripts.generate_seo --generate --limit 100

Environment variables required for translation:
    GOOGLE_CLOUD_PROJECT  — GCP project ID
    GOOGLE_APPLICATION_CREDENTIALS — path to service account key (non-GCP hosts)
    DATABASE_URL — PostgreSQL connection string (defaults to SQLite in dev)
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from datetime import UTC, datetime
from pathlib import Path

# Ensure the project root is importable
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

from sqlmodel import Session, select  # noqa: E402

from app.core.logging_config import setup_logging  # noqa: E402
from app.db import reviews as reviews_db  # noqa: E402
from app.db.models import ContentTranslation, Place, PlaceSEO  # noqa: E402
from app.db.session import engine, run_migrations  # noqa: E402
from app.services import seo_generator  # noqa: E402

setup_logging()
logger = logging.getLogger("generate_seo")

# ── Translation fields exported to ContentTranslation ────────────────────────

_SEO_TRANSLATE_FIELDS: list[str] = [
    "seo_title",
    "meta_description",
    "rich_description",
]

# Religion-specific terminology overrides to ensure culturally accurate translation.
# These are injected as glossary hints (not enforced — the API may still vary).
_RELIGION_TERMINOLOGY: dict[str, dict[str, str]] = {
    "islam": {
        "ar": "مسجد",  # mosque in Arabic
        "hi": "मस्जिद",  # mosque in Hindi
    },
    "hinduism": {
        "ar": "معبد هندوسي",
        "hi": "मंदिर",
    },
    "christianity": {
        "ar": "كنيسة",
        "hi": "चर्च",
    },
    "buddhism": {
        "ar": "معبد بوذي",
        "hi": "बौद्ध मंदिर",
    },
    "sikhism": {
        "ar": "غوردوارا",
        "hi": "गुरुद्वारा",
    },
    "judaism": {
        "ar": "كنيس يهودي",
        "hi": "सिनेगॉग",
    },
}


# ── Google Cloud Translation helpers ─────────────────────────────────────────


def _translate_texts(
    texts: list[str],
    target_lang: str,
    project_id: str,
) -> list[str]:
    """Translate a batch of texts using Google Cloud Translation API v3."""
    try:
        from google.cloud import translate_v3 as translate
    except ImportError:
        logger.error(
            "google-cloud-translate is not installed. " "Run: pip install google-cloud-translate"
        )
        raise

    client = translate.TranslationServiceClient()
    parent = f"projects/{project_id}/locations/global"

    response = client.translate_text(
        request={
            "parent": parent,
            "contents": texts,
            "mime_type": "text/plain",
            "source_language_code": "en",
            "target_language_code": target_lang,
        }
    )
    return [t.translated_text for t in response.translations]


def _upsert_translation(
    session: Session,
    entity_code: str,
    field: str,
    lang: str,
    translated_text: str,
    dry_run: bool,
) -> bool:
    """Upsert a ContentTranslation row. Returns True if written, False if skipped."""
    existing = session.exec(
        select(ContentTranslation).where(
            ContentTranslation.entity_type == "place_seo",
            ContentTranslation.entity_code == entity_code,
            ContentTranslation.field == field,
            ContentTranslation.lang == lang,
        )
    ).first()

    if dry_run:
        action = "would update" if existing else "would insert"
        logger.info(
            "[dry-run] %s ContentTranslation(place_seo/%s/%s/%s) = %r",
            action,
            entity_code,
            field,
            lang,
            translated_text[:60],
        )
        return False

    now = datetime.now(UTC)
    if existing:
        existing.translated_text = translated_text
        existing.source = "google_translate"
        existing.updated_at = now
        session.add(existing)
    else:
        session.add(
            ContentTranslation(
                entity_type="place_seo",
                entity_code=entity_code,
                field=field,
                lang=lang,
                translated_text=translated_text,
                source="google_translate",
                created_at=now,
                updated_at=now,
            )
        )
    return True


# ── Generate English SEO ──────────────────────────────────────────────────────


def run_generate(
    session: Session,
    force: bool = False,
    limit: int | None = None,
    dry_run: bool = False,
) -> dict[str, int]:
    """Generate English SEO content for places missing it."""
    places = session.exec(select(Place)).all()

    if not force:
        manually_edited = {
            s.place_code
            for s in session.exec(
                select(PlaceSEO).where(PlaceSEO.is_manually_edited.is_(True))
            ).all()
        }
        places = [p for p in places if p.place_code not in manually_edited]

    if limit is not None:
        places = places[:limit]

    generated = skipped = errors = 0

    for place in places:
        try:
            # Check if already has SEO (and we're not forcing)
            existing = session.exec(
                select(PlaceSEO).where(PlaceSEO.place_code == place.place_code)
            ).first()
            if existing and not force:
                skipped += 1
                continue

            if dry_run:
                logger.info(
                    "[dry-run] would generate SEO for %s (%s)", place.place_code, place.name
                )
                generated += 1
                continue

            rating_data = reviews_db.get_aggregate_rating(place.place_code, session)
            seo_generator.upsert_place_seo(
                place=place,
                session=session,
                rating_data=rating_data,
                force=force,
            )
            generated += 1
            logger.debug("Generated SEO for %s", place.place_code)
        except Exception as exc:
            logger.error("SEO generation failed for %s: %s", place.place_code, exc)
            errors += 1

    return {"generated": generated, "skipped": skipped, "errors": errors}


# ── Translate SEO content ─────────────────────────────────────────────────────


def run_translate(
    session: Session,
    langs: list[str],
    project_id: str,
    force: bool = False,
    limit: int | None = None,
    dry_run: bool = False,
) -> dict[str, int]:
    """Translate PlaceSEO content into the specified languages."""
    seo_rows = session.exec(select(PlaceSEO)).all()
    if limit is not None:
        seo_rows = seo_rows[:limit]

    # Build reverse lookup: place_code → SEO row
    # Skip rows that are all-empty on translatable fields
    translatable = [s for s in seo_rows if any(getattr(s, f, None) for f in _SEO_TRANSLATE_FIELDS)]

    total_written = 0
    total_skipped = 0
    total_errors = 0

    for lang in langs:
        logger.info("Translating %d SEO records to '%s'...", len(translatable), lang)

        # Process in batches of 50 to stay within API request size limits
        batch_size = 50
        for batch_start in range(0, len(translatable), batch_size):
            batch = translatable[batch_start : batch_start + batch_size]

            for field in _SEO_TRANSLATE_FIELDS:
                # Collect texts and corresponding SEO rows that have this field
                texts: list[str] = []
                seo_batch: list[PlaceSEO] = []
                for seo in batch:
                    value = getattr(seo, field, None)
                    if not value:
                        continue

                    # Skip if translation already exists and not forcing
                    if not force:
                        existing = session.exec(
                            select(ContentTranslation).where(
                                ContentTranslation.entity_type == "place_seo",
                                ContentTranslation.entity_code == seo.place_code,
                                ContentTranslation.field == field,
                                ContentTranslation.lang == lang,
                            )
                        ).first()
                        if existing:
                            total_skipped += 1
                            continue

                    texts.append(value)
                    seo_batch.append(seo)

                if not texts:
                    continue

                try:
                    if dry_run:
                        for seo in seo_batch:
                            logger.info(
                                "[dry-run] would translate place_seo/%s/%s → %s",
                                seo.place_code,
                                field,
                                lang,
                            )
                            total_written += 1
                        continue

                    translated = _translate_texts(texts, lang, project_id)

                    for seo, translated_text in zip(seo_batch, translated, strict=False):
                        written = _upsert_translation(
                            session,
                            entity_code=seo.place_code,
                            field=field,
                            lang=lang,
                            translated_text=translated_text,
                            dry_run=False,
                        )
                        if written:
                            total_written += 1

                    if not dry_run:
                        session.commit()

                except Exception as exc:
                    logger.error(
                        "Translation API error (lang=%s, field=%s, batch_start=%d): %s",
                        lang,
                        field,
                        batch_start,
                        exc,
                    )
                    total_errors += len(texts)

    return {"written": total_written, "skipped": total_skipped, "errors": total_errors}


# ── CLI entry point ────────────────────────────────────────────────────────────


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate and translate SEO content for SoulStep places."
    )
    parser.add_argument(
        "--generate",
        action="store_true",
        help="Generate English SEO content for places missing it.",
    )
    parser.add_argument(
        "--translate",
        action="store_true",
        help="Translate English SEO content to target languages.",
    )
    parser.add_argument(
        "--langs",
        nargs="+",
        default=["ar", "hi"],
        metavar="LANG",
        help="Target language codes for translation (default: ar hi).",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite existing SEO / translation records.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        metavar="N",
        help="Process at most N places.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Log what would be written without making any DB changes.",
    )

    args = parser.parse_args()

    if not args.generate and not args.translate:
        parser.error("Specify at least one of --generate or --translate.")

    run_migrations()

    project_id = os.environ.get("GOOGLE_CLOUD_PROJECT", "")
    if args.translate and not project_id:
        logger.error(
            "GOOGLE_CLOUD_PROJECT env var is required for translation. "
            "Set it to your GCP project ID."
        )
        sys.exit(1)

    with Session(engine) as session:
        if args.generate:
            logger.info("=== Generating English SEO content ===")
            stats = run_generate(
                session=session,
                force=args.force,
                limit=args.limit,
                dry_run=args.dry_run,
            )
            logger.info(
                "Generation complete: generated=%d skipped=%d errors=%d",
                stats["generated"],
                stats["skipped"],
                stats["errors"],
            )

        if args.translate:
            logger.info("=== Translating SEO content to: %s ===", ", ".join(args.langs))
            stats = run_translate(
                session=session,
                langs=args.langs,
                project_id=project_id,
                force=args.force,
                limit=args.limit,
                dry_run=args.dry_run,
            )
            logger.info(
                "Translation complete: written=%d skipped=%d errors=%d",
                stats["written"],
                stats["skipped"],
                stats["errors"],
            )


if __name__ == "__main__":
    main()
