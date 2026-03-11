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
from sqlmodel import func, select

from app.db.models import CheckIn, City, Place
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


@router.get("")
def list_cities(
    session: SessionDep,
    limit: int = Query(100, le=500),
    offset: int = Query(0),
    include_metrics: bool = Query(
        False, description="Include 30-day check-in metrics and popularity label per city"
    ),
):
    """List all cities with place counts, sorted by count descending."""
    rows = session.exec(
        select(Place.city, func.count(Place.id).label("count"))
        .where(Place.city != None, Place.city != "")  # noqa: E711
        .group_by(Place.city)
        .order_by(func.count(Place.id).desc())
        .offset(offset)
        .limit(limit)
    ).all()

    # Build a lookup map from city name → City row (for city_code + translations)
    city_names = [city for city, _ in rows if city]
    city_rows = (
        session.exec(select(City).where(City.name.in_(city_names))).all() if city_names else []
    )
    city_map = {c.name: c for c in city_rows}

    # Compute 30-day check-in counts per city if metrics requested
    checkins_by_city: dict[str, int] = {}
    if include_metrics and city_names:
        cutoff = datetime.now(UTC) - timedelta(days=30)
        # Get all place_codes for the cities in this page
        place_rows = session.exec(
            select(Place.place_code, Place.city).where(Place.city.in_(city_names))  # type: ignore[attr-defined]
        ).all()
        place_to_city = dict(place_rows)
        place_codes = list(place_to_city.keys())
        if place_codes:
            checkin_rows = session.exec(
                select(CheckIn.place_code, func.count(CheckIn.id).label("cnt"))
                .where(
                    CheckIn.place_code.in_(place_codes),  # type: ignore[attr-defined]
                    CheckIn.checked_in_at >= cutoff,
                )
                .group_by(CheckIn.place_code)
            ).all()
            for place_code, cnt in checkin_rows:
                city_name = place_to_city.get(place_code)
                if city_name:
                    checkins_by_city[city_name] = checkins_by_city.get(city_name, 0) + cnt

    cities = []
    for city, count in rows:
        if not city:
            continue
        city_row = city_map.get(city)
        entry: dict = {
            "city": city,
            "city_slug": _city_to_slug(city),
            "city_code": city_row.city_code if city_row else None,
            "translations": city_row.translations if city_row else None,
            "count": count,
        }
        if include_metrics:
            checkins_30d = checkins_by_city.get(city, 0)
            entry["checkins_30d"] = checkins_30d
            entry["popularity_label"] = _derive_popularity_label(checkins_30d)
        cities.append(entry)

    total = session.exec(
        select(func.count()).select_from(
            select(Place.city)
            .where(Place.city != None, Place.city != "")  # noqa: E711
            .distinct()
            .subquery()
        )
    ).one()

    return {"cities": cities, "total": total}


@router.get("/{city_slug}")
def list_places_in_city(
    city_slug: str,
    session: SessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, le=200),
):
    """List places in a city (matched by slug)."""
    # Normalize the incoming slug to lowercase for matching
    city_slug = city_slug.lower()
    # Find all cities that match the slug
    all_cities = session.exec(
        select(Place.city).where(Place.city != None, Place.city != "").distinct()  # noqa: E711
    ).all()
    matching_city = next((c for c in all_cities if c and _city_to_slug(c) == city_slug), None)
    if not matching_city:
        raise HTTPException(status_code=404, detail="City not found")

    offset = (page - 1) * page_size
    total = session.exec(select(func.count(Place.id)).where(Place.city == matching_city)).one()

    places = session.exec(
        select(Place).where(Place.city == matching_city).offset(offset).limit(page_size)
    ).all()

    from app.db.models import PlaceSEO

    place_codes = [p.place_code for p in places]
    seo_rows = (
        session.exec(select(PlaceSEO).where(PlaceSEO.place_code.in_(place_codes))).all()
        if place_codes
        else []
    )
    seo_map = {s.place_code: s for s in seo_rows}

    return {
        "city": matching_city,
        "city_slug": city_slug,
        "total": total,
        "page": page,
        "page_size": page_size,
        "places": [
            {
                "place_code": p.place_code,
                "name": p.name,
                "religion": p.religion,
                "place_type": p.place_type,
                "address": p.address,
                "lat": p.lat,
                "lng": p.lng,
                "seo_slug": seo_map.get(p.place_code, None) and seo_map[p.place_code].slug,
            }
            for p in places
        ],
    }


@router.get("/{city_slug}/{religion}")
def list_places_in_city_by_religion(
    city_slug: str,
    religion: str,
    session: SessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, le=200),
):
    """List places in a city filtered by religion."""
    # Normalize the incoming slug to lowercase for matching
    city_slug = city_slug.lower()
    all_cities = session.exec(
        select(Place.city).where(Place.city != None, Place.city != "").distinct()  # noqa: E711
    ).all()
    matching_city = next((c for c in all_cities if c and _city_to_slug(c) == city_slug), None)
    if not matching_city:
        raise HTTPException(status_code=404, detail="City not found")

    offset = (page - 1) * page_size
    total = session.exec(
        select(func.count(Place.id)).where(Place.city == matching_city, Place.religion == religion)
    ).one()

    places = session.exec(
        select(Place)
        .where(Place.city == matching_city, Place.religion == religion)
        .offset(offset)
        .limit(page_size)
    ).all()

    from app.db.models import PlaceSEO

    place_codes = [p.place_code for p in places]
    seo_rows = (
        session.exec(select(PlaceSEO).where(PlaceSEO.place_code.in_(place_codes))).all()
        if place_codes
        else []
    )
    seo_map = {s.place_code: s for s in seo_rows}

    return {
        "city": matching_city,
        "city_slug": city_slug,
        "religion": religion,
        "total": total,
        "page": page,
        "page_size": page_size,
        "places": [
            {
                "place_code": p.place_code,
                "name": p.name,
                "religion": p.religion,
                "place_type": p.place_type,
                "address": p.address,
                "lat": p.lat,
                "lng": p.lng,
                "seo_slug": seo_map.get(p.place_code, None) and seo_map[p.place_code].slug,
            }
            for p in places
        ],
    }
