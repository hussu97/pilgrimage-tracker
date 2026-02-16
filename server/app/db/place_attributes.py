import json
from typing import Any, Dict, List, Optional

from sqlmodel import Session, select

from app.db.models import PlaceAttribute, PlaceAttributeDefinition
from app.db.session import engine


def upsert_attribute(place_code: str, attribute_code: str, value: Any) -> PlaceAttribute:
    """Insert or update a PlaceAttribute row. Auto-detects text vs json storage."""
    with Session(engine) as session:
        existing = session.exec(
            select(PlaceAttribute).where(
                PlaceAttribute.place_code == place_code,
                PlaceAttribute.attribute_code == attribute_code,
            )
        ).first()

        if isinstance(value, (dict, list)):
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


def get_attributes_for_place(place_code: str, session: Session) -> List[PlaceAttribute]:
    """Get attributes for a place. REQUIRES an active session."""
    return list(session.exec(
        select(PlaceAttribute).where(PlaceAttribute.place_code == place_code)
    ).all())


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


def bulk_get_attributes_for_places(place_codes: List[str], session: Session) -> Dict[str, dict]:
    """
    Bulk fetch ALL attributes for multiple places in ONE query.
    Returns: {place_code: {attribute_code: value}}
    """
    if not place_codes:
        return {}

    # Single query to get all attributes for all places
    attrs = session.exec(
        select(PlaceAttribute).where(PlaceAttribute.place_code.in_(place_codes))
    ).all()

    # Group by place_code
    result = {}
    for attr in attrs:
        if attr.place_code not in result:
            result[attr.place_code] = {}

        if attr.value_json is not None:
            result[attr.place_code][attr.attribute_code] = attr.value_json
        elif attr.value_text is not None:
            result[attr.place_code][attr.attribute_code] = attr.value_text

    return result


def get_attribute_definitions(
    religion: Optional[str] = None,
    filterable_only: bool = False,
    spec_only: bool = False,
    session: Optional[Session] = None,
) -> List[PlaceAttributeDefinition]:
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
