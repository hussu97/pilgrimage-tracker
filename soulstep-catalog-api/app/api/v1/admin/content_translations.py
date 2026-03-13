"""Admin — Content Translation management.

CRUD for ContentTranslation rows (translated names/descriptions for places,
attribute definitions, etc.). Used by admins to review and manually edit
machine-translated or scraped translations.
"""

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import col, func, select

from app.api.deps import AdminDep
from app.db.models import City, ContentTranslation, Place
from app.db.session import SessionDep

router = APIRouter()


# ── Schemas ────────────────────────────────────────────────────────────────────


class AdminContentTranslation(BaseModel):
    id: int
    entity_type: str
    entity_code: str
    field: str
    lang: str
    translated_text: str
    source: str
    created_at: datetime
    updated_at: datetime
    place_name: str | None = None


class ContentTranslationListResponse(BaseModel):
    items: list[AdminContentTranslation]
    total: int
    page: int
    page_size: int


class CreateContentTranslationBody(BaseModel):
    entity_type: str
    entity_code: str
    field: str
    lang: str
    translated_text: str
    source: str = "manual"


class UpdateContentTranslationBody(BaseModel):
    translated_text: str | None = None
    source: str | None = None


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("/content-translations", response_model=ContentTranslationListResponse)
def list_content_translations(
    admin: AdminDep,
    session: SessionDep,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=2000)] = 50,
    entity_type: str | None = None,
    entity_code: str | None = None,
    lang: str | None = None,
    field: str | None = None,
):
    stmt = select(ContentTranslation)
    if entity_type:
        stmt = stmt.where(ContentTranslation.entity_type == entity_type)
    if entity_code:
        stmt = stmt.where(ContentTranslation.entity_code == entity_code)
    if lang:
        stmt = stmt.where(ContentTranslation.lang == lang)
    if field:
        stmt = stmt.where(ContentTranslation.field == field)

    total = session.exec(select(func.count()).select_from(stmt.subquery())).one()
    stmt = (
        stmt.order_by(col(ContentTranslation.updated_at).desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = session.exec(stmt).all()

    items = []
    for row in rows:
        place_name = None
        if row.entity_type == "place":
            place = session.exec(select(Place).where(Place.place_code == row.entity_code)).first()
            place_name = place.name if place else None
        elif row.entity_type == "city":
            city = session.exec(select(City).where(City.city_code == row.entity_code)).first()
            place_name = city.name if city else None
        items.append(
            AdminContentTranslation(
                id=row.id,
                entity_type=row.entity_type,
                entity_code=row.entity_code,
                field=row.field,
                lang=row.lang,
                translated_text=row.translated_text,
                source=row.source,
                created_at=row.created_at,
                updated_at=row.updated_at,
                place_name=place_name,
            )
        )

    return ContentTranslationListResponse(items=items, total=total, page=page, page_size=page_size)


@router.post("/content-translations", response_model=AdminContentTranslation, status_code=201)
def create_content_translation(
    body: CreateContentTranslationBody,
    admin: AdminDep,
    session: SessionDep,
):
    existing = session.exec(
        select(ContentTranslation).where(
            ContentTranslation.entity_type == body.entity_type,
            ContentTranslation.entity_code == body.entity_code,
            ContentTranslation.field == body.field,
            ContentTranslation.lang == body.lang,
        )
    ).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail="Translation already exists for this entity/field/lang. Use PUT to update.",
        )

    now = datetime.now(UTC)
    row = ContentTranslation(
        entity_type=body.entity_type,
        entity_code=body.entity_code,
        field=body.field,
        lang=body.lang,
        translated_text=body.translated_text,
        source=body.source,
        created_at=now,
        updated_at=now,
    )
    session.add(row)
    session.commit()
    session.refresh(row)

    return AdminContentTranslation(
        id=row.id,
        entity_type=row.entity_type,
        entity_code=row.entity_code,
        field=row.field,
        lang=row.lang,
        translated_text=row.translated_text,
        source=row.source,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.put("/content-translations/{translation_id}", response_model=AdminContentTranslation)
def update_content_translation(
    translation_id: int,
    body: UpdateContentTranslationBody,
    admin: AdminDep,
    session: SessionDep,
):
    row = session.exec(
        select(ContentTranslation).where(ContentTranslation.id == translation_id)
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Content translation not found")

    if body.translated_text is not None:
        row.translated_text = body.translated_text
    if body.source is not None:
        row.source = body.source
    row.updated_at = datetime.now(UTC)

    session.add(row)
    session.commit()
    session.refresh(row)

    return AdminContentTranslation(
        id=row.id,
        entity_type=row.entity_type,
        entity_code=row.entity_code,
        field=row.field,
        lang=row.lang,
        translated_text=row.translated_text,
        source=row.source,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.delete("/content-translations/{translation_id}", status_code=204)
def delete_content_translation(
    translation_id: int,
    admin: AdminDep,
    session: SessionDep,
):
    row = session.exec(
        select(ContentTranslation).where(ContentTranslation.id == translation_id)
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Content translation not found")
    session.delete(row)
    session.commit()
