"""Cloud Run Job entrypoint.

Reads SCRAPER_RUN_CODE and SCRAPER_RUN_ACTION from environment and
executes the appropriate scraper function. Designed to run as a
Cloud Run Job (non-HTTP, batch execution).

Usage:
    python -m app.jobs.run

Required env vars:
    SCRAPER_RUN_CODE    — the run_code to execute (e.g. run_a1b2c3d4)

Optional env vars:
    SCRAPER_RUN_ACTION  — "run" (default) or "resume"
    All other SCRAPER_* and DATABASE_URL vars from the main service apply.
"""

from __future__ import annotations

import asyncio
import os
import sys

from dotenv import load_dotenv

# Must load .env before any app module is imported (same reason as main.py)
load_dotenv()

if _sentry_dsn := os.environ.get("SENTRY_DSN"):
    import sentry_sdk

    sentry_sdk.init(dsn=_sentry_dsn, traces_sample_rate=0.05, send_default_pii=False)


def main() -> None:
    run_code = os.environ.get("SCRAPER_RUN_CODE", "").strip()
    action = os.environ.get("SCRAPER_RUN_ACTION", "run").strip()

    if not run_code:
        print("ERROR: SCRAPER_RUN_CODE env var is required", file=sys.stderr)
        sys.exit(1)

    if action not in ("run", "resume"):
        print(
            f"ERROR: unknown SCRAPER_RUN_ACTION={action!r} (must be 'run' or 'resume')",
            file=sys.stderr,
        )
        sys.exit(1)

    from app.logger import setup_logging

    setup_logging()

    import logging

    logger = logging.getLogger(__name__)
    logger.info("Cloud Run Job starting: run_code=%s action=%s", run_code, action)

    async def _run_and_cleanup(coro) -> None:
        try:
            await coro
        finally:
            from app.services.browser_pool import shutdown_maps_pool

            await shutdown_maps_pool()

    if action == "resume":
        from app.db.scraper import resume_scraper_task

        asyncio.run(_run_and_cleanup(resume_scraper_task(run_code)))
    else:
        from app.db.scraper import run_scraper_task

        asyncio.run(_run_and_cleanup(run_scraper_task(run_code)))

    logger.info("Cloud Run Job finished: run_code=%s action=%s", run_code, action)


if __name__ == "__main__":
    main()
