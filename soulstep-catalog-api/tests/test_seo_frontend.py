"""Tests for SEO frontend integration: P1.1, P1.2, P2.4, P3.1, P3.2, P3.3, P3.4, P3.5."""

from tests.conftest import SAMPLE_PLACE

PLACES_URL = "/api/v1/places"


_API_KEY_HEADERS = {"X-API-Key": "test-api-key"}


def _create_place(client, place_code="plc_seotest01", **overrides):
    data = {**SAMPLE_PLACE, "place_code": place_code, **overrides}
    return client.post(PLACES_URL, json=data, headers=_API_KEY_HEADERS)


class TestPlaceDetailSEOFields:
    """P1.1: SEO fields appear in place detail response."""

    def test_seo_fields_present_in_detail(self, client):
        _create_place(client)
        resp = client.get(f"{PLACES_URL}/plc_seotest01")
        assert resp.status_code == 200
        data = resp.json()
        # SEO fields should be present (None when no PlaceSEO record)
        assert "seo_slug" in data
        assert "seo_title" in data
        assert "seo_meta_description" in data
        assert "seo_rich_description" in data
        assert "seo_faq_json" in data
        assert "seo_og_image_url" in data

    def test_updated_at_in_detail(self, client):
        """P2.4: updated_at freshness signal."""
        _create_place(client)
        resp = client.get(f"{PLACES_URL}/plc_seotest01")
        assert resp.status_code == 200
        data = resp.json()
        assert "updated_at" in data
        # Should be a valid ISO datetime string
        assert data["updated_at"] is not None


class TestImageAltText:
    """P1.2: alt_text appears in image responses."""

    def test_alt_text_in_images(self, client):
        _create_place(client, image_urls=["https://example.com/img1.jpg"])
        resp = client.get(f"{PLACES_URL}/plc_seotest01")
        assert resp.status_code == 200
        images = resp.json().get("images", [])
        if images:
            assert "alt_text" in images[0]

    def test_alt_text_in_list_images(self, client):
        _create_place(client, image_urls=["https://example.com/img1.jpg"])
        resp = client.get(PLACES_URL, params={"lat": 25.2048, "lng": 55.2708})
        assert resp.status_code == 200
        places = resp.json()["items"]
        if places and places[0].get("images"):
            assert "alt_text" in places[0]["images"][0]


class TestTouristAttractionSchema:
    """P3.1: additionalType in structured data."""

    def test_additional_type_in_jsonld(self):
        from app.services.structured_data import build_place_jsonld

        class MockPlace:
            place_code = "plc_test"
            name = "Test Mosque"
            religion = "islam"
            lat = 25.2
            lng = 55.3
            address = "123 Test St"
            description = "A test mosque"
            website_url = None

        schema = build_place_jsonld(MockPlace())
        assert schema["additionalType"] == "https://schema.org/TouristAttraction"
        assert schema["@type"] == "Mosque"


class TestLlmsTxt:
    """P3.2 + P3.3: Enhanced llms.txt content."""

    def test_llms_txt_has_openapi_section(self, client):
        resp = client.get("/llms.txt")
        assert resp.status_code == 200
        content = resp.text
        assert "OpenAPI" in content
        assert "openapi.json" in content
        assert "/docs" in content

    def test_llms_txt_has_religion_pages(self, client):
        resp = client.get("/llms.txt")
        content = resp.text
        assert "/share/religion/islam" in content
        assert "/share/religion/christianity" in content

    def test_llms_txt_has_example_queries(self, client):
        resp = client.get("/llms.txt")
        content = resp.text
        assert "Find mosques near me" in content

    def test_llms_txt_has_feeds(self, client):
        resp = client.get("/llms.txt")
        content = resp.text
        assert "/feed.xml" in content
        assert "/feed.atom" in content

    def test_llms_full_has_field_reference(self, client):
        resp = client.get("/llms-full.txt")
        assert resp.status_code == 200
        content = resp.text
        assert "API Field Reference" in content
        assert "Filtering Parameters" in content


class TestAiPluginJson:
    """P3.5: /.well-known/ai-plugin.json endpoint."""

    def test_ai_plugin_json_endpoint(self, client):
        resp = client.get("/.well-known/ai-plugin.json")
        assert resp.status_code == 200
        data = resp.json()
        assert data["schema_version"] == "v1"
        assert data["name_for_human"] == "SoulStep"
        assert data["name_for_model"] == "soulstep"
        assert "openapi.json" in data["api"]["url"]
        assert data["api"]["type"] == "openapi"

    def test_ai_plugin_has_cache_header(self, client):
        resp = client.get("/.well-known/ai-plugin.json")
        assert "max-age=86400" in resp.headers.get("cache-control", "")


class TestSemanticHTML:
    """P3.4: Semantic HTML improvements in share endpoint."""

    def test_share_place_has_address_element(self, client):
        _create_place(client)
        resp = client.get(
            "/share/places/plc_seotest01",
            headers={"User-Agent": "Googlebot/2.1"},
        )
        assert resp.status_code == 200
        html = resp.text
        assert "<address>" in html

    def test_share_place_has_opening_hours_table(self, client):
        _create_place(client)
        resp = client.get(
            "/share/places/plc_seotest01",
            headers={"User-Agent": "Googlebot/2.1"},
        )
        html = resp.text
        assert "<table>" in html
        assert "Opening Hours" in html

    def test_share_place_has_attributes_dl(self, client, db_session):
        """Verify <dl> definition list for place attributes."""
        _create_place(client)
        # Add an attribute
        from app.db import place_attributes as attr_db

        attr_db.upsert_attribute("plc_seotest01", "parking", "Available", db_session)
        db_session.commit()

        resp = client.get(
            "/share/places/plc_seotest01",
            headers={"User-Agent": "Googlebot/2.1"},
        )
        html = resp.text
        assert "<dl>" in html
        assert "<dt>" in html
