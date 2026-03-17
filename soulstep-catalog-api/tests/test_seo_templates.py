"""Tests for multi-language SEO template system.

Covers:
- SEOLabel and SEOContentTemplate DB models
- Template rendering with variable substitution
- Fallback rendering when optional vars are missing
- Multi-language SEO generation (en + ar)
- Label lookup with English fallback
- PlaceSEOTranslation CRUD
- Bulk generate with langs param
- Template version tracking (stale detection)
- Admin template/label CRUD endpoints
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlmodel import Session, select

from app.db.models import (
    ContentTranslation,
    Place,
    PlaceSEO,
    PlaceSEOTranslation,
    SEOContentTemplate,
    SEOLabel,
)
from app.services import seo_generator
from tests.conftest import SAMPLE_PLACE

_API_KEY_HEADERS = {"X-API-Key": "test-api-key"}


# ── Helpers ──────────────────────────────────────────────────────────────────


def _create_place(client, place_code: str = "plc_seotmpl01", **overrides):
    data = {**SAMPLE_PLACE, "place_code": place_code, **overrides}
    resp = client.post("/api/v1/places", json=data, headers=_API_KEY_HEADERS)
    assert resp.status_code == 200, resp.text
    return resp


def _register_and_token(client, email="admin@seotmpl.test") -> tuple[str, str]:
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Admin1234!", "display_name": "SEO Admin"},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    return data["token"], data["user"]["user_code"]


def _make_admin(db_session, user_code: str) -> None:
    from app.db.models import User

    user = db_session.exec(select(User).where(User.user_code == user_code)).first()
    user.is_admin = True
    db_session.add(user)
    db_session.commit()


def _seed_labels(session: Session) -> None:
    """Seed a minimal set of labels for testing."""
    labels = [
        SEOLabel(label_type="religion", label_key="islam", lang="en", label_text="Islamic"),
        SEOLabel(label_type="religion", label_key="islam", lang="ar", label_text="إسلامي"),
        SEOLabel(label_type="place_type", label_key="mosque", lang="en", label_text="Mosque"),
        SEOLabel(label_type="place_type", label_key="mosque", lang="ar", label_text="مسجد"),
    ]
    for label in labels:
        session.add(label)
    session.commit()


def _seed_templates(session: Session, version: int = 1) -> None:
    """Seed minimal templates for testing."""
    now = datetime.now(UTC)
    templates = [
        SEOContentTemplate(
            template_code="seo_title",
            lang="en",
            template_text="{name} – {type_label} in {location}",
            fallback_text="{name} – {religion_label} {type_label}",
            static_phrases={},
            version=version,
            is_active=True,
            created_at=now,
            updated_at=now,
        ),
        SEOContentTemplate(
            template_code="seo_title",
            lang="ar",
            template_text="{name} – {type_label} في {location}",
            fallback_text="{name} – {type_label} {religion_label}",
            static_phrases={},
            version=version,
            is_active=True,
            created_at=now,
            updated_at=now,
        ),
        SEOContentTemplate(
            template_code="meta_description",
            lang="en",
            template_text="{rating_sentence}{description_snippet}",
            fallback_text="Explore {name}, a {religion_label} {type_label_lower} on SoulStep – discover sacred sites worldwide.",
            static_phrases={},
            version=version,
            is_active=True,
            created_at=now,
            updated_at=now,
        ),
        SEOContentTemplate(
            template_code="rich_description",
            lang="en",
            template_text="{name} is a {religion_label} {type_label_lower} {location_sentence}. {description} {rating_sentence} {website_sentence}",
            fallback_text="{name} is a {religion_label} {type_label_lower}. {description}",
            static_phrases={
                "located_at": "located at",
                "rating_prefix": "It has received an average rating of",
                "out_of": "out of 5 based on",
                "visitor_review": "visitor review",
                "visitor_reviews": "visitor reviews",
                "official_website": "Official website:",
            },
            version=version,
            is_active=True,
            created_at=now,
            updated_at=now,
        ),
        SEOContentTemplate(
            template_code="faq_what_is",
            lang="en",
            template_text="What is {name}?",
            static_phrases={
                "answer_template": "{name} is a {religion_label} {type_label_lower}{location_clause}.{description_clause}"
            },
            version=version,
            is_active=True,
            created_at=now,
            updated_at=now,
        ),
        SEOContentTemplate(
            template_code="faq_location",
            lang="en",
            template_text="Where is {name} located?",
            static_phrases={"answer_template": "{name} is located at {address}."},
            version=version,
            is_active=True,
            created_at=now,
            updated_at=now,
        ),
    ]
    for t in templates:
        session.add(t)
    session.commit()


def _seed_place(session: Session, place_code: str = "plc_seotmpl01") -> Place:
    place = Place(
        place_code=place_code,
        name="Test Mosque",
        religion="islam",
        place_type="mosque",
        lat=25.2,
        lng=55.3,
        address="123 Test St, Dubai",
        description="A beautiful mosque.",
        opening_hours={
            "Monday": "05:00-22:00",
            "Friday": "05:00-23:00",
        },
        created_at=datetime.now(UTC),
    )
    session.add(place)
    session.commit()
    session.refresh(place)
    return place


def _seed_ar_translation(session: Session, place_code: str = "plc_seotmpl01") -> None:
    """Seed Arabic ContentTranslation for a place."""
    now = datetime.now(UTC)
    for field, text in [
        ("name", "مسجد تجريبي"),
        ("description", "مسجد جميل"),
        ("address", "123 شارع الاختبار، دبي"),
    ]:
        session.add(
            ContentTranslation(
                entity_type="place",
                entity_code=place_code,
                field=field,
                lang="ar",
                translated_text=text,
                source="manual",
                created_at=now,
                updated_at=now,
            )
        )
    session.commit()


# ── Unit tests: label loading ─────────────────────────────────────────────────


class TestLabelLoading:
    def test_load_labels_from_db(self, test_engine):
        with Session(test_engine) as session:
            _seed_labels(session)
            religion, place_type = seo_generator._load_labels("en", session)
            assert religion["islam"] == "Islamic"
            assert place_type["mosque"] == "Mosque"

    def test_load_labels_arabic(self, test_engine):
        with Session(test_engine) as session:
            _seed_labels(session)
            religion, place_type = seo_generator._load_labels("ar", session)
            assert religion["islam"] == "إسلامي"
            assert place_type["mosque"] == "مسجد"

    def test_load_labels_fallback_to_english(self, test_engine):
        """Non-English lang with no DB labels falls back to English labels then hardcoded."""
        with Session(test_engine) as session:
            _seed_labels(session)
            # Hindi not seeded — should fall back to English DB labels
            religion, place_type = seo_generator._load_labels("hi", session)
            assert religion["islam"] == "Islamic"
            assert place_type["mosque"] == "Mosque"

    def test_load_labels_no_db_uses_hardcoded(self, test_engine):
        """When no DB labels exist, hardcoded fallback is used."""
        with Session(test_engine) as session:
            religion, place_type = seo_generator._load_labels("en", session)
            assert religion["islam"] == "Islamic"
            assert place_type["mosque"] == "Mosque"


# ── Unit tests: template rendering ────────────────────────────────────────────


class TestTemplateRendering:
    def test_render_template_with_all_vars(self, test_engine):
        with Session(test_engine) as session:
            _seed_templates(session)
            tmpl = seo_generator._load_template("seo_title", "en", session)
            assert tmpl is not None
            result = seo_generator._render_template(
                tmpl,
                {
                    "name": "Grand Mosque",
                    "type_label": "Mosque",
                    "religion_label": "Islamic",
                    "location": "Dubai",
                },
            )
            assert result == "Grand Mosque – Mosque in Dubai"

    def test_render_fallback_when_location_missing(self, test_engine):
        with Session(test_engine) as session:
            _seed_templates(session)
            tmpl = seo_generator._load_template("seo_title", "en", session)
            assert tmpl is not None
            result = seo_generator._render_fallback(
                tmpl,
                {
                    "name": "Grand Mosque",
                    "type_label": "Mosque",
                    "religion_label": "Islamic",
                },
            )
            assert result == "Grand Mosque – Islamic Mosque"

    def test_render_template_missing_var_defaults_to_empty(self, test_engine):
        with Session(test_engine) as session:
            _seed_templates(session)
            tmpl = seo_generator._load_template("seo_title", "en", session)
            assert tmpl is not None
            result = seo_generator._render_template(tmpl, {"name": "Test"})
            # Missing vars become empty string
            assert "Test" in result

    def test_load_template_fallback_to_english(self, test_engine):
        with Session(test_engine) as session:
            _seed_templates(session)
            # Hindi template not seeded — falls back to English
            tmpl = seo_generator._load_template("seo_title", "hi", session)
            assert tmpl is not None
            assert tmpl.lang == "en"


# ── Unit tests: SEO generation with templates ─────────────────────────────────


class TestSEOGeneration:
    def test_generate_seo_title_with_template(self, test_engine):
        with Session(test_engine) as session:
            _seed_labels(session)
            _seed_templates(session)
            place = _seed_place(session)

            title = seo_generator.generate_seo_title(place, session=session, lang="en")
            assert "Test Mosque" in title
            assert "Dubai" in title

    def test_generate_seo_title_arabic(self, test_engine):
        with Session(test_engine) as session:
            _seed_labels(session)
            _seed_templates(session)
            place = _seed_place(session)
            _seed_ar_translation(session, place.place_code)

            title = seo_generator.generate_seo_title(place, session=session, lang="ar")
            assert "مسجد تجريبي" in title
            assert "في" in title  # Arabic "in"

    def test_generate_meta_description_with_template(self, test_engine):
        with Session(test_engine) as session:
            _seed_labels(session)
            _seed_templates(session)
            place = _seed_place(session)

            desc = seo_generator.generate_meta_description(place, session=session, lang="en")
            assert "A beautiful mosque" in desc

    def test_generate_meta_description_fallback(self, test_engine):
        with Session(test_engine) as session:
            _seed_labels(session)
            _seed_templates(session)
            place = _seed_place(session, "plc_nodesc01")
            place.description = None
            session.add(place)
            session.commit()

            desc = seo_generator.generate_meta_description(place, session=session, lang="en")
            assert "Explore" in desc
            assert "SoulStep" in desc

    def test_generate_rich_description_with_rating(self, test_engine):
        with Session(test_engine) as session:
            _seed_labels(session)
            _seed_templates(session)
            place = _seed_place(session)

            rich = seo_generator.generate_rich_description(
                place,
                rating_data={"average": 4.5, "count": 10},
                session=session,
                lang="en",
            )
            assert "4.5" in rich
            assert "10" in rich
            assert "located at" in rich

    def test_generate_faqs_with_templates(self, test_engine):
        with Session(test_engine) as session:
            _seed_labels(session)
            _seed_templates(session)
            place = _seed_place(session)

            faqs = seo_generator.generate_faqs(place, session=session, lang="en")
            assert len(faqs) >= 2  # at_least what_is + location
            questions = [f["question"] for f in faqs]
            assert any("What is" in q for q in questions)
            assert any("located" in q.lower() for q in questions)


# ── Unit tests: PlaceSEOTranslation persistence ──────────────────────────────


class TestPlaceSEOTranslation:
    def test_upsert_translation(self, test_engine):
        with Session(test_engine) as session:
            _seed_labels(session)
            _seed_templates(session)
            place = _seed_place(session)
            _seed_ar_translation(session, place.place_code)

            result = seo_generator.upsert_place_seo_translation(place, session, "ar")
            assert result.lang == "ar"
            assert result.seo_title
            assert "مسجد تجريبي" in result.seo_title

    def test_upsert_translation_idempotent(self, test_engine):
        with Session(test_engine) as session:
            _seed_labels(session)
            _seed_templates(session)
            place = _seed_place(session)
            _seed_ar_translation(session, place.place_code)

            r1 = seo_generator.upsert_place_seo_translation(place, session, "ar")
            r2 = seo_generator.upsert_place_seo_translation(place, session, "ar")
            assert r1.id == r2.id

    def test_upsert_translation_skip_manually_edited(self, test_engine):
        with Session(test_engine) as session:
            _seed_labels(session)
            _seed_templates(session)
            place = _seed_place(session)
            _seed_ar_translation(session, place.place_code)

            result = seo_generator.upsert_place_seo_translation(place, session, "ar")
            result.is_manually_edited = True
            session.add(result)
            session.commit()

            result2 = seo_generator.upsert_place_seo_translation(place, session, "ar")
            assert result2.id == result.id  # Not overwritten


# ── Unit tests: generate_all_langs ────────────────────────────────────────────


class TestGenerateAllLangs:
    def test_english_only(self, test_engine):
        with Session(test_engine) as session:
            _seed_labels(session)
            _seed_templates(session)
            place = _seed_place(session)

            results = seo_generator.generate_all_langs(place, session, langs=["en"])
            assert "en" in results
            assert isinstance(results["en"], PlaceSEO)
            assert "ar" not in results

    def test_english_and_arabic(self, test_engine):
        with Session(test_engine) as session:
            _seed_labels(session)
            _seed_templates(session)
            place = _seed_place(session)
            _seed_ar_translation(session, place.place_code)

            results = seo_generator.generate_all_langs(place, session, langs=["en", "ar"])
            assert "en" in results
            assert "ar" in results
            assert isinstance(results["ar"], PlaceSEOTranslation)

    def test_skips_lang_without_translated_name(self, test_engine):
        with Session(test_engine) as session:
            _seed_labels(session)
            _seed_templates(session)
            place = _seed_place(session)
            # No Hindi translations seeded

            results = seo_generator.generate_all_langs(place, session, langs=["en", "hi"])
            assert "en" in results
            assert "hi" not in results


# ── Unit tests: template version tracking ─────────────────────────────────────


class TestTemplateVersionTracking:
    def test_template_version_stored_on_seo(self, test_engine):
        with Session(test_engine) as session:
            _seed_labels(session)
            _seed_templates(session, version=3)
            place = _seed_place(session)

            seo = seo_generator.upsert_place_seo(place, session)
            assert seo.template_version == 3

    def test_stale_detection(self, test_engine):
        with Session(test_engine) as session:
            _seed_labels(session)
            _seed_templates(session, version=1)
            place = _seed_place(session)

            seo = seo_generator.upsert_place_seo(place, session)
            assert seo.template_version == 1

            # Bump template version
            tmpl = session.exec(
                select(SEOContentTemplate).where(
                    SEOContentTemplate.template_code == "seo_title",
                    SEOContentTemplate.lang == "en",
                )
            ).first()
            tmpl.version = 2
            session.add(tmpl)
            session.commit()

            max_ver = seo_generator._get_max_template_version(session)
            assert max_ver == 2
            assert seo.template_version < max_ver  # stale


# ── Integration tests: admin endpoints ────────────────────────────────────────


class TestAdminTemplateEndpoints:
    def test_list_templates(self, client, db_session, test_engine):
        token, user_code = _register_and_token(client, "tmpl_admin1@test.com")
        _make_admin(db_session, user_code)

        with Session(test_engine) as s:
            _seed_templates(s)

        resp = client.get(
            "/api/v1/admin/seo/templates",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) > 0
        assert "template_code" in data[0]

    def test_patch_template_bumps_version(self, client, db_session, test_engine):
        token, user_code = _register_and_token(client, "tmpl_admin2@test.com")
        _make_admin(db_session, user_code)

        with Session(test_engine) as s:
            _seed_templates(s)

        resp = client.patch(
            "/api/v1/admin/seo/templates/seo_title/en",
            json={"template_text": "{name} | {type_label} in {location}"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["version"] == 2
        assert data["template_text"] == "{name} | {type_label} in {location}"

    def test_list_labels(self, client, db_session, test_engine):
        token, user_code = _register_and_token(client, "tmpl_admin3@test.com")
        _make_admin(db_session, user_code)

        with Session(test_engine) as s:
            _seed_labels(s)

        resp = client.get(
            "/api/v1/admin/seo/labels",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) > 0
        assert "label_text" in data[0]

    def test_patch_label(self, client, db_session, test_engine):
        token, user_code = _register_and_token(client, "tmpl_admin4@test.com")
        _make_admin(db_session, user_code)

        with Session(test_engine) as s:
            _seed_labels(s)

        resp = client.patch(
            "/api/v1/admin/seo/labels/religion/islam/en",
            json={"label_text": "Islam"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["label_text"] == "Islam"


class TestAdminSEOStatsEndpoint:
    def test_stats_include_lang_coverage(self, client, db_session, test_engine):
        token, user_code = _register_and_token(client, "tmpl_admin5@test.com")
        _make_admin(db_session, user_code)

        resp = client.get(
            "/api/v1/admin/seo/stats",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "lang_coverage" in data
        assert "stale_count" in data
        assert isinstance(data["lang_coverage"], dict)


class TestAdminBulkGenerateWithLangs:
    def test_bulk_generate_english_only(self, client, db_session, test_engine):
        token, user_code = _register_and_token(client, "tmpl_admin6@test.com")
        _make_admin(db_session, user_code)
        _create_place(client, "plc_bulk_tmpl01")

        with Session(test_engine) as s:
            _seed_labels(s)
            _seed_templates(s)

        resp = client.post(
            "/api/v1/admin/seo/generate",
            json={"langs": ["en"]},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["generated"] >= 1
        assert "lang_generated" in data

    def test_bulk_generate_multi_lang(self, client, db_session, test_engine):
        token, user_code = _register_and_token(client, "tmpl_admin7@test.com")
        _make_admin(db_session, user_code)
        _create_place(client, "plc_bulk_tmpl02")

        with Session(test_engine) as s:
            _seed_labels(s)
            _seed_templates(s)
            _seed_ar_translation(s, "plc_bulk_tmpl02")

        resp = client.post(
            "/api/v1/admin/seo/generate",
            json={"langs": ["en", "ar"]},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["generated"] >= 1
        assert data["lang_generated"].get("ar", 0) >= 1


class TestAdminSEODetailWithTranslations:
    def test_detail_includes_translations(self, client, db_session, test_engine):
        token, user_code = _register_and_token(client, "tmpl_admin8@test.com")
        _make_admin(db_session, user_code)
        _create_place(client, "plc_detail_tmpl01")

        with Session(test_engine) as s:
            _seed_labels(s)
            _seed_templates(s)
            _seed_ar_translation(s, "plc_detail_tmpl01")

        # Generate for en + ar
        resp = client.post(
            "/api/v1/admin/seo/generate",
            json={"langs": ["en", "ar"]},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200

        # Get detail
        resp = client.get(
            "/api/v1/admin/seo/places/plc_detail_tmpl01",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "translations" in data
        assert "ar" in data["translations"]
        ar = data["translations"]["ar"]
        assert ar["seo_title"] is not None
        assert ar["template_version"] >= 0
        assert "is_manually_edited" in ar


class TestAdminStaleEndpoint:
    def test_stale_endpoint(self, client, db_session, test_engine):
        token, user_code = _register_and_token(client, "tmpl_admin9@test.com")
        _make_admin(db_session, user_code)

        resp = client.get(
            "/api/v1/admin/seo/stale",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
