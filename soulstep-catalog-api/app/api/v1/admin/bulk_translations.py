"""Admin — Bulk Browser Translation Jobs.

Provides endpoints to start, monitor, cancel, and delete long-running bulk
content-translation jobs powered by the headless browser translation backend.

Each job collects all (entity_type, entity_code, field, lang) tuples that are
missing from the ContentTranslation table and batch-translates them via
translate_batch_browser_parallel, saving results incrementally.

The job runs in a dedicated background thread with its own asyncio event loop,
completely isolated from the FastAPI main event loop so HTTP requests remain
responsive while a translation job is running.
"""

from __future__ import annotations

import asyncio
import logging
import threading
from datetime import UTC, datetime
from secrets import token_hex
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Response
from pydantic import BaseModel
from sqlmodel import Session, col, select

from app.api.deps import AdminDep
from app.db import content_translations as ct_db
from app.db.models import BulkTranslationJob, City, Place, PlaceAttributeDefinition, Review
from app.db.session import SessionDep, engine
from app.services.browser_translation import BrowserSessionPool, translate_batch_browser_parallel

logger = logging.getLogger(__name__)

router = APIRouter()

# ── Thread tracking ─────────────────────────────────────────────────────────────
# Per-job thread and cancel event. Protected by _thread_lock.
_active_job_threads: dict[str, threading.Thread] = {}
_cancel_events: dict[str, threading.Event] = {}
_thread_lock = threading.Lock()

# Translatable fields by entity type
_PLACE_FIELDS = ["name", "description"]
_REVIEW_FIELDS = ["title", "body"]
_CITY_FIELDS = ["name"]
_ATTRIBUTE_DEF_FIELDS = ["name"]

# Flush pending translations + update progress counters every N results
_PROGRESS_UPDATE_INTERVAL = 10


# ── Pydantic schemas ────────────────────────────────────────────────────────────


class StartJobBody(BaseModel):
    target_langs: list[str]  # e.g. ["ar", "hi", "te", "ml"]
    entity_types: list[str] = ["place"]  # ["place", "review"]
    source_lang: str = "en"
    multi_size: int = 5  # texts per browser request (1–8)


class BulkTranslationJobOut(BaseModel):
    job_code: str
    status: str
    target_langs: list[str]
    entity_types: list[str]
    source_lang: str
    total_items: int
    completed_items: int
    failed_items: int
    skipped_items: int
    progress_pct: float
    error_message: str | None
    started_at: str | None
    completed_at: str | None
    created_at: str

    @classmethod
    def from_orm(cls, job: BulkTranslationJob) -> BulkTranslationJobOut:
        progress = (
            job.completed_items / max(job.total_items, 1) * 100 if job.total_items > 0 else 0.0
        )
        return cls(
            job_code=job.job_code,
            status=job.status,
            target_langs=job.target_langs or [],
            entity_types=job.entity_types or [],
            source_lang=job.source_lang,
            total_items=job.total_items,
            completed_items=job.completed_items,
            failed_items=job.failed_items,
            skipped_items=job.skipped_items,
            progress_pct=round(progress, 2),
            error_message=job.error_message,
            started_at=job.started_at.isoformat() if job.started_at else None,
            completed_at=job.completed_at.isoformat() if job.completed_at else None,
            created_at=job.created_at.isoformat(),
        )


class JobListResponse(BaseModel):
    items: list[BulkTranslationJobOut]
    total: int
    page: int
    page_size: int


# ── Helpers ─────────────────────────────────────────────────────────────────────


def _is_job_cancelled(job_code: str, cancel_event: threading.Event | None) -> bool:
    """Return True if the job should stop.

    Checks the threading.Event first (fast path), then falls back to the DB
    cancel_requested_at flag (handles cases where the event was never set but
    the DB was updated, e.g. via a different process).
    """
    if cancel_event is not None and cancel_event.is_set():
        return True
    try:
        with Session(engine) as s:
            job = s.exec(
                select(BulkTranslationJob).where(BulkTranslationJob.job_code == job_code)
            ).first()
            return job is not None and job.cancel_requested_at is not None
    except Exception:
        return False


def _flush_translations(
    pending: list[tuple[str, str, str, str, str]],
    completed: int,
    failed: int,
    job_code: str,
) -> None:
    """Write pending translations and update job progress counters in one DB session."""
    try:
        with Session(engine) as s:
            for entity_type, entity_code, field, lang, text in pending:
                ct_db.upsert_translation(
                    entity_type=entity_type,
                    entity_code=entity_code,
                    field=field,
                    lang=lang,
                    text=text,
                    source="browser_translate",
                    session=s,
                )
            j = s.exec(
                select(BulkTranslationJob).where(BulkTranslationJob.job_code == job_code)
            ).first()
            if j:
                j.completed_items = completed
                j.failed_items = failed
                s.add(j)
            s.commit()
    except Exception:
        logger.exception("bulk_translation: failed to flush translations for job %s", job_code)


def _collect_missing_items(
    session: Session,
    entity_types: list[str],
    target_langs: list[str],
    source_lang: str,
) -> list[tuple[str, str, str, str, str]]:
    """Collect (entity_type, entity_code, field, lang, en_text) tuples missing translation."""
    missing: list[tuple[str, str, str, str, str]] = []

    for lang in target_langs:
        if lang == source_lang:
            continue

        for entity_type in entity_types:
            if entity_type == "place":
                rows = session.exec(select(Place)).all()
                for row in rows:
                    for field in _PLACE_FIELDS:
                        en_text = getattr(row, field, None)
                        if not en_text or not en_text.strip():
                            continue
                        existing = ct_db.get_translation(
                            "place", row.place_code, field, lang, session
                        )
                        if existing is None:
                            missing.append(("place", row.place_code, field, lang, en_text))

            elif entity_type == "review":
                rows = session.exec(select(Review)).all()
                for row in rows:
                    for field in _REVIEW_FIELDS:
                        en_text = getattr(row, field, None)
                        if not en_text or not en_text.strip():
                            continue
                        existing = ct_db.get_translation(
                            "review", row.review_code, field, lang, session
                        )
                        if existing is None:
                            missing.append(("review", row.review_code, field, lang, en_text))

            elif entity_type == "city":
                rows = session.exec(select(City)).all()
                for row in rows:
                    for field in _CITY_FIELDS:
                        en_text = getattr(row, field, None)
                        if not en_text or not en_text.strip():
                            continue
                        existing = ct_db.get_translation(
                            "city", row.city_code, field, lang, session
                        )
                        if existing is None:
                            missing.append(("city", row.city_code, field, lang, en_text))

            elif entity_type == "attribute_def":
                rows = session.exec(select(PlaceAttributeDefinition)).all()
                for row in rows:
                    for field in _ATTRIBUTE_DEF_FIELDS:
                        en_text = getattr(row, field, None)
                        if not en_text or not en_text.strip():
                            continue
                        existing = ct_db.get_translation(
                            "attribute_def", row.attribute_code, field, lang, session
                        )
                        if existing is None:
                            missing.append(
                                ("attribute_def", row.attribute_code, field, lang, en_text)
                            )

    return missing


# ── Background task ─────────────────────────────────────────────────────────────


async def _run_bulk_translation_job(
    job_code: str,
    multi_size: int,
    pool: BrowserSessionPool | None = None,
    cancel_event: threading.Event | None = None,
) -> None:
    """Execute a bulk translation job end-to-end.

    Designed to run inside a dedicated thread's event loop via
    _run_job_in_thread. The cancel_event allows the thread to be stopped
    cooperatively between micro-batches without blocking the main FastAPI loop.
    """
    logger.info("bulk_translation: starting job %s", job_code)

    try:
        # ── Phase 1: mark running ─────────────────────────────────────────────
        with Session(engine) as session:
            job = session.exec(
                select(BulkTranslationJob).where(BulkTranslationJob.job_code == job_code)
            ).first()
            if job is None:
                logger.error("bulk_translation: job %s not found", job_code)
                return

            # Check if already cancelled before we even start
            if job.cancel_requested_at is not None:
                job.status = "cancelled"
                job.completed_at = datetime.now(UTC)
                session.add(job)
                session.commit()
                return

            job.status = "running"
            job.started_at = datetime.now(UTC)
            session.add(job)
            session.commit()

            entity_types = list(job.entity_types or [])
            target_langs = list(job.target_langs or [])
            source_lang = job.source_lang

        # ── Phase 2: collect missing items ────────────────────────────────────
        with Session(engine) as session:
            missing = _collect_missing_items(session, entity_types, target_langs, source_lang)

        with Session(engine) as session:
            job = session.exec(
                select(BulkTranslationJob).where(BulkTranslationJob.job_code == job_code)
            ).first()
            if job is None:
                return
            job.total_items = len(missing)
            session.add(job)
            session.commit()

        logger.info("bulk_translation: job %s — %d items to translate", job_code, len(missing))

        if not missing:
            with Session(engine) as session:
                job = session.exec(
                    select(BulkTranslationJob).where(BulkTranslationJob.job_code == job_code)
                ).first()
                if job:
                    job.status = "completed"
                    job.completed_at = datetime.now(UTC)
                    session.add(job)
                    session.commit()
            return

        # ── Phase 3: translate per-lang group ──────────────────────────────────
        from collections import defaultdict

        by_lang: dict[str, list[tuple[int, str, str, str, str]]] = defaultdict(list)
        for global_idx, (entity_type, entity_code, field, lang, en_text) in enumerate(missing):
            by_lang[lang].append((global_idx, entity_type, entity_code, field, en_text))

        completed_total = 0
        failed_total = 0

        for lang, group in by_lang.items():
            # Check for cancellation between lang passes
            if _is_job_cancelled(job_code, cancel_event):
                with Session(engine) as session:
                    job = session.exec(
                        select(BulkTranslationJob).where(BulkTranslationJob.job_code == job_code)
                    ).first()
                    if job:
                        # Distinguish user-cancel (cancel_requested_at set) from server shutdown
                        if job.cancel_requested_at is not None:
                            job.status = "cancelled"
                        else:
                            job.status = "failed"
                            job.error_message = "Interrupted: server shutdown"
                        job.completed_at = datetime.now(UTC)
                        session.add(job)
                        session.commit()
                logger.info(
                    "bulk_translation: job %s stopped between lang passes (lang=%s)",
                    job_code,
                    lang,
                )
                return

            texts = [en_text for _, _, _, _, en_text in group]
            meta = [
                (entity_type, entity_code, field) for _, entity_type, entity_code, field, _ in group
            ]

            # Accumulate translations in memory; flush every _PROGRESS_UPDATE_INTERVAL results
            pending_translations: list[tuple[str, str, str, str, str]] = []
            items_since_flush = 0

            async def on_result(
                local_i: int,
                translated: str | None,
                _meta: list = meta,
                _lang: str = lang,
                _pending: list = pending_translations,  # bind now to avoid B023
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

            await translate_batch_browser_parallel(
                texts,
                target_lang=lang,
                source_lang=source_lang,
                multi_size=multi_size,
                on_result=on_result,
                pool=pool,
                is_cancelled=lambda: cancel_event is not None and cancel_event.is_set(),
            )

            # Flush any remaining pending translations after this lang pass completes
            if pending_translations or items_since_flush > 0:
                _flush_translations(pending_translations, completed_total, failed_total, job_code)
                pending_translations.clear()
                items_since_flush = 0

        # ── Phase 4: mark complete ─────────────────────────────────────────────
        final_status = "completed" if failed_total == 0 else "completed_with_errors"
        with Session(engine) as session:
            job = session.exec(
                select(BulkTranslationJob).where(BulkTranslationJob.job_code == job_code)
            ).first()
            if job:
                job.status = final_status
                job.completed_at = datetime.now(UTC)
                job.completed_items = completed_total
                job.failed_items = failed_total
                session.add(job)
                session.commit()

        logger.info(
            "bulk_translation: job %s done — status=%s completed=%d failed=%d",
            job_code,
            final_status,
            completed_total,
            failed_total,
        )

    except Exception as exc:
        logger.exception("bulk_translation: job %s failed with exception", job_code)
        try:
            with Session(engine) as session:
                job = session.exec(
                    select(BulkTranslationJob).where(BulkTranslationJob.job_code == job_code)
                ).first()
                if job:
                    job.status = "failed"
                    job.error_message = f"{type(exc).__name__}: {exc}"
                    job.completed_at = datetime.now(UTC)
                    session.add(job)
                    session.commit()
        except Exception:
            pass  # Best-effort


def _run_job_in_thread(job_code: str, multi_size: int) -> None:
    """Thread entry point: creates its own asyncio event loop and runs the translation job.

    Using a dedicated thread+loop isolates all browser/DB work from the FastAPI
    main event loop, so HTTP requests remain responsive during a long translation run.
    """
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    with _thread_lock:
        cancel_event = _cancel_events.get(job_code)

    pool = BrowserSessionPool()
    try:
        loop.run_until_complete(
            _run_bulk_translation_job(job_code, multi_size, pool=pool, cancel_event=cancel_event)
        )
    except Exception:
        logger.exception("bulk_translation: unhandled exception in thread for job %s", job_code)
    finally:
        # If the job is still in a non-terminal state, the thread was interrupted
        # (e.g., server shutdown signalled the event but the job didn't finish cleanly).
        try:
            with Session(engine) as s:
                job = s.exec(
                    select(BulkTranslationJob).where(BulkTranslationJob.job_code == job_code)
                ).first()
                if job and job.status in ("pending", "running"):
                    job.status = "failed"
                    job.error_message = "Interrupted: server shutdown"
                    job.completed_at = datetime.now(UTC)
                    s.add(job)
                    s.commit()
                    logger.warning(
                        "bulk_translation: job %s was still running at thread exit — marked failed",
                        job_code,
                    )
        except Exception:
            pass  # Best-effort

        # Shut down this thread's browser pool
        try:
            loop.run_until_complete(pool.shutdown())
        except Exception:
            pass
        finally:
            loop.close()

        # Remove from tracking
        with _thread_lock:
            _active_job_threads.pop(job_code, None)
            _cancel_events.pop(job_code, None)

        logger.info("bulk_translation: thread for job %s exited", job_code)


# ── Endpoints ───────────────────────────────────────────────────────────────────


@router.post("/translations/jobs", response_model=BulkTranslationJobOut)
async def start_translation_job(
    body: StartJobBody,
    admin: AdminDep,
    session: SessionDep,
) -> BulkTranslationJobOut:
    """Start a new bulk translation job.

    Returns 409 if a job is already running — each job spawns its own Chromium
    instance(s) so concurrent jobs would exhaust system resources.
    """
    # Guard against concurrent jobs — prune any threads that have already exited
    # (a thread may still be in its finally/cleanup block after the job finishes,
    # so we check is_alive() rather than just whether the dict is non-empty).
    with _thread_lock:
        dead = [jc for jc, t in _active_job_threads.items() if not t.is_alive()]
        for jc in dead:
            _active_job_threads.pop(jc, None)
            _cancel_events.pop(jc, None)

        if _active_job_threads:
            raise HTTPException(
                status_code=409,
                detail=(
                    "A translation job is already running. "
                    "Cancel or wait for it to finish before starting a new one."
                ),
            )

    multi_size = max(1, min(8, body.multi_size))
    job_code = "btj_" + token_hex(8)
    job = BulkTranslationJob(
        job_code=job_code,
        created_by_user_code=admin.user_code,
        status="pending",
        target_langs=body.target_langs,
        entity_types=body.entity_types,
        source_lang=body.source_lang,
        created_at=datetime.now(UTC),
    )
    session.add(job)
    session.commit()
    session.refresh(job)

    cancel_event = threading.Event()
    thread = threading.Thread(
        target=_run_job_in_thread,
        args=(job_code, multi_size),
        daemon=True,
        name=f"bulk-translation-{job_code}",
    )

    with _thread_lock:
        _active_job_threads[job_code] = thread
        _cancel_events[job_code] = cancel_event

    thread.start()

    logger.info(
        "bulk_translation: started job %s in thread (langs=%s entity_types=%s multi_size=%d)",
        job_code,
        body.target_langs,
        body.entity_types,
        multi_size,
    )
    return BulkTranslationJobOut.from_orm(job)


@router.get("/translations/jobs", response_model=JobListResponse)
def list_translation_jobs(
    admin: AdminDep,
    session: SessionDep,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=2000)] = 50,
) -> JobListResponse:
    """List all bulk translation jobs, newest first."""
    total = session.exec(select(BulkTranslationJob)).all()
    total_count = len(total)

    jobs = session.exec(
        select(BulkTranslationJob)
        .order_by(col(BulkTranslationJob.created_at).desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    return JobListResponse(
        items=[BulkTranslationJobOut.from_orm(j) for j in jobs],
        total=total_count,
        page=page,
        page_size=page_size,
    )


@router.get("/translations/jobs/{job_code}", response_model=BulkTranslationJobOut)
def get_translation_job(
    job_code: str,
    admin: AdminDep,
    session: SessionDep,
) -> BulkTranslationJobOut:
    """Get live progress for a specific job."""
    job = session.exec(
        select(BulkTranslationJob).where(BulkTranslationJob.job_code == job_code)
    ).first()
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return BulkTranslationJobOut.from_orm(job)


@router.post("/translations/jobs/{job_code}/cancel", response_model=BulkTranslationJobOut)
def cancel_translation_job(
    job_code: str,
    admin: AdminDep,
    session: SessionDep,
) -> BulkTranslationJobOut:
    """Request cancellation of a job.

    Sets cancel_requested_at in the DB and signals the job's threading.Event.
    The background thread will honour it between micro-batches.
    """
    job = session.exec(
        select(BulkTranslationJob).where(BulkTranslationJob.job_code == job_code)
    ).first()
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status in ("completed", "completed_with_errors", "failed", "cancelled"):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot cancel a job with status '{job.status}'",
        )
    job.cancel_requested_at = datetime.now(UTC)
    session.add(job)
    session.commit()
    session.refresh(job)

    # Signal the thread's cancel event so it stops at the next micro-batch boundary
    with _thread_lock:
        cancel_event = _cancel_events.get(job_code)
        if cancel_event is not None:
            cancel_event.set()
            logger.info("bulk_translation: cancel event set for job %s", job_code)

    return BulkTranslationJobOut.from_orm(job)


@router.delete("/translations/jobs/{job_code}", status_code=204)
def delete_translation_job(
    job_code: str,
    admin: AdminDep,
    session: SessionDep,
) -> Response:
    """Delete a completed or failed job. Returns 409 if the job is still running."""
    job = session.exec(
        select(BulkTranslationJob).where(BulkTranslationJob.job_code == job_code)
    ).first()
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status in ("pending", "running"):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete a job with status '{job.status}'. Cancel it first.",
        )
    session.delete(job)
    session.commit()
    return Response(status_code=204)
