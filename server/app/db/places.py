"""
In-memory places store for local dev.
"""
import math
import secrets
from typing import Any, Dict, List, Literal, Optional

Religion = Literal["islam", "hinduism", "christianity"]


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
) -> PlaceRow:
    place_code = _generate_place_code()
    from datetime import datetime
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
    )
    places[place_code] = row
    return row


def get_place_by_code(place_code: str) -> Optional[PlaceRow]:
    return places.get(place_code)


def list_places(
    religion: Optional[Religion] = None,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    radius_km: Optional[float] = None,
    place_type: Optional[str] = None,
    search: Optional[str] = None,
    sort: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> List[tuple]:
    result: List[tuple] = []
    for p in places.values():
        if religion and p.religion != religion:
            continue
        if place_type and p.place_type != place_type:
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
        # We don't have rating on place; keep current order (proximity if lat/lng)
        pass
    if lat is not None and lng is not None and sort != "rating":
        result.sort(key=lambda x: (x[1] or 0))
    return result[offset : offset + limit]


def _seed() -> None:
    if places:
        return
    seed_entries = [
        {"name": "Sultan Ahmed Mosque", "religion": "islam", "place_type": "mosque", "lat": 41.0054, "lng": 28.9768, "address": "Istanbul, Turkey",
         "religion_specific": {"prayer_times": {"fajr": "05:30", "dhuhr": "12:45", "asr": "15:30", "maghrib": "18:15", "isha": "19:45"}, "capacity": 10000, "facilities": ["ablution", "wudu area", "women's section"]}},
        {"name": "Masjid Al-Noor", "religion": "islam", "place_type": "mosque", "lat": 40.71, "lng": -74.01, "address": "Downtown District", "religion_specific": {"prayer_times": {}, "capacity": 500, "facilities": ["ablution"]}},
        {"name": "Kapaleeshwarar Temple", "religion": "hinduism", "place_type": "temple", "lat": 13.0342, "lng": 80.2676, "address": "Mylapore, Chennai, India",
         "religion_specific": {"deities": [{"name": "Lord Shiva", "image_url": ""}], "festival_dates": ["Maha Shivaratri"], "dress_code": "Traditional attire preferred"}},
        {"name": "Sample Temple", "religion": "hinduism", "place_type": "temple", "lat": 40.72, "lng": -74.00, "address": "456 Oak Ave", "religion_specific": {"deities": [], "festival_dates": [], "dress_code": ""}},
        {"name": "Notre Dame", "religion": "christianity", "place_type": "church", "lat": 48.8530, "lng": 2.3499, "address": "Paris, France",
         "religion_specific": {"denomination": "Roman Catholic", "service_times": {"Sunday": "10:00, 18:00"}, "notable_features": ["Gothic architecture", "Rose windows"]}},
        {"name": "Sample Church", "religion": "christianity", "place_type": "church", "lat": 40.708, "lng": -74.009, "address": "123 Main St", "religion_specific": {"denomination": "Interdenominational", "service_times": {}, "notable_features": []}},
    ]
    for e in seed_entries:
        create_place(
            name=e["name"],
            religion=e["religion"],
            place_type=e["place_type"],
            lat=e["lat"],
            lng=e["lng"],
            address=e["address"],
            opening_hours=e.get("opening_hours"),
            image_urls=e.get("image_urls", []),
            description=e.get("description"),
            religion_specific=e.get("religion_specific"),
        )


# Run seed on import
_seed()
