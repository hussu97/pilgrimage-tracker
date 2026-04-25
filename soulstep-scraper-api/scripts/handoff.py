from __future__ import annotations

import argparse
import json
import os
import shlex
import shutil
import signal
import subprocess
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace

import httpx
from sqlmodel import Session, SQLModel, create_engine, func, select

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.db.models import (  # noqa: E402,I001
    DataLocation,
    DiscoveryCell,
    GeoBoundary,
    GeoBoundaryBox,
    PlaceTypeMapping,
    RawCollectorData,
    RunHandoff,
    ScrapedAsset,
    ScrapedPlace,
    ScraperRun,
)
from app.services.handoff import (  # noqa: E402
    build_run_bundle,
    default_bundle_path,
    hydrate_row,
    mark_handoff_exported,
    prepare_handoff_export,
    read_bundle_file,
    write_bundle_file,
)


MODEL_MAP = {
    "scraper_runs": ScraperRun,
    "discovery_cells": DiscoveryCell,
    "scraped_places": ScrapedPlace,
    "raw_collector_data": RawCollectorData,
    "scraped_assets": ScrapedAsset,
    "run_handoffs": RunHandoff,
    "data_locations": DataLocation,
    "geo_boundaries": GeoBoundary,
    "geo_boundary_boxes": GeoBoundaryBox,
    "place_type_mappings": PlaceTypeMapping,
}

_RECENT_LOG_ERROR_MARKERS = (
    "traceback",
    "resume of run",
    "run failed",
    "failed as interrupted",
    "asset-backlog",
    "asset backlog",
    "asset barrier",
    "timed out after",
    "catalog_sync_failed",
    "catalog_sync_timeout",
)


def _default_work_dir() -> Path:
    return ROOT / "local-handoffs"


def _default_local_database_url(run_code: str, work_dir: Path) -> str:
    return f"sqlite:///{work_dir / f'{run_code}.db'}"


def _sqlite_path_from_url(database_url: str) -> Path | None:
    prefix = "sqlite:///"
    if not database_url.startswith(prefix):
        return None
    return Path(database_url[len(prefix) :])


def _screen_session_exists(screen_name: str) -> bool:
    if not shutil.which("screen"):
        return False
    result = subprocess.run(["screen", "-ls"], capture_output=True, text=True, check=False)
    return f".{screen_name}" in result.stdout


def _screen_quit(screen_name: str) -> None:
    if shutil.which("screen") and _screen_session_exists(screen_name):
        subprocess.run(["screen", "-S", screen_name, "-X", "quit"], check=False)


def _collect_descendant_pids(process_rows: list[tuple[int, int, str]], root_pid: int) -> set[int]:
    children: dict[int, list[int]] = {}
    for pid, ppid, _cmd in process_rows:
        children.setdefault(ppid, []).append(pid)

    found: set[int] = set()
    stack = [root_pid]
    while stack:
        pid = stack.pop()
        if pid in found:
            continue
        found.add(pid)
        stack.extend(children.get(pid, []))
    return found


def _read_process_rows() -> list[tuple[int, int, str]]:
    output = subprocess.check_output(["ps", "-axo", "pid=,ppid=,command="], text=True)
    rows: list[tuple[int, int, str]] = []
    for line in output.splitlines():
        parts = line.strip().split(None, 2)
        if len(parts) < 2:
            continue
        cmd = parts[2] if len(parts) == 3 else ""
        rows.append((int(parts[0]), int(parts[1]), cmd))
    return rows


def _terminate_local_runner_process_tree(
    *,
    run_code: str,
    database_url: str,
    log_path: Path,
    grace_seconds: float = 3.0,
) -> int:
    """Terminate stale local handoff runner/browser children for one run.

    `screen -X quit` can leave the login shell, Python runner, Playwright node
    process, and Chromium children orphaned under PID 1 on macOS. Matching the
    run-scoped DB/log paths lets us clean up only this handoff without touching
    other local runs.
    """

    rows = _read_process_rows()
    own_pids = {os.getpid(), os.getppid()}
    sqlite_path = _sqlite_path_from_url(database_url)
    needle_parts = {
        f"SCRAPER_RUN_CODE={run_code}",
        database_url,
        str(sqlite_path) if sqlite_path else "",
        str(log_path),
    }
    roots = {
        pid
        for pid, _ppid, cmd in rows
        if pid not in own_pids and any(part and part in cmd for part in needle_parts)
    }

    targets: set[int] = set()
    for root in roots:
        targets.update(_collect_descendant_pids(rows, root))
    targets -= own_pids
    if not targets:
        return 0

    command_by_pid = {pid: cmd for pid, _ppid, cmd in rows}
    for pid in sorted(targets):
        try:
            os.kill(pid, signal.SIGTERM)
        except (PermissionError, ProcessLookupError):
            pass

    time.sleep(grace_seconds)
    live_commands = {pid: cmd for pid, _ppid, cmd in _read_process_rows()}
    terminated = 0
    for pid in sorted(targets):
        if pid not in live_commands:
            terminated += 1
            continue
        # Safety check for fast PID reuse after SIGTERM.
        if live_commands[pid] != command_by_pid.get(pid):
            continue
        try:
            os.kill(pid, signal.SIGKILL)
            terminated += 1
        except ProcessLookupError:
            terminated += 1
        except PermissionError:
            pass
    return terminated


def _start_screen_command(*, screen_name: str, command: str) -> None:
    if not shutil.which("screen"):
        raise RuntimeError("screen is required to start a detached local handoff runner")
    if _screen_session_exists(screen_name):
        raise RuntimeError(f"screen session already exists: {screen_name}")
    subprocess.run(["screen", "-dmS", screen_name, "zsh", "-lc", command], check=True)


def _start_local_resume_screen(
    *,
    screen_name: str,
    database_url: str,
    run_code: str,
    log_path: Path,
    env_overrides: dict[str, str],
) -> None:
    _start_screen_runner(
        screen_name=screen_name,
        database_url=database_url,
        run_code=run_code,
        run_action="resume",
        log_path=log_path,
        env_overrides=env_overrides,
    )


def _start_screen_runner(
    *,
    screen_name: str,
    database_url: str,
    run_code: str,
    run_action: str,
    log_path: Path,
    env_overrides: dict[str, str],
) -> None:
    env_pairs = {
        "DATABASE_URL": database_url,
        "SCRAPER_AUTO_SYNC_AFTER_RUN": "false",
        "SCRAPER_RUN_CODE": run_code,
        "SCRAPER_RUN_ACTION": run_action,
        "PYTHONUNBUFFERED": "1",
        **env_overrides,
    }
    env_args = " ".join(f"{key}={shlex.quote(value)}" for key, value in env_pairs.items())
    command = (
        f"cd {shlex.quote(str(ROOT))} && "
        f"env {env_args} {shlex.quote(sys.executable)} -m app.jobs.run "
        f">> {shlex.quote(str(log_path))} 2>&1"
    )
    _start_screen_command(screen_name=screen_name, command=command)


def _log_event(event: str, **fields: object) -> None:
    print(
        json.dumps(
            {"event": event, "ts": datetime.now(UTC).isoformat(), **fields},
            sort_keys=True,
        ),
        flush=True,
    )


def _import_bundle_into_db(bundle: dict, database_url: str) -> None:
    engine = create_engine(database_url, echo=False)
    import app.db.models  # noqa: F401

    SQLModel.metadata.create_all(engine)
    rows = bundle["data"]

    with Session(engine) as session:
        run_code = bundle["manifest"]["run_code"]
        session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code))
        session.exec(ScrapedAsset.__table__.delete().where(ScrapedAsset.run_code == run_code))
        session.exec(
            RawCollectorData.__table__.delete().where(RawCollectorData.run_code == run_code)
        )
        session.exec(ScrapedPlace.__table__.delete().where(ScrapedPlace.run_code == run_code))
        session.exec(DiscoveryCell.__table__.delete().where(DiscoveryCell.run_code == run_code))
        session.exec(RunHandoff.__table__.delete().where(RunHandoff.run_code == run_code))

        for table_name, model in MODEL_MAP.items():
            for row in rows.get(table_name, []):
                session.merge(hydrate_row(model, row))
        session.commit()


def _refresh_finalize_bundle(
    *,
    source_bundle: str | Path,
    local_database_url: str,
    output: str | Path | None = None,
) -> Path:
    source_path = Path(source_bundle)
    manifest = read_bundle_file(source_path)["manifest"]
    run_code = manifest["run_code"]
    handoff_code = manifest["handoff_code"]
    output_path = (
        Path(output)
        if output
        else source_path.with_name(f"{run_code}-{handoff_code}-finalize.json.gz")
    )
    engine = create_engine(local_database_url, echo=False)
    with Session(engine) as session:
        bundle = build_run_bundle(session, run_code, handoff_code)
        write_bundle_file(bundle, output_path)
    return output_path


def _post_finalize_bundle(
    *,
    client: httpx.Client,
    prod_url: str,
    bundle_path: str | Path,
    run_code: str,
    handoff_code: str,
) -> dict:
    with open(bundle_path, "rb") as fh:
        resp = client.post(
            f"{prod_url.rstrip('/')}/api/v1/scraper/runs/{run_code}/handoff/finalize",
            params={"handoff_code": handoff_code},
            content=fh.read(),
            headers={"Content-Type": "application/gzip"},
        )
    resp.raise_for_status()
    return resp.json()


def _fetch_sync_snapshot(client: httpx.Client, prod_url: str, run_code: str) -> dict:
    run_resp = client.get(f"{prod_url.rstrip('/')}/api/v1/scraper/runs/{run_code}")
    run_resp.raise_for_status()
    activity_resp = client.get(f"{prod_url.rstrip('/')}/api/v1/scraper/runs/{run_code}/activity")
    activity_resp.raise_for_status()
    run = run_resp.json()
    activity = activity_resp.json() or {}
    return {
        "status": run.get("status"),
        "stage": run.get("stage"),
        "places_synced": activity.get("places_synced", 0),
        "places_sync_failed": activity.get("places_sync_failed", 0),
        "places_sync_quality_filtered": activity.get("places_sync_quality_filtered", 0),
        "places_sync_name_filtered": activity.get("places_sync_name_filtered", 0),
        "last_sync_at": run.get("last_sync_at"),
        "asset_pending": run.get("asset_pending", activity.get("asset_pending", 0)),
        "asset_failed": run.get("asset_failed", activity.get("asset_failed", 0)),
    }


def _read_recent_log(path: Path, max_bytes: int = 200_000) -> str:
    if not path.exists():
        return ""
    with path.open("rb") as fh:
        if path.stat().st_size > max_bytes:
            fh.seek(-max_bytes, os.SEEK_END)
        return fh.read().decode("utf-8", errors="replace")


def _recent_log_has_errors(path: Path) -> bool:
    recent = _read_recent_log(path).lower()
    start_markers = (
        "cloud run job starting:",
        "resuming run ",
        "starting scraper run ",
    )
    latest_start = max((recent.rfind(marker) for marker in start_markers), default=-1)
    active_segment = recent[latest_start:] if latest_start >= 0 else recent
    return any(marker in active_segment for marker in _RECENT_LOG_ERROR_MARKERS)


def _catalog_sync_completed(path: Path) -> bool:
    return "catalog_sync_completed" in _read_recent_log(path)


def _latest_original_bundle(work_dir: Path, run_code: str) -> Path | None:
    bundles = [
        path
        for path in work_dir.glob(f"{run_code}-hof_*.json.gz")
        if not path.name.endswith("-finalize.json.gz")
    ]
    if not bundles:
        return None
    return max(bundles, key=lambda path: path.stat().st_mtime)


def export_single(args: argparse.Namespace) -> int:
    engine = create_engine(args.prod_dsn, echo=False)
    with Session(engine) as session:
        handoff = prepare_handoff_export(session, args.run_code, lease_owner=args.lease_owner)
        bundle = build_run_bundle(session, args.run_code, handoff.handoff_code)
        output = (
            Path(args.output)
            if args.output
            else default_bundle_path(args.run_code, handoff.handoff_code)
        )
        bundle_uri, digest = write_bundle_file(bundle, output)
        mark_handoff_exported(
            session,
            handoff.handoff_code,
            bundle_uri=bundle_uri,
            manifest_sha256=digest,
        )
        print(bundle_uri)
    return 0


def export_batch(args: argparse.Namespace) -> int:
    engine = create_engine(args.prod_dsn, echo=False)
    status_list = [item.strip() for item in args.statuses.split(",") if item.strip()]
    output_dir = Path(args.output_dir or ".").resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    with Session(engine) as session:
        runs = session.exec(
            select(ScraperRun)
            .where(ScraperRun.location_code == args.location_code)
            .where(ScraperRun.status.in_(status_list))
            .order_by(ScraperRun.created_at.asc())
        ).all()
        manifest = {"location_code": args.location_code, "runs": []}
        for run in runs:
            handoff = prepare_handoff_export(session, run.run_code, lease_owner=args.lease_owner)
            bundle = build_run_bundle(session, run.run_code, handoff.handoff_code)
            bundle_uri, digest = write_bundle_file(
                bundle,
                output_dir / f"{run.run_code}-{handoff.handoff_code}.json.gz",
            )
            mark_handoff_exported(
                session,
                handoff.handoff_code,
                bundle_uri=bundle_uri,
                manifest_sha256=digest,
            )
            manifest["runs"].append(
                {
                    "run_code": run.run_code,
                    "handoff_code": handoff.handoff_code,
                    "bundle_uri": bundle_uri,
                }
            )
        _, _ = write_bundle_file(
            {"manifest": manifest, "data": {}},
            output_dir / f"{args.location_code}-handoff-batch.json.gz",
        )
    return 0


def resume_local(args: argparse.Namespace) -> int:
    bundle = read_bundle_file(args.bundle)
    _import_bundle_into_db(bundle, args.local_database_url)

    run_code = bundle["manifest"]["run_code"]
    run_action = "resume" if bundle["manifest"].get("resume_from_stage") else "run"
    env = os.environ.copy()
    env["DATABASE_URL"] = args.local_database_url
    env["SCRAPER_AUTO_SYNC_AFTER_RUN"] = "false"
    env["SCRAPER_RUN_CODE"] = run_code
    env["SCRAPER_RUN_ACTION"] = run_action
    cmd = [sys.executable, "-m", "app.jobs.run"]
    subprocess.run(cmd, cwd=str(ROOT), env=env, check=True)
    return 0


def start_local_bg(args: argparse.Namespace) -> int:
    work_dir = Path(args.work_dir or _default_work_dir()).resolve()
    work_dir.mkdir(parents=True, exist_ok=True)

    database_url = args.local_database_url or _default_local_database_url(args.run_code, work_dir)
    db_path = _sqlite_path_from_url(database_url)
    if db_path and db_path.exists() and not args.force:
        raise RuntimeError(
            f"Local DB already exists for {args.run_code}: {db_path}. "
            "Use --force to replace it, or resume the existing DB directly."
        )
    if db_path and args.force:
        for suffix in ("", "-journal", "-wal", "-shm"):
            db_path.with_name(db_path.name + suffix).unlink(missing_ok=True)

    engine = create_engine(args.prod_dsn, echo=False)
    with Session(engine) as session:
        handoff = prepare_handoff_export(session, args.run_code, lease_owner=args.lease_owner)
        bundle = build_run_bundle(session, args.run_code, handoff.handoff_code)
        bundle_path = work_dir / f"{args.run_code}-{handoff.handoff_code}.json.gz"
        bundle_uri, digest = write_bundle_file(bundle, bundle_path)
        mark_handoff_exported(
            session,
            handoff.handoff_code,
            bundle_uri=bundle_uri,
            manifest_sha256=digest,
        )

    _import_bundle_into_db(bundle, database_url)

    run_action = "resume" if bundle["manifest"].get("resume_from_stage") else "run"
    log_path = work_dir / f"{args.run_code}.log"
    screen_name = args.screen_name or f"soulstep-{args.run_code}"
    env_overrides = {"LOG_LEVEL": args.log_level}
    optional_env = {
        "SCRAPER_DETAIL_CONCURRENCY": args.detail_concurrency,
        "MAPS_BROWSER_POOL_SIZE": args.browser_pool_size,
        "MAPS_BROWSER_CONCURRENCY": args.browser_concurrency,
        "SCRAPER_IMAGE_CONCURRENCY": args.image_concurrency,
    }
    env_overrides.update(
        {key: str(value) for key, value in optional_env.items() if value is not None}
    )
    _start_screen_runner(
        screen_name=screen_name,
        database_url=database_url,
        run_code=args.run_code,
        run_action=run_action,
        log_path=log_path,
        env_overrides=env_overrides,
    )

    print(
        json.dumps(
            {
                "run_code": args.run_code,
                "handoff_code": bundle["manifest"]["handoff_code"],
                "bundle": str(bundle_path),
                "database_url": database_url,
                "log": str(log_path),
                "screen": screen_name,
                "status": "started",
            },
            indent=2,
            sort_keys=True,
        )
    )
    return 0


def resume_bg(args: argparse.Namespace) -> int:
    work_dir = Path(args.work_dir or _default_work_dir()).resolve()
    work_dir.mkdir(parents=True, exist_ok=True)
    database_url = args.local_database_url or _default_local_database_url(args.run_code, work_dir)
    db_path = _sqlite_path_from_url(database_url)
    if db_path and not db_path.exists():
        raise RuntimeError(f"Local DB does not exist for {args.run_code}: {db_path}")

    log_path = Path(args.log_path) if args.log_path else work_dir / f"{args.run_code}.log"
    screen_name = args.screen_name or f"soulstep-{args.run_code}"
    env_overrides = {"LOG_LEVEL": args.log_level}
    optional_env = {
        "SCRAPER_DETAIL_CONCURRENCY": args.detail_concurrency,
        "MAPS_BROWSER_POOL_SIZE": args.browser_pool_size,
        "MAPS_BROWSER_CONCURRENCY": args.browser_concurrency,
        "SCRAPER_IMAGE_CONCURRENCY": args.image_concurrency,
        "SCRAPER_MAX_REVIEWS": args.max_reviews,
        "SCRAPER_MAX_REVIEW_IMAGES": args.max_review_images,
        "SCRAPER_MAX_PHOTOS": args.max_photos,
    }
    env_overrides.update(
        {key: str(value) for key, value in optional_env.items() if value is not None}
    )
    _start_local_resume_screen(
        screen_name=screen_name,
        database_url=database_url,
        run_code=args.run_code,
        log_path=log_path,
        env_overrides=env_overrides,
    )
    print(
        json.dumps(
            {
                "run_code": args.run_code,
                "database_url": database_url,
                "log": str(log_path),
                "screen": screen_name,
                "status": "started",
            },
            indent=2,
            sort_keys=True,
        )
    )
    return 0


def pause_local(args: argparse.Namespace) -> int:
    work_dir = Path(args.work_dir or _default_work_dir()).resolve()
    database_url = args.local_database_url or _default_local_database_url(args.run_code, work_dir)
    log_path = work_dir / f"{args.run_code}.log"
    db_path = _sqlite_path_from_url(database_url)
    if db_path and not db_path.exists():
        raise RuntimeError(f"Local DB does not exist for {args.run_code}: {db_path}")

    engine = create_engine(database_url, echo=False)
    with Session(engine) as session:
        run = session.exec(select(ScraperRun).where(ScraperRun.run_code == args.run_code)).first()
        if not run:
            raise RuntimeError(f"Run not found in local DB: {args.run_code}")
        run.status = "cancelled"
        run.error_message = "Local handoff paused by operator; resume with handoff resume-bg"
        session.add(run)
        session.commit()

    screen_name = args.screen_name or f"soulstep-{args.run_code}"
    deadline = time.monotonic() + args.wait_seconds
    while _screen_session_exists(screen_name) and time.monotonic() < deadline:
        time.sleep(2)
    terminated_processes = 0
    if _screen_session_exists(screen_name):
        if args.force:
            _screen_quit(screen_name)
            terminated_processes = _terminate_local_runner_process_tree(
                run_code=args.run_code,
                database_url=database_url,
                log_path=log_path,
            )
        else:
            raise RuntimeError(
                f"Run {args.run_code} was marked cancelled, but screen {screen_name} "
                f"is still alive after {args.wait_seconds}s. Re-run with --force to close it."
            )
    elif args.force:
        terminated_processes = _terminate_local_runner_process_tree(
            run_code=args.run_code,
            database_url=database_url,
            log_path=log_path,
            grace_seconds=0.5,
        )

    print(
        json.dumps(
            {
                "run_code": args.run_code,
                "database_url": database_url,
                "screen": screen_name,
                "status": "paused",
                "terminated_processes": terminated_processes,
            },
            indent=2,
            sort_keys=True,
        )
    )
    return 0


def finalize_remote(args: argparse.Namespace) -> int:
    bundle_path = (
        _refresh_finalize_bundle(
            source_bundle=args.bundle,
            local_database_url=args.local_database_url,
            output=args.finalize_bundle_output,
        )
        if getattr(args, "local_database_url", None)
        else Path(args.bundle)
    )
    bundle = read_bundle_file(bundle_path)
    handoff_code = bundle["manifest"]["handoff_code"]
    run_code = bundle["manifest"]["run_code"]
    with httpx.Client(timeout=120.0) as client:
        result = _post_finalize_bundle(
            client=client,
            prod_url=args.prod_url,
            bundle_path=bundle_path,
            run_code=run_code,
            handoff_code=handoff_code,
        )
    print(json.dumps(result, sort_keys=True))
    return 0


def finalize_watch(args: argparse.Namespace) -> int:
    bundle_path = Path(args.bundle)
    if args.local_database_url:
        bundle_path = _refresh_finalize_bundle(
            source_bundle=bundle_path,
            local_database_url=args.local_database_url,
            output=args.finalize_bundle_output,
        )

    bundle = read_bundle_file(bundle_path)
    run_code = bundle["manifest"]["run_code"]
    handoff_code = bundle["manifest"]["handoff_code"]
    deadline = time.monotonic() + args.timeout_seconds

    _log_event(
        "catalog_sync_finalize_started",
        run_code=run_code,
        handoff_code=handoff_code,
        bundle=str(bundle_path),
    )
    with httpx.Client(timeout=args.request_timeout) as client:
        result = _post_finalize_bundle(
            client=client,
            prod_url=args.prod_url,
            bundle_path=bundle_path,
            run_code=run_code,
            handoff_code=handoff_code,
        )
        _log_event("catalog_sync_finalize_response", run_code=run_code, response=result)

        if not result.get("triggered_sync"):
            _log_event(
                "catalog_sync_not_triggered",
                run_code=run_code,
                reason="finalize endpoint returned triggered_sync=false",
            )
            return 0

        saw_syncing = False
        while time.monotonic() < deadline:
            snapshot = _fetch_sync_snapshot(client, args.prod_url, run_code)
            _log_event("catalog_sync_poll", run_code=run_code, **snapshot)
            saw_syncing = saw_syncing or snapshot.get("stage") == "syncing"
            has_sync_result = bool(
                snapshot.get("last_sync_at")
                or int(snapshot.get("places_synced") or 0)
                or int(snapshot.get("places_sync_failed") or 0)
                or int(snapshot.get("places_sync_quality_filtered") or 0)
                or int(snapshot.get("places_sync_name_filtered") or 0)
            )

            if snapshot.get("stage") != "syncing" and (saw_syncing or has_sync_result):
                failures = int(snapshot.get("places_sync_failed") or 0)
                event = "catalog_sync_completed" if failures == 0 else "catalog_sync_failed"
                _log_event(event, run_code=run_code, **snapshot)
                return 0 if failures == 0 else 2

            time.sleep(args.poll_interval_seconds)

    _log_event("catalog_sync_timeout", run_code=run_code, timeout_seconds=args.timeout_seconds)
    return 3


def finalize_bg(args: argparse.Namespace) -> int:
    work_dir = Path(args.work_dir or _default_work_dir()).resolve()
    work_dir.mkdir(parents=True, exist_ok=True)
    bundle = read_bundle_file(args.bundle)
    run_code = bundle["manifest"]["run_code"]
    handoff_code = bundle["manifest"]["handoff_code"]
    database_url = args.local_database_url or _default_local_database_url(run_code, work_dir)
    finalize_bundle = work_dir / f"{run_code}-{handoff_code}-finalize.json.gz"
    log_path = work_dir / f"{run_code}.catalog-sync.log"
    screen_name = args.screen_name or f"soulstep-sync-{run_code}"
    command = " ".join(
        [
            f"cd {shlex.quote(str(ROOT))} &&",
            shlex.quote(sys.executable),
            shlex.quote(str(ROOT / "scripts" / "handoff.py")),
            "finalize-watch",
            "--bundle",
            shlex.quote(str(Path(args.bundle).resolve())),
            "--prod-url",
            shlex.quote(args.prod_url),
            "--local-database-url",
            shlex.quote(database_url),
            "--finalize-bundle-output",
            shlex.quote(str(finalize_bundle)),
            "--poll-interval-seconds",
            shlex.quote(str(args.poll_interval_seconds)),
            "--timeout-seconds",
            shlex.quote(str(args.timeout_seconds)),
            ">>",
            shlex.quote(str(log_path)),
            "2>&1",
        ]
    )
    _start_screen_command(screen_name=screen_name, command=command)
    print(
        json.dumps(
            {
                "run_code": run_code,
                "handoff_code": handoff_code,
                "database_url": database_url,
                "finalize_bundle": str(finalize_bundle),
                "log": str(log_path),
                "screen": screen_name,
                "status": "started",
            },
            indent=2,
            sort_keys=True,
        )
    )
    return 0


def monitor_handoffs(args: argparse.Namespace) -> int:
    work_dir = Path(args.work_dir or _default_work_dir()).resolve()
    summaries: list[dict[str, object]] = []
    for run_code in args.run_code:
        db_path = work_dir / f"{run_code}.db"
        run_log = work_dir / f"{run_code}.log"
        sync_log = work_dir / f"{run_code}.catalog-sync.log"
        run_screen = args.run_screen_prefix + run_code
        sync_screen = args.sync_screen_prefix + run_code
        summary: dict[str, object] = {
            "run_code": run_code,
            "database": str(db_path),
            "run_log": str(run_log),
            "catalog_sync_log": str(sync_log),
            "run_screen_alive": _screen_session_exists(run_screen),
            "sync_screen_alive": _screen_session_exists(sync_screen),
            "action": "none",
        }
        if not db_path.exists():
            summary["error"] = "local_db_missing"
            summaries.append(summary)
            continue

        database_url = _default_local_database_url(run_code, work_dir)
        engine = create_engine(database_url, echo=False)
        with Session(engine) as session:
            run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
            asset_counts = dict(
                session.exec(
                    select(ScrapedAsset.status, func.count())
                    .where(ScrapedAsset.run_code == run_code)
                    .group_by(ScrapedAsset.status)
                ).all()
            )

        if not run:
            summary["error"] = "run_missing"
            summaries.append(summary)
            continue

        pending_assets = int(asset_counts.get("pending_upload", 0) or 0)
        failed_assets = int(asset_counts.get("failed", 0) or 0)
        local_log_has_errors = _recent_log_has_errors(run_log)
        sync_completed = _catalog_sync_completed(sync_log)
        ready = (
            run.status == "completed"
            and run.stage is None
            and pending_assets == 0
            and failed_assets == 0
            and not local_log_has_errors
        )
        summary.update(
            {
                "status": run.status,
                "stage": run.stage,
                "processed_items": run.processed_items,
                "total_items": run.total_items,
                "asset_pending": pending_assets,
                "asset_uploaded": int(asset_counts.get("uploaded", 0) or 0),
                "asset_failed": failed_assets,
                "ready_to_finalize": ready,
                "local_log_has_errors": local_log_has_errors,
                "catalog_sync_completed": sync_completed,
            }
        )

        if ready and not summary["sync_screen_alive"] and not sync_completed:
            bundle = _latest_original_bundle(work_dir, run_code)
            if bundle is None:
                summary["error"] = "original_bundle_missing"
            else:
                finalize_bg(
                    SimpleNamespace(
                        bundle=str(bundle),
                        prod_url=args.prod_url,
                        work_dir=str(work_dir),
                        local_database_url=database_url,
                        screen_name=sync_screen,
                        poll_interval_seconds=args.poll_interval_seconds,
                        timeout_seconds=args.timeout_seconds,
                    )
                )
                summary["action"] = "started_finalize_bg"
                summary["bundle"] = str(bundle)

        summaries.append(summary)

    print(json.dumps({"runs": summaries}, indent=2, sort_keys=True))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Portable run handoff utilities")
    sub = parser.add_subparsers(dest="command", required=True)

    export_parser = sub.add_parser("export", help="Export a single run handoff bundle")
    export_parser.add_argument("--run-code", required=True)
    export_parser.add_argument("--prod-dsn", required=True)
    export_parser.add_argument("--ssh-tunnel", default=None)
    export_parser.add_argument("--lease-owner", default=None)
    export_parser.add_argument("--output", default=None)
    export_parser.set_defaults(func=export_single)

    batch_parser = sub.add_parser("export-batch", help="Export a batch of run handoff bundles")
    batch_parser.add_argument("--location-code", required=True)
    batch_parser.add_argument("--prod-dsn", required=True)
    batch_parser.add_argument("--statuses", default="interrupted,failed")
    batch_parser.add_argument("--lease-owner", default=None)
    batch_parser.add_argument("--output-dir", default=None)
    batch_parser.set_defaults(func=export_batch)

    resume_parser = sub.add_parser(
        "resume-local", help="Import a bundle into a local DB and resume it"
    )
    resume_parser.add_argument("--bundle", required=True)
    resume_parser.add_argument("--local-database-url", required=True)
    resume_parser.set_defaults(func=resume_local)

    bg_parser = sub.add_parser(
        "start-local-bg",
        help="Export a run, import it into a local DB, and resume it in detached screen",
    )
    bg_parser.add_argument("--run-code", required=True)
    bg_parser.add_argument("--prod-dsn", required=True)
    bg_parser.add_argument("--lease-owner", default=None)
    bg_parser.add_argument("--work-dir", default=None)
    bg_parser.add_argument("--local-database-url", default=None)
    bg_parser.add_argument("--screen-name", default=None)
    bg_parser.add_argument("--force", action="store_true")
    bg_parser.add_argument("--log-level", default="INFO")
    bg_parser.add_argument("--detail-concurrency", type=int, default=None)
    bg_parser.add_argument("--browser-pool-size", type=int, default=None)
    bg_parser.add_argument("--browser-concurrency", type=int, default=None)
    bg_parser.add_argument("--image-concurrency", type=int, default=None)
    bg_parser.set_defaults(func=start_local_bg)

    resume_bg_parser = sub.add_parser(
        "resume-bg",
        help="Resume an existing local handoff DB in a detached screen session",
    )
    resume_bg_parser.add_argument("--run-code", required=True)
    resume_bg_parser.add_argument("--work-dir", default=None)
    resume_bg_parser.add_argument("--local-database-url", default=None)
    resume_bg_parser.add_argument("--screen-name", default=None)
    resume_bg_parser.add_argument("--log-path", default=None)
    resume_bg_parser.add_argument("--log-level", default="INFO")
    resume_bg_parser.add_argument("--detail-concurrency", type=int, default=None)
    resume_bg_parser.add_argument("--browser-pool-size", type=int, default=None)
    resume_bg_parser.add_argument("--browser-concurrency", type=int, default=None)
    resume_bg_parser.add_argument("--image-concurrency", type=int, default=None)
    resume_bg_parser.add_argument("--max-reviews", type=int, default=None)
    resume_bg_parser.add_argument("--max-review-images", type=int, default=None)
    resume_bg_parser.add_argument("--max-photos", type=int, default=None)
    resume_bg_parser.set_defaults(func=resume_bg)

    pause_parser = sub.add_parser(
        "pause-local",
        help="Pause a local handoff run by marking it cancelled and waiting for its screen to exit",
    )
    pause_parser.add_argument("--run-code", required=True)
    pause_parser.add_argument("--work-dir", default=None)
    pause_parser.add_argument("--local-database-url", default=None)
    pause_parser.add_argument("--screen-name", default=None)
    pause_parser.add_argument("--wait-seconds", type=int, default=90)
    pause_parser.add_argument("--force", action="store_true")
    pause_parser.set_defaults(func=pause_local)

    finalize_parser = sub.add_parser(
        "finalize", help="Upload a completed bundle back to production"
    )
    finalize_parser.add_argument("--bundle", required=True)
    finalize_parser.add_argument("--prod-url", required=True)
    finalize_parser.add_argument("--local-database-url", default=None)
    finalize_parser.add_argument("--finalize-bundle-output", default=None)
    finalize_parser.set_defaults(func=finalize_remote)

    watch_parser = sub.add_parser(
        "finalize-watch",
        help="Upload a refreshed local bundle and watch the production catalog sync",
    )
    watch_parser.add_argument("--bundle", required=True)
    watch_parser.add_argument("--prod-url", required=True)
    watch_parser.add_argument("--local-database-url", default=None)
    watch_parser.add_argument("--finalize-bundle-output", default=None)
    watch_parser.add_argument("--poll-interval-seconds", type=int, default=30)
    watch_parser.add_argument("--timeout-seconds", type=int, default=6 * 60 * 60)
    watch_parser.add_argument("--request-timeout", type=float, default=120.0)
    watch_parser.set_defaults(func=finalize_watch)

    finalize_bg_parser = sub.add_parser(
        "finalize-bg",
        help="Refresh a bundle from the local DB, finalize it, and monitor prod sync in screen",
    )
    finalize_bg_parser.add_argument("--bundle", required=True)
    finalize_bg_parser.add_argument("--prod-url", required=True)
    finalize_bg_parser.add_argument("--work-dir", default=None)
    finalize_bg_parser.add_argument("--local-database-url", default=None)
    finalize_bg_parser.add_argument("--screen-name", default=None)
    finalize_bg_parser.add_argument("--poll-interval-seconds", type=int, default=30)
    finalize_bg_parser.add_argument("--timeout-seconds", type=int, default=6 * 60 * 60)
    finalize_bg_parser.set_defaults(func=finalize_bg)

    monitor_parser = sub.add_parser(
        "monitor",
        help="Check local handoff runs and start catalog sync when a run is ready",
    )
    monitor_parser.add_argument("--run-code", action="append", required=True)
    monitor_parser.add_argument("--prod-url", required=True)
    monitor_parser.add_argument("--work-dir", default=None)
    monitor_parser.add_argument("--run-screen-prefix", default="soulstep-")
    monitor_parser.add_argument("--sync-screen-prefix", default="soulstep-sync-")
    monitor_parser.add_argument("--poll-interval-seconds", type=int, default=30)
    monitor_parser.add_argument("--timeout-seconds", type=int, default=6 * 60 * 60)
    monitor_parser.set_defaults(func=monitor_handoffs)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
