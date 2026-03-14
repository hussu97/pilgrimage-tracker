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
from app.db.models import City, ContentTranslation, Place, PlaceAttributeDefinition, Review
from app.db.session import SessionDep

router = APIRouter()

# Fields eligible for Claude.ai translation
TRANSLATABLE_PLACE_FIELDS: list[str] = ["name", "description", "address"]


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

    # Batch-load place/city names to avoid N+1 queries to Cloud SQL.
    place_codes = {r.entity_code for r in rows if r.entity_type == "place"}
    city_codes = {r.entity_code for r in rows if r.entity_type == "city"}

    place_names: dict[str, str] = {}
    if place_codes:
        places = session.exec(
            select(Place.place_code, Place.name).where(col(Place.place_code).in_(place_codes))
        ).all()
        place_names = dict(places)

    city_names: dict[str, str] = {}
    if city_codes:
        cities = session.exec(
            select(City.city_code, City.name).where(col(City.city_code).in_(city_codes))
        ).all()
        city_names = dict(cities)

    items = []
    for row in rows:
        if row.entity_type == "place":
            place_name = place_names.get(row.entity_code)
        elif row.entity_type == "city":
            place_name = city_names.get(row.entity_code)
        else:
            place_name = None
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


# ── Export / Bulk-upsert (Claude.ai workflow) ─────────────────────────────────


class UntranslatedPlaceItem(BaseModel):
    entity_type: str
    entity_code: str
    place_name: str
    fields: dict[str, str]
    missing_langs: list[str]


class BulkUpsertItem(BaseModel):
    entity_type: str
    entity_code: str
    field: str
    lang: str
    translated_text: str
    source: str = "claude_ai"


class BulkUpsertResult(BaseModel):
    created: int
    updated: int
    errors: list[str]


@router.get(
    "/content-translations/export-untranslated",
    response_model=list[UntranslatedPlaceItem],
)
def export_untranslated(
    admin: AdminDep,
    session: SessionDep,
    langs: str = Query(default="ar,hi,te,ml", description="Comma-separated lang codes"),
    entity_types: str = Query(
        default="place,city,attribute_def,review",
        description="Comma-separated entity types to include",
    ),
):
    """Return all (entity, field, lang) triples that are missing a ContentTranslation row.

    Supports entity_types=place,city,attribute_def,review (default: all four).
    The exported JSON is the input format for translate_content_claude.py.
    """
    target_langs = [lc.strip() for lc in langs.split(",") if lc.strip()]
    if not target_langs:
        raise HTTPException(status_code=422, detail="langs must not be empty")

    requested_types = {t.strip() for t in entity_types.split(",") if t.strip()}
    if not requested_types:
        raise HTTPException(status_code=422, detail="entity_types must not be empty")

    # Load all existing translation keys in one query (all entity types at once)
    existing_rows = session.exec(
        select(
            ContentTranslation.entity_type,
            ContentTranslation.entity_code,
            ContentTranslation.field,
            ContentTranslation.lang,
        )
    ).all()
    # (entity_type, entity_code, field, lang)
    existing: set[tuple[str, str, str, str]] = {(r[0], r[1], r[2], r[3]) for r in existing_rows}

    result: list[UntranslatedPlaceItem] = []

    def _collect(
        entity_type: str,
        entity_code: str,
        entity_name: str,
        source_fields: dict[str, str],
    ) -> None:
        missing_langs: set[str] = set()
        for field_name in source_fields:
            for lang in target_langs:
                if (entity_type, entity_code, field_name, lang) not in existing:
                    missing_langs.add(lang)

        if not missing_langs:
            return

        fields_to_export: dict[str, str] = {}
        for field_name, text in source_fields.items():
            for lang in missing_langs:
                if (entity_type, entity_code, field_name, lang) not in existing:
                    fields_to_export[field_name] = text
                    break

        result.append(
            UntranslatedPlaceItem(
                entity_type=entity_type,
                entity_code=entity_code,
                place_name=entity_name,
                fields=fields_to_export,
                missing_langs=sorted(missing_langs),
            )
        )

    # ── Places ─────────────────────────────────────────────────────────────────
    if "place" in requested_types:
        places = session.exec(
            select(Place.place_code, Place.name, Place.description, Place.address)
        ).all()
        for place_code, name, description, address in places:
            source_fields: dict[str, str] = {}
            if name:
                source_fields["name"] = name
            if description:
                source_fields["description"] = description
            if address:
                source_fields["address"] = address
            if source_fields:
                _collect("place", place_code, name or "", source_fields)

    # ── Cities ─────────────────────────────────────────────────────────────────
    if "city" in requested_types:
        cities = session.exec(select(City.city_code, City.name)).all()
        for city_code, name in cities:
            if name:
                _collect("city", city_code, name, {"name": name})

    # ── Attribute definitions ───────────────────────────────────────────────────
    if "attribute_def" in requested_types:
        attr_defs = session.exec(
            select(PlaceAttributeDefinition.attribute_code, PlaceAttributeDefinition.name)
        ).all()
        for attribute_code, name in attr_defs:
            if name:
                _collect("attribute_def", attribute_code, name, {"name": name})

    # ── Reviews ────────────────────────────────────────────────────────────────
    if "review" in requested_types:
        reviews = session.exec(select(Review.review_code, Review.title, Review.body)).all()
        for review_code, title, body in reviews:
            source_fields = {}
            if title:
                source_fields["title"] = title
            if body:
                source_fields["body"] = body
            if source_fields:
                label = title or body or review_code
                _collect("review", review_code, label[:80], source_fields)

    return result


_BULK_UPSERT_MAX = 20_000
_BULK_UPSERT_CHUNK = 500


@router.post(
    "/content-translations/bulk-upsert",
    response_model=BulkUpsertResult,
)
def bulk_upsert_translations(
    body: list[BulkUpsertItem],
    admin: AdminDep,
    session: SessionDep,
):
    """Upsert a flat array of translation records.

    Optimised: one bulk SELECT to load all existing rows for the affected
    entity_codes, then process items against an in-memory lookup dict —
    no per-item SELECT queries. Commits every _BULK_UPSERT_CHUNK rows to
    keep transaction size bounded.
    """
    if not body:
        return BulkUpsertResult(created=0, updated=0, errors=[])

    if len(body) > _BULK_UPSERT_MAX:
        raise HTTPException(
            status_code=422,
            detail=f"Maximum {_BULK_UPSERT_MAX:,} items per request; received {len(body):,}.",
        )

    created = 0
    updated = 0
    errors: list[str] = []
    now = datetime.now(UTC)

    # ── 1. One bulk SELECT for all entity_codes in this request ───────────────
    entity_codes = list({item.entity_code for item in body})
    existing_rows = session.exec(
        select(ContentTranslation).where(col(ContentTranslation.entity_code).in_(entity_codes))
    ).all()

    # (entity_type, entity_code, field, lang) → row  — O(1) lookup per item
    existing_map: dict[tuple[str, str, str, str], ContentTranslation] = {
        (r.entity_type, r.entity_code, r.field, r.lang): r for r in existing_rows
    }

    # ── 2. Process in bounded chunks, commit after each ───────────────────────
    for chunk_start in range(0, len(body), _BULK_UPSERT_CHUNK):
        chunk = body[chunk_start : chunk_start + _BULK_UPSERT_CHUNK]

        for item in chunk:
            key = (item.entity_type, item.entity_code, item.field, item.lang)
            try:
                existing = existing_map.get(key)
                if existing:
                    existing.translated_text = item.translated_text
                    existing.source = item.source
                    existing.updated_at = now
                    updated += 1
                else:
                    row = ContentTranslation(
                        entity_type=item.entity_type,
                        entity_code=item.entity_code,
                        field=item.field,
                        lang=item.lang,
                        translated_text=item.translated_text,
                        source=item.source,
                        created_at=now,
                        updated_at=now,
                    )
                    session.add(row)
                    # Register in map so duplicate keys in the same payload don't double-insert
                    existing_map[key] = row
                    created += 1
            except Exception as exc:  # noqa: BLE001
                errors.append(
                    f"{item.entity_type}:{item.entity_code}:{item.field}:{item.lang} — {exc}"
                )

        session.commit()

    return BulkUpsertResult(created=created, updated=updated, errors=errors)
