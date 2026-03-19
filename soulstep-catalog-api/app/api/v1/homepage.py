"""Composite homepage endpoint — returns all homepage data in a single request."""

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from sqlalchemy import or_ as _or
from sqlmodel import func, select

from app.api.deps import OptionalUserDep
from app.api.v1.place_serializers import serialize_place_minimal
from app.db import check_ins as check_ins_db
from app.db import content_translations as ct_db
from app.db import groups as groups_db
from app.db import place_images
from app.db import places as places_db
from app.db import reviews as reviews_db
from app.db.models import CheckIn, City, Group, Place, Review
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

            # Only fetch check-ins for places in the journey paths (bounded query)
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

    # ── Popular places (top-rated via SQL subquery) ────────────────────────────
    # Use a SQL subquery to compute average rating and sort in the database,
    # fetching only the top 20 instead of scanning 200 rows in Python.
    rating_sub = (
        select(
            Review.place_code,
            func.avg(Review.rating).label("avg_rating"),
        )
        .where(Review.deleted_at == None)  # noqa: E711
        .group_by(Review.place_code)
        .subquery()
    )
    popular_stmt = (
        select(Place, rating_sub.c.avg_rating)
        .outerjoin(rating_sub, Place.place_code == rating_sub.c.place_code)
        .order_by(func.coalesce(rating_sub.c.avg_rating, 0).desc())
        .limit(20)
    )
    popular_rows = session.exec(popular_stmt).all()
    popular_places = [row[0] if isinstance(row, tuple) else row.Place for row in popular_rows]
    popular_codes = [p.place_code for p in popular_places]
    popular_ratings = reviews_db.get_aggregate_ratings_bulk(popular_codes, session)
    popular_images = place_images.get_images_bulk(popular_codes, session)

    # Fetch translations for popular places
    popular_trans: dict[str, dict[str, str]] = {}
    if lang and lang != "en":
        popular_trans = ct_db.bulk_get_translations("place", popular_codes, lang, session)

    popular_out = []
    for p in popular_places:
        imgs = popular_images.get(p.place_code, [])
        dist = (
            _haversine_km(lat, lng, p.lat, p.lng) if lat is not None and lng is not None else None
        )
        popular_out.append(
            serialize_place_minimal(
                p,
                images=imgs,
                distance=dist,
                rating=popular_ratings.get(p.place_code),
                translations=popular_trans.get(p.place_code),
            )
        )

    # ── Recommended places ────────────────────────────────────────────────────
    rec_stmt = select(Place)
    valid_religions = [r for r in (religions or []) if r and r != "all"]
    if valid_religions:
        rec_stmt = rec_stmt.where(_or(*[Place.religion == r for r in valid_religions]))

    # Only exclude checked-in places using a SQL-level subquery (bounded)
    if user:
        checked_sub = (
            select(CheckIn.place_code)
            .where(
                CheckIn.user_code == user.user_code,
                CheckIn.deleted_at == None,  # noqa: E711
            )
            .distinct()
            .subquery()
        )
        rec_stmt = rec_stmt.where(Place.place_code.notin_(select(checked_sub)))

    # Limit to 50 candidates (enough for top 10 after distance sort)
    rec_raw = session.exec(rec_stmt.limit(50)).all()

    if lat is not None and lng is not None:
        rec_raw.sort(key=lambda p: _haversine_km(lat, lng, p.lat, p.lng))

    rec_results = rec_raw[:10]
    rec_codes = [p.place_code for p in rec_results]
    rec_images = place_images.get_images_bulk(rec_codes, session)

    # Fetch translations for recommended places
    rec_trans: dict[str, dict[str, str]] = {}
    if lang and lang != "en":
        rec_trans = ct_db.bulk_get_translations("place", rec_codes, lang, session)

    rec_out = []
    for p in rec_results:
        imgs = rec_images.get(p.place_code, [])
        dist = (
            _haversine_km(lat, lng, p.lat, p.lng) if lat is not None and lng is not None else None
        )
        rec_out.append(
            serialize_place_minimal(
                p, images=imgs, distance=dist, translations=rec_trans.get(p.place_code)
            )
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

    # Fetch top 3 place images per city — limit to 3 place codes per city
    if city_names_list:
        city_place_codes: dict[str, list[str]] = {}
        city_places_stmt = select(Place.city, Place.place_code).where(
            Place.city.in_(city_names_list)
        )
        city_place_rows = session.exec(city_places_stmt).all()
        for r in city_place_rows:
            c = r[0] if isinstance(r, tuple) else r.city
            pc = r[1] if isinstance(r, tuple) else r.place_code
            codes = city_place_codes.setdefault(c, [])
            if len(codes) < 3:  # Only need 3 per city
                codes.append(pc)

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

    result = {
        "groups": groups_out,
        "recommended_places": rec_out,
        "featured_journeys": featured_out,
        "popular_places": popular_out,
        "popular_cities": cities_out,
        "place_count": total_count,
    }

    return JSONResponse(
        content=result,
        headers={"Cache-Control": "public, max-age=60, stale-while-revalidate=120"},
    )
