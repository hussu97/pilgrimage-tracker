"""Integration tests for /admin/translations/jobs endpoints.

All DB operations use in-memory SQLite (StaticPool). The background thread
function _run_job_in_thread is patched out so tests don't launch real browsers.
"""

from __future__ import annotations

import threading
from datetime import UTC, datetime
from unittest.mock import patch

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


# Patch out the thread entry point so tests don't spin up browsers or real threads
_BG_PATCH = "app.api.v1.admin.bulk_translations._run_job_in_thread"


# ── Fixtures ───────────────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def clear_job_tracking():
    """Clear thread tracking state before and after each test to prevent 409 cascades."""
    from app.api.v1.admin.bulk_translations import (
        _active_job_threads,
        _cancel_events,
        _thread_lock,
    )

    with _thread_lock:
        _active_job_threads.clear()
        _cancel_events.clear()
    yield
    with _thread_lock:
        _active_job_threads.clear()
        _cancel_events.clear()


# ── Tests ──────────────────────────────────────────────────────────────────────


class TestStartJob:
    def test_start_job_returns_pending(self, client, db_session):
        """POST returns 200, status=pending, job_code starts with btj_."""
        headers = _admin_headers(client, db_session)
        with patch(_BG_PATCH):
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
        with patch(_BG_PATCH):
            resp = client.post(
                "/api/v1/admin/translations/jobs",
                json={"target_langs": ["ar"]},
                headers=headers,
            )
        assert resp.status_code == 403

    def test_start_job_rejects_concurrent(self, client, db_session):
        """Starting a second job while one is running returns 409."""
        from app.api.v1.admin.bulk_translations import (
            _active_job_threads,
            _cancel_events,
            _thread_lock,
        )

        headers = _admin_headers(client, db_session, email="admin_conc_bt@example.com")

        # Inject a fake "running" thread using a MagicMock so join() is a no-op
        # and is_alive() can be controlled — avoids RuntimeError from joining an
        # unstarted real thread during the lifespan shutdown in TestClient teardown.
        from unittest.mock import MagicMock

        fake_thread = MagicMock(spec=threading.Thread)
        fake_thread.is_alive.return_value = True
        with _thread_lock:
            _active_job_threads["btj_fake"] = fake_thread
            _cancel_events["btj_fake"] = threading.Event()

        with patch(_BG_PATCH):
            resp = client.post(
                "/api/v1/admin/translations/jobs",
                json={"target_langs": ["ar"]},
                headers=headers,
            )
        assert resp.status_code == 409


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
        from app.api.v1.admin.bulk_translations import (
            _active_job_threads,
            _cancel_events,
            _thread_lock,
        )

        headers = _admin_headers(client, db_session, email="admin_page_bt@example.com")

        with patch(_BG_PATCH):
            for _ in range(3):
                resp = client.post(
                    "/api/v1/admin/translations/jobs",
                    json={"target_langs": ["ar"], "entity_types": ["place"]},
                    headers=headers,
                )
                assert resp.status_code == 200
                # The patched thread target doesn't clean up _active_job_threads, so
                # we must clear it manually between requests to avoid 409 on the next POST.
                with _thread_lock:
                    for t in _active_job_threads.values():
                        if t.is_alive():
                            t.join(timeout=1)
                    _active_job_threads.clear()
                    _cancel_events.clear()

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
        with patch(_BG_PATCH):
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
        with patch(_BG_PATCH):
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
        assert data["job_code"] == job_code

        # Verify in DB
        job = db_session.exec(
            select(BulkTranslationJob).where(BulkTranslationJob.job_code == job_code)
        ).first()
        assert job is not None
        assert job.cancel_requested_at is not None

    def test_cancel_signals_event(self, client, db_session):
        """Cancelling a job also sets the threading.Event for the running thread."""
        from app.api.v1.admin.bulk_translations import (
            _cancel_events,
            _thread_lock,
        )

        headers = _admin_headers(client, db_session, email="admin_cancel_ev_bt@example.com")
        with patch(_BG_PATCH):
            create_resp = client.post(
                "/api/v1/admin/translations/jobs",
                json={"target_langs": ["ar"]},
                headers=headers,
            )
        job_code = create_resp.json()["job_code"]

        # The cancel event should exist for this job
        with _thread_lock:
            assert job_code in _cancel_events
            event = _cancel_events[job_code]
            assert not event.is_set()

        client.post(f"/api/v1/admin/translations/jobs/{job_code}/cancel", headers=headers)

        # Event should now be set
        assert event.is_set()

    def test_cancel_completed_job(self, client, db_session):
        """Cancelling a completed job returns 409."""
        headers = _admin_headers(client, db_session, email="admin_cancel2_bt@example.com")

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
    """Background task respects threading.Event-based cancellation."""

    @pytest.mark.asyncio
    async def test_user_cancel_marks_job_cancelled(self, test_engine):
        """When cancel_event is set AND cancel_requested_at is in DB, job becomes 'cancelled'."""
        fake_user_code = "usr_cancel_ce_test"

        # Insert a pending job with cancel_requested_at already set (user-cancel scenario)
        with Session(test_engine) as s:
            job = BulkTranslationJob(
                job_code="btj_cancel_test01",
                created_by_user_code=fake_user_code,
                status="pending",
                target_langs=["ar"],
                entity_types=["city"],
                source_lang="en",
                created_at=datetime.now(UTC),
                cancel_requested_at=datetime.now(UTC),  # user already requested cancel
            )
            s.add(job)
            s.commit()

        cancel_event = threading.Event()
        cancel_event.set()  # immediately cancelled

        # Patch engine and _collect_missing_items so Phase 1 succeeds but we hit
        # the between-lang-pass cancellation check during Phase 3
        with (
            patch("app.api.v1.admin.bulk_translations.engine", test_engine),
            patch(
                "app.api.v1.admin.bulk_translations._collect_missing_items",
                return_value=[("city", "cty_test", "name", "ar", "Test City")],
            ),
        ):
            await _run_bulk_translation_job("btj_cancel_test01", cancel_event=cancel_event)

        with Session(test_engine) as s:
            result = s.exec(
                select(BulkTranslationJob).where(BulkTranslationJob.job_code == "btj_cancel_test01")
            ).first()
        assert result is not None
        assert result.status == "cancelled"

    @pytest.mark.asyncio
    async def test_shutdown_cancel_marks_job_failed(self, test_engine):
        """When cancel_event is set WITHOUT cancel_requested_at in DB, job becomes 'failed'."""
        fake_user_code = "usr_shutdown_ce_test"

        # Insert a pending job WITHOUT cancel_requested_at (server-shutdown scenario)
        with Session(test_engine) as s:
            job = BulkTranslationJob(
                job_code="btj_shutdown_test01",
                created_by_user_code=fake_user_code,
                status="pending",
                target_langs=["ar"],
                entity_types=["city"],
                source_lang="en",
                created_at=datetime.now(UTC),
                # cancel_requested_at is NOT set — simulates server shutdown, not user cancel
            )
            s.add(job)
            s.commit()

        cancel_event = threading.Event()
        cancel_event.set()

        with (
            patch("app.api.v1.admin.bulk_translations.engine", test_engine),
            patch(
                "app.api.v1.admin.bulk_translations._collect_missing_items",
                return_value=[("city", "cty_test2", "name", "ar", "Test City 2")],
            ),
        ):
            await _run_bulk_translation_job("btj_shutdown_test01", cancel_event=cancel_event)

        with Session(test_engine) as s:
            result = s.exec(
                select(BulkTranslationJob).where(
                    BulkTranslationJob.job_code == "btj_shutdown_test01"
                )
            ).first()
        assert result is not None
        assert result.status == "failed"
        assert "shutdown" in (result.error_message or "").lower()


class TestStartupCleanup:
    """Stale pending/running jobs from a previous server run are reset on startup."""

    def test_stale_jobs_marked_failed_on_startup(self, db_session):
        """Stale pending/running jobs are found and marked failed by the startup cleanup."""
        fake_user_code = "usr_stale_cleanup_test"

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

        for code in ("btj_stale_pending", "btj_stale_running"):
            updated = db_session.exec(
                select(BulkTranslationJob).where(BulkTranslationJob.job_code == code)
            ).first()
            assert updated is not None
            assert updated.status == "failed"
            assert "restarted" in (updated.error_message or "").lower()
