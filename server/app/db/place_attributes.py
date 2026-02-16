import json
from typing import Any, List, Optional

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


def get_attributes_for_place(place_code: str) -> List[PlaceAttribute]:
    with Session(engine) as session:
        return list(session.exec(
            select(PlaceAttribute).where(PlaceAttribute.place_code == place_code)
        ).all())


def get_attributes_dict(place_code: str) -> dict:
    """Returns a flat dict: {attribute_code: value} for the given place."""
    attrs = get_attributes_for_place(place_code)
    result = {}
    for a in attrs:
        if a.value_json is not None:
            result[a.attribute_code] = a.value_json
        elif a.value_text is not None:
            result[a.attribute_code] = a.value_text
    return result


def get_attribute_definitions(
    religion: Optional[str] = None,
    filterable_only: bool = False,
    spec_only: bool = False,
) -> List[PlaceAttributeDefinition]:
    with Session(engine) as session:
        stmt = select(PlaceAttributeDefinition)
        if filterable_only:
            stmt = stmt.where(PlaceAttributeDefinition.is_filterable == True)  # noqa: E712
        if spec_only:
            stmt = stmt.where(PlaceAttributeDefinition.is_specification == True)  # noqa: E712
        defs = list(session.exec(stmt).all())

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
