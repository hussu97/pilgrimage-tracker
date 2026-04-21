"""
Tests for per-place detail-fetch resilience (P0.3) and the fail-fast
threshold (P0.7) added to app/scrapers/gmaps.py.

Does not spin up the real GMaps collector — exercises the pure helpers
_should_fail_fast and _flush_failed_places_buffer, plus the interaction
of FailFastError with db/scraper.py's top-level exception handler.
"""

from __future__ import annotations

import secrets

from sqlmodel import Session, select

from app.db.models import DataLocation, ScrapedPlace, ScraperRun
from app.scrapers.gmaps import (
    _FAIL_FAST_FAILURE_RATIO,
    _FAIL_FAST_MIN_ATTEMPTS,
    FailFastError,
    _flush_failed_places_buffer,
    _should_fail_fast,
)


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


class TestFailFastPredicate:
    def test_does_not_trip_below_min_attempts_even_at_100_percent(self):
        # Even if every single attempt failed, we don't trip until at least
        # _FAIL_FAST_MIN_ATTEMPTS (500) places have been tried.
        assert _FAIL_FAST_MIN_ATTEMPTS == 500
        assert _should_fail_fast(attempted=100, failed=100) is False
        assert _should_fail_fast(attempted=499, failed=499) is False

    def test_trips_at_threshold_boundary(self):
        # At exactly MIN_ATTEMPTS with exactly the failure ratio: trip.
        attempted = _FAIL_FAST_MIN_ATTEMPTS
        failed = int(attempted * _FAIL_FAST_FAILURE_RATIO)
        assert _should_fail_fast(attempted, failed) is True

    def test_does_not_trip_below_ratio(self):
        assert _should_fail_fast(attempted=500, failed=249) is False

    def test_trips_well_above_threshold(self):
        assert _should_fail_fast(attempted=1000, failed=800) is True


class TestFlushFailedPlacesBuffer:
    def test_persists_failed_places_with_correct_status(self, test_engine):
        with Session(test_engine) as session:
            run = _make_run(session)

            failed = [
                ("places/A", "gplc_A", "quota exceeded"),
                ("places/B", "gplc_B", "network timeout"),
            ]
            _flush_failed_places_buffer(failed, run.run_code, session)

            stored = session.exec(
                select(ScrapedPlace).where(ScrapedPlace.run_code == run.run_code)
            ).all()
            assert len(stored) == 2
            by_code = {p.place_code: p for p in stored}
            assert by_code["gplc_A"].detail_fetch_status == "failed"
            assert by_code["gplc_A"].detail_fetch_error == "quota exceeded"
            # enrichment_status="filtered" is already in the enrichment skip
            # set (complete / filtered), so downstream stages naturally bypass
            # these rows without any extra filter.
            assert by_code["gplc_A"].enrichment_status == "filtered"
            assert by_code["gplc_B"].detail_fetch_status == "failed"
            assert by_code["gplc_B"].detail_fetch_error == "network timeout"

    def test_empty_buffer_is_noop(self, test_engine):
        # Empty input must not raise or commit anything.
        with Session(test_engine) as session:
            run = _make_run(session)
            _flush_failed_places_buffer([], run.run_code, session)
            stored = session.exec(
                select(ScrapedPlace).where(ScrapedPlace.run_code == run.run_code)
            ).all()
            assert stored == []


class TestFailFastErrorPropagation:
    def test_fail_fast_error_message_includes_counts(self):
        err = FailFastError("Detail-fetch failure rate 400/500 exceeded 50%")
        assert "400/500" in str(err)
        # Must be catchable as Exception (not BaseException) so existing
        # outer handlers stay compatible.
        try:
            raise err
        except Exception as caught:
            assert isinstance(caught, FailFastError)
