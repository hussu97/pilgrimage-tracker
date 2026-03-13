"""
Extended unit tests for all collectors — covers branches missed by test_collectors.py.

Focuses on: GmapsCollector, BestTimeCollector, FoursquareCollector,
OutscraperCollector, WikipediaCollector, WikidataCollector,
KnowledgeGraphCollector, OsmCollector.
"""

import os
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


# ── GmapsCollector ────────────────────────────────────────────────────────────


class TestGmapsCollectorExtract:
    def _full_response(self):
        return {
            "editorialSummary": {"text": "A historic mosque in Jerusalem."},
            "nationalPhoneNumber": "+972-2-1234",
            "internationalPhoneNumber": "+972221234",
            "googleMapsUri": "https://maps.google.com/?cid=123",
            "websiteUri": "https://alaqsa.org",
            "accessibilityOptions": {
                "wheelchairAccessibleEntrance": True,
                "wheelchairAccessibleParking": False,
                "wheelchairAccessibleRestroom": True,
                "wheelchairAccessibleSeating": False,
            },
            "rating": 4.8,
            "userRatingCount": 12345,
            "allowsDogs": False,
            "goodForChildren": True,
            "goodForGroups": True,
            "restroom": True,
            "outdoorSeating": False,
            "parkingOptions": {"freeParking": True},
            "paymentOptions": {"acceptsCreditCards": True},
            "photos": [
                {"name": "places/ChIJ/photos/photo1"},
                {"name": "places/ChIJ/photos/photo2"},
                {"name": "places/ChIJ/photos/photo3"},
                {"name": "places/ChIJ/photos/photo4"},
            ],
            "reviews": [
                {
                    "text": {"text": "Amazing place!"},
                    "authorAttribution": {"displayName": "John Doe"},
                    "publishTime": "2024-01-15T10:00:00Z",
                    "rating": 5,
                    "relativePublishTimeDescription": "a month ago",
                },
                {
                    "text": "Beautiful architecture.",
                    "authorAttribution": {"displayName": "Jane"},
                    "publishTime": "bad-date",
                    "rating": 4,
                    "relativePublishTimeDescription": "2 months ago",
                },
            ],
        }

    def test_extract_full_response(self):
        from app.collectors.gmaps import GmapsCollector

        collector = GmapsCollector()
        result = collector._extract(self._full_response(), "gplc_ChIJ123", "fake_api_key")

        assert result.status == "success"
        sources = {d["source"] for d in result.descriptions}
        assert "gmaps_editorial" in sources
        assert "gmaps_generative" not in sources
        assert result.contact["phone_national"] == "+972-2-1234"
        assert result.contact["google_maps_url"] == "https://maps.google.com/?cid=123"
        assert result.contact["website"] == "https://alaqsa.org"

        attr_codes = {a["attribute_code"] for a in result.attributes}
        assert "rating" in attr_codes
        assert "reviews_count" in attr_codes
        assert "wheelchair_accessible" in attr_codes
        assert "wheelchair_accessible_parking" in attr_codes
        assert "has_restroom" in attr_codes
        assert "parking_details" in attr_codes
        assert "payment_options" in attr_codes
        assert "accessibility_details" in attr_codes

        # Photos capped by SCRAPER_MAX_PHOTOS (default 3); fixture has 4 but only 3 stored
        from app.config import settings as _s

        assert len(result.images) == min(4, _s.max_photos)
        assert all(img["source"] == "gmaps" for img in result.images)

        # Reviews
        assert len(result.reviews) == 2
        assert result.reviews[0]["author_name"] == "John Doe"
        assert result.reviews[0]["text"] == "Amazing place!"
        assert result.reviews[0]["time"] > 0
        assert result.reviews[1]["time"] == 0  # invalid date → 0

    def test_extract_empty_response(self):
        from app.collectors.gmaps import GmapsCollector

        collector = GmapsCollector()
        result = collector._extract({}, "gplc_test", "key")

        assert result.status == "success"
        assert result.descriptions == []
        assert result.contact == {}
        assert result.images == []
        assert result.reviews == []

    def test_extract_photo_without_name_skipped(self):
        """Photos without a 'name' field should be skipped."""
        from app.collectors.gmaps import GmapsCollector

        collector = GmapsCollector()
        result = collector._extract(
            {"photos": [{"description": "no name here"}]},
            "gplc_test",
            "key",
        )
        assert result.images == []


class TestGmapsCollectorCollect:
    async def test_collect_no_api_key(self):
        from app.collectors.gmaps import GmapsCollector

        collector = GmapsCollector()
        with patch.dict(os.environ, {"GOOGLE_MAPS_API_KEY": ""}, clear=False):
            result = await collector.collect("gplc_ChIJ123", 25.0, 55.0, "Test")
        assert result.status == "not_configured"

    async def test_collect_invalid_place_code(self):
        from app.collectors.gmaps import GmapsCollector

        collector = GmapsCollector()
        with patch.dict(os.environ, {"GOOGLE_MAPS_API_KEY": "fake_key"}, clear=False):
            result = await collector.collect("invalid_code", 25.0, 55.0, "Test")
        assert result.status == "skipped"

    async def test_collect_success(self):
        from app.collectors.gmaps import GmapsCollector

        collector = GmapsCollector()
        mock_response = {"editorialSummary": {"text": "A fine mosque."}}
        with patch.dict(os.environ, {"GOOGLE_MAPS_API_KEY": "fake_key"}, clear=False):
            with patch.object(
                collector, "_fetch_details", new=AsyncMock(return_value=mock_response)
            ):
                result = await collector.collect("gplc_ChIJ123", 25.0, 55.0, "Test Place")

        assert result.status == "success"
        assert result.raw_response == mock_response

    async def test_collect_exception(self):
        from app.collectors.gmaps import GmapsCollector

        collector = GmapsCollector()
        with patch.dict(os.environ, {"GOOGLE_MAPS_API_KEY": "fake_key"}, clear=False):
            with patch.object(
                collector, "_fetch_details", new=AsyncMock(side_effect=Exception("API error"))
            ):
                result = await collector.collect("gplc_ChIJ123", 25.0, 55.0, "Test")
        assert result.status == "failed"
        assert "API error" in result.error_message


class TestGmapsCollectorFetchDetails:
    async def test_fetch_details_success(self):
        from app.collectors.gmaps import GmapsCollector

        collector = GmapsCollector()
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"displayName": {"text": "Test"}}

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.collectors.gmaps.httpx.AsyncClient", return_value=mock_client):
            data = await collector._fetch_details("places/ChIJ123", "key")
        assert data == {"displayName": {"text": "Test"}}

    async def test_fetch_details_http_error(self):
        from app.collectors.gmaps import GmapsCollector

        collector = GmapsCollector()
        mock_resp = MagicMock()
        mock_resp.status_code = 403
        mock_resp.content = b'{"error": {"message": "API key invalid"}}'
        mock_resp.json.return_value = {"error": {"message": "API key invalid"}}

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.collectors.gmaps.httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(Exception, match="Places API get place details failed"):
                await collector._fetch_details("places/ChIJ123", "bad_key")

    async def test_fetch_details_http_error_empty_body(self):
        from app.collectors.gmaps import GmapsCollector

        collector = GmapsCollector()
        mock_resp = MagicMock()
        mock_resp.status_code = 500
        mock_resp.content = b""
        mock_resp.json.side_effect = Exception("No content")

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.collectors.gmaps.httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(Exception, match="Places API"):
                await collector._fetch_details("places/ChIJ123", "key")


class TestGmapsCollectorBuildPlaceData:
    def _response(self, **overrides):
        base = {
            "displayName": {"text": "Al-Aqsa Mosque"},
            "formattedAddress": "Temple Mount, Jerusalem",
            "location": {"latitude": 31.7, "longitude": 35.2},
            "types": ["mosque", "place_of_worship"],
            "businessStatus": "OPERATIONAL",
            "utcOffsetMinutes": 180,
            "regularOpeningHours": {"weekdayDescriptions": ["Monday: 7:00 AM – 10:00 PM"]},
            "rating": 4.8,
            "userRatingCount": 12345,
            "editorialSummary": {"text": "A historic mosque."},
            "websiteUri": "https://alaqsa.org",
            "nationalPhoneNumber": "+972-2-1234",
            "internationalPhoneNumber": "+972221234",
            "googleMapsUri": "https://maps.google.com/",
            "photos": [{"name": "places/ChIJ/photos/photo1"}],
            "reviews": [
                {
                    "text": {"text": "Amazing!"},
                    "authorAttribution": {"displayName": "Alice"},
                    "publishTime": "2024-01-15T10:00:00Z",
                    "rating": 5,
                    "relativePublishTimeDescription": "a month ago",
                }
            ],
            "accessibilityOptions": {"wheelchairAccessibleEntrance": True},
            "parkingOptions": {"freeParking": True},
            "paymentOptions": {"acceptsCreditCards": True},
            "allowsDogs": False,
            "goodForChildren": True,
            "restroom": True,
        }
        base.update(overrides)
        return base

    def _common_patches(self):
        return [
            patch("app.collectors.gmaps.detect_religion_from_types", return_value="islam"),
            patch(
                "app.collectors.gmaps.get_gmaps_type_to_our_type",
                return_value={"mosque": "mosque"},
            ),
            patch(
                "app.collectors.gmaps.process_weekly_hours",
                return_value={"Monday": "7:00 AM – 10:00 PM"},
            ),
            patch("app.collectors.gmaps.clean_address", return_value="Temple Mount, Jerusalem"),
        ]

    def test_build_place_data_success_with_image_download(self):
        from app.collectors.gmaps import GmapsCollector

        collector = GmapsCollector()
        mock_session = MagicMock()
        response = self._response()

        mock_img_resp = MagicMock()
        mock_img_resp.status_code = 200
        mock_img_resp.headers = {"Content-Type": "image/jpeg"}
        mock_img_resp.content = b"fake_image_data"

        patches = self._common_patches()
        with patches[0], patches[1], patches[2], patches[3]:
            with patch("requests.get", return_value=mock_img_resp):
                place_data = collector.build_place_data(
                    response, "gplc_ChIJ123", "fake_key", mock_session
                )

        assert place_data["name"] == "Al-Aqsa Mosque"
        assert place_data["religion"] == "islam"
        assert place_data["place_type"] == "mosque"
        assert place_data["lat"] == 31.7
        assert place_data["lng"] == 35.2
        assert place_data["google_place_id"] == "ChIJ123"
        assert place_data["business_status"] == "OPERATIONAL"
        assert place_data["description"] == "A historic mosque."
        assert place_data["website_url"] == "https://alaqsa.org"
        assert place_data["utc_offset_minutes"] == 180
        # Images are stored as URLs only during detail fetch — blobs downloaded later
        assert place_data["image_blobs"] == []
        assert len(place_data["image_urls"]) == 1
        assert len(place_data["external_reviews"]) == 1
        assert place_data["external_reviews"][0]["author_name"] == "Alice"

    def test_build_place_data_image_download_failure(self):
        """build_place_data no longer downloads images — URLs always stored as-is."""
        from app.collectors.gmaps import GmapsCollector

        collector = GmapsCollector()
        mock_session = MagicMock()
        response = self._response()

        patches = self._common_patches()
        with patches[0], patches[1], patches[2], patches[3]:
            place_data = collector.build_place_data(
                response, "gplc_ChIJ123", "fake_key", mock_session
            )

        assert place_data["image_blobs"] == []
        assert len(place_data["image_urls"]) == 1  # URL always stored

    def test_build_place_data_image_exception(self):
        """build_place_data no longer downloads images — no exception path to test."""
        from app.collectors.gmaps import GmapsCollector

        collector = GmapsCollector()
        mock_session = MagicMock()
        response = self._response()

        patches = self._common_patches()
        with patches[0], patches[1], patches[2], patches[3]:
            place_data = collector.build_place_data(
                response, "gplc_ChIJ123", "fake_key", mock_session
            )

        assert place_data["image_blobs"] == []
        assert len(place_data["image_urls"]) == 1

    def test_build_place_data_unknown_religion_fallback(self):
        """When detect_religion_from_types returns empty, falls back to 'unknown'."""
        from app.collectors.gmaps import GmapsCollector

        collector = GmapsCollector()
        mock_session = MagicMock()
        response = self._response(editorialSummary={})  # No editorial text

        patches = [
            patch("app.collectors.gmaps.detect_religion_from_types", return_value=""),
            patch("app.collectors.gmaps.get_gmaps_type_to_our_type", return_value={}),
            patch("app.collectors.gmaps.clean_address", return_value="Jerusalem"),
        ]
        with patches[0], patches[1], patches[2]:
            with patch("requests.get", return_value=MagicMock(status_code=404)):
                place_data = collector.build_place_data(response, "gplc_XYZ", "key", mock_session)

        assert place_data["religion"] == "unknown"
        # Fallback description (no editorial)
        assert "place of worship" in place_data["description"]

    def test_build_place_data_no_opening_hours(self):
        """When no weekdayDescriptions, opening hours default to 'Hours not available'."""
        from app.collectors.gmaps import GmapsCollector

        collector = GmapsCollector()
        mock_session = MagicMock()
        response = self._response()
        del response["regularOpeningHours"]  # No opening hours

        patches = self._common_patches()
        with patches[0], patches[1], patches[2], patches[3]:
            with patch("requests.get", return_value=MagicMock(status_code=404)):
                place_data = collector.build_place_data(
                    response, "gplc_ChIJ123", "key", mock_session
                )

        assert place_data["opening_hours"]["Monday"] == "Hours not available"

    def test_build_place_data_utc_fallback_from_env(self):
        """When utcOffsetMinutes is None, falls back to SCRAPER_TIMEZONE."""
        from app.collectors.gmaps import GmapsCollector

        collector = GmapsCollector()
        mock_session = MagicMock()
        response = self._response()
        del response["utcOffsetMinutes"]

        patches = self._common_patches()
        with patches[0], patches[1], patches[2], patches[3]:
            with patch.dict(os.environ, {"SCRAPER_TIMEZONE": "UTC"}, clear=False):
                with patch("requests.get", return_value=MagicMock(status_code=404)):
                    place_data = collector.build_place_data(
                        response, "gplc_ChIJ123", "key", mock_session
                    )

        assert place_data["utc_offset_minutes"] == 0  # UTC offset is 0 minutes

    def test_build_place_data_utc_invalid_timezone(self):
        """Invalid SCRAPER_TIMEZONE should leave utc_offset_minutes as None."""
        from app.collectors.gmaps import GmapsCollector

        collector = GmapsCollector()
        mock_session = MagicMock()
        response = self._response()
        del response["utcOffsetMinutes"]

        patches = self._common_patches()
        with patches[0], patches[1], patches[2], patches[3]:
            with patch.dict(os.environ, {"SCRAPER_TIMEZONE": "Not/AZone"}, clear=False):
                with patch("requests.get", return_value=MagicMock(status_code=404)):
                    place_data = collector.build_place_data(
                        response, "gplc_ChIJ123", "key", mock_session
                    )

        assert place_data["utc_offset_minutes"] is None

    def test_build_place_data_review_invalid_date(self):
        """Reviews with unparsable publishTime should have time=0."""
        from app.collectors.gmaps import GmapsCollector

        collector = GmapsCollector()
        mock_session = MagicMock()
        response = self._response()
        response["reviews"] = [
            {
                "text": "Good place",
                "authorAttribution": {"displayName": "Bob"},
                "publishTime": "not-a-date",
                "rating": 3,
                "relativePublishTimeDescription": "a year ago",
            }
        ]

        patches = self._common_patches()
        with patches[0], patches[1], patches[2], patches[3]:
            with patch("requests.get", return_value=MagicMock(status_code=404)):
                place_data = collector.build_place_data(
                    response, "gplc_ChIJ123", "key", mock_session
                )

        assert place_data["external_reviews"][0]["time"] == 0

    def test_build_place_data_displayname_not_dict(self):
        """When displayName is not a dict, name should be 'N/A'."""
        from app.collectors.gmaps import GmapsCollector

        collector = GmapsCollector()
        mock_session = MagicMock()
        response = self._response(displayName="plain string")

        patches = self._common_patches()
        with patches[0], patches[1], patches[2], patches[3]:
            with patch("requests.get", return_value=MagicMock(status_code=404)):
                place_data = collector.build_place_data(
                    response, "gplc_ChIJ123", "key", mock_session
                )

        assert place_data["name"] == "N/A"

    def test_build_place_data_with_preloaded_maps(self):
        """When type_map and religion_type_map are supplied, no session DB calls are made."""
        from app.collectors.gmaps import GmapsCollector

        collector = GmapsCollector()
        response = self._response()

        type_map = {"mosque": "mosque", "place_of_worship": "place of worship"}
        religion_type_map = {"mosque": "islam", "place_of_worship": "islam"}

        mock_img_resp = MagicMock()
        mock_img_resp.status_code = 200
        mock_img_resp.headers = {"Content-Type": "image/jpeg"}
        mock_img_resp.content = b"img"

        with patch(
            "app.collectors.gmaps.process_weekly_hours",
            return_value={"Monday": "7:00 AM – 10:00 PM"},
        ):
            with patch("app.collectors.gmaps.clean_address", return_value="Jerusalem"):
                with patch("requests.get", return_value=mock_img_resp):
                    place_data = collector.build_place_data(
                        response,
                        "gplc_ChIJ123",
                        "fake_key",
                        None,  # no session
                        type_map=type_map,
                        religion_type_map=religion_type_map,
                    )

        assert place_data["religion"] == "islam"
        assert place_data["place_type"] == "mosque"
        assert place_data["name"] == "Al-Aqsa Mosque"

    def test_build_place_data_preloaded_maps_unknown_type(self):
        """When types don't match the preloaded map, religion defaults to 'unknown'."""
        from app.collectors.gmaps import GmapsCollector

        collector = GmapsCollector()
        response = self._response(types=["unknown_type"])

        type_map: dict = {}
        religion_type_map: dict = {}

        with patch("app.collectors.gmaps.clean_address", return_value="Jerusalem"):
            with patch("requests.get", return_value=MagicMock(status_code=404)):
                place_data = collector.build_place_data(
                    response,
                    "gplc_XYZ",
                    "key",
                    None,
                    type_map=type_map,
                    religion_type_map=religion_type_map,
                )

        assert place_data["religion"] == "unknown"
        assert place_data["place_type"] == "place of worship"


# ── BestTimeCollector ─────────────────────────────────────────────────────────


class TestBestTimeCollectorExtended:
    async def test_collect_with_key_no_forecast(self):
        from app.collectors.besttime import BestTimeCollector

        collector = BestTimeCollector()
        with patch.dict(os.environ, {"BESTTIME_API_KEY": "test_key"}, clear=False):
            with patch.object(collector, "_fetch_forecast", new=AsyncMock(return_value=None)):
                result = await collector.collect("gplc_test", 25.0, 55.0, "Test")
        assert result.status == "skipped"

    async def test_collect_exception(self):
        from app.collectors.besttime import BestTimeCollector

        collector = BestTimeCollector()
        with patch.dict(os.environ, {"BESTTIME_API_KEY": "test_key"}, clear=False):
            with patch.object(
                collector, "_fetch_forecast", new=AsyncMock(side_effect=Exception("Timeout"))
            ):
                result = await collector.collect("gplc_test", 25.0, 55.0, "Test")
        assert result.status == "failed"
        assert "Timeout" in result.error_message

    async def test_fetch_forecast_success(self):
        from app.collectors.besttime import BestTimeCollector

        collector = BestTimeCollector()
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"status": "OK", "analysis": {}}

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.collectors.besttime.httpx.AsyncClient", return_value=mock_client):
            data = await collector._fetch_forecast("Test", 25.0, 55.0, "key")
        assert data == {"status": "OK", "analysis": {}}

    async def test_fetch_forecast_non_200(self):
        from app.collectors.besttime import BestTimeCollector

        collector = BestTimeCollector()
        mock_resp = MagicMock()
        mock_resp.status_code = 400

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.collectors.besttime.httpx.AsyncClient", return_value=mock_client):
            result = await collector._fetch_forecast("Test", 25.0, 55.0, "key")
        assert result is None

    async def test_fetch_forecast_not_ok_status(self):
        from app.collectors.besttime import BestTimeCollector

        collector = BestTimeCollector()
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"status": "NOT_FOUND"}

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.collectors.besttime.httpx.AsyncClient", return_value=mock_client):
            result = await collector._fetch_forecast("Test", 25.0, 55.0, "key")
        assert result is None

    def test_extract_with_week_data(self):
        from app.collectors.besttime import BestTimeCollector

        collector = BestTimeCollector()
        data = {
            "status": "OK",
            "analysis": {
                "week_raw": [
                    {
                        "day_info": {"day_text": "Monday"},
                        "hour_analysis": [
                            {"hour": 9, "intensity_nr": 3},
                            {"hour": 12, "intensity_nr": 5},
                        ],
                        "peak_hours": [12, 13],
                    },
                    {
                        "day_info": {"day_text": "Tuesday"},
                        "hour_analysis": [{"hour": 10, "intensity_nr": 2}],
                        "peak_hours": [],
                    },
                ]
            },
        }
        result = collector._extract(data)

        assert result.status == "success"
        attr_codes = {a["attribute_code"] for a in result.attributes}
        assert "busyness_forecast" in attr_codes
        assert "peak_hours" in attr_codes

        forecast_attr = next(
            a for a in result.attributes if a["attribute_code"] == "busyness_forecast"
        )
        assert "Monday" in forecast_attr["value"]
        assert len(forecast_attr["value"]["Monday"]) == 2

    def test_extract_empty_analysis(self):
        from app.collectors.besttime import BestTimeCollector

        collector = BestTimeCollector()
        result = collector._extract({"analysis": {}})
        assert result.status == "success"
        assert result.attributes == []

    async def test_collect_success_full_flow(self):
        from app.collectors.besttime import BestTimeCollector

        collector = BestTimeCollector()
        mock_data = {
            "status": "OK",
            "analysis": {
                "week_raw": [
                    {
                        "day_info": {"day_text": "Friday"},
                        "hour_analysis": [{"hour": 14, "intensity_nr": 8}],
                        "peak_hours": [14],
                    }
                ]
            },
        }
        with patch.dict(os.environ, {"BESTTIME_API_KEY": "test_key"}, clear=False):
            with patch.object(collector, "_fetch_forecast", new=AsyncMock(return_value=mock_data)):
                result = await collector.collect("gplc_test", 25.0, 55.0, "Test Mosque")

        assert result.status == "success"
        assert any(a["attribute_code"] == "busyness_forecast" for a in result.attributes)


# ── FoursquareCollector ───────────────────────────────────────────────────────


class TestFoursquareCollectorExtended:
    async def test_collect_no_match(self):
        from app.collectors.foursquare import FoursquareCollector

        collector = FoursquareCollector()
        with patch.dict(os.environ, {"FOURSQUARE_API_KEY": "test_key"}, clear=False):
            with patch.object(collector, "_match_place", new=AsyncMock(return_value=None)):
                result = await collector.collect("gplc_test", 25.0, 55.0, "Unknown Place")
        assert result.status == "skipped"

    async def test_collect_success(self):
        from app.collectors.foursquare import FoursquareCollector

        collector = FoursquareCollector()
        mock_tips = [
            {"text": "Beautiful mosque!", "lang": "en"},
            {"text": "Worth visiting", "lang": "en"},
        ]
        with patch.dict(os.environ, {"FOURSQUARE_API_KEY": "test_key"}, clear=False):
            with patch.object(collector, "_match_place", new=AsyncMock(return_value="fsq_abc123")):
                with patch.object(collector, "_fetch_tips", new=AsyncMock(return_value=mock_tips)):
                    result = await collector.collect("gplc_test", 25.0, 55.0, "Test Mosque")

        assert result.status == "success"
        assert len(result.reviews) == 2
        assert result.reviews[0]["text"] == "Beautiful mosque!"
        assert result.reviews[0]["rating"] == 0  # Foursquare tips have no rating

    async def test_collect_exception(self):
        from app.collectors.foursquare import FoursquareCollector

        collector = FoursquareCollector()
        with patch.dict(os.environ, {"FOURSQUARE_API_KEY": "test_key"}, clear=False):
            with patch.object(
                collector, "_match_place", new=AsyncMock(side_effect=Exception("Connection error"))
            ):
                result = await collector.collect("gplc_test", 25.0, 55.0, "Test")
        assert result.status == "failed"

    async def test_match_place_success(self):
        from app.collectors.foursquare import FoursquareCollector

        collector = FoursquareCollector()
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"place": {"fsq_id": "fsq_abc123"}}

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.collectors.foursquare.httpx.AsyncClient", return_value=mock_client):
            fsq_id = await collector._match_place("Test", 25.0, 55.0, "api_key")
        assert fsq_id == "fsq_abc123"

    async def test_match_place_non_200(self):
        from app.collectors.foursquare import FoursquareCollector

        collector = FoursquareCollector()
        mock_resp = MagicMock()
        mock_resp.status_code = 403

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.collectors.foursquare.httpx.AsyncClient", return_value=mock_client):
            fsq_id = await collector._match_place("Test", 25.0, 55.0, "key")
        assert fsq_id is None

    async def test_match_place_no_fsq_id(self):
        from app.collectors.foursquare import FoursquareCollector

        collector = FoursquareCollector()
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"place": {}}  # No fsq_id

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.collectors.foursquare.httpx.AsyncClient", return_value=mock_client):
            fsq_id = await collector._match_place("Test", 25.0, 55.0, "key")
        assert fsq_id is None

    async def test_fetch_tips_success(self):
        from app.collectors.foursquare import FoursquareCollector

        collector = FoursquareCollector()
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = [{"text": "Great place"}, {"text": "Very peaceful"}]

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.collectors.foursquare.httpx.AsyncClient", return_value=mock_client):
            tips = await collector._fetch_tips("fsq_abc", "api_key")
        assert len(tips) == 2

    async def test_fetch_tips_non_200(self):
        from app.collectors.foursquare import FoursquareCollector

        collector = FoursquareCollector()
        mock_resp = MagicMock()
        mock_resp.status_code = 500

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.collectors.foursquare.httpx.AsyncClient", return_value=mock_client):
            tips = await collector._fetch_tips("fsq_abc", "key")
        assert tips == []


# ── OutscraperCollector ───────────────────────────────────────────────────────


class TestOutscraperCollectorExtended:
    async def test_collect_with_gplc_code(self):
        from app.collectors.outscraper import OutscraperCollector

        collector = OutscraperCollector()
        mock_reviews = [
            {
                "author_title": "Test User",
                "review_rating": 5,
                "review_text": "Amazing place",
                "review_datetime_utc": "2024-01-15T10:00:00Z",
                "review_language": "en",
            }
        ]
        with patch.dict(os.environ, {"OUTSCRAPER_API_KEY": "test_key"}, clear=False):
            with patch.object(
                collector, "_fetch_reviews", new=AsyncMock(return_value=mock_reviews)
            ):
                result = await collector.collect("gplc_ChIJ123", 25.0, 55.0, "Test")

        assert result.status == "success"
        assert len(result.reviews) == 1
        assert result.reviews[0]["author_name"] == "Test User"
        assert result.reviews[0]["time"] > 0

    async def test_collect_with_existing_data_place_id(self):
        from app.collectors.outscraper import OutscraperCollector

        collector = OutscraperCollector()
        mock_reviews = [{"author_title": "User", "review_rating": 4, "review_text": "Nice"}]
        with patch.dict(os.environ, {"OUTSCRAPER_API_KEY": "test_key"}, clear=False):
            with patch.object(
                collector, "_fetch_reviews", new=AsyncMock(return_value=mock_reviews)
            ):
                result = await collector.collect(
                    "custom_code",
                    25.0,
                    55.0,
                    "Test",
                    existing_data={"google_place_id": "ChIJabc"},
                )
        assert result.status == "success"

    async def test_collect_no_reviews_returned(self):
        from app.collectors.outscraper import OutscraperCollector

        collector = OutscraperCollector()
        with patch.dict(os.environ, {"OUTSCRAPER_API_KEY": "test_key"}, clear=False):
            with patch.object(collector, "_fetch_reviews", new=AsyncMock(return_value=[])):
                result = await collector.collect("gplc_ChIJ123", 25.0, 55.0, "Test")
        assert result.status == "skipped"

    async def test_collect_exception(self):
        from app.collectors.outscraper import OutscraperCollector

        collector = OutscraperCollector()
        with patch.dict(os.environ, {"OUTSCRAPER_API_KEY": "test_key"}, clear=False):
            with patch.object(
                collector, "_fetch_reviews", new=AsyncMock(side_effect=Exception("API error"))
            ):
                result = await collector.collect("gplc_ChIJ123", 25.0, 55.0, "Test")
        assert result.status == "failed"

    async def test_fetch_reviews_success(self):
        from app.collectors.outscraper import OutscraperCollector

        collector = OutscraperCollector()
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "data": [
                {
                    "reviews_data": [
                        {"author_title": "User1", "review_text": "Great!", "review_rating": 5}
                    ]
                }
            ]
        }

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.collectors.outscraper.httpx.AsyncClient", return_value=mock_client):
            reviews = await collector._fetch_reviews("ChIJ123", "api_key")
        assert len(reviews) == 1
        assert reviews[0]["author_title"] == "User1"

    async def test_fetch_reviews_non_200(self):
        from app.collectors.outscraper import OutscraperCollector

        collector = OutscraperCollector()
        mock_resp = MagicMock()
        mock_resp.status_code = 401

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.collectors.outscraper.httpx.AsyncClient", return_value=mock_client):
            reviews = await collector._fetch_reviews("ChIJ123", "key")
        assert reviews == []

    async def test_fetch_reviews_no_data(self):
        from app.collectors.outscraper import OutscraperCollector

        collector = OutscraperCollector()
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"data": []}

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.collectors.outscraper.httpx.AsyncClient", return_value=mock_client):
            reviews = await collector._fetch_reviews("ChIJ123", "key")
        assert reviews == []

    def test_extract_reviews(self):
        from app.collectors.outscraper import OutscraperCollector

        collector = OutscraperCollector()
        reviews = [
            {
                "author_title": "User1",
                "review_rating": 5,
                "review_text": "Amazing place",
                "review_datetime_utc": "2024-01-15T10:00:00Z",
                "review_language": "en",
            },
            {
                "author_title": "User2",
                "review_rating": 3,
                "review_text": "Okay place",
                "review_datetime_utc": "bad-date",  # Unparsable
                "review_language": "ar",
            },
        ]
        result = collector._extract(reviews)

        assert result.status == "success"
        assert len(result.reviews) == 2
        assert result.reviews[0]["author_name"] == "User1"
        assert result.reviews[0]["time"] > 0
        assert result.reviews[1]["time"] == 0  # Bad date → 0
        assert result.reviews[1]["language"] == "ar"


# ── WikipediaCollector ────────────────────────────────────────────────────────


class TestWikipediaCollectorExtended:
    async def test_fetch_from_tag_no_colon(self):
        """Tag without colon separator defaults to English."""
        from app.collectors.wikipedia import WikipediaCollector

        collector = WikipediaCollector()
        mock_info = {
            "title": "Al-Aqsa_Mosque",
            "description": "Historic mosque",
            "short_description": None,
            "image_url": None,
            "original_image": None,
        }
        with patch.object(
            collector, "_fetch_by_title", new=AsyncMock(return_value=mock_info)
        ) as mock_fetch:
            result = await collector._fetch_from_tag("Al-Aqsa_Mosque")

        mock_fetch.assert_called_once_with("Al-Aqsa_Mosque", "en")
        assert result == mock_info

    async def test_fetch_by_title_success_with_thumbnail(self):
        from app.collectors.wikipedia import WikipediaCollector

        collector = WikipediaCollector()
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "title": "Al-Aqsa Mosque",
            "extract": "Al-Aqsa Mosque is the third holiest site in Islam.",
            "description": "Historic mosque in Jerusalem",
            "thumbnail": {"source": "https://upload.wikimedia.org/thumb.jpg"},
        }
        with patch(
            "app.collectors.wikipedia.async_request_with_backoff",
            new=AsyncMock(return_value=mock_resp),
        ):
            info = await collector._fetch_by_title("Al-Aqsa Mosque", "en")

        assert info["title"] == "Al-Aqsa Mosque"
        assert info["description"] == "Al-Aqsa Mosque is the third holiest site in Islam."
        assert info["image_url"] == "https://upload.wikimedia.org/thumb.jpg"
        assert info["original_image"] is None

    async def test_fetch_by_title_with_originalimage(self):
        from app.collectors.wikipedia import WikipediaCollector

        collector = WikipediaCollector()
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "title": "Test",
            "extract": "Test description",
            "thumbnail": {"source": "https://example.com/thumb.jpg"},
            "originalimage": {"source": "https://example.com/full.jpg"},
        }
        with patch(
            "app.collectors.wikipedia.async_request_with_backoff",
            new=AsyncMock(return_value=mock_resp),
        ):
            info = await collector._fetch_by_title("Test", "en")

        assert info["image_url"] == "https://example.com/full.jpg"  # Original wins
        assert info["original_image"] == "https://example.com/full.jpg"

    async def test_fetch_by_title_no_response(self):
        from app.collectors.wikipedia import WikipediaCollector

        collector = WikipediaCollector()
        with patch(
            "app.collectors.wikipedia.async_request_with_backoff", new=AsyncMock(return_value=None)
        ):
            result = await collector._fetch_by_title("Test", "en")
        assert result is None

    async def test_fetch_by_title_non_200(self):
        from app.collectors.wikipedia import WikipediaCollector

        collector = WikipediaCollector()
        mock_resp = MagicMock()
        mock_resp.status_code = 404
        with patch(
            "app.collectors.wikipedia.async_request_with_backoff",
            new=AsyncMock(return_value=mock_resp),
        ):
            result = await collector._fetch_by_title("Unknown", "en")
        assert result is None

    async def test_fetch_by_title_json_exception(self):
        from app.collectors.wikipedia import WikipediaCollector

        collector = WikipediaCollector()
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.side_effect = ValueError("Invalid JSON")
        with patch(
            "app.collectors.wikipedia.async_request_with_backoff",
            new=AsyncMock(return_value=mock_resp),
        ):
            result = await collector._fetch_by_title("Test", "en")
        assert result is None

    async def test_search_wikipedia_success(self):
        from app.collectors.wikipedia import WikipediaCollector

        collector = WikipediaCollector()
        mock_search_resp = MagicMock()
        mock_search_resp.status_code = 200
        mock_search_resp.json.return_value = {"query": {"search": [{"title": "Al-Aqsa Mosque"}]}}
        mock_article_info = {
            "title": "Al-Aqsa Mosque",
            "description": "Historic mosque",
            "short_description": None,
            "image_url": None,
            "original_image": None,
        }
        with patch(
            "app.collectors.wikipedia.async_request_with_backoff",
            new=AsyncMock(return_value=mock_search_resp),
        ):
            with patch.object(
                collector, "_fetch_by_title", new=AsyncMock(return_value=mock_article_info)
            ):
                result = await collector._search_wikipedia("Al-Aqsa Mosque", "en")

        assert result == mock_article_info

    async def test_search_wikipedia_no_response(self):
        from app.collectors.wikipedia import WikipediaCollector

        collector = WikipediaCollector()
        with patch(
            "app.collectors.wikipedia.async_request_with_backoff", new=AsyncMock(return_value=None)
        ):
            result = await collector._search_wikipedia("Test", "en")
        assert result is None

    async def test_search_wikipedia_non_200(self):
        from app.collectors.wikipedia import WikipediaCollector

        collector = WikipediaCollector()
        mock_resp = MagicMock()
        mock_resp.status_code = 500
        with patch(
            "app.collectors.wikipedia.async_request_with_backoff",
            new=AsyncMock(return_value=mock_resp),
        ):
            result = await collector._search_wikipedia("Test", "en")
        assert result is None

    async def test_search_wikipedia_empty_results(self):
        from app.collectors.wikipedia import WikipediaCollector

        collector = WikipediaCollector()
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"query": {"search": []}}
        with patch(
            "app.collectors.wikipedia.async_request_with_backoff",
            new=AsyncMock(return_value=mock_resp),
        ):
            result = await collector._search_wikipedia("Unknown Gibberish Place", "en")
        assert result is None

    async def test_collect_multilingual_descriptions(self):
        """Arabic and Hindi descriptions should be added when available."""
        from app.collectors.wikipedia import WikipediaCollector

        collector = WikipediaCollector()
        en_info = {
            "title": "Al-Aqsa Mosque",
            "description": "Third holiest site in Islam.",
            "short_description": "Mosque in Jerusalem",
            "image_url": "https://example.com/img.jpg",
            "original_image": None,
        }
        ar_info = {
            "title": "المسجد الأقصى",
            "description": "أقدس المواضع في الإسلام",
            "short_description": None,
            "image_url": None,
            "original_image": None,
        }

        def fetch_by_title_side_effect(title, lang):
            if lang == "ar":
                return ar_info
            return None  # hi not available

        with patch.object(collector, "_fetch_from_tag", new=AsyncMock(return_value=en_info)):
            with patch.object(collector, "_fetch_by_title", side_effect=fetch_by_title_side_effect):
                result = await collector.collect(
                    "gplc_test",
                    31.7,
                    35.2,
                    "Al-Aqsa Mosque",
                    existing_data={"tags": {"wikipedia": "en:Al-Aqsa Mosque"}},
                )

        assert result.status == "success"
        langs = {d["lang"] for d in result.descriptions}
        assert "en" in langs
        assert "ar" in langs
        assert "hi" not in langs

    async def test_collect_exception_path(self):
        """Exception during collection should result in failed status."""
        from app.collectors.wikipedia import WikipediaCollector

        collector = WikipediaCollector()
        with patch.object(
            collector, "_fetch_from_tag", new=AsyncMock(side_effect=RuntimeError("Network failure"))
        ):
            result = await collector.collect(
                "gplc_test",
                25.0,
                55.0,
                "Test",
                existing_data={"tags": {"wikipedia": "en:Test"}},
            )
        assert result.status == "failed"
        assert "Network failure" in result.error_message

    # ── Relevance validation (search path only) ────────────────────────────────

    async def test_search_result_rejected_when_unrelated_article(self):
        """Searching 'Al Futtaim Masjid' must not accept an article about 'Dubai Marina'."""
        from app.collectors.wikipedia import WikipediaCollector

        collector = WikipediaCollector()
        # 'Dubai Marina' has a short description that mentions "waterfront district"
        irrelevant_info = {
            "title": "Dubai Marina",
            "description": "Dubai Marina is a canal city in Dubai.",
            "short_description": "waterfront residential district in Dubai",
            "image_url": None,
            "original_image": None,
        }
        with patch.object(
            collector, "_search_wikipedia", new=AsyncMock(return_value=irrelevant_info)
        ):
            result = await collector.collect("gplc_test", 25.1, 55.2, "Al Futtaim Masjid")

        assert result.status == "skipped"
        assert "not relevant" in result.error_message.lower()

    async def test_search_result_accepted_when_title_matches(self):
        """Searching 'Al-Aqsa Mosque' should accept an article titled 'Al-Aqsa Mosque'."""
        from app.collectors.wikipedia import WikipediaCollector

        collector = WikipediaCollector()
        relevant_info = {
            "title": "Al-Aqsa Mosque",
            "description": "Al-Aqsa Mosque is the third holiest site in Islam.",
            "short_description": "mosque in Jerusalem",
            "image_url": None,
            "original_image": None,
        }
        with patch.object(
            collector, "_search_wikipedia", new=AsyncMock(return_value=relevant_info)
        ):
            with patch.object(collector, "_fetch_by_title", return_value=None):
                result = await collector.collect("gplc_test", 31.7, 35.2, "Al-Aqsa Mosque")

        assert result.status == "success"

    async def test_osm_tag_path_bypasses_relevance_check(self):
        """Articles fetched via an OSM tag are accepted without relevance validation."""
        from app.collectors.wikipedia import WikipediaCollector

        collector = WikipediaCollector()
        # Even an 'unrelated' article title is accepted when OSM tag is present
        unrelated_info = {
            "title": "Some Totally Different Article",
            "description": "Completely unrelated description.",
            "short_description": "waterfront district",
            "image_url": None,
            "original_image": None,
        }
        with patch.object(collector, "_fetch_from_tag", new=AsyncMock(return_value=unrelated_info)):
            with patch.object(collector, "_fetch_by_title", return_value=None):
                result = await collector.collect(
                    "gplc_test",
                    25.0,
                    55.0,
                    "Al Futtaim Masjid",
                    existing_data={"tags": {"wikipedia": "en:Some_Totally_Different_Article"}},
                )

        # Must succeed — OSM tag is authoritative, relevance check is skipped
        assert result.status == "success"

    # ── _normalize_name_tokens unit tests ──────────────────────────────────────

    def test_normalize_maps_masjid_to_mosque(self):
        from app.collectors.wikipedia import _normalize_name_tokens

        tokens = _normalize_name_tokens("Al Futtaim Masjid")
        assert "mosque" in tokens
        assert "futtaim" in tokens
        assert "al" not in tokens  # noise word

    def test_normalize_strips_noise_and_punctuation(self):
        from app.collectors.wikipedia import _normalize_name_tokens

        tokens = _normalize_name_tokens("The Grand Mosque of Mecca")
        assert "the" not in tokens
        assert "grand" not in tokens
        assert "of" not in tokens
        assert "mosque" in tokens
        assert "mecca" in tokens

    def test_normalize_hyphenated_prefix(self):
        """'Al-Nabawi' should split into 'al' (noise, dropped) and 'nabawi'."""
        from app.collectors.wikipedia import _normalize_name_tokens

        tokens = _normalize_name_tokens("Al-Nabawi Mosque")
        assert "nabawi" in tokens
        assert "al" not in tokens
        assert "mosque" in tokens

    # ── _is_article_relevant unit tests ────────────────────────────────────────

    def test_is_article_relevant_high_token_overlap(self):
        """Matching title tokens → relevant."""
        from app.collectors.wikipedia import WikipediaCollector

        collector = WikipediaCollector()
        article = {
            "title": "Al-Aqsa Mosque",
            "short_description": "mosque in Jerusalem",
        }
        assert collector._is_article_relevant(article, "Al-Aqsa Mosque") is True

    def test_is_article_relevant_synonym_overlap(self):
        """'masjid' in place name and 'mosque' in article title should match via synonym."""
        from app.collectors.wikipedia import WikipediaCollector

        collector = WikipediaCollector()
        article = {
            "title": "Nabawi Mosque",
            "short_description": "mosque in Medina",
        }
        assert collector._is_article_relevant(article, "Masjid al-Nabawi") is True

    def test_is_article_relevant_religious_vs_district(self):
        """Religious place name + 'district' in short desc → not relevant."""
        from app.collectors.wikipedia import WikipediaCollector

        collector = WikipediaCollector()
        article = {
            "title": "Dubai Marina",
            "short_description": "waterfront residential district in Dubai",
        }
        assert collector._is_article_relevant(article, "Al Futtaim Masjid") is False

    def test_is_article_relevant_person_rejected(self):
        """Person article (politician, scholar, etc.) is never relevant to a place search."""
        from app.collectors.wikipedia import WikipediaCollector

        collector = WikipediaCollector()
        cases = [
            ("Omer al-Qarray", "Saudi politician", "Mosque of Qurais"),
            ("John Smith", "British author", "St. Mary's Church"),
            ("Ahmed al-Rashid", "Iraqi general", "Al-Rashid Mosque"),
            ("Fatima Malik", "Pakistani scholar", "Grand Mosque Lahore"),
        ]
        for title, short_desc, place_name in cases:
            article = {"title": title, "short_description": short_desc}
            assert (
                collector._is_article_relevant(article, place_name) is False
            ), f"Expected rejection: article='{title}' ({short_desc}) for place='{place_name}'"

    def test_is_article_relevant_country_org_article_rejected(self):
        """Broad country/org overview article rejected when distinctive place tokens missing."""
        from app.collectors.wikipedia import WikipediaCollector

        collector = WikipediaCollector()
        # "St. Mary's Catholic Church, Al Ain" → "Catholic Church in the United Arab Emirates"
        # jaccard=0.25 (<0.3), but 3 distinctive tokens missing (st, marys, ain) → Layer 3 rejects
        article = {
            "title": "Catholic Church in the United Arab Emirates",
            "short_description": "Roman Catholicism in the UAE",
        }
        assert (
            collector._is_article_relevant(article, "St. Mary's Catholic Church, Al Ain") is False
        )

    def test_is_article_relevant_low_jaccard_few_missing_tokens_accepts(self):
        """Low jaccard but < 2 distinctive tokens missing → accept (Layer 3 does not fire)."""
        from app.collectors.wikipedia import WikipediaCollector

        collector = WikipediaCollector()
        # "Blue Mosque" → "Sultan Ahmed Mosque": jaccard low, but only 1 distinctive token missing
        article = {
            "title": "Sultan Ahmed Mosque",
            "short_description": "Ottoman-era mosque in Istanbul",
        }
        # distinctive_missing = {"blue"} = 1 < 2 → NOT rejected
        assert collector._is_article_relevant(article, "Blue Mosque") is True

    def test_is_article_relevant_completely_different_title_rejected(self):
        """Zero token overlap + multiple distinctive tokens missing → reject via Layer 3."""
        from app.collectors.wikipedia import WikipediaCollector

        collector = WikipediaCollector()
        article = {
            "title": "Completely Different Title",
            "short_description": None,
        }
        # distinctive_missing = {unknown, small, x} = 3 ≥ 2 AND jaccard=0.0 < 0.6 → rejected
        assert collector._is_article_relevant(article, "Unknown Small Shrine X") is False


# ── WikidataCollector ─────────────────────────────────────────────────────────


class TestWikidataCollectorExtended:
    async def test_collect_with_valid_qid_success(self):
        from app.collectors.wikidata import WikidataCollector

        collector = WikidataCollector()
        entity = {
            "claims": {
                "P856": [
                    {"mainsnak": {"datavalue": {"type": "string", "value": "https://alaqsa.org"}}}
                ]
            },
            "descriptions": {"en": {"value": "Mosque in Jerusalem"}},
            "labels": {},
        }
        with patch.object(collector, "_fetch_entity", new=AsyncMock(return_value=entity)):
            result = await collector.collect(
                "gplc_test",
                25.0,
                55.0,
                "Test",
                existing_data={"tags": {"wikidata": "Q23731"}},
            )
        assert result.status == "success"
        assert result.contact.get("website") == "https://alaqsa.org"

    async def test_collect_entity_not_found(self):
        from app.collectors.wikidata import WikidataCollector

        collector = WikidataCollector()
        with patch.object(collector, "_fetch_entity", new=AsyncMock(return_value=None)):
            result = await collector.collect(
                "gplc_test",
                25.0,
                55.0,
                "Test",
                existing_data={"tags": {"wikidata": "Q99999"}},
            )
        assert result.status == "failed"

    async def test_collect_exception(self):
        from app.collectors.wikidata import WikidataCollector

        collector = WikidataCollector()
        with patch.object(
            collector, "_fetch_entity", new=AsyncMock(side_effect=Exception("Network error"))
        ):
            result = await collector.collect(
                "gplc_test",
                25.0,
                55.0,
                "Test",
                existing_data={"tags": {"wikidata": "Q23731"}},
            )
        assert result.status == "failed"

    async def test_fetch_entity_success(self):
        from app.collectors.wikidata import WikidataCollector

        collector = WikidataCollector()
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "entities": {
                "Q23731": {
                    "claims": {},
                    "descriptions": {"en": {"value": "Mosque"}},
                    "labels": {},
                }
            }
        }
        with patch(
            "app.collectors.wikidata.async_request_with_backoff",
            new=AsyncMock(return_value=mock_resp),
        ):
            entity = await collector._fetch_entity("Q23731")

        assert entity is not None
        assert entity["descriptions"]["en"]["value"] == "Mosque"

    async def test_fetch_entity_no_response(self):
        from app.collectors.wikidata import WikidataCollector

        collector = WikidataCollector()
        with patch(
            "app.collectors.wikidata.async_request_with_backoff", new=AsyncMock(return_value=None)
        ):
            entity = await collector._fetch_entity("Q23731")
        assert entity is None

    async def test_fetch_entity_json_exception(self):
        from app.collectors.wikidata import WikidataCollector

        collector = WikidataCollector()
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.side_effect = ValueError("JSON parse error")
        with patch(
            "app.collectors.wikidata.async_request_with_backoff",
            new=AsyncMock(return_value=mock_resp),
        ):
            entity = await collector._fetch_entity("Q23731")
        assert entity is None

    def test_extract_claim_value_none(self):
        """Claim with missing value should return None."""
        from app.collectors.wikidata import WikidataCollector

        collector = WikidataCollector()
        claim = {"mainsnak": {"datavalue": {}}}  # No "value" key
        result = collector._extract_claim_value(claim)
        assert result is None

    def test_extract_claim_value_monolingualtext(self):
        from app.collectors.wikidata import WikidataCollector

        collector = WikidataCollector()
        claim = {
            "mainsnak": {
                "datavalue": {
                    "type": "monolingualtext",
                    "value": {"text": "Al-Aqsa Mosque", "language": "en"},
                }
            }
        }
        result = collector._extract_claim_value(claim)
        assert result == "Al-Aqsa Mosque"

    def test_extract_claim_value_time_empty(self):
        """Time with empty time_str should return None."""
        from app.collectors.wikidata import WikidataCollector

        collector = WikidataCollector()
        claim = {"mainsnak": {"datavalue": {"type": "time", "value": {"time": ""}}}}
        result = collector._extract_claim_value(claim)
        assert result is None

    def test_extract_claim_value_unknown_type(self):
        """Unknown value type should fall back to str()."""
        from app.collectors.wikidata import WikidataCollector

        collector = WikidataCollector()
        claim = {"mainsnak": {"datavalue": {"type": "quantity", "value": {"amount": "+42"}}}}
        result = collector._extract_claim_value(claim)
        assert result is not None  # Falls back to str()

    def test_extract_value_none_in_loop(self):
        """_extract should skip properties where _extract_claim_value returns None."""
        from app.collectors.wikidata import WikidataCollector

        collector = WikidataCollector()
        # Claim with no datavalue → _extract_claim_value returns None
        entity = {
            "claims": {
                "P571": [{"mainsnak": {"datavalue": {}}}]  # value key missing → None
            },
            "descriptions": {},
            "labels": {},
        }
        result = collector._extract(entity, "Q99999")
        # P571 (founded_year) should be skipped since value is None
        attr_codes = {a["attribute_code"] for a in result.attributes}
        assert "founded_year" not in attr_codes


# ── KnowledgeGraphCollector ───────────────────────────────────────────────────


class TestKnowledgeGraphCollectorExtended:
    async def test_collect_success(self):
        from app.collectors.knowledge_graph import KnowledgeGraphCollector

        collector = KnowledgeGraphCollector()
        element = {
            "result": {
                "name": "Al-Aqsa Mosque",
                "@type": ["Place", "TouristAttraction"],
                "detailedDescription": {
                    "articleBody": "Al-Aqsa is the third holiest site in Islam."
                },
                "description": "Historic mosque",
                "image": {"contentUrl": "https://example.com/img.jpg"},
                "url": "https://alaqsa.org",
            },
            "resultScore": 1234.56,
        }
        with patch.dict(os.environ, {"GOOGLE_MAPS_API_KEY": "test_key"}, clear=False):
            with patch.object(collector, "_search", new=AsyncMock(return_value=element)):
                result = await collector.collect("gplc_test", 25.0, 55.0, "Al-Aqsa Mosque")

        assert result.status == "success"

    async def test_collect_no_results(self):
        from app.collectors.knowledge_graph import KnowledgeGraphCollector

        collector = KnowledgeGraphCollector()
        with patch.dict(os.environ, {"GOOGLE_MAPS_API_KEY": "test_key"}, clear=False):
            with patch.object(collector, "_search", new=AsyncMock(return_value=None)):
                result = await collector.collect("gplc_test", 25.0, 55.0, "Unknown Place")
        assert result.status == "skipped"

    async def test_collect_exception(self):
        from app.collectors.knowledge_graph import KnowledgeGraphCollector

        collector = KnowledgeGraphCollector()
        with patch.dict(os.environ, {"GOOGLE_MAPS_API_KEY": "test_key"}, clear=False):
            with patch.object(
                collector, "_search", new=AsyncMock(side_effect=Exception("API down"))
            ):
                result = await collector.collect("gplc_test", 25.0, 55.0, "Test")
        assert result.status == "failed"

    async def test_search_success(self):
        from app.collectors.knowledge_graph import KnowledgeGraphCollector

        collector = KnowledgeGraphCollector()
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "itemListElement": [{"result": {"name": "Al-Aqsa Mosque"}, "resultScore": 1000}]
        }

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.collectors.knowledge_graph.httpx.AsyncClient", return_value=mock_client):
            element = await collector._search("Al-Aqsa Mosque", "key")
        assert element is not None
        assert element["result"]["name"] == "Al-Aqsa Mosque"

    async def test_search_non_200(self):
        from app.collectors.knowledge_graph import KnowledgeGraphCollector

        collector = KnowledgeGraphCollector()
        mock_resp = MagicMock()
        mock_resp.status_code = 403

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.collectors.knowledge_graph.httpx.AsyncClient", return_value=mock_client):
            result = await collector._search("Test", "key")
        assert result is None

    async def test_search_empty_results(self):
        from app.collectors.knowledge_graph import KnowledgeGraphCollector

        collector = KnowledgeGraphCollector()
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"itemListElement": []}

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.collectors.knowledge_graph.httpx.AsyncClient", return_value=mock_client):
            result = await collector._search("Unknown", "key")
        assert result is None

    def test_extract_string_entity_type(self):
        """@type as a single string should be converted to a list."""
        from app.collectors.knowledge_graph import KnowledgeGraphCollector

        collector = KnowledgeGraphCollector()
        element = {
            "result": {
                "@type": "Place",  # Single string, not a list
                "detailedDescription": {"articleBody": "A place."},
            },
            "resultScore": 100,
        }
        result = collector._extract(element)

        assert result.entity_types == ["Place"]  # Should be a list

    def test_extract_no_detailed_description(self):
        """When detailedDescription is absent, short desc is still captured."""
        from app.collectors.knowledge_graph import KnowledgeGraphCollector

        collector = KnowledgeGraphCollector()
        element = {
            "result": {
                "@type": ["Place"],
                "description": "A mosque",
            },
            "resultScore": 50,
        }
        result = collector._extract(element)

        sources = {d["source"] for d in result.descriptions}
        assert "knowledge_graph_short" in sources
        assert "knowledge_graph" not in sources


# ── OsmCollector ──────────────────────────────────────────────────────────────


class TestOsmCollectorExtended:
    async def test_collect_with_tags_returned(self):
        """collect() should call _extract() when tags are returned."""
        from app.collectors.osm import OsmCollector

        collector = OsmCollector()
        mock_tags = {
            "toilets": "yes",
            "denomination": "sunni",
            "wikipedia": "en:Test",
        }
        with patch.object(collector, "_query_overpass", new=AsyncMock(return_value=mock_tags)):
            result = await collector.collect("gplc_test", 25.0, 55.0, "Test Mosque")

        assert result.status == "success"
        attr_codes = {a["attribute_code"] for a in result.attributes}
        assert "has_toilets" in attr_codes
        assert "denomination" in attr_codes
        assert result.tags["wikipedia"] == "en:Test"

    async def test_query_overpass_success(self):
        from app.collectors.osm import OsmCollector

        collector = OsmCollector()
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "elements": [
                {"id": 1, "tags": {"amenity": "place_of_worship", "name": "Test Mosque"}},
                {"id": 2},  # No "tags" key — should be skipped
            ]
        }
        with patch(
            "app.collectors.osm.async_request_with_backoff", new=AsyncMock(return_value=mock_resp)
        ):
            tags = await collector._query_overpass(25.0, 55.0)

        assert tags == {"amenity": "place_of_worship", "name": "Test Mosque"}

    async def test_query_overpass_no_response(self):
        from app.collectors.osm import OsmCollector

        collector = OsmCollector()
        with patch(
            "app.collectors.osm.async_request_with_backoff", new=AsyncMock(return_value=None)
        ):
            tags = await collector._query_overpass(25.0, 55.0)
        assert tags == {}

    async def test_query_overpass_no_elements(self):
        from app.collectors.osm import OsmCollector

        collector = OsmCollector()
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"elements": []}
        with patch(
            "app.collectors.osm.async_request_with_backoff", new=AsyncMock(return_value=mock_resp)
        ):
            tags = await collector._query_overpass(25.0, 55.0)
        assert tags == {}

    async def test_query_overpass_json_exception(self):
        from app.collectors.osm import OsmCollector

        collector = OsmCollector()
        mock_resp = MagicMock()
        mock_resp.json.side_effect = ValueError("Bad JSON")
        with patch(
            "app.collectors.osm.async_request_with_backoff", new=AsyncMock(return_value=mock_resp)
        ):
            tags = await collector._query_overpass(25.0, 55.0)
        assert tags == {}

    async def test_query_overpass_elements_without_tags(self):
        """All elements lack 'tags' key → returns empty dict."""
        from app.collectors.osm import OsmCollector

        collector = OsmCollector()
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "elements": [{"id": 1, "type": "node"}, {"id": 2, "type": "way"}]
        }
        with patch(
            "app.collectors.osm.async_request_with_backoff", new=AsyncMock(return_value=mock_resp)
        ):
            tags = await collector._query_overpass(25.0, 55.0)
        assert tags == {}


class TestExtractAddressComponents:
    """Unit tests for _extract_address_components in collectors/gmaps.py."""

    def _make_component(self, long_text: str, types: list[str]) -> dict:
        return {"longText": long_text, "types": types}

    def test_extracts_city_state_country(self):
        from app.collectors.gmaps import _extract_address_components

        components = [
            self._make_component("Dubai", ["locality", "political"]),
            self._make_component("Dubai Emirate", ["administrative_area_level_1", "political"]),
            self._make_component("United Arab Emirates", ["country", "political"]),
        ]
        city, state, country = _extract_address_components(components)
        assert city == "Dubai"
        assert state == "Dubai Emirate"
        assert country == "United Arab Emirates"

    def test_falls_back_to_sublocality(self):
        from app.collectors.gmaps import _extract_address_components

        components = [
            self._make_component("Deira", ["sublocality_level_1", "political"]),
            self._make_component("United Arab Emirates", ["country", "political"]),
        ]
        city, state, country = _extract_address_components(components)
        assert city == "Deira"

    def test_locality_takes_priority_over_sublocality(self):
        from app.collectors.gmaps import _extract_address_components

        components = [
            self._make_component("Dubai", ["locality", "political"]),
            self._make_component("Deira", ["sublocality_level_1", "political"]),
        ]
        city, _, _ = _extract_address_components(components)
        assert city == "Dubai"

    def test_empty_components_returns_nones(self):
        from app.collectors.gmaps import _extract_address_components

        city, state, country = _extract_address_components([])
        assert city is None
        assert state is None
        assert country is None

    def test_blank_long_text_skipped(self):
        from app.collectors.gmaps import _extract_address_components

        components = [{"longText": "  ", "types": ["locality"]}]
        city, _, _ = _extract_address_components(components)
        assert city is None


class TestFetchDetailsLanguageCodeQueryParam:
    """Verify languageCode=en is sent as a query param, not a header."""

    def test_language_code_in_params_not_headers(self):
        """_fetch_details should use params={'languageCode': 'en'}, not a header."""
        import inspect

        from app.collectors.gmaps import GmapsCollector

        source = inspect.getsource(GmapsCollector._fetch_details)
        # Should NOT have languageCode in headers dict
        assert "languageCode" not in source.split("headers = {")[1].split("}")[0]

    def test_language_code_passed_as_params(self):
        """The source should contain params={'languageCode': 'en'}."""
        import inspect

        from app.collectors.gmaps import GmapsCollector

        source = inspect.getsource(GmapsCollector._fetch_details)
        assert "languageCode" in source
        assert "params" in source
