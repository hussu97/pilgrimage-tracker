"""
Delete all scraper data from the scraper database (fresh start).

This removes:
  ScrapedPlace, RawCollectorData, DiscoveryCell, ScraperRun,
  GlobalDiscoveryCell, GlobalGmapsCache

DataLocation records are preserved (location config is not run data).

Usage (from soulstep-scraper-api/ with .venv active):
  python scripts/reset_scraper_data.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlmodel import Session, func, select

from app.db.models import (
    DiscoveryCell,
    GlobalDiscoveryCell,
    GlobalGmapsCache,
    RawCollectorData,
    ScrapedPlace,
    ScraperRun,
)
from app.db.session import engine


def main() -> None:
    with Session(engine) as session:
        counts = {
            "scraped_places": session.exec(select(func.count()).select_from(ScrapedPlace)).one(),
            "raw_collector_data": session.exec(
                select(func.count()).select_from(RawCollectorData)
            ).one(),
            "discovery_cells": session.exec(select(func.count()).select_from(DiscoveryCell)).one(),
            "scraper_runs": session.exec(select(func.count()).select_from(ScraperRun)).one(),
            "global_discovery_cells": session.exec(
                select(func.count()).select_from(GlobalDiscoveryCell)
            ).one(),
            "global_gmaps_cache": session.exec(
                select(func.count()).select_from(GlobalGmapsCache)
            ).one(),
        }

        total = sum(counts.values())
        if total == 0:
            print("No scraper data found — nothing to delete.")
            return

        for table, count in counts.items():
            print(f"  {table}: {count} rows")

        print(f"\nDeleting {total} total rows...")

        for place in session.exec(select(ScrapedPlace)).all():
            session.delete(place)
        for rd in session.exec(select(RawCollectorData)).all():
            session.delete(rd)
        for cell in session.exec(select(DiscoveryCell)).all():
            session.delete(cell)
        for run in session.exec(select(ScraperRun)).all():
            session.delete(run)
        for gc in session.exec(select(GlobalDiscoveryCell)).all():
            session.delete(gc)
        for cache in session.exec(select(GlobalGmapsCache)).all():
            session.delete(cache)

        session.commit()
        print("Done. All scraper data deleted.")


if __name__ == "__main__":
    main()
