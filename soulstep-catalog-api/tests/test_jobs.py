"""Unit tests for Cloud Run Job workers: sync_places and translate_content.

Tests focus on pure logic (sanitizers, filters, builders) and mock all
external I/O (DB connections, process_chunk, browser translation).
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

# ─────────────────────────────────────────────────────────────────────────────
# sync_places: pure logic helpers
# ─────────────────────────────────────────────────────────────────────────────


class TestSanitizeReligion:
    def _fn(self, val):
        from app.jobs.sync_places import _sanitize_religion

        return _sanitize_religion(val)

    def test_valid_islam(self):
        assert self._fn("islam") == "islam"

    def test_valid_hinduism(self):
        assert self._fn("hinduism") == "hinduism"

    def test_valid_christianity(self):
        assert self._fn("christianity") == "christianity"

    def test_valid_all(self):
        assert self._fn("all") == "all"

    def test_unknown_maps_to_all(self):
        assert self._fn("buddhism") == "all"

    def test_none_maps_to_all(self):
        assert self._fn(None) == "all"

    def test_empty_string_maps_to_all(self):
        assert self._fn("") == "all"


class TestSanitizeAttributes:
    def _fn(self, attrs):
        from app.jobs.sync_places import _sanitize_attributes

        return _sanitize_attributes(attrs)

    def test_str_value_passes(self):
        result = self._fn([{"attribute_code": "prayer_times", "value": "5 times"}])
        assert len(result) == 1
        assert result[0].attribute_code == "prayer_times"

    def test_bool_value_passes(self):
        result = self._fn([{"attribute_code": "has_parking", "value": True}])
        assert len(result) == 1

    def test_int_value_passes(self):
        result = self._fn([{"attribute_code": "capacity", "value": 500}])
        assert len(result) == 1

    def test_list_of_strings_passes(self):
        result = self._fn([{"attribute_code": "amenities", "value": ["wifi", "ac"]}])
        assert len(result) == 1

    def test_dict_value_filtered(self):
        result = self._fn([{"attribute_code": "parking_details", "value": {"slots": 10}}])
        assert result == []

    def test_mixed_list_filtered(self):
        result = self._fn([{"attribute_code": "mixed", "value": [1, "two"]}])
        assert result == []

    def test_empty_list(self):
        assert self._fn([]) == []


class TestSanitizeReviews:
    def _fn(self, reviews):
        from app.jobs.sync_places import _sanitize_reviews

        return _sanitize_reviews(reviews)

    def test_valid_rating_passes(self):
        r = {"author_name": "Ali", "rating": 5, "text": "Great", "time": 1000, "language": "en"}
        result = self._fn([r])
        assert len(result) == 1
        assert result[0].rating == 5

    def test_zero_rating_filtered(self):
        r = {"author_name": "Ali", "rating": 0, "text": "No rating", "time": 1000, "language": "en"}
        assert self._fn([r]) == []

    def test_six_rating_filtered(self):
        r = {"author_name": "Ali", "rating": 6, "text": "OOB", "time": 1000, "language": "en"}
        assert self._fn([r]) == []

    def test_non_int_rating_filtered(self):
        r = {"author_name": "Ali", "rating": "5", "text": "x", "time": 0, "language": "en"}
        assert self._fn([r]) == []

    def test_empty_list(self):
        assert self._fn([]) == []


class TestIsNameSpecificEnough:
    def _fn(self, name):
        from app.jobs.sync_places import _is_name_specific_enough

        return _is_name_specific_enough(name)

    def test_generic_single_word_fails(self):
        assert self._fn("Mosque") is False

    def test_generic_single_word_temple_fails(self):
        assert self._fn("temple") is False

    def test_specific_name_passes(self):
        assert self._fn("Sultan Qaboos Grand Mosque") is True

    def test_two_word_non_generic_passes(self):
        assert self._fn("Blue Mosque") is True

    def test_generic_with_article_still_fails(self):
        # "The Mosque" → meaningful words = ["mosque"] → fails
        assert self._fn("The Mosque") is False

    def test_two_specific_words_passes(self):
        assert self._fn("St. Paul") is True

    def test_empty_string(self):
        assert self._fn("") is False


class TestBuildPlaceCreate:
    def _fn(self, place_code, name, raw_data):
        from app.jobs.sync_places import _build_place_create

        return _build_place_create(place_code, name, raw_data)

    def _raw(self, **overrides):
        base = {
            "religion": "islam",
            "place_type": "mosque",
            "lat": 25.2,
            "lng": 55.3,
            "address": "123 Test St",
        }
        base.update(overrides)
        return base

    def test_returns_place_create(self):
        pc = self._fn("plc_abc", "Test Mosque", self._raw())
        assert pc is not None
        assert pc.place_code == "plc_abc"
        assert pc.religion == "islam"

    def test_prefers_image_blobs_over_urls(self):
        raw = self._raw(
            image_blobs=[{"data": "abc", "mime_type": "image/jpeg"}],
            image_urls=["http://example.com/img.jpg"],
        )
        pc = self._fn("plc_abc", "Test Mosque", raw)
        assert pc is not None
        assert pc.image_blobs is not None
        assert pc.image_urls == []

    def test_uses_image_urls_when_no_blobs(self):
        raw = self._raw(image_urls=["http://example.com/img.jpg"])
        pc = self._fn("plc_abc", "Test Mosque", raw)
        assert pc is not None
        assert pc.image_urls == ["http://example.com/img.jpg"]

    def test_parses_translations(self):
        raw = self._raw(translations={"name": {"ar": "مسجد"}, "description": {"ar": "وصف"}})
        pc = self._fn("plc_abc", "Test Mosque", raw)
        assert pc is not None
        assert pc.translations is not None
        assert pc.translations.name == {"ar": "مسجد"}

    def test_returns_none_on_invalid_lat(self):
        raw = self._raw(lat="not-a-float")
        pc = self._fn("plc_abc", "Test Mosque", raw)
        assert pc is None

    def test_unknown_religion_defaults_to_all(self):
        raw = self._raw(religion="jainism")
        pc = self._fn("plc_abc", "Test Mosque", raw)
        assert pc is not None
        assert pc.religion == "all"


class TestSyncPlacesMain:
    """Integration-style test for main() with all external calls mocked."""

    def test_main_requires_scraper_db_url(self, monkeypatch):
        monkeypatch.delenv("SCRAPER_DATABASE_URL", raising=False)
        from app.jobs.sync_places import main

        with pytest.raises(RuntimeError, match="SCRAPER_DATABASE_URL"):
            main()

    def test_main_runs_successfully(self, monkeypatch):
        monkeypatch.setenv("SCRAPER_DATABASE_URL", "postgresql://scraper/db")

        fake_row = (
            "plc_abc123",
            "Grand Mosque",
            {
                "religion": "islam",
                "place_type": "mosque",
                "lat": 25.2,
                "lng": 55.3,
                "address": "123 St",
            },
            0.9,  # quality_score
        )

        mock_conn = MagicMock()
        mock_conn.__enter__ = MagicMock(return_value=mock_conn)
        mock_conn.__exit__ = MagicMock(return_value=False)
        mock_conn.execute.return_value.fetchall.return_value = [fake_row]

        mock_engine = MagicMock()
        mock_engine.connect.return_value = mock_conn

        chunk_result = [{"place_code": "plc_abc123", "ok": True, "action": "created"}]

        with (
            patch("app.jobs.sync_places.run_migrations"),
            patch("app.jobs.sync_places.create_engine", return_value=mock_engine),
            patch("app.jobs.sync_places._process_chunk", return_value=chunk_result),
        ):
            from app.jobs.sync_places import main

            main()  # Should not raise

    def test_main_exits_1_on_failures(self, monkeypatch):
        monkeypatch.setenv("SCRAPER_DATABASE_URL", "postgresql://scraper/db")

        fake_row = (
            "plc_bad",
            "Grand Mosque",
            {"religion": "islam", "place_type": "mosque", "lat": 25.2, "lng": 55.3, "address": "x"},
            0.9,
        )

        mock_conn = MagicMock()
        mock_conn.__enter__ = MagicMock(return_value=mock_conn)
        mock_conn.__exit__ = MagicMock(return_value=False)
        mock_conn.execute.return_value.fetchall.return_value = [fake_row]

        mock_engine = MagicMock()
        mock_engine.connect.return_value = mock_conn

        chunk_result = [{"place_code": "plc_bad", "ok": False, "error": "db error"}]

        with (
            patch("app.jobs.sync_places.run_migrations"),
            patch("app.jobs.sync_places.create_engine", return_value=mock_engine),
            patch("app.jobs.sync_places._process_chunk", return_value=chunk_result),
        ):
            from app.jobs.sync_places import main

            with pytest.raises(SystemExit) as exc_info:
                main()

        assert exc_info.value.code == 1

    def test_main_skips_low_quality(self, monkeypatch):
        monkeypatch.setenv("SCRAPER_DATABASE_URL", "postgresql://scraper/db")

        # quality_score 0.5 < 0.75 gate
        fake_row = (
            "plc_low",
            "Grand Mosque",
            {"religion": "islam", "place_type": "mosque", "lat": 25.2, "lng": 55.3, "address": "x"},
            0.5,
        )

        mock_conn = MagicMock()
        mock_conn.__enter__ = MagicMock(return_value=mock_conn)
        mock_conn.__exit__ = MagicMock(return_value=False)
        mock_conn.execute.return_value.fetchall.return_value = [fake_row]

        mock_engine = MagicMock()
        mock_engine.connect.return_value = mock_conn

        with (
            patch("app.jobs.sync_places.run_migrations"),
            patch("app.jobs.sync_places.create_engine", return_value=mock_engine),
            patch("app.jobs.sync_places._process_chunk") as mock_chunk,
        ):
            from app.jobs.sync_places import main

            main()
            mock_chunk.assert_not_called()  # Filtered out — nothing to process


# ─────────────────────────────────────────────────────────────────────────────
# translate_content: logic helpers
# ─────────────────────────────────────────────────────────────────────────────


class TestTranslateContentHelpers:
    def test_get_system_user_code_returns_admin(self, db_session, test_engine):
        """_get_system_user_code returns user_code of first admin user."""
        from app.db.models import User

        admin = User(
            user_code="usr_admin001",
            email="sys_admin@example.com",
            password_hash="x",
            display_name="SysAdmin",
            is_admin=True,
        )
        db_session.add(admin)
        db_session.commit()

        with patch("app.jobs.translate_content.engine", test_engine):
            from app.jobs.translate_content import _get_system_user_code

            code = _get_system_user_code()
            assert code == "usr_admin001"

    def test_get_system_user_code_returns_none_when_no_admin(self, test_engine):
        """_get_system_user_code returns None when no admin users exist."""
        with patch("app.jobs.translate_content.engine", test_engine):
            from app.jobs.translate_content import _get_system_user_code

            code = _get_system_user_code()
            assert code is None

    def test_create_job_skips_without_user_code(self):
        """_create_job returns False and logs warning when user_code is None."""
        from app.jobs.translate_content import _create_job

        result = _create_job("btj_test001", None)
        assert result is False

    def test_create_job_creates_record(self, db_session, test_engine):
        """_create_job inserts a BulkTranslationJob row."""
        from sqlmodel import select

        from app.db.models import BulkTranslationJob, User

        admin = User(
            user_code="usr_tcadmin",
            email="tc_admin@example.com",
            password_hash="x",
            display_name="TC Admin",
            is_admin=True,
        )
        db_session.add(admin)
        db_session.commit()

        with patch("app.jobs.translate_content.engine", test_engine):
            from app.jobs.translate_content import _create_job

            result = _create_job("btj_testjob1", "usr_tcadmin")
            assert result is True

        job = db_session.exec(
            select(BulkTranslationJob).where(BulkTranslationJob.job_code == "btj_testjob1")
        ).first()
        assert job is not None
        assert job.status == "running"
        assert job.created_by_user_code == "usr_tcadmin"


class TestTranslateContentMain:
    """Integration-style test for translate_content.main() with mocked heavy deps."""

    def test_main_no_missing_items(self):
        """When _collect_missing_items returns empty list, job is marked completed quickly."""
        with (
            patch("app.jobs.translate_content.run_migrations"),
            patch("app.jobs.translate_content._migrate_legacy_attributes", return_value=0),
            patch("app.jobs.translate_content._get_system_user_code", return_value=None),
            patch("app.jobs.translate_content._collect_missing_items", return_value=[]),
            patch("app.jobs.translate_content.translate_batch_browser_parallel"),
        ):
            from app.jobs.translate_content import main

            main()  # Should not raise

    def test_main_runs_translation(self):
        """When items exist, translate_batch_browser_parallel is called per lang."""
        missing = [
            ("place", "plc_abc", "name", "ar", "Test Mosque"),
            ("place", "plc_abc", "description", "ar", "A mosque"),
        ]

        async def fake_translate(
            texts, *, target_lang, source_lang, multi_size, on_result, pool, is_cancelled
        ):
            for i, _ in enumerate(texts):
                await on_result(i, f"translated_{i}")

        with (
            patch("app.jobs.translate_content.run_migrations"),
            patch("app.jobs.translate_content._migrate_legacy_attributes", return_value=0),
            patch("app.jobs.translate_content._get_system_user_code", return_value=None),
            patch("app.jobs.translate_content._collect_missing_items", return_value=missing),
            patch("app.jobs.translate_content._flush_translations"),
            patch(
                "app.jobs.translate_content.translate_batch_browser_parallel",
                side_effect=fake_translate,
            ),
            patch("app.jobs.translate_content.BrowserSessionPool"),
        ):
            from app.jobs.translate_content import main

            main()  # Should complete without error
