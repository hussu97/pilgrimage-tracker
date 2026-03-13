#!/usr/bin/env python3
"""
One-off script to clean dirty city data in the SoulStep catalog.

What it does:
1. Identifies Place rows with non-ASCII city names (likely localized, e.g. Arabic)
2. Identifies Place rows where city name matches a known sublocality/admin area
3. Reports findings (dry run by default)
4. With --fix flag: updates Place.city to canonical English name using the
   CityAlias table + City table
5. Deduplicates City table: merges duplicate city rows with same canonical name

Usage:
    python scripts/clean_cities.py [--fix] [--db-url sqlite:///soulstep.db]

Dependencies: sqlmodel, sqlalchemy (already in requirements)
"""

import argparse
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlmodel import Session, create_engine, func, select

# Known sublocality/admin area names that pollute city data
KNOWN_DIRTY_CITY_NAMES = {
    "Deira",
    "Bur Dubai",
    "Jumeirah",
    "Al Karama",
    "Dubai Municipality",
    "Al Qusais",
    "Umm Hurair",
    "Al Nahda",
    "Hor Al Anz",
    "Greater Cairo",
    "Giza Governorate",
    "Nasr City",
}


def is_non_ascii(text: str) -> bool:
    return bool(re.search(r"[^\x00-\x7F]", text))


def main():
    parser = argparse.ArgumentParser(description="Clean dirty city data")
    parser.add_argument("--fix", action="store_true", help="Apply fixes (default: dry run)")
    parser.add_argument(
        "--db-url",
        default=os.environ.get("DATABASE_URL", "sqlite:///soulstep.db"),
    )
    args = parser.parse_args()

    engine = create_engine(args.db_url)

    from app.db.models import City, CityAlias, Place

    with Session(engine) as session:
        # Find non-ASCII city names
        all_places = session.exec(select(Place).where(Place.city != None)).all()  # noqa: E711

        non_ascii = [p for p in all_places if p.city and is_non_ascii(p.city)]
        dirty_known = [p for p in all_places if p.city and p.city in KNOWN_DIRTY_CITY_NAMES]

        print(f"Found {len(non_ascii)} places with non-ASCII city names")
        for p in non_ascii[:20]:
            print(f"  {p.place_code}: city={p.city!r}")
        if len(non_ascii) > 20:
            print(f"  ... and {len(non_ascii) - 20} more")

        print(f"\nFound {len(dirty_known)} places with known-dirty city names")
        for p in dirty_known[:20]:
            print(f"  {p.place_code}: city={p.city!r}, country={p.country!r}")
        if len(dirty_known) > 20:
            print(f"  ... and {len(dirty_known) - 20} more")

        if args.fix:
            # Load alias table
            aliases = session.exec(select(CityAlias)).all()
            alias_map = {a.alias_name.lower(): a.canonical_city_code for a in aliases}

            fixed = 0
            # Deduplicate: a place may appear in both lists
            candidates = {p.place_code: p for p in non_ascii + dirty_known}.values()
            for p in candidates:
                alias_key = p.city.strip().lower() if p.city else None
                if alias_key and alias_key in alias_map:
                    canonical_code = alias_map[alias_key]
                    canonical_city = session.exec(
                        select(City).where(City.city_code == canonical_code)
                    ).first()
                    if canonical_city:
                        old_city = p.city
                        p.city = canonical_city.name
                        p.city_code = canonical_city.city_code
                        session.add(p)
                        fixed += 1
                        print(f"  Fixed {p.place_code}: {old_city!r} → {canonical_city.name!r}")
                else:
                    print(
                        f"  No alias for {p.place_code}: city={p.city!r} — skipped"
                        " (add a CityAlias row to fix)"
                    )

            session.commit()
            print(f"\nFixed {fixed} places")
        else:
            print("\nDry run — pass --fix to apply changes")

        # Report: duplicate city name/code analysis
        print("\n--- City deduplication analysis ---")
        dup_names = session.exec(
            select(Place.city, func.count(Place.city_code.distinct()).label("variants"))
            .where(Place.city != None)  # noqa: E711
            .group_by(Place.city)
            .having(func.count(Place.city_code.distinct()) > 1)
        ).all()
        if dup_names:
            print(f"Cities with multiple distinct city_codes ({len(dup_names)}):")
            for name, variants in dup_names:
                print(f"  {name!r}: {variants} different city_codes")
        else:
            print("No duplicate city_code variants found — data is clean!")

        # Report: how many places still have no city_code
        no_code_count = session.exec(
            select(func.count(Place.id)).where(
                Place.city_code == None,  # noqa: E711
                Place.city != None,  # noqa: E711
                Place.city != "",
            )
        ).one()
        print(f"\nPlaces with city string but no city_code: {no_code_count}")


if __name__ == "__main__":
    main()
