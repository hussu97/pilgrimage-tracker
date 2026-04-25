"""Cloud Run Job: direct DB sync from scraper runs to catalog places."""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import bindparam, create_engine, text

from app.db.session import run_migrations
from app.models.schemas import (
    ExternalReviewInput,
    PlaceAttributeInput,
    PlaceCreate,
    PlaceTranslationInput,
)
from app.services.place_ingest import process_place_chunk

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

_QUALITY_GATE = 0.75
_BATCH_SIZE = 50
_VALID_RELIGIONS = {"islam", "hinduism", "christianity", "all"}


@dataclass
class DirectSyncSummary:
    run_code: str | None = None
    dry_run: bool = False
    failed_only: bool = False
    scanned: int = 0
    synced: int = 0
    created: int = 0
    updated: int = 0
    failed: int = 0
    skipped_quality: int = 0
    skipped_name: int = 0
    skipped_build: int = 0
    images_replaced: int = 0
    images_preserved: int = 0
    batches: int = 0
    elapsed_s: float = 0.0
    failure_details: list[str] | None = None


def _sanitize_religion(religion: str | None) -> str:
    """Map unrecognised/unknown religion strings to 'all'."""
    if religion and religion in _VALID_RELIGIONS:
        return religion
    return "all"


def _sanitize_attributes(attributes: list[dict]) -> list[PlaceAttributeInput]:
    """Drop attributes whose values are not accepted by PlaceAttributeInput."""
    result = []
    for attr in attributes:
        val = attr.get("value")
        if isinstance(val, dict):
            continue
        if isinstance(val, list):
            if all(isinstance(item, str) for item in val):
                result.append(PlaceAttributeInput(attribute_code=attr["attribute_code"], value=val))
        elif isinstance(val, str | int | float | bool):
            result.append(PlaceAttributeInput(attribute_code=attr["attribute_code"], value=val))
    return result


def _sanitize_reviews(reviews: list[dict]) -> list[ExternalReviewInput]:
    """Drop reviews with out-of-range rating (e.g. Foursquare tips use 0)."""
    result = []
    for r in reviews:
        rating = r.get("rating")
        if not isinstance(rating, int) or not (1 <= rating <= 5):
            continue
        try:
            result.append(
                ExternalReviewInput(
                    author_name=r.get("author_name", ""),
                    rating=rating,
                    text=r.get("text", ""),
                    time=r.get("time", 0),
                    language=r.get("language", "en"),
                    photo_urls=r.get("photo_urls") or [],
                )
            )
        except Exception:
            pass
    return result


def _is_name_specific_enough(name: str) -> bool:
    """Return False for overly generic single-word place names (e.g. 'Mosque')."""
    generic = frozenset(
        {
            "mosque",
            "masjid",
            "masjed",
            "jama",
            "jamia",
            "church",
            "chapel",
            "cathedral",
            "basilica",
            "temple",
            "mandir",
            "pagoda",
            "stupa",
            "gurudwara",
            "gurdwara",
            "synagogue",
            "shul",
            "shrine",
            "dargah",
            "darga",
            "mazar",
            "mausoleum",
            "monastery",
            "convent",
        }
    )
    words = name.lower().split()
    meaningful = [w for w in words if w not in ("the", "a", "an", "al", "al-", "el", "el-")]
    if len(meaningful) < 2:
        return meaningful[0] not in generic if meaningful else False
    return True


def _coerce_raw_data(raw_data: Any) -> dict:
    if isinstance(raw_data, dict):
        return raw_data
    if isinstance(raw_data, str):
        try:
            data = json.loads(raw_data)
            return data if isinstance(data, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def _build_place_create(place_code: str, name: str, raw_data: dict) -> PlaceCreate | None:
    """Build a PlaceCreate from a ScrapedPlace row. Returns None if data is invalid."""
    data = raw_data
    translations_raw = data.get("translations")
    translations = None
    if isinstance(translations_raw, dict):
        translations = PlaceTranslationInput(
            name=translations_raw.get("name"),
            description=translations_raw.get("description"),
            address=translations_raw.get("address"),
        )

    try:
        return PlaceCreate(
            place_code=place_code,
            name=name or data.get("name", ""),
            religion=_sanitize_religion(data.get("religion")),
            place_type=data.get("place_type", "unknown"),
            lat=float(data.get("lat", 0)),
            lng=float(data.get("lng", 0)),
            address=data.get("address", ""),
            opening_hours=data.get("opening_hours"),
            utc_offset_minutes=data.get("utc_offset_minutes"),
            image_urls=data.get("image_urls") or [],
            description=data.get("description"),
            website_url=data.get("website_url"),
            source=data.get("source"),
            city=data.get("city"),
            state=data.get("state"),
            country=data.get("country"),
            attributes=_sanitize_attributes(data.get("attributes") or []) or None,
            external_reviews=_sanitize_reviews(data.get("external_reviews") or []) or None,
            translations=translations,
        )
    except Exception as e:
        logger.warning("Failed to build PlaceCreate for %s: %s", place_code, e)
        return None


def _process_chunk(chunk: list[PlaceCreate]) -> list[dict]:
    """Compatibility wrapper for existing tests and operators."""
    return process_place_chunk(chunk, image_policy="incoming_gte_existing")


def _status_update_statement() -> Any:
    return text(
        "UPDATE scrapedplace SET sync_status = :status "
        "WHERE run_code = :run_code AND place_code IN :codes"
    ).bindparams(bindparam("codes", expanding=True))


def _mark_status(scraper_engine, run_code: str | None, status: str, codes: list[str]) -> None:
    if not run_code or not codes:
        return
    with scraper_engine.begin() as conn:
        conn.execute(
            _status_update_statement(),
            {"run_code": run_code, "status": status, "codes": codes},
        )


def _load_rate_limit_events(raw: Any) -> dict:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def _json_bind_expression(scraper_engine, param_name: str) -> str:
    if scraper_engine.dialect.name == "postgresql":
        return f"CAST(:{param_name} AS JSON)"
    return f":{param_name}"


def _start_scraper_sync(
    scraper_engine, run_code: str | None, failed_only: bool, dry_run: bool
) -> int:
    if not run_code or dry_run:
        return 0
    with scraper_engine.begin() as conn:
        row = (
            conn.execute(
                text(
                    "SELECT places_synced, rate_limit_events FROM scraperrun "
                    "WHERE run_code = :run_code"
                ),
                {"run_code": run_code},
            )
            .mappings()
            .first()
        )
        if not row:
            return 0
        base_synced = int(row.get("places_synced") or 0) if failed_only else 0
        events = _load_rate_limit_events(row.get("rate_limit_events") if row else None)
        events["direct_catalog_sync"] = {
            "state": "running",
            "dry_run": dry_run,
            "failed_only": failed_only,
            "updated_at": datetime.now(UTC).isoformat(),
        }
        conn.execute(
            text(
                "UPDATE scraperrun SET stage = 'syncing', places_sync_failed = 0, "
                f"rate_limit_events = {_json_bind_expression(scraper_engine, 'rate_limit_events')} "
                "WHERE run_code = :run_code"
            ),
            {"run_code": run_code, "rate_limit_events": json.dumps(events)},
        )
        if not failed_only:
            conn.execute(
                text(
                    "UPDATE scraperrun SET places_synced = 0, "
                    "places_sync_quality_filtered = 0, places_sync_name_filtered = 0, "
                    f"sync_failure_details = {_json_bind_expression(scraper_engine, 'failures')} "
                    "WHERE run_code = :run_code"
                ),
                {"run_code": run_code, "failures": "[]"},
            )
    return base_synced


def _finish_scraper_sync(
    scraper_engine,
    summary: DirectSyncSummary,
    *,
    base_synced: int,
) -> None:
    if not summary.run_code or summary.dry_run:
        return

    failure_details = (summary.failure_details or [])[:500]
    now = datetime.now(UTC)
    with scraper_engine.begin() as conn:
        row = (
            conn.execute(
                text("SELECT rate_limit_events FROM scraperrun WHERE run_code = :run_code"),
                {"run_code": summary.run_code},
            )
            .mappings()
            .first()
        )
        events = _load_rate_limit_events(row.get("rate_limit_events") if row else None)
        events["direct_catalog_sync"] = {
            "state": "completed" if summary.failed == 0 else "failed",
            "synced": summary.synced,
            "failed": summary.failed,
            "quality_filtered": summary.skipped_quality,
            "name_filtered": summary.skipped_name,
            "images_replaced": summary.images_replaced,
            "images_preserved": summary.images_preserved,
            "dry_run": summary.dry_run,
            "failed_only": summary.failed_only,
            "elapsed_s": summary.elapsed_s,
            "updated_at": now.isoformat(),
        }
        conn.execute(
            text(
                "UPDATE scraperrun SET stage = NULL, places_synced = :places_synced, "
                "places_sync_failed = :places_sync_failed, "
                "places_sync_quality_filtered = :quality_filtered, "
                "places_sync_name_filtered = :name_filtered, "
                "last_sync_at = :last_sync_at, "
                f"sync_failure_details = {_json_bind_expression(scraper_engine, 'failure_details')}, "
                f"rate_limit_events = {_json_bind_expression(scraper_engine, 'rate_limit_events')} "
                "WHERE run_code = :run_code"
            ),
            {
                "run_code": summary.run_code,
                "places_synced": base_synced + summary.synced,
                "places_sync_failed": summary.failed,
                "quality_filtered": summary.skipped_quality,
                "name_filtered": summary.skipped_name,
                "failure_details": json.dumps(failure_details),
                "last_sync_at": now if summary.synced > 0 else None,
                "rate_limit_events": json.dumps(events),
            },
        )


def _iter_scraped_rows(scraper_engine, run_code: str | None, failed_only: bool):
    clauses = []
    params: dict[str, Any] = {}
    if run_code:
        clauses.append("run_code = :run_code")
        params["run_code"] = run_code
    if failed_only:
        clauses.append("sync_status = 'failed'")
    where = " WHERE " + " AND ".join(clauses) if clauses else ""
    query = text(
        f"SELECT place_code, name, raw_data, quality_score FROM scrapedplace{where} ORDER BY place_code"
    )
    with scraper_engine.connect() as conn:
        if scraper_engine.dialect.name == "sqlite":
            rows = conn.execute(query, params).all()
            yield from rows
            return
        result = conn.execution_options(stream_results=True, yield_per=_BATCH_SIZE).execute(
            query, params
        )
        yield from result


def sync_places_for_run(
    *,
    run_code: str | None,
    scraper_database_url: str,
    failed_only: bool = False,
    dry_run: bool = False,
    run_catalog_migrations: bool = True,
    raise_on_failure: bool = True,
) -> DirectSyncSummary:
    if failed_only and not run_code:
        raise RuntimeError("--failed-only requires --run-code")

    start_time = time.time()
    if run_catalog_migrations:
        logger.info("sync_places: running catalog migrations")
        run_migrations()

    scraper_engine = create_engine(scraper_database_url, echo=False)
    summary = DirectSyncSummary(
        run_code=run_code, dry_run=dry_run, failed_only=failed_only, failure_details=[]
    )
    base_synced = _start_scraper_sync(scraper_engine, run_code, failed_only, dry_run)

    chunk: list[PlaceCreate] = []
    chunk_codes: list[str] = []

    def mark_status(status: str, codes: list[str]) -> None:
        if not dry_run:
            _mark_status(scraper_engine, run_code, status, codes)

    def flush_chunk() -> None:
        nonlocal chunk, chunk_codes
        if not chunk:
            return
        summary.batches += 1
        logger.info("sync_places: processing batch %d (%d places)", summary.batches, len(chunk))
        if dry_run:
            summary.synced += len(chunk)
            chunk = []
            chunk_codes = []
            return

        results = _process_chunk(chunk)
        synced_codes: list[str] = []
        failed_codes: list[str] = []
        for r in results:
            code = r["place_code"]
            if r.get("ok"):
                summary.synced += 1
                synced_codes.append(code)
                if r.get("action") == "created":
                    summary.created += 1
                else:
                    summary.updated += 1
                if r.get("image_action") == "replaced":
                    summary.images_replaced += 1
                elif r.get("image_action") == "preserved":
                    summary.images_preserved += 1
            else:
                summary.failed += 1
                failed_codes.append(code)
                summary.failure_details.append(f"{code}: {r.get('error', 'unknown error')}")
        mark_status("synced", synced_codes)
        mark_status("failed", failed_codes)
        chunk = []
        chunk_codes = []

    for row in _iter_scraped_rows(scraper_engine, run_code, failed_only):
        place_code, name, raw_data, quality_score = tuple(row)
        summary.scanned += 1
        raw_payload = _coerce_raw_data(raw_data)
        if quality_score is not None and float(quality_score) < _QUALITY_GATE:
            summary.skipped_quality += 1
            mark_status("quality_filtered", [place_code])
            continue
        if not _is_name_specific_enough(name or ""):
            summary.skipped_name += 1
            mark_status("name_filtered", [place_code])
            continue

        place = _build_place_create(place_code, name, raw_payload)
        if place is None:
            summary.skipped_build += 1
            summary.failed += 1
            summary.failure_details.append(f"{place_code}: build_failed")
            mark_status("failed", [place_code])
            continue

        chunk.append(place)
        chunk_codes.append(place_code)
        if len(chunk) >= _BATCH_SIZE:
            flush_chunk()

    flush_chunk()
    summary.elapsed_s = round(time.time() - start_time, 2)
    _finish_scraper_sync(scraper_engine, summary, base_synced=base_synced)

    logger.info("sync_places: summary %s", json.dumps(asdict(summary), default=str, sort_keys=True))
    if summary.failed > 0 and not dry_run and raise_on_failure:
        raise SystemExit(1)
    return summary


def main(argv: list[str] | None = None) -> DirectSyncSummary:
    parser = argparse.ArgumentParser(description="Direct DB sync scraper places into catalog")
    parser.add_argument("--run-code", default=None)
    parser.add_argument("--failed-only", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv if argv is not None else [])

    if _sentry_dsn := os.environ.get("SENTRY_DSN"):
        import sentry_sdk

        sentry_sdk.init(dsn=_sentry_dsn, traces_sample_rate=0.05, send_default_pii=False)

    scraper_db_url = os.environ.get("SCRAPER_DATABASE_URL")
    if not scraper_db_url:
        raise RuntimeError("SCRAPER_DATABASE_URL environment variable is required")

    return sync_places_for_run(
        run_code=args.run_code,
        scraper_database_url=scraper_db_url,
        failed_only=args.failed_only,
        dry_run=args.dry_run,
    )


if __name__ == "__main__":
    main(sys.argv[1:])
