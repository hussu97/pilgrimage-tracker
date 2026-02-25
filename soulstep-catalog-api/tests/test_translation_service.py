"""
Unit tests for app/services/translation_service.py (Google Cloud Translation API v3 SDK).

The service uses google.cloud.translate_v3.TranslationServiceClient (not raw HTTP).
We mock _make_client() to avoid requiring real GCP credentials in CI.
"""

from unittest.mock import MagicMock, patch

from app.services.translation_service import translate_batch, translate_text

# ── helpers ────────────────────────────────────────────────────────────────────


def _mock_sdk_response(*translated_texts: str) -> MagicMock:
    """Return a mock SDK translate_text response with the given translations."""
    mock_resp = MagicMock()
    mock_resp.translations = [MagicMock(translated_text=t) for t in translated_texts]
    return mock_resp


# ── translate_text ─────────────────────────────────────────────────────────────


class TestTranslateText:
    def test_returns_translated_string(self, monkeypatch):
        monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "test-project")
        mock_client = MagicMock()
        mock_client.translate_text.return_value = _mock_sdk_response("مرحبا")
        with patch("app.services.translation_service._make_client", return_value=mock_client):
            result = translate_text("Hello", target_lang="ar")
        assert result == "مرحبا"

    def test_missing_api_key_returns_none(self, monkeypatch):
        monkeypatch.delenv("GOOGLE_CLOUD_PROJECT", raising=False)
        result = translate_text("Hello", target_lang="ar")
        assert result is None

    def test_missing_project_returns_none(self, monkeypatch):
        monkeypatch.delenv("GOOGLE_CLOUD_PROJECT", raising=False)
        result = translate_text("Hello", target_lang="ar")
        assert result is None

    def test_empty_text_returns_none(self, monkeypatch):
        monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "test-project")
        result = translate_text("   ", target_lang="ar")
        assert result is None

    def test_http_error_returns_none(self, monkeypatch):
        monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "test-project")
        mock_client = MagicMock()
        mock_client.translate_text.side_effect = Exception("API error 403")
        with patch("app.services.translation_service._make_client", return_value=mock_client):
            result = translate_text("Hello", target_lang="ar")
        assert result is None

    def test_uses_v3_endpoint_with_project_id(self, monkeypatch):
        monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "my-project")
        mock_client = MagicMock()
        mock_client.translate_text.return_value = _mock_sdk_response("Bonjour")
        with patch("app.services.translation_service._make_client", return_value=mock_client):
            translate_text("Hello", target_lang="fr")
        request_called = mock_client.translate_text.call_args[1]["request"]
        assert "projects/my-project" in request_called["parent"]
        assert "global" in request_called["parent"]

    def test_request_body_uses_v3_fields(self, monkeypatch):
        monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "test-project")
        mock_client = MagicMock()
        mock_client.translate_text.return_value = _mock_sdk_response("مرحبا")
        with patch("app.services.translation_service._make_client", return_value=mock_client):
            translate_text("Hello", target_lang="ar", source_lang="en")
        request_called = mock_client.translate_text.call_args[1]["request"]
        assert "contents" in request_called
        assert "source_language_code" in request_called
        assert "target_language_code" in request_called
        assert "q" not in request_called  # v2 field must not appear


# ── translate_batch ────────────────────────────────────────────────────────────


class TestTranslateBatch:
    def test_returns_translated_list(self, monkeypatch):
        monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "test-project")
        mock_client = MagicMock()
        mock_client.translate_text.return_value = _mock_sdk_response("مرحبا", "شكرا")
        with patch("app.services.translation_service._make_client", return_value=mock_client):
            results = translate_batch(["Hello", "Thank you"], target_lang="ar")
        assert results == ["مرحبا", "شكرا"]

    def test_empty_list_returns_empty(self, monkeypatch):
        monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "test-project")
        results = translate_batch([], target_lang="ar")
        assert results == []

    def test_missing_credentials_returns_nones(self, monkeypatch):
        monkeypatch.delenv("GOOGLE_CLOUD_PROJECT", raising=False)
        results = translate_batch(["Hello", "World"], target_lang="ar")
        assert results == [None, None]

    def test_preserves_positions_with_empty_inputs(self, monkeypatch):
        """Empty strings at index 0 and 2 should be None; index 1 translated."""
        monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "test-project")
        mock_client = MagicMock()
        mock_client.translate_text.return_value = _mock_sdk_response("Gracias")
        with patch("app.services.translation_service._make_client", return_value=mock_client):
            results = translate_batch(["", "Thank you", ""], target_lang="es")
        assert results[0] is None
        assert results[1] == "Gracias"
        assert results[2] is None

    def test_http_error_returns_nones(self, monkeypatch):
        monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "test-project")
        mock_client = MagicMock()
        mock_client.translate_text.side_effect = Exception("API error 500")
        with patch("app.services.translation_service._make_client", return_value=mock_client):
            results = translate_batch(["Hello"], target_lang="ar")
        assert results == [None]

    def test_v3_response_format_parsed_correctly(self, monkeypatch):
        """Response translations must have translated_text attributes (v3 SDK format)."""
        monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "test-project")
        mock_client = MagicMock()
        mock_client.translate_text.return_value = _mock_sdk_response("Hola")
        with patch("app.services.translation_service._make_client", return_value=mock_client):
            results = translate_batch(["Hello"], target_lang="es")
        assert results == ["Hola"]
