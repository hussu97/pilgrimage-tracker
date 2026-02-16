"""CRUD operations for PlaceImage model."""
from typing import List, Optional

from sqlmodel import Session, select

from app.db.models import PlaceImage
from app.db.session import get_session


def add_image_url(
    place_code: str,
    url: str,
    display_order: int = 0,
    session: Session = None,
) -> PlaceImage:
    """Add a URL-based image for a place."""
    if session is None:
        raise ValueError("Session is required")

    image = PlaceImage(
        place_code=place_code,
        image_type="url",
        url=url,
        display_order=display_order,
    )
    session.add(image)
    session.commit()
    session.refresh(image)
    return image


def add_image_blob(
    place_code: str,
    data: bytes,
    mime_type: str,
    display_order: int = 0,
    session: Session = None,
) -> PlaceImage:
    """Add a blob-based image for a place."""
    if session is None:
        raise ValueError("Session is required")

    image = PlaceImage(
        place_code=place_code,
        image_type="blob",
        blob_data=data,
        mime_type=mime_type,
        display_order=display_order,
    )
    session.add(image)
    session.commit()
    session.refresh(image)
    return image


def get_images(place_code: str, session: Session = None) -> List[dict]:
    """Get all images for a place, returns list of image dicts."""
    if session is None:
        raise ValueError("Session is required")

    stmt = (
        select(PlaceImage)
        .where(PlaceImage.place_code == place_code)
        .order_by(PlaceImage.display_order, PlaceImage.id)
    )
    images = session.exec(stmt).all()

    result = []
    for img in images:
        if img.image_type == "url":
            result.append({
                "id": img.id,
                "url": img.url,
                "display_order": img.display_order,
            })
        elif img.image_type == "blob":
            # For blob images, construct a URL to the blob endpoint
            result.append({
                "id": img.id,
                "url": f"/api/v1/places/{place_code}/images/{img.id}",
                "display_order": img.display_order,
            })

    return result


def get_image_by_id(image_id: int, session: Session = None) -> Optional[PlaceImage]:
    """Get a single image by ID."""
    if session is None:
        raise ValueError("Session is required")

    return session.get(PlaceImage, image_id)


def set_images_from_urls(
    place_code: str,
    urls: List[str],
    session: Session = None,
) -> None:
    """Delete existing images and bulk insert from URL list (used during sync)."""
    if session is None:
        raise ValueError("Session is required")

    # Delete existing images
    stmt = select(PlaceImage).where(PlaceImage.place_code == place_code)
    existing = session.exec(stmt).all()
    for img in existing:
        session.delete(img)

    # Insert new images
    for i, url in enumerate(urls):
        image = PlaceImage(
            place_code=place_code,
            image_type="url",
            url=url,
            display_order=i,
        )
        session.add(image)

    session.commit()
