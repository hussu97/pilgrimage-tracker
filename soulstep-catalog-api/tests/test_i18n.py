"""Tests for /api/v1/languages and /api/v1/translations."""

LANG_URL = "/api/v1/languages"
TRANS_URL = "/api/v1/translations"


class TestLanguages:
    def test_returns_list(self, client):
        resp = client.get(LANG_URL)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_no_auth_required(self, client):
        resp = client.get(LANG_URL)
        assert resp.status_code == 200

    def test_includes_english(self, client):
        codes = [lang["code"] for lang in client.get(LANG_URL).json() if isinstance(lang, dict)]
        assert "en" in codes

    def test_includes_arabic_and_hindi(self, client):
        codes = [lang["code"] for lang in client.get(LANG_URL).json() if isinstance(lang, dict)]
        assert "ar" in codes
        assert "hi" in codes

    def test_includes_telugu(self, client):
        langs = client.get(LANG_URL).json()
        codes = [lang["code"] for lang in langs if isinstance(lang, dict)]
        names = [lang["name"] for lang in langs if isinstance(lang, dict)]
        assert "te" in codes
        assert "తెలుగు" in names


class TestTranslations:
    def test_returns_dict(self, client):
        resp = client.get(TRANS_URL, params={"lang": "en"})
        assert resp.status_code == 200
        assert isinstance(resp.json(), dict)

    def test_no_auth_required(self, client):
        resp = client.get(TRANS_URL)
        assert resp.status_code == 200

    def test_english_default(self, client):
        resp = client.get(TRANS_URL)
        assert resp.status_code == 200
        assert isinstance(resp.json(), dict)

    def test_arabic_translations(self, client):
        resp = client.get(TRANS_URL, params={"lang": "ar"})
        assert resp.status_code == 200
        assert isinstance(resp.json(), dict)

    def test_hindi_translations(self, client):
        resp = client.get(TRANS_URL, params={"lang": "hi"})
        assert resp.status_code == 200
        assert isinstance(resp.json(), dict)

    def test_telugu_translations(self, client):
        resp = client.get(TRANS_URL, params={"lang": "te"})
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, dict)
        assert data.get("nav.explore") is not None
        assert data.get("profile.language") == "భాష"

    def test_unknown_lang_falls_back_to_english(self, client):
        resp_unk = client.get(TRANS_URL, params={"lang": "xx"})
        resp_en = client.get(TRANS_URL, params={"lang": "en"})
        assert resp_unk.status_code == 200
        assert set(resp_unk.json().keys()) == set(resp_en.json().keys())

    def test_contains_place_keys(self, client):
        keys = client.get(TRANS_URL, params={"lang": "en"}).json().keys()
        assert any("places" in k for k in keys)

    def test_search_placeholder_key_present_in_english(self, client):
        data = client.get(TRANS_URL, params={"lang": "en"}).json()
        assert "search.placeholder" in data
        assert data["search.placeholder"] == "Search sacred sites..."

    def test_dashboard_total_places_key_present_in_english(self, client):
        data = client.get(TRANS_URL, params={"lang": "en"}).json()
        assert "dashboard.totalPlaces" in data
        assert data["dashboard.totalPlaces"] == "Sacred sites to explore"

    def test_new_keys_present_in_arabic(self, client):
        data = client.get(TRANS_URL, params={"lang": "ar"}).json()
        assert "search.placeholder" in data
        assert "dashboard.totalPlaces" in data

    def test_new_keys_present_in_hindi(self, client):
        data = client.get(TRANS_URL, params={"lang": "hi"}).json()
        assert "search.placeholder" in data
        assert "dashboard.totalPlaces" in data

    def test_new_keys_present_in_telugu(self, client):
        data = client.get(TRANS_URL, params={"lang": "te"}).json()
        assert "search.placeholder" in data
        assert "dashboard.totalPlaces" in data

    def test_new_keys_present_in_malayalam(self, client):
        data = client.get(TRANS_URL, params={"lang": "ml"}).json()
        assert "search.placeholder" in data
        assert "dashboard.totalPlaces" in data

    def test_groups_title_is_journeys_in_english(self, client):
        """groups.title value should now be 'Journeys'."""
        data = client.get(TRANS_URL, params={"lang": "en"}).json()
        assert data.get("groups.title") == "Journeys"
