"""Admin — SEO management endpoints.

Provides visibility into SEO coverage, missing content, and generation status
across the place catalogue. Supports bulk generation and per-place editing.
Includes template and label CRUD for the multi-language SEO system.

Routes:
    GET  /admin/seo/stats                     — Health metrics (incl. per-lang coverage)
    GET  /admin/seo/places                    — Paginated list with SEO coverage
    GET  /admin/seo/places/{place_code}       — SEO detail for one place (includes translations)
    PATCH /admin/seo/places/{place_code}      — Update SEO content (manual edit)
    POST /admin/seo/generate                  — Bulk trigger SEO generation
    POST /admin/seo/places/{place_code}/generate — Regenerate single place SEO
    GET  /admin/seo/templates                 — List all templates
    GET  /admin/seo/templates/{template_code}/{lang} — Get one template
    PATCH /admin/seo/templates/{template_code}/{lang} — Edit template
    GET  /admin/seo/labels                    — List all labels
    PATCH /admin/seo/labels/{label_type}/{label_key}/{lang} — Edit label
    GET  /admin/seo/stale                     — List places needing regeneration
"""

from __future__ import annotations

import logging
from collections import Counter
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import func, select

from app.api.deps import AdminDep, AdminOrApiKeyDep
from app.db import places as places_db
from app.db import reviews as reviews_db
from app.db.models import (
    AICrawlerLog,
    Place,
    PlaceSEO,
    PlaceSEOTranslation,
    SEOContentTemplate,
    SEOLabel,
)
from app.db.session import SessionDep
from app.services import seo_generator

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Pydantic schemas ───────────────────────────────────────────────────────────


class SEOStats(BaseModel):
    total_places: int
    places_with_seo: int
    places_missing_seo: int
    places_manually_edited: int
    coverage_pct: float
    lang_coverage: dict[str, int]  # {"ar": 120, "hi": 115, ...}
    stale_count: int


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


class SEOLangDetail(BaseModel):
    seo_title: str | None
    meta_description: str | None
    rich_description: str | None
    faq_json: list[dict[str, Any]] | None
    template_version: int
    is_manually_edited: bool
    generated_at: datetime | None


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
    template_version: int | None
    generated_at: datetime | None
    updated_at: datetime | None
    translations: dict[str, SEOLangDetail]


class PatchSEOBody(BaseModel):
    slug: str | None = None
    seo_title: str | None = None
    meta_description: str | None = None
    rich_description: str | None = None
    faq_json: list[dict[str, Any]] | None = None
    og_image_url: str | None = None
    is_manually_edited: bool | None = None


class BulkGenerateBody(BaseModel):
    force: bool = False
    limit: int | None = None
    langs: list[str] = ["en"]


class GenerateResponse(BaseModel):
    generated: int
    skipped: int
    errors: int
    lang_generated: dict[str, int]
    lang_errors: dict[str, int]


class SEOTemplateItem(BaseModel):
    id: int
    template_code: str
    lang: str
    template_text: str
    fallback_text: str | None
    static_phrases: dict[str, str]
    version: int
    is_active: bool


class PatchTemplateBody(BaseModel):
    template_text: str | None = None
    fallback_text: str | None = None
    static_phrases: dict[str, str] | None = None
    is_active: bool | None = None


class SEOLabelItem(BaseModel):
    id: int
    label_type: str
    label_key: str
    lang: str
    label_text: str


class PatchLabelBody(BaseModel):
    label_text: str


class StaleItem(BaseModel):
    place_code: str
    name: str
    current_version: int | None
    max_version: int


# ── Helpers ────────────────────────────────────────────────────────────────────


def _get_place_or_404(place_code: str, session) -> Place:
    place = places_db.get_place_by_code(place_code, session)
    if place is None:
        raise HTTPException(status_code=404, detail="Place not found")
    return place


def _get_seo(place_code: str, session) -> PlaceSEO | None:
    return session.exec(select(PlaceSEO).where(PlaceSEO.place_code == place_code)).first()


def _get_seo_translations(place_code: str, session) -> dict[str, SEOLangDetail]:
    """Return {lang: SEOLangDetail} from PlaceSEOTranslation rows."""
    rows = session.exec(
        select(PlaceSEOTranslation).where(
            PlaceSEOTranslation.place_code == place_code,
        )
    ).all()
    result: dict[str, SEOLangDetail] = {}
    for row in rows:
        result[row.lang] = SEOLangDetail(
            seo_title=row.seo_title,
            meta_description=row.meta_description,
            rich_description=row.rich_description,
            faq_json=row.faq_json,
            template_version=row.template_version,
            is_manually_edited=row.is_manually_edited,
            generated_at=row.generated_at,
        )
    return result


def _build_seo_detail(place: Place, seo: PlaceSEO | None, session) -> SEODetail:
    """Build SEODetail from a place and its SEO row."""
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
        template_version=seo.template_version if seo else None,
        generated_at=seo.generated_at if seo else None,
        updated_at=seo.updated_at if seo else None,
        translations=_get_seo_translations(place.place_code, session),
    )


# ── Endpoints ──────────────────────────────────────────────────────────────────


@router.get("/seo/stats", response_model=SEOStats, tags=["admin-seo"])
def get_seo_stats(admin: AdminDep, session: SessionDep) -> SEOStats:
    """Return aggregated SEO health metrics including per-language coverage."""
    total = session.exec(select(func.count(Place.id))).one()
    with_seo = session.exec(select(func.count(PlaceSEO.id))).one()
    manually_edited = session.exec(
        select(func.count(PlaceSEO.id)).where(PlaceSEO.is_manually_edited.is_(True))
    ).one()

    # Per-language coverage
    lang_coverage: dict[str, int] = {}
    for lang in ["ar", "hi", "te", "ml"]:
        count = session.exec(
            select(func.count(PlaceSEOTranslation.id)).where(PlaceSEOTranslation.lang == lang)
        ).one()
        lang_coverage[lang] = count

    # Stale count
    max_version = seo_generator._get_max_template_version(session)
    stale_count = session.exec(
        select(func.count(PlaceSEO.id)).where(PlaceSEO.template_version < max_version)
    ).one()

    missing = total - with_seo
    coverage = round((with_seo / total * 100) if total > 0 else 0.0, 1)

    return SEOStats(
        total_places=total,
        places_with_seo=with_seo,
        places_missing_seo=missing,
        places_manually_edited=manually_edited,
        coverage_pct=coverage,
        lang_coverage=lang_coverage,
        stale_count=stale_count,
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
    """List all places with SEO coverage information."""
    stmt = select(Place)
    if religion:
        stmt = stmt.where(Place.religion == religion)
    if search:
        stmt = stmt.where(Place.name.ilike(f"%{search}%"))

    all_places = session.exec(stmt).all()

    place_codes = [p.place_code for p in all_places]
    seo_rows = session.exec(select(PlaceSEO).where(PlaceSEO.place_code.in_(place_codes))).all()
    seo_map: dict[str, PlaceSEO] = {s.place_code: s for s in seo_rows}

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
    return _build_seo_detail(place, seo, session)


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
        rating_data = reviews_db.get_aggregate_rating(place_code, session)
        seo = seo_generator.upsert_place_seo(place, session, rating_data=rating_data)

    now = datetime.now(UTC)
    if body.slug is not None:
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
        seo.is_manually_edited = True

    seo.updated_at = now
    session.add(seo)
    session.commit()
    session.refresh(seo)

    logger.info("Admin %s patched SEO for %s", admin.user_code, place_code)
    return _build_seo_detail(place, seo, session)


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
    langs: str | None = None,
) -> SEODetail:
    """Regenerate SEO content for a single place.

    Pass `force=true` to overwrite manually-edited content.
    Pass `langs=en,ar,hi` to specify which languages to generate.
    """
    place = _get_place_or_404(place_code, session)
    rating_data = reviews_db.get_aggregate_rating(place_code, session)

    lang_list = langs.split(",") if langs else ["en"]
    seo_generator.generate_all_langs(
        place=place,
        session=session,
        rating_data=rating_data,
        force=force,
        langs=lang_list,
    )

    logger.info(
        "Admin %s regenerated SEO for %s (langs=%s)", admin.user_code, place_code, lang_list
    )

    seo = _get_seo(place_code, session)
    return _build_seo_detail(place, seo, session)


@router.post("/seo/generate", response_model=GenerateResponse, tags=["admin-seo"])
def bulk_generate_seo(
    body: BulkGenerateBody,
    caller: AdminOrApiKeyDep,
    session: SessionDep,
) -> GenerateResponse:
    """Bulk-generate SEO content for all places missing it.

    - force=true overwrites manually-edited records
    - limit=N processes at most N places
    - langs=["en","ar","hi","te","ml"] specifies target languages
    """
    stmt = select(Place)
    places = session.exec(stmt).all()

    if not body.force:
        seo_rows = session.exec(select(PlaceSEO)).all()
        manually_edited_codes = {s.place_code for s in seo_rows if s.is_manually_edited}
        places = [p for p in places if p.place_code not in manually_edited_codes]

    if body.limit is not None:
        places = places[: body.limit]

    generated = 0
    skipped = 0
    errors = 0
    lang_generated: dict[str, int] = {}
    lang_errors: dict[str, int] = {}

    for place in places:
        try:
            rating_data = reviews_db.get_aggregate_rating(place.place_code, session)
            results = seo_generator.generate_all_langs(
                place=place,
                session=session,
                rating_data=rating_data,
                force=body.force,
                langs=body.langs,
            )
            if "en" in results:
                generated += 1
            for lang, _result in results.items():
                if lang != "en":
                    lang_generated[lang] = lang_generated.get(lang, 0) + 1
        except Exception as exc:
            logger.error("SEO generation failed for %s: %s", place.place_code, exc)
            errors += 1

    logger.info(
        "Admin %s bulk SEO: generated=%d skipped=%d errors=%d lang_generated=%s",
        caller.user_code if caller else "api-key",
        generated,
        skipped,
        errors,
        lang_generated,
    )

    return GenerateResponse(
        generated=generated,
        skipped=skipped,
        errors=errors,
        lang_generated=lang_generated,
        lang_errors=lang_errors,
    )


# ── Template CRUD ─────────────────────────────────────────────────────────────


@router.get("/seo/templates", response_model=list[SEOTemplateItem], tags=["admin-seo"])
def list_templates(admin: AdminDep, session: SessionDep) -> list[SEOTemplateItem]:
    """List all SEO content templates."""
    rows = session.exec(
        select(SEOContentTemplate).order_by(
            SEOContentTemplate.template_code, SEOContentTemplate.lang
        )
    ).all()
    return [
        SEOTemplateItem(
            id=r.id,
            template_code=r.template_code,
            lang=r.lang,
            template_text=r.template_text,
            fallback_text=r.fallback_text,
            static_phrases=r.static_phrases or {},
            version=r.version,
            is_active=r.is_active,
        )
        for r in rows
    ]


@router.get(
    "/seo/templates/{template_code}/{lang}",
    response_model=SEOTemplateItem,
    tags=["admin-seo"],
)
def get_template(
    template_code: str,
    lang: str,
    admin: AdminDep,
    session: SessionDep,
) -> SEOTemplateItem:
    """Get a single template by code and language."""
    row = session.exec(
        select(SEOContentTemplate).where(
            SEOContentTemplate.template_code == template_code,
            SEOContentTemplate.lang == lang,
        )
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Template not found")
    return SEOTemplateItem(
        id=row.id,
        template_code=row.template_code,
        lang=row.lang,
        template_text=row.template_text,
        fallback_text=row.fallback_text,
        static_phrases=row.static_phrases or {},
        version=row.version,
        is_active=row.is_active,
    )


@router.patch(
    "/seo/templates/{template_code}/{lang}",
    response_model=SEOTemplateItem,
    tags=["admin-seo"],
)
def patch_template(
    template_code: str,
    lang: str,
    body: PatchTemplateBody,
    admin: AdminDep,
    session: SessionDep,
) -> SEOTemplateItem:
    """Edit a template. Auto-bumps version on any text change."""
    row = session.exec(
        select(SEOContentTemplate).where(
            SEOContentTemplate.template_code == template_code,
            SEOContentTemplate.lang == lang,
        )
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Template not found")

    version_bumped = False
    if body.template_text is not None and body.template_text != row.template_text:
        row.template_text = body.template_text
        version_bumped = True
    if body.fallback_text is not None:
        row.fallback_text = body.fallback_text
    if body.static_phrases is not None and body.static_phrases != row.static_phrases:
        row.static_phrases = body.static_phrases
        version_bumped = True
    if body.is_active is not None:
        row.is_active = body.is_active

    if version_bumped:
        row.version += 1
    row.updated_at = datetime.now(UTC)

    session.add(row)
    session.commit()
    session.refresh(row)

    logger.info(
        "Admin %s patched template %s/%s (v%d)", admin.user_code, template_code, lang, row.version
    )

    return SEOTemplateItem(
        id=row.id,
        template_code=row.template_code,
        lang=row.lang,
        template_text=row.template_text,
        fallback_text=row.fallback_text,
        static_phrases=row.static_phrases or {},
        version=row.version,
        is_active=row.is_active,
    )


# ── Label CRUD ────────────────────────────────────────────────────────────────


@router.get("/seo/labels", response_model=list[SEOLabelItem], tags=["admin-seo"])
def list_labels(admin: AdminDep, session: SessionDep) -> list[SEOLabelItem]:
    """List all SEO labels."""
    rows = session.exec(
        select(SEOLabel).order_by(SEOLabel.label_type, SEOLabel.label_key, SEOLabel.lang)
    ).all()
    return [
        SEOLabelItem(
            id=r.id,
            label_type=r.label_type,
            label_key=r.label_key,
            lang=r.lang,
            label_text=r.label_text,
        )
        for r in rows
    ]


@router.patch(
    "/seo/labels/{label_type}/{label_key}/{lang}",
    response_model=SEOLabelItem,
    tags=["admin-seo"],
)
def patch_label(
    label_type: str,
    label_key: str,
    lang: str,
    body: PatchLabelBody,
    admin: AdminDep,
    session: SessionDep,
) -> SEOLabelItem:
    """Edit a label's text."""
    row = session.exec(
        select(SEOLabel).where(
            SEOLabel.label_type == label_type,
            SEOLabel.label_key == label_key,
            SEOLabel.lang == lang,
        )
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Label not found")

    row.label_text = body.label_text
    session.add(row)
    session.commit()
    session.refresh(row)

    logger.info("Admin %s patched label %s/%s/%s", admin.user_code, label_type, label_key, lang)

    return SEOLabelItem(
        id=row.id,
        label_type=row.label_type,
        label_key=row.label_key,
        lang=row.lang,
        label_text=row.label_text,
    )


# ── Stale detection ───────────────────────────────────────────────────────────


@router.get("/seo/stale", response_model=list[StaleItem], tags=["admin-seo"])
def list_stale_places(
    admin: AdminDep,
    session: SessionDep,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=2000)] = 50,
) -> list[StaleItem]:
    """List places where SEO content was generated with an older template version."""
    max_version = seo_generator._get_max_template_version(session)
    rows = session.exec(
        select(PlaceSEO, Place)
        .join(Place, PlaceSEO.place_code == Place.place_code)
        .where(PlaceSEO.template_version < max_version)
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return [
        StaleItem(
            place_code=seo.place_code,
            name=place.name,
            current_version=seo.template_version,
            max_version=max_version,
        )
        for seo, place in rows
    ]


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
    """Return AI-assistant crawler visit statistics for share pages."""
    since = datetime.now(UTC) - timedelta(days=days)
    stmt = select(AICrawlerLog).where(AICrawlerLog.visited_at >= since)
    if bot_name:
        stmt = stmt.where(AICrawlerLog.bot_name == bot_name)

    all_logs = session.exec(stmt.order_by(AICrawlerLog.visited_at.desc())).all()

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
