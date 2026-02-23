"""Admin — Place Attributes management.

Endpoints for viewing attribute definitions (with usage counts) and
reading/bulk-updating attributes for a specific place.
"""

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlmodel import func, select

from app.api.deps import AdminDep
from app.db.models import Place, PlaceAttribute, PlaceAttributeDefinition
from app.db.session import SessionDep

router = APIRouter()


# ── Schemas ────────────────────────────────────────────────────────────────────


class AttributeDefinitionItem(BaseModel):
    attribute_code: str
    name: str
    data_type: str
    icon: str | None
    label_key: str | None
    is_filterable: bool
    is_specification: bool
    category: str | None
    religion: str | None
    display_order: int
    usage_count: int


class PlaceAttributeItem(BaseModel):
    id: int
    attribute_code: str
    attribute_name: str
    data_type: str
    value_text: str | None
    value_json: dict[str, Any] | None


class BulkAttributeEntry(BaseModel):
    attribute_code: str
    value_text: str | None = None
    value_json: dict[str, Any] | None = None


class BulkUpdateAttributesBody(BaseModel):
    attributes: list[BulkAttributeEntry]


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("/place-attributes", response_model=list[AttributeDefinitionItem])
def list_place_attribute_definitions(admin: AdminDep, session: SessionDep):
    """List all PlaceAttributeDefinitions with per-definition usage counts."""
    defs = session.exec(
        select(PlaceAttributeDefinition).order_by(PlaceAttributeDefinition.display_order)
    ).all()

    result = []
    for d in defs:
        usage_count = session.exec(
            select(func.count())
            .select_from(PlaceAttribute)
            .where(PlaceAttribute.attribute_code == d.attribute_code)
        ).one()
        result.append(
            AttributeDefinitionItem(
                attribute_code=d.attribute_code,
                name=d.name,
                data_type=d.data_type,
                icon=d.icon,
                label_key=d.label_key,
                is_filterable=d.is_filterable,
                is_specification=d.is_specification,
                category=d.category,
                religion=d.religion,
                display_order=d.display_order,
                usage_count=usage_count,
            )
        )
    return result


@router.get("/place-attributes/{place_code}", response_model=list[PlaceAttributeItem])
def list_place_attributes(place_code: str, admin: AdminDep, session: SessionDep):
    """List all attributes set on a specific place."""
    place = session.exec(select(Place).where(Place.place_code == place_code)).first()
    if not place:
        raise HTTPException(status_code=404, detail="Place not found")

    attrs = session.exec(
        select(PlaceAttribute).where(PlaceAttribute.place_code == place_code)
    ).all()

    result = []
    for attr in attrs:
        defn = session.exec(
            select(PlaceAttributeDefinition).where(
                PlaceAttributeDefinition.attribute_code == attr.attribute_code
            )
        ).first()
        result.append(
            PlaceAttributeItem(
                id=attr.id,
                attribute_code=attr.attribute_code,
                attribute_name=defn.name if defn else attr.attribute_code,
                data_type=defn.data_type if defn else "string",
                value_text=attr.value_text,
                value_json=attr.value_json,
            )
        )
    return result


@router.put("/place-attributes/{place_code}", response_model=list[PlaceAttributeItem])
def bulk_update_place_attributes(
    place_code: str,
    body: BulkUpdateAttributesBody,
    admin: AdminDep,
    session: SessionDep,
):
    """Bulk upsert attributes for a place. Each entry is upserted by attribute_code."""
    place = session.exec(select(Place).where(Place.place_code == place_code)).first()
    if not place:
        raise HTTPException(status_code=404, detail="Place not found")

    for entry in body.attributes:
        existing = session.exec(
            select(PlaceAttribute).where(
                PlaceAttribute.place_code == place_code,
                PlaceAttribute.attribute_code == entry.attribute_code,
            )
        ).first()
        if existing:
            existing.value_text = entry.value_text
            existing.value_json = entry.value_json
            session.add(existing)
        else:
            session.add(
                PlaceAttribute(
                    place_code=place_code,
                    attribute_code=entry.attribute_code,
                    value_text=entry.value_text,
                    value_json=entry.value_json,
                )
            )

    session.commit()

    # Return updated list
    attrs = session.exec(
        select(PlaceAttribute).where(PlaceAttribute.place_code == place_code)
    ).all()

    result = []
    for attr in attrs:
        defn = session.exec(
            select(PlaceAttributeDefinition).where(
                PlaceAttributeDefinition.attribute_code == attr.attribute_code
            )
        ).first()
        result.append(
            PlaceAttributeItem(
                id=attr.id,
                attribute_code=attr.attribute_code,
                attribute_name=defn.name if defn else attr.attribute_code,
                data_type=defn.data_type if defn else "string",
                value_text=attr.value_text,
                value_json=attr.value_json,
            )
        )
    return result
