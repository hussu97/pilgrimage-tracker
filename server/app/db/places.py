"""
In-memory places store for local dev.

religion_specific (optional dict) shapes for faith-specific UI:
- Islam: prayer_times (map: fajr, dhuhr, asr, maghrib, isha -> "HH:MM"), capacity,
  wudu_area, parking, womens_area; jummah_times or prayer_times for Friday filter.
- Hindu: deities ([{name, subtitle?, image_url}]), architecture, next_festival,
  dress_code, dress_code_notes, crowd_level? (Low/Medium/High).
- Christian: service_times ([{day, name, location?, time}]), founded_year, style,
  website_url (or use place.website_url).
"""
import math
import secrets
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional

Religion = Literal["islam", "hinduism", "christianity"]


def _parse_time(s: str) -> Optional[tuple]:
    """Parse 'HH:MM' or 'HH:MM:SS' to (hour, minute). Returns None if invalid."""
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
    """
    Compute is_open_now from opening_hours using server UTC time.
    Supports: {"opens": "09:00", "closes": "17:00"} (24h).
    Returns None if unknown (no hours or can't parse); True/False otherwise.
    """
    if not opening_hours or not isinstance(opening_hours, dict):
        return None
    opens = opening_hours.get("opens")
    closes = opening_hours.get("closes")
    if opens is None and closes is None:
        return None
    now = datetime.now(timezone.utc).time()
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


class PlaceRow:
    def __init__(
        self,
        place_code: str,
        name: str,
        religion: Religion,
        place_type: str,
        lat: float,
        lng: float,
        address: str,
        opening_hours: Optional[Dict[str, str]],
        image_urls: List[str],
        description: Optional[str],
        created_at: str,
        religion_specific: Optional[Dict[str, Any]] = None,
        website_url: Optional[str] = None,
    ):
        self.place_code = place_code
        self.name = name
        self.religion = religion
        self.place_type = place_type
        self.lat = lat
        self.lng = lng
        self.address = address
        self.opening_hours = opening_hours
        self.image_urls = image_urls or []
        self.description = description
        self.created_at = created_at
        self.religion_specific = religion_specific or {}
        self.website_url = website_url


places: dict[str, PlaceRow] = {}


def _generate_place_code() -> str:
    return "plc_" + secrets.token_hex(8)


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371  # km
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def create_place(
    name: str,
    religion: Religion,
    place_type: str,
    lat: float,
    lng: float,
    address: str,
    opening_hours: Optional[Dict[str, str]] = None,
    image_urls: Optional[List[str]] = None,
    description: Optional[str] = None,
    religion_specific: Optional[Dict[str, Any]] = None,
    website_url: Optional[str] = None,
) -> PlaceRow:
    place_code = _generate_place_code()
    now = datetime.utcnow().isoformat() + "Z"
    row = PlaceRow(
        place_code=place_code,
        name=name,
        religion=religion,
        place_type=place_type,
        lat=lat,
        lng=lng,
        address=address,
        opening_hours=opening_hours,
        image_urls=image_urls or [],
        description=description,
        created_at=now,
        religion_specific=religion_specific or {},
        website_url=website_url,
    )
    places[place_code] = row
    return row


def get_place_by_code(place_code: str) -> Optional[PlaceRow]:
    return places.get(place_code)


def _place_has_jummah(p: PlaceRow) -> bool:
    """True if place (Islam) has Jummah / Friday prayer data."""
    if p.religion != "islam":
        return False
    rs = getattr(p, "religion_specific", None) or {}
    if rs.get("jummah_times"):
        return True
    pt = rs.get("prayer_times")
    if isinstance(pt, dict) and (pt.get("dhuhr") or pt.get("jummah") or pt.get("friday")):
        return True
    return False


def _place_has_events(p: PlaceRow) -> bool:
    """True if place has events (religion_specific.events non-empty or has_events true)."""
    rs = getattr(p, "religion_specific", None) or {}
    if rs.get("has_events") is True:
        return True
    ev = rs.get("events")
    return isinstance(ev, list) and len(ev) > 0


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
) -> List[tuple]:
    result: List[tuple] = []
    for p in places.values():
        if religions and p.religion not in religions:
            continue
        if place_type and p.place_type != place_type:
            continue
        if jummah is True and not _place_has_jummah(p):
            continue
        if has_events is True and not _place_has_events(p):
            continue
        if search:
            q = search.lower()
            if q not in (p.name or "").lower() and q not in (p.address or "").lower() and q not in (p.description or "").lower():
                continue
        dist = None
        if lat is not None and lng is not None:
            dist = _haversine_km(lat, lng, p.lat, p.lng)
        if radius_km is not None and dist is not None and dist > radius_km:
            continue
        result.append((p, dist))
    if sort == "rating":
        pass
    if lat is not None and lng is not None and sort != "rating":
        result.sort(key=lambda x: (x[1] or 0))
    return result[offset : offset + limit]


