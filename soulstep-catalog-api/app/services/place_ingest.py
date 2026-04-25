"""Shared catalog place ingestion used by API and direct scraper sync jobs."""

from __future__ import annotations

import logging
import time

from sqlalchemy.exc import IntegrityError, OperationalError
from sqlmodel import Session, func, select

from app.db import content_translations as ct_db
from app.db import place_attributes as attr_db
from app.db import place_images
from app.db import places as places_db
from app.db import reviews as reviews_db
from app.db.locations import resolve_location_codes
from app.db.models import Place, PlaceImage
from app.db.session import engine
from app.models.schemas import PlaceCreate, PlaceTranslationInput

logger = logging.getLogger(__name__)

_BATCH_CHUNK_RETRIES = 3


def persist_place_translations(
    place_code: str, translations: PlaceTranslationInput | None, session: Session
) -> None:
    """Upsert scraper-provided non-English place translations."""

    if not isinstance(translations, PlaceTranslationInput):
        return

    any_written = False
    for field, lang_map in [
        ("name", translations.name),
        ("description", translations.description),
        ("address", translations.address),
    ]:
        if not lang_map:
            continue
        for lang, text in lang_map.items():
            if lang and text and lang != "en":
                ct_db.upsert_translation(
                    entity_type="place",
                    entity_code=place_code,
                    field=field,
                    lang=lang,
                    text=text,
                    source="scraper",
                    session=session,
                    commit=False,
                )
                any_written = True
    if any_written:
        session.commit()


def _incoming_image_count(place_data: PlaceCreate) -> int:
    if place_data.image_blobs:
        return len(place_data.image_blobs)
    return len(place_data.image_urls or [])


def _set_images(
    place_data: PlaceCreate,
    session: Session,
    *,
    image_policy: str,
    existing_image_count: int,
) -> str:
    """Apply image policy. Returns replaced | preserved | none."""

    incoming_count = _incoming_image_count(place_data)
    should_replace = False
    if image_policy == "missing_only":
        should_replace = existing_image_count == 0 and incoming_count > 0
    elif image_policy == "incoming_gte_existing":
        should_replace = incoming_count > 0 and incoming_count >= existing_image_count
    else:
        raise ValueError(f"Unknown image policy: {image_policy}")

    if should_replace:
        if place_data.image_blobs:
            try:
                place_images.set_images_from_blobs(
                    place_data.place_code, place_data.image_blobs, session=session
                )
            except Exception as e:
                logger.error(
                    "Failed to store image blobs for %s: %s",
                    place_data.place_code,
                    e,
                    exc_info=True,
                )
                return "none"
        elif place_data.image_urls:
            place_images.set_images_from_urls(
                place_data.place_code, place_data.image_urls, session=session
            )
        return "replaced"

    if incoming_count > 0 and existing_image_count > incoming_count:
        return "preserved"
    return "none"


def upsert_single_place(
    place_data: PlaceCreate,
    session: Session,
    existing_map: dict[str, Place] | None = None,
    loc_cache: dict[tuple, tuple] | None = None,
    image_counts: dict[str, int] | None = None,
    image_policy: str = "missing_only",
) -> tuple[Place, str, str]:
    """Create or update one place and scraper-owned related data."""

    city_str = getattr(place_data, "city", None)
    state_str = getattr(place_data, "state", None)
    country_str = getattr(place_data, "country", None)

    loc_key = (city_str, state_str, country_str)
    if loc_cache is not None:
        if loc_key not in loc_cache:
            loc_cache[loc_key] = resolve_location_codes(city_str, state_str, country_str, session)
        city_code, state_code, country_code = loc_cache[loc_key]
    else:
        city_code, state_code, country_code = resolve_location_codes(
            city_str, state_str, country_str, session
        )

    existing = (
        existing_map.get(place_data.place_code)
        if existing_map is not None
        else places_db.get_place_by_code(place_data.place_code, session)
    )

    shared_kwargs = {
        "session": session,
        "name": place_data.name,
        "religion": place_data.religion,
        "place_type": place_data.place_type,
        "lat": place_data.lat,
        "lng": place_data.lng,
        "address": place_data.address,
        "opening_hours": place_data.opening_hours,
        "utc_offset_minutes": getattr(place_data, "utc_offset_minutes", None),
        "description": place_data.description,
        "website_url": place_data.website_url,
        "source": place_data.source,
        "city": city_str,
        "state": state_str,
        "country": country_str,
        "city_code": city_code,
        "state_code": state_code,
        "country_code": country_code,
    }

    if existing:
        row = places_db.update_place(place_code=place_data.place_code, **shared_kwargs)
        action = "updated"
    else:
        row = places_db.create_place(place_code=place_data.place_code, **shared_kwargs)
        action = "created"

    existing_image_count = (
        image_counts.get(place_data.place_code, 0)
        if image_counts is not None
        else session.exec(
            select(func.count())
            .select_from(PlaceImage)
            .where(PlaceImage.place_code == place_data.place_code)
        ).one()
    )
    image_action = _set_images(
        place_data,
        session,
        image_policy=image_policy,
        existing_image_count=int(existing_image_count or 0),
    )

    if place_data.attributes:
        attr_db.bulk_upsert_attributes(place_data.place_code, place_data.attributes, session)
        session.commit()

    if place_data.external_reviews:
        reviews_db.upsert_external_reviews(
            place_data.place_code, place_data.external_reviews, session
        )

    if place_data.translations:
        persist_place_translations(place_data.place_code, place_data.translations, session)

    return row, action, image_action


def process_place_chunk(
    chunk: list[PlaceCreate],
    *,
    image_policy: str = "missing_only",
) -> list[dict]:
    """Upsert one chunk of places using a dedicated short-lived session."""

    chunk_codes = [p.place_code for p in chunk]
    last_op_err: OperationalError | None = None

    for attempt in range(_BATCH_CHUNK_RETRIES):
        if attempt:
            delay = 2 ** (attempt - 1)
            logger.warning(
                "Chunk DB retry %d/%d (%d places) in %ds: %s",
                attempt + 1,
                _BATCH_CHUNK_RETRIES,
                len(chunk),
                delay,
                last_op_err,
            )
            time.sleep(delay)

        results: list[dict] = []
        with Session(engine) as session:
            try:
                existing_rows = session.exec(
                    select(Place).where(Place.place_code.in_(chunk_codes))
                ).all()
                image_count_rows = session.exec(
                    select(PlaceImage.place_code, func.count())
                    .where(PlaceImage.place_code.in_(chunk_codes))
                    .group_by(PlaceImage.place_code)
                ).all()
            except OperationalError as e:
                last_op_err = e
                continue
            except Exception as e:
                logger.warning("Chunk pre-fetch failed (%s places): %s", len(chunk), e)
                return [
                    {"place_code": p.place_code, "ok": False, "error": f"db_unavailable: {e}"}
                    for p in chunk
                ]

            existing_map: dict[str, Place] = {p.place_code: p for p in existing_rows}
            image_counts = {str(place_code): int(count) for place_code, count in image_count_rows}
            loc_cache: dict[tuple, tuple] = {}

            for place_data in chunk:
                try:
                    _, action, image_action = upsert_single_place(
                        place_data,
                        session,
                        existing_map,
                        loc_cache,
                        image_counts,
                        image_policy,
                    )
                    results.append(
                        {
                            "place_code": place_data.place_code,
                            "ok": True,
                            "action": action,
                            "image_action": image_action,
                        }
                    )
                except IntegrityError:
                    session.rollback()
                    try:
                        existing = places_db.get_place_by_code(place_data.place_code, session)
                        if existing:
                            existing_map[place_data.place_code] = existing
                        _, action, image_action = upsert_single_place(
                            place_data,
                            session,
                            existing_map,
                            loc_cache,
                            image_counts,
                            image_policy,
                        )
                        results.append(
                            {
                                "place_code": place_data.place_code,
                                "ok": True,
                                "action": action,
                                "image_action": image_action,
                            }
                        )
                    except Exception as retry_err:
                        session.rollback()
                        logger.warning(
                            "Failed to upsert place %s after IntegrityError retry: %s",
                            place_data.place_code,
                            retry_err,
                            exc_info=True,
                        )
                        results.append(
                            {
                                "place_code": place_data.place_code,
                                "ok": False,
                                "error": str(retry_err),
                            }
                        )
                except Exception as e:
                    session.rollback()
                    logger.warning(
                        "Failed to upsert place %s: %s",
                        place_data.place_code,
                        e,
                        exc_info=True,
                    )
                    results.append(
                        {"place_code": place_data.place_code, "ok": False, "error": str(e)}
                    )

        return results

    logger.warning(
        "Chunk pre-fetch failed after %d attempts (%d places): %s",
        _BATCH_CHUNK_RETRIES,
        len(chunk),
        last_op_err,
    )
    return [
        {"place_code": p.place_code, "ok": False, "error": f"db_unavailable: {last_op_err}"}
        for p in chunk
    ]
