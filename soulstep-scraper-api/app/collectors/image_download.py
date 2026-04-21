"""
Image-download pipeline stage — fetches place image URLs stored in
`ScrapedPlace.raw_data["image_urls"]` and uploads each image to GCS.

Used by the browser-mode scraper as the post-discovery image retrieval
phase. Browser-captured primary/review images are uploaded to GCS inline
during detail-fetch, but URL-list images that weren't captured inline
(e.g. backfill / retry paths) are handled here.
"""

from __future__ import annotations

import asyncio

import httpx
from sqlmodel import Session, select

from app.config import settings
from app.logger import get_logger

logger = get_logger(__name__)

_MAX_IMAGE_ATTEMPTS = 3


def _force_jpeg_url(url: str) -> str:
    """Append -rj to lh3.googleusercontent.com URLs to force JPEG output.

    Google image serving URLs accept format parameters after the size suffix
    (e.g. =w800-h600). Without -rj Google may return WebP, which fails our
    JPEG magic-bytes check.
    """
    if "lh3.googleusercontent.com" in url and "=w" in url and "-rj" not in url:
        return url + "-rj"
    return url


def _is_valid_image(content: bytes) -> bool:
    """Accept JPEG (\xff\xd8\xff) or WebP (RIFF....WEBP) images."""
    if content[:3] == b"\xff\xd8\xff":
        return True
    if content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return True
    return False


_RETRYABLE_STATUS = {429, 500, 502, 503, 504}
_WIKIPEDIA_UA = "SoulStepBot/1.0 (sacred-sites aggregator; +https://soul-step.org)"


async def _download_image(url: str, client: httpx.AsyncClient | None = None) -> bytes | None:
    """Download an image with retries on transient errors.

    Retry policy (up to _MAX_IMAGE_ATTEMPTS total attempts):
    - Network errors (ConnectError, RemoteProtocolError): backoff 1 s, 2 s, 4 s
    - 429 / 5xx: same exponential backoff — these are transient
    - 403 / 404 / other 4xx: permanent failure, no retry

    lh3.googleusercontent.com URLs may return WebP; _force_jpeg_url appends -rj.
    Wikipedia URLs require a User-Agent header to bypass hotlink protection.
    """
    url = _force_jpeg_url(url)
    headers = {}
    if "wikipedia.org" in url or "wikimedia.org" in url:
        headers["User-Agent"] = _WIKIPEDIA_UA

    for attempt in range(_MAX_IMAGE_ATTEMPTS):
        try:
            if client is not None:
                resp = await client.get(url, timeout=20.0, headers=headers)
            else:
                async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as c:
                    resp = await c.get(url, headers=headers)

            if resp.status_code == 200:
                content = resp.content
                if len(content) < 1024:
                    logger.warning(
                        "Downloaded image too small (%d bytes), skipping: %s",
                        len(content),
                        url,
                    )
                    return None
                if not _is_valid_image(content):
                    logger.warning(
                        "Downloaded image failed format check (not JPEG/WebP), skipping: %s", url
                    )
                    return None
                return content

            if resp.status_code in _RETRYABLE_STATUS and attempt < _MAX_IMAGE_ATTEMPTS - 1:
                backoff = 2**attempt  # 1 s, 2 s, 4 s
                logger.warning(
                    "Image download HTTP %d (attempt %d/%d), retrying in %ds: %s",
                    resp.status_code,
                    attempt + 1,
                    _MAX_IMAGE_ATTEMPTS,
                    backoff,
                    url,
                )
                await asyncio.sleep(backoff)
                continue

            logger.warning("Image download HTTP %d: %s", resp.status_code, url)
            return None

        except (httpx.ConnectError, httpx.RemoteProtocolError) as e:
            if attempt < _MAX_IMAGE_ATTEMPTS - 1:
                backoff = 2**attempt
                await asyncio.sleep(backoff)
                continue
            logger.warning(
                "Failed to download image %s after %d attempts: %s", url, _MAX_IMAGE_ATTEMPTS, e
            )
            return None
        except Exception as e:
            logger.warning("Failed to download image %s: %s", url, e)
            return None


_IMAGE_DB_BATCH = 50  # places committed per DB transaction during image write-back


async def download_place_images(run_code: str, engine, max_workers: int | None = None) -> None:
    """Phase 3: Download images and upload directly to GCS.

    Called after fetch_place_details() so detail fetching is not blocked.
    Uses a shared httpx.AsyncClient + asyncio.gather for parallel operations.

    For each place: downloads the photo media URL, uploads bytes to GCS, and
    stores the public GCS URL back in raw_data["image_urls"].

    Skips places where all URLs already start with the GCS prefix (already uploaded).

    Photo media requests (places.googleapis.com/v1/.../media) ARE billed by
    Google at $0.007 per 1000 requests. Photo count per place is capped by
    SCRAPER_MAX_PHOTOS (default 3) to control cost and download time.

    Quality gate: places below GATE_IMAGE_DOWNLOAD are skipped.
    DB writes: committed in batches of _IMAGE_DB_BATCH places to avoid a
    single giant transaction that blocks the DB and spikes memory usage.
    """
    from app.db.models import ScrapedPlace
    from app.pipeline.place_quality import GATE_IMAGE_DOWNLOAD, passes_gate
    from app.services.gcs import upload_image_bytes

    concurrency = max_workers if max_workers is not None else settings.image_concurrency

    _GCS_PREFIX = "https://storage.googleapis.com/"

    # Collect (place_id, url_index, url) tuples to process
    tasks: list[tuple[int, int, str]] = []
    place_ids_with_pending_images: set[int] = set()

    with Session(engine) as session:
        rows = session.exec(
            select(ScrapedPlace.id, ScrapedPlace.raw_data, ScrapedPlace.quality_score).where(
                ScrapedPlace.run_code == run_code
            )
        )
        for place_id, raw_data, quality_score in rows:
            if not passes_gate(quality_score, GATE_IMAGE_DOWNLOAD):
                continue  # filtered by quality gate
            raw = raw_data or {}
            urls = raw.get("image_urls") or []
            if not urls or all(u.startswith(_GCS_PREFIX) for u in urls):
                continue  # no URLs or already uploaded to GCS
            place_ids_with_pending_images.add(place_id)
            for idx, url in enumerate(urls):
                if not url.startswith(_GCS_PREFIX):
                    tasks.append((place_id, idx, url))

    if not tasks:
        logger.info("Image download: no pending images for run %s", run_code)
        return

    logger.info(
        "Image download: %d images for %d places (concurrency=%d)",
        len(tasks),
        len(place_ids_with_pending_images),
        concurrency,
    )

    # Download and upload to GCS in parallel
    sem = asyncio.Semaphore(concurrency)
    gcs_urls_by_place: dict[int, list[tuple[int, str]]] = {}

    async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as http_client:

        async def _fetch_and_upload(place_id: int, idx: int, url: str) -> None:
            async with sem:
                content = await _download_image(url, http_client)
                if content is not None:
                    gcs_url = upload_image_bytes(content)
                    if gcs_url:
                        gcs_urls_by_place.setdefault(place_id, []).append((idx, gcs_url))

        await asyncio.gather(*[_fetch_and_upload(pid, idx, url) for pid, idx, url in tasks])

    uploaded = sum(len(v) for v in gcs_urls_by_place.values())
    images_failed = len(tasks) - uploaded

    # Write GCS URLs back in batches to keep transactions small
    place_ids = list(gcs_urls_by_place.keys())
    for batch_start in range(0, len(place_ids), _IMAGE_DB_BATCH):
        batch = place_ids[batch_start : batch_start + _IMAGE_DB_BATCH]
        with Session(engine) as session:
            for place_id in batch:
                place = session.get(ScrapedPlace, place_id)
                if not place:
                    continue
                raw = dict(place.raw_data or {})
                existing_urls = list(raw.get("image_urls") or [])
                for idx, gcs_url in gcs_urls_by_place[place_id]:
                    if idx < len(existing_urls):
                        existing_urls[idx] = gcs_url
                    else:
                        existing_urls.append(gcs_url)
                raw["image_urls"] = existing_urls
                place.raw_data = raw
                session.add(place)
            session.commit()
        logger.debug(
            "Image write-back: committed batch %d/%d",
            min(batch_start + _IMAGE_DB_BATCH, len(place_ids)),
            len(place_ids),
        )

    # Persist final counters in a separate small transaction
    from app.db.models import ScraperRun

    with Session(engine) as session:
        run_record = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
        if run_record:
            run_record.images_downloaded += uploaded
            run_record.images_failed = images_failed
            session.add(run_record)
        session.commit()

    logger.info(
        "Image download complete: %d/%d images uploaded to GCS for run %s",
        uploaded,
        len(tasks),
        run_code,
    )
