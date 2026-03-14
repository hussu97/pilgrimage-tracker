"""Composite homepage endpoint — returns all homepage data in a single request."""

from fastapi import APIRouter, Query
from sqlalchemy import or_ as _or
from sqlmodel import func, select

from app.api.deps import OptionalUserDep
from app.db import check_ins as check_ins_db
from app.db import content_translations as ct_db
from app.db import groups as groups_db
from app.db import place_images
from app.db import places as places_db
from app.db import reviews as reviews_db
from app.db.models import City, Group, Place
from app.db.places import _haversine_km
from app.db.session import SessionDep

router = APIRouter()


@router.get("/homepage")
def get_homepage(
    session: SessionDep,
    user: OptionalUserDep,
    lat: float | None = Query(None),
    lng: float | None = Query(None),
    religions: list[str] | None = Query(None),
    lang: str | None = Query(None),
):
    """Single composite endpoint returning all homepage data.

    Returns groups (user's journeys), recommended_places, featured_journeys,
    popular_places, popular_cities, and place_count.
    """

    # ── User's journeys ─────────────────────────────────────────────────────────
    groups_out = []
    if user:
        group_list = groups_db.get_groups_for_user(user.user_code, session)
        if group_list:
            group_codes = [g.group_code for g in group_list]
            all_members = groups_db.get_members_bulk(group_codes, session)
            all_user_codes = {uc for members in all_members.values() for uc, _, _ in members}
            all_check_ins = check_ins_db.get_check_ins_for_users(list(all_user_codes), session)
            check_ins_by_user: dict[str, list] = {}
            for chk in all_check_ins:
                check_ins_by_user.setdefault(chk.user_code, []).append(chk)

            all_path_codes = {pc for g in group_list for pc in (g.path_place_codes or [])}
            path_places: dict[str, object] = {}
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
                    chk.place_code
                    for uc in member_user_codes
                    for chk in check_ins_by_user.get(uc, [])
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

    # ── Featured journeys ─────────────────────────────────────────────────────
    featured_groups = session.exec(
        select(Group).where(Group.is_featured == True).limit(20)  # noqa: E712
    ).all()
    featured_out = []
    if featured_groups:
        featured_group_codes = [g.group_code for g in featured_groups]
        featured_members_bulk = groups_db.get_members_bulk(featured_group_codes, session)
        for g in featured_groups:
            member_count = len(featured_members_bulk.get(g.group_code, []))
            featured_out.append(
                {
                    "group_code": g.group_code,
                    "name": g.name,
                    "description": g.description,
                    "cover_image_url": g.cover_image_url,
                    "is_private": g.is_private,
                    "path_place_codes": g.path_place_codes or [],
                    "total_sites": len(g.path_place_codes or []),
                    "member_count": member_count,
                    "created_at": g.created_at,
                }
            )

    # ── Popular places (top-rated) ─────────────────────────────────────────────
    popular_raw = session.exec(select(Place).limit(200)).all()
    popular_codes = [p.place_code for p in popular_raw]
    popular_ratings = reviews_db.get_aggregate_ratings_bulk(popular_codes, session)
    popular_images = place_images.get_images_bulk(popular_codes, session)

    def _avg(code: str) -> float:
        r = popular_ratings.get(code)
        return r["average"] if r else 0.0

    popular_sorted = sorted(popular_raw, key=lambda p: _avg(p.place_code), reverse=True)[:20]

    # Fetch translations for popular places
    popular_trans: dict[str, dict[str, str]] = {}
    if lang and lang != "en":
        popular_trans = ct_db.bulk_get_translations(
            "place", [p.place_code for p in popular_sorted], lang, session
        )

    popular_out = []
    for p in popular_sorted:
        imgs = popular_images.get(p.place_code, [])
        agg = popular_ratings.get(p.place_code)
        dist = None
        if lat is not None and lng is not None:
            dist = round(_haversine_km(lat, lng, p.lat, p.lng) * 10) / 10
        trans = popular_trans.get(p.place_code, {})
        popular_out.append(
            {
                "place_code": p.place_code,
                "name": trans.get("name", p.name),
                "religion": p.religion,
                "address": trans.get("address", p.address),
                "city": p.city,
                "lat": p.lat,
                "lng": p.lng,
                "images": [{"url": img["url"]} for img in imgs],
                "average_rating": agg["average"] if agg else None,
                "review_count": agg["count"] if agg else None,
                "distance": dist,
            }
        )

    # ── Recommended places ────────────────────────────────────────────────────
    rec_stmt = select(Place)
    valid_religions = [r for r in (religions or []) if r and r != "all"]
    if valid_religions:
        rec_stmt = rec_stmt.where(_or(*[Place.religion == r for r in valid_religions]))
    rec_raw = session.exec(rec_stmt.limit(200)).all()

    excluded: set[str] = set()
    if user:
        user_checkins = check_ins_db.get_check_ins_for_users([user.user_code], session)
        excluded = {c.place_code for c in user_checkins}

    rec_candidates = [p for p in rec_raw if p.place_code not in excluded]
    if lat is not None and lng is not None:
        rec_candidates.sort(key=lambda p: _haversine_km(lat, lng, p.lat, p.lng))

    rec_results = rec_candidates[:10]
    rec_codes = [p.place_code for p in rec_results]
    rec_images = place_images.get_images_bulk(rec_codes, session)

    # Fetch translations for recommended places
    rec_trans: dict[str, dict[str, str]] = {}
    if lang and lang != "en":
        rec_trans = ct_db.bulk_get_translations("place", rec_codes, lang, session)

    rec_out = []
    for p in rec_results:
        imgs = rec_images.get(p.place_code, [])
        img_url = imgs[0]["url"] if imgs else None
        dist = None
        if lat is not None and lng is not None:
            dist = round(_haversine_km(lat, lng, p.lat, p.lng) * 10) / 10
        trans = rec_trans.get(p.place_code, {})
        rec_out.append(
            {
                "place_code": p.place_code,
                "name": trans.get("name", p.name),
                "religion": p.religion,
                "address": trans.get("address", p.address),
                "city": p.city,
                "lat": p.lat,
                "lng": p.lng,
                "image_url": img_url,
                "distance_km": dist,
            }
        )

    # ── Popular cities ─────────────────────────────────────────────────────────
    city_stmt = (
        select(Place.city, func.count(Place.id).label("cnt"))
        .where(Place.city.is_not(None))
        .group_by(Place.city)
        .order_by(func.count(Place.id).desc())
        .limit(10)
    )
    city_rows = session.exec(city_stmt).all()
    cities_out = []
    city_names_list = []
    for row in city_rows:
        city_name = row[0] if isinstance(row, tuple) else row.city
        cnt = row[1] if isinstance(row, tuple) else row.cnt
        slug = city_name.lower().replace(" ", "-") if city_name else ""
        city_names_list.append(city_name)
        cities_out.append({"city": city_name, "city_slug": slug, "count": cnt, "top_images": []})

    # Fetch top 3 place images per city for the collage display
    if city_names_list:
        city_places_stmt = (
            select(Place.city, Place.place_code).where(Place.city.in_(city_names_list)).limit(300)
        )
        city_place_rows = session.exec(city_places_stmt).all()
        city_place_codes: dict[str, list[str]] = {}
        for r in city_place_rows:
            c = r[0] if isinstance(r, tuple) else r.city
            pc = r[1] if isinstance(r, tuple) else r.place_code
            city_place_codes.setdefault(c, []).append(pc)

        all_city_codes = [pc for codes in city_place_codes.values() for pc in codes]
        city_place_images = place_images.get_images_bulk(all_city_codes, session)

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

    # Overlay translated city names
    if lang and lang != "en" and cities_out:
        city_objs_for_trans = session.exec(select(City).where(City.name.in_(city_names_list))).all()
        city_trans_map = {c.name: (c.translations or {}) for c in city_objs_for_trans}
        for city_item in cities_out:
            trans = city_trans_map.get(city_item["city"], {}).get(lang)
            if trans:
                city_item["city"] = trans

    # ── Place count ────────────────────────────────────────────────────────────
    total_count = session.exec(select(func.count(Place.id))).one()

    return {
        "groups": groups_out,
        "recommended_places": rec_out,
        "featured_journeys": featured_out,
        "popular_places": popular_out,
        "popular_cities": cities_out,
        "place_count": total_count,
    }
