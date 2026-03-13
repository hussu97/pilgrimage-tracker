"""Admin — SEO management endpoints.

Provides visibility into SEO coverage, missing content, and generation status
across the place catalogue. Supports bulk generation and per-place editing.

Routes:
    GET  /admin/seo/stats                     — Health metrics
    GET  /admin/seo/places                    — Paginated list with SEO coverage
    GET  /admin/seo/places/{place_code}       — SEO detail for one place
    PATCH /admin/seo/places/{place_code}      — Update SEO content (manual edit)
    POST /admin/seo/generate                  — Bulk trigger SEO generation
    POST /admin/seo/places/{place_code}/generate — Regenerate single place SEO
"""

from __future__ import annotations

import logging
from collections import Counter
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import func, select

from app.api.deps import AdminDep
from app.db import places as places_db
from app.db import reviews as reviews_db
from app.db.models import AICrawlerLog, ContentTranslation, Place, PlaceSEO
from app.db.session import SessionDep
from app.services import seo_generator

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Pydantic schemas ───────────────────────────────────────────────────────────


_PRICE_PER_MILLION_CHARS = 20.0


class SEOStats(BaseModel):
    total_places: int
    places_with_seo: int
    places_missing_seo: int
    places_manually_edited: int
    coverage_pct: float
    translation_chars: int
    translation_cost_usd: float


class SEOListItem(BaseModel):
    place_code: str
    name: str
    religion: str
    place_type: str
    has_seo: bool
    slug: str | None
    seo_title: str | None
    meta_description: str | None
    is_manually_edited: bool
    generated_at: datetime | None
    updated_at: datetime | None


class SEOListResponse(BaseModel):
    items: list[SEOListItem]
    total: int
    page: int
    page_size: int


class SEODetail(BaseModel):
    place_code: str
    name: str
    religion: str
    place_type: str
    address: str
    slug: str | None
    seo_title: str | None
    meta_description: str | None
    rich_description: str | None
    faq_json: list[dict[str, Any]] | None
    og_image_url: str | None
    is_manually_edited: bool
    generated_at: datetime | None
    updated_at: datetime | None


class PatchSEOBody(BaseModel):
    slug: str | None = None
    seo_title: str | None = None
    meta_description: str | None = None
    rich_description: str | None = None
    faq_json: list[dict[str, Any]] | None = None
    og_image_url: str | None = None
    is_manually_edited: bool | None = None


class BulkGenerateBody(BaseModel):
    force: bool = False  # If True, overwrite manually-edited records
    limit: int | None = None  # Max places to process (None = all)


class GenerateResponse(BaseModel):
    generated: int
    skipped: int
    errors: int


# ── Helpers ────────────────────────────────────────────────────────────────────


def _get_place_or_404(place_code: str, session) -> Place:
    place = places_db.get_place_by_code(place_code, session)
    if place is None:
        raise HTTPException(status_code=404, detail="Place not found")
    return place


def _get_seo(place_code: str, session) -> PlaceSEO | None:
    return session.exec(select(PlaceSEO).where(PlaceSEO.place_code == place_code)).first()


# ── Endpoints ──────────────────────────────────────────────────────────────────


@router.get("/seo/stats", response_model=SEOStats, tags=["admin-seo"])
def get_seo_stats(admin: AdminDep, session: SessionDep) -> SEOStats:
    """Return aggregated SEO health metrics."""
    total = session.exec(select(func.count(Place.id))).one()
    with_seo = session.exec(select(func.count(PlaceSEO.id))).one()
    manually_edited = session.exec(
        select(func.count(PlaceSEO.id)).where(PlaceSEO.is_manually_edited.is_(True))
    ).one()

    translation_chars: int = session.exec(
        select(func.coalesce(func.sum(func.length(ContentTranslation.translated_text)), 0)).where(
            ContentTranslation.entity_type == "place_seo"
        )
    ).one()

    missing = total - with_seo
    coverage = round((with_seo / total * 100) if total > 0 else 0.0, 1)
    translation_cost = round(translation_chars / 1_000_000 * _PRICE_PER_MILLION_CHARS, 4)

    return SEOStats(
        total_places=total,
        places_with_seo=with_seo,
        places_missing_seo=missing,
        places_manually_edited=manually_edited,
        coverage_pct=coverage,
        translation_chars=translation_chars,
        translation_cost_usd=translation_cost,
    )


@router.get("/seo/places", response_model=SEOListResponse, tags=["admin-seo"])
def list_seo_places(
    admin: AdminDep,
    session: SessionDep,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=2000)] = 50,
    religion: str | None = None,
    missing_only: bool = False,
    manually_edited: bool | None = None,
    search: str | None = None,
) -> SEOListResponse:
    """List all places with SEO coverage information.

    Query params:
    - missing_only=true  — only places without SEO content
    - manually_edited=true/false — filter by edit status
    - religion — filter by religion
    - search — filter by place name
    """
    stmt = select(Place)
    if religion:
        stmt = stmt.where(Place.religion == religion)
    if search:
        stmt = stmt.where(Place.name.ilike(f"%{search}%"))

    all_places = session.exec(stmt).all()

    # Build SEO lookup
    place_codes = [p.place_code for p in all_places]
    seo_rows = session.exec(select(PlaceSEO).where(PlaceSEO.place_code.in_(place_codes))).all()
    seo_map: dict[str, PlaceSEO] = {s.place_code: s for s in seo_rows}

    # Filter by SEO presence / edit status
    results: list[tuple[Place, PlaceSEO | None]] = []
    for p in all_places:
        seo = seo_map.get(p.place_code)
        if missing_only and seo is not None:
            continue
        if manually_edited is True and (seo is None or not seo.is_manually_edited):
            continue
        if manually_edited is False and seo is not None and seo.is_manually_edited:
            continue
        results.append((p, seo))

    total = len(results)
    offset = (page - 1) * page_size
    page_results = results[offset : offset + page_size]

    items = [
        SEOListItem(
            place_code=p.place_code,
            name=p.name,
            religion=p.religion,
            place_type=p.place_type,
            has_seo=seo is not None,
            slug=seo.slug if seo else None,
            seo_title=seo.seo_title if seo else None,
            meta_description=seo.meta_description if seo else None,
            is_manually_edited=seo.is_manually_edited if seo else False,
            generated_at=seo.generated_at if seo else None,
            updated_at=seo.updated_at if seo else None,
        )
        for p, seo in page_results
    ]

    return SEOListResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("/seo/places/{place_code}", response_model=SEODetail, tags=["admin-seo"])
def get_seo_detail(
    place_code: str,
    admin: AdminDep,
    session: SessionDep,
) -> SEODetail:
    """Return full SEO metadata for a single place."""
    place = _get_place_or_404(place_code, session)
    seo = _get_seo(place_code, session)

    return SEODetail(
        place_code=place.place_code,
        name=place.name,
        religion=place.religion,
        place_type=place.place_type,
        address=place.address,
        slug=seo.slug if seo else None,
        seo_title=seo.seo_title if seo else None,
        meta_description=seo.meta_description if seo else None,
        rich_description=seo.rich_description if seo else None,
        faq_json=seo.faq_json if seo else None,
        og_image_url=seo.og_image_url if seo else None,
        is_manually_edited=seo.is_manually_edited if seo else False,
        generated_at=seo.generated_at if seo else None,
        updated_at=seo.updated_at if seo else None,
    )


@router.patch("/seo/places/{place_code}", response_model=SEODetail, tags=["admin-seo"])
def patch_seo(
    place_code: str,
    body: PatchSEOBody,
    admin: AdminDep,
    session: SessionDep,
) -> SEODetail:
    """Update SEO content for a place. Sets is_manually_edited=True."""
    place = _get_place_or_404(place_code, session)
    seo = _get_seo(place_code, session)

    if seo is None:
        # Auto-generate first, then apply the patch
        rating_data = reviews_db.get_aggregate_rating(place_code, session)
        seo = seo_generator.upsert_place_seo(place, session, rating_data=rating_data)

    now = datetime.now(UTC)
    if body.slug is not None:
        # Validate uniqueness
        conflict = session.exec(
            select(PlaceSEO).where(PlaceSEO.slug == body.slug, PlaceSEO.place_code != place_code)
        ).first()
        if conflict:
            raise HTTPException(
                status_code=409,
                detail=f"Slug '{body.slug}' is already in use by place {conflict.place_code}",
            )
        seo.slug = body.slug
    if body.seo_title is not None:
        seo.seo_title = body.seo_title
    if body.meta_description is not None:
        seo.meta_description = body.meta_description
    if body.rich_description is not None:
        seo.rich_description = body.rich_description
    if body.faq_json is not None:
        seo.faq_json = body.faq_json
    if body.og_image_url is not None:
        seo.og_image_url = body.og_image_url
    if body.is_manually_edited is not None:
        seo.is_manually_edited = body.is_manually_edited
    else:
        seo.is_manually_edited = True  # Any manual patch marks as edited

    seo.updated_at = now
    session.add(seo)
    session.commit()
    session.refresh(seo)

    logger.info("Admin %s patched SEO for %s", admin.user_code, place_code)

    return SEODetail(
        place_code=place.place_code,
        name=place.name,
        religion=place.religion,
        place_type=place.place_type,
        address=place.address,
        slug=seo.slug,
        seo_title=seo.seo_title,
        meta_description=seo.meta_description,
        rich_description=seo.rich_description,
        faq_json=seo.faq_json,
        og_image_url=seo.og_image_url,
        is_manually_edited=seo.is_manually_edited,
        generated_at=seo.generated_at,
        updated_at=seo.updated_at,
    )


@router.post(
    "/seo/places/{place_code}/generate",
    response_model=SEODetail,
    tags=["admin-seo"],
)
def regenerate_single(
    place_code: str,
    admin: AdminDep,
    session: SessionDep,
    force: bool = False,
) -> SEODetail:
    """Regenerate SEO content for a single place.

    Pass `force=true` to overwrite manually-edited content.
    """
    place = _get_place_or_404(place_code, session)
    rating_data = reviews_db.get_aggregate_rating(place_code, session)

    seo = seo_generator.upsert_place_seo(
        place=place,
        session=session,
        rating_data=rating_data,
        force=force,
    )

    logger.info("Admin %s regenerated SEO for %s", admin.user_code, place_code)

    return SEODetail(
        place_code=place.place_code,
        name=place.name,
        religion=place.religion,
        place_type=place.place_type,
        address=place.address,
        slug=seo.slug,
        seo_title=seo.seo_title,
        meta_description=seo.meta_description,
        rich_description=seo.rich_description,
        faq_json=seo.faq_json,
        og_image_url=seo.og_image_url,
        is_manually_edited=seo.is_manually_edited,
        generated_at=seo.generated_at,
        updated_at=seo.updated_at,
    )


@router.post("/seo/generate", response_model=GenerateResponse, tags=["admin-seo"])
def bulk_generate_seo(
    body: BulkGenerateBody,
    admin: AdminDep,
    session: SessionDep,
) -> GenerateResponse:
    """Bulk-generate SEO content for all places missing it.

    This runs synchronously. For large catalogues consider running via the
    background script instead: `python scripts/generate_seo.py`.

    - force=true overwrites manually-edited records
    - limit=N processes at most N places
    """
    stmt = select(Place)
    places = session.exec(stmt).all()

    if not body.force:
        # Only process places without SEO (or with auto-generated SEO)
        seo_rows = session.exec(select(PlaceSEO)).all()
        manually_edited_codes = {s.place_code for s in seo_rows if s.is_manually_edited}
        places = [p for p in places if p.place_code not in manually_edited_codes]

    if body.limit is not None:
        places = places[: body.limit]

    generated = 0
    skipped = 0
    errors = 0

    for place in places:
        try:
            rating_data = reviews_db.get_aggregate_rating(place.place_code, session)
            seo_generator.upsert_place_seo(
                place=place,
                session=session,
                rating_data=rating_data,
                force=body.force,
            )
            generated += 1
        except Exception as exc:
            logger.error("SEO generation failed for %s: %s", place.place_code, exc)
            errors += 1

    logger.info(
        "Admin %s bulk SEO: generated=%d skipped=%d errors=%d",
        admin.user_code,
        generated,
        skipped,
        errors,
    )

    return GenerateResponse(generated=generated, skipped=skipped, errors=errors)


# ── AI citation monitoring ──────────────────────────────────────────────────────


class AICitationBotStats(BaseModel):
    bot_name: str
    visit_count: int


class AICitationTopPlace(BaseModel):
    place_code: str
    visit_count: int


class AICitationsResponse(BaseModel):
    total_visits: int
    period_days: int
    by_bot: list[AICitationBotStats]
    top_places: list[AICitationTopPlace]
    recent_logs: list[dict[str, Any]]


@router.get("/seo/ai-citations", response_model=AICitationsResponse, tags=["admin-seo"])
def get_ai_citations(
    admin: AdminDep,
    session: SessionDep,
    days: Annotated[int, Query(ge=1, le=365)] = 30,
    bot_name: str | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=200)] = 50,
) -> AICitationsResponse:
    """Return AI-assistant crawler visit statistics for share pages.

    Query params:
    - days: look-back window in days (default 30)
    - bot_name: filter to a specific bot (e.g. "ChatGPT")
    """
    since = datetime.now(UTC) - timedelta(days=days)
    stmt = select(AICrawlerLog).where(AICrawlerLog.visited_at >= since)
    if bot_name:
        stmt = stmt.where(AICrawlerLog.bot_name == bot_name)

    all_logs = session.exec(stmt.order_by(AICrawlerLog.visited_at.desc())).all()

    # Aggregate stats
    bot_counter: Counter[str] = Counter(log.bot_name for log in all_logs)
    place_counter: Counter[str] = Counter(log.place_code for log in all_logs if log.place_code)

    by_bot = [
        AICitationBotStats(bot_name=name, visit_count=count)
        for name, count in bot_counter.most_common()
    ]
    top_places = [
        AICitationTopPlace(place_code=pc, visit_count=count)
        for pc, count in place_counter.most_common(10)
    ]

    # Paginated recent logs
    offset = (page - 1) * page_size
    page_logs = all_logs[offset : offset + page_size]
    recent_logs = [
        {
            "id": log.id,
            "bot_name": log.bot_name,
            "path": log.path,
            "place_code": log.place_code,
            "visited_at": log.visited_at.isoformat(),
        }
        for log in page_logs
    ]

    return AICitationsResponse(
        total_visits=len(all_logs),
        period_days=days,
        by_bot=by_bot,
        top_places=top_places,
        recent_logs=recent_logs,
    )
