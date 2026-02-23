"""Admin — Dashboard statistics endpoints."""

from collections import Counter, defaultdict
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlmodel import col, func, select

from app.api.deps import AdminDep
from app.db.models import CheckIn, Group, GroupMember, Place, Review, User
from app.db.session import SessionDep

router = APIRouter()


# ── Schemas ────────────────────────────────────────────────────────────────────


class OverviewStats(BaseModel):
    total_users: int
    total_places: int
    total_reviews: int
    total_check_ins: int
    total_groups: int
    active_users_30d: int


class GrowthDataPoint(BaseModel):
    period: str
    count: int


class PopularPlace(BaseModel):
    place_code: str
    name: str
    religion: str
    check_in_count: int
    review_count: int
    avg_rating: float | None


class ReligionBreakdownItem(BaseModel):
    religion: str
    place_count: int
    check_in_count: int


class RecentActivityItem(BaseModel):
    type: str  # "check_in" | "review" | "group_join"
    user_code: str | None
    user_display_name: str | None
    place_code: str | None
    place_name: str | None
    group_code: str | None
    group_name: str | None
    timestamp: datetime


class ReviewStats(BaseModel):
    rating_histogram: dict[str, int]
    flagged_count: int
    avg_rating: float | None
    total_reviews: int


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("/stats/overview", response_model=OverviewStats)
def get_overview_stats(admin: AdminDep, session: SessionDep):
    total_users = session.exec(select(func.count()).select_from(User)).one()
    total_places = session.exec(select(func.count()).select_from(Place)).one()
    total_reviews = session.exec(select(func.count()).select_from(Review)).one()
    total_check_ins = session.exec(select(func.count()).select_from(CheckIn)).one()
    total_groups = session.exec(select(func.count()).select_from(Group)).one()

    cutoff_30d = datetime.now(UTC) - timedelta(days=30)
    active_user_codes = session.exec(
        select(CheckIn.user_code).where(col(CheckIn.checked_in_at) >= cutoff_30d).distinct()
    ).all()

    return OverviewStats(
        total_users=total_users,
        total_places=total_places,
        total_reviews=total_reviews,
        total_check_ins=total_check_ins,
        total_groups=total_groups,
        active_users_30d=len(active_user_codes),
    )


@router.get("/stats/user-growth", response_model=list[GrowthDataPoint])
def get_user_growth(
    admin: AdminDep,
    session: SessionDep,
    interval: Annotated[str, Query(pattern="^(day|week|month)$")] = "day",
):
    now = datetime.now(UTC)
    if interval == "day":
        cutoff = now - timedelta(days=30)
    elif interval == "week":
        cutoff = now - timedelta(weeks=12)
    else:  # month
        cutoff = now - timedelta(days=365)

    created_ats = session.exec(select(User.created_at).where(col(User.created_at) >= cutoff)).all()

    counts: dict[str, int] = defaultdict(int)
    for dt in created_ats:
        if interval == "day":
            key = dt.strftime("%Y-%m-%d")
        elif interval == "week":
            key = dt.strftime("%Y-W%W")
        else:
            key = dt.strftime("%Y-%m")
        counts[key] += 1

    result: list[GrowthDataPoint] = []
    if interval == "day":
        for i in range(30):
            day = (now - timedelta(days=29 - i)).strftime("%Y-%m-%d")
            result.append(GrowthDataPoint(period=day, count=counts[day]))
    elif interval == "week":
        for i in range(12):
            week_dt = now - timedelta(weeks=11 - i)
            week = week_dt.strftime("%Y-W%W")
            result.append(GrowthDataPoint(period=week, count=counts[week]))
    else:
        for i in range(12):
            month_num = now.month - 11 + i
            year = now.year + (month_num - 1) // 12
            month = ((month_num - 1) % 12) + 1
            key = f"{year}-{month:02d}"
            result.append(GrowthDataPoint(period=key, count=counts[key]))

    return result


@router.get("/stats/popular-places", response_model=list[PopularPlace])
def get_popular_places(admin: AdminDep, session: SessionDep):
    places = session.exec(select(Place)).all()
    if not places:
        return []

    place_codes = [p.place_code for p in places]

    # Batch-fetch check-in place_codes (scalar select)
    ci_place_codes: list[str] = session.exec(
        select(CheckIn.place_code).where(col(CheckIn.place_code).in_(place_codes))
    ).all()
    ci_counts: Counter[str] = Counter(ci_place_codes)

    # Batch-fetch reviews and aggregate in Python
    all_reviews = session.exec(select(Review).where(col(Review.place_code).in_(place_codes))).all()
    rv_counts: Counter[str] = Counter(r.place_code for r in all_reviews)
    rv_sums: dict[str, float] = defaultdict(float)
    for r in all_reviews:
        rv_sums[r.place_code] += r.rating

    result: list[PopularPlace] = []
    for p in places:
        rc = rv_counts[p.place_code]
        avg = round(rv_sums[p.place_code] / rc, 2) if rc > 0 else None
        result.append(
            PopularPlace(
                place_code=p.place_code,
                name=p.name,
                religion=p.religion,
                check_in_count=ci_counts[p.place_code],
                review_count=rc,
                avg_rating=avg,
            )
        )

    result.sort(key=lambda x: x.check_in_count, reverse=True)
    return result[:20]


@router.get("/stats/religion-breakdown", response_model=list[ReligionBreakdownItem])
def get_religion_breakdown(admin: AdminDep, session: SessionDep):
    religions: list[str] = session.exec(select(Place.religion).distinct()).all()

    result: list[ReligionBreakdownItem] = []
    for religion in religions:
        place_count = session.exec(
            select(func.count()).select_from(Place).where(Place.religion == religion)
        ).one()
        place_codes_for_religion: list[str] = session.exec(
            select(Place.place_code).where(Place.religion == religion)
        ).all()
        check_in_count = session.exec(
            select(func.count())
            .select_from(CheckIn)
            .where(col(CheckIn.place_code).in_(place_codes_for_religion))
        ).one()
        result.append(
            ReligionBreakdownItem(
                religion=religion,
                place_count=place_count,
                check_in_count=check_in_count,
            )
        )

    return sorted(result, key=lambda r: r.place_count, reverse=True)


@router.get("/stats/recent-activity", response_model=list[RecentActivityItem])
def get_recent_activity(admin: AdminDep, session: SessionDep):
    activities: list[RecentActivityItem] = []

    # ── Check-ins ────────────────────────────────────────────────────────────
    check_ins = session.exec(
        select(CheckIn).order_by(col(CheckIn.checked_in_at).desc()).limit(50)
    ).all()
    if check_ins:
        ci_user_codes = list({ci.user_code for ci in check_ins})
        ci_place_codes = list({ci.place_code for ci in check_ins})
        users_map = {
            u.user_code: u
            for u in session.exec(select(User).where(col(User.user_code).in_(ci_user_codes))).all()
        }
        places_map = {
            p.place_code: p
            for p in session.exec(
                select(Place).where(col(Place.place_code).in_(ci_place_codes))
            ).all()
        }
        for ci in check_ins:
            user = users_map.get(ci.user_code)
            place = places_map.get(ci.place_code)
            activities.append(
                RecentActivityItem(
                    type="check_in",
                    user_code=ci.user_code,
                    user_display_name=user.display_name if user else None,
                    place_code=ci.place_code,
                    place_name=place.name if place else None,
                    group_code=ci.group_code,
                    group_name=None,
                    timestamp=ci.checked_in_at,
                )
            )

    # ── Reviews ──────────────────────────────────────────────────────────────
    reviews = session.exec(
        select(Review)
        .where(Review.user_code != None)  # noqa: E711
        .order_by(col(Review.created_at).desc())
        .limit(50)
    ).all()
    if reviews:
        rv_user_codes = list({r.user_code for r in reviews if r.user_code})
        rv_place_codes = list({r.place_code for r in reviews})
        rv_users_map = {
            u.user_code: u
            for u in session.exec(select(User).where(col(User.user_code).in_(rv_user_codes))).all()
        }
        rv_places_map = {
            p.place_code: p
            for p in session.exec(
                select(Place).where(col(Place.place_code).in_(rv_place_codes))
            ).all()
        }
        for r in reviews:
            user = rv_users_map.get(r.user_code) if r.user_code else None
            place = rv_places_map.get(r.place_code)
            activities.append(
                RecentActivityItem(
                    type="review",
                    user_code=r.user_code,
                    user_display_name=user.display_name if user else None,
                    place_code=r.place_code,
                    place_name=place.name if place else None,
                    group_code=None,
                    group_name=None,
                    timestamp=r.created_at,
                )
            )

    # ── Group joins ──────────────────────────────────────────────────────────
    group_joins = session.exec(
        select(GroupMember).order_by(col(GroupMember.joined_at).desc()).limit(50)
    ).all()
    if group_joins:
        gj_user_codes = list({gm.user_code for gm in group_joins})
        gj_group_codes = list({gm.group_code for gm in group_joins})
        gj_users_map = {
            u.user_code: u
            for u in session.exec(select(User).where(col(User.user_code).in_(gj_user_codes))).all()
        }
        gj_groups_map = {
            g.group_code: g
            for g in session.exec(
                select(Group).where(col(Group.group_code).in_(gj_group_codes))
            ).all()
        }
        for gm in group_joins:
            user = gj_users_map.get(gm.user_code)
            group = gj_groups_map.get(gm.group_code)
            activities.append(
                RecentActivityItem(
                    type="group_join",
                    user_code=gm.user_code,
                    user_display_name=user.display_name if user else None,
                    place_code=None,
                    place_name=None,
                    group_code=gm.group_code,
                    group_name=group.name if group else None,
                    timestamp=gm.joined_at,
                )
            )

    activities.sort(key=lambda a: a.timestamp, reverse=True)
    return activities[:50]


@router.get("/stats/review-stats", response_model=ReviewStats)
def get_review_stats(admin: AdminDep, session: SessionDep):
    total_reviews = session.exec(select(func.count()).select_from(Review)).one()
    flagged_count = session.exec(
        select(func.count()).select_from(Review).where(Review.is_flagged == True)  # noqa: E712
    ).one()
    avg_raw = session.exec(select(func.avg(Review.rating))).one()

    histogram: dict[str, int] = {}
    for rating in range(1, 6):
        count = session.exec(
            select(func.count()).select_from(Review).where(Review.rating == rating)
        ).one()
        histogram[str(rating)] = count

    return ReviewStats(
        rating_histogram=histogram,
        flagged_count=flagged_count,
        avg_rating=round(float(avg_raw), 2) if avg_raw is not None else None,
        total_reviews=total_reviews,
    )
