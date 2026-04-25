import gzip
import json
import os
import sys
import tempfile
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from scripts.handoff import (
    _import_bundle_into_db,
    _recent_log_has_errors,
    _refresh_finalize_bundle,
    _start_screen_runner,
    _terminate_local_runner_process_tree,
    finalize_bg,
    monitor_handoffs,
    pause_local,
    resume_bg,
)
from sqlmodel import Session, create_engine, select

from app.db.models import (
    DataLocation,
    GeoBoundary,
    RawCollectorData,
    ScrapedPlace,
    ScraperRun,
)
from app.services.handoff import (
    build_run_bundle,
    mark_handoff_exported,
    prepare_handoff_export,
    read_bundle_file,
    write_bundle_file,
)


def _seed_location(db_session, location_code: str = "loc_handoff") -> DataLocation:
    boundary = GeoBoundary(
        name="India",
        boundary_type="country",
        lat_min=8.0,
        lat_max=37.0,
        lng_min=68.0,
        lng_max=97.0,
    )
    db_session.add(boundary)
    loc = DataLocation(
        code=location_code,
        name="India",
        source_type="gmaps",
        config={"country": "India", "max_results": 1000},
    )
    db_session.add(loc)
    db_session.commit()
    return loc


def _seed_run(
    db_session, status: str = "running", stage: str | None = "detail_fetch"
) -> ScraperRun:
    loc = _seed_location(db_session)
    run = ScraperRun(
        run_code="run_handoff_1",
        location_code=loc.code,
        status=status,
        stage=stage,
        cloud_run_execution="projects/proj/locations/us-central1/jobs/scraper/executions/e1",
    )
    db_session.add(run)
    db_session.commit()
    db_session.refresh(run)
    return run


def _bundle_upload(bundle: dict) -> tuple[str, bytes]:
    payload = json.dumps(bundle, ensure_ascii=True, sort_keys=True).encode("utf-8")
    with tempfile.NamedTemporaryFile(delete=False, suffix=".json.gz") as fh:
        with gzip.GzipFile(fileobj=fh, mode="wb") as gz:
            gz.write(payload)
        path = fh.name
    return path, open(path, "rb").read()


def test_export_running_cloud_run_run_creates_exported_handoff_and_blocks_resume(
    client, db_session
):
    run = _seed_run(db_session)

    with (
        patch("app.config.settings") as mock_settings,
        patch("app.jobs.dispatcher.cancel_cloud_run_execution") as mock_cancel,
        patch("app.jobs.dispatcher.is_cloud_run_execution_active", return_value=False),
    ):
        mock_settings.scraper_dispatch = "cloud_run"
        resp = client.post(f"/api/v1/scraper/runs/{run.run_code}/handoff/export")

    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "exported"
    assert data["handoff"]["run_code"] == run.run_code
    mock_cancel.assert_called_once()

    db_session.expire_all()
    saved_run = db_session.exec(
        select(ScraperRun).where(ScraperRun.run_code == run.run_code)
    ).first()
    assert saved_run.status == "interrupted"

    resume_resp = client.post(f"/api/v1/scraper/runs/{run.run_code}/resume")
    assert resume_resp.status_code == 409
    assert "handoff" in resume_resp.json()["detail"].lower()


def test_finalize_is_idempotent(client, db_session):
    run = _seed_run(db_session, status="interrupted", stage=None)
    with Session(db_session.bind) as session:
        handoff = prepare_handoff_export(session, run.run_code, lease_owner="tester")
        bundle = build_run_bundle(session, run.run_code, handoff.handoff_code)
        handoff = mark_handoff_exported(
            session,
            handoff.handoff_code,
            bundle_uri="/tmp/run.json.gz",
            manifest_sha256="placeholder",
        )

    path, payload = _bundle_upload(bundle)
    try:
        with patch("app.api.v1.scraper.sync_run_to_server") as mock_sync:
            resp1 = client.post(
                f"/api/v1/scraper/runs/{run.run_code}/handoff/finalize",
                params={"handoff_code": handoff.handoff_code},
                content=payload,
                headers={"Content-Type": "application/gzip"},
            )
            resp2 = client.post(
                f"/api/v1/scraper/runs/{run.run_code}/handoff/finalize",
                params={"handoff_code": handoff.handoff_code},
                content=payload,
                headers={"Content-Type": "application/gzip"},
            )

        assert resp1.status_code == 200
        assert resp2.status_code == 200
        assert resp1.json()["status"] == "completed"
        assert resp2.json()["status"] == "completed"
        assert mock_sync.call_count == 1
    finally:
        os.unlink(path)


def test_finalize_regenerates_local_surrogate_ids(client, db_session):
    run = _seed_run(db_session, status="interrupted", stage=None)
    other_run = ScraperRun(
        run_code="run_other",
        location_code=run.location_code,
        status="completed",
        stage=None,
    )
    db_session.add(other_run)
    db_session.add(
        ScrapedPlace(
            id=1,
            run_code=other_run.run_code,
            place_code="gplc_other",
            name="Other",
            raw_data={"name": "Other"},
            detail_fetch_status="success",
        )
    )
    db_session.add(
        RawCollectorData(
            id=1,
            run_code=other_run.run_code,
            place_code="gplc_other",
            collector_name="gmaps",
            raw_response={"name": "Other"},
        )
    )
    db_session.commit()

    with Session(db_session.bind) as session:
        handoff = prepare_handoff_export(session, run.run_code, lease_owner="tester")
        place = ScrapedPlace(
            run_code=run.run_code,
            place_code="gplc_local",
            name="Local Place",
            raw_data={"name": "Local Place"},
            detail_fetch_status="success",
        )
        raw = RawCollectorData(
            run_code=run.run_code,
            place_code=place.place_code,
            collector_name="gmaps",
            raw_response={"name": "Local Place"},
        )
        session.add(place)
        session.add(raw)
        session.commit()
        bundle = build_run_bundle(session, run.run_code, handoff.handoff_code)
        bundle["data"]["scraped_places"][0]["id"] = 1
        bundle["data"]["raw_collector_data"][0]["id"] = 1
        handoff = mark_handoff_exported(
            session,
            handoff.handoff_code,
            bundle_uri="/tmp/run.json.gz",
            manifest_sha256="placeholder",
        )

    _, payload = _bundle_upload(bundle)
    with patch("app.api.v1.scraper.sync_run_to_server") as mock_sync:
        resp = client.post(
            f"/api/v1/scraper/runs/{run.run_code}/handoff/finalize",
            params={"handoff_code": handoff.handoff_code},
            content=payload,
            headers={"Content-Type": "application/gzip"},
        )

    assert resp.status_code == 200
    assert mock_sync.call_count == 1
    imported_raw = db_session.exec(
        select(RawCollectorData).where(RawCollectorData.run_code == run.run_code)
    ).first()
    imported_place = db_session.exec(
        select(ScrapedPlace).where(ScrapedPlace.run_code == run.run_code)
    ).first()
    assert imported_raw.id != 1
    assert imported_place.id != 1
    assert imported_raw.place_code == "gplc_local"


def test_resume_local_import_hydrates_datetime_fields_for_sqlite(tmp_path, db_session):
    run = _seed_run(db_session, status="interrupted", stage="detail_fetch")
    with Session(db_session.bind) as session:
        handoff = prepare_handoff_export(session, run.run_code, lease_owner="tester")
        bundle = build_run_bundle(session, run.run_code, handoff.handoff_code)

    local_url = f"sqlite:///{tmp_path / 'handoff.db'}"
    _import_bundle_into_db(bundle, local_url)

    engine = create_engine(local_url)
    with Session(engine) as session:
        imported = session.exec(
            select(ScraperRun).where(ScraperRun.run_code == run.run_code)
        ).first()

    assert imported is not None
    assert isinstance(imported.created_at, datetime)
    assert imported.stage == "detail_fetch"


def test_refresh_finalize_bundle_exports_current_local_db_state(tmp_path, db_session):
    run = _seed_run(db_session, status="interrupted", stage="detail_fetch")
    with Session(db_session.bind) as session:
        handoff = prepare_handoff_export(session, run.run_code, lease_owner="tester")
        bundle = build_run_bundle(session, run.run_code, handoff.handoff_code)

    source_bundle = tmp_path / "source.json.gz"
    write_bundle_file(bundle, source_bundle)
    local_url = f"sqlite:///{tmp_path / 'handoff.db'}"
    _import_bundle_into_db(bundle, local_url)

    local_engine = create_engine(local_url)
    with Session(local_engine) as session:
        imported = session.exec(
            select(ScraperRun).where(ScraperRun.run_code == run.run_code)
        ).first()
        imported.status = "completed"
        imported.stage = None
        imported.processed_items = 42
        session.add(imported)
        session.commit()

    finalize_bundle = _refresh_finalize_bundle(
        source_bundle=source_bundle,
        local_database_url=local_url,
        output=tmp_path / "finalize.json.gz",
    )
    refreshed = read_bundle_file(finalize_bundle)
    refreshed_run = refreshed["data"]["scraper_runs"][0]

    assert refreshed_run["status"] == "completed"
    assert refreshed_run["stage"] is None
    assert refreshed_run["processed_items"] == 42


def test_screen_runner_uses_run_scoped_db_and_log(tmp_path):
    calls = []

    def fake_run(cmd, **kwargs):
        calls.append((cmd, kwargs))

        class Result:
            stdout = ""

        return Result()

    with (
        patch("scripts.handoff.shutil.which", return_value="/usr/bin/screen"),
        patch("scripts.handoff._screen_session_exists", return_value=False),
        patch("scripts.handoff.subprocess.run", side_effect=fake_run),
    ):
        _start_screen_runner(
            screen_name="soulstep-run_test",
            database_url=f"sqlite:///{tmp_path / 'run_test.db'}",
            run_code="run_test",
            run_action="resume",
            log_path=tmp_path / "run_test.log",
            env_overrides={"SCRAPER_DETAIL_CONCURRENCY": "15"},
        )

    assert calls
    cmd = calls[0][0]
    assert cmd[:3] == ["screen", "-dmS", "soulstep-run_test"]
    shell_command = cmd[-1]
    assert "DATABASE_URL=" in shell_command
    assert "SCRAPER_RUN_CODE=run_test" in shell_command
    assert "SCRAPER_AUTO_SYNC_AFTER_RUN=false" in shell_command
    assert "SCRAPER_DETAIL_CONCURRENCY=15" in shell_command
    assert "run_test.log" in shell_command


def test_finalize_bg_starts_catalog_sync_screen_with_local_log(tmp_path):
    bundle_path = tmp_path / "run_test-hof_test.json.gz"
    write_bundle_file(
        {"manifest": {"run_code": "run_test", "handoff_code": "hof_test"}, "data": {}},
        bundle_path,
    )
    calls = []

    with patch("scripts.handoff._start_screen_command", side_effect=lambda **kw: calls.append(kw)):
        result = finalize_bg(
            SimpleNamespace(
                bundle=str(bundle_path),
                prod_url="https://scraper-api.soul-step.org",
                work_dir=str(tmp_path),
                local_database_url=None,
                screen_name=None,
                poll_interval_seconds=15,
                timeout_seconds=900,
            )
        )

    assert result == 0
    assert calls
    assert calls[0]["screen_name"] == "soulstep-sync-run_test"
    command = calls[0]["command"]
    assert "finalize-watch" in command
    assert "run_test.catalog-sync.log" in command
    assert "run_test-hof_test-finalize.json.gz" in command
    assert "sqlite:///" in command


def test_monitor_starts_finalize_bg_for_ready_run(tmp_path, db_session):
    run = _seed_run(db_session, status="interrupted", stage="detail_fetch")
    with Session(db_session.bind) as session:
        handoff = prepare_handoff_export(session, run.run_code, lease_owner="tester")
        bundle = build_run_bundle(session, run.run_code, handoff.handoff_code)

    bundle_path = tmp_path / f"{run.run_code}-{handoff.handoff_code}.json.gz"
    write_bundle_file(bundle, bundle_path)
    local_url = f"sqlite:///{tmp_path / f'{run.run_code}.db'}"
    _import_bundle_into_db(bundle, local_url)
    local_engine = create_engine(local_url)
    with Session(local_engine) as session:
        imported = session.exec(
            select(ScraperRun).where(ScraperRun.run_code == run.run_code)
        ).first()
        imported.status = "completed"
        imported.stage = None
        session.add(imported)
        session.commit()

    calls = []
    with (
        patch("scripts.handoff._screen_session_exists", return_value=False),
        patch("scripts.handoff._start_screen_command", side_effect=lambda **kw: calls.append(kw)),
    ):
        result = monitor_handoffs(
            SimpleNamespace(
                run_code=[run.run_code],
                prod_url="https://scraper-api.soul-step.org",
                work_dir=str(tmp_path),
                run_screen_prefix="soulstep-",
                sync_screen_prefix="soulstep-sync-",
                poll_interval_seconds=15,
                timeout_seconds=900,
            )
        )

    assert result == 0
    assert calls
    assert calls[0]["screen_name"] == f"soulstep-sync-{run.run_code}"
    assert "finalize-watch" in calls[0]["command"]


def test_resume_bg_starts_existing_local_db_with_tuning_overrides(tmp_path, db_session):
    run = _seed_run(db_session, status="interrupted", stage="detail_fetch")
    with Session(db_session.bind) as session:
        handoff = prepare_handoff_export(session, run.run_code, lease_owner="tester")
        bundle = build_run_bundle(session, run.run_code, handoff.handoff_code)

    local_url = f"sqlite:///{tmp_path / f'{run.run_code}.db'}"
    _import_bundle_into_db(bundle, local_url)
    calls = []

    with (
        patch("scripts.handoff.shutil.which", return_value="/usr/bin/screen"),
        patch("scripts.handoff._screen_session_exists", return_value=False),
        patch("scripts.handoff._start_screen_command", side_effect=lambda **kw: calls.append(kw)),
    ):
        result = resume_bg(
            SimpleNamespace(
                run_code=run.run_code,
                work_dir=str(tmp_path),
                local_database_url=None,
                screen_name=None,
                log_path=None,
                log_level="INFO",
                detail_concurrency=3,
                browser_pool_size=3,
                browser_concurrency=3,
                image_concurrency=20,
                max_reviews=2,
                max_review_images=0,
                max_photos=2,
            )
        )

    assert result == 0
    command = calls[0]["command"]
    assert f"SCRAPER_RUN_CODE={run.run_code}" in command
    assert "SCRAPER_RUN_ACTION=resume" in command
    assert "SCRAPER_DETAIL_CONCURRENCY=3" in command
    assert "SCRAPER_MAX_REVIEW_IMAGES=0" in command


def test_pause_local_marks_run_cancelled_and_waits_for_screen_exit(tmp_path, db_session):
    run = _seed_run(db_session, status="running", stage="detail_fetch")
    with Session(db_session.bind) as session:
        handoff = prepare_handoff_export(session, run.run_code, lease_owner="tester")
        bundle = build_run_bundle(session, run.run_code, handoff.handoff_code)

    local_url = f"sqlite:///{tmp_path / f'{run.run_code}.db'}"
    _import_bundle_into_db(bundle, local_url)

    with patch("scripts.handoff._screen_session_exists", return_value=False):
        result = pause_local(
            SimpleNamespace(
                run_code=run.run_code,
                work_dir=str(tmp_path),
                local_database_url=None,
                screen_name=None,
                wait_seconds=0,
                force=False,
            )
        )

    assert result == 0
    engine = create_engine(local_url)
    with Session(engine) as session:
        paused = session.exec(select(ScraperRun).where(ScraperRun.run_code == run.run_code)).first()

    assert paused.status == "cancelled"
    assert "paused" in paused.error_message


def test_pause_local_force_terminates_stale_runner_tree(tmp_path, db_session):
    run = _seed_run(db_session, status="running", stage="detail_fetch")
    with Session(db_session.bind) as session:
        handoff = prepare_handoff_export(session, run.run_code, lease_owner="tester")
        bundle = build_run_bundle(session, run.run_code, handoff.handoff_code)

    local_url = f"sqlite:///{tmp_path / f'{run.run_code}.db'}"
    _import_bundle_into_db(bundle, local_url)
    calls = []
    exists_calls = iter([True, True, False])

    with (
        patch(
            "scripts.handoff._screen_session_exists", side_effect=lambda _name: next(exists_calls)
        ),
        patch(
            "scripts.handoff._screen_quit", side_effect=lambda name: calls.append(("quit", name))
        ),
        patch(
            "scripts.handoff._terminate_local_runner_process_tree",
            side_effect=lambda **kwargs: calls.append(("terminate", kwargs)) or 3,
        ),
    ):
        result = pause_local(
            SimpleNamespace(
                run_code=run.run_code,
                work_dir=str(tmp_path),
                local_database_url=None,
                screen_name=None,
                wait_seconds=0,
                force=True,
            )
        )

    assert result == 0
    assert calls[0] == ("quit", f"soulstep-{run.run_code}")
    assert calls[1][0] == "terminate"
    assert calls[1][1]["run_code"] == run.run_code


def test_terminate_local_runner_process_tree_targets_only_matching_run(tmp_path):
    run_code = "run_proc_test"
    db_url = f"sqlite:///{tmp_path / f'{run_code}.db'}"
    log_path = tmp_path / f"{run_code}.log"
    ps_output = f"""
100 1 SCREEN -dmS soulstep-{run_code} zsh -lc env DATABASE_URL={db_url} SCRAPER_RUN_CODE={run_code}
101 100 login -pflq hussainabbasi /bin/zsh -lc env DATABASE_URL={db_url} SCRAPER_RUN_CODE={run_code}
102 101 /path/python -m app.jobs.run
103 102 /path/playwright/node
104 103 /path/chrome-headless-shell
200 1 SCREEN -dmS soulstep-other zsh -lc env DATABASE_URL=sqlite:///{tmp_path / 'other.db'} SCRAPER_RUN_CODE=run_other
201 200 /path/python -m app.jobs.run
"""
    killed = []

    with (
        patch("scripts.handoff.os.getpid", return_value=9999),
        patch("scripts.handoff.os.getppid", return_value=9998),
        patch("scripts.handoff.subprocess.check_output", return_value=ps_output),
        patch("scripts.handoff.time.sleep", return_value=None),
        patch("scripts.handoff.os.kill", side_effect=lambda pid, sig: killed.append((pid, sig))),
    ):
        count = _terminate_local_runner_process_tree(
            run_code=run_code,
            database_url=db_url,
            log_path=log_path,
            grace_seconds=0,
        )

    killed_pids = {pid for pid, _sig in killed}
    assert {100, 101, 102, 103, 104}.issubset(killed_pids)
    assert 200 not in killed_pids
    assert 201 not in killed_pids
    assert count == 5


def test_recent_log_errors_ignore_failures_before_latest_start(tmp_path):
    log_path = tmp_path / "run_test.log"
    log_path.write_text(
        "\n".join(
            [
                '{"message":"Resume of run run_test failed: old duplicate"}',
                '{"message":"Cloud Run Job starting: run_code=run_test action=resume"}',
                '{"message":"Browser detail fetch completed"}',
            ]
        )
    )

    assert _recent_log_has_errors(log_path) is False

    log_path.write_text(
        "\n".join(
            [
                '{"message":"Cloud Run Job starting: run_code=run_test action=resume"}',
                '{"message":"Resume of run run_test failed: new duplicate"}',
            ]
        )
    )

    assert _recent_log_has_errors(log_path) is True


def test_batch_export_returns_independent_handoffs(client, db_session):
    loc = _seed_location(db_session, "loc_batch")
    run1 = ScraperRun(
        run_code="run_batch_1", location_code=loc.code, status="failed", stage="detail_fetch"
    )
    run2 = ScraperRun(
        run_code="run_batch_2", location_code=loc.code, status="interrupted", stage="enrichment"
    )
    db_session.add(run1)
    db_session.add(run2)
    db_session.commit()

    with patch("app.config.settings") as mock_settings:
        mock_settings.scraper_dispatch = "local"
        resp = client.post(
            "/api/v1/scraper/runs/handoff/export-batch",
            json={"location_code": loc.code, "statuses": ["failed", "interrupted"]},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert set(data["run_codes"]) == {"run_batch_1", "run_batch_2"}
    assert len(data["handoffs"]) == 2
    assert {item["run_code"] for item in data["handoffs"]} == {"run_batch_1", "run_batch_2"}
