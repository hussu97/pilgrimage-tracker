"""Cloud Run Job: Translate all missing content translations.

Collects all (entity_type, entity_code, field, lang, en_text) tuples that are
missing from ContentTranslation, translates via translate_batch_browser_parallel,
and saves incrementally. Creates a BulkTranslationJob record for admin visibility.

Also migrates legacy name_{lang} PlaceAttribute rows (written by the scraper)
into ContentTranslation on first run (idempotent).

Usage:
    python -m app.jobs.translate_content
"""

import asyncio
import logging
import os
import time
from datetime import UTC, datetime
from secrets import token_hex

from sqlmodel import Session, select

from app.api.v1.admin.bulk_translations import (
    _collect_missing_items,
    _flush_translations,
)
from app.db import content_translations as ct_db
from app.db.models import BulkTranslationJob, PlaceAttribute, User
from app.db.session import engine, run_migrations
from app.services.browser_translation import BrowserSessionPool, translate_batch_browser_parallel

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

_TARGET_LANGS = ["ar", "hi", "te", "ml"]
_ENTITY_TYPES = ["place", "review", "city", "attribute_def"]
_SOURCE_LANG = "en"
_PROGRESS_UPDATE_INTERVAL = 10

# Legacy PlaceAttribute codes written by the scraper (e.g. name_ar, name_hi).
# Migrated once into ContentTranslation rows with source="scraper".
_LEGACY_ATTR_LANGS: dict[str, tuple[str, str]] = {
    f"name_{lang}": ("name", lang) for lang in _TARGET_LANGS
}


def _migrate_legacy_attributes() -> int:
    """Copy legacy name_{lang} PlaceAttribute rows into ContentTranslation (idempotent)."""
    migrated = 0
    with Session(engine) as session:
        for attr_code, (field, lang) in _LEGACY_ATTR_LANGS.items():
            attrs = session.exec(
                select(PlaceAttribute).where(PlaceAttribute.attribute_code == attr_code)
            ).all()
            for attr in attrs:
                if not attr.value_text:
                    continue
                existing = ct_db.get_translation("place", attr.place_code, field, lang, session)
                if existing:
                    continue
                ct_db.upsert_translation(
                    entity_type="place",
                    entity_code=attr.place_code,
                    field=field,
                    lang=lang,
                    text=attr.value_text,
                    source="scraper",
                    session=session,
                )
                migrated += 1
        session.commit()
    return migrated


def _get_system_user_code() -> str | None:
    """Return the user_code of any admin user, for job record attribution."""
    try:
        with Session(engine) as s:
            user = s.exec(select(User).where(User.is_admin == True)).first()  # noqa: E712
            return user.user_code if user else None
    except Exception:
        return None


def _create_job(job_code: str, user_code: str | None) -> bool:
    """Create a BulkTranslationJob row. Returns False if user_code is unavailable."""
    if user_code is None:
        logger.warning("translate_content: no admin user found — skipping job record creation")
        return False
    try:
        with Session(engine) as s:
            job = BulkTranslationJob(
                job_code=job_code,
                created_by_user_code=user_code,
                status="running",
                target_langs=_TARGET_LANGS,
                entity_types=_ENTITY_TYPES,
                source_lang=_SOURCE_LANG,
                started_at=datetime.now(UTC),
                created_at=datetime.now(UTC),
            )
            s.add(job)
            s.commit()
        return True
    except Exception as e:
        logger.warning("translate_content: failed to create job record: %s", e)
        return False


def _update_job_total(job_code: str, total: int) -> None:
    try:
        with Session(engine) as s:
            job = s.exec(
                select(BulkTranslationJob).where(BulkTranslationJob.job_code == job_code)
            ).first()
            if job:
                job.total_items = total
                s.add(job)
                s.commit()
    except Exception:
        pass


def _finish_job(job_code: str, completed: int, failed: int, error: str | None = None) -> None:
    try:
        with Session(engine) as s:
            job = s.exec(
                select(BulkTranslationJob).where(BulkTranslationJob.job_code == job_code)
            ).first()
            if job:
                job.completed_items = completed
                job.failed_items = failed
                job.completed_at = datetime.now(UTC)
                if error:
                    job.status = "failed"
                    job.error_message = error
                else:
                    job.status = "completed" if failed == 0 else "completed_with_errors"
                s.add(job)
                s.commit()
    except Exception:
        pass


async def _run_translation(job_code: str, has_job_record: bool) -> None:
    """Core async translation logic."""
    pool = BrowserSessionPool()
    completed_total = 0
    failed_total = 0

    try:
        # ── Collect missing items ─────────────────────────────────────────────
        logger.info("translate_content: collecting missing translations")
        with Session(engine) as session:
            missing = _collect_missing_items(session, _ENTITY_TYPES, _TARGET_LANGS, _SOURCE_LANG)

        logger.info("translate_content: %d items to translate", len(missing))

        if has_job_record:
            _update_job_total(job_code, len(missing))

        if not missing:
            logger.info("translate_content: nothing to translate — done")
            if has_job_record:
                _finish_job(job_code, 0, 0)
            return

        # ── Group by language ─────────────────────────────────────────────────
        from collections import defaultdict

        by_lang: dict[str, list[tuple[int, str, str, str, str]]] = defaultdict(list)
        for idx, (entity_type, entity_code, field, lang, en_text) in enumerate(missing):
            by_lang[lang].append((idx, entity_type, entity_code, field, en_text))

        # ── Translate per lang ────────────────────────────────────────────────
        for lang, group in by_lang.items():
            logger.info("translate_content: translating %d items to %s", len(group), lang)

            texts = [en_text for _, _, _, _, en_text in group]
            meta = [
                (entity_type, entity_code, field) for _, entity_type, entity_code, field, _ in group
            ]

            pending_translations: list[tuple[str, str, str, str, str]] = []
            items_since_flush = 0

            async def on_result(
                local_i: int,
                translated: str | None,
                _meta: list = meta,
                _lang: str = lang,
                _pending: list = pending_translations,
            ) -> None:
                nonlocal completed_total, failed_total, items_since_flush
                entity_type, entity_code, field = _meta[local_i]
                if translated:
                    completed_total += 1
                    _pending.append((entity_type, entity_code, field, _lang, translated))
                else:
                    failed_total += 1

                items_since_flush += 1
                if items_since_flush >= _PROGRESS_UPDATE_INTERVAL:
                    _flush_translations(_pending, completed_total, failed_total, job_code)
                    _pending.clear()
                    items_since_flush = 0

            multi_size = int(os.environ.get("BROWSER_TRANSLATE_MULTI_SIZE", "5"))
            await translate_batch_browser_parallel(
                texts,
                target_lang=lang,
                source_lang=_SOURCE_LANG,
                multi_size=multi_size,
                on_result=on_result,
                pool=pool,
                is_cancelled=lambda: False,
            )

            # Flush remaining
            if pending_translations:
                _flush_translations(pending_translations, completed_total, failed_total, job_code)
                pending_translations.clear()
                items_since_flush = 0

        logger.info(
            "translate_content: done — completed=%d failed=%d",
            completed_total,
            failed_total,
        )
        if has_job_record:
            _finish_job(job_code, completed_total, failed_total)

    except Exception as exc:
        logger.exception("translate_content: job failed")
        if has_job_record:
            _finish_job(job_code, completed_total, failed_total, error=str(exc))
        raise
    finally:
        try:
            await pool.shutdown()
        except Exception:
            pass


def main() -> None:
    start_time = time.time()
    logger.info("translate_content: starting")

    # ── Migrations ────────────────────────────────────────────────────────────
    logger.info("translate_content: running catalog migrations")
    run_migrations()
    logger.info("translate_content: migrations complete")

    # ── Legacy attribute migration ────────────────────────────────────────────
    migrated = _migrate_legacy_attributes()
    logger.info("translate_content: migrated %d legacy name_{lang} attribute rows", migrated)

    # ── Create job record ─────────────────────────────────────────────────────
    job_code = "btj_worker_" + token_hex(6)
    user_code = _get_system_user_code()
    has_job_record = _create_job(job_code, user_code)
    logger.info("translate_content: job_code=%s has_record=%s", job_code, has_job_record)

    # ── Run translation ───────────────────────────────────────────────────────
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(_run_translation(job_code, has_job_record))
    finally:
        loop.close()

    elapsed = time.time() - start_time
    logger.info("translate_content: total elapsed %.1fs", elapsed)


if __name__ == "__main__":
    main()
