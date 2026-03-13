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

# Known sublocality/admin area names that pollute city data.
# These are neighborhoods, districts, admin-area labels, or road names that
# Google Places returns as the "city" field instead of the actual city.
# Each group is annotated with the parent city / region it belongs to.
KNOWN_DIRTY_CITY_NAMES = {
    # -----------------------------------------------------------------------
    # UAE — Dubai sublocalaties / neighborhoods
    # -----------------------------------------------------------------------
    "Deira",
    "Bur Dubai",
    "Jumeirah",
    "Al Karama",
    "Dubai Municipality",
    "Al Qusais",
    "Umm Hurair",
    "Al Nahda",  # shared Dubai/Sharjah border area
    "Hor Al Anz",
    "Al Barsha",
    "Al Quoz",
    "Al Mankhool",
    "Al Muraqabat",
    "Al Rigga",
    "Al Satwa",
    "Al Wasl",
    "Al Mamzar",
    "Al Rashidiya",
    "Al Safa",
    "Al Jadaf",
    "Al Garhoud",
    "Al Twar",
    "Al Furjan",
    "Al Khail",
    "Mirdif",
    "Oud Metha",
    "Muteena",
    "Business Bay",
    "Downtown Dubai",
    "Dubai Marina",
    "Dubai Silicon Oasis",
    "Dubai Investment Park",
    "Dubailand",
    "International City",
    "Jebel Ali",
    "Jumeirah Beach Residence",
    "Jumeirah Lake Towers",
    "Jumeirah Village Circle",
    "Motor City",
    "Palm Jumeirah",
    "Umm Suqeim",
    "DIFC",
    "Festival City",
    "Town Square",
    "Arabian Ranches",
    "Emirates Hills",
    "The Greens",
    "The Meadows",
    "The Springs",
    "Remraam",
    "Sheikh Zayed Road",  # road name returned as city
    # -----------------------------------------------------------------------
    # UAE — Abu Dhabi sublocalaties / neighborhoods
    # -----------------------------------------------------------------------
    "Al Khalidiyah",
    "Al Bateen",
    "Al Mina",
    "Al Mushrif",
    "Al Nahyan",
    "Al Rowdah",
    "Al Wahda",
    "Al Zaab",
    "Al Muroor",
    "Khalifa City",
    "Mohammed Bin Zayed City",
    "Mussafah",
    "Tourist Club Area",
    "Masdar City",
    "Al Reef",
    "Al Raha",
    "Yas Island",
    "Saadiyat Island",
    "Al Reem Island",
    "Corniche",  # promenade strip returned as city
    "Zayed City",
    "Electra Street",  # street name returned as city
    "Abu Dhabi Emirate",  # administrative region label
    "Emirate of Abu Dhabi",
    # -----------------------------------------------------------------------
    # UAE — Sharjah sublocalaties
    # -----------------------------------------------------------------------
    "Al Qasimia",
    "Al Khan",
    "Al Taawun",
    "Muwailih",
    "Rolla",
    # -----------------------------------------------------------------------
    # UAE — Other emirates / admin labels
    # -----------------------------------------------------------------------
    "Al Nuaimia",  # Ajman
    "Al Hamidiyah",  # Ajman
    "Al Rams",  # Ras Al Khaimah village
    "Al Jazirah Al Hamra",  # RAK heritage village
    "Emirate of Dubai",  # administrative region label
    "Emirate of Sharjah",
    "United Arab Emirates",  # country returned as city (Google data bug)
    # -----------------------------------------------------------------------
    # India — Delhi / NCR sublocalaties
    # -----------------------------------------------------------------------
    "Old Delhi",
    "Chandni Chowk",
    "Connaught Place",
    "Karol Bagh",
    "Lajpat Nagar",
    "Dwarka",
    "Rohini",
    "Hauz Khas",
    "Greater Kailash",
    "Defence Colony",
    "Nehru Place",
    "Vasant Kunj",
    "South Extension",
    "Paharganj",
    "Saket",
    "Janakpuri",
    "Pitampura",
    "Cyber City",  # Gurgaon IT zone
    # -----------------------------------------------------------------------
    # India — Mumbai sublocalaties
    # -----------------------------------------------------------------------
    "Andheri",
    "Andheri East",
    "Andheri West",
    "Bandra",
    "Bandra West",
    "Bandra East",
    "Borivali",
    "Churchgate",
    "Colaba",
    "Dadar",
    "Fort",
    "Goregaon",
    "Juhu",
    "Kurla",
    "Lower Parel",
    "Malad",
    "Matunga",
    "Parel",
    "Powai",
    "Santacruz",
    "Vikhroli",
    "Worli",
    "Grant Road",
    "Marine Lines",
    "Versova",
    "Greater Mumbai",  # administrative area label
    # -----------------------------------------------------------------------
    # India — Bengaluru sublocalaties
    # -----------------------------------------------------------------------
    "Indiranagar",
    "Koramangala",
    "Whitefield",
    "Electronic City",
    "Jayanagar",
    "JP Nagar",
    "Marathahalli",
    "HSR Layout",
    "BTM Layout",
    "Bellandur",
    "Hebbal",
    "Yeshwanthpur",
    "Rajajinagar",
    "Basavanagudi",
    "Malleswaram",
    "Ulsoor",
    "Frazer Town",
    "MG Road",  # road name returned as city
    "Sarjapur",
    # -----------------------------------------------------------------------
    # India — Chennai sublocalaties
    # -----------------------------------------------------------------------
    "Adyar",
    "Anna Nagar",
    "Velachery",
    "T Nagar",
    "Mylapore",
    "Nungambakkam",
    "Kilpauk",
    "Tambaram",
    "Chromepet",
    "Sholinganallur",
    "Porur",
    "Ambattur",
    "Perambur",
    # -----------------------------------------------------------------------
    # India — Hyderabad sublocalaties
    # -----------------------------------------------------------------------
    "Banjara Hills",
    "Jubilee Hills",
    "HITEC City",
    "Gachibowli",
    "Madhapur",
    "Kondapur",
    "Kukatpally",
    "LB Nagar",
    "Dilsukhnagar",
    "Begumpet",
    "Ameerpet",
    "SR Nagar",
    "Tolichowki",
    "Manikonda",
    # -----------------------------------------------------------------------
    # India — Kolkata sublocalaties
    # -----------------------------------------------------------------------
    "Salt Lake",
    "New Town",
    "Park Street",
    "Ballygunge",
    "Dum Dum",
    "Behala",
    "Jadavpur",
    "Tollygunge",
    "Shyambazar",
    # -----------------------------------------------------------------------
    # India — Ahmedabad sublocalaties
    # -----------------------------------------------------------------------
    "Navrangpura",
    "Bodakdev",
    "Vastrapur",
    "Satellite",
    "Prahlad Nagar",
    "CG Road",  # road name returned as city
    "Maninagar",
    "Chandkheda",
    # -----------------------------------------------------------------------
    # India — Pune sublocalaties
    # -----------------------------------------------------------------------
    "Koregaon Park",
    "Viman Nagar",
    "Kothrud",
    "Baner",
    "Aundh",
    "Hinjewadi",
    "Hadapsar",
    "Kalyani Nagar",
    "Kharadi",
    "Shivajinagar",  # Pune (≠ Shivajinagar in other cities)
    "Wakad",
    "Magarpatta",
    "Deccan Gymkhana",
    # -----------------------------------------------------------------------
    # India — Pan-India generic dirty labels
    # These appear in 10+ cities and Google returns them verbatim.
    # -----------------------------------------------------------------------
    "Civil Lines",  # colonial-era residential area in 50+ cities
    "Cantonment",
    "Cantt",  # short form of Cantonment
    "Sadar Bazar",
    "Sadar",
    "Old City",  # walled historic area (Hyderabad, Ahmedabad, etc.)
    "Model Town",  # planned colony in Delhi, Ludhiana, Jalandhar, etc.
    "Gandhi Nagar",  # neighborhood name (≠ Gandhinagar the state capital)
    "Shastri Nagar",
    "Rajiv Nagar",
    "Indira Nagar",  # common in Lucknow, Bengaluru, etc.
    # -----------------------------------------------------------------------
    # Egypt (original entries kept)
    # -----------------------------------------------------------------------
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
