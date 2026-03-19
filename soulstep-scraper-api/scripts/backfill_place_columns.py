#!/usr/bin/env python3
"""One-time backfill: populate promoted columns on scrapedplace from raw_data.

Usage:
    cd soulstep-scraper-api
    source .venv/bin/activate
    python scripts/backfill_place_columns.py          # dry-run (count only)
    python scripts/backfill_place_columns.py --apply   # actually write

Safe to re-run — skips rows where address is already populated (the
"processed" marker).  Rows with lat/lng = 0.0 in raw_data keep that value
so they are not mistaken for un-processed rows on subsequent runs.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Ensure project root is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlmodel import Session, select  # noqa: E402

from app.db.models import ScrapedPlace  # noqa: E402
from app.db.session import engine  # noqa: E402

BATCH_SIZE = 500


def _extract_float(raw: dict, key: str) -> float | None:
    """Extract a float from raw_data.  Preserves 0.0 as a valid value."""
    val = raw.get(key)
    if val is None:
        return None
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


def _extract_int(raw: dict, key: str) -> int | None:
    val = raw.get(key)
    if val is None:
        return None
    try:
        return int(val)
    except (TypeError, ValueError):
        return None


def backfill(*, apply: bool) -> None:
    with Session(engine) as session:
        # Use address as the "already processed" marker — every raw_data dict
        # has an address string, so once backfilled it will be non-NULL.
        # Previous versions used lat IS NULL which caused an infinite loop
        # for rows with lat=0.0 in raw_data.
        q = select(ScrapedPlace).where(ScrapedPlace.address.is_(None))  # type: ignore[union-attr]
        places = session.exec(q).all()

        total = len(places)
        updated = 0
        print(f"Found {total} places to backfill")

        for place in places:
            raw = place.raw_data or {}

            place.lat = _extract_float(raw, "lat")
            place.lng = _extract_float(raw, "lng")
            place.rating = _extract_float(raw, "rating")
            place.user_rating_count = _extract_int(raw, "user_rating_count")
            place.google_place_id = raw.get("google_place_id")
            place.address = raw.get("address")
            place.religion = raw.get("religion")
            place.place_type = raw.get("place_type")
            place.business_status = raw.get("business_status")

            session.add(place)
            updated += 1

            if updated % BATCH_SIZE == 0:
                if apply:
                    session.commit()
                print(f"  processed {updated}/{total}")

        if apply:
            session.commit()
            print(f"Done — backfilled {updated} places")
        else:
            session.rollback()
            print(f"Dry run — would backfill {updated} places. Pass --apply to write.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backfill promoted columns on scrapedplace")
    parser.add_argument(
        "--apply", action="store_true", help="Actually write changes (default is dry-run)"
    )
    args = parser.parse_args()
    backfill(apply=args.apply)
