"""Unit tests for Cloud Run Job workers: sync_places.

Tests focus on pure logic (sanitizers, filters, builders) and mock all
external I/O (DB connections, process_chunk).
"""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import create_engine, text
from sqlmodel import Session, select

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
        # streaming: conn.execution_options(...).execute(...) returns an iterable
        mock_conn.execution_options.return_value.execute.return_value = iter([fake_row])

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
        mock_conn.execution_options.return_value.execute.return_value = iter([fake_row])

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
        mock_conn.execution_options.return_value.execute.return_value = iter([fake_row])

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


class TestDirectSyncRunScoped:
    def _create_scraper_schema(self, scraper_engine) -> None:
        with scraper_engine.begin() as conn:
            conn.execute(
                text(
                    "CREATE TABLE scraperrun ("
                    "run_code TEXT PRIMARY KEY, location_code TEXT, geo_box_label TEXT, "
                    "stage TEXT, places_synced INTEGER, places_sync_failed INTEGER, "
                    "places_sync_quality_filtered INTEGER, places_sync_name_filtered INTEGER, "
                    "sync_failure_details TEXT, rate_limit_events TEXT, last_sync_at TEXT)"
                )
            )
            conn.execute(text("CREATE TABLE datalocation (code TEXT PRIMARY KEY, config TEXT)"))
            conn.execute(text("CREATE TABLE geoboundary (id INTEGER PRIMARY KEY, name TEXT)"))
            conn.execute(
                text(
                    "CREATE TABLE geoboundarybox ("
                    "id INTEGER PRIMARY KEY, boundary_id INTEGER, label TEXT, "
                    "lat_min REAL, lat_max REAL, lng_min REAL, lng_max REAL)"
                )
            )
            conn.execute(
                text(
                    "CREATE TABLE scrapedplace ("
                    "run_code TEXT, place_code TEXT, name TEXT, raw_data TEXT, "
                    "quality_score REAL, lat REAL, lng REAL, country TEXT, sync_status TEXT)"
                )
            )
            conn.execute(
                text("INSERT INTO datalocation VALUES ('loc_uae', :config)"),
                {"config": json.dumps({"country": "United Arab Emirates"})},
            )
            conn.execute(text("INSERT INTO geoboundary VALUES (1, 'United Arab Emirates')"))
            conn.execute(
                text("INSERT INTO geoboundarybox VALUES (1, 1, 'uae_box', 24.0, 26.0, 54.0, 56.0)")
            )

    def test_sync_places_for_run_updates_scraper_status_and_counters(self, tmp_path):
        from app.jobs.sync_places import sync_places_for_run

        db_path = tmp_path / "scraper.sqlite"
        scraper_url = f"sqlite:///{db_path}"
        scraper_engine = create_engine(scraper_url)
        self._create_scraper_schema(scraper_engine)
        with scraper_engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO scraperrun "
                    "(run_code, location_code, geo_box_label, stage, places_synced, "
                    "places_sync_failed, places_sync_quality_filtered, places_sync_name_filtered, "
                    "sync_failure_details, rate_limit_events, last_sync_at) VALUES "
                    "('run_a', 'loc_uae', 'uae_box', NULL, 5, 0, 0, 0, '[]', '{}', NULL), "
                    "('run_b', 'loc_uae', 'uae_box', NULL, 0, 0, 0, 0, '[]', '{}', NULL)"
                )
            )
            raw = json.dumps(
                {
                    "religion": "islam",
                    "place_type": "mosque",
                    "lat": 25.2,
                    "lng": 55.3,
                    "address": "123 St",
                    "image_urls": ["https://example.com/a.jpg"],
                }
            )
            conn.execute(
                text(
                    "INSERT INTO scrapedplace VALUES "
                    "('run_a', 'plc_a', 'Grand Mosque', :raw, 0.9, 25.2, 55.3, "
                    "'United Arab Emirates', NULL), "
                    "('run_b', 'plc_b', 'Other Mosque', :raw, 0.9, 25.2, 55.3, "
                    "'United Arab Emirates', NULL)"
                ),
                {"raw": raw},
            )

        with (
            patch("app.jobs.sync_places.run_migrations"),
            patch(
                "app.jobs.sync_places._process_chunk",
                return_value=[
                    {
                        "place_code": "plc_a",
                        "ok": True,
                        "action": "created",
                        "image_action": "replaced",
                    }
                ],
            ),
        ):
            summary = sync_places_for_run(
                run_code="run_a",
                scraper_database_url=scraper_url,
                run_catalog_migrations=False,
            )

        assert summary.scanned == 1
        assert summary.synced == 1
        assert summary.images_replaced == 1
        with scraper_engine.connect() as conn:
            rows = conn.execute(
                text(
                    "SELECT run_code, place_code, sync_status FROM scrapedplace ORDER BY place_code"
                )
            ).all()
            run = (
                conn.execute(text("SELECT * FROM scraperrun WHERE run_code = 'run_a'"))
                .mappings()
                .first()
            )

        assert rows == [("run_a", "plc_a", "synced"), ("run_b", "plc_b", None)]
        assert run["stage"] is None
        assert run["places_synced"] == 1
        direct = json.loads(run["rate_limit_events"])["direct_catalog_sync"]
        assert direct["state"] == "completed"
        assert direct["images_replaced"] == 1

    def test_sync_places_for_run_syncs_out_of_scope_places_by_quality_only(self, tmp_path):
        from app.jobs.sync_places import sync_places_for_run

        db_path = tmp_path / "scraper.sqlite"
        scraper_url = f"sqlite:///{db_path}"
        scraper_engine = create_engine(scraper_url)
        self._create_scraper_schema(scraper_engine)
        with scraper_engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO scraperrun "
                    "(run_code, location_code, geo_box_label, stage, places_synced, "
                    "places_sync_failed, places_sync_quality_filtered, places_sync_name_filtered, "
                    "sync_failure_details, rate_limit_events, last_sync_at) VALUES "
                    "('run_scope', 'loc_uae', 'uae_box', NULL, 0, 0, 0, 0, '[]', '{}', NULL)"
                )
            )
            raw_in = json.dumps(
                {
                    "religion": "islam",
                    "place_type": "mosque",
                    "lat": 25.2,
                    "lng": 55.3,
                    "country": "United Arab Emirates",
                    "address": "123 St",
                }
            )
            raw_out = json.dumps(
                {
                    "religion": "islam",
                    "place_type": "mosque",
                    "lat": 50.85,
                    "lng": 4.35,
                    "country": "Belgium",
                    "address": "Brussels",
                }
            )
            conn.execute(
                text(
                    "INSERT INTO scrapedplace VALUES "
                    "('run_scope', 'plc_in', 'Grand Mosque', :raw_in, 0.9, 25.2, 55.3, "
                    "'United Arab Emirates', NULL), "
                    "('run_scope', 'plc_out', 'Brussels Mosque', :raw_out, 0.9, 50.85, 4.35, "
                    "'Belgium', NULL), "
                    "('run_scope', 'plc_raw_in', 'Raw Coordinate Mosque', :raw_in, 0.9, NULL, NULL, "
                    "NULL, NULL), "
                    "('run_scope', 'plc_zero', 'Zero Mosque', :raw_in, 0.9, 0, 0, "
                    "'United Arab Emirates', NULL), "
                    "('run_scope', 'plc_low', 'Low Quality Mosque', :raw_in, 0.5, 25.2, 55.3, "
                    "'United Arab Emirates', NULL), "
                    "('run_scope', 'plc_generic', 'Mosque', :raw_in, 0.9, 25.2, 55.3, "
                    "'United Arab Emirates', NULL)"
                ),
                {"raw_in": raw_in, "raw_out": raw_out},
            )

        with (
            patch("app.jobs.sync_places.run_migrations"),
            patch(
                "app.jobs.sync_places._process_chunk",
                return_value=[
                    {"place_code": "plc_in", "ok": True, "action": "created"},
                    {"place_code": "plc_out", "ok": True, "action": "created"},
                    {"place_code": "plc_raw_in", "ok": True, "action": "created"},
                    {"place_code": "plc_zero", "ok": True, "action": "created"},
                ],
            ) as mock_chunk,
        ):
            summary = sync_places_for_run(
                run_code="run_scope",
                scraper_database_url=scraper_url,
                run_catalog_migrations=False,
            )

        mock_chunk.assert_called_once()
        synced_codes = [place.place_code for place in mock_chunk.call_args.args[0]]
        assert synced_codes == ["plc_in", "plc_out", "plc_raw_in", "plc_zero"]
        assert summary.scanned == 6
        assert summary.synced == 4
        assert summary.skipped_quality == 1
        assert summary.skipped_name == 1
        with scraper_engine.connect() as conn:
            statuses = conn.execute(
                text("SELECT place_code, sync_status FROM scrapedplace ORDER BY place_code")
            ).all()

        assert statuses == [
            ("plc_generic", "name_filtered"),
            ("plc_in", "synced"),
            ("plc_low", "quality_filtered"),
            ("plc_out", "synced"),
            ("plc_raw_in", "synced"),
            ("plc_zero", "synced"),
        ]


class TestPlaceIngestImages:
    def _place_create(self, code: str, image_urls: list[str]):
        from app.models.schemas import PlaceCreate

        return PlaceCreate(
            place_code=code,
            name="Grand Mosque",
            religion="islam",
            place_type="mosque",
            lat=25.2,
            lng=55.3,
            address="123 St",
            image_urls=image_urls,
        )

    def _seed_place_with_images(self, db_session: Session, place_code: str, count: int) -> None:
        from app.db.models import Place, PlaceImage

        db_session.add(
            Place(
                place_code=place_code,
                name="Old Mosque",
                religion="islam",
                place_type="mosque",
                lat=25.2,
                lng=55.3,
                address="Old St",
            )
        )
        for idx in range(count):
            db_session.add(
                PlaceImage(
                    place_code=place_code,
                    image_type="url",
                    url=f"https://old.example.com/{idx}.jpg",
                    display_order=idx,
                )
            )
        db_session.commit()

    def test_direct_sync_preserves_images_when_incoming_count_is_lower(
        self, db_session, test_engine, monkeypatch
    ):
        from app.db.models import PlaceImage
        from app.services import place_ingest

        self._seed_place_with_images(db_session, "plc_preserve", 3)
        monkeypatch.setattr(place_ingest, "engine", test_engine)

        result = place_ingest.process_place_chunk(
            [self._place_create("plc_preserve", ["https://new.example.com/one.jpg"])],
            image_policy="incoming_gte_existing",
        )

        images = db_session.exec(
            select(PlaceImage).where(PlaceImage.place_code == "plc_preserve")
        ).all()
        assert result[0]["image_action"] == "preserved"
        assert [img.url for img in images] == [
            "https://old.example.com/0.jpg",
            "https://old.example.com/1.jpg",
            "https://old.example.com/2.jpg",
        ]

    def test_direct_sync_replaces_images_when_incoming_count_is_equal_or_higher(
        self, db_session, test_engine, monkeypatch
    ):
        from app.db.models import PlaceImage
        from app.services import place_ingest

        self._seed_place_with_images(db_session, "plc_replace", 2)
        monkeypatch.setattr(place_ingest, "engine", test_engine)

        result = place_ingest.process_place_chunk(
            [
                self._place_create(
                    "plc_replace",
                    ["https://new.example.com/one.jpg", "https://new.example.com/two.jpg"],
                )
            ],
            image_policy="incoming_gte_existing",
        )

        images = db_session.exec(
            select(PlaceImage).where(PlaceImage.place_code == "plc_replace")
        ).all()
        assert result[0]["image_action"] == "replaced"
        assert [img.url for img in images] == [
            "https://new.example.com/one.jpg",
            "https://new.example.com/two.jpg",
        ]


class TestDirectSyncControlEndpoint:
    def test_control_endpoint_starts_background_job(self, client, monkeypatch):
        monkeypatch.setenv("SCRAPER_DATABASE_URL", "sqlite:///scraper.db")
        with patch("app.api.v1.admin.sync_places._run_direct_sync") as mock_sync:
            resp = client.post(
                "/api/v1/admin/sync-places/direct",
                headers={"X-API-Key": "test-api-key"},
                json={"run_code": "run_endpoint", "failed_only": True, "dry_run": True},
            )

        assert resp.status_code == 200
        assert resp.json()["status"] == "direct_sync_started"
        mock_sync.assert_called_once_with("run_endpoint", True, True)

    def test_control_endpoint_requires_scraper_database_url(self, client, monkeypatch):
        monkeypatch.delenv("SCRAPER_DATABASE_URL", raising=False)
        resp = client.post(
            "/api/v1/admin/sync-places/direct",
            headers={"X-API-Key": "test-api-key"},
            json={"run_code": "run_endpoint"},
        )

        assert resp.status_code == 503
