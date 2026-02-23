"""
Tests for app/db/content_translations.py — CRUD and bulk query helpers.
"""

from app.db import content_translations as ct_db
from app.db.models import ContentTranslation

# ── helpers ────────────────────────────────────────────────────────────────────


def _upsert(session, entity_type, entity_code, field, lang, text, source="scraper"):
    ct_db.upsert_translation(entity_type, entity_code, field, lang, text, source, session)


# ── upsert_translation ─────────────────────────────────────────────────────────


class TestUpsertTranslation:
    def test_insert_creates_row(self, db_session):
        _upsert(db_session, "place", "plc_001", "name", "ar", "مسجد")
        row = db_session.get(ContentTranslation, 1)
        assert row is not None
        assert row.translated_text == "مسجد"
        assert row.source == "scraper"

    def test_update_overwrites_existing_text(self, db_session):
        _upsert(db_session, "place", "plc_001", "name", "ar", "مسجد")
        _upsert(db_session, "place", "plc_001", "name", "ar", "جامع", source="google_translate")

        result = ct_db.get_translation("place", "plc_001", "name", "ar", db_session)
        assert result == "جامع"

    def test_distinct_langs_create_separate_rows(self, db_session):
        _upsert(db_session, "place", "plc_001", "name", "ar", "مسجد")
        _upsert(db_session, "place", "plc_001", "name", "hi", "मस्जिद")

        ar = ct_db.get_translation("place", "plc_001", "name", "ar", db_session)
        hi = ct_db.get_translation("place", "plc_001", "name", "hi", db_session)
        assert ar == "مسجد"
        assert hi == "मस्जिद"


# ── get_translation ────────────────────────────────────────────────────────────


class TestGetTranslation:
    def test_returns_none_when_missing(self, db_session):
        result = ct_db.get_translation("place", "plc_xxx", "name", "ar", db_session)
        assert result is None

    def test_returns_correct_text(self, db_session):
        _upsert(db_session, "place", "plc_001", "description", "te", "వర్ణన")
        result = ct_db.get_translation("place", "plc_001", "description", "te", db_session)
        assert result == "వర్ణన"


# ── get_translations_for_entity ───────────────────────────────────────────────


class TestGetTranslationsForEntity:
    def test_returns_all_fields_for_lang(self, db_session):
        _upsert(db_session, "place", "plc_001", "name", "ar", "مسجد")
        _upsert(db_session, "place", "plc_001", "description", "ar", "وصف")
        _upsert(db_session, "place", "plc_001", "name", "hi", "मस्जिद")  # different lang

        result = ct_db.get_translations_for_entity("place", "plc_001", "ar", db_session)
        assert result == {"name": "مسجد", "description": "وصف"}

    def test_returns_empty_dict_when_none(self, db_session):
        result = ct_db.get_translations_for_entity("place", "plc_zzz", "ar", db_session)
        assert result == {}


# ── bulk_get_translations ──────────────────────────────────────────────────────


class TestBulkGetTranslations:
    def test_returns_mapping_for_multiple_codes(self, db_session):
        _upsert(db_session, "place", "plc_001", "name", "ar", "مسجد أ")
        _upsert(db_session, "place", "plc_001", "description", "ar", "وصف أ")
        _upsert(db_session, "place", "plc_002", "name", "ar", "مسجد ب")

        result = ct_db.bulk_get_translations("place", ["plc_001", "plc_002"], "ar", db_session)
        assert result["plc_001"]["name"] == "مسجد أ"
        assert result["plc_001"]["description"] == "وصف أ"
        assert result["plc_002"]["name"] == "مسجد ب"

    def test_missing_entity_absent_from_result(self, db_session):
        _upsert(db_session, "place", "plc_001", "name", "ar", "مسجد")

        result = ct_db.bulk_get_translations("place", ["plc_001", "plc_999"], "ar", db_session)
        assert "plc_001" in result
        assert "plc_999" not in result

    def test_empty_codes_returns_empty(self, db_session):
        result = ct_db.bulk_get_translations("place", [], "ar", db_session)
        assert result == {}

    def test_different_langs_isolated(self, db_session):
        _upsert(db_session, "place", "plc_001", "name", "ar", "مسجد")
        _upsert(db_session, "place", "plc_001", "name", "hi", "मस्जिद")

        ar_result = ct_db.bulk_get_translations("place", ["plc_001"], "ar", db_session)
        hi_result = ct_db.bulk_get_translations("place", ["plc_001"], "hi", db_session)
        assert ar_result["plc_001"]["name"] == "مسجد"
        assert hi_result["plc_001"]["name"] == "मस्जिद"
