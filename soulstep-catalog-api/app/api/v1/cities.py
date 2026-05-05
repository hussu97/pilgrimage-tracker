"""City aggregation endpoints for programmatic SEO.

Provides city-level landing pages for long-tail SEO:
  GET /api/v1/cities                          — list all cities with place counts
  GET /api/v1/cities/{city_slug}              — places in a city
  GET /api/v1/cities/{city_slug}/{religion}   — places in a city filtered by religion
"""

from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import or_
from sqlmodel import col, func, select

from app.api.v1.place_serializers import serialize_place_minimal
from app.db import content_translations as ct_db
from app.db import place_images
from app.db.models import CheckIn, City, Place, PlaceSEO
from app.db.session import SessionDep

router = APIRouter()


def _city_to_slug(city: str) -> str:
    """Convert a city name to a URL-friendly slug."""
    slug = city.lower().strip()
    slug = re.sub(r"[^a-z0-9\s-]", "", slug)
    slug = re.sub(r"[\s]+", "-", slug)
    slug = slug.strip("-")
    return slug


def _slug_to_city_match(slug: str, city: str) -> bool:
    """Check if a slug matches a given city name."""
    return _city_to_slug(city) == slug


def _derive_popularity_label(checkins_30d: int) -> str | None:
    """Derive a popularity label from the 30-day check-in count."""
    if checkins_30d > 50:
        return "Trending"
    if checkins_30d > 20:
        return "Popular"
    if checkins_30d > 5:
        return "Growing"
    return None


def _place_search_filter(query: str | None):
    term = (query or "").strip()
    if not term:
        return None
    like = f"%{term}%"
    return or_(
        col(Place.name).ilike(like),
        col(Place.address).ilike(like),
        col(Place.religion).ilike(like),
        col(Place.place_type).ilike(like),
    )


@router.get("")
def list_cities(
    session: SessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
    include_metrics: bool = Query(
        False, description="Include 30-day check-in metrics and popularity label per city"
    ),
    include_images: bool = Query(
        False, description="Include up to 3 top image URLs per city for collage display"
    ),
):
    """List all cities with place counts, sorted by count descending."""
    # Query 1: places with a city_code → group by city_code (canonical dedup)
    code_rows = session.exec(
        select(Place.city_code, func.count(Place.id).label("count"))
        .where(Place.city_code != None)  # noqa: E711
        .group_by(Place.city_code)
    ).all()

    # Query 2: places without a city_code → group by raw city string (backwards compat)
    str_rows = session.exec(
        select(Place.city, func.count(Place.id).label("count"))
        .where(Place.city_code == None, Place.city != None, Place.city != "")  # noqa: E711
        .group_by(Place.city)
    ).all()

    # Load City objects for canonical names
    city_codes_needed = [r[0] for r in code_rows if r[0]]
    city_objs = (
        session.exec(select(City).where(City.city_code.in_(city_codes_needed))).all()
        if city_codes_needed
        else []
    )
    city_by_code: dict[str, City] = {c.city_code: c for c in city_objs}

    # Build combined list: city_code rows first, then string-only rows.
    # Deduplicate: if a string-only row has the same normalised name as an existing
    # city_code row, merge the count into the city_code entry rather than showing
    # the city twice.
    combined: list[tuple[str, str | None, int, City | None]] = []
    seen_names: dict[str, int] = {}  # normalised name → index in combined
    for city_code_val, count in code_rows:
        city_obj = city_by_code.get(city_code_val)
        city_name = city_obj.name if city_obj else city_code_val
        norm = city_name.strip().lower()
        seen_names[norm] = len(combined)
        combined.append((city_name, city_code_val, count, city_obj))
    for city_name, count in str_rows:
        if not city_name:
            continue
        norm = city_name.strip().lower()
        if norm in seen_names:
            # Merge into the existing city_code entry
            idx = seen_names[norm]
            old = combined[idx]
            combined[idx] = (old[0], old[1], old[2] + count, old[3])
        else:
            seen_names[norm] = len(combined)
            combined.append((city_name, None, count, None))

    # Sort by count descending, paginate
    combined.sort(key=lambda x: x[2], reverse=True)
    total = len(combined)
    offset = (max(1, page) - 1) * page_size
    page_items = combined[offset : offset + page_size]

    # Collect all city names for metrics/images lookups
    page_city_names = [name for name, _, _, _ in page_items if name]

    # Compute 30-day check-in counts per city if metrics requested
    checkins_by_city: dict[str, int] = {}
    if include_metrics and page_city_names:
        cutoff = datetime.now(UTC) - timedelta(days=30)
        # For city_code rows, match places by city_code; for string rows, by city name
        code_page_items = [(name, cc) for name, cc, _, _ in page_items if cc]
        str_page_items = [name for name, cc, _, _ in page_items if not cc and name]

        if code_page_items:
            code_vals = [cc for _, cc in code_page_items]
            place_rows_code = session.exec(
                select(Place.place_code, Place.city_code).where(
                    Place.city_code.in_(code_vals)  # type: ignore[attr-defined]
                )
            ).all()
            code_place_to_name = {}
            for _, cc in code_page_items:
                city_obj = city_by_code.get(cc)
                if city_obj:
                    for pr in place_rows_code:
                        if pr[1] == cc:
                            code_place_to_name[pr[0]] = city_obj.name

            if code_place_to_name:
                checkin_rows = session.exec(
                    select(CheckIn.place_code, func.count(CheckIn.id).label("cnt"))
                    .where(
                        CheckIn.place_code.in_(list(code_place_to_name.keys())),  # type: ignore[attr-defined]
                        CheckIn.checked_in_at >= cutoff,
                    )
                    .group_by(CheckIn.place_code)
                ).all()
                for place_code_val, cnt in checkin_rows:
                    cname = code_place_to_name.get(place_code_val)
                    if cname:
                        checkins_by_city[cname] = checkins_by_city.get(cname, 0) + cnt

        if str_page_items:
            place_rows_str = session.exec(
                select(Place.place_code, Place.city).where(
                    Place.city.in_(str_page_items)  # type: ignore[attr-defined]
                )
            ).all()
            str_place_to_city = {pr[0]: pr[1] for pr in place_rows_str}
            if str_place_to_city:
                checkin_rows2 = session.exec(
                    select(CheckIn.place_code, func.count(CheckIn.id).label("cnt"))
                    .where(
                        CheckIn.place_code.in_(list(str_place_to_city.keys())),  # type: ignore[attr-defined]
                        CheckIn.checked_in_at >= cutoff,
                    )
                    .group_by(CheckIn.place_code)
                ).all()
                for place_code_val, cnt in checkin_rows2:
                    cname = str_place_to_city.get(place_code_val)
                    if cname:
                        checkins_by_city[cname] = checkins_by_city.get(cname, 0) + cnt

    # Fetch top 3 place images per city when requested
    # Places are ranked by avg rating desc → review count desc → checkin count desc
    # so the collage always shows the most popular/best-rated places.
    city_top_images: dict[str, list[str]] = {}
    if include_images and page_city_names:
        from app.db import reviews as reviews_db

        # Split into canonical (city_code) and legacy (city string) buckets
        code_img_items = [(name, cc) for name, cc, _, _ in page_items if cc and name]
        str_img_items = [name for name, cc, _, _ in page_items if not cc and name]

        city_place_codes: dict[str, list[str]] = {}

        if code_img_items:
            cc_vals = [cc for _, cc in code_img_items]
            cc_to_name = {cc: name for name, cc in code_img_items}
            code_rows = session.exec(
                select(Place.place_code, Place.city_code).where(
                    Place.city_code.in_(cc_vals)  # type: ignore[attr-defined]
                )
            ).all()
            for pc, cc in code_rows:
                cname = cc_to_name.get(cc)
                if cname:
                    city_place_codes.setdefault(cname, []).append(pc)

        if str_img_items:
            str_rows = session.exec(
                select(Place.place_code, Place.city).where(
                    Place.city.in_(str_img_items)  # type: ignore[attr-defined]
                )
            ).all()
            for pc, city_str in str_rows:
                if city_str:
                    city_place_codes.setdefault(city_str, []).append(pc)

        all_place_codes = [pc for codes in city_place_codes.values() for pc in codes]

        if all_place_codes:
            # Bulk fetch ratings and checkin counts for popularity ordering
            all_ratings = reviews_db.get_aggregate_ratings_bulk(all_place_codes, session)
            checkin_cnt_rows = session.exec(
                select(CheckIn.place_code, func.count(CheckIn.id).label("cnt"))
                .where(CheckIn.place_code.in_(all_place_codes))  # type: ignore[attr-defined]
                .group_by(CheckIn.place_code)
            ).all()
            checkin_counts: dict[str, int] = dict(checkin_cnt_rows)

            def _place_sort_key(pc: str) -> tuple:
                r = all_ratings.get(pc, {})
                return (
                    -(r.get("average") or 0.0),
                    -(r.get("count") or 0),
                    -checkin_counts.get(pc, 0),
                )

            bulk_images = place_images.get_images_bulk(all_place_codes, session)

            for cname, codes in city_place_codes.items():
                sorted_codes = sorted(codes, key=_place_sort_key)
                imgs: list[str] = []
                for pc in sorted_codes:
                    place_imgs = bulk_images.get(pc, [])
                    if place_imgs and place_imgs[0].get("url"):
                        imgs.append(place_imgs[0]["url"])
                    if len(imgs) >= 3:
                        break
                city_top_images[cname] = imgs

    cities = []
    for city_name, city_code_val, count, city_obj in page_items:
        if not city_name:
            continue
        entry: dict = {
            "city": city_name,
            "city_slug": _city_to_slug(city_name),
            "city_code": city_code_val
            if city_code_val
            else (city_obj.city_code if city_obj else None),
            "translations": city_obj.translations if city_obj else None,
            "count": count,
        }
        if include_metrics:
            checkins_30d = checkins_by_city.get(city_name, 0)
            entry["checkins_30d"] = checkins_30d
            entry["popularity_label"] = _derive_popularity_label(checkins_30d)
        if include_images:
            entry["top_images"] = city_top_images.get(city_name, [])
        cities.append(entry)

    return {"items": cities, "total": total, "page": page, "page_size": page_size}


@router.get("/{city_slug}")
def list_places_in_city(
    city_slug: str,
    session: SessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    lang: str | None = Query(None),
    q: str | None = Query(None, description="Search places by name, address, type, or religion"),
):
    """List places in a city (matched by slug)."""
    city_slug = city_slug.lower()

    # Try to find a canonical City row matching the slug
    all_city_objs = session.exec(select(City)).all()
    canonical_city = next((c for c in all_city_objs if _city_to_slug(c.name) == city_slug), None)

    if canonical_city:
        offset_val = (page - 1) * page_size
        filters = [Place.city_code == canonical_city.city_code]
        search_filter = _place_search_filter(q)
        if search_filter is not None:
            filters.append(search_filter)
        total = session.exec(select(func.count(Place.id)).where(*filters)).one()
        places = session.exec(
            select(Place)
            .where(*filters)
            .order_by(Place.name.asc())
            .offset(offset_val)
            .limit(page_size)
        ).all()
        city_name = canonical_city.name
    else:
        # Fallback: match by raw city string
        all_cities = session.exec(
            select(Place.city).where(Place.city != None, Place.city != "").distinct()  # noqa: E711
        ).all()
        matching_city = next((c for c in all_cities if c and _city_to_slug(c) == city_slug), None)
        if not matching_city:
            raise HTTPException(status_code=404, detail="City not found")
        offset_val = (page - 1) * page_size
        filters = [Place.city == matching_city]
        search_filter = _place_search_filter(q)
        if search_filter is not None:
            filters.append(search_filter)
        total = session.exec(select(func.count(Place.id)).where(*filters)).one()
        places = session.exec(
            select(Place)
            .where(*filters)
            .order_by(Place.name.asc())
            .offset(offset_val)
            .limit(page_size)
        ).all()
        city_name = matching_city

    place_codes = [p.place_code for p in places]
    seo_rows = (
        session.exec(select(PlaceSEO).where(PlaceSEO.place_code.in_(place_codes))).all()
        if place_codes
        else []
    )
    seo_map = {s.place_code: s for s in seo_rows}
    img_map = place_images.get_images_bulk(place_codes, session) if place_codes else {}

    place_trans: dict[str, dict[str, str]] = {}
    if lang and lang != "en" and place_codes:
        place_trans = ct_db.bulk_get_translations("place", place_codes, lang, session)

    translated_city_name = city_name
    if lang and lang != "en" and canonical_city:
        city_translations = canonical_city.translations or {}
        translated_city_name = city_translations.get(lang, city_name)

    place_items = [
        serialize_place_minimal(
            p,
            images=img_map.get(p.place_code, []),
            translations=place_trans.get(p.place_code),
            seo_slug=seo_map[p.place_code].slug if seo_map.get(p.place_code) else None,
        )
        for p in places
    ]
    return {
        "items": place_items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "city": translated_city_name,
        "city_slug": city_slug,
    }


@router.get("/{city_slug}/{religion}")
def list_places_in_city_by_religion(
    city_slug: str,
    religion: str,
    session: SessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    lang: str | None = Query(None),
    q: str | None = Query(None, description="Search places by name, address, type, or religion"),
):
    """List places in a city filtered by religion."""
    city_slug = city_slug.lower()

    all_city_objs = session.exec(select(City)).all()
    canonical_city = next((c for c in all_city_objs if _city_to_slug(c.name) == city_slug), None)

    if canonical_city:
        offset_val = (page - 1) * page_size
        filters = [Place.city_code == canonical_city.city_code, Place.religion == religion]
        search_filter = _place_search_filter(q)
        if search_filter is not None:
            filters.append(search_filter)
        total = session.exec(select(func.count(Place.id)).where(*filters)).one()
        places = session.exec(
            select(Place)
            .where(*filters)
            .order_by(Place.name.asc())
            .offset(offset_val)
            .limit(page_size)
        ).all()
        city_name = canonical_city.name
    else:
        all_cities = session.exec(
            select(Place.city).where(Place.city != None, Place.city != "").distinct()  # noqa: E711
        ).all()
        matching_city = next((c for c in all_cities if c and _city_to_slug(c) == city_slug), None)
        if not matching_city:
            raise HTTPException(status_code=404, detail="City not found")
        offset_val = (page - 1) * page_size
        filters = [Place.city == matching_city, Place.religion == religion]
        search_filter = _place_search_filter(q)
        if search_filter is not None:
            filters.append(search_filter)
        total = session.exec(select(func.count(Place.id)).where(*filters)).one()
        places = session.exec(
            select(Place)
            .where(*filters)
            .order_by(Place.name.asc())
            .offset(offset_val)
            .limit(page_size)
        ).all()
        city_name = matching_city

    place_codes = [p.place_code for p in places]
    seo_rows = (
        session.exec(select(PlaceSEO).where(PlaceSEO.place_code.in_(place_codes))).all()
        if place_codes
        else []
    )
    seo_map = {s.place_code: s for s in seo_rows}
    img_map = place_images.get_images_bulk(place_codes, session) if place_codes else {}

    place_trans: dict[str, dict[str, str]] = {}
    if lang and lang != "en" and place_codes:
        place_trans = ct_db.bulk_get_translations("place", place_codes, lang, session)

    translated_city_name = city_name
    if lang and lang != "en" and canonical_city:
        city_translations = canonical_city.translations or {}
        translated_city_name = city_translations.get(lang, city_name)

    place_items = [
        serialize_place_minimal(
            p,
            images=img_map.get(p.place_code, []),
            translations=place_trans.get(p.place_code),
            seo_slug=seo_map[p.place_code].slug if seo_map.get(p.place_code) else None,
        )
        for p in places
    ]
    return {
        "items": place_items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "city": translated_city_name,
        "city_slug": city_slug,
        "religion": religion,
    }
