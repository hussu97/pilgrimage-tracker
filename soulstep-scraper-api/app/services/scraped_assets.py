from __future__ import annotations

import asyncio
import base64
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import httpx
from sqlmodel import Session, func, select

from app.config import settings
from app.db.models import ScrapedAsset, ScrapedPlace, ScraperRun
from app.logger import get_logger

logger = get_logger(__name__)

PLACE_IMAGE = "place_image"
REVIEW_IMAGE = "review_image"
PENDING = "pending_upload"
UPLOADED = "uploaded"
FAILED = "failed"
NEEDS_RECAPTURE = "needs_recapture"
SKIPPED = "skipped"


@dataclass(slots=True)
class AssetStats:
    pending: int
    uploaded: int
    failed: int
    oldest_pending_asset_age_s: int | None


def _now() -> datetime:
    return datetime.now(UTC)


def preserve_source_media_fields(details: dict[str, Any]) -> dict[str, Any]:
    raw = dict(details)
    source_urls = list(raw.get("image_urls") or [])
    raw["source_image_urls"] = source_urls
    raw["image_urls"] = []

    reviews = [dict(review) for review in (raw.get("external_reviews") or [])]
    for review in reviews:
        source_photo_urls = list(review.get("photo_urls") or [])
        review["source_photo_urls"] = source_photo_urls
        review["photo_urls"] = []
    raw["external_reviews"] = reviews
    return raw


def build_assets_for_place(
    run_code: str,
    details: dict[str, Any],
    response: dict[str, Any],
) -> list[ScrapedAsset]:
    raw = details
    place_code = raw["place_code"]
    assets: list[ScrapedAsset] = []

    source_urls = list(raw.get("source_image_urls") or [])
    inline_images: list[bytes] = response.pop("_image_bytes", None) or []
    total_place_assets = max(len(source_urls), len(inline_images))
    for idx in range(total_place_assets):
        source_url = source_urls[idx] if idx < len(source_urls) else None
        inline_b64 = None
        captured_via = "source_url"
        if idx < len(inline_images):
            inline_b64 = base64.b64encode(inline_images[idx]).decode("ascii")
            captured_via = "inline_bytes"
        assets.append(
            ScrapedAsset(
                run_code=run_code,
                place_code=place_code,
                asset_kind=PLACE_IMAGE,
                asset_index=idx,
                source_url=source_url,
                status=PENDING if (inline_b64 or source_url) else FAILED,
                captured_via=captured_via,
                inline_bytes_b64=inline_b64,
                last_error=None if (inline_b64 or source_url) else "No image source available",
            )
        )

    review_images: list[tuple[int, int, bytes]] = response.pop("_review_image_bytes", None) or []
    review_bytes_map = {(rev_idx, photo_idx): data for rev_idx, photo_idx, data in review_images}
    for rev_idx, review in enumerate(raw.get("external_reviews") or []):
        source_photo_urls = list(review.get("source_photo_urls") or [])
        inline_photo_indexes = sorted(
            photo_idx for idx, photo_idx in review_bytes_map if idx == rev_idx
        )
        total_review_assets = max(
            len(source_photo_urls),
            (max(inline_photo_indexes) + 1) if inline_photo_indexes else 0,
        )
        for photo_idx in range(total_review_assets):
            source_url = (
                source_photo_urls[photo_idx] if photo_idx < len(source_photo_urls) else None
            )
            inline_b64 = None
            captured_via = "source_url"
            if (rev_idx, photo_idx) in review_bytes_map:
                inline_b64 = base64.b64encode(review_bytes_map[(rev_idx, photo_idx)]).decode(
                    "ascii"
                )
                captured_via = "inline_bytes"
            assets.append(
                ScrapedAsset(
                    run_code=run_code,
                    place_code=place_code,
                    asset_kind=REVIEW_IMAGE,
                    review_index=rev_idx,
                    asset_index=photo_idx,
                    source_url=source_url,
                    status=PENDING if (inline_b64 or source_url) else FAILED,
                    captured_via=captured_via,
                    inline_bytes_b64=inline_b64,
                    last_error=None
                    if (inline_b64 or source_url)
                    else "No review image source available",
                )
            )

    return assets


def get_asset_stats(run_code: str, session: Session) -> AssetStats:
    pending = session.exec(
        select(func.count())
        .select_from(ScrapedAsset)
        .where(ScrapedAsset.run_code == run_code)
        .where(ScrapedAsset.status == PENDING)
    ).one()
    uploaded = session.exec(
        select(func.count())
        .select_from(ScrapedAsset)
        .where(ScrapedAsset.run_code == run_code)
        .where(ScrapedAsset.status == UPLOADED)
    ).one()
    failed = session.exec(
        select(func.count())
        .select_from(ScrapedAsset)
        .where(ScrapedAsset.run_code == run_code)
        .where(ScrapedAsset.status.in_([FAILED, NEEDS_RECAPTURE]))
    ).one()

    oldest = session.exec(
        select(ScrapedAsset.created_at)
        .where(ScrapedAsset.run_code == run_code)
        .where(ScrapedAsset.status == PENDING)
        .order_by(ScrapedAsset.created_at.asc())
    ).first()

    oldest_age = None
    if oldest is not None:
        oldest_dt = oldest if oldest.tzinfo else oldest.replace(tzinfo=UTC)
        oldest_age = int((_now() - oldest_dt).total_seconds())

    return AssetStats(
        pending=int(pending or 0),
        uploaded=int(uploaded or 0),
        failed=int(failed or 0),
        oldest_pending_asset_age_s=oldest_age,
    )


def _place_resource_name(place_code: str) -> str:
    if place_code.startswith("gplc_"):
        return f"places/{place_code[5:]}"
    return place_code


async def _recapture_asset(asset_id: int, engine) -> bool:
    from app.collectors.gmaps_browser import BrowserGmapsCollector
    from app.scrapers.base import get_async_rate_limiter

    with Session(engine) as session:
        asset = session.get(ScrapedAsset, asset_id)
        if not asset:
            return False
        place = session.exec(
            select(ScrapedPlace)
            .where(ScrapedPlace.run_code == asset.run_code)
            .where(ScrapedPlace.place_code == asset.place_code)
        ).first()
        if not place:
            return False
        lat = place.lat or 0.0
        lng = place.lng or 0.0
        place_name = _place_resource_name(asset.place_code)

    collector = BrowserGmapsCollector(session_lat=lat, session_lng=lng)
    async with httpx.AsyncClient(timeout=35.0) as client:
        response = await collector.fetch_details_split(
            place_name,
            "",
            get_async_rate_limiter(),
            client,
        )

    with Session(engine) as session:
        asset = session.get(ScrapedAsset, asset_id)
        if not asset:
            return False
        place = session.exec(
            select(ScrapedPlace)
            .where(ScrapedPlace.run_code == asset.run_code)
            .where(ScrapedPlace.place_code == asset.place_code)
        ).first()
        if not place:
            return False

        raw = dict(place.raw_data or {})
        if asset.asset_kind == PLACE_IMAGE:
            source_urls = list(raw.get("source_image_urls") or [])
            response_urls = list(response.get("photo_urls") or [])
            if asset.asset_index < len(response_urls):
                source_urls[asset.asset_index : asset.asset_index + 1] = [
                    response_urls[asset.asset_index]
                ]
            raw["source_image_urls"] = source_urls
            inline_images: list[bytes] = response.get("_image_bytes") or []
            if asset.asset_index < len(inline_images):
                asset.inline_bytes_b64 = base64.b64encode(inline_images[asset.asset_index]).decode(
                    "ascii"
                )
                asset.captured_via = "recaptured"
            asset.source_url = (
                source_urls[asset.asset_index]
                if asset.asset_index < len(source_urls)
                else asset.source_url
            )
        else:
            reviews = [dict(review) for review in (raw.get("external_reviews") or [])]
            response_reviews = response.get("reviews") or []
            if asset.review_index is not None and asset.review_index < len(reviews):
                review = reviews[asset.review_index]
                source_urls = list(review.get("source_photo_urls") or [])
                if asset.review_index < len(response_reviews):
                    fresh_review = response_reviews[asset.review_index]
                    fresh_sources = list(fresh_review.get("photo_urls") or [])
                    if asset.asset_index < len(fresh_sources):
                        source_urls[asset.asset_index : asset.asset_index + 1] = [
                            fresh_sources[asset.asset_index]
                        ]
                review["source_photo_urls"] = source_urls
                reviews[asset.review_index] = review
                raw["external_reviews"] = reviews
                review_images = response.get("_review_image_bytes") or []
                for rev_idx, photo_idx, blob in review_images:
                    if rev_idx == asset.review_index and photo_idx == asset.asset_index:
                        asset.inline_bytes_b64 = base64.b64encode(blob).decode("ascii")
                        asset.captured_via = "recaptured"
                        break
                if asset.asset_index < len(source_urls):
                    asset.source_url = source_urls[asset.asset_index]

        asset.status = PENDING if (asset.inline_bytes_b64 or asset.source_url) else FAILED
        asset.last_error = (
            None if asset.status == PENDING else "Recapture did not yield a usable asset"
        )
        asset.updated_at = _now()
        place.raw_data = raw
        session.add(asset)
        session.add(place)
        session.commit()
    return True


def _patch_place_asset(place: ScrapedPlace, asset: ScrapedAsset, gcs_url: str) -> None:
    raw = dict(place.raw_data or {})
    if asset.asset_kind == PLACE_IMAGE:
        urls = list(raw.get("image_urls") or [])
        while len(urls) <= asset.asset_index:
            urls.append("")
        urls[asset.asset_index] = gcs_url
        raw["image_urls"] = urls
    else:
        reviews = [dict(review) for review in (raw.get("external_reviews") or [])]
        if asset.review_index is not None and asset.review_index < len(reviews):
            photo_urls = list(reviews[asset.review_index].get("photo_urls") or [])
            while len(photo_urls) <= asset.asset_index:
                photo_urls.append("")
            photo_urls[asset.asset_index] = gcs_url
            reviews[asset.review_index]["photo_urls"] = photo_urls
            raw["external_reviews"] = reviews
    place.raw_data = raw


def _bump_run_counter(run: ScraperRun, asset: ScrapedAsset, succeeded: bool) -> None:
    if asset.asset_kind == REVIEW_IMAGE:
        if succeeded:
            run.review_images_downloaded += 1
        else:
            run.review_images_failed += 1
    else:
        if succeeded:
            run.images_downloaded += 1
        else:
            run.images_failed += 1


async def _process_asset_id(asset_id: int, engine) -> None:
    from app.collectors.image_download import _download_image
    from app.services.gcs import upload_image_bytes, upload_review_image_bytes

    with Session(engine) as session:
        asset = session.get(ScrapedAsset, asset_id)
        if not asset or asset.status not in {PENDING, NEEDS_RECAPTURE}:
            return
        current_status = asset.status
        asset.attempt_count += 1
        asset.updated_at = _now()
        session.add(asset)
        session.commit()

    if current_status == NEEDS_RECAPTURE:
        try:
            await _recapture_asset(asset_id, engine)
        except Exception as exc:
            with Session(engine) as session:
                fresh = session.get(ScrapedAsset, asset_id)
                if not fresh:
                    return
                run = session.exec(
                    select(ScraperRun).where(ScraperRun.run_code == fresh.run_code)
                ).first()
                if fresh:
                    fresh.status = FAILED
                    fresh.last_error = f"Recapture failed: {str(exc)[:500]}"
                    fresh.updated_at = _now()
                    session.add(fresh)
                if run and fresh:
                    _bump_run_counter(run, fresh, succeeded=False)
                    session.add(run)
                session.commit()
            return

    with Session(engine) as session:
        asset = session.get(ScrapedAsset, asset_id)
        if not asset:
            return

    blob: bytes | None = None
    if asset.inline_bytes_b64:
        blob = base64.b64decode(asset.inline_bytes_b64)
    elif asset.source_url:
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            blob = await _download_image(asset.source_url, client)
        if blob is None:
            with Session(engine) as session:
                fresh = session.get(ScrapedAsset, asset_id)
                if fresh:
                    fresh.status = NEEDS_RECAPTURE if fresh.attempt_count == 1 else FAILED
                    fresh.last_error = f"Asset download failed for source_url={fresh.source_url}"
                    fresh.updated_at = _now()
                    session.add(fresh)
                    if fresh.status == FAILED:
                        run = session.exec(
                            select(ScraperRun).where(ScraperRun.run_code == fresh.run_code)
                        ).first()
                        if run:
                            _bump_run_counter(run, fresh, succeeded=False)
                            session.add(run)
                    session.commit()
            return

    upload_fn = (
        upload_review_image_bytes if asset.asset_kind == REVIEW_IMAGE else upload_image_bytes
    )
    gcs_url = upload_fn(blob) if blob else None

    with Session(engine) as session:
        fresh = session.get(ScrapedAsset, asset_id)
        if not fresh:
            return
        place = session.exec(
            select(ScrapedPlace)
            .where(ScrapedPlace.run_code == fresh.run_code)
            .where(ScrapedPlace.place_code == fresh.place_code)
        ).first()
        run = session.exec(select(ScraperRun).where(ScraperRun.run_code == fresh.run_code)).first()
        if gcs_url and place:
            _patch_place_asset(place, fresh, gcs_url)
            fresh.gcs_url = gcs_url
            fresh.status = UPLOADED
            fresh.last_error = None
            fresh.inline_bytes_b64 = None
            fresh.updated_at = _now()
            session.add(place)
            if run:
                _bump_run_counter(run, fresh, succeeded=True)
                session.add(run)
        else:
            fresh.status = FAILED
            fresh.last_error = "GCS upload failed"
            fresh.updated_at = _now()
            if run:
                _bump_run_counter(run, fresh, succeeded=False)
                session.add(run)
        session.add(fresh)
        session.commit()


async def drain_scraped_assets(
    run_code: str,
    engine,
    *,
    max_workers: int | None = None,
    stop_event: asyncio.Event | None = None,
) -> AssetStats:
    concurrency = max_workers or settings.image_concurrency

    while True:
        with Session(engine) as session:
            asset_ids = list(
                session.exec(
                    select(ScrapedAsset.id)
                    .where(ScrapedAsset.run_code == run_code)
                    .where(ScrapedAsset.status.in_([PENDING, NEEDS_RECAPTURE]))
                    .order_by(ScrapedAsset.created_at.asc())
                    .limit(concurrency)
                ).all()
            )
            stats = get_asset_stats(run_code, session)

        if not asset_ids:
            if stop_event is None or stop_event.is_set():
                return stats
            await asyncio.sleep(0.5)
            continue

        await asyncio.gather(*[_process_asset_id(asset_id, engine) for asset_id in asset_ids])
        await asyncio.sleep(0)


async def wait_for_asset_barrier(
    run_code: str, engine, *, timeout_s: int | None = None
) -> AssetStats:
    max_wait = timeout_s or 300
    deadline = time.monotonic() + max_wait
    while True:
        stats = await drain_scraped_assets(run_code, engine, max_workers=settings.image_concurrency)
        if stats.pending == 0:
            return stats
        if (
            stats.oldest_pending_asset_age_s is not None
            and stats.oldest_pending_asset_age_s > max_wait
        ):
            with Session(engine) as session:
                run = session.exec(
                    select(ScraperRun).where(ScraperRun.run_code == run_code)
                ).first()
                if run:
                    run.status = "interrupted"
                    run.error_message = (
                        f"Asset backlog exceeded {max_wait}s during image barrier; "
                        f"{stats.pending} asset(s) still pending."
                    )
                    session.add(run)
                    session.commit()
            raise RuntimeError(f"Asset barrier exceeded {max_wait}s for run {run_code}")
        if time.monotonic() >= deadline:
            raise RuntimeError(f"Timed out waiting for asset barrier for run {run_code}")
        await asyncio.sleep(1)
