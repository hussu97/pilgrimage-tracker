import math
import secrets
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional

from sqlmodel import Session, select, or_
from app.db.models import Place
from app.db.session import engine
from app.db import place_attributes as attr_db

Religion = Literal["islam", "hinduism", "christianity"]


def _parse_time(s: str) -> Optional[tuple]:
    if not s or not isinstance(s, str):
        return None
    parts = s.strip().split(":")
    if len(parts) >= 2:
        try:
            h, m = int(parts[0]), int(parts[1])
            if 0 <= h <= 23 and 0 <= m <= 59:
                return (h, m)
        except ValueError:
            pass
    return None


def _is_open_now_from_hours(opening_hours: Optional[Dict[str, Any]]) -> Optional[bool]:
    if not opening_hours or not isinstance(opening_hours, dict):
        return None

    # Detect format: per-day (Monday-Sunday keys) vs legacy (opens/closes keys)
    day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    is_per_day_format = any(day in opening_hours for day in day_names)

    if is_per_day_format:
        # Per-day format: {"Monday": "04:00-23:59", "Tuesday": "Closed", ...}
        now = datetime.now(timezone.utc)
        current_day = now.strftime("%A")  # e.g., "Monday"
        today_hours = opening_hours.get(current_day)

        if not today_hours or not isinstance(today_hours, str):
            return None

        # Check for closed status
        if today_hours.lower() in ["closed", "hours not available"]:
            return False

        # Parse "HH:MM-HH:MM" format
        if "-" not in today_hours:
            return None

        parts = today_hours.split("-")
        if len(parts) != 2:
            return None

        open_t = _parse_time(parts[0].strip())
        close_t = _parse_time(parts[1].strip())

        if open_t is None or close_t is None:
            return None

        now_min = now.hour * 60 + now.minute
        open_min = open_t[0] * 60 + open_t[1]
        close_min = close_t[0] * 60 + close_t[1]

        # Handle midnight crossover (e.g., "20:00-04:00")
        if open_min <= close_min:
            return open_min <= now_min <= close_min
        return now_min >= open_min or now_min <= close_min

    else:
        # Legacy format: {"opens": "HH:MM", "closes": "HH:MM"}
        opens = opening_hours.get("opens")
        closes = opening_hours.get("closes")
        if opens is None and closes is None:
            return None
        now = datetime.now(timezone.utc).time()
        open_t = _parse_time(opens) if opens else (0, 0)
        close_t = _parse_time(closes) if closes else (23, 59)
        if open_t is None and close_t is None:
            return None
        if open_t is None: open_t = (0, 0)
        if close_t is None: close_t = (23, 59)
        now_min = now.hour * 60 + now.minute
        open_min = open_t[0] * 60 + open_t[1]
        close_min = close_t[0] * 60 + close_t[1]
        if open_min <= close_min:
            return open_min <= now_min <= close_min
        return now_min >= open_min or now_min <= close_min


def _generate_place_code() -> str:
    return "plc_" + secrets.token_hex(8)


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (math.sin(dlat / 2) ** 2 + 
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def create_place(
    place_code: str,
    name: str,
    religion: Religion,
    place_type: str,
    lat: float,
    lng: float,
    address: str,
    opening_hours: Optional[Dict[str, str]] = None,
    description: Optional[str] = None,
    website_url: Optional[str] = None,
    source: Optional[str] = None,
) -> Place:
    with Session(engine) as session:
        place = Place(
            place_code=place_code,
            name=name,
            religion=religion,
            place_type=place_type,
            lat=lat,
            lng=lng,
            address=address,
            opening_hours=opening_hours,
            description=description,
            website_url=website_url,
            source=source,
        )
        session.add(place)
        session.commit()
        session.refresh(place)
        return place


def update_place(
    place_code: str,
    name: Optional[str] = None,
    religion: Optional[Religion] = None,
    place_type: Optional[str] = None,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    address: Optional[str] = None,
    opening_hours: Optional[Dict[str, str]] = None,
    description: Optional[str] = None,
    website_url: Optional[str] = None,
    source: Optional[str] = None,
) -> Optional[Place]:
    with Session(engine) as session:
        place = session.exec(select(Place).where(Place.place_code == place_code)).first()
        if not place:
            return None

        if name is not None: place.name = name
        if religion is not None: place.religion = religion
        if place_type is not None: place.place_type = place_type
        if lat is not None: place.lat = lat
        if lng is not None: place.lng = lng
        if address is not None: place.address = address
        if opening_hours is not None: place.opening_hours = opening_hours
        if description is not None: place.description = description
        if website_url is not None: place.website_url = website_url
        if source is not None: place.source = source

        session.add(place)
        session.commit()
        session.refresh(place)
        return place




def get_place_by_code(place_code: str) -> Optional[Place]:
    with Session(engine) as session:
        return session.exec(select(Place).where(Place.place_code == place_code)).first()


def _check_attr_bool(attrs: dict, attribute_code: str) -> bool:
    """Check if an attribute is truthy from pre-fetched attributes dict."""
    val = attrs.get(attribute_code)
    if val is None:
        return False
    if isinstance(val, bool):
        return val
    if isinstance(val, str):
        return val.lower() not in ("false", "0", "")
    return bool(val)


def _place_has_jummah(p: Place, attrs: dict) -> bool:
    """Check if place has Jummah prayer (Friday prayer for Islam)."""
    if p.religion != "islam":
        return False
    return _check_attr_bool(attrs, "jummah_times")


def _place_has_events(p: Place, attrs: dict) -> bool:
    """Check if place has events."""
    return _check_attr_bool(attrs, "has_events")


def _place_has_parking(p: Place, attrs: dict) -> bool:
    """Check if place has parking."""
    return _check_attr_bool(attrs, "has_parking")


def _place_has_womens_area(p: Place, attrs: dict) -> bool:
    """Check if place has women's area."""
    return _check_attr_bool(attrs, "has_womens_area")


def list_places(
    religions: Optional[List[Religion]] = None,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    radius_km: Optional[float] = None,
    place_type: Optional[str] = None,
    search: Optional[str] = None,
    sort: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    jummah: Optional[bool] = None,
    has_events: Optional[bool] = None,
    open_now: Optional[bool] = None,
    has_parking: Optional[bool] = None,
    womens_area: Optional[bool] = None,
    top_rated: Optional[bool] = None,
    _reviews_agg_fn=None,
) -> dict:
    with Session(engine) as session:
        statement = select(Place)

        if religions:
            statement = statement.where(Place.religion.in_(religions))
        if place_type:
            statement = statement.where(Place.place_type == place_type)
        if search:
            q = f"%{search.lower()}%"
            statement = statement.where(
                or_(
                    Place.name.ilike(q),
                    Place.address.ilike(q),
                    Place.description.ilike(q)
                )
            )

        all_places = session.exec(statement).all()

        # BULK FETCH: Get all attributes for all places in ONE query
        place_codes = [p.place_code for p in all_places]
        all_attrs = attr_db.bulk_get_attributes_for_places(place_codes, session)

        # BULK FETCH: Get filterable attribute definitions ONCE
        filterable_defs = attr_db.get_attribute_definitions(filterable_only=True, session=session)

        result: List[tuple] = []
        for p in all_places:
            attrs = all_attrs.get(p.place_code, {})

            if jummah is True and not _place_has_jummah(p, attrs):
                continue
            if has_events is True and not _place_has_events(p, attrs):
                continue

            dist = None
            if lat is not None and lng is not None:
                dist = _haversine_km(lat, lng, p.lat, p.lng)

            if radius_km is not None and dist is not None and dist > radius_km:
                continue

            result.append((p, dist))

        if sort == "rating":
            # Rating sort handled later if _reviews_agg_fn exists
            pass
        elif lat is not None and lng is not None:
            result.sort(key=lambda x: (x[1] or 0))

        base_results = result[:]

        def _get_avg(place_code: str) -> float:
            if _reviews_agg_fn:
                agg = _reviews_agg_fn(place_code)
                return agg["average"] if agg else 0.0
            return 0.0

        def count_filter(fn) -> int:
            return sum(1 for p, _ in base_results if fn(p))

        # Build filter options: start with static special-cases, then dynamic attribute defs
        filter_options = [
            {
                "key": "open_now",
                "label": "Open Now",
                "icon": "schedule",
                "count": count_filter(lambda p: bool(_is_open_now_from_hours(p.opening_hours))),
            },
            {
                "key": "top_rated",
                "label": "Top Rated",
                "icon": "star",
                "count": count_filter(lambda p: _get_avg(p.place_code) >= 4.0),
            },
        ]

        # Add dynamic attribute-based filters (using pre-fetched data)
        for defn in filterable_defs:
            attr_code = defn.attribute_code

            def _make_attr_counter(code):
                def _check(p):
                    attrs = all_attrs.get(p.place_code, {})
                    return _check_attr_bool(attrs, code)
                return _check

            filter_options.append({
                "key": attr_code,
                "label": defn.name,
                "icon": defn.icon or "info",
                "count": count_filter(_make_attr_counter(attr_code)),
            })

        filters_meta = {"options": filter_options}

        # Apply active filters (using pre-fetched data)
        if open_now is True:
            result = [(p, d) for p, d in result if _is_open_now_from_hours(p.opening_hours) is True]
        if has_parking is True:
            result = [(p, d) for p, d in result if _place_has_parking(p, all_attrs.get(p.place_code, {}))]
        if womens_area is True:
            result = [(p, d) for p, d in result if _place_has_womens_area(p, all_attrs.get(p.place_code, {}))]
        if top_rated is True:
            result = [(p, d) for p, d in result if _get_avg(p.place_code) >= 4.0]

        return {"rows": result[offset: offset + limit], "filters": filters_meta, "all_attrs": all_attrs}
