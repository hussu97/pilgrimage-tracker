"""Admin — Places management endpoints."""

import random
import string
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import col, func, select

from app.api.deps import AdminDep
from app.api.v1.admin.audit_log import record_audit
from app.db.models import CheckIn, Place, PlaceImage, Review
from app.db.session import SessionDep

router = APIRouter()


def _generate_place_code() -> str:
    chars = string.ascii_lowercase + string.digits
    return "plc_" + "".join(random.choices(chars, k=8))


# ── Schemas ────────────────────────────────────────────────────────────────────


class AdminPlaceListItem(BaseModel):
    place_code: str
    name: str
    religion: str
    place_type: str
    lat: float
    lng: float
    address: str
    source: str | None
    created_at: datetime
    review_count: int
    check_in_count: int


class AdminPlaceDetail(AdminPlaceListItem):
    description: str | None
    website_url: str | None
    opening_hours: dict[str, Any] | None
    utc_offset_minutes: int | None


class AdminPlaceListResponse(BaseModel):
    items: list[AdminPlaceListItem]
    total: int
    page: int
    page_size: int


class CreatePlaceBody(BaseModel):
    name: str
    religion: str
    place_type: str
    lat: float
    lng: float
    address: str
    description: str | None = None
    website_url: str | None = None
    opening_hours: dict[str, Any] | None = None
    utc_offset_minutes: int | None = None
    source: str | None = "manual"


class PatchPlaceBody(BaseModel):
    name: str | None = None
    religion: str | None = None
    place_type: str | None = None
    lat: float | None = None
    lng: float | None = None
    address: str | None = None
    description: str | None = None
    website_url: str | None = None
    opening_hours: dict[str, Any] | None = None
    utc_offset_minutes: int | None = None


class AdminPlaceImageItem(BaseModel):
    id: int
    image_type: str
    url: str | None
    display_order: int
    created_at: datetime


# ── Helpers ────────────────────────────────────────────────────────────────────


def _place_counts(session: SessionDep, place_code: str) -> tuple[int, int]:
    review_count = session.exec(
        select(func.count()).select_from(Review).where(Review.place_code == place_code)
    ).one()
    check_in_count = session.exec(
        select(func.count()).select_from(CheckIn).where(CheckIn.place_code == place_code)
    ).one()
    return review_count, check_in_count


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("/places", response_model=AdminPlaceListResponse)
def list_places(
    admin: AdminDep,
    session: SessionDep,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=2000)] = 50,
    search: str | None = None,
    religion: str | None = None,
    place_type: str | None = None,
):
    stmt = select(Place)
    if search:
        stmt = stmt.where(col(Place.name).ilike(f"%{search}%"))
    if religion:
        stmt = stmt.where(Place.religion == religion)
    if place_type:
        stmt = stmt.where(Place.place_type == place_type)

    total = session.exec(select(func.count()).select_from(stmt.subquery())).one()
    stmt = (
        stmt.order_by(col(Place.created_at).desc()).offset((page - 1) * page_size).limit(page_size)
    )
    places = session.exec(stmt).all()

    items = []
    for p in places:
        review_count, check_in_count = _place_counts(session, p.place_code)
        items.append(
            AdminPlaceListItem(
                place_code=p.place_code,
                name=p.name,
                religion=p.religion,
                place_type=p.place_type,
                lat=p.lat,
                lng=p.lng,
                address=p.address,
                source=p.source,
                created_at=p.created_at,
                review_count=review_count,
                check_in_count=check_in_count,
            )
        )

    return AdminPlaceListResponse(items=items, total=total, page=page, page_size=page_size)


@router.post("/places", response_model=AdminPlaceDetail, status_code=201)
def create_place(body: CreatePlaceBody, admin: AdminDep, session: SessionDep):
    place = Place(
        place_code=_generate_place_code(),
        name=body.name,
        religion=body.religion,
        place_type=body.place_type,
        lat=body.lat,
        lng=body.lng,
        address=body.address,
        description=body.description,
        website_url=body.website_url,
        opening_hours=body.opening_hours,
        utc_offset_minutes=body.utc_offset_minutes,
        source=body.source,
    )
    session.add(place)
    session.flush()  # get the place_code before audit
    record_audit(session, admin, "create", "place", place.place_code)
    session.commit()
    session.refresh(place)

    return AdminPlaceDetail(
        place_code=place.place_code,
        name=place.name,
        religion=place.religion,
        place_type=place.place_type,
        lat=place.lat,
        lng=place.lng,
        address=place.address,
        source=place.source,
        created_at=place.created_at,
        review_count=0,
        check_in_count=0,
        description=place.description,
        website_url=place.website_url,
        opening_hours=place.opening_hours,
        utc_offset_minutes=place.utc_offset_minutes,
    )


@router.get("/places/{place_code}", response_model=AdminPlaceDetail)
def get_place(place_code: str, admin: AdminDep, session: SessionDep):
    place = session.exec(select(Place).where(Place.place_code == place_code)).first()
    if not place:
        raise HTTPException(status_code=404, detail="Place not found")

    review_count, check_in_count = _place_counts(session, place_code)

    return AdminPlaceDetail(
        place_code=place.place_code,
        name=place.name,
        religion=place.religion,
        place_type=place.place_type,
        lat=place.lat,
        lng=place.lng,
        address=place.address,
        source=place.source,
        created_at=place.created_at,
        review_count=review_count,
        check_in_count=check_in_count,
        description=place.description,
        website_url=place.website_url,
        opening_hours=place.opening_hours,
        utc_offset_minutes=place.utc_offset_minutes,
    )


@router.patch("/places/{place_code}", response_model=AdminPlaceDetail)
def patch_place(place_code: str, body: PatchPlaceBody, admin: AdminDep, session: SessionDep):
    place = session.exec(select(Place).where(Place.place_code == place_code)).first()
    if not place:
        raise HTTPException(status_code=404, detail="Place not found")

    changes = {
        field: {"old": getattr(place, field), "new": value}
        for field, value in body.model_dump(exclude_unset=True).items()
    }
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(place, field, value)

    record_audit(session, admin, "update", "place", place_code, changes or None)
    session.add(place)
    session.commit()
    session.refresh(place)

    review_count, check_in_count = _place_counts(session, place_code)

    return AdminPlaceDetail(
        place_code=place.place_code,
        name=place.name,
        religion=place.religion,
        place_type=place.place_type,
        lat=place.lat,
        lng=place.lng,
        address=place.address,
        source=place.source,
        created_at=place.created_at,
        review_count=review_count,
        check_in_count=check_in_count,
        description=place.description,
        website_url=place.website_url,
        opening_hours=place.opening_hours,
        utc_offset_minutes=place.utc_offset_minutes,
    )


@router.delete("/places/{place_code}", status_code=204)
def delete_place(place_code: str, admin: AdminDep, session: SessionDep):
    place = session.exec(select(Place).where(Place.place_code == place_code)).first()
    if not place:
        raise HTTPException(status_code=404, detail="Place not found")
    record_audit(session, admin, "delete", "place", place_code)
    session.delete(place)
    session.commit()


@router.get("/places/{place_code}/images", response_model=list[AdminPlaceImageItem])
def list_place_images(place_code: str, admin: AdminDep, session: SessionDep):
    place = session.exec(select(Place).where(Place.place_code == place_code)).first()
    if not place:
        raise HTTPException(status_code=404, detail="Place not found")

    images = session.exec(
        select(PlaceImage)
        .where(PlaceImage.place_code == place_code)
        .order_by(PlaceImage.display_order)
    ).all()

    return [
        AdminPlaceImageItem(
            id=img.id,
            image_type=img.image_type,
            url=img.url,
            display_order=img.display_order,
            created_at=img.created_at,
        )
        for img in images
    ]


@router.delete("/places/{place_code}/images/{image_id}", status_code=204)
def delete_place_image(place_code: str, image_id: int, admin: AdminDep, session: SessionDep):
    image = session.exec(
        select(PlaceImage).where(PlaceImage.id == image_id, PlaceImage.place_code == place_code)
    ).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    session.delete(image)
    session.commit()
