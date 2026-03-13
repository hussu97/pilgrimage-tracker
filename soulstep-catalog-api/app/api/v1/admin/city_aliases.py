"""Admin CRUD for CityAlias — maps localized/dirty city names to canonical cities."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlmodel import select

from app.db.locations import get_or_create_city_alias
from app.db.models import City, CityAlias
from app.db.session import SessionDep

router = APIRouter()


class CreateAliasRequest(BaseModel):
    alias_name: str
    canonical_city_code: str
    country_code: str | None = None


@router.get("")
def list_aliases(session: SessionDep):
    aliases = session.exec(select(CityAlias)).all()
    return {
        "aliases": [
            {
                "id": a.id,
                "alias_name": a.alias_name,
                "canonical_city_code": a.canonical_city_code,
                "country_code": a.country_code,
            }
            for a in aliases
        ]
    }


@router.post("")
def create_alias(req: CreateAliasRequest, session: SessionDep):
    # Validate the canonical city code exists
    city = session.exec(select(City).where(City.city_code == req.canonical_city_code)).first()
    if not city:
        raise HTTPException(status_code=404, detail=f"City {req.canonical_city_code!r} not found")
    alias = get_or_create_city_alias(
        req.alias_name, req.canonical_city_code, req.country_code, session
    )
    session.commit()
    return {
        "id": alias.id,
        "alias_name": alias.alias_name,
        "canonical_city_code": alias.canonical_city_code,
    }


@router.delete("/{alias_id}")
def delete_alias(alias_id: int, session: SessionDep):
    alias = session.get(CityAlias, alias_id)
    if not alias:
        raise HTTPException(status_code=404, detail="Alias not found")
    session.delete(alias)
    session.commit()
    return {"ok": True}
