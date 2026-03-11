"""City aggregation endpoints for programmatic SEO.

Provides city-level landing pages for long-tail SEO:
  GET /api/v1/cities                          — list all cities with place counts
  GET /api/v1/cities/{city_slug}              — places in a city
  GET /api/v1/cities/{city_slug}/{religion}   — places in a city filtered by religion
"""

from __future__ import annotations

import re

from fastapi import APIRouter, HTTPException, Query
from sqlmodel import func, select

from app.db.models import Place
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


@router.get("")
def list_cities(
    session: SessionDep,
    limit: int = Query(100, le=500),
    offset: int = Query(0),
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

    cities = [
        {
            "city": city,
            "city_slug": _city_to_slug(city),
            "count": count,
        }
        for city, count in rows
        if city
    ]

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
