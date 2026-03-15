"""Tests for P2 SEO features.

Covers:
- GET /api/v1/places/{code} — includes seo_slug field
- PATCH /api/v1/admin/places/{code} — auto-regenerate SEO background task
- generate_image_alt_text() — service unit test
- GET /share/religion/{religion} — category page
- GET /share/{lang}/places/{code} — multi-language pre-render
- GET /sitemap.xml — image entries + language hreflang URLs
- build_place_meta_tags() — hreflang points to language-specific URLs
"""

from tests.conftest import SAMPLE_PLACE

# ── helpers ─────────────────────────────────────────────────────────────────────


_API_KEY_HEADERS = {"X-API-Key": "test-api-key"}


def _create_place(client, place_code: str = "plc_p2seo001", **overrides):
    data = {**SAMPLE_PLACE, "place_code": place_code, **overrides}
    resp = client.post("/api/v1/places", json=data, headers=_API_KEY_HEADERS)
    assert resp.status_code == 200, resp.text
    return resp


def _register_and_token(client, email="admin@p2seo.test") -> tuple[str, str]:
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


def _admin_headers(client, db_session, email="admin@p2seo.test") -> dict:
    token, user_code = _register_and_token(client, email=email)
    _make_admin(db_session, user_code)
    return {"Authorization": f"Bearer {token}"}


def _generate_seo(client, headers, place_code: str):
    resp = client.post(
        f"/api/v1/admin/seo/places/{place_code}/generate",
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    return resp


# ── 1. seo_slug in place detail response ────────────────────────────────────────


def test_place_detail_seo_slug_none_without_seo(client):
    """seo_slug is None when no SEO record exists."""
    _create_place(client, "plc_slug_none")
    resp = client.get("/api/v1/places/plc_slug_none")
    assert resp.status_code == 200
    data = resp.json()
    assert "seo_slug" in data
    assert data["seo_slug"] is None


def test_place_detail_seo_slug_present_after_generation(client, db_session):
    """seo_slug is populated after SEO generation."""
    _create_place(client, "plc_slug_set")
    headers = _admin_headers(client, db_session, email="admin@slugset.test")
    _generate_seo(client, headers, "plc_slug_set")

    resp = client.get("/api/v1/places/plc_slug_set")
    assert resp.status_code == 200
    data = resp.json()
    assert data["seo_slug"] is not None
    assert "test-mosque" in data["seo_slug"]


# ── 2. Auto-regenerate SEO on place patch ───────────────────────────────────────


def test_patch_place_triggers_seo_regen(client, db_session):
    """PATCH with a SEO-relevant field schedules background SEO regeneration.

    The background task opens a new engine session (not the test session), so
    we verify that `_regenerate_seo_bg` is called with the correct place_code.
    """
    from unittest.mock import patch

    _create_place(client, "plc_regen001")
    headers = _admin_headers(client, db_session, email="admin@regen.test")

    with patch("app.api.v1.admin.places._regenerate_seo_bg") as mock_regen:
        resp = client.patch(
            "/api/v1/admin/places/plc_regen001",
            json={"name": "Updated Mosque"},
            headers=headers,
        )
        assert resp.status_code == 200
        mock_regen.assert_called_once_with("plc_regen001")


def test_patch_place_no_seo_trigger_for_non_seo_fields(client, db_session):
    """PATCH with non-SEO fields (e.g. utc_offset_minutes) does NOT create SEO row."""
    from sqlmodel import select

    from app.db.models import PlaceSEO

    _create_place(client, "plc_noseo001")
    headers = _admin_headers(client, db_session, email="admin@noseo.test")

    resp = client.patch(
        "/api/v1/admin/places/plc_noseo001",
        json={"utc_offset_minutes": 330},
        headers=headers,
    )
    assert resp.status_code == 200

    seo = db_session.exec(select(PlaceSEO).where(PlaceSEO.place_code == "plc_noseo001")).first()
    assert seo is None


# ── 3. generate_image_alt_text() ────────────────────────────────────────────────


def test_generate_image_alt_text_primary():
    """Primary image (display_order=0) uses '{name} – {religion} {type} in {city}' format."""
    from app.db.models import Place
    from app.services.seo_generator import generate_image_alt_text

    place = Place(
        place_code="plc_img001",
        name="Grand Mosque",
        religion="islam",
        place_type="mosque",
        lat=25.2,
        lng=55.2,
        address="Sheikh Zayed Road, Dubai",
    )
    alt = generate_image_alt_text(place, display_order=0)
    assert alt == "Grand Mosque – Islamic Mosque in Dubai"


def test_generate_image_alt_text_secondary():
    """Secondary images (display_order > 0) use interior view format."""
    from app.db.models import Place
    from app.services.seo_generator import generate_image_alt_text

    place = Place(
        place_code="plc_img002",
        name="Grand Mosque",
        religion="islam",
        place_type="mosque",
        lat=25.2,
        lng=55.2,
        address="Sheikh Zayed Road, Dubai",
    )
    alt = generate_image_alt_text(place, display_order=2)
    assert alt == "Grand Mosque – interior view 3"


def test_generate_image_alt_text_no_address():
    """Alt text without city falls back to religion + type only."""
    from app.db.models import Place
    from app.services.seo_generator import generate_image_alt_text

    place = Place(
        place_code="plc_img003",
        name="My Temple",
        religion="hinduism",
        place_type="temple",
        lat=12.9,
        lng=77.5,
        address="",
    )
    alt = generate_image_alt_text(place, display_order=0)
    assert alt == "My Temple – Hindu Temple"


# ── 4. Religion category page ────────────────────────────────────────────────────


def test_share_religion_category_returns_html(client):
    """GET /share/religion/islam returns 200 HTML page."""
    _create_place(client, "plc_cat_islam")
    resp = client.get("/share/religion/islam")
    assert resp.status_code == 200
    assert "text/html" in resp.headers["content-type"]
    assert "Mosques" in resp.text
    assert "ItemList" in resp.text


def test_share_religion_category_via_keyword(client):
    """GET /share/religion/mosque resolves to islam category."""
    _create_place(client, "plc_cat_kw")
    resp = client.get("/share/religion/mosque")
    assert resp.status_code == 200
    assert "Mosques" in resp.text


def test_share_religion_category_404_for_unknown(client):
    """GET /share/religion/unknown returns 404."""
    resp = client.get("/share/religion/unknown_faith_xyz")
    assert resp.status_code == 404


# ── 5. Multi-language place page ─────────────────────────────────────────────────


def test_share_place_lang_en(client):
    """GET /share/en/places/{code} returns 200 HTML with lang=en."""
    _create_place(client, "plc_lang_en")
    resp = client.get("/share/en/places/plc_lang_en")
    assert resp.status_code == 200
    assert 'lang="en"' in resp.text


def test_share_place_lang_ar(client):
    """GET /share/ar/places/{code} returns 200 HTML with lang=ar and dir=rtl."""
    _create_place(client, "plc_lang_ar")
    resp = client.get("/share/ar/places/plc_lang_ar")
    assert resp.status_code == 200
    assert 'lang="ar"' in resp.text
    assert 'dir="rtl"' in resp.text


def test_share_place_lang_hi(client):
    """GET /share/hi/places/{code} returns 200 HTML with lang=hi."""
    _create_place(client, "plc_lang_hi")
    resp = client.get("/share/hi/places/plc_lang_hi")
    assert resp.status_code == 200
    assert 'lang="hi"' in resp.text


def test_share_place_lang_invalid(client):
    """GET /share/fr/places/{code} returns 404."""
    _create_place(client, "plc_lang_fr")
    resp = client.get("/share/fr/places/plc_lang_fr")
    assert resp.status_code == 404


# ── 6. Sitemap image entries ──────────────────────────────────────────────────────


def test_sitemap_image_namespace_present(client):
    """Sitemap includes Google image namespace declaration."""
    _create_place(client, "plc_sitemap_img")
    resp = client.get("/sitemap.xml")
    assert resp.status_code == 200
    assert "google.com/schemas/sitemap-image" in resp.text


def test_sitemap_language_hreflang_urls(client, db_session):
    """Sitemap hreflang alternates point to /share/{lang}/places/ URLs."""
    _create_place(client, "plc_sitemap_lang")
    headers = _admin_headers(client, db_session, email="admin@sitemaplang.test")
    _generate_seo(client, headers, "plc_sitemap_lang")

    resp = client.get("/sitemap.xml")
    assert resp.status_code == 200
    xml = resp.text
    assert "/share/en/places/" in xml
    assert "/share/ar/places/" in xml
    assert "/share/hi/places/" in xml


# ── 7. meta_tags hreflang URLs ───────────────────────────────────────────────────


def test_meta_tags_hreflang_language_specific_urls():
    """build_place_meta_tags() sets language-specific hreflang URLs."""
    from unittest.mock import MagicMock

    from app.services.meta_tags import build_place_meta_tags

    place = MagicMock()
    place.place_code = "plc_hreflang"
    place.name = "Test Place"
    place.description = ""
    place.religion = "islam"

    seo = MagicMock()
    seo.slug = "test-place"
    seo.seo_title = "Test Place SEO"
    seo.meta_description = "Test description"
    seo.og_image_url = None

    html = build_place_meta_tags(place=place, seo=seo, lang="en")
    assert "/share/en/places/plc_hreflang/test-place" in html
    assert "/share/ar/places/plc_hreflang/test-place" in html
    assert "/share/hi/places/plc_hreflang/test-place" in html


# ── 8. Social preview fallback OG image ─────────────────────────────────────────


def test_share_place_social_preview_uses_religion_fallback(client):
    """share_place() uses religion fallback OG image when no place image exists."""
    _create_place(client, "plc_og_fallback")
    resp = client.get(
        "/share/places/plc_og_fallback",
        headers={"User-Agent": "Googlebot/2.1"},
    )
    assert resp.status_code == 200
    # Should contain religion OG image reference in meta tags
    assert "religion-islam" in resp.text


# ── 9. Nearby / similar sections for crawlers ────────────────────────────────────


def test_share_place_crawler_has_related_sections(client):
    """Crawler view includes nearby-places and similar-places sections."""
    # Create two nearby places
    place1 = {**SAMPLE_PLACE, "place_code": "plc_nearby_a", "name": "Place A"}
    place2 = {
        **SAMPLE_PLACE,
        "place_code": "plc_nearby_b",
        "name": "Place B",
        "lat": 25.205,
        "lng": 55.271,
    }
    client.post("/api/v1/places", json=place1, headers=_API_KEY_HEADERS)
    client.post("/api/v1/places", json=place2, headers=_API_KEY_HEADERS)

    resp = client.get(
        "/share/places/plc_nearby_a",
        headers={"User-Agent": "Googlebot/2.1"},
    )
    assert resp.status_code == 200
    assert "nearby-places" in resp.text or "similar-places" in resp.text


def test_share_place_human_no_related_sections(client):
    """Human browser view does NOT include related sections (no HTML)."""
    _create_place(client, "plc_human_view")
    resp = client.get(
        "/share/places/plc_human_view",
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"},
    )
    assert resp.status_code == 200
    assert "nearby-places" not in resp.text
    assert "similar-places" not in resp.text
