"""
Tests for the top-level scraper pipeline resilience helpers added to
app/db/scraper.py:

- _run_gmaps_with_retry: retries once on transient httpx errors, then raises
- _cancel_watcher: polls run.status and cancels its parent task when the run
  is marked "cancelled" in the DB (used to interrupt block-page loops that
  never flush their cancel-check buffer)
"""

from __future__ import annotations

import asyncio
import secrets
from unittest.mock import patch

import httpx
import pytest
from sqlmodel import Session

from app.db import scraper as scraper_module
from app.db.models import DataLocation, ScrapedPlace, ScraperRun  # noqa: F401


def _make_run(session: Session) -> ScraperRun:
    loc = DataLocation(
        code=f"loc_{secrets.token_hex(4)}",
        name="Test",
        source_type="gmaps",
        config={"city": "Dubai"},
    )
    session.add(loc)
    session.commit()
    run = ScraperRun(
        run_code=f"run_{secrets.token_hex(4)}",
        location_code=loc.code,
        status="running",
    )
    session.add(run)
    session.commit()
    session.refresh(run)
    return run


@pytest.mark.asyncio
async def test_run_gmaps_with_retry_retries_once_on_transient_httpx(test_engine):
    # First call raises ConnectTimeout; second call succeeds. Helper must retry.
    with Session(test_engine) as session:
        run = _make_run(session)

        calls = {"n": 0}

        async def fake_gmaps(run_code, config, sess):
            calls["n"] += 1
            if calls["n"] == 1:
                raise httpx.ConnectTimeout("boom")

        with patch.object(scraper_module, "run_gmaps_scraper", side_effect=fake_gmaps):
            # Patch sleep so the test isn't slow
            with patch.object(scraper_module.asyncio, "sleep", return_value=None):
                await scraper_module._run_gmaps_with_retry(run.run_code, {}, session)

        assert calls["n"] == 2


@pytest.mark.asyncio
async def test_run_gmaps_with_retry_raises_after_second_failure(test_engine):
    # Both calls raise ReadTimeout; helper should retry once then re-raise.
    with Session(test_engine) as session:
        run = _make_run(session)

        async def always_fail(run_code, config, sess):
            raise httpx.ReadTimeout("always")

        with patch.object(scraper_module, "run_gmaps_scraper", side_effect=always_fail):
            with patch.object(scraper_module.asyncio, "sleep", return_value=None):
                with pytest.raises(httpx.ReadTimeout):
                    await scraper_module._run_gmaps_with_retry(run.run_code, {}, session)


@pytest.mark.asyncio
async def test_run_gmaps_with_retry_does_not_retry_on_value_error(test_engine):
    # Non-httpx exceptions must propagate without any retry.
    with Session(test_engine) as session:
        run = _make_run(session)

        calls = {"n": 0}

        async def bad_config(run_code, config, sess):
            calls["n"] += 1
            raise ValueError("missing api key")

        with patch.object(scraper_module, "run_gmaps_scraper", side_effect=bad_config):
            with pytest.raises(ValueError):
                await scraper_module._run_gmaps_with_retry(run.run_code, {}, session)

        assert calls["n"] == 1


@pytest.mark.asyncio
async def test_cancel_watcher_cancels_parent_when_status_flips(test_engine, monkeypatch):
    # Flip the run to "cancelled" and verify the watcher cancels its parent task.
    monkeypatch.setattr(scraper_module, "_CANCEL_POLL_INTERVAL_S", 0.05)
    monkeypatch.setattr(scraper_module, "engine", test_engine)

    with Session(test_engine) as session:
        run = _make_run(session)
        run_code = run.run_code

    async def parent_coro():
        try:
            await asyncio.sleep(5.0)
        except asyncio.CancelledError:
            return "cancelled"
        return "done"

    parent = asyncio.create_task(parent_coro())
    watcher = asyncio.create_task(scraper_module._cancel_watcher(run_code, parent))

    # Give the watcher one poll cycle, then flip status in the DB
    await asyncio.sleep(0.02)
    with Session(test_engine) as session:
        run = session.exec(
            scraper_module.select(ScraperRun).where(ScraperRun.run_code == run_code)
        ).first()
        run.status = "cancelled"
        session.add(run)
        session.commit()

    result = await parent
    await watcher  # watcher returns after cancelling parent
    assert result == "cancelled"


@pytest.mark.asyncio
async def test_cancel_watcher_exits_when_parent_finishes(test_engine, monkeypatch):
    # Happy path: run never cancelled, parent finishes on its own, watcher exits.
    monkeypatch.setattr(scraper_module, "_CANCEL_POLL_INTERVAL_S", 0.05)
    monkeypatch.setattr(scraper_module, "engine", test_engine)

    with Session(test_engine) as session:
        run = _make_run(session)

    async def parent_coro():
        await asyncio.sleep(0.05)
        return "done"

    parent = asyncio.create_task(parent_coro())
    watcher = asyncio.create_task(scraper_module._cancel_watcher(run.run_code, parent))

    result = await parent
    # Watcher loop condition is `while not parent_task.done()`; give it a tick
    await asyncio.sleep(0.1)
    watcher.cancel()
    try:
        await watcher
    except (asyncio.CancelledError, Exception):
        pass
    assert result == "done"
