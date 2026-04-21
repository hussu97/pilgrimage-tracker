"""
Tests for the sync lock fields (P1.10-11):

- last_sync_at must be stamped when at least one place successfully syncs
- last_sync_at must NOT be stamped when the whole sync failed
- Per-place sync_status is set to "pending" at sync start and updated to
  "synced" / "failed" per batch
"""

from __future__ import annotations

import secrets
from datetime import UTC, datetime
from unittest.mock import patch

import pytest
from sqlmodel import Session, select

from app.db.models import DataLocation, ScrapedPlace, ScraperRun


def _make_run_with_places(
    session: Session, n_places: int = 2, with_raw_data: bool = True
) -> ScraperRun:
    loc = DataLocation(
        code=f"loc_{secrets.token_hex(4)}",
        name="Test Location",
        source_type="gmaps",
        config={"city": "Dubai"},
    )
    session.add(loc)
    session.commit()

    run = ScraperRun(
        run_code=f"run_{secrets.token_hex(4)}",
        location_code=loc.code,
        status="completed",
    )
    session.add(run)
    session.commit()
    session.refresh(run)

    for i in range(n_places):
        raw = (
            {
                "place_code": f"plc_{i}",
                "name": f"Test Place {i}",
                "lat": 25.0 + i * 0.01,
                "lng": 55.0 + i * 0.01,
                "google_place_id": f"ChIJ_test_{i}",
                "religion": "islam",
                "place_type": "mosque",
                "city": "Dubai",
                "country": "UAE",
            }
            if with_raw_data
            else {}
        )
        place = ScrapedPlace(
            run_code=run.run_code,
            place_code=f"plc_{i}",
            name=f"Test Place {i}",
            raw_data=raw,
            detail_fetch_status="success",
            enrichment_status="complete",
            quality_score=0.9,
            quality_gate="passed",
        )
        session.add(place)
    session.commit()
    return run


@pytest.mark.asyncio
async def test_last_sync_at_stamped_on_successful_sync(test_engine, monkeypatch):
    # After sync_run_to_server_async completes with >0 synced, last_sync_at
    # must be set to a UTC datetime within the last few seconds.
    monkeypatch.setattr("app.db.scraper.engine", test_engine)

    with Session(test_engine) as session:
        run = _make_run_with_places(session, n_places=2)
        run_code = run.run_code

    # Stub the batch POST to report every place as synced
    async def fake_batch(payloads, server_url, client, api_key):
        return len(payloads), []

    with (
        patch("app.db.scraper._post_batch_async", side_effect=fake_batch),
        patch("app.db.scraper._trigger_seo_generation_async", return_value=None),
    ):
        from app.db.scraper import sync_run_to_server_async

        await sync_run_to_server_async(run_code, "http://127.0.0.1:8000")

    with Session(test_engine) as session:
        run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
        assert run is not None
        assert run.last_sync_at is not None
        # SQLite strips tz info even though Postgres uses TIMESTAMPTZ. Normalize
        # both sides so the "within the last minute" assertion works on both.
        stamped = run.last_sync_at
        if stamped.tzinfo is None:
            stamped = stamped.replace(tzinfo=UTC)
        assert (datetime.now(UTC) - stamped).total_seconds() < 60
        # Every place should have sync_status="synced"
        places = session.exec(select(ScrapedPlace).where(ScrapedPlace.run_code == run_code)).all()
        assert all(p.sync_status == "synced" for p in places), [
            (p.place_code, p.sync_status) for p in places
        ]


@pytest.mark.asyncio
async def test_last_sync_at_not_stamped_when_nothing_synced(test_engine, monkeypatch):
    # If the sync batch returns zero synced (full failure), last_sync_at
    # must remain None so the admin "last successful sync" clock doesn't
    # get a misleading update.
    monkeypatch.setattr("app.db.scraper.engine", test_engine)

    with Session(test_engine) as session:
        run = _make_run_with_places(session, n_places=2)
        run_code = run.run_code

    async def fake_batch_all_fail(payloads, server_url, client, api_key):
        return 0, [f"{p['place_code']}:500 internal error" for p in payloads]

    async def fake_individual_all_fail(payload, server_url, client, api_key):
        return 0, [f"{payload['place_code']}:500 internal error"]

    with (
        patch("app.db.scraper._post_batch_async", side_effect=fake_batch_all_fail),
        patch("app.db.scraper._post_individual_async", side_effect=fake_individual_all_fail),
        patch("app.db.scraper._trigger_seo_generation_async", return_value=None),
    ):
        from app.db.scraper import sync_run_to_server_async

        await sync_run_to_server_async(run_code, "http://127.0.0.1:8000")

    with Session(test_engine) as session:
        run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
        assert run is not None
        assert run.last_sync_at is None
        places = session.exec(select(ScrapedPlace).where(ScrapedPlace.run_code == run_code)).all()
        assert all(p.sync_status == "failed" for p in places)
