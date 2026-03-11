"""CRUD operations for PlaceImage model."""

from sqlmodel import Session, select

from app.db.enums import ImageType
from app.db.models import PlaceImage


def get_images(place_code: str, session: Session) -> list[dict]:
    """
    Get all images for a place, returns list of image dicts.

    Returns a unified format regardless of storage type:
    - URL-based images: {id, url, display_order} where url is external
    - Blob-based images: {id, url, display_order} where url is /api/v1/places/{code}/images/{id}

    The frontend receives all images as URLs and doesn't need to know the storage implementation.
    """
    stmt = (
        select(PlaceImage)
        .where(PlaceImage.place_code == place_code)
        .order_by(PlaceImage.display_order, PlaceImage.id)
    )
    images = session.exec(stmt).all()

    result = []
    for img in images:
        if img.image_type == ImageType.URL:
            result.append(
                {
                    "id": img.id,
                    "url": img.url,
                    "display_order": img.display_order,
                    "alt_text": img.alt_text,
                }
            )
        elif img.image_type == ImageType.BLOB:
            # For blob images, construct a URL to the blob endpoint
            result.append(
                {
                    "id": img.id,
                    "url": f"/api/v1/places/{place_code}/images/{img.id}",
                    "display_order": img.display_order,
                    "alt_text": img.alt_text,
                }
            )
        elif img.image_type == ImageType.GCS:
            result.append(
                {
                    "id": img.id,
                    "url": img.gcs_url,
                    "display_order": img.display_order,
                    "alt_text": img.alt_text,
                }
            )

    return result


def get_images_bulk(place_codes: list[str], session: Session) -> dict[str, list[dict]]:
    """
    Fetch images for multiple places in one query.

    Returns: Dict mapping place_code -> list of image dicts
    """
    if not place_codes:
        return {}

    stmt = (
        select(PlaceImage)
        .where(PlaceImage.place_code.in_(place_codes))
        .order_by(PlaceImage.place_code, PlaceImage.display_order, PlaceImage.id)
    )
    images = session.exec(stmt).all()

    result = {}
    for img in images:
        if img.place_code not in result:
            result[img.place_code] = []

        if img.image_type == ImageType.URL:
            result[img.place_code].append(
                {
                    "id": img.id,
                    "url": img.url,
                    "display_order": img.display_order,
                    "alt_text": img.alt_text,
                }
            )
        elif img.image_type == ImageType.BLOB:
            result[img.place_code].append(
                {
                    "id": img.id,
                    "url": f"/api/v1/places/{img.place_code}/images/{img.id}",
                    "display_order": img.display_order,
                    "alt_text": img.alt_text,
                }
            )
        elif img.image_type == ImageType.GCS:
            result[img.place_code].append(
                {
                    "id": img.id,
                    "url": img.gcs_url,
                    "display_order": img.display_order,
                    "alt_text": img.alt_text,
                }
            )

    return result


def get_image_by_id(image_id: int, session: Session) -> PlaceImage | None:
    """Get a single image by ID."""
    return session.get(PlaceImage, image_id)


def _clear_images(place_code: str, session: Session) -> None:
    """Delete all existing images for a place."""
    stmt = select(PlaceImage).where(PlaceImage.place_code == place_code)
    for img in session.exec(stmt).all():
        session.delete(img)


def set_images_from_urls(
    place_code: str,
    urls: list[str],
    session: Session,
) -> None:
    """Delete existing images and bulk insert from URL list (used during sync)."""
    _clear_images(place_code, session)

    for i, url in enumerate(urls):
        image = PlaceImage(
            place_code=place_code,
            image_type=ImageType.URL,
            url=url,
            display_order=i,
        )
        session.add(image)

    session.commit()


def set_images_from_blobs(
    place_code: str,
    blobs: list[dict],
    session: Session,
) -> None:
    """Delete existing images and bulk insert from blob list (used during sync).

    Each blob dict must have 'data' (base64 str) and optionally 'mime_type'.
    When GCS is enabled, images are uploaded in parallel before any DB writes
    so the DB session is not held open during slow network I/O.
    """
    import base64
    from concurrent.futures import ThreadPoolExecutor, as_completed

    from app.services.image_storage import PREFIX_PLACES, get_image_storage, is_gcs_enabled

    # Decode all blobs first (CPU-only, fast)
    decoded = [
        (i, base64.b64decode(blob["data"]), blob.get("mime_type", "image/jpeg"))
        for i, blob in enumerate(blobs)
    ]

    if is_gcs_enabled():
        storage = get_image_storage()

        # Upload all images to GCS in parallel (GCS client is thread-safe).
        # Cap at 10 workers — enough to saturate a GCS connection without
        # overwhelming the process or the bucket's per-prefix throughput.
        def _upload(args: tuple) -> tuple[int, str, str]:
            idx, data, mime_type = args
            url = storage.upload(data, mime_type, PREFIX_PLACES)
            return idx, url, mime_type

        results: list[tuple[int, str, str]] = []
        with ThreadPoolExecutor(max_workers=min(10, len(decoded))) as pool:
            futures = {pool.submit(_upload, item): item[0] for item in decoded}
            for fut in as_completed(futures):
                results.append(fut.result())

        # Now do all DB writes in one shot (session was not held during uploads)
        _clear_images(place_code, session)
        for idx, gcs_url, mime_type in sorted(results):
            session.add(
                PlaceImage(
                    place_code=place_code,
                    image_type=ImageType.GCS,
                    gcs_url=gcs_url,
                    mime_type=mime_type,
                    display_order=idx,
                )
            )
    else:
        _clear_images(place_code, session)
        for i, data, mime_type in decoded:
            session.add(
                PlaceImage(
                    place_code=place_code,
                    image_type=ImageType.BLOB,
                    blob_data=data,
                    mime_type=mime_type,
                    display_order=i,
                )
            )

    session.commit()
