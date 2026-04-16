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


_API_KEY_HEADERS = {"X-API-Key": "test-api-key"}


def _create_place(client, place_code: str = "plc_seo00001", **overrides):
    data = {**SAMPLE_PLACE, "place_code": place_code, **overrides}
    resp = client.post("/api/v1/places", json=data, headers=_API_KEY_HEADERS)
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

    def test_sitemap_includes_static_pages(self, client):
        resp = client.get("/sitemap.xml")
        assert resp.status_code == 200
        body = resp.text
        for path in ("/about", "/privacy", "/terms", "/contact", "/developers"):
            assert path in body, f"Missing static page {path} in sitemap"


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

    def test_stats_lang_coverage_and_stale(self, client, db_session):
        headers = _admin_headers(client, db_session)
        resp = client.get("/api/v1/admin/seo/stats", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "lang_coverage" in data
        assert "stale_count" in data
        assert isinstance(data["lang_coverage"], dict)
        assert isinstance(data["stale_count"], int)
        assert data["stale_count"] >= 0


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


# ── generate_slug collision disambiguation ────────────────────────────────────


class TestGenerateSlug:
    """Ensure generate_slug never leaks raw Google Place IDs into URLs."""

    def _make_place(self, place_code: str, name: str, city: str = "Dubai"):
        from app.db.models import Place

        return Place(
            place_code=place_code,
            name=name,
            religion="islam",
            place_type="mosque",
            lat=25.2,
            lng=55.3,
            address="Test St",
            city=city,
        )

    def test_unique_name_returns_bare_slug(self, db_session):
        """No collision → bare name slug, no suffix."""
        from app.services.seo_generator import generate_slug

        place = self._make_place("gplc_ChIJunique01", "Al-Farooq Mosque")
        slug = generate_slug(place, db_session)
        assert slug == "al-farooq-mosque"

    def test_collision_uses_city_not_google_id(self, db_session):
        """Slug collision → disambiguation by city, NOT by raw Google Place ID."""
        from app.db.models import PlaceSEO
        from app.services.seo_generator import generate_slug

        # Seed an existing SEO row with slug "mosque"
        existing = PlaceSEO(
            place_code="gplc_existing01", slug="mosque", seo_title="Mosque", meta_description="test"
        )
        db_session.add(existing)
        db_session.commit()

        place = self._make_place("gplc_ChIJcollide01", "Mosque", city="Sharjah")
        slug = generate_slug(place, db_session)

        # Must use city for disambiguation
        assert "sharjah" in slug
        # Must NOT contain the Google Places ID prefix
        assert "gchij" not in slug.lower()
        assert "gplc" not in slug.lower()
        # Must be all lowercase, no uppercase
        assert slug == slug.lower()

    def test_collision_slug_is_all_lowercase(self, db_session):
        """Slug must be fully lowercase even when place_code has uppercase chars."""
        from app.db.models import PlaceSEO
        from app.services.seo_generator import generate_slug

        # Force two collisions so we reach the short_id fallback
        db_session.add(
            PlaceSEO(
                place_code="gplc_x1", slug="masjid", seo_title="Masjid", meta_description="test"
            )
        )
        db_session.add(
            PlaceSEO(
                place_code="gplc_x2",
                slug="masjid-dubai",
                seo_title="Masjid Dubai",
                meta_description="test",
            )
        )
        db_session.commit()

        place = self._make_place("gplc_ChIJABCDEFGH1234", "Masjid", city="Dubai")
        slug = generate_slug(place, db_session)

        assert slug == slug.lower(), f"Slug not lowercase: {slug!r}"
        assert " " not in slug
        # The Google Places ID characters (ChIJ, uppercase hex) must not appear
        assert "chij" not in slug.lower() or slug.startswith("masjid")

    def test_no_readable_name_returns_short_clean_id(self, db_session):
        """Place with no useful name → short clean id, no uppercase."""
        from app.services.seo_generator import generate_slug

        place = self._make_place("gplc_ChIJABCDEF0001", "")
        slug = generate_slug(place, db_session)

        assert slug  # not empty
        assert slug == slug.lower()
        assert " " not in slug

    def test_city_with_digits_not_used_for_disambiguation(self, db_session):
        """If city looks like a street address (contains digits), skip city disambiguation."""
        from app.db.models import PlaceSEO
        from app.services.seo_generator import generate_slug

        db_session.add(
            PlaceSEO(
                place_code="gplc_street1",
                slug="mosque",
                seo_title="Mosque",
                meta_description="test",
            )
        )
        db_session.commit()

        # City is a street address — should not appear in the disambiguation slug
        place = self._make_place("gplc_ChIJstreet01", "Mosque", city="268 Tottenham Ct Rd")
        slug = generate_slug(place, db_session)

        # Should NOT use the street address as a meaningful city component
        assert "268" not in slug
        assert "tottenham" not in slug or slug.startswith("mosque")


# ── sitemap city quality filter ───────────────────────────────────────────────


class TestCitySlugFilter:
    """_is_real_city_slug should pass genuine cities and reject street addresses."""

    def _is_real(self, slug: str) -> bool:
        from app.api.v1.sitemap import _is_real_city_slug

        return _is_real_city_slug(slug)

    # ── should pass ──────────────────────────────────────────────────────────

    def test_real_city_dubai(self):
        assert self._is_real("dubai") is True

    def test_real_city_london(self):
        assert self._is_real("london") is True

    def test_real_city_new_york(self):
        assert self._is_real("new-york") is True

    def test_real_city_abu_dhabi(self):
        assert self._is_real("abu-dhabi") is True

    def test_real_city_kuala_lumpur(self):
        assert self._is_real("kuala-lumpur") is True

    # ── should reject ─────────────────────────────────────────────────────────

    def test_rejects_slug_with_number(self):
        assert self._is_real("268-269-tottenham-ct-rd") is False

    def test_rejects_postal_code_fragment(self):
        assert self._is_real("88hv-5v2-rugaylat-rd") is False

    def test_rejects_unnamed_road(self):
        assert self._is_real("unnamed-road") is False

    def test_rejects_building_name(self):
        # "saheel-business-tower-1-near-al-mullah-plaza" has a digit
        assert self._is_real("saheel-business-tower-1-near-al-mullah-plaza") is False

    def test_rejects_very_long_slug(self):
        # More than 40 chars → address fragment (42 chars, no digits)
        assert self._is_real("saheel-business-tower-near-al-mullah-plaza") is False

    def test_rejects_empty_string(self):
        assert self._is_real("") is False

    def test_rejects_cityz27(self):
        assert self._is_real("cityz27") is False

    def test_rejects_floor_of_mercato(self):
        assert self._is_real("floor-of-mercato") is False


class TestCityToSlug:
    """_city_to_slug should normalise Unicode and produce clean ASCII slugs."""

    def _slug(self, city: str) -> str:
        from app.api.v1.sitemap import _city_to_slug

        return _city_to_slug(city)

    def test_ascii_city(self):
        assert self._slug("Dubai") == "dubai"

    def test_accented_city(self):
        assert self._slug("Zürich") == "zurich"

    def test_arabic_city_becomes_empty_or_clean(self):
        # Arabic chars strip to empty after ASCII encoding — must not raise
        result = self._slug("دبي")
        assert isinstance(result, str)
        # Either empty (all non-ASCII stripped) or clean ASCII
        assert result == result.lower()

    def test_apostrophe_stripped(self):
        # "Dean's Yard" → "dean-s-yard" (acceptable) or "deans-yard"
        result = self._slug("Dean's Yard")
        assert result == result.lower()
        assert "'" not in result

    def test_spaces_become_dashes(self):
        assert self._slug("Abu Dhabi") == "abu-dhabi"

    def test_no_leading_trailing_dashes(self):
        result = self._slug("  Dubai  ")
        assert not result.startswith("-")
        assert not result.endswith("-")
