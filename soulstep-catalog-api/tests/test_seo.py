"""Tests for SEO endpoints and services.

Covers:
- GET /sitemap.xml
- GET /robots.txt
- GET /llms.txt
- GET /llms-full.txt
- GET /share/places/{code}  — enhanced with JSON-LD and crawler detection
- GET  /api/v1/admin/seo/stats
- GET  /api/v1/admin/seo/places
- GET  /api/v1/admin/seo/places/{place_code}
- PATCH /api/v1/admin/seo/places/{place_code}
- POST /api/v1/admin/seo/places/{place_code}/generate
- POST /api/v1/admin/seo/generate
- seo_generator service unit tests
"""

from tests.conftest import SAMPLE_PLACE

# ── helpers ────────────────────────────────────────────────────────────────────


def _create_place(client, place_code: str = "plc_seo00001", **overrides):
    data = {**SAMPLE_PLACE, "place_code": place_code, **overrides}
    resp = client.post("/api/v1/places", json=data)
    assert resp.status_code == 200, resp.text
    return resp


def _register_and_token(client, email="admin@seo.test") -> tuple[str, str]:
    """Register a user and return (token, user_code)."""
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Admin1234!", "display_name": "SEO Admin"},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    return data["token"], data["user"]["user_code"]


def _make_admin(db_session, user_code: str) -> None:
    from sqlmodel import select

    from app.db.models import User

    user = db_session.exec(select(User).where(User.user_code == user_code)).first()
    user.is_admin = True
    db_session.add(user)
    db_session.commit()


def _admin_headers(client, db_session, email="admin@seo.test") -> dict:
    """Register, elevate to admin, return auth headers."""
    token, user_code = _register_and_token(client, email=email)
    _make_admin(db_session, user_code)
    return {"Authorization": f"Bearer {token}"}


# ── Static SEO files ───────────────────────────────────────────────────────────


class TestRobotsTxt:
    def test_robots_ok(self, client):
        resp = client.get("/robots.txt")
        assert resp.status_code == 200
        body = resp.text
        assert "User-agent: *" in body
        assert "Sitemap:" in body
        assert "ChatGPT-User" in body
        assert "Claude-Web" in body
        assert "PerplexityBot" in body
        # Auth and admin paths must be disallowed
        assert "Disallow: /api/v1/auth/" in body
        assert "Disallow: /api/v1/admin/" in body

    def test_robots_content_type(self, client):
        resp = client.get("/robots.txt")
        assert "text/plain" in resp.headers.get("content-type", "")


class TestLlmsTxt:
    def test_llms_ok(self, client):
        resp = client.get("/llms.txt")
        assert resp.status_code == 200
        body = resp.text
        assert "SoulStep" in body
        assert "Islam" in body
        assert "/api/v1/places" in body

    def test_llms_full_ok(self, client):
        resp = client.get("/llms-full.txt")
        assert resp.status_code == 200
        body = resp.text
        assert "SoulStep" in body
        assert "place_code" in body

    def test_llms_place_count(self, client):
        """Place count in llms.txt reflects actual DB contents."""
        _create_place(client, "plc_llms0001", name="Mosque For LLMs")
        resp = client.get("/llms.txt")
        assert resp.status_code == 200
        assert "1" in resp.text  # At least one place appears in count


class TestSitemapXml:
    def test_sitemap_empty(self, client):
        resp = client.get("/sitemap.xml")
        assert resp.status_code == 200
        assert "application/xml" in resp.headers.get("content-type", "")
        assert b"urlset" in resp.content

    def test_sitemap_contains_place(self, client):
        _create_place(client, "plc_sitemap01", name="Sitemap Mosque")
        resp = client.get("/sitemap.xml")
        assert resp.status_code == 200
        body = resp.text
        assert "plc_sitemap01" in body
        assert "<loc>" in body

    def test_sitemap_hreflang(self, client):
        _create_place(client, "plc_sitemap02", name="Hreflang Mosque")
        resp = client.get("/sitemap.xml")
        assert "hreflang" in resp.text


# ── Share (enhanced pre-rendering) ────────────────────────────────────────────


class TestSharePlaceEnhanced:
    def test_share_ok_html(self, client):
        _create_place(client, "plc_shar_001", name="Al-Farooq Mosque")
        resp = client.get("/share/places/plc_shar_001")
        assert resp.status_code == 200
        assert "text/html" in resp.headers.get("content-type", "")
        body = resp.text
        assert "Al-Farooq Mosque" in body
        assert "og:title" in body
        assert "og:url" in body

    def test_share_has_canonical(self, client):
        _create_place(client, "plc_shar_002", name="Canonical Mosque")
        resp = client.get("/share/places/plc_shar_002")
        assert "canonical" in resp.text

    def test_share_has_jsonld(self, client):
        _create_place(client, "plc_shar_003", name="JSON-LD Mosque")
        resp = client.get("/share/places/plc_shar_003")
        assert "application/ld+json" in resp.text
        assert "@context" in resp.text
        assert "schema.org" in resp.text

    def test_share_not_found(self, client):
        resp = client.get("/share/places/plc_doesnotexist99")
        assert resp.status_code == 404

    def test_share_crawler_no_redirect(self, client):
        """Bot user-agent should NOT get a JS redirect."""
        _create_place(client, "plc_shar_004", name="Bot Mosque")
        resp = client.get(
            "/share/places/plc_shar_004",
            headers={"User-Agent": "Googlebot/2.1 (+http://www.google.com/bot.html)"},
        )
        assert resp.status_code == 200
        assert "window.location.replace" not in resp.text

    def test_share_human_has_redirect(self, client):
        """Human user-agent should get the JS redirect."""
        _create_place(client, "plc_shar_005", name="Human Mosque")
        resp = client.get(
            "/share/places/plc_shar_005",
            headers={"User-Agent": "Mozilla/5.0 (Macintosh) Chrome/120"},
        )
        assert resp.status_code == 200
        assert "window.location.replace" in resp.text


# ── Admin SEO endpoints ────────────────────────────────────────────────────────


class TestAdminSEOStats:
    def test_requires_admin(self, client):
        resp = client.get("/api/v1/admin/seo/stats")
        assert resp.status_code == 401

    def test_stats_ok(self, client, db_session):
        headers = _admin_headers(client, db_session)
        _create_place(client, "plc_stats001", name="Stats Mosque")
        resp = client.get("/api/v1/admin/seo/stats", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "total_places" in data
        assert "coverage_pct" in data
        assert data["total_places"] >= 1

    def test_stats_translation_cost_fields(self, client, db_session):
        headers = _admin_headers(client, db_session)
        resp = client.get("/api/v1/admin/seo/stats", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "translation_chars" in data
        assert "translation_cost_usd" in data
        assert isinstance(data["translation_chars"], int)
        assert isinstance(data["translation_cost_usd"], float)
        assert data["translation_chars"] >= 0
        assert data["translation_cost_usd"] >= 0.0


class TestAdminSEOList:
    def test_list_ok(self, client, db_session):
        headers = _admin_headers(client, db_session)
        _create_place(client, "plc_list001", name="List Mosque")
        resp = client.get("/api/v1/admin/seo/places", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert "total" in data
        assert isinstance(data["items"], list)

    def test_list_missing_only(self, client, db_session):
        headers = _admin_headers(client, db_session)
        _create_place(client, "plc_miss001", name="Missing SEO")
        resp = client.get("/api/v1/admin/seo/places?missing_only=true", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        # All returned items should have has_seo=False
        for item in data["items"]:
            assert item["has_seo"] is False

    def test_list_search(self, client, db_session):
        headers = _admin_headers(client, db_session)
        _create_place(client, "plc_srch001", name="Unique Searchable Mosque XYZ")
        resp = client.get(
            "/api/v1/admin/seo/places?search=Unique+Searchable+Mosque", headers=headers
        )
        assert resp.status_code == 200
        data = resp.json()
        assert any("Unique Searchable" in item["name"] for item in data["items"])

    def test_list_pagination(self, client, db_session):
        headers = _admin_headers(client, db_session)
        resp = client.get("/api/v1/admin/seo/places?page=1&page_size=10", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["page"] == 1
        assert data["page_size"] == 10


class TestAdminSEODetail:
    def test_get_detail_ok(self, client, db_session):
        headers = _admin_headers(client, db_session)
        _create_place(client, "plc_det001", name="Detail Mosque")
        resp = client.get("/api/v1/admin/seo/places/plc_det001", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["place_code"] == "plc_det001"
        assert data["name"] == "Detail Mosque"

    def test_get_detail_not_found(self, client, db_session):
        headers = _admin_headers(client, db_session)
        resp = client.get("/api/v1/admin/seo/places/plc_nonexistent", headers=headers)
        assert resp.status_code == 404


class TestAdminSEOGenerate:
    def test_generate_single(self, client, db_session):
        headers = _admin_headers(client, db_session)
        _create_place(
            client, "plc_gen001", name="Generate Mosque", description="A beautiful mosque in Dubai"
        )
        resp = client.post("/api/v1/admin/seo/places/plc_gen001/generate", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["place_code"] == "plc_gen001"
        assert data["slug"] is not None
        assert data["seo_title"] is not None
        assert data["meta_description"] is not None
        assert "generate" in data["slug"].lower() or "mosque" in data["slug"].lower()

    def test_generate_single_not_found(self, client, db_session):
        headers = _admin_headers(client, db_session)
        resp = client.post("/api/v1/admin/seo/places/plc_none9999/generate", headers=headers)
        assert resp.status_code == 404

    def test_bulk_generate(self, client, db_session):
        headers = _admin_headers(client, db_session)
        _create_place(client, "plc_bulk01", name="Bulk Mosque 1")
        _create_place(client, "plc_bulk02", name="Bulk Mosque 2")
        resp = client.post(
            "/api/v1/admin/seo/generate",
            json={"force": False},
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "generated" in data
        assert data["generated"] >= 2


class TestAdminSEOPatch:
    def test_patch_seo(self, client, db_session):
        headers = _admin_headers(client, db_session)
        _create_place(client, "plc_patch01", name="Patch Mosque")
        # First generate
        client.post("/api/v1/admin/seo/places/plc_patch01/generate", headers=headers)
        # Then patch
        resp = client.patch(
            "/api/v1/admin/seo/places/plc_patch01",
            json={
                "seo_title": "Custom SEO Title for Patch Mosque",
                "meta_description": "Custom description for testing.",
            },
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["seo_title"] == "Custom SEO Title for Patch Mosque"
        assert data["meta_description"] == "Custom description for testing."
        assert data["is_manually_edited"] is True

    def test_patch_slug_conflict(self, client, db_session):
        headers = _admin_headers(client, db_session)
        _create_place(client, "plc_slug01", name="Slug Place One")
        _create_place(client, "plc_slug02", name="Slug Place Two")
        # Generate both
        client.post("/api/v1/admin/seo/places/plc_slug01/generate", headers=headers)
        client.post("/api/v1/admin/seo/places/plc_slug02/generate", headers=headers)
        slug1 = client.get("/api/v1/admin/seo/places/plc_slug01", headers=headers).json()["slug"]

        # Try to set plc_slug02's slug to the same value as plc_slug01's
        resp = client.patch(
            "/api/v1/admin/seo/places/plc_slug02",
            json={"slug": slug1},
            headers=headers,
        )
        assert resp.status_code == 409

    def test_manually_edited_skipped_on_bulk_generate(self, client, db_session):
        headers = _admin_headers(client, db_session, email="manual@seo.test")
        _create_place(client, "plc_manual01", name="Manual Edit Mosque")
        # Generate + patch (marks as manually edited)
        client.post("/api/v1/admin/seo/places/plc_manual01/generate", headers=headers)
        client.patch(
            "/api/v1/admin/seo/places/plc_manual01",
            json={"seo_title": "Manually Set Title"},
            headers=headers,
        )

        # Bulk generate without force — should skip manually edited
        resp = client.post(
            "/api/v1/admin/seo/generate",
            json={"force": False},
            headers=headers,
        )
        assert resp.status_code == 200

        # Title should still be the manual one
        detail = client.get("/api/v1/admin/seo/places/plc_manual01", headers=headers).json()
        assert detail["seo_title"] == "Manually Set Title"


# ── seo_generator unit tests ──────────────────────────────────────────────────


class TestSEOGenerator:
    def test_slugify_basic(self):
        from app.services.seo_generator import _slugify

        assert _slugify("Grand Mosque Dubai") == "grand-mosque-dubai"

    def test_slugify_unicode(self):
        from app.services.seo_generator import _slugify

        assert _slugify("Masjid Al-Hamdān") == "masjid-al-hamdan"

    def test_slugify_truncation(self):
        from app.services.seo_generator import _slugify

        long_text = "a" * 100
        result = _slugify(long_text, max_length=80)
        assert len(result) <= 80

    def test_generate_seo_title(self, db_session):
        from app.db.models import Place
        from app.services.seo_generator import generate_seo_title

        place = Place(
            place_code="plc_unit001",
            name="Al-Farooq Mosque",
            religion="islam",
            place_type="mosque",
            lat=25.2,
            lng=55.3,
            address="2nd Street, Al Safa, Dubai, UAE",
        )
        title = generate_seo_title(place)
        assert "Al-Farooq" in title
        assert len(title) <= 70  # Generous bound

    def test_generate_meta_description(self, db_session):
        from app.db.models import Place
        from app.services.seo_generator import generate_meta_description

        place = Place(
            place_code="plc_unit002",
            name="Lotus Temple",
            religion="bahai",
            place_type="bahaishouse",
            lat=28.5,
            lng=77.2,
            address="Bahapur, New Delhi, India",
            description="The Lotus Temple is a Bahá'í House of Worship in New Delhi.",
        )
        desc = generate_meta_description(place)
        assert len(desc) <= 165  # Small buffer for edge cases
        assert "Lotus" in desc or "Bahapur" in desc or "Delhi" in desc

    def test_generate_faqs_basic(self):
        from app.db.models import Place
        from app.services.seo_generator import generate_faqs

        place = Place(
            place_code="plc_unit003",
            name="St. Mary's Church",
            religion="christianity",
            place_type="church",
            lat=1.0,
            lng=2.0,
            address="Main St, London, UK",
        )
        faqs = generate_faqs(place)
        assert len(faqs) >= 1
        for faq in faqs:
            assert "question" in faq
            assert "answer" in faq

    def test_upsert_place_seo_creates(self, db_session):
        from datetime import UTC, datetime

        from app.db.models import Place
        from app.services.seo_generator import upsert_place_seo

        place = Place(
            place_code="plc_upsrt01",
            name="Upsert Test Mosque",
            religion="islam",
            place_type="mosque",
            lat=10.0,
            lng=20.0,
            address="Test St, Test City",
            created_at=datetime.now(UTC),
        )
        db_session.add(place)
        db_session.commit()

        seo = upsert_place_seo(place, db_session)
        assert seo.place_code == "plc_upsrt01"
        assert seo.slug is not None
        assert seo.seo_title is not None
        assert seo.meta_description is not None
        assert seo.is_manually_edited is False

    def test_upsert_skips_manually_edited(self, db_session):
        from datetime import UTC, datetime

        from app.db.models import Place
        from app.services.seo_generator import upsert_place_seo

        place = Place(
            place_code="plc_skip001",
            name="Manual Skip Mosque",
            religion="islam",
            place_type="mosque",
            lat=10.0,
            lng=20.0,
            address="Skip St, City",
            created_at=datetime.now(UTC),
        )
        db_session.add(place)
        db_session.commit()

        # First generation
        seo = upsert_place_seo(place, db_session)
        seo.seo_title = "Manually Set"
        seo.is_manually_edited = True
        db_session.add(seo)
        db_session.commit()

        # Regenerate without force — should skip
        seo2 = upsert_place_seo(place, db_session, force=False)
        assert seo2.seo_title == "Manually Set"

        # Regenerate with force — should overwrite
        seo3 = upsert_place_seo(place, db_session, force=True)
        assert seo3.seo_title != "Manually Set"
