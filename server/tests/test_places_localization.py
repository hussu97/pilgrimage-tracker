"""
Tests for content localization in the places API and place_specifications service.

Covers:
- _place_to_item: translation overlay applied when translations dict provided
- list_places: lang param triggers bulk translation fetch; English fast path skips it
- get_place: lang param triggers per-place translation fetch
- batch_create_places: translations field persisted in ContentTranslation
- build_specifications: localised "Available"/"Separate" via lang param
"""

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.db import content_translations as ct_db
from app.services.place_specifications import build_specifications

# ── Helpers ────────────────────────────────────────────────────────────────────

SAMPLE_PLACE = {
    "place_code": "plc_test0001",
    "name": "Test Mosque",
    "religion": "islam",
    "place_type": "mosque",
    "lat": 25.2048,
    "lng": 55.2708,
    "address": "123 Test St, Dubai",
}


def _register_place(client):
    resp = client.post("/api/v1/places", json=SAMPLE_PLACE)
    assert resp.status_code in (200, 201), resp.text
    return resp.json()


# ── _place_to_item translation overlay ────────────────────────────────────────


class TestPlaceToItemTranslationOverlay:
    def test_english_fallback_when_no_translations(self, client):
        _register_place(client)
        resp = client.get("/api/v1/places/plc_test0001")
        data = resp.json()
        assert data["name"] == "Test Mosque"
        assert data["address"] == "123 Test St, Dubai"

    def test_lang_en_fast_path_returns_english(self, client):
        _register_place(client)
        resp = client.get("/api/v1/places/plc_test0001?lang=en")
        assert resp.json()["name"] == "Test Mosque"

    def test_lang_ar_returns_translation_when_stored(self, client, db_session):
        _register_place(client)
        ct_db.upsert_translation(
            "place", "plc_test0001", "name", "ar", "مسجد اختبار", "manual", db_session
        )
        resp = client.get("/api/v1/places/plc_test0001?lang=ar")
        assert resp.json()["name"] == "مسجد اختبار"

    def test_lang_ar_falls_back_to_english_when_no_translation(self, client):
        _register_place(client)
        resp = client.get("/api/v1/places/plc_test0001?lang=ar")
        assert resp.json()["name"] == "Test Mosque"


# ── list_places lang param ─────────────────────────────────────────────────────


class TestListPlacesLang:
    def test_list_no_lang_returns_english(self, client):
        _register_place(client)
        resp = client.get("/api/v1/places")
        places = resp.json()["places"]
        assert any(p["name"] == "Test Mosque" for p in places)

    def test_list_lang_en_fast_path(self, client):
        _register_place(client)
        resp = client.get("/api/v1/places?lang=en")
        assert resp.status_code == 200
        places = resp.json()["places"]
        assert any(p["name"] == "Test Mosque" for p in places)

    def test_list_lang_ar_returns_translation_when_stored(self, client, db_session):
        _register_place(client)
        ct_db.upsert_translation(
            "place", "plc_test0001", "name", "ar", "مسجد", "manual", db_session
        )
        resp = client.get("/api/v1/places?lang=ar")
        assert resp.status_code == 200
        places = resp.json()["places"]
        match = next((p for p in places if p["place_code"] == "plc_test0001"), None)
        assert match is not None
        assert match["name"] == "مسجد"


# ── batch_create_places translations persistence ───────────────────────────────


class TestBatchCreateTranslations:
    def test_translations_stored_on_batch_ingest(self, client, db_session):
        payload = {
            "places": [
                {
                    **SAMPLE_PLACE,
                    "translations": {
                        "name": {"ar": "مسجد", "hi": "मस्जिद"},
                        "description": {"ar": "وصف"},
                    },
                }
            ]
        }
        resp = client.post("/api/v1/places/batch", json=payload)
        assert resp.status_code == 200

        ar_name = ct_db.get_translation("place", "plc_test0001", "name", "ar", db_session)
        hi_name = ct_db.get_translation("place", "plc_test0001", "name", "hi", db_session)
        ar_desc = ct_db.get_translation("place", "plc_test0001", "description", "ar", db_session)
        assert ar_name == "مسجد"
        assert hi_name == "मस्जिद"
        assert ar_desc == "وصف"

    def test_english_lang_not_stored(self, client, db_session):
        payload = {
            "places": [
                {
                    **SAMPLE_PLACE,
                    "translations": {
                        "name": {"en": "Test Mosque", "ar": "مسجد"},
                    },
                }
            ]
        }
        resp = client.post("/api/v1/places/batch", json=payload)
        assert resp.status_code == 200
        en_row = ct_db.get_translation("place", "plc_test0001", "name", "en", db_session)
        assert en_row is None  # English never stored in ContentTranslation


# ── build_specifications localisation ─────────────────────────────────────────


class TestBuildSpecificationsLocalisation:
    def _make_place(self, place_code="plc_001"):
        return SimpleNamespace(religion="islam", place_code=place_code)

    def _make_defn(self, attribute_code, icon="info", label_key=None, name="Label"):
        d = MagicMock()
        d.attribute_code = attribute_code
        d.icon = icon
        d.label_key = label_key
        d.name = name
        return d

    def test_english_shows_available(self):
        place = self._make_place()
        defn = self._make_defn("wheelchair_accessible", label_key="spec.wheelchair")
        attrs = {"wheelchair_accessible": True}
        session = MagicMock()
        with patch(
            "app.services.place_specifications.attr_db.get_attribute_definitions"
        ) as mock_defs:
            mock_defs.return_value = [defn]
            result = build_specifications(place, session, attrs=attrs, lang=None)
        assert result[0]["value"] == "Available"

    def test_arabic_shows_localised_available(self, db_session):
        ct_db.upsert_translation(
            "spec_value", "spec.available", "value", "ar", "متاح", "manual", db_session
        )
        place = self._make_place()
        defn = self._make_defn("wheelchair_accessible", label_key="spec.wheelchair")
        attrs = {"wheelchair_accessible": True}
        with patch(
            "app.services.place_specifications.attr_db.get_attribute_definitions"
        ) as mock_defs:
            mock_defs.return_value = [defn]
            result = build_specifications(place, db_session, attrs=attrs, lang="ar")
        assert result[0]["value"] == "متاح"

    def test_arabic_shows_localised_separate(self, db_session):
        ct_db.upsert_translation(
            "spec_value", "spec.separate", "value", "ar", "منفصل", "manual", db_session
        )
        place = self._make_place()
        defn = self._make_defn("has_womens_area", label_key="spec.womens_area")
        attrs = {"has_womens_area": True}
        with patch(
            "app.services.place_specifications.attr_db.get_attribute_definitions"
        ) as mock_defs:
            mock_defs.return_value = [defn]
            result = build_specifications(place, db_session, attrs=attrs, lang="ar")
        assert result[0]["value"] == "منفصل"

    def test_missing_translation_falls_back_to_english(self, db_session):
        """If ContentTranslation row absent, fallback to 'Available'/'Separate'."""
        place = self._make_place()
        defn = self._make_defn("wheelchair_accessible", label_key="spec.wheelchair")
        attrs = {"wheelchair_accessible": True}
        with patch(
            "app.services.place_specifications.attr_db.get_attribute_definitions"
        ) as mock_defs:
            mock_defs.return_value = [defn]
            # No CT row for "ar" → should use default English
            result = build_specifications(place, db_session, attrs=attrs, lang="ar")
        assert result[0]["value"] == "Available"
