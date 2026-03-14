"""Admin — Content Translation management.

CRUD for ContentTranslation rows (translated names/descriptions for places,
attribute definitions, etc.). Used by admins to review and manually edit
machine-translated or scraped translations.
"""

import re
from datetime import UTC, datetime
from secrets import token_hex
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from sqlmodel import col, func, select

from app.api.deps import AdminDep
from app.db.models import (
    BulkTranslationJob,
    City,
    ContentTranslation,
    Place,
    PlaceAttributeDefinition,
    Review,
)
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


# ── .txt-based export / import (Bulk Translator workflow) ─────────────────────
#
# Line format: [type_num:entity_id:field_num] {{ english text }}
#
#   type_num   — 1=place  2=city  3=attribute_def  4=review
#   entity_id  — integer primary key of the entity row
#   field_num  — per-type: place(1=name 2=description 3=address)
#                           city/attribute_def(1=name)
#                           review(1=title 2=body)
#
# All three components are pure integers separated by colons, so bulk-translator
# sites cannot accidentally translate the identifier.

_ENTITY_TYPE_NUM: dict[str, int] = {"place": 1, "city": 2, "attribute_def": 3, "review": 4}
_ENTITY_NUM_TYPE: dict[int, str] = {v: k for k, v in _ENTITY_TYPE_NUM.items()}

_FIELD_IDX: dict[str, dict[str, int]] = {
    "place": {"name": 1, "description": 2, "address": 3},
    "city": {"name": 1},
    "attribute_def": {"name": 1},
    "review": {"title": 1, "body": 2},
}
_FIELD_NUM: dict[str, dict[int, str]] = {
    et: {v: k for k, v in fields.items()} for et, fields in _FIELD_IDX.items()
}

_TXT_LINE_RE = re.compile(
    r"^\[(?P<type_num>\d+):(?P<entity_id>\d+):(?P<field_num>\d+)\]\s+(?P<text>.+)$"
)


def _gather_untranslated_items(
    session,
    target_langs: list[str],
    requested_types: set[str],
) -> list[tuple[str, int, str, str, str]]:
    """Return (entity_type, entity_id, entity_code, field, en_text) for missing translations.

    Filters the ContentTranslation lookup to only the requested langs and entity
    types — avoids loading the entire table when only a subset is needed.
    """
    existing_rows = session.exec(
        select(
            ContentTranslation.entity_type,
            ContentTranslation.entity_code,
            ContentTranslation.field,
            ContentTranslation.lang,
        ).where(
            col(ContentTranslation.lang).in_(target_langs),
            col(ContentTranslation.entity_type).in_(list(requested_types)),
        )
    ).all()
    existing: set[tuple[str, str, str, str]] = {(r[0], r[1], r[2], r[3]) for r in existing_rows}

    items: list[
        tuple[str, int, str, str, str]
    ] = []  # (entity_type, entity_id, entity_code, field, en_text)

    def _collect(
        entity_type: str, entity_id: int, entity_code: str, source_fields: dict[str, str]
    ) -> None:
        for field_name, text in source_fields.items():
            for lang in target_langs:
                if (entity_type, entity_code, field_name, lang) not in existing:
                    items.append((entity_type, entity_id, entity_code, field_name, text))
                    break  # field is missing in at least one lang — include it once

    if "place" in requested_types:
        places = session.exec(
            select(Place.id, Place.place_code, Place.name, Place.description, Place.address)
        ).all()
        for place_id, place_code, name, description, address in places:
            source_fields: dict[str, str] = {}
            if name:
                source_fields["name"] = name
            if description:
                source_fields["description"] = description
            if address:
                source_fields["address"] = address
            if source_fields:
                _collect("place", place_id, place_code, source_fields)

    if "city" in requested_types:
        cities = session.exec(select(City.id, City.city_code, City.name)).all()
        for city_id, city_code, name in cities:
            if name:
                _collect("city", city_id, city_code, {"name": name})

    if "attribute_def" in requested_types:
        attr_defs = session.exec(
            select(
                PlaceAttributeDefinition.id,
                PlaceAttributeDefinition.attribute_code,
                PlaceAttributeDefinition.name,
            )
        ).all()
        for attr_id, attribute_code, name in attr_defs:
            if name:
                _collect("attribute_def", attr_id, attribute_code, {"name": name})

    if "review" in requested_types:
        reviews = session.exec(
            select(Review.id, Review.review_code, Review.title, Review.body)
        ).all()
        for review_id, review_code, title, body in reviews:
            source_fields = {}
            if title:
                source_fields["title"] = title
            if body:
                source_fields["body"] = body
            if source_fields:
                _collect("review", review_id, review_code, source_fields)

    return items


@router.get(
    "/content-translations/export-txt",
    response_class=PlainTextResponse,
)
def export_untranslated_txt(
    admin: AdminDep,
    session: SessionDep,
    langs: str = Query(default="ar,hi,te,ml"),
    entity_types: str = Query(default="place,city,attribute_def,review"),
) -> PlainTextResponse:
    """Export missing translations as a .txt file for use with external bulk translator sites.

    Each line: [type_num:entity_id:field_num] {{ english text }}
    All components are integers — safe from accidental translation.
    """
    target_langs = [lc.strip() for lc in langs.split(",") if lc.strip()]
    if not target_langs:
        raise HTTPException(status_code=422, detail="langs must not be empty")

    requested_types = {t.strip() for t in entity_types.split(",") if t.strip()}
    if not requested_types:
        raise HTTPException(status_code=422, detail="entity_types must not be empty")

    raw_items = _gather_untranslated_items(session, target_langs, requested_types)

    lines: list[str] = []
    for entity_type, entity_id, _entity_code, field, en_text in raw_items:
        type_num = _ENTITY_TYPE_NUM[entity_type]
        field_num = _FIELD_IDX[entity_type][field]
        lines.append(f"[{type_num}:{entity_id}:{field_num}] {en_text}")

    content = "\n".join(lines)
    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%S")
    filename = f"untranslated_{timestamp}.txt"

    return PlainTextResponse(
        content=content,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


class _BulkTranslationJobOut(BaseModel):
    """Minimal job output schema for import endpoint (avoids circular import)."""

    job_code: str
    status: str
    job_type: str
    target_langs: list[str]
    entity_types: list[str]
    source_lang: str
    total_items: int
    completed_items: int
    failed_items: int
    skipped_items: int
    progress_pct: float
    error_message: str | None
    started_at: str | None
    completed_at: str | None
    created_at: str

    @classmethod
    def from_orm(cls, job: BulkTranslationJob) -> "_BulkTranslationJobOut":
        progress = (
            job.completed_items / max(job.total_items, 1) * 100 if job.total_items > 0 else 0.0
        )
        return cls(
            job_code=job.job_code,
            status=job.status,
            job_type=job.job_type,
            target_langs=job.target_langs or [],
            entity_types=job.entity_types or [],
            source_lang=job.source_lang,
            total_items=job.total_items,
            completed_items=job.completed_items,
            failed_items=job.failed_items,
            skipped_items=job.skipped_items,
            progress_pct=round(progress, 2),
            error_message=job.error_message,
            started_at=job.started_at.isoformat() if job.started_at else None,
            completed_at=job.completed_at.isoformat() if job.completed_at else None,
            created_at=job.created_at.isoformat(),
        )


@router.post(
    "/content-translations/import-txt",
    response_model=_BulkTranslationJobOut,
    status_code=201,
)
async def import_translated_txt(
    admin: AdminDep,
    session: SessionDep,
    lang: str = Form(...),
    file: UploadFile = File(...),
) -> _BulkTranslationJobOut:
    """Import a translated .txt file (one language at a time) and create a job record.

    Parses [type_num:entity_id:field_num] {{ translated text }} lines.
    Resolves entity codes via batch DB lookups (one query per entity type).
    """
    raw = await file.read()
    text = raw.decode("utf-8", errors="replace")

    # ── 1. Parse all numeric identifiers from the file ────────────────────────
    # parsed_raw: list of (entity_type, entity_id_int, field_name, translated_text)
    parsed_raw: list[tuple[str, int, str, str]] = []
    ids_by_type: dict[str, set[int]] = {}  # entity_type → set of integer ids

    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        m = _TXT_LINE_RE.match(line)
        if not m:
            continue
        type_num = int(m.group("type_num"))
        entity_id = int(m.group("entity_id"))
        field_num = int(m.group("field_num"))

        entity_type = _ENTITY_NUM_TYPE.get(type_num)
        if entity_type is None:
            continue
        field_name = _FIELD_NUM.get(entity_type, {}).get(field_num)
        if field_name is None:
            continue

        parsed_raw.append((entity_type, entity_id, field_name, m.group("text").strip()))
        ids_by_type.setdefault(entity_type, set()).add(entity_id)

    if not parsed_raw:
        raise HTTPException(
            status_code=422, detail="No valid translation lines found in the uploaded file."
        )

    # ── 2. Batch-resolve entity_id → entity_code (one query per entity type) ──
    code_map: dict[str, dict[int, str]] = {}  # entity_type → {id: code}

    if "place" in ids_by_type:
        rows = session.exec(
            select(Place.id, Place.place_code).where(col(Place.id).in_(list(ids_by_type["place"])))
        ).all()
        code_map["place"] = {r[0]: r[1] for r in rows}

    if "city" in ids_by_type:
        rows = session.exec(
            select(City.id, City.city_code).where(col(City.id).in_(list(ids_by_type["city"])))
        ).all()
        code_map["city"] = {r[0]: r[1] for r in rows}

    if "attribute_def" in ids_by_type:
        rows = session.exec(
            select(PlaceAttributeDefinition.id, PlaceAttributeDefinition.attribute_code).where(
                col(PlaceAttributeDefinition.id).in_(list(ids_by_type["attribute_def"]))
            )
        ).all()
        code_map["attribute_def"] = {r[0]: r[1] for r in rows}

    if "review" in ids_by_type:
        rows = session.exec(
            select(Review.id, Review.review_code).where(
                col(Review.id).in_(list(ids_by_type["review"]))
            )
        ).all()
        code_map["review"] = {r[0]: r[1] for r in rows}

    # ── 3. Build BulkUpsertItems (skip lines whose entity no longer exists) ───
    items: list[BulkUpsertItem] = []
    entity_types_seen: set[str] = set()

    for entity_type, entity_id, field_name, translated_text in parsed_raw:
        entity_code = code_map.get(entity_type, {}).get(entity_id)
        if not entity_code:
            continue  # entity was deleted since export — skip
        items.append(
            BulkUpsertItem(
                entity_type=entity_type,
                entity_code=entity_code,
                field=field_name,
                lang=lang,
                translated_text=translated_text,
                source="txt_import",
            )
        )
        entity_types_seen.add(entity_type)

    if not items:
        raise HTTPException(
            status_code=422,
            detail="No resolvable entities found — the file may be stale or use the wrong format.",
        )

    # ── 4. Create job record ───────────────────────────────────────────────────
    now = datetime.now(UTC)
    job = BulkTranslationJob(
        job_code="btj_" + token_hex(8),
        created_by_user_code=admin.user_code,
        status="running",
        job_type="import",
        target_langs=[lang],
        entity_types=sorted(entity_types_seen),
        source_lang="en",
        total_items=len(items),
        started_at=now,
        created_at=now,
    )
    session.add(job)
    session.commit()
    session.refresh(job)

    # ── 5. Upsert translations ────────────────────────────────────────────────
    result = bulk_upsert_translations(body=items, admin=admin, session=session)

    job.completed_items = result.created + result.updated
    job.failed_items = len(result.errors)
    job.status = "completed" if not result.errors else "completed_with_errors"
    job.completed_at = datetime.now(UTC)
    session.add(job)
    session.commit()
    session.refresh(job)

    return _BulkTranslationJobOut.from_orm(job)
