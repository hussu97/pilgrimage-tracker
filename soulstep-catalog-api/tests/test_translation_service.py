"""
Unit tests for app/services/translation_service.py (Google Cloud Translation API v3).

All HTTP calls are mocked — no network access.
"""

from unittest.mock import MagicMock, patch

from app.services.translation_service import translate_batch, translate_text

# ── helpers ────────────────────────────────────────────────────────────────────


def _mock_response(json_data: dict, status_code: int = 200) -> MagicMock:
    mock = MagicMock()
    mock.ok = status_code < 400
    mock.status_code = status_code
    mock.json.return_value = json_data
    mock.text = str(json_data)
    return mock


def _v3_response(*translated_texts: str) -> dict:
    """Build a v3 translateText response dict."""
    return {"translations": [{"translatedText": t} for t in translated_texts]}


# ── translate_text ─────────────────────────────────────────────────────────────


class TestTranslateText:
    def test_returns_translated_string(self, monkeypatch):
        monkeypatch.setenv("GOOGLE_TRANSLATE_API_KEY", "test-key")
        monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "test-project")
        with patch("app.services.translation_service.requests.post") as mock_post:
            mock_post.return_value = _mock_response(_v3_response("مرحبا"))
            result = translate_text("Hello", target_lang="ar")
        assert result == "مرحبا"

    def test_missing_api_key_returns_none(self, monkeypatch):
        monkeypatch.delenv("GOOGLE_TRANSLATE_API_KEY", raising=False)
        monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "test-project")
        result = translate_text("Hello", target_lang="ar")
        assert result is None

    def test_missing_project_returns_none(self, monkeypatch):
        monkeypatch.setenv("GOOGLE_TRANSLATE_API_KEY", "test-key")
        monkeypatch.delenv("GOOGLE_CLOUD_PROJECT", raising=False)
        result = translate_text("Hello", target_lang="ar")
        assert result is None

    def test_empty_text_returns_none(self, monkeypatch):
        monkeypatch.setenv("GOOGLE_TRANSLATE_API_KEY", "test-key")
        monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "test-project")
        result = translate_text("   ", target_lang="ar")
        assert result is None

    def test_http_error_returns_none(self, monkeypatch):
        monkeypatch.setenv("GOOGLE_TRANSLATE_API_KEY", "test-key")
        monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "test-project")
        with patch("app.services.translation_service.requests.post") as mock_post:
            mock_post.return_value = _mock_response({}, status_code=403)
            result = translate_text("Hello", target_lang="ar")
        assert result is None

    def test_uses_v3_endpoint_with_project_id(self, monkeypatch):
        monkeypatch.setenv("GOOGLE_TRANSLATE_API_KEY", "test-key")
        monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "my-project")
        with patch("app.services.translation_service.requests.post") as mock_post:
            mock_post.return_value = _mock_response(_v3_response("Bonjour"))
            translate_text("Hello", target_lang="fr")
        url_called = mock_post.call_args[0][0]
        assert "v3/projects/my-project" in url_called
        assert "locations/global:translateText" in url_called

    def test_request_body_uses_v3_fields(self, monkeypatch):
        monkeypatch.setenv("GOOGLE_TRANSLATE_API_KEY", "test-key")
        monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "test-project")
        with patch("app.services.translation_service.requests.post") as mock_post:
            mock_post.return_value = _mock_response(_v3_response("مرحبا"))
            translate_text("Hello", target_lang="ar", source_lang="en")
        body = mock_post.call_args[1]["json"]
        assert "contents" in body
        assert "sourceLanguageCode" in body
        assert "targetLanguageCode" in body
        assert "q" not in body  # v2 field must not appear


# ── translate_batch ────────────────────────────────────────────────────────────


class TestTranslateBatch:
    def test_returns_translated_list(self, monkeypatch):
        monkeypatch.setenv("GOOGLE_TRANSLATE_API_KEY", "test-key")
        monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "test-project")
        with patch("app.services.translation_service.requests.post") as mock_post:
            mock_post.return_value = _mock_response(_v3_response("مرحبا", "شكرا"))
            results = translate_batch(["Hello", "Thank you"], target_lang="ar")
        assert results == ["مرحبا", "شكرا"]

    def test_empty_list_returns_empty(self, monkeypatch):
        monkeypatch.setenv("GOOGLE_TRANSLATE_API_KEY", "test-key")
        monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "test-project")
        results = translate_batch([], target_lang="ar")
        assert results == []

    def test_missing_credentials_returns_nones(self, monkeypatch):
        monkeypatch.delenv("GOOGLE_TRANSLATE_API_KEY", raising=False)
        monkeypatch.delenv("GOOGLE_CLOUD_PROJECT", raising=False)
        results = translate_batch(["Hello", "World"], target_lang="ar")
        assert results == [None, None]

    def test_preserves_positions_with_empty_inputs(self, monkeypatch):
        """Empty strings at index 0 and 2 should be None; index 1 translated."""
        monkeypatch.setenv("GOOGLE_TRANSLATE_API_KEY", "test-key")
        monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "test-project")
        with patch("app.services.translation_service.requests.post") as mock_post:
            mock_post.return_value = _mock_response(_v3_response("Gracias"))
            results = translate_batch(["", "Thank you", ""], target_lang="es")
        assert results[0] is None
        assert results[1] == "Gracias"
        assert results[2] is None

    def test_http_error_returns_nones(self, monkeypatch):
        monkeypatch.setenv("GOOGLE_TRANSLATE_API_KEY", "test-key")
        monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "test-project")
        with patch("app.services.translation_service.requests.post") as mock_post:
            mock_post.return_value = _mock_response({}, status_code=500)
            results = translate_batch(["Hello"], target_lang="ar")
        assert results == [None]

    def test_v3_response_format_parsed_correctly(self, monkeypatch):
        """Response must not have a 'data' wrapper (v2 format)."""
        monkeypatch.setenv("GOOGLE_TRANSLATE_API_KEY", "test-key")
        monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "test-project")
        with patch("app.services.translation_service.requests.post") as mock_post:
            # v3 response: {"translations": [...]} — no "data" wrapper
            mock_post.return_value = _mock_response({"translations": [{"translatedText": "Hola"}]})
            results = translate_batch(["Hello"], target_lang="es")
        assert results == ["Hola"]
