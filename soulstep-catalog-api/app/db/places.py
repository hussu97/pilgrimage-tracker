import math
import re
from datetime import UTC, datetime
from typing import Any

from sqlmodel import Session, or_, select

from app.db import place_attributes as attr_db
from app.db import reviews as reviews_db
from app.db.enums import Religion
from app.db.models import Place
from app.services.timezone_utils import get_local_now


def _parse_time(s: str) -> tuple | None:
    """Parse 24h time string 'HH:MM' → (h, m)."""
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


def _parse_time_12h(s: str) -> tuple | None:
    """Parse 12h time string like '5:06 AM' or '11:02 PM' → (h, m)."""
    if not s or not isinstance(s, str):
        return None
    s = s.strip().replace("\u202f", " ")  # narrow no-break space → regular space
    for fmt in ("%I:%M %p", "%I %p"):
        try:
            dt = datetime.strptime(s, fmt)
            return (dt.hour, dt.minute)
        except ValueError:
            pass
    return None


# Matches em dash, en dash, or a hyphen surrounded by spaces (12h separator)
_12H_SPLIT_RE = re.compile(r"\s*[–—]\s*|\s+-\s+")


def _parse_slot(slot: str) -> tuple | None:
    """
    Parse a single time slot string → (open_t, close_t) as (h, m) tuples.
    Tries 24h format ("09:00-17:00") first, then 12h format ("5:06 AM – 11:02 PM").
    Returns None if neither format parses successfully.
    """
    slot = slot.strip().replace("\u202f", " ")

    # 24h: bare hyphen with no surrounding spaces, e.g. "09:00-17:00"
    parts = slot.split("-")
    if len(parts) == 2:
        open_t = _parse_time(parts[0].strip())
        close_t = _parse_time(parts[1].strip())
        if open_t is not None and close_t is not None:
            return (open_t, close_t)

    # 12h: em/en dash or spaced hyphen, e.g. "5:06 AM – 11:02 PM"
    parts_12h = _12H_SPLIT_RE.split(slot)
    if len(parts_12h) == 2:
        open_str, close_str = parts_12h[0].strip(), parts_12h[1].strip()
        open_t = _parse_time_12h(open_str)
        close_t = _parse_time_12h(close_str)
        if open_t is not None and close_t is not None:
            return (open_t, close_t)

        # Google Maps sometimes omits AM/PM on the open time when it matches close's period
        # e.g. "6:30 – 7:15 AM" → open_str="6:30", close_str="7:15 AM"
        if close_t is not None and open_t is None:
            period_match = re.search(r"\b(AM|PM)\b", close_str, re.IGNORECASE)
            if period_match:
                period = period_match.group(0).upper()
                open_t = _parse_time_12h(f"{open_str} {period}")
                if open_t is not None:
                    return (open_t, close_t)

    return None


def _is_open_now_from_hours(
    opening_hours: dict[str, Any] | None, utc_offset_minutes: int | None = None
) -> bool | None:
    if not opening_hours or not isinstance(opening_hours, dict):
        return None

    # Detect format: per-day (Monday-Sunday keys) vs legacy (opens/closes keys)
    day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    is_per_day_format = any(day in opening_hours for day in day_names)

    if is_per_day_format:
        # Per-day format: {"Monday": "04:00-23:59", "Tuesday": "Closed", ...}
        # Use local time if offset is available, otherwise fall back to UTC
        if utc_offset_minutes is not None:
            now = get_local_now(utc_offset_minutes)
        else:
            now = datetime.now(UTC)  # fallback for legacy data

        current_day = now.strftime("%A")  # e.g., "Monday"
        today_hours = opening_hours.get(current_day)

        # Handle list type by joining to comma-separated string
        if isinstance(today_hours, list):
            today_hours = ", ".join(today_hours)

        if not today_hours or not isinstance(today_hours, str):
            return None

        # Check for closed status (distinct from unknown)
        if today_hours.lower() == "closed":
            return False

        # "hours not available" is unknown, not closed
        if today_hours.lower() == "hours not available":
            return None

        now_min = now.hour * 60 + now.minute

        # Multi-slot support: split on commas, check if current time falls in ANY slot
        slots = [s.strip() for s in today_hours.split(",")]
        any_parseable = False

        for slot in slots:
            parsed = _parse_slot(slot)
            if parsed is None:
                continue

            any_parseable = True
            open_t, close_t = parsed
            open_min = open_t[0] * 60 + open_t[1]
            close_min = close_t[0] * 60 + close_t[1]

            # Handle midnight crossover (e.g., "20:00-04:00")
            if open_min <= close_min:
                if open_min <= now_min <= close_min:
                    return True
            else:
                if now_min >= open_min or now_min <= close_min:
                    return True

        if any_parseable:
            return False
        return None

    else:
        # Legacy format: {"opens": "HH:MM", "closes": "HH:MM"}
        opens = opening_hours.get("opens")
        closes = opening_hours.get("closes")
        if opens is None and closes is None:
            return None

        # Use local time if offset is available, otherwise fall back to UTC
        if utc_offset_minutes is not None:
            now = get_local_now(utc_offset_minutes).time()
        else:
            now = datetime.now(UTC).time()  # fallback for legacy data

        open_t = _parse_time(opens) if opens else (0, 0)
        close_t = _parse_time(closes) if closes else (23, 59)
        if open_t is None and close_t is None:
            return None
        if open_t is None:
            open_t = (0, 0)
        if close_t is None:
            close_t = (23, 59)
        now_min = now.hour * 60 + now.minute
        open_min = open_t[0] * 60 + open_t[1]
        close_min = close_t[0] * 60 + close_t[1]
        if open_min <= close_min:
            return open_min <= now_min <= close_min
        return now_min >= open_min or now_min <= close_min


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def create_place(
    place_code: str,
    session: Session,
    name: str,
    religion: Religion,
    place_type: str,
    lat: float,
    lng: float,
    address: str,
    opening_hours: dict[str, str] | None = None,
    utc_offset_minutes: int | None = None,
    description: str | None = None,
    website_url: str | None = None,
    source: str | None = None,
    city: str | None = None,
    state: str | None = None,
    country: str | None = None,
    city_code: str | None = None,
    state_code: str | None = None,
    country_code: str | None = None,
) -> Place:
    place = Place(
        place_code=place_code,
        name=name,
        religion=religion,
        place_type=place_type,
        lat=lat,
        lng=lng,
        address=address,
        opening_hours=opening_hours,
        utc_offset_minutes=utc_offset_minutes,
        description=description,
        website_url=website_url,
        source=source,
        city=city,
        state=state,
        country=country,
        city_code=city_code,
        state_code=state_code,
        country_code=country_code,
    )
    session.add(place)
    session.commit()
    session.refresh(place)
    return place


def update_place(
    place_code: str,
    session: Session,
    name: str | None = None,
    religion: Religion | None = None,
    place_type: str | None = None,
    lat: float | None = None,
    lng: float | None = None,
    address: str | None = None,
    opening_hours: dict[str, str] | None = None,
    utc_offset_minutes: int | None = None,
    description: str | None = None,
    website_url: str | None = None,
    source: str | None = None,
    city: str | None = None,
    state: str | None = None,
    country: str | None = None,
    city_code: str | None = None,
    state_code: str | None = None,
    country_code: str | None = None,
) -> Place | None:
    place = session.exec(select(Place).where(Place.place_code == place_code)).first()
    if not place:
        return None

    if name is not None:
        place.name = name
    if religion is not None:
        place.religion = religion
    if place_type is not None:
        place.place_type = place_type
    if lat is not None:
        place.lat = lat
    if lng is not None:
        place.lng = lng
    if address is not None:
        place.address = address
    if opening_hours is not None:
        place.opening_hours = opening_hours
    if utc_offset_minutes is not None:
        place.utc_offset_minutes = utc_offset_minutes
    if description is not None:
        place.description = description
    if website_url is not None:
        place.website_url = website_url
    if source is not None:
        place.source = source
    if city is not None:
        place.city = city
    if state is not None:
        place.state = state
    if country is not None:
        place.country = country
    if city_code is not None:
        place.city_code = city_code
    if state_code is not None:
        place.state_code = state_code
    if country_code is not None:
        place.country_code = country_code

    session.add(place)
    session.commit()
    session.refresh(place)
    return place


def get_place_by_code(place_code: str, session: Session) -> Place | None:
    return session.exec(select(Place).where(Place.place_code == place_code)).first()


def get_places_by_codes(place_codes: list[str], session: Session) -> list[Place]:
    """Batch-fetch places by a list of codes in a single query."""
    if not place_codes:
        return []
    return session.exec(select(Place).where(Place.place_code.in_(place_codes))).all()


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
    if p.religion != Religion.ISLAM:
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
    session: Session,
    religions: list[Religion] | None = None,
    lat: float | None = None,
    lng: float | None = None,
    radius_km: float | None = None,
    place_type: str | None = None,
    search: str | None = None,
    sort: str | None = None,
    limit: int = 50,
    cursor: str | None = None,
    jummah: bool | None = None,
    has_events: bool | None = None,
    open_now: bool | None = None,
    has_parking: bool | None = None,
    womens_area: bool | None = None,
    top_rated: bool | None = None,
    min_lat: float | None = None,
    max_lat: float | None = None,
    min_lng: float | None = None,
    max_lng: float | None = None,
    city: str | None = None,
) -> dict:
    statement = select(Place)

    if religions and Religion.ALL not in religions:
        statement = statement.where(Place.religion.in_(religions))
    if place_type:
        statement = statement.where(Place.place_type == place_type)
    if city:
        statement = statement.where(Place.city.ilike(city))
    if search:
        q = f"%{search.lower()}%"
        statement = statement.where(
            or_(Place.name.ilike(q), Place.address.ilike(q), Place.description.ilike(q))
        )

    # Bounding-box filter — applied at the SQL level for efficiency
    has_bbox = (
        min_lat is not None and max_lat is not None and min_lng is not None and max_lng is not None
    )
    if has_bbox:
        statement = statement.where(Place.lat >= min_lat, Place.lat <= max_lat)
        if min_lng <= max_lng:
            statement = statement.where(Place.lng >= min_lng, Place.lng <= max_lng)
        else:
            # Crosses antimeridian (e.g. min_lng=170, max_lng=-170)
            statement = statement.where(or_(Place.lng >= min_lng, Place.lng <= max_lng))

    all_places = session.exec(statement).all()

    # BULK FETCH: Get all attributes for all places in ONE query
    place_codes = [p.place_code for p in all_places]
    all_attrs = attr_db.bulk_get_attributes_for_places(place_codes, session)

    # BULK FETCH: Get filterable attribute definitions ONCE
    filterable_defs = attr_db.get_attribute_definitions(filterable_only=True, session=session)

    # BULK FETCH: Get all ratings for all places in ONE query
    all_ratings = reviews_db.get_aggregate_ratings_bulk(place_codes, session)

    result: list[tuple] = []
    for p in all_places:
        attrs = all_attrs.get(p.place_code, {})

        if jummah is True and not _place_has_jummah(p, attrs):
            continue
        if has_events is True and not _place_has_events(p, attrs):
            continue

        dist = None
        if lat is not None and lng is not None:
            dist = _haversine_km(lat, lng, p.lat, p.lng)

        # Skip radius filtering when bounding box is provided (bbox already constrains area)
        if not has_bbox and radius_km is not None and dist is not None and dist > radius_km:
            continue

        result.append((p, dist))

    if sort == "rating":
        # Rating sort handled later using bulk-fetched ratings
        pass
    elif lat is not None and lng is not None:
        result.sort(key=lambda x: x[1] or 0)

    base_results = result[:]

    def _get_avg(place_code: str) -> float:
        """Get rating from bulk-fetched ratings dict."""
        rating = all_ratings.get(place_code)
        return rating["average"] if rating else 0.0

    def count_filter(fn) -> int:
        return sum(1 for p, _ in base_results if fn(p))

    # Build filter options: start with static special-cases, then dynamic attribute defs
    filter_options = [
        {
            "key": "open_now",
            "label": "Open Now",
            "icon": "schedule",
            "count": count_filter(
                lambda p: bool(_is_open_now_from_hours(p.opening_hours, p.utc_offset_minutes))
            ),
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

        filter_options.append(
            {
                "key": attr_code,
                "label": defn.name,
                "icon": defn.icon or "info",
                "count": count_filter(_make_attr_counter(attr_code)),
            }
        )

    filters_meta = {"options": filter_options}

    # Apply active filters (using pre-fetched data)
    if open_now is True:
        result = [
            (p, d)
            for p, d in result
            if _is_open_now_from_hours(p.opening_hours, p.utc_offset_minutes) is True
        ]
    if has_parking is True:
        result = [
            (p, d) for p, d in result if _place_has_parking(p, all_attrs.get(p.place_code, {}))
        ]
    if womens_area is True:
        result = [
            (p, d) for p, d in result if _place_has_womens_area(p, all_attrs.get(p.place_code, {}))
        ]
    if top_rated is True:
        result = [(p, d) for p, d in result if _get_avg(p.place_code) >= 4.0]

    # Apply rating sort if requested (sort by rating descending, then by distance)
    if sort == "rating":
        result.sort(key=lambda x: (_get_avg(x[0].place_code), -(x[1] or 0)), reverse=True)

    # Cursor-based pagination: start after the place with the given place_code cursor.
    # Without a cursor the first page is returned.
    start_idx = 0
    if cursor:
        for i, (p, _) in enumerate(result):
            if p.place_code == cursor:
                start_idx = i + 1
                break

    page_plus_one = result[start_idx : start_idx + limit + 1]
    has_more = len(page_plus_one) > limit
    rows = page_plus_one[:limit]
    next_cursor = rows[-1][0].place_code if has_more and rows else None

    return {
        "rows": rows,
        "next_cursor": next_cursor,
        "filters": filters_meta,
        "all_attrs": all_attrs,
        "all_ratings": all_ratings,
    }
