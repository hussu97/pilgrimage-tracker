"""
Tests for sync_run_to_server and its sanitisation helpers in app.db.scraper.
"""

from unittest.mock import MagicMock, patch

from sqlmodel import Session

import app.db.scraper as scraper_module
from app.db.models import ScrapedPlace
from app.db.scraper import (
    _sanitize_attributes,
    _sanitize_religion,
    _sanitize_reviews,
    sync_run_to_server,
)

# ── _sanitize_religion ────────────────────────────────────────────────────────


class TestSanitizeReligion:
    def test_valid_islam(self):
        assert _sanitize_religion("islam") == "islam"

    def test_valid_hinduism(self):
        assert _sanitize_religion("hinduism") == "hinduism"

    def test_valid_christianity(self):
        assert _sanitize_religion("christianity") == "christianity"

    def test_valid_all(self):
        assert _sanitize_religion("all") == "all"

    def test_unknown_string_maps_to_all(self):
        assert _sanitize_religion("buddhism") == "all"

    def test_none_maps_to_all(self):
        assert _sanitize_religion(None) == "all"

    def test_empty_string_maps_to_all(self):
        assert _sanitize_religion("") == "all"


# ── _sanitize_attributes ──────────────────────────────────────────────────────


class TestSanitizeAttributes:
    def test_dict_value_dropped(self):
        attrs = [{"key": "parking", "value": {"free": True}}]
        assert _sanitize_attributes(attrs) == []

    def test_str_value_kept(self):
        attrs = [{"key": "phone", "value": "+1234567890"}]
        assert _sanitize_attributes(attrs) == attrs

    def test_int_value_kept(self):
        attrs = [{"key": "capacity", "value": 100}]
        assert _sanitize_attributes(attrs) == attrs

    def test_float_value_kept(self):
        attrs = [{"key": "rating", "value": 4.5}]
        assert _sanitize_attributes(attrs) == attrs

    def test_bool_value_kept(self):
        attrs = [{"key": "wheelchair", "value": True}]
        assert _sanitize_attributes(attrs) == attrs

    def test_list_of_str_kept(self):
        attrs = [{"key": "services", "value": ["wifi", "parking"]}]
        assert _sanitize_attributes(attrs) == attrs

    def test_mixed_list_dropped(self):
        attrs = [{"key": "mixed", "value": ["wifi", 42]}]
        assert _sanitize_attributes(attrs) == []

    def test_multiple_attrs_filtered(self):
        attrs = [
            {"key": "phone", "value": "+1234"},
            {"key": "details", "value": {"nested": True}},
            {"key": "tags", "value": ["a", "b"]},
        ]
        result = _sanitize_attributes(attrs)
        assert len(result) == 2
        assert result[0]["key"] == "phone"
        assert result[1]["key"] == "tags"


# ── _sanitize_reviews ─────────────────────────────────────────────────────────


class TestSanitizeReviews:
    def test_rating_1_kept(self):
        reviews = [{"rating": 1, "text": "poor"}]
        assert _sanitize_reviews(reviews) == reviews

    def test_rating_5_kept(self):
        reviews = [{"rating": 5, "text": "great"}]
        assert _sanitize_reviews(reviews) == reviews

    def test_rating_3_kept(self):
        reviews = [{"rating": 3, "text": "ok"}]
        assert _sanitize_reviews(reviews) == reviews

    def test_rating_0_dropped(self):
        # Foursquare tips have rating=0
        reviews = [{"rating": 0, "text": "a tip"}]
        assert _sanitize_reviews(reviews) == []

    def test_rating_6_dropped(self):
        reviews = [{"rating": 6, "text": "invalid"}]
        assert _sanitize_reviews(reviews) == []

    def test_non_int_rating_dropped(self):
        reviews = [{"rating": "5", "text": "string rating"}]
        assert _sanitize_reviews(reviews) == []

    def test_none_rating_dropped(self):
        reviews = [{"rating": None, "text": "no rating"}]
        assert _sanitize_reviews(reviews) == []

    def test_mixed_reviews_filtered(self):
        reviews = [
            {"rating": 5, "text": "great"},
            {"rating": 0, "text": "tip"},
            {"rating": 3, "text": "ok"},
            {"rating": "4", "text": "string"},
        ]
        result = _sanitize_reviews(reviews)
        assert len(result) == 2
        assert result[0]["rating"] == 5
        assert result[1]["rating"] == 3


# ── sync_run_to_server ────────────────────────────────────────────────────────


def _make_place(run_code: str, place_code: str, session: Session) -> ScrapedPlace:
    """Insert a minimal ScrapedPlace into the session and return it."""
    place = ScrapedPlace(
        run_code=run_code,
        place_code=place_code,
        name="Test Mosque",
        raw_data={
            "name": "Test Mosque",
            "religion": "islam",
            "place_type": "mosque",
            "lat": 25.0,
            "lng": 55.0,
            "address": "123 Main St",
        },
    )
    session.add(place)
    session.commit()
    return place


def _make_mock_session(post_return=None, post_side_effect=None):
    """Return a mock requests.Session instance with a configured .post()."""
    mock_sess = MagicMock()
    if post_side_effect is not None:
        mock_sess.post.side_effect = post_side_effect
    else:
        mock_sess.post.return_value = post_return
    return mock_sess


class TestSyncRunToServer:
    def test_batch_success(self, test_engine, db_session, monkeypatch):
        """Batch endpoint returns 200 → all places synced."""
        run_code = "run_batch_ok"
        _make_place(run_code, "plc_001", db_session)
        _make_place(run_code, "plc_002", db_session)

        monkeypatch.setattr(scraper_module, "engine", test_engine)

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "synced": 2,
            "results": [
                {"place_code": "plc_001", "ok": True},
                {"place_code": "plc_002", "ok": True},
            ],
        }
        mock_sess = _make_mock_session(post_return=mock_resp)

        with patch("requests.Session", return_value=mock_sess):
            sync_run_to_server(run_code, "http://127.0.0.1:3000")
            # Batch endpoint should have been called once
            assert mock_sess.post.call_count == 1
            url = mock_sess.post.call_args[0][0]
            assert url.endswith("/api/v1/places/batch")

    def test_batch_fallback_on_404(self, test_engine, db_session, monkeypatch):
        """Batch endpoint returns 404 → falls back to individual POSTs."""
        run_code = "run_fallback"
        _make_place(run_code, "plc_f01", db_session)
        _make_place(run_code, "plc_f02", db_session)

        monkeypatch.setattr(scraper_module, "engine", test_engine)

        batch_resp = MagicMock(status_code=404)
        individual_resp = MagicMock(status_code=201)

        def post_side_effect(url, **kwargs):
            if "/batch" in url:
                return batch_resp
            return individual_resp

        mock_sess = _make_mock_session(post_side_effect=post_side_effect)

        with patch("requests.Session", return_value=mock_sess):
            sync_run_to_server(run_code, "http://127.0.0.1:3000")
            # 1 batch call + 2 individual calls
            assert mock_sess.post.call_count == 3

    def test_url_scheme_prepended(self, test_engine, db_session, monkeypatch):
        """Bare host:port gets http:// prepended automatically."""
        run_code = "run_scheme"
        _make_place(run_code, "plc_s01", db_session)

        monkeypatch.setattr(scraper_module, "engine", test_engine)

        mock_resp = MagicMock(status_code=200)
        mock_resp.json.return_value = {
            "synced": 1,
            "results": [{"place_code": "plc_s01", "ok": True}],
        }
        mock_sess = _make_mock_session(post_return=mock_resp)

        with patch("requests.Session", return_value=mock_sess):
            sync_run_to_server(run_code, "127.0.0.1:3000")
            url = mock_sess.post.call_args[0][0]
            assert url.startswith("http://")

    def test_partial_failure_individual(self, test_engine, db_session, monkeypatch):
        """One place returns 422, the other succeeds."""
        run_code = "run_partial"
        _make_place(run_code, "plc_ok1", db_session)
        _make_place(run_code, "plc_bad", db_session)

        monkeypatch.setattr(scraper_module, "engine", test_engine)

        batch_resp = MagicMock(status_code=404)
        ok_resp = MagicMock(status_code=200)
        fail_resp = MagicMock(status_code=422, text="Unprocessable Entity")

        def post_side_effect(url, **kwargs):
            if "/batch" in url:
                return batch_resp
            payload = kwargs.get("json", {})
            if payload.get("place_code") == "plc_bad":
                return fail_resp
            return ok_resp

        mock_sess = _make_mock_session(post_side_effect=post_side_effect)

        with patch("requests.Session", return_value=mock_sess):
            # Should not raise
            sync_run_to_server(run_code, "http://127.0.0.1:3000")

    def test_network_exception(self, test_engine, db_session, monkeypatch):
        """requests.Session().post raises ConnectionError → no unhandled exception."""
        run_code = "run_connfail"
        _make_place(run_code, "plc_e01", db_session)

        monkeypatch.setattr(scraper_module, "engine", test_engine)

        mock_sess = _make_mock_session(post_side_effect=ConnectionError("refused"))

        with patch("requests.Session", return_value=mock_sess):
            # Should not propagate the exception
            sync_run_to_server(run_code, "http://127.0.0.1:3000")

    def test_no_places(self, test_engine, monkeypatch):
        """Run with zero scraped places — no POST calls made."""
        run_code = "run_empty"
        monkeypatch.setattr(scraper_module, "engine", test_engine)

        mock_sess = _make_mock_session()

        with patch("requests.Session", return_value=mock_sess):
            sync_run_to_server(run_code, "http://127.0.0.1:3000")
            mock_sess.post.assert_not_called()

    def test_https_url_not_double_prefixed(self, test_engine, db_session, monkeypatch):
        """HTTPS URL must not get an extra http:// prepended."""
        run_code = "run_https"
        _make_place(run_code, "plc_h01", db_session)

        monkeypatch.setattr(scraper_module, "engine", test_engine)

        mock_resp = MagicMock(status_code=200)
        mock_resp.json.return_value = {
            "synced": 1,
            "results": [{"place_code": "plc_h01", "ok": True}],
        }
        mock_sess = _make_mock_session(post_return=mock_resp)

        with patch("requests.Session", return_value=mock_sess):
            sync_run_to_server(run_code, "https://api.example.com")
            url = mock_sess.post.call_args[0][0]
            assert url.startswith("https://")
            assert "http://https://" not in url
