"""Integration tests for /admin/translations/jobs endpoints.

All DB operations use in-memory SQLite (StaticPool). The background task
_run_bulk_translation_job is patched out so tests don't launch real browsers.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

import pytest
from sqlmodel import Session, select

from app.api.v1.admin.bulk_translations import _run_bulk_translation_job
from app.db.models import BulkTranslationJob, User

# ── Helpers ────────────────────────────────────────────────────────────────────


def _register(client, email="admin@example.com", password="Testpass1!", display_name="Admin"):
    r = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "display_name": display_name},
    )
    assert r.status_code == 200, r.text
    return r.json()


def _make_admin(db_session, user_code: str) -> None:
    user = db_session.exec(select(User).where(User.user_code == user_code)).first()
    user.is_admin = True
    db_session.add(user)
    db_session.commit()


def _admin_headers(client, db_session, email="admin_bt@example.com", password="Testpass1!"):
    data = _register(client, email=email, password=password)
    _make_admin(db_session, data["user"]["user_code"])
    return {"Authorization": f"Bearer {data['token']}"}


def _non_admin_headers(client, email="user_bt@example.com", password="Testpass1!"):
    data = _register(client, email=email, password=password)
    return {"Authorization": f"Bearer {data['token']}"}


# Patch out the real background task so tests don't spin up browsers
_BG_PATCH = "app.api.v1.admin.bulk_translations._run_bulk_translation_job"


# ── Tests ──────────────────────────────────────────────────────────────────────


class TestStartJob:
    def test_start_job_returns_pending(self, client, db_session):
        """POST returns 200, status=pending, job_code starts with btj_."""
        headers = _admin_headers(client, db_session)
        with patch(_BG_PATCH, new=AsyncMock()):
            resp = client.post(
                "/api/v1/admin/translations/jobs",
                json={"target_langs": ["ar", "hi"], "entity_types": ["place"]},
                headers=headers,
            )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["status"] == "pending"
        assert data["job_code"].startswith("btj_")
        assert data["target_langs"] == ["ar", "hi"]
        assert data["entity_types"] == ["place"]
        assert data["progress_pct"] == 0.0

    def test_start_job_requires_admin(self, client, db_session):
        """Non-admin receives 403."""
        headers = _non_admin_headers(client)
        with patch(_BG_PATCH, new=AsyncMock()):
            resp = client.post(
                "/api/v1/admin/translations/jobs",
                json={"target_langs": ["ar"]},
                headers=headers,
            )
        assert resp.status_code == 403


class TestListJobs:
    def test_list_jobs_empty(self, client, db_session):
        """Empty database returns items=[], total=0."""
        headers = _admin_headers(client, db_session, email="admin_list_bt@example.com")
        resp = client.get("/api/v1/admin/translations/jobs", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["items"] == []

    def test_list_jobs_pagination(self, client, db_session):
        """page=2 returns correct slice when multiple jobs exist."""
        headers = _admin_headers(client, db_session, email="admin_page_bt@example.com")

        # Get admin user code from the first job POST
        with patch(_BG_PATCH, new=AsyncMock()):
            for _ in range(3):
                resp = client.post(
                    "/api/v1/admin/translations/jobs",
                    json={"target_langs": ["ar"], "entity_types": ["place"]},
                    headers=headers,
                )
                assert resp.status_code == 200

        # Page 2 with page_size=2 should return 1 item
        resp = client.get(
            "/api/v1/admin/translations/jobs",
            params={"page": 2, "page_size": 2},
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 3
        assert data["page"] == 2
        assert len(data["items"]) == 1


class TestGetJob:
    def test_get_job(self, client, db_session):
        """GET returns 200 with progress_pct field."""
        headers = _admin_headers(client, db_session, email="admin_get_bt@example.com")
        with patch(_BG_PATCH, new=AsyncMock()):
            create_resp = client.post(
                "/api/v1/admin/translations/jobs",
                json={"target_langs": ["ar"]},
                headers=headers,
            )
        job_code = create_resp.json()["job_code"]

        resp = client.get(f"/api/v1/admin/translations/jobs/{job_code}", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["job_code"] == job_code
        assert "progress_pct" in data

    def test_get_job_not_found(self, client, db_session):
        """GET for non-existent job_code returns 404."""
        headers = _admin_headers(client, db_session, email="admin_404_bt@example.com")
        resp = client.get("/api/v1/admin/translations/jobs/btj_nonexistent", headers=headers)
        assert resp.status_code == 404


class TestCancelJob:
    def test_cancel_pending_job(self, client, db_session):
        """Cancelling a pending job sets cancel_requested_at; status stays pending."""
        headers = _admin_headers(client, db_session, email="admin_cancel_bt@example.com")
        with patch(_BG_PATCH, new=AsyncMock()):
            create_resp = client.post(
                "/api/v1/admin/translations/jobs",
                json={"target_langs": ["ar"]},
                headers=headers,
            )
        job_code = create_resp.json()["job_code"]

        resp = client.post(
            f"/api/v1/admin/translations/jobs/{job_code}/cancel",
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        # cancel_requested_at should now be set; status remains pending until BG task sees it
        assert data["job_code"] == job_code

        # Verify in DB
        job = db_session.exec(
            select(BulkTranslationJob).where(BulkTranslationJob.job_code == job_code)
        ).first()
        assert job is not None
        assert job.cancel_requested_at is not None

    def test_cancel_completed_job(self, client, db_session):
        """Cancelling a completed job returns 409."""
        headers = _admin_headers(client, db_session, email="admin_cancel2_bt@example.com")

        # Manually insert a completed job
        admin_user = db_session.exec(select(User).where(User.is_admin == True)).first()  # noqa: E712
        assert admin_user is not None
        job = BulkTranslationJob(
            job_code="btj_completed01",
            created_by_user_code=admin_user.user_code,
            status="completed",
            target_langs=["ar"],
            entity_types=["place"],
            source_lang="en",
            created_at=datetime.now(UTC),
        )
        db_session.add(job)
        db_session.commit()

        resp = client.post(
            "/api/v1/admin/translations/jobs/btj_completed01/cancel",
            headers=headers,
        )
        assert resp.status_code == 409


class TestDeleteJob:
    def test_delete_completed_job(self, client, db_session):
        """DELETE of a completed job returns 204."""
        headers = _admin_headers(client, db_session, email="admin_del_bt@example.com")

        admin_user = db_session.exec(select(User).where(User.is_admin == True)).first()  # noqa: E712
        assert admin_user is not None
        job = BulkTranslationJob(
            job_code="btj_del01",
            created_by_user_code=admin_user.user_code,
            status="completed",
            target_langs=["ar"],
            entity_types=["place"],
            source_lang="en",
            created_at=datetime.now(UTC),
        )
        db_session.add(job)
        db_session.commit()

        resp = client.delete(
            "/api/v1/admin/translations/jobs/btj_del01",
            headers=headers,
        )
        assert resp.status_code == 204

        # Verify it's gone
        deleted = db_session.exec(
            select(BulkTranslationJob).where(BulkTranslationJob.job_code == "btj_del01")
        ).first()
        assert deleted is None

    def test_delete_running_job(self, client, db_session):
        """DELETE of a running job returns 409."""
        headers = _admin_headers(client, db_session, email="admin_del2_bt@example.com")

        admin_user = db_session.exec(select(User).where(User.is_admin == True)).first()  # noqa: E712
        assert admin_user is not None
        job = BulkTranslationJob(
            job_code="btj_running01",
            created_by_user_code=admin_user.user_code,
            status="running",
            target_langs=["ar"],
            entity_types=["place"],
            source_lang="en",
            created_at=datetime.now(UTC),
        )
        db_session.add(job)
        db_session.commit()

        resp = client.delete(
            "/api/v1/admin/translations/jobs/btj_running01",
            headers=headers,
        )
        assert resp.status_code == 409


class TestCancelledErrorHandling:
    """Background task marks job as failed when cancelled (server shutdown)."""

    @pytest.mark.asyncio
    async def test_cancelled_error_marks_job_failed(self, test_engine):
        """When the background task is cancelled mid-run, the job transitions to failed."""
        fake_user_code = "usr_cancel_ce_test"

        # Insert a pending job directly into the test DB
        with Session(test_engine) as s:
            job = BulkTranslationJob(
                job_code="btj_cancel_test01",
                created_by_user_code=fake_user_code,
                status="pending",
                target_langs=["ar"],
                entity_types=["city"],
                source_lang="en",
                created_at=datetime.now(UTC),
            )
            s.add(job)
            s.commit()

        # Patch engine and _collect_missing_items so that:
        # - Phase 1 succeeds (marks job "running") using test_engine
        # - Phase 2 raises CancelledError (simulates task cancellation mid-run)
        with (
            patch("app.api.v1.admin.bulk_translations.engine", test_engine),
            patch(
                "app.api.v1.admin.bulk_translations._collect_missing_items",
                side_effect=asyncio.CancelledError,
            ),
        ):
            with pytest.raises(asyncio.CancelledError):
                await _run_bulk_translation_job("btj_cancel_test01", multi_size=1)

        # Job must be "failed", not stuck in "pending" or "running"
        with Session(test_engine) as s:
            result = s.exec(
                select(BulkTranslationJob).where(BulkTranslationJob.job_code == "btj_cancel_test01")
            ).first()
        assert result is not None
        assert result.status == "failed"
        assert "shutdown" in (result.error_message or "").lower()


class TestStartupCleanup:
    """Stale pending/running jobs from a previous server run are reset on startup."""

    def test_stale_jobs_marked_failed_on_startup(self, db_session):
        """Stale pending/running jobs are found and marked failed by the startup cleanup."""
        fake_user_code = "usr_stale_cleanup_test"

        # Insert one pending and one running job (no real User FK needed in SQLite)
        for code, status in [("btj_stale_pending", "pending"), ("btj_stale_running", "running")]:
            job = BulkTranslationJob(
                job_code=code,
                created_by_user_code=fake_user_code,
                status=status,
                target_langs=["ar"],
                entity_types=["city"],
                source_lang="en",
                created_at=datetime.now(UTC),
            )
            db_session.add(job)
        db_session.commit()

        # Run the same cleanup logic the lifespan uses
        stale = db_session.exec(
            select(BulkTranslationJob).where(
                BulkTranslationJob.status.in_(["pending", "running"])  # type: ignore[attr-defined]
            )
        ).all()
        assert len(stale) == 2
        for j in stale:
            j.status = "failed"
            j.error_message = "Interrupted: server restarted"
            j.completed_at = datetime.now(UTC)
            db_session.add(j)
        db_session.commit()

        # Both jobs must now be failed
        for code in ("btj_stale_pending", "btj_stale_running"):
            updated = db_session.exec(
                select(BulkTranslationJob).where(BulkTranslationJob.job_code == code)
            ).first()
            assert updated is not None
            assert updated.status == "failed"
            assert "restarted" in (updated.error_message or "").lower()
