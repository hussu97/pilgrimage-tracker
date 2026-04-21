"""
Integration tests for /api/v1/admin/scraper/* proxy endpoints.

Verifies:
- All endpoints require admin authentication (401 unauthenticated, 403 non-admin)
- Proxy correctly forwards requests to the scraper service
- 503/504 are returned when scraper service is unavailable/timed out
"""

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from sqlmodel import Session, select

from app.db.models import User

# ── helpers ────────────────────────────────────────────────────────────────────


def _register(client, email="user@example.com", password="Testpass123!", name="Tester"):
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "display_name": name},
    )
    assert resp.status_code == 200
    return resp.json()


def _make_admin(user_code: str, session: Session) -> None:
    user = session.exec(select(User).where(User.user_code == user_code)).first()
    assert user is not None
    user.is_admin = True
    session.add(user)
    session.commit()


def _admin_token(client, db_session) -> str:
    data = _register(client, email="proxy_admin@example.com", name="Proxy Admin")
    _make_admin(data["user"]["user_code"], db_session)
    return data["token"]


def _mock_proxy(return_value, status_code: int = 200):
    """Context manager that patches the _proxy helper to return a controlled response."""
    mock_response = MagicMock()
    mock_response.status_code = status_code
    mock_response.json.return_value = return_value

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    mock_client.request = AsyncMock(return_value=mock_response)

    return patch("app.api.v1.admin.scraper_proxy.httpx.AsyncClient", return_value=mock_client)


# ── Auth guard tests ───────────────────────────────────────────────────────────


class TestScraperProxyAuth:
    def test_unauthenticated_gets_401(self, client):
        resp = client.get("/api/v1/admin/scraper/data-locations")
        assert resp.status_code == 401

    def test_non_admin_gets_403(self, client):
        data = _register(client, email="nonadmin_proxy@example.com")
        token = data["token"]
        resp = client.get(
            "/api/v1/admin/scraper/data-locations",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403

    def test_admin_passes_auth(self, client, db_session):
        token = _admin_token(client, db_session)
        with _mock_proxy([]):
            resp = client.get(
                "/api/v1/admin/scraper/data-locations",
                headers={"Authorization": f"Bearer {token}"},
            )
        assert resp.status_code == 200


# ── Error handling tests ───────────────────────────────────────────────────────


class TestScraperProxyErrors:
    def test_scraper_unavailable_returns_503(self, client, db_session):
        token = _admin_token(client, db_session)

        with patch("app.api.v1.admin.scraper_proxy.httpx.AsyncClient") as mock_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.request = AsyncMock(side_effect=httpx.ConnectError("refused"))
            mock_cls.return_value = mock_client

            resp = client.get(
                "/api/v1/admin/scraper/data-locations",
                headers={"Authorization": f"Bearer {token}"},
            )

        assert resp.status_code == 503
        assert "unavailable" in resp.json()["detail"].lower()

    def test_scraper_timeout_returns_504(self, client, db_session):
        token = _admin_token(client, db_session)

        with patch("app.api.v1.admin.scraper_proxy.httpx.AsyncClient") as mock_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.request = AsyncMock(side_effect=httpx.TimeoutException("timeout"))
            mock_cls.return_value = mock_client

            resp = client.get(
                "/api/v1/admin/scraper/runs",
                headers={"Authorization": f"Bearer {token}"},
            )

        assert resp.status_code == 504
        assert "timed out" in resp.json()["detail"].lower()


# ── Data locations proxy ───────────────────────────────────────────────────────


class TestDataLocationsProxy:
    @pytest.fixture(autouse=True)
    def setup(self, client, db_session):
        self.token = _admin_token(client, db_session)
        self.auth = {"Authorization": f"Bearer {self.token}"}
        self.client = client

    def test_list_data_locations(self):
        payload = [{"code": "loc_1", "name": "Dubai"}]
        with _mock_proxy(payload):
            resp = self.client.get("/api/v1/admin/scraper/data-locations", headers=self.auth)
        assert resp.status_code == 200
        assert resp.json() == payload

    def test_create_data_location(self):
        payload = {"code": "loc_new", "name": "New Location"}
        with _mock_proxy(payload, status_code=201):
            resp = self.client.post(
                "/api/v1/admin/scraper/data-locations",
                json={"name": "New Location", "city": "Dubai"},
                headers=self.auth,
            )
        assert resp.status_code == 201

    def test_delete_data_location(self):
        with _mock_proxy({"status": "deleted", "code": "loc_1"}):
            resp = self.client.delete(
                "/api/v1/admin/scraper/data-locations/loc_1", headers=self.auth
            )
        assert resp.status_code == 200
        assert resp.json()["status"] == "deleted"


# ── Runs proxy ─────────────────────────────────────────────────────────────────


class TestRunsProxy:
    @pytest.fixture(autouse=True)
    def setup(self, client, db_session):
        self.token = _admin_token(client, db_session)
        self.auth = {"Authorization": f"Bearer {self.token}"}
        self.client = client

    def test_list_runs(self):
        payload = {"items": [], "total": 0, "page": 1, "page_size": 20}
        with _mock_proxy(payload):
            resp = self.client.get("/api/v1/admin/scraper/runs", headers=self.auth)
        assert resp.status_code == 200

    def test_start_run(self):
        payload = {"run_code": "run_abc", "status": "pending"}
        with _mock_proxy(payload, status_code=200):
            resp = self.client.post(
                "/api/v1/admin/scraper/runs",
                json={"location_code": "loc_1"},
                headers=self.auth,
            )
        assert resp.status_code == 200

    def test_get_run(self):
        payload = {"run_code": "run_abc", "status": "running"}
        with _mock_proxy(payload):
            resp = self.client.get("/api/v1/admin/scraper/runs/run_abc", headers=self.auth)
        assert resp.status_code == 200

    def test_get_run_data(self):
        with _mock_proxy([]):
            resp = self.client.get("/api/v1/admin/scraper/runs/run_abc/data", headers=self.auth)
        assert resp.status_code == 200

    def test_get_run_raw_data(self):
        with _mock_proxy([]):
            resp = self.client.get("/api/v1/admin/scraper/runs/run_abc/raw-data", headers=self.auth)
        assert resp.status_code == 200

    def test_sync_run(self):
        with _mock_proxy({"status": "sync_started"}):
            resp = self.client.post("/api/v1/admin/scraper/runs/run_abc/sync", headers=self.auth)
        assert resp.status_code == 200

    def test_re_enrich_run(self):
        with _mock_proxy({"status": "re_enrichment_started"}):
            resp = self.client.post(
                "/api/v1/admin/scraper/runs/run_abc/re-enrich", headers=self.auth
            )
        assert resp.status_code == 200

    def test_resume_run_forwards_force_query_param(self):
        with _mock_proxy({"status": "queued"}) as mock_cls:
            resp = self.client.post(
                "/api/v1/admin/scraper/runs/run_abc/resume?force=true",
                headers=self.auth,
            )

        assert resp.status_code == 200
        mock_client = mock_cls.return_value
        mock_client.request.assert_awaited_once()
        _, kwargs = mock_client.request.await_args
        assert kwargs["params"] == {"force": "true"}

    def test_cancel_run(self):
        with _mock_proxy({"status": "cancelled"}):
            resp = self.client.post("/api/v1/admin/scraper/runs/run_abc/cancel", headers=self.auth)
        assert resp.status_code == 200

    def test_delete_run(self):
        with _mock_proxy({"status": "deleted", "run_code": "run_abc"}):
            resp = self.client.delete("/api/v1/admin/scraper/runs/run_abc", headers=self.auth)
        assert resp.status_code == 200


# ── Stats proxy ────────────────────────────────────────────────────────────────


class TestStatsProxy:
    def test_get_scraper_stats(self, client, db_session):
        token = _admin_token(client, db_session)
        payload = {
            "total_locations": 5,
            "total_runs": 12,
            "total_places_scraped": 340,
            "last_run_at": None,
            "last_run_status": None,
        }
        with _mock_proxy(payload):
            resp = client.get(
                "/api/v1/admin/scraper/stats",
                headers={"Authorization": f"Bearer {token}"},
            )
        assert resp.status_code == 200
        assert resp.json()["total_locations"] == 5


# ── Collectors proxy ───────────────────────────────────────────────────────────


class TestCollectorsProxy:
    def test_list_collectors(self, client, db_session):
        token = _admin_token(client, db_session)
        payload = [{"name": "gmaps", "requires_api_key": True, "is_available": True}]
        with _mock_proxy(payload):
            resp = client.get(
                "/api/v1/admin/scraper/collectors",
                headers={"Authorization": f"Bearer {token}"},
            )
        assert resp.status_code == 200
        assert resp.json()[0]["name"] == "gmaps"


# ── Place type mappings proxy ──────────────────────────────────────────────────


class TestPlaceTypeMappingsProxy:
    @pytest.fixture(autouse=True)
    def setup(self, client, db_session):
        self.token = _admin_token(client, db_session)
        self.auth = {"Authorization": f"Bearer {self.token}"}
        self.client = client

    def test_list_mappings(self):
        with _mock_proxy([]):
            resp = self.client.get("/api/v1/admin/scraper/place-type-mappings", headers=self.auth)
        assert resp.status_code == 200

    def test_create_mapping(self):
        payload = {"id": 1, "religion": "islam", "gmaps_type": "mosque"}
        with _mock_proxy(payload, status_code=200):
            resp = self.client.post(
                "/api/v1/admin/scraper/place-type-mappings",
                json={"religion": "islam", "gmaps_type": "mosque", "our_place_type": "mosque"},
                headers=self.auth,
            )
        assert resp.status_code == 200

    def test_update_mapping(self):
        payload = {"id": 1, "is_active": False}
        with _mock_proxy(payload):
            resp = self.client.put(
                "/api/v1/admin/scraper/place-type-mappings/1",
                json={"is_active": False},
                headers=self.auth,
            )
        assert resp.status_code == 200

    def test_delete_mapping(self):
        with _mock_proxy({"status": "deleted"}):
            resp = self.client.delete(
                "/api/v1/admin/scraper/place-type-mappings/1", headers=self.auth
            )
        assert resp.status_code == 200


# ── Quality Metrics proxy ─────────────────────────────────────────────────────


class TestQualityMetricsProxy:
    @pytest.fixture(autouse=True)
    def setup(self, client, db_session):
        self.token = _admin_token(client, db_session)
        self.auth = {"Authorization": f"Bearer {self.token}"}
        self.client = client

    def test_quality_metrics_returns_200(self):
        payload = {
            "score_distribution": [],
            "gate_breakdown": [],
            "near_threshold_counts": [],
            "avg_quality_score": None,
            "median_quality_score": None,
            "description_source_breakdown": [],
            "enrichment_status_breakdown": [],
            "per_run_summary": [],
            "overall_stats": {
                "total_scraped": 0,
                "total_synced": 0,
                "overall_filter_rate_pct": 0.0,
            },
        }
        with _mock_proxy(payload):
            resp = self.client.get("/api/v1/admin/scraper/quality-metrics", headers=self.auth)
        assert resp.status_code == 200
        assert resp.json() == payload

    def test_run_code_param_is_forwarded(self):
        payload = {"overall_stats": {"total_scraped": 5}}
        with _mock_proxy(payload) as mock_cls:
            mock_client = mock_cls.return_value.__aenter__.return_value
            self.client.get(
                "/api/v1/admin/scraper/quality-metrics?run_code=run_abc123",
                headers=self.auth,
            )
            call_kwargs = mock_client.request.call_args
            url = call_kwargs[0][1] if call_kwargs[0] else call_kwargs[1].get("url", "")
            params = call_kwargs[1].get("params", {})
            assert "run_code" in params or "run_code=run_abc123" in url
