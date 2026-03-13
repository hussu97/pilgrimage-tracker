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

    # Estimate cost before translating:
    python -m scripts.generate_seo --translate --langs ar hi --estimate

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
from typing import NamedTuple

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

_PRICE_PER_MILLION_CHARS = 20.0


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


class _MultiFieldEntry(NamedTuple):
    seo: PlaceSEO
    field: str
    text: str


def _translate_texts(
    texts: list[str],
    target_lang: str,
    project_id: str,
    client: object,
) -> list[str]:
    """Translate a batch of texts using Google Cloud Translation API v3."""
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
    batch_size: int = 100,
    estimate: bool = False,
) -> dict[str, int]:
    """Translate PlaceSEO content into the specified languages."""
    seo_rows = session.exec(select(PlaceSEO)).all()
    if limit is not None:
        seo_rows = seo_rows[:limit]

    # Skip rows that are all-empty on translatable fields
    translatable = [s for s in seo_rows if any(getattr(s, f, None) for f in _SEO_TRANSLATE_FIELDS)]

    total_written = 0
    total_skipped = 0
    total_errors = 0

    # estimate mode: accumulate char counts without calling the API
    estimate_chars: dict[str, int] = {}

    # Build the gRPC client once (skip when estimating — no credentials needed)
    client = None
    if not dry_run and not estimate:
        try:
            from google.cloud import translate_v3 as translate
        except ImportError:
            logger.error(
                "google-cloud-translate is not installed. Run: pip install google-cloud-translate"
            )
            raise
        client = translate.TranslationServiceClient()

    for lang in langs:
        logger.info("Translating %d SEO records to '%s'...", len(translatable), lang)

        # Bulk-load existing translations for this language in one query
        existing_rows = session.exec(
            select(ContentTranslation.entity_code, ContentTranslation.field).where(
                ContentTranslation.entity_type == "place_seo",
                ContentTranslation.lang == lang,
            )
        ).all()
        already_translated: frozenset[tuple[str, str]] = frozenset(existing_rows)

        lang_chars = 0

        for batch_start in range(0, len(translatable), batch_size):
            batch = translatable[batch_start : batch_start + batch_size]

            # Flatten all fields into a single entries list for one API call per batch
            entries: list[_MultiFieldEntry] = []
            for seo in batch:
                for field in _SEO_TRANSLATE_FIELDS:
                    value = getattr(seo, field, None)
                    if not value:
                        continue
                    if not force and (seo.place_code, field) in already_translated:
                        total_skipped += 1
                        continue
                    entries.append(_MultiFieldEntry(seo=seo, field=field, text=value))

            if not entries:
                continue

            texts = [e.text for e in entries]

            if estimate:
                lang_chars += sum(len(t) for t in texts)
                continue

            if dry_run:
                for entry in entries:
                    logger.info(
                        "[dry-run] would translate place_seo/%s/%s → %s",
                        entry.seo.place_code,
                        entry.field,
                        lang,
                    )
                    total_written += 1
                continue

            try:
                translated = _translate_texts(texts, lang, project_id, client)

                for entry, translated_text in zip(entries, translated, strict=False):
                    written = _upsert_translation(
                        session,
                        entity_code=entry.seo.place_code,
                        field=entry.field,
                        lang=lang,
                        translated_text=translated_text,
                        dry_run=False,
                    )
                    if written:
                        total_written += 1

                session.commit()

            except Exception as exc:
                logger.error(
                    "Translation API error (lang=%s, batch_start=%d): %s",
                    lang,
                    batch_start,
                    exc,
                )
                total_errors += len(texts)

        if estimate:
            estimate_chars[lang] = lang_chars

    if estimate:
        total_chars = sum(estimate_chars.values())
        estimated_cost = total_chars / 1_000_000 * _PRICE_PER_MILLION_CHARS
        logger.info("=== ESTIMATE SUMMARY ===")
        for lang, chars in estimate_chars.items():
            lang_cost = chars / 1_000_000 * _PRICE_PER_MILLION_CHARS
            logger.info(
                "  %s: %d items, %d chars (~$%.4f)",
                lang,
                len(translatable),
                chars,
                lang_cost,
            )
        logger.info("  Total chars:  %d", total_chars)
        logger.info(
            "  Estimated cost: $%.4f  (at $%.2f/M chars)",
            estimated_cost,
            _PRICE_PER_MILLION_CHARS,
        )

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
    parser.add_argument(
        "--batch-size",
        type=int,
        default=100,
        metavar="N",
        help="Records per API call (default: 100; max: 1024).",
    )
    parser.add_argument(
        "--estimate",
        action="store_true",
        help="Preview character count and cost without making API calls.",
    )

    args = parser.parse_args()

    if not args.generate and not args.translate:
        parser.error("Specify at least one of --generate or --translate.")

    run_migrations()

    project_id = os.environ.get("GOOGLE_CLOUD_PROJECT", "")
    if args.translate and not project_id and not args.estimate and not args.dry_run:
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
                batch_size=args.batch_size,
                estimate=args.estimate,
            )
            logger.info(
                "Translation complete: written=%d skipped=%d errors=%d",
                stats["written"],
                stats["skipped"],
                stats["errors"],
            )


if __name__ == "__main__":
    main()
