"""Tests for /api/v1/search endpoints (Google Places proxy)."""

from unittest.mock import MagicMock, patch


class TestAutocomplete:
    def test_short_query_rejected(self, client):
        """q must be at least 2 chars."""
        resp = client.get("/api/v1/search/autocomplete", params={"q": "a"})
        assert resp.status_code == 422

    def test_no_api_key_returns_empty(self, client):
        """When GOOGLE_MAPS_API_KEY is empty, return empty suggestions."""
        with patch("app.api.v1.search.config.GOOGLE_MAPS_API_KEY", ""):
            resp = client.get("/api/v1/search/autocomplete", params={"q": "Mecca"})
        assert resp.status_code == 200
        assert resp.json() == {"suggestions": []}

    def test_valid_query_returns_suggestions(self, client):
        """Happy path: Google returns suggestions, we map them correctly."""
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "suggestions": [
                {
                    "placePrediction": {
                        "placeId": "ChIJ_test_1",
                        "structuredFormat": {
                            "mainText": {"text": "Mecca"},
                            "secondaryText": {"text": "Saudi Arabia"},
                        },
                    }
                }
            ]
        }
        mock_response.raise_for_status = MagicMock()

        with (
            patch("app.api.v1.search.config.GOOGLE_MAPS_API_KEY", "fake-key"),
            patch("app.api.v1.search.requests.post", return_value=mock_response),
        ):
            resp = client.get("/api/v1/search/autocomplete", params={"q": "Mecca"})

        assert resp.status_code == 200
        data = resp.json()
        assert len(data["suggestions"]) == 1
        assert data["suggestions"][0]["place_id"] == "ChIJ_test_1"
        assert data["suggestions"][0]["main_text"] == "Mecca"
        assert data["suggestions"][0]["secondary_text"] == "Saudi Arabia"

    def test_with_lat_lng_bias(self, client):
        """Lat/lng bias params are accepted and forwarded."""
        mock_response = MagicMock()
        mock_response.json.return_value = {"suggestions": []}
        mock_response.raise_for_status = MagicMock()

        with (
            patch("app.api.v1.search.config.GOOGLE_MAPS_API_KEY", "fake-key"),
            patch("app.api.v1.search.requests.post", return_value=mock_response) as mock_post,
        ):
            resp = client.get(
                "/api/v1/search/autocomplete",
                params={"q": "Medina", "lat": 24.5247, "lng": 39.5692},
            )

        assert resp.status_code == 200
        call_kwargs = mock_post.call_args
        payload = call_kwargs[1]["json"]
        assert "locationBias" in payload

    def test_google_api_error_returns_empty(self, client):
        """When Google API throws, return empty suggestions gracefully."""
        with (
            patch("app.api.v1.search.config.GOOGLE_MAPS_API_KEY", "fake-key"),
            patch("app.api.v1.search.requests.post", side_effect=Exception("network error")),
        ):
            resp = client.get("/api/v1/search/autocomplete", params={"q": "Mecca"})

        assert resp.status_code == 200
        assert resp.json() == {"suggestions": []}

    def test_no_results(self, client):
        """Google returns empty suggestions list."""
        mock_response = MagicMock()
        mock_response.json.return_value = {"suggestions": []}
        mock_response.raise_for_status = MagicMock()

        with (
            patch("app.api.v1.search.config.GOOGLE_MAPS_API_KEY", "fake-key"),
            patch("app.api.v1.search.requests.post", return_value=mock_response),
        ):
            resp = client.get("/api/v1/search/autocomplete", params={"q": "xyzzy"})

        assert resp.status_code == 200
        assert resp.json()["suggestions"] == []


class TestPlaceDetails:
    def test_no_api_key_returns_error_payload(self, client):
        """When GOOGLE_MAPS_API_KEY is empty, return error payload."""
        with patch("app.api.v1.search.config.GOOGLE_MAPS_API_KEY", ""):
            resp = client.get("/api/v1/search/place-details", params={"place_id": "abc123"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["place_id"] == "abc123"
        assert "error" in data

    def test_valid_place_id(self, client):
        """Happy path: returns lat/lng and place info."""
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "id": "ChIJ_test_2",
            "displayName": {"text": "Grand Mosque"},
            "formattedAddress": "Mecca, Saudi Arabia",
            "location": {"latitude": 21.4225, "longitude": 39.8262},
        }
        mock_response.raise_for_status = MagicMock()

        with (
            patch("app.api.v1.search.config.GOOGLE_MAPS_API_KEY", "fake-key"),
            patch("app.api.v1.search.requests.get", return_value=mock_response),
        ):
            resp = client.get("/api/v1/search/place-details", params={"place_id": "ChIJ_test_2"})

        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "Grand Mosque"
        assert data["address"] == "Mecca, Saudi Arabia"
        assert abs(data["lat"] - 21.4225) < 0.001
        assert abs(data["lng"] - 39.8262) < 0.001

    def test_google_api_error_returns_error_payload(self, client):
        """When Google API throws, return error payload."""
        with (
            patch("app.api.v1.search.config.GOOGLE_MAPS_API_KEY", "fake-key"),
            patch("app.api.v1.search.requests.get", side_effect=Exception("timeout")),
        ):
            resp = client.get("/api/v1/search/place-details", params={"place_id": "bad_id"})

        assert resp.status_code == 200
        data = resp.json()
        assert "error" in data
        assert data["place_id"] == "bad_id"
