#!/usr/bin/env python3
"""
Optional: Re-enrich Place.city using GeoNames reverse geocode.

Uses the free GeoNames API (no API key required for demo tier, 2000 req/hour).
Finds places where:
  - city is non-ASCII, OR
  - city_code is NULL, OR
  - city is in the known-dirty list

Then calls GeoNames findNearbyPlaceNameJSON to get the canonical English city name.

Usage:
    python scripts/geonames_enrich.py [--fix] [--limit 100] [--username demo]

Note: GeoNames demo account is rate-limited to 2000 req/hour.
For production use, register a free account at geonames.org and use your username.
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

KNOWN_DIRTY = {
    "Deira",
    "Bur Dubai",
    "Jumeirah",
    "Dubai Municipality",
    "Greater Cairo",
    "Nasr City",
}


def is_non_ascii(text: str) -> bool:
    return bool(re.search(r"[^\x00-\x7F]", text))


def geonames_lookup(lat: float, lng: float, username: str) -> str | None:
    """Reverse geocode lat/lng to a canonical English city name via GeoNames."""
    url = (
        f"http://api.geonames.org/findNearbyPlaceNameJSON"
        f"?lat={lat}&lng={lng}&username={username}&style=SHORT"
    )
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            data = json.loads(resp.read())
        geonames = data.get("geonames", [])
        if geonames:
            return geonames[0].get("name")
    except Exception as e:
        print(f"  GeoNames error for ({lat},{lng}): {e}")
    return None


def main():
    parser = argparse.ArgumentParser(
        description="Re-enrich Place.city using GeoNames reverse geocode"
    )
    parser.add_argument("--fix", action="store_true", help="Apply fixes (default: dry run)")
    parser.add_argument(
        "--limit",
        type=int,
        default=50,
        help="Max number of places to process (default: 50)",
    )
    parser.add_argument(
        "--username",
        default="demo",
        help="GeoNames username (default: demo, rate-limited to 2000 req/hour)",
    )
    parser.add_argument(
        "--db-url",
        default=os.environ.get("DATABASE_URL", "sqlite:///soulstep.db"),
    )
    args = parser.parse_args()

    from sqlalchemy import create_engine as sa_create_engine
    from sqlmodel import Session, select

    from app.db.locations import get_or_create_city
    from app.db.models import Country, Place

    engine = sa_create_engine(args.db_url)

    with Session(engine) as session:
        all_places = session.exec(
            select(Place).where(Place.city != None, Place.lat != None)  # noqa: E711
        ).all()

        candidates = [
            p
            for p in all_places
            if p.city and (is_non_ascii(p.city) or p.city in KNOWN_DIRTY or p.city_code is None)
        ][: args.limit]

        print(f"Enriching {len(candidates)} places via GeoNames (username={args.username!r})")
        print("NOTE: Pass --fix to commit changes; default is dry run.\n")

        enriched = 0
        for i, place in enumerate(candidates):
            canonical = geonames_lookup(place.lat, place.lng, args.username)
            status = "→" if canonical and canonical != place.city else "="
            print(
                f"  [{i + 1}/{len(candidates)}] {place.place_code}: "
                f"{place.city!r} {status} {canonical!r}"
            )

            if canonical and args.fix and canonical != place.city:
                # Resolve city_code via the country on the place
                if place.country:
                    country_obj = session.exec(
                        select(Country).where(Country.name.ilike(place.country.strip()))
                    ).first()
                    if country_obj:
                        city_obj = get_or_create_city(
                            canonical, country_obj.country_code, place.state_code, session
                        )
                        place.city = canonical
                        place.city_code = city_obj.city_code
                        session.add(place)
                        enriched += 1
                    else:
                        print(
                            f"    ⚠  Country {place.country!r} not found in DB — "
                            "city_code not updated"
                        )
                else:
                    print(f"    ⚠  Place {place.place_code} has no country — city_code not updated")

            # Rate limiting: 2000 req/hour ≈ 1 req/1.8 s; use 2 s for demo safety
            if args.username == "demo":
                time.sleep(2)
            else:
                time.sleep(0.5)

        if args.fix:
            session.commit()
            print(f"\nEnriched {enriched} places")
        else:
            print("\nDry run — pass --fix to apply")


if __name__ == "__main__":
    main()
