"""
Tests for sync_run_to_server and its sanitisation helpers in app.db.scraper.
"""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from sqlmodel import Session, select

import app.db.scraper as scraper_module
from app.db.models import ScrapedPlace
from app.db.scraper import (
    _sanitize_attributes,
    _sanitize_religion,
    _sanitize_reviews,
    _trigger_seo_generation_async,
    sync_run_to_server,
)

# ── _sanitize_religion ────────────────────────────────────────────────────────


class TestSanitizeReligion:
    def test_valid_islam(self):
        assert _sanitize_religion("islam") == "islam"

    def test_valid_hinduism(self):
        assert _sanitize_religion("hinduism") == "hinduism"

    def test_valid_christianity(self):
        assert _sanitize_religion("christianity") == "christianity"

    def test_valid_all(self):
        assert _sanitize_religion("all") == "all"

    def test_unknown_string_maps_to_all(self):
        assert _sanitize_religion("buddhism") == "all"

    def test_none_maps_to_all(self):
        assert _sanitize_religion(None) == "all"

    def test_empty_string_maps_to_all(self):
        assert _sanitize_religion("") == "all"


# ── _sanitize_attributes ──────────────────────────────────────────────────────


class TestSanitizeAttributes:
    def test_dict_value_dropped(self):
        attrs = [{"key": "parking", "value": {"free": True}}]
        assert _sanitize_attributes(attrs) == []

    def test_str_value_kept(self):
        attrs = [{"key": "phone", "value": "+1234567890"}]
        assert _sanitize_attributes(attrs) == attrs

    def test_int_value_kept(self):
        attrs = [{"key": "capacity", "value": 100}]
        assert _sanitize_attributes(attrs) == attrs

    def test_float_value_kept(self):
        attrs = [{"key": "rating", "value": 4.5}]
        assert _sanitize_attributes(attrs) == attrs

    def test_bool_value_kept(self):
        attrs = [{"key": "wheelchair", "value": True}]
        assert _sanitize_attributes(attrs) == attrs

    def test_list_of_str_kept(self):
        attrs = [{"key": "services", "value": ["wifi", "parking"]}]
        assert _sanitize_attributes(attrs) == attrs

    def test_mixed_list_dropped(self):
        attrs = [{"key": "mixed", "value": ["wifi", 42]}]
        assert _sanitize_attributes(attrs) == []

    def test_multiple_attrs_filtered(self):
        attrs = [
            {"key": "phone", "value": "+1234"},
            {"key": "details", "value": {"nested": True}},
            {"key": "tags", "value": ["a", "b"]},
        ]
        result = _sanitize_attributes(attrs)
        assert len(result) == 2
        assert result[0]["key"] == "phone"
        assert result[1]["key"] == "tags"


# ── _sanitize_reviews ─────────────────────────────────────────────────────────


class TestSanitizeReviews:
    def test_rating_1_kept(self):
        reviews = [{"rating": 1, "text": "poor"}]
        assert _sanitize_reviews(reviews) == reviews

    def test_rating_5_kept(self):
        reviews = [{"rating": 5, "text": "great"}]
        assert _sanitize_reviews(reviews) == reviews

    def test_rating_3_kept(self):
        reviews = [{"rating": 3, "text": "ok"}]
        assert _sanitize_reviews(reviews) == reviews

    def test_rating_0_dropped(self):
        # Foursquare tips have rating=0
        reviews = [{"rating": 0, "text": "a tip"}]
        assert _sanitize_reviews(reviews) == []

    def test_rating_6_dropped(self):
        reviews = [{"rating": 6, "text": "invalid"}]
        assert _sanitize_reviews(reviews) == []

    def test_non_int_rating_dropped(self):
        reviews = [{"rating": "5", "text": "string rating"}]
        assert _sanitize_reviews(reviews) == []

    def test_none_rating_dropped(self):
        reviews = [{"rating": None, "text": "no rating"}]
        assert _sanitize_reviews(reviews) == []

    def test_mixed_reviews_filtered(self):
        reviews = [
            {"rating": 5, "text": "great"},
            {"rating": 0, "text": "tip"},
            {"rating": 3, "text": "ok"},
            {"rating": "4", "text": "string"},
        ]
        result = _sanitize_reviews(reviews)
        assert len(result) == 2
        assert result[0]["rating"] == 5
        assert result[1]["rating"] == 3


# ── sync_run_to_server ────────────────────────────────────────────────────────


def _make_place(run_code: str, place_code: str, session: Session) -> ScrapedPlace:
    """Insert a minimal ScrapedPlace into the session and return it."""
    place = ScrapedPlace(
        run_code=run_code,
        place_code=place_code,
        name="Test Mosque",
        raw_data={
            "name": "Test Mosque",
            "religion": "islam",
            "place_type": "mosque",
            "lat": 25.0,
            "lng": 55.0,
            "address": "123 Main St",
        },
    )
    session.add(place)
    session.commit()
    return place


def _make_mock_session(post_return=None, post_side_effect=None):
    """Return a mock requests.Session instance with a configured .post()."""
    mock_sess = MagicMock()
    if post_side_effect is not None:
        mock_sess.post.side_effect = post_side_effect
    else:
        mock_sess.post.return_value = post_return
    return mock_sess


class TestSyncRunToServer:
    """Tests for sync_run_to_server (async httpx-based implementation).

    Patches _post_batch_async / _post_individual_async to avoid real network calls.
    """

    def test_batch_success(self, test_engine, db_session, monkeypatch):
        """Batch POST returns success → all places synced."""
        run_code = "run_batch_ok"
        _make_place(run_code, "plc_001", db_session)
        _make_place(run_code, "plc_002", db_session)

        monkeypatch.setattr(scraper_module, "engine", test_engine)

        async_batch = AsyncMock(return_value=(2, []))
        with patch("app.db.scraper._post_batch_async", async_batch):
            sync_run_to_server(run_code, "http://127.0.0.1:3000")

        assert async_batch.call_count == 1
        call_args = async_batch.call_args
        url = call_args[0][1]  # server_url positional arg
        assert url == "http://127.0.0.1:3000"

    def test_batch_fallback_on_failure(self, test_engine, db_session, monkeypatch):
        """Batch returns 0 synced → falls back to individual POSTs."""
        run_code = "run_fallback"
        _make_place(run_code, "plc_f01", db_session)
        _make_place(run_code, "plc_f02", db_session)

        monkeypatch.setattr(scraper_module, "engine", test_engine)

        # Batch fails (0 synced, returns code entries for fallback)
        async_batch = AsyncMock(
            return_value=(0, ["plc_f01: batch HTTP 404", "plc_f02: batch HTTP 404"])
        )
        async_individual = AsyncMock(return_value=(1, []))

        with (
            patch("app.db.scraper._post_batch_async", async_batch),
            patch("app.db.scraper._post_individual_async", async_individual),
        ):
            sync_run_to_server(run_code, "http://127.0.0.1:3000")

        assert async_batch.call_count == 1
        # 2 individual fallback calls
        assert async_individual.call_count == 2

    def test_url_scheme_prepended(self, test_engine, db_session, monkeypatch):
        """Bare host:port gets http:// prepended automatically."""
        run_code = "run_scheme"
        _make_place(run_code, "plc_s01", db_session)

        monkeypatch.setattr(scraper_module, "engine", test_engine)

        async_batch = AsyncMock(return_value=(1, []))
        with patch("app.db.scraper._post_batch_async", async_batch):
            sync_run_to_server(run_code, "127.0.0.1:3000")

        url = async_batch.call_args[0][1]
        assert url.startswith("http://")

    def test_https_url_not_double_prefixed(self, test_engine, db_session, monkeypatch):
        """HTTPS URL must not get an extra http:// prepended."""
        run_code = "run_https"
        _make_place(run_code, "plc_h01", db_session)

        monkeypatch.setattr(scraper_module, "engine", test_engine)

        async_batch = AsyncMock(return_value=(1, []))
        with patch("app.db.scraper._post_batch_async", async_batch):
            sync_run_to_server(run_code, "https://api.example.com")

        url = async_batch.call_args[0][1]
        assert url.startswith("https://")
        assert "http://https://" not in url

    def test_no_places(self, test_engine, monkeypatch):
        """Run with zero scraped places — no POST calls made."""
        run_code = "run_empty"
        monkeypatch.setattr(scraper_module, "engine", test_engine)

        async_batch = AsyncMock(return_value=(0, []))
        with patch("app.db.scraper._post_batch_async", async_batch):
            sync_run_to_server(run_code, "http://127.0.0.1:3000")

        async_batch.assert_not_called()

    def test_direct_catalog_sync_triggers_control_endpoint(
        self, test_engine, db_session, monkeypatch
    ):
        """Direct mode starts the catalog control job instead of POSTing batches."""
        from app.config import settings
        from app.db.models import DataLocation, ScraperRun

        run_code = "run_direct_catalog_sync"
        db_session.add(DataLocation(code="loc_direct", name="Direct City", type="city"))
        db_session.add(
            ScraperRun(run_code=run_code, location_code="loc_direct", status="completed")
        )
        db_session.commit()
        monkeypatch.setattr(scraper_module, "engine", test_engine)
        monkeypatch.setattr(settings, "direct_catalog_sync", True)
        monkeypatch.setattr(settings, "catalog_api_key", "tok_direct")

        mock_resp = MagicMock()
        mock_resp.status_code = 202
        mock_resp.text = ""
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=mock_resp)

        with (
            patch("app.db.scraper.httpx.AsyncClient", return_value=mock_client),
            patch("app.db.scraper._post_batch_async") as async_batch,
        ):
            sync_run_to_server(run_code, "https://catalog-api.soul-step.org")

        async_batch.assert_not_called()
        mock_client.post.assert_awaited_once()
        url = mock_client.post.await_args.args[0]
        kwargs = mock_client.post.await_args.kwargs
        assert url == "https://catalog-api.soul-step.org/api/v1/admin/sync-places/direct"
        assert kwargs["json"] == {"run_code": run_code, "failed_only": False, "dry_run": False}
        assert kwargs["headers"] == {"X-API-Key": "tok_direct"}
        with Session(test_engine) as session:
            run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
        assert run is not None
        assert run.stage == "syncing"

    def test_quality_gate_filters_low_quality(self, test_engine, db_session, monkeypatch):
        """Places below GATE_SYNC should be skipped, not sent to server."""
        run_code = "run_quality_gate"
        from app.pipeline.place_quality import GATE_SYNC

        # One high-quality place, one below threshold
        high = ScrapedPlace(
            run_code=run_code,
            place_code="plc_high",
            name="Grand Mosque",
            raw_data={"name": "Grand Mosque", "religion": "islam", "place_type": "mosque"},
            quality_score=GATE_SYNC + 0.1,
        )
        low = ScrapedPlace(
            run_code=run_code,
            place_code="plc_low",
            name="Mosque",
            raw_data={"name": "Mosque", "religion": "islam", "place_type": "mosque"},
            quality_score=GATE_SYNC - 0.1,
        )
        db_session.add(high)
        db_session.add(low)
        db_session.commit()

        monkeypatch.setattr(scraper_module, "engine", test_engine)

        sent_batches = []

        async def _capture_batch(batch, server_url, client, api_key=""):
            sent_batches.append([p["place_code"] for p in batch])
            return (len(batch), [])

        with patch("app.db.scraper._post_batch_async", _capture_batch):
            sync_run_to_server(run_code, "http://127.0.0.1:3000")

        # Only the high-quality place should have been sent
        all_sent = [code for batch in sent_batches for code in batch]
        assert "plc_high" in all_sent
        assert "plc_low" not in all_sent

    def test_null_quality_score_passes_gate(self, test_engine, db_session, monkeypatch):
        """Backwards-compat: places with quality_score=None pass all gates."""
        run_code = "run_null_score"
        place = ScrapedPlace(
            run_code=run_code,
            place_code="plc_null",
            name="Old Place",
            raw_data={"name": "Old Place", "religion": "islam", "place_type": "mosque"},
            quality_score=None,
        )
        db_session.add(place)
        db_session.commit()

        monkeypatch.setattr(scraper_module, "engine", test_engine)

        sent_batches = []

        async def _capture_batch(batch, server_url, client, api_key=""):
            sent_batches.append([p["place_code"] for p in batch])
            return (len(batch), [])

        with patch("app.db.scraper._post_batch_async", _capture_batch):
            sync_run_to_server(run_code, "http://127.0.0.1:3000")

        all_sent = [code for batch in sent_batches for code in batch]
        assert "plc_null" in all_sent

    def test_partial_batch_failures_retried_individually(
        self, test_engine, db_session, monkeypatch
    ):
        """Partial-success batch: synced > 0 but some failed — failed entries must be retried."""
        run_code = "run_partial"
        _make_place(run_code, "plc_p01", db_session)
        _make_place(run_code, "plc_p02", db_session)
        _make_place(run_code, "plc_p03", db_session)

        monkeypatch.setattr(scraper_module, "engine", test_engine)

        # Batch: 2 synced, 1 failed — the old code silently dropped plc_p03
        async_batch = AsyncMock(return_value=(2, ["plc_p03: server error 500"]))
        retried = []

        async def _capture_individual(payload, server_url, client, api_key=""):
            retried.append(payload["place_code"])
            return (1, [])

        with (
            patch("app.db.scraper._post_batch_async", async_batch),
            patch("app.db.scraper._post_individual_async", _capture_individual),
        ):
            sync_run_to_server(run_code, "http://127.0.0.1:3000")

        # The failed place must have been retried individually
        assert "plc_p03" in retried

    def test_sync_failure_details_persisted(self, test_engine, db_session, monkeypatch):
        """Failed place codes are stored in run.sync_failure_details after sync."""
        from sqlmodel import select as _select

        from app.db.models import DataLocation, ScraperRun

        run_code = "run_fail_details"
        loc = DataLocation(code="loc_fd1", name="FD Loc", source_type="gmaps", config={})
        db_session.add(loc)
        db_session.commit()
        run = ScraperRun(run_code=run_code, location_code="loc_fd1", status="completed")
        db_session.add(run)
        db_session.commit()
        _make_place(run_code, "plc_fd1", db_session)

        monkeypatch.setattr(scraper_module, "engine", test_engine)

        # Batch fails, individual retry also fails
        async_batch = AsyncMock(return_value=(0, ["plc_fd1: HTTP 422"]))
        async_individual = AsyncMock(return_value=(0, ["plc_fd1: HTTP 422"]))

        with (
            patch("app.db.scraper._post_batch_async", async_batch),
            patch("app.db.scraper._post_individual_async", async_individual),
        ):
            sync_run_to_server(run_code, "http://127.0.0.1:3000")

        with Session(test_engine) as s:
            run = s.exec(_select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
            assert run is not None
            assert any("plc_fd1" in entry for entry in (run.sync_failure_details or []))

    def test_failed_only_retries_only_failed_places(self, test_engine, db_session, monkeypatch):
        """failed_only=True must only sync the places listed in sync_failure_details."""
        from sqlmodel import select as _select

        from app.db.models import DataLocation, ScraperRun

        run_code = "run_failed_only"
        loc = DataLocation(code="loc_fo1", name="FO Loc", source_type="gmaps", config={})
        db_session.add(loc)
        db_session.commit()
        # Run already has one success and one failure from a previous sync
        run = ScraperRun(
            run_code=run_code,
            location_code="loc_fo1",
            status="completed",
            places_synced=1,
            places_sync_failed=1,
            sync_failure_details=["plc_fail1: HTTP 503"],
        )
        db_session.add(run)
        db_session.commit()
        _make_place(run_code, "plc_ok1", db_session)  # previously succeeded
        _make_place(run_code, "plc_fail1", db_session)  # previously failed

        monkeypatch.setattr(scraper_module, "engine", test_engine)

        sent_codes: list[str] = []

        async def _capture_batch(batch, server_url, client, api_key=""):
            sent_codes.extend(p["place_code"] for p in batch)
            return (len(batch), [])

        with patch("app.db.scraper._post_batch_async", _capture_batch):
            sync_run_to_server(run_code, "http://127.0.0.1:3000", failed_only=True)

        # Only the previously failed place should be sent
        assert "plc_fail1" in sent_codes
        assert "plc_ok1" not in sent_codes

        # places_synced should be base (1) + newly synced (1) = 2; failures cleared
        with Session(test_engine) as s:
            run = s.exec(_select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
            assert run is not None
            assert run.places_synced == 2
            assert run.places_sync_failed == 0

    def test_failed_only_noop_when_no_failures(self, test_engine, db_session, monkeypatch):
        """failed_only=True with no recorded failures must exit without syncing anything."""
        from sqlmodel import select as _select

        from app.db.models import DataLocation, ScraperRun

        run_code = "run_failed_only_empty"
        loc = DataLocation(code="loc_fo2", name="FO Loc 2", source_type="gmaps", config={})
        db_session.add(loc)
        db_session.commit()
        run = ScraperRun(
            run_code=run_code,
            location_code="loc_fo2",
            status="completed",
            places_synced=5,
            sync_failure_details=[],
        )
        db_session.add(run)
        db_session.commit()

        monkeypatch.setattr(scraper_module, "engine", test_engine)

        async_batch = AsyncMock(return_value=(0, []))
        with patch("app.db.scraper._post_batch_async", async_batch):
            sync_run_to_server(run_code, "http://127.0.0.1:3000", failed_only=True)

        async_batch.assert_not_called()

        # places_synced must be unchanged
        with Session(test_engine) as s:
            run = s.exec(_select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
            assert run is not None
            assert run.places_synced == 5


# ── _trigger_seo_generation_async ─────────────────────────────────────────────


class TestTriggerSeoGenerationAsync:
    """Unit tests for _trigger_seo_generation_async (no network calls)."""

    def _run(self, coro):
        return asyncio.run(coro)

    def test_success_200_logs_generated_count(self, caplog):
        """200 response → logs generated/skipped/errors counts at INFO."""
        import logging

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"generated": 42, "skipped": 10, "errors": 0}

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=mock_resp)

        with patch("app.db.scraper.httpx.AsyncClient", return_value=mock_client):
            with caplog.at_level(logging.INFO, logger="app.db.scraper"):
                self._run(_trigger_seo_generation_async("http://127.0.0.1:3000", "tok_abc"))

        assert any("42" in r.message for r in caplog.records)

    def test_non_200_logs_warning(self, caplog):
        """Non-200 response → logs warning with status code."""
        import logging

        mock_resp = MagicMock()
        mock_resp.status_code = 401
        mock_resp.text = "Unauthorized"

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=mock_resp)

        with patch("app.db.scraper.httpx.AsyncClient", return_value=mock_client):
            with caplog.at_level(logging.WARNING, logger="app.db.scraper"):
                self._run(_trigger_seo_generation_async("http://127.0.0.1:3000", "tok_bad"))

        assert any("401" in r.message for r in caplog.records)

    def test_exception_does_not_raise(self):
        """Network error must be caught — function must not raise."""
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(side_effect=Exception("connection refused"))

        with patch("app.db.scraper.httpx.AsyncClient", return_value=mock_client):
            # Should complete without raising
            self._run(_trigger_seo_generation_async("http://127.0.0.1:3000", "tok_err"))

    def test_correct_url_constructed(self):
        """Endpoint URL must be <server_url>/api/v1/admin/seo/generate."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"generated": 0, "skipped": 0, "errors": 0}

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=mock_resp)

        with patch("app.db.scraper.httpx.AsyncClient", return_value=mock_client):
            self._run(_trigger_seo_generation_async("https://api.example.com", "tok_url"))

        called_url = mock_client.post.call_args[0][0]
        assert called_url == "https://api.example.com/api/v1/admin/seo/generate"

    def test_api_key_in_headers(self):
        """X-API-Key header must be set to the provided api_key."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"generated": 0, "skipped": 0, "errors": 0}

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=mock_resp)

        with patch("app.db.scraper.httpx.AsyncClient", return_value=mock_client):
            self._run(_trigger_seo_generation_async("http://127.0.0.1:3000", "my_api_key_123"))

        call_kwargs = mock_client.post.call_args[1]
        assert call_kwargs["headers"]["X-API-Key"] == "my_api_key_123"


# ── Auto-SEO trigger integration ──────────────────────────────────────────────


class TestAutoSeoTriggerInSync:
    """Tests that sync_run_to_server calls _trigger_seo_generation_async when configured."""

    def test_trigger_called_when_enabled_with_token(self, test_engine, db_session, monkeypatch):
        """When trigger_seo_after_sync=True and token set, SEO generation is called."""
        run_code = "run_seo_trigger"
        _make_place(run_code, "plc_seo01", db_session)

        monkeypatch.setattr(scraper_module, "engine", test_engine)

        fake_settings = MagicMock()
        fake_settings.direct_catalog_sync = False
        fake_settings.trigger_seo_after_sync = True
        fake_settings.catalog_api_key = "admin_jwt_token"

        seo_trigger = AsyncMock()

        with (
            patch("app.db.scraper._post_batch_async", AsyncMock(return_value=(1, []))),
            patch("app.db.scraper._trigger_seo_generation_async", seo_trigger),
        ):
            # Patch settings inside the module at call time
            async def _patched_sync(*args, **kwargs):
                # Temporarily swap settings inside the coroutine
                import app.config as _cfg

                orig = _cfg.settings
                _cfg.settings = fake_settings
                try:
                    await scraper_module.sync_run_to_server_async(*args, **kwargs)
                finally:
                    _cfg.settings = orig

            import asyncio as _asyncio

            _asyncio.run(_patched_sync(run_code, "http://127.0.0.1:3000"))

        seo_trigger.assert_called_once_with(
            "http://127.0.0.1:3000", "admin_jwt_token"
        )  # catalog_api_key value

    def test_trigger_not_called_when_disabled(self, test_engine, db_session, monkeypatch):
        """When trigger_seo_after_sync=False, SEO generation must not be called."""
        run_code = "run_seo_disabled"
        _make_place(run_code, "plc_seo02", db_session)

        monkeypatch.setattr(scraper_module, "engine", test_engine)

        fake_settings = MagicMock()
        fake_settings.direct_catalog_sync = False
        fake_settings.trigger_seo_after_sync = False
        fake_settings.catalog_api_key = "some_token"

        seo_trigger = AsyncMock()

        with patch("app.db.scraper._post_batch_async", AsyncMock(return_value=(1, []))):
            import asyncio as _asyncio

            import app.config as _cfg

            orig = _cfg.settings
            _cfg.settings = fake_settings
            try:
                with patch("app.db.scraper._trigger_seo_generation_async", seo_trigger):
                    _asyncio.run(
                        scraper_module.sync_run_to_server_async(run_code, "http://127.0.0.1:3000")
                    )
            finally:
                _cfg.settings = orig

        seo_trigger.assert_not_called()

    def test_warning_logged_when_token_missing(self, test_engine, db_session, monkeypatch, caplog):
        """trigger_seo_after_sync=True but no token → warning logged, SEO not called."""
        import logging

        run_code = "run_seo_no_token"
        _make_place(run_code, "plc_seo03", db_session)

        monkeypatch.setattr(scraper_module, "engine", test_engine)

        fake_settings = MagicMock()
        fake_settings.direct_catalog_sync = False
        fake_settings.trigger_seo_after_sync = True
        fake_settings.catalog_api_key = ""  # empty — not set

        seo_trigger = AsyncMock()

        with patch("app.db.scraper._post_batch_async", AsyncMock(return_value=(1, []))):
            import asyncio as _asyncio

            import app.config as _cfg

            orig = _cfg.settings
            _cfg.settings = fake_settings
            try:
                with (
                    patch("app.db.scraper._trigger_seo_generation_async", seo_trigger),
                    caplog.at_level(logging.WARNING, logger="app.db.scraper"),
                ):
                    _asyncio.run(
                        scraper_module.sync_run_to_server_async(run_code, "http://127.0.0.1:3000")
                    )
            finally:
                _cfg.settings = orig

        seo_trigger.assert_not_called()
        assert any("CATALOG_API_KEY" in r.message for r in caplog.records)
