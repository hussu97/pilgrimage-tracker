from typing import Any

from sqlmodel import Session, select

from app.db.models import PlaceAttribute, PlaceAttributeDefinition
from app.db.session import engine


def upsert_attribute(
    place_code: str, attribute_code: str, value: Any, session: Session
) -> PlaceAttribute:
    """Insert or update a PlaceAttribute row. Auto-detects text vs json storage."""
    existing = session.exec(
        select(PlaceAttribute).where(
            PlaceAttribute.place_code == place_code,
            PlaceAttribute.attribute_code == attribute_code,
        )
    ).first()

    if isinstance(value, dict | list):
        value_text = None
        value_json = value
    else:
        value_text = str(value) if value is not None else None
        value_json = None

    if existing:
        existing.value_text = value_text
        existing.value_json = value_json
        session.add(existing)
        session.commit()
        session.refresh(existing)
        return existing
    else:
        attr = PlaceAttribute(
            place_code=place_code,
            attribute_code=attribute_code,
            value_text=value_text,
            value_json=value_json,
        )
        session.add(attr)
        session.commit()
        session.refresh(attr)
        return attr


def bulk_upsert_attributes(place_code: str, attrs: list, session: Session) -> None:
    """Upsert all attributes for a place in a single DB round-trip.

    Fetches existing attrs for the place once, then updates or inserts in-memory.
    Skips any attribute codes not present in PlaceAttributeDefinition to avoid FK
    violations from scraper-generated junk codes.
    Flushes at the end — the caller is responsible for committing.
    """
    if not attrs:
        return

    valid_codes: set[str] = set(session.exec(select(PlaceAttributeDefinition.attribute_code)).all())

    existing: dict[str, PlaceAttribute] = {
        a.attribute_code: a
        for a in session.exec(
            select(PlaceAttribute).where(PlaceAttribute.place_code == place_code)
        ).all()
    }

    for attr_input in attrs:
        if attr_input.attribute_code not in valid_codes:
            continue
        code = attr_input.attribute_code
        value = attr_input.value
        if isinstance(value, dict | list):
            value_text: str | None = None
            value_json: Any = value
        else:
            value_text = str(value) if value is not None else None
            value_json = None

        if code in existing:
            existing[code].value_text = value_text
            existing[code].value_json = value_json
            session.add(existing[code])
        else:
            session.add(
                PlaceAttribute(
                    place_code=place_code,
                    attribute_code=code,
                    value_text=value_text,
                    value_json=value_json,
                )
            )

    session.flush()


def get_attributes_for_place(place_code: str, session: Session) -> list[PlaceAttribute]:
    """Get attributes for a place. REQUIRES an active session."""
    return list(
        session.exec(select(PlaceAttribute).where(PlaceAttribute.place_code == place_code)).all()
    )


def get_attributes_dict(place_code: str, session: Session) -> dict:
    """Returns a flat dict: {attribute_code: value} for the given place. REQUIRES session."""
    attrs = get_attributes_for_place(place_code, session)
    result = {}
    for a in attrs:
        if a.value_json is not None:
            result[a.attribute_code] = a.value_json
        elif a.value_text is not None:
            result[a.attribute_code] = a.value_text
    return result


def bulk_get_attributes_for_places(place_codes: list[str], session: Session) -> dict[str, dict]:
    """
    Bulk fetch ALL attributes for multiple places in ONE query.
    Returns: {place_code: {attribute_code: value}}

    Uses a column projection (not select(PlaceAttribute)) to skip ORM row
    instantiation — on Cloud Run this drops ~300-500ms of Python time when
    the set spans thousands of attribute rows.
    """
    if not place_codes:
        return {}

    rows = session.exec(
        select(
            PlaceAttribute.place_code,
            PlaceAttribute.attribute_code,
            PlaceAttribute.value_text,
            PlaceAttribute.value_json,
        ).where(PlaceAttribute.place_code.in_(place_codes))
    ).all()

    result: dict[str, dict] = {}
    for place_code, attribute_code, value_text, value_json in rows:
        bucket = result.get(place_code)
        if bucket is None:
            bucket = {}
            result[place_code] = bucket
        if value_json is not None:
            bucket[attribute_code] = value_json
        elif value_text is not None:
            bucket[attribute_code] = value_text

    return result


def get_attribute_definitions(
    religion: str | None = None,
    filterable_only: bool = False,
    spec_only: bool = False,
    session: Session | None = None,
) -> list[PlaceAttributeDefinition]:
    """Get attribute definitions. Optionally reuse an existing session."""

    def _query(sess):
        stmt = select(PlaceAttributeDefinition)
        if filterable_only:
            stmt = stmt.where(PlaceAttributeDefinition.is_filterable == True)  # noqa: E712
        if spec_only:
            stmt = stmt.where(PlaceAttributeDefinition.is_specification == True)  # noqa: E712
        return list(sess.exec(stmt).all())

    if session:
        defs = _query(session)
    else:
        with Session(engine) as new_session:
            defs = _query(new_session)

    if religion is not None:
        defs = [d for d in defs if d.religion is None or d.religion == religion]

    defs.sort(key=lambda d: d.display_order)
    return defs


def seed_attribute_definitions(definitions: list) -> None:
    """Bulk insert/update attribute definitions from a list of dicts."""
    with Session(engine) as session:
        for defn in definitions:
            existing = session.exec(
                select(PlaceAttributeDefinition).where(
                    PlaceAttributeDefinition.attribute_code == defn["attribute_code"]
                )
            ).first()
            if existing:
                for k, v in defn.items():
                    if k != "attribute_code":
                        setattr(existing, k, v)
                session.add(existing)
            else:
                obj = PlaceAttributeDefinition(**defn)
                session.add(obj)
        session.commit()
