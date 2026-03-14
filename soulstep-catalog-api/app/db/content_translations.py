"""CRUD and bulk-query helpers for the ContentTranslation table.

English is canonical on the source model — this module handles non-English only.
"""

from datetime import UTC, datetime

from sqlmodel import Session, and_, select

from app.db.models import ContentTranslation


def upsert_translation(
    entity_type: str,
    entity_code: str,
    field: str,
    lang: str,
    text: str,
    source: str = "scraper",
    session: Session = None,
    commit: bool = True,
) -> None:
    """Insert or update a translation row.

    Pass commit=False when batching multiple upserts in a single session —
    the caller is then responsible for calling session.commit().
    """
    existing = session.exec(
        select(ContentTranslation).where(
            and_(
                ContentTranslation.entity_type == entity_type,
                ContentTranslation.entity_code == entity_code,
                ContentTranslation.field == field,
                ContentTranslation.lang == lang,
            )
        )
    ).first()

    now = datetime.now(UTC)
    if existing:
        existing.translated_text = text
        existing.source = source
        existing.updated_at = now
        session.add(existing)
    else:
        session.add(
            ContentTranslation(
                entity_type=entity_type,
                entity_code=entity_code,
                field=field,
                lang=lang,
                translated_text=text,
                source=source,
                created_at=now,
                updated_at=now,
            )
        )
    if commit:
        session.commit()


def get_translation(
    entity_type: str,
    entity_code: str,
    field: str,
    lang: str,
    session: Session,
) -> str | None:
    """Return a single translated string, or None if not found."""
    row = session.exec(
        select(ContentTranslation).where(
            and_(
                ContentTranslation.entity_type == entity_type,
                ContentTranslation.entity_code == entity_code,
                ContentTranslation.field == field,
                ContentTranslation.lang == lang,
            )
        )
    ).first()
    return row.translated_text if row else None


def get_translations_for_entity(
    entity_type: str,
    entity_code: str,
    lang: str,
    session: Session,
) -> dict[str, str]:
    """Return all translated fields for a single entity as {field: text}."""
    rows = session.exec(
        select(ContentTranslation).where(
            and_(
                ContentTranslation.entity_type == entity_type,
                ContentTranslation.entity_code == entity_code,
                ContentTranslation.lang == lang,
            )
        )
    ).all()
    return {row.field: row.translated_text for row in rows}


def bulk_get_translations(
    entity_type: str,
    entity_codes: list[str],
    lang: str,
    session: Session,
) -> dict[str, dict[str, str]]:
    """Return translations for multiple entities in a single SQL query.

    Returns: {entity_code: {field: translated_text}}
    Missing entries are simply absent from the outer dict.
    """
    if not entity_codes:
        return {}

    rows = session.exec(
        select(ContentTranslation).where(
            and_(
                ContentTranslation.entity_type == entity_type,
                ContentTranslation.entity_code.in_(entity_codes),
                ContentTranslation.lang == lang,
            )
        )
    ).all()

    result: dict[str, dict[str, str]] = {}
    for row in rows:
        result.setdefault(row.entity_code, {})[row.field] = row.translated_text
    return result
