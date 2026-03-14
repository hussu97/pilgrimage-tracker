#!/usr/bin/env python3
"""Generate English SEO content for PlaceSEO records.

Generates English SEO (slug, title, meta_description, rich_description, FAQs)
for all places that are missing it.

Usage:
    # Generate English SEO for all places missing it:
    python -m scripts.generate_seo --generate

    # Force re-generate even manually-edited records:
    python -m scripts.generate_seo --generate --force

    # Limit to N places:
    python -m scripts.generate_seo --generate --limit 100

    # Dry run (no writes):
    python -m scripts.generate_seo --generate --dry-run

Environment variables:
    DATABASE_URL          — PostgreSQL connection string (defaults to SQLite in dev)
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

# Ensure the project root is importable
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

from sqlmodel import Session, select  # noqa: E402

from app.core.logging_config import setup_logging  # noqa: E402
from app.db import reviews as reviews_db  # noqa: E402
from app.db.models import Place, PlaceSEO  # noqa: E402
from app.db.session import engine, run_migrations  # noqa: E402
from app.services import seo_generator  # noqa: E402

setup_logging()
logger = logging.getLogger("generate_seo")


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


# ── CLI entry point ────────────────────────────────────────────────────────────


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate English SEO content for SoulStep places."
    )
    parser.add_argument(
        "--generate",
        action="store_true",
        help="Generate English SEO content for places missing it.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite existing SEO records.",
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

    if not args.generate:
        parser.error("Specify --generate.")

    run_migrations()

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


if __name__ == "__main__":
    main()
