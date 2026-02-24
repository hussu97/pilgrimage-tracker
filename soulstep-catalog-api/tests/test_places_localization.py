"""
Tests for content localization in the places API and place_specifications service.

Covers:
- _place_to_item: translation overlay applied when translations dict provided
- list_places: lang param triggers bulk translation fetch; English fast path skips it
- get_place: lang param triggers per-place translation fetch
- batch_create_places: translations field persisted in ContentTranslation
- build_specifications: localised "Available"/"Separate" via lang param
- get_place_reviews: lang param returns translated review title/body
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


# ── get_place_reviews lang param ───────────────────────────────────────────────

_REVIEW_PLACE_CODE = "plc_revloc01"
_REVIEW_PLACE = {
    "place_code": _REVIEW_PLACE_CODE,
    "name": "Review Test Mosque",
    "religion": "islam",
    "place_type": "mosque",
    "lat": 25.2048,
    "lng": 55.2708,
    "address": "456 Review St, Dubai",
}


def _setup_review_place(client):
    resp = client.post("/api/v1/places", json=_REVIEW_PLACE)
    assert resp.status_code in (200, 201), resp.text


def _register_and_get_token(client, email="reviewloc@example.com"):
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Testpass123!", "display_name": "ReviewTester"},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["token"]


def _post_review(client, token, place_code, title="English Title", body="English Body"):
    resp = client.post(
        f"/api/v1/places/{place_code}/reviews",
        json={"rating": 4, "title": title, "body": body},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


class TestGetPlaceReviewsLang:
    def test_no_lang_returns_english(self, client):
        _setup_review_place(client)
        token = _register_and_get_token(client, "rl_nolang@example.com")
        _post_review(client, token, _REVIEW_PLACE_CODE)

        resp = client.get(f"/api/v1/places/{_REVIEW_PLACE_CODE}/reviews")
        assert resp.status_code == 200
        reviews = resp.json()["reviews"]
        assert len(reviews) == 1
        assert reviews[0]["title"] == "English Title"
        assert reviews[0]["body"] == "English Body"

    def test_lang_en_fast_path_returns_english(self, client):
        _setup_review_place(client)
        token = _register_and_get_token(client, "rl_en@example.com")
        _post_review(client, token, _REVIEW_PLACE_CODE)

        resp = client.get(f"/api/v1/places/{_REVIEW_PLACE_CODE}/reviews?lang=en")
        assert resp.status_code == 200
        reviews = resp.json()["reviews"]
        assert reviews[0]["title"] == "English Title"
        assert reviews[0]["body"] == "English Body"

    def test_lang_ar_returns_translation_when_stored(self, client, db_session):
        _setup_review_place(client)
        token = _register_and_get_token(client, "rl_ar@example.com")
        review_data = _post_review(client, token, _REVIEW_PLACE_CODE)
        review_code = review_data["review_code"]

        ct_db.upsert_translation(
            "review", review_code, "title", "ar", "عنوان عربي", "manual", db_session
        )
        ct_db.upsert_translation(
            "review", review_code, "body", "ar", "نص عربي", "manual", db_session
        )

        resp = client.get(f"/api/v1/places/{_REVIEW_PLACE_CODE}/reviews?lang=ar")
        assert resp.status_code == 200
        reviews = resp.json()["reviews"]
        match = next((r for r in reviews if r["review_code"] == review_code), None)
        assert match is not None
        assert match["title"] == "عنوان عربي"
        assert match["body"] == "نص عربي"

    def test_lang_ar_falls_back_to_english_when_no_translation(self, client):
        _setup_review_place(client)
        token = _register_and_get_token(client, "rl_ar_fb@example.com")
        _post_review(client, token, _REVIEW_PLACE_CODE)

        resp = client.get(f"/api/v1/places/{_REVIEW_PLACE_CODE}/reviews?lang=ar")
        assert resp.status_code == 200
        reviews = resp.json()["reviews"]
        assert reviews[0]["title"] == "English Title"
        assert reviews[0]["body"] == "English Body"

    def test_partial_translation_body_translated_title_fallback(self, client, db_session):
        _setup_review_place(client)
        token = _register_and_get_token(client, "rl_partial@example.com")
        review_data = _post_review(client, token, _REVIEW_PLACE_CODE)
        review_code = review_data["review_code"]

        # Only store body translation, not title
        ct_db.upsert_translation(
            "review", review_code, "body", "ar", "نص مترجم فقط", "manual", db_session
        )

        resp = client.get(f"/api/v1/places/{_REVIEW_PLACE_CODE}/reviews?lang=ar")
        assert resp.status_code == 200
        reviews = resp.json()["reviews"]
        match = next((r for r in reviews if r["review_code"] == review_code), None)
        assert match is not None
        assert match["title"] == "English Title"  # falls back
        assert match["body"] == "نص مترجم فقط"  # translated

    def test_null_title_with_lang_remains_null(self, client, db_session):
        _setup_review_place(client)
        token = _register_and_get_token(client, "rl_nulltitle@example.com")
        # Post review without title
        resp = client.post(
            f"/api/v1/places/{_REVIEW_PLACE_CODE}/reviews",
            json={"rating": 3, "body": "Body only"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200, resp.text
        review_code = resp.json()["review_code"]

        ct_db.upsert_translation(
            "review", review_code, "body", "ar", "جسم فقط", "manual", db_session
        )

        resp = client.get(f"/api/v1/places/{_REVIEW_PLACE_CODE}/reviews?lang=ar")
        assert resp.status_code == 200
        reviews = resp.json()["reviews"]
        match = next((r for r in reviews if r["review_code"] == review_code), None)
        assert match is not None
        assert match["title"] is None
        assert match["body"] == "جسم فقط"
