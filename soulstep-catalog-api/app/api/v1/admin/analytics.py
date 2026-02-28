"""Admin — Analytics query endpoints."""

from collections import defaultdict
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlmodel import col, func, select

from app.api.deps import AdminDep
from app.db.models import AnalyticsEvent, Place
from app.db.session import SessionDep

router = APIRouter()


# ── Schemas ─────────────────────────────────────────────────────────────────


class EventTypeCount(BaseModel):
    event_type: str
    count: int


class PlatformCount(BaseModel):
    platform: str
    count: int


class AnalyticsOverview(BaseModel):
    total_events: int
    total_events_24h: int
    total_events_7d: int
    unique_users: int
    unique_visitors: int
    unique_sessions: int
    top_event_types: list[EventTypeCount]
    platform_breakdown: list[PlatformCount]


class AnalyticsTopPlace(BaseModel):
    place_code: str
    place_name: str
    religion: str
    view_count: int
    interaction_count: int


class AnalyticsTrendPoint(BaseModel):
    period: str
    count: int


class AnalyticsEventListItem(BaseModel):
    event_code: str
    event_type: str
    user_code: str | None
    visitor_code: str | None
    session_id: str
    properties: dict[str, Any] | None
    platform: str
    device_type: str | None
    app_version: str | None
    client_timestamp: datetime
    created_at: datetime


class AnalyticsEventListResponse(BaseModel):
    items: list[AnalyticsEventListItem]
    total: int
    page: int
    page_size: int


# ── Helpers ──────────────────────────────────────────────────────────────────


def _period_cutoff(period: str) -> datetime:
    now = datetime.now(UTC)
    if period == "24h":
        return now - timedelta(hours=24)
    elif period == "7d":
        return now - timedelta(days=7)
    elif period == "30d":
        return now - timedelta(days=30)
    elif period == "90d":
        return now - timedelta(days=90)
    else:
        return now - timedelta(days=7)


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.get("/analytics/overview", response_model=AnalyticsOverview)
def get_analytics_overview(admin: AdminDep, session: SessionDep):
    """Return high-level analytics statistics."""
    now = datetime.now(UTC)
    cutoff_24h = now - timedelta(hours=24)
    cutoff_7d = now - timedelta(days=7)

    total_events = session.exec(select(func.count()).select_from(AnalyticsEvent)).one()
    total_events_24h = session.exec(
        select(func.count())
        .select_from(AnalyticsEvent)
        .where(col(AnalyticsEvent.created_at) >= cutoff_24h)
    ).one()
    total_events_7d = session.exec(
        select(func.count())
        .select_from(AnalyticsEvent)
        .where(col(AnalyticsEvent.created_at) >= cutoff_7d)
    ).one()

    # Unique authenticated users
    user_codes = session.exec(
        select(AnalyticsEvent.user_code)
        .where(col(AnalyticsEvent.user_code) != None)  # noqa: E711
        .distinct()
    ).all()
    unique_users = len(user_codes)

    # Unique anonymous visitors
    visitor_codes = session.exec(
        select(AnalyticsEvent.visitor_code)
        .where(col(AnalyticsEvent.visitor_code) != None)  # noqa: E711
        .distinct()
    ).all()
    unique_visitors = len(visitor_codes)

    # Unique sessions
    session_ids = session.exec(select(AnalyticsEvent.session_id).distinct()).all()
    unique_sessions = len(session_ids)

    # Top event types
    all_event_types = session.exec(select(AnalyticsEvent.event_type)).all()
    type_counts: dict[str, int] = defaultdict(int)
    for et in all_event_types:
        type_counts[et] += 1
    top_event_types = [
        EventTypeCount(event_type=k, count=v)
        for k, v in sorted(type_counts.items(), key=lambda x: x[1], reverse=True)
    ]

    # Platform breakdown
    all_platforms = session.exec(select(AnalyticsEvent.platform)).all()
    platform_counts: dict[str, int] = defaultdict(int)
    for p in all_platforms:
        platform_counts[p] += 1
    platform_breakdown = [
        PlatformCount(platform=k, count=v)
        for k, v in sorted(platform_counts.items(), key=lambda x: x[1], reverse=True)
    ]

    return AnalyticsOverview(
        total_events=total_events,
        total_events_24h=total_events_24h,
        total_events_7d=total_events_7d,
        unique_users=unique_users,
        unique_visitors=unique_visitors,
        unique_sessions=unique_sessions,
        top_event_types=top_event_types,
        platform_breakdown=platform_breakdown,
    )


@router.get("/analytics/top-places", response_model=list[AnalyticsTopPlace])
def get_analytics_top_places(
    admin: AdminDep,
    session: SessionDep,
    period: Annotated[str, Query(pattern="^(24h|7d|30d|90d)$")] = "7d",
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
):
    """Return top places by analytics event frequency."""
    cutoff = _period_cutoff(period)

    events = session.exec(
        select(AnalyticsEvent)
        .where(col(AnalyticsEvent.created_at) >= cutoff)
        .where(
            col(AnalyticsEvent.event_type).in_(
                ["place_view", "check_in", "favorite_toggle", "review_submit", "share"]
            )
        )
    ).all()

    # Extract place_code from properties in Python (SQLite JSON compat)
    view_counts: dict[str, int] = defaultdict(int)
    interaction_counts: dict[str, int] = defaultdict(int)
    for ev in events:
        props = ev.properties or {}
        place_code = props.get("place_code")
        if not place_code:
            continue
        if ev.event_type == "place_view":
            view_counts[place_code] += 1
        else:
            interaction_counts[place_code] += 1

    all_place_codes = set(view_counts) | set(interaction_counts)
    if not all_place_codes:
        return []

    places = session.exec(
        select(Place).where(col(Place.place_code).in_(list(all_place_codes)))
    ).all()
    places_map = {p.place_code: p for p in places}

    result: list[AnalyticsTopPlace] = []
    for place_code in all_place_codes:
        place = places_map.get(place_code)
        if not place:
            continue
        result.append(
            AnalyticsTopPlace(
                place_code=place_code,
                place_name=place.name,
                religion=place.religion,
                view_count=view_counts[place_code],
                interaction_count=interaction_counts[place_code],
            )
        )

    result.sort(key=lambda x: x.view_count + x.interaction_count, reverse=True)
    return result[:limit]


@router.get("/analytics/trends", response_model=list[AnalyticsTrendPoint])
def get_analytics_trends(
    admin: AdminDep,
    session: SessionDep,
    interval: Annotated[str, Query(pattern="^(day|week|month)$")] = "day",
    event_type: str | None = Query(default=None),
    period: Annotated[str, Query(pattern="^(7d|30d|90d|365d)$")] = "30d",
):
    """Return event count trends grouped by time interval."""
    now = datetime.now(UTC)
    days_map = {"7d": 7, "30d": 30, "90d": 90, "365d": 365}
    days = days_map[period]
    cutoff = now - timedelta(days=days)

    stmt = select(AnalyticsEvent.created_at).where(col(AnalyticsEvent.created_at) >= cutoff)
    if event_type:
        stmt = stmt.where(AnalyticsEvent.event_type == event_type)

    timestamps = session.exec(stmt).all()

    counts: dict[str, int] = defaultdict(int)
    for ts in timestamps:
        if interval == "day":
            key = ts.strftime("%Y-%m-%d")
        elif interval == "week":
            key = ts.strftime("%Y-W%W")
        else:
            key = ts.strftime("%Y-%m")
        counts[key] += 1

    result: list[AnalyticsTrendPoint] = []
    if interval == "day":
        for i in range(days):
            day = (now - timedelta(days=days - 1 - i)).strftime("%Y-%m-%d")
            result.append(AnalyticsTrendPoint(period=day, count=counts[day]))
    elif interval == "week":
        weeks = max(1, days // 7)
        for i in range(weeks):
            week_dt = now - timedelta(weeks=weeks - 1 - i)
            week = week_dt.strftime("%Y-W%W")
            result.append(AnalyticsTrendPoint(period=week, count=counts[week]))
    else:
        months = max(1, days // 30)
        for i in range(months):
            month_num = now.month - months + 1 + i
            year = now.year + (month_num - 1) // 12
            month = ((month_num - 1) % 12) + 1
            key = f"{year}-{month:02d}"
            result.append(AnalyticsTrendPoint(period=key, count=counts[key]))

    return result


@router.get("/analytics/events", response_model=AnalyticsEventListResponse)
def get_analytics_events(
    admin: AdminDep,
    session: SessionDep,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=2000)] = 50,
    event_type: str | None = Query(default=None),
    platform: str | None = Query(default=None),
    user_code: str | None = Query(default=None),
    session_id: str | None = Query(default=None),
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
):
    """Return paginated list of raw analytics events with optional filters."""
    stmt = select(AnalyticsEvent)
    count_stmt = select(func.count()).select_from(AnalyticsEvent)

    filters = []
    if event_type:
        filters.append(AnalyticsEvent.event_type == event_type)
    if platform:
        filters.append(AnalyticsEvent.platform == platform)
    if user_code:
        filters.append(AnalyticsEvent.user_code == user_code)
    if session_id:
        filters.append(AnalyticsEvent.session_id == session_id)
    if date_from:
        filters.append(col(AnalyticsEvent.created_at) >= date_from)
    if date_to:
        filters.append(col(AnalyticsEvent.created_at) <= date_to)

    for f in filters:
        stmt = stmt.where(f)
        count_stmt = count_stmt.where(f)

    total = session.exec(count_stmt).one()
    offset = (page - 1) * page_size
    events = session.exec(
        stmt.order_by(col(AnalyticsEvent.created_at).desc()).offset(offset).limit(page_size)
    ).all()

    items = [
        AnalyticsEventListItem(
            event_code=e.event_code,
            event_type=e.event_type,
            user_code=e.user_code,
            visitor_code=e.visitor_code,
            session_id=e.session_id,
            properties=e.properties,
            platform=e.platform,
            device_type=e.device_type,
            app_version=e.app_version,
            client_timestamp=e.client_timestamp,
            created_at=e.created_at,
        )
        for e in events
    ]

    return AnalyticsEventListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )
