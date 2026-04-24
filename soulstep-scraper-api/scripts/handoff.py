from __future__ import annotations

import argparse
import json
import os
import shlex
import shutil
import subprocess
import sys
from pathlib import Path

import httpx
from sqlmodel import Session, SQLModel, create_engine, select

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


def _start_screen_runner(
    *,
    screen_name: str,
    database_url: str,
    run_code: str,
    run_action: str,
    log_path: Path,
    env_overrides: dict[str, str],
) -> None:
    if not shutil.which("screen"):
        raise RuntimeError("screen is required to start a detached local handoff runner")
    if _screen_session_exists(screen_name):
        raise RuntimeError(f"screen session already exists: {screen_name}")

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
    subprocess.run(["screen", "-dmS", screen_name, "zsh", "-lc", command], check=True)


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


def finalize_remote(args: argparse.Namespace) -> int:
    bundle = read_bundle_file(args.bundle)
    handoff_code = bundle["manifest"]["handoff_code"]
    run_code = bundle["manifest"]["run_code"]
    with httpx.Client(timeout=120.0) as client:
        with open(args.bundle, "rb") as fh:
            resp = client.post(
                f"{args.prod_url.rstrip('/')}/api/v1/scraper/runs/{run_code}/handoff/finalize",
                params={"handoff_code": handoff_code},
                content=fh.read(),
                headers={"Content-Type": "application/gzip"},
            )
            resp.raise_for_status()
    print(resp.text)
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

    finalize_parser = sub.add_parser(
        "finalize", help="Upload a completed bundle back to production"
    )
    finalize_parser.add_argument("--bundle", required=True)
    finalize_parser.add_argument("--prod-url", required=True)
    finalize_parser.set_defaults(func=finalize_remote)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
