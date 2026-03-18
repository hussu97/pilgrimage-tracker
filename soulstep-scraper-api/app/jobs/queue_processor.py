"""Capacity-aware job queue processor.

Runs as a background asyncio task inside the scraper API service.
Polls every 15 seconds (or on-demand via trigger_queue_check()) to:
1. Count active jobs per region
2. Dispatch queued runs to regions with available capacity
"""

from __future__ import annotations

import asyncio
import logging
import threading

from sqlmodel import Session, select

from app.db.models import ScraperRun
from app.db.session import engine

logger = logging.getLogger(__name__)

_stop = False
_event = asyncio.Event()

POLL_INTERVAL = 15  # seconds
MAX_LOCAL_JOBS = 2  # max parallel jobs when SCRAPER_DISPATCH=local


def _extract_region(execution_name: str | None) -> str | None:
    """Extract the region from a Cloud Run execution resource name.

    Format: projects/{p}/locations/{region}/jobs/{j}/executions/{e}
    """
    if not execution_name:
        return None
    parts = execution_name.split("/")
    try:
        idx = parts.index("locations")
        return parts[idx + 1]
    except (ValueError, IndexError):
        return None


def _count_active_per_region(session: Session) -> dict[str, int]:
    """Count runs in pending/running state per region."""
    from app.config import settings

    active_runs = session.exec(
        select(ScraperRun).where(ScraperRun.status.in_(["pending", "running"]))
    ).all()

    counts: dict[str, int] = {r["region"]: 0 for r in settings.region_capacity}
    for run in active_runs:
        region = _extract_region(run.cloud_run_execution) or settings.available_regions[0]
        if region in counts:
            counts[region] += 1
        else:
            # Run is in an unknown region — count against the first region
            counts[settings.available_regions[0]] = counts.get(settings.available_regions[0], 0) + 1
    return counts


def process_queue() -> int:
    """Dispatch queued runs up to regional capacity. Returns number dispatched."""
    from app.config import settings

    dispatched = 0

    with Session(engine) as session:
        if settings.scraper_dispatch == "local":
            # Local mode — no regional capacity, just a simple limit
            active_count = session.exec(
                select(ScraperRun).where(ScraperRun.status.in_(["pending", "running"]))
            ).all()
            available_slots = MAX_LOCAL_JOBS - len(active_count)
            if available_slots <= 0:
                return 0

            queued = session.exec(
                select(ScraperRun)
                .where(ScraperRun.status == "queued")
                .order_by(ScraperRun.created_at)
                .limit(available_slots)
            ).all()

            if not queued:
                return 0

            dispatch_list: list[tuple[str, bool]] = []
            for run in queued:
                run.status = "pending"
                session.add(run)
                is_resume = run.stage is not None or run.processed_items > 0
                dispatch_list.append((run.run_code, is_resume))

            session.commit()

            # Dispatch outside the DB transaction
            for run_code, is_resume in dispatch_list:
                try:
                    if is_resume:
                        from app.jobs.dispatcher import _resume_local

                        threading.Thread(
                            target=_resume_local, args=(run_code,), daemon=True
                        ).start()
                    else:
                        from app.jobs.dispatcher import _run_local

                        threading.Thread(target=_run_local, args=(run_code,), daemon=True).start()
                    dispatched += 1
                except Exception:
                    logger.exception("Failed to dispatch %s locally", run_code)
                    with Session(engine) as err_session:
                        err_run = err_session.exec(
                            select(ScraperRun).where(ScraperRun.run_code == run_code)
                        ).first()
                        if err_run and err_run.status == "pending":
                            err_run.status = "queued"
                            err_session.add(err_run)
                            err_session.commit()

            return dispatched

        # Cloud Run mode — capacity-aware multi-region dispatch
        active = _count_active_per_region(session)

        # Build list of available region slots, ordered by most available first
        slots: list[str] = []
        for rc in settings.region_capacity:
            available = rc["max_jobs"] - active.get(rc["region"], 0)
            if available > 0:
                slots.extend([rc["region"]] * available)

        if not slots:
            return 0

        queued = session.exec(
            select(ScraperRun)
            .where(ScraperRun.status == "queued")
            .order_by(ScraperRun.created_at)
            .limit(len(slots))
        ).all()

        if not queued:
            return 0

        # Assign regions and mark as pending
        cloud_dispatch_list: list[tuple[str, str, bool]] = []
        for i, run in enumerate(queued):
            region = slots[i]
            run.status = "pending"
            session.add(run)
            is_resume = run.stage is not None or run.processed_items > 0
            cloud_dispatch_list.append((run.run_code, region, is_resume))

        session.commit()

    # Dispatch outside the DB transaction (network calls)
    for run_code, region, is_resume in cloud_dispatch_list:
        try:
            from app.jobs.dispatcher import dispatch_cloud_run

            action = "resume" if is_resume else "run"
            dispatch_cloud_run(run_code, action, region=region)
            dispatched += 1
        except Exception:
            logger.exception("Failed to dispatch %s to %s", run_code, region)
            # Mark back as queued so it retries on next cycle
            with Session(engine) as err_session:
                err_run = err_session.exec(
                    select(ScraperRun).where(ScraperRun.run_code == run_code)
                ).first()
                if err_run and err_run.status == "pending":
                    err_run.status = "queued"
                    err_session.add(err_run)
                    err_session.commit()

    return dispatched


async def start_queue_processor() -> None:
    """Poll loop: checks queue every 15s or immediately on trigger."""
    global _stop
    _stop = False
    _event.clear()

    while not _stop:
        try:
            count = await asyncio.to_thread(process_queue)
            if count:
                logger.info("Queue processor dispatched %d job(s)", count)
        except Exception:
            logger.exception("Queue processor error")

        # Wait for either the interval or an explicit trigger
        try:
            await asyncio.wait_for(_event.wait(), timeout=POLL_INTERVAL)
            _event.clear()
        except TimeoutError:
            pass


def trigger_queue_check() -> None:
    """Signal the processor to run immediately (called after creating/resuming runs)."""
    _event.set()


def stop_queue_processor() -> None:
    """Signal the processor to stop."""
    global _stop
    _stop = True
    _event.set()
