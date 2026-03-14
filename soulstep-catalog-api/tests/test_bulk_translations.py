"""Integration tests for /admin/translations/jobs endpoints.

All DB operations use in-memory SQLite (StaticPool). Jobs are inserted
directly into the DB — the background job runner (Cloud Run) is not invoked.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlmodel import select

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


def _insert_job(db_session, job_code: str, status: str = "completed") -> BulkTranslationJob:
    """Insert a BulkTranslationJob row directly."""
    admin_user = db_session.exec(select(User).where(User.is_admin == True)).first()  # noqa: E712
    assert admin_user is not None, "No admin user found — call _admin_headers first"
    job = BulkTranslationJob(
        job_code=job_code,
        created_by_user_code=admin_user.user_code,
        status=status,
        target_langs=["ar", "hi"],
        entity_types=["place"],
        source_lang="en",
        total_items=10,
        completed_items=10 if status == "completed" else 0,
        failed_items=0,
        skipped_items=0,
        created_at=datetime.now(UTC),
    )
    db_session.add(job)
    db_session.commit()
    db_session.refresh(job)
    return job


# ── Tests ──────────────────────────────────────────────────────────────────────


class TestListJobs:
    def test_list_jobs_empty(self, client, db_session):
        """Empty database returns items=[], total=0."""
        headers = _admin_headers(client, db_session, email="admin_list_bt@example.com")
        resp = client.get("/api/v1/admin/translations/jobs", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["items"] == []

    def test_list_jobs_returns_inserted_job(self, client, db_session):
        """A job inserted directly into the DB is returned by the list endpoint."""
        headers = _admin_headers(client, db_session, email="admin_list2_bt@example.com")
        _insert_job(db_session, "btj_list_test1")

        resp = client.get("/api/v1/admin/translations/jobs", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        codes = [item["job_code"] for item in data["items"]]
        assert "btj_list_test1" in codes

    def test_list_jobs_pagination(self, client, db_session):
        """page=2 with page_size=2 returns 1 item when 3 total exist."""
        headers = _admin_headers(client, db_session, email="admin_page_bt@example.com")
        for i in range(3):
            _insert_job(db_session, f"btj_page_test{i}")

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

    def test_list_jobs_requires_admin(self, client, db_session):
        """Non-admin receives 403."""
        data = _register(client, email="user_list_bt@example.com")
        headers = {"Authorization": f"Bearer {data['token']}"}
        resp = client.get("/api/v1/admin/translations/jobs", headers=headers)
        assert resp.status_code == 403


class TestGetJob:
    def test_get_job(self, client, db_session):
        """GET returns 200 with all expected fields including progress_pct."""
        headers = _admin_headers(client, db_session, email="admin_get_bt@example.com")
        _insert_job(db_session, "btj_get_test1")

        resp = client.get("/api/v1/admin/translations/jobs/btj_get_test1", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["job_code"] == "btj_get_test1"
        assert "progress_pct" in data
        assert data["status"] == "completed"

    def test_get_job_not_found(self, client, db_session):
        """GET for non-existent job_code returns 404."""
        headers = _admin_headers(client, db_session, email="admin_404_bt@example.com")
        resp = client.get("/api/v1/admin/translations/jobs/btj_nonexistent", headers=headers)
        assert resp.status_code == 404


class TestDeleteJob:
    def test_delete_completed_job(self, client, db_session):
        """DELETE of a completed job returns 204 and removes it from DB."""
        headers = _admin_headers(client, db_session, email="admin_del_bt@example.com")
        _insert_job(db_session, "btj_del01", status="completed")

        resp = client.delete("/api/v1/admin/translations/jobs/btj_del01", headers=headers)
        assert resp.status_code == 204

        deleted = db_session.exec(
            select(BulkTranslationJob).where(BulkTranslationJob.job_code == "btj_del01")
        ).first()
        assert deleted is None

    def test_delete_running_job(self, client, db_session):
        """DELETE of a running job returns 409."""
        headers = _admin_headers(client, db_session, email="admin_del2_bt@example.com")
        _insert_job(db_session, "btj_running01", status="running")

        resp = client.delete("/api/v1/admin/translations/jobs/btj_running01", headers=headers)
        assert resp.status_code == 409

    def test_delete_not_found(self, client, db_session):
        """DELETE for a non-existent job returns 404."""
        headers = _admin_headers(client, db_session, email="admin_del3_bt@example.com")
        resp = client.delete("/api/v1/admin/translations/jobs/btj_notexist", headers=headers)
        assert resp.status_code == 404
