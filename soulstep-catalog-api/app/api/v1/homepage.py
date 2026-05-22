"""Composite homepage endpoint — returns all homepage data in a single request."""

import copy
import time
import time as _time
from collections import OrderedDict
from threading import Lock
from typing import Any

from fastapi import APIRouter, Query, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy import or_ as _or
from sqlmodel import Session, func, select

from app.api.deps import OptionalUserDep
from app.api.v1.place_serializers import serialize_place_minimal
from app.db import check_ins as check_ins_db
from app.db import content_translations as ct_db
from app.db import groups as groups_db
from app.db import place_images
from app.db import places as places_db
from app.db.models import CheckIn, City, Group, Place, Review
from app.db.places import _haversine_km
from app.db.session import SessionDep
from app.lib.tracer import get_tracer

router = APIRouter()

_HOMEPAGE_CACHE_TTL = 60.0
_HOMEPAGE_CACHE_MAX_ENTRIES = 256
_public_sections_cache: "OrderedDict[tuple, tuple[dict, float]]" = OrderedDict()
_anonymous_recommended_cache: "OrderedDict[tuple, tuple[list[dict], float]]" = OrderedDict()
_homepage_cache_lock = Lock()


def _coord_key(value: float | None) -> float | None:
    return round(value, 3) if value is not None else None


def _cache_get(cache: OrderedDict, key: tuple) -> Any | None:
    now = time.monotonic()
    with _homepage_cache_lock:
        entry = cache.get(key)
        if entry is None:
            return None
        value, expires_at = entry
        if now >= expires_at:
            cache.pop(key, None)
            return None
        cache.move_to_end(key)
        return copy.deepcopy(value)


def _cache_set(cache: OrderedDict, key: tuple, value: Any) -> None:
    with _homepage_cache_lock:
        cache[key] = (copy.deepcopy(value), time.monotonic() + _HOMEPAGE_CACHE_TTL)
        cache.move_to_end(key)
        while len(cache) > _HOMEPAGE_CACHE_MAX_ENTRIES:
            cache.popitem(last=False)


def _build_user_journeys(user_code: str | None, session: Session) -> list[dict]:
    if not user_code:
        return []

    groups_out = []
    group_list = groups_db.get_groups_for_user(user_code, session)
    if not group_list:
        return groups_out

    group_codes = [g.group_code for g in group_list]
    all_members = groups_db.get_members_bulk(group_codes, session)
    all_user_codes = {uc for members in all_members.values() for uc, _, _ in members}

    all_path_codes = {pc for g in group_list for pc in (g.path_place_codes or [])}
    if all_path_codes and all_user_codes:
        all_check_ins = check_ins_db.get_check_ins_for_users_at_places(
            list(all_user_codes), list(all_path_codes), session
        )
    else:
        all_check_ins = []

    check_ins_by_user: dict[str, list] = {}
    for chk in all_check_ins:
        check_ins_by_user.setdefault(chk.user_code, []).append(chk)

    path_places: dict[str, Place] = {}
    if all_path_codes:
        path_place_list = places_db.get_places_by_codes(list(all_path_codes), session)
        path_places = {p.place_code: p for p in path_place_list}

    for i, g in enumerate(group_list):
        members = all_members.get(g.group_code, [])
        member_user_codes = {uc for uc, _, _ in members}

        last_activity = None
        for uc in member_user_codes:
            for chk in check_ins_by_user.get(uc, []):
                chk_time = chk.checked_in_at.isoformat().replace("+00:00", "Z")
                if last_activity is None or chk_time > last_activity:
                    last_activity = chk_time

        visited_by_group = {
            chk.place_code for uc in member_user_codes for chk in check_ins_by_user.get(uc, [])
        }
        path = g.path_place_codes or []
        if path:
            sites_visited = sum(1 for pc in path if pc in visited_by_group)
            total_sites = len(path)
            next_place_code = None
            next_place_name = None
            for pc in path:
                if pc not in visited_by_group:
                    next_place_code = pc
                    place = path_places.get(pc)
                    next_place_name = place.name if place else pc
                    break
        else:
            sites_visited = len(visited_by_group)
            total_sites = 0
            next_place_code = None
            next_place_name = None

        groups_out.append(
            {
                "group_code": g.group_code,
                "name": g.name,
                "description": g.description,
                "created_by_user_code": g.created_by_user_code,
                "invite_code": g.invite_code,
                "is_private": g.is_private,
                "path_place_codes": g.path_place_codes or [],
                "cover_image_url": g.cover_image_url,
                "start_date": g.start_date.isoformat() if g.start_date else None,
                "end_date": g.end_date.isoformat() if g.end_date else None,
                "created_at": g.created_at,
                "updated_at": g.updated_at,
                "member_count": len(members),
                "last_activity": last_activity,
                "sites_visited": sites_visited,
                "total_sites": total_sites,
                "next_place_code": next_place_code,
                "next_place_name": next_place_name,
                "featured": i == 0,
            }
        )

    return groups_out


def _build_featured_journeys(session: Session) -> list[dict]:
    featured_groups = session.exec(
        select(Group).where(Group.is_featured == True).order_by(Group.id).limit(20)  # noqa: E712
    ).all()
    if not featured_groups:
        return []

    featured_group_codes = [g.group_code for g in featured_groups]
    featured_members_bulk = groups_db.get_members_bulk(featured_group_codes, session)
    return [
        {
            "group_code": g.group_code,
            "name": g.name,
            "description": g.description,
            "cover_image_url": g.cover_image_url,
            "is_private": g.is_private,
            "path_place_codes": g.path_place_codes or [],
            "total_sites": len(g.path_place_codes or []),
            "member_count": len(featured_members_bulk.get(g.group_code, [])),
            "created_at": g.created_at,
        }
        for g in featured_groups
    ]


def _build_popular_places(
    session: Session,
    lat: float | None,
    lng: float | None,
    lang: str | None,
) -> list[dict]:
    rating_sub = (
        select(
            Review.place_code,
            func.avg(Review.rating).label("avg_rating"),
            func.count(Review.id).label("review_count"),
        )
        .where(Review.deleted_at == None)  # noqa: E711
        .group_by(Review.place_code)
        .subquery()
    )
    popular_stmt = (
        select(Place, rating_sub.c.avg_rating, rating_sub.c.review_count)
        .outerjoin(rating_sub, Place.place_code == rating_sub.c.place_code)
        .order_by(
            func.coalesce(rating_sub.c.avg_rating, 0).desc(),
            func.coalesce(rating_sub.c.review_count, 0).desc(),
            Place.id.asc(),
        )
        .limit(20)
    )
    popular_rows = session.exec(popular_stmt).all()
    popular_places = []
    popular_ratings: dict[str, dict] = {}
    for row in popular_rows:
        place, avg, cnt = row[0], row[1], row[2]
        popular_places.append(place)
        popular_ratings[place.place_code] = {
            "average": round(float(avg) * 10) / 10 if avg else 0.0,
            "count": cnt or 0,
        }

    popular_codes = [p.place_code for p in popular_places]
    popular_images = place_images.get_images_bulk(popular_codes, session)
    popular_trans: dict[str, dict[str, str]] = {}
    if lang and lang != "en":
        popular_trans = ct_db.bulk_get_translations("place", popular_codes, lang, session)

    popular_out = []
    for p in popular_places:
        dist = (
            _haversine_km(lat, lng, p.lat, p.lng) if lat is not None and lng is not None else None
        )
        popular_out.append(
            serialize_place_minimal(
                p,
                images=popular_images.get(p.place_code, []),
                distance=dist,
                rating=popular_ratings.get(p.place_code),
                translations=popular_trans.get(p.place_code),
            )
        )
    return popular_out


def _recommended_statement(
    user_code: str | None,
    religions: list[str] | None,
    lat: float | None,
    lng: float | None,
):
    rec_stmt = select(Place)
    valid_religions = [r for r in (religions or []) if r and r != "all"]
    if valid_religions:
        rec_stmt = rec_stmt.where(_or(*[Place.religion == r for r in valid_religions]))

    if user_code:
        checked_sub = select(CheckIn.place_code).where(
            CheckIn.user_code == user_code,
            CheckIn.deleted_at == None,  # noqa: E711
        )
        rec_stmt = rec_stmt.where(Place.place_code.notin_(checked_sub))

    if lat is not None and lng is not None:
        distance_expr = (Place.lat - lat) * (Place.lat - lat) + (Place.lng - lng) * (
            Place.lng - lng
        )
        rec_stmt = rec_stmt.where(Place.lat.is_not(None), Place.lng.is_not(None)).order_by(
            distance_expr.asc(), Place.id.asc()
        )
    else:
        rec_stmt = rec_stmt.order_by(Place.id.asc())

    return rec_stmt


def _build_recommended_places(
    session: Session,
    user_code: str | None,
    lat: float | None,
    lng: float | None,
    religions: list[str] | None,
    lang: str | None,
) -> list[dict]:
    rec_raw = session.exec(_recommended_statement(user_code, religions, lat, lng).limit(50)).all()
    rec_results = rec_raw[:10]
    rec_codes = [p.place_code for p in rec_results]
    rec_images = place_images.get_images_bulk(rec_codes, session)

    rec_trans: dict[str, dict[str, str]] = {}
    if lang and lang != "en":
        rec_trans = ct_db.bulk_get_translations("place", rec_codes, lang, session)

    rec_out = []
    for p in rec_results:
        dist = (
            _haversine_km(lat, lng, p.lat, p.lng) if lat is not None and lng is not None else None
        )
        rec_out.append(
            serialize_place_minimal(
                p,
                images=rec_images.get(p.place_code, []),
                distance=dist,
                translations=rec_trans.get(p.place_code),
            )
        )
    return rec_out


def _build_popular_cities(session: Session, lang: str | None) -> list[dict]:
    city_rows = session.exec(
        select(Place.city, func.count(Place.id).label("cnt"))
        .where(Place.city.is_not(None))
        .group_by(Place.city)
        .order_by(func.count(Place.id).desc())
        .limit(10)
    ).all()
    cities_out = []
    city_names_list = []
    for row in city_rows:
        city_name = row[0]
        cnt = row[1]
        slug = city_name.lower().replace(" ", "-") if city_name else ""
        city_names_list.append(city_name)
        cities_out.append({"city": city_name, "city_slug": slug, "count": cnt, "top_images": []})

    if city_names_list:
        city_place_codes: dict[str, list[str]] = {}
        for city_name in city_names_list:
            rows = session.exec(
                select(Place.place_code).where(Place.city == city_name).order_by(Place.id).limit(3)
            ).all()
            city_place_codes[city_name] = [r if isinstance(r, str) else r[0] for r in rows]

        all_city_codes = [pc for codes in city_place_codes.values() for pc in codes]
        city_place_images = (
            place_images.get_images_bulk(all_city_codes, session) if all_city_codes else {}
        )

        for city_item in cities_out:
            pcs = city_place_codes.get(city_item["city"], [])
            imgs: list[str] = []
            for pc in pcs:
                place_imgs = city_place_images.get(pc, [])
                if place_imgs and place_imgs[0].get("url"):
                    imgs.append(place_imgs[0]["url"])
                if len(imgs) >= 3:
                    break
            city_item["top_images"] = imgs

    if lang and lang != "en" and cities_out:
        city_objs_for_trans = session.exec(select(City).where(City.name.in_(city_names_list))).all()
        city_trans_map = {c.name: (c.translations or {}) for c in city_objs_for_trans}
        for city_item in cities_out:
            trans = city_trans_map.get(city_item["city"], {}).get(lang)
            if trans:
                city_item["city"] = trans

    return cities_out


def _build_public_homepage_sections(
    session: Session,
    lat: float | None,
    lng: float | None,
    lang: str | None,
) -> dict:
    return {
        "featured_journeys": _build_featured_journeys(session),
        "popular_places": _build_popular_places(session, lat, lng, lang),
        "popular_cities": _build_popular_cities(session, lang),
        "place_count": session.exec(select(func.count(Place.id))).one(),
    }


def _public_sections_cache_key(lat: float | None, lng: float | None, lang: str | None) -> tuple:
    return (_coord_key(lat), _coord_key(lng), lang or "en")


def _recommended_cache_key(
    lat: float | None,
    lng: float | None,
    religions: list[str] | None,
    lang: str | None,
) -> tuple:
    return (
        _coord_key(lat),
        _coord_key(lng),
        tuple(sorted(r for r in (religions or []) if r and r != "all")),
        lang or "en",
    )


@router.get("/homepage")
def get_homepage(
    request: Request,
    session: SessionDep,
    user: OptionalUserDep,
    lat: float | None = Query(None),
    lng: float | None = Query(None),
    religions: list[str] | None = Query(None),
    lang: str | None = Query(None),
):
    """Single composite endpoint returning all homepage data."""

    _t = get_tracer()

    def _mark(name: str, t0: float) -> None:
        if _t:
            _t._spans.append((name, round((_time.perf_counter() - t0) * 1000, 1)))

    bypass_cache = request.query_params.get("_trace") == "1"

    _s = _time.perf_counter()
    groups_out = _build_user_journeys(user.user_code if user else None, session)
    _mark("user_journeys", _s)

    _s = _time.perf_counter()
    public_key = _public_sections_cache_key(lat, lng, lang)
    public_sections = None if bypass_cache else _cache_get(_public_sections_cache, public_key)
    if public_sections is None:
        public_sections = jsonable_encoder(_build_public_homepage_sections(session, lat, lng, lang))
        if not bypass_cache:
            _cache_set(_public_sections_cache, public_key, public_sections)
        _mark("public_sections", _s)
    else:
        _mark("public_sections_cache_hit", _s)

    _s = _time.perf_counter()
    user_code = user.user_code if user else None
    rec_key = _recommended_cache_key(lat, lng, religions, lang)
    recommended_places = None
    if not user_code and not bypass_cache:
        recommended_places = _cache_get(_anonymous_recommended_cache, rec_key)
    if recommended_places is None:
        recommended_places = jsonable_encoder(
            _build_recommended_places(session, user_code, lat, lng, religions, lang)
        )
        if not user_code and not bypass_cache:
            _cache_set(_anonymous_recommended_cache, rec_key, recommended_places)
        _mark("recommended_places", _s)
    else:
        _mark("recommended_places_cache_hit", _s)

    result = {
        "groups": groups_out,
        "recommended_places": recommended_places,
        "featured_journeys": public_sections["featured_journeys"],
        "popular_places": public_sections["popular_places"],
        "popular_cities": public_sections["popular_cities"],
        "place_count": public_sections["place_count"],
    }

    cache_control = (
        "private, max-age=30, stale-while-revalidate=60"
        if user
        else "public, max-age=60, stale-while-revalidate=120"
    )
    return JSONResponse(content=jsonable_encoder(result), headers={"Cache-Control": cache_control})
