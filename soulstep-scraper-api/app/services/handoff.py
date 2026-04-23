from __future__ import annotations

import gzip
import hashlib
import json
import secrets
import tempfile
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from fastapi import HTTPException
from sqlalchemy import delete, func
from sqlmodel import Session, SQLModel, select

from app.db.models import (
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

ACTIVE_HANDOFF_STATES = {"quiescing", "exported", "claimed", "finalizing"}
RUN_SCOPED_MODELS: tuple[type[SQLModel], ...] = (
    DiscoveryCell,
    ScrapedPlace,
    RawCollectorData,
    ScrapedAsset,
)


def generate_handoff_code() -> str:
    return f"hof_{secrets.token_hex(8)}"


def default_bundle_path(run_code: str, handoff_code: str) -> Path:
    bundle_dir = Path(tempfile.gettempdir()) / "soulstep-handoffs"
    bundle_dir.mkdir(parents=True, exist_ok=True)
    return bundle_dir / f"{run_code}-{handoff_code}.json.gz"


def serialize_row(row: SQLModel) -> dict[str, Any]:
    dumped = row.model_dump() if hasattr(row, "model_dump") else dict(row)
    result: dict[str, Any] = {}
    for key, value in dumped.items():
        if isinstance(value, datetime):
            result[key] = value.astimezone(UTC).isoformat()
        else:
            result[key] = value
    return result


def hydrate_row(model: type[SQLModel], data: dict[str, Any]) -> SQLModel:
    if hasattr(model, "model_validate"):
        return model.model_validate(data)
    return model(**data)


def write_bundle_file(bundle: dict[str, Any], output_path: str | Path) -> tuple[str, str]:
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(bundle, ensure_ascii=True, sort_keys=True).encode("utf-8")
    digest = hashlib.sha256(payload).hexdigest()
    with gzip.open(path, "wb") as fh:
        fh.write(payload)
    return str(path), digest


def read_bundle_file(path: str | Path) -> dict[str, Any]:
    with gzip.open(path, "rb") as fh:
        return json.loads(fh.read().decode("utf-8"))


def active_handoff_for_run(session: Session, run_code: str) -> RunHandoff | None:
    return session.exec(
        select(RunHandoff)
        .where(RunHandoff.run_code == run_code)
        .where(RunHandoff.state.in_(ACTIVE_HANDOFF_STATES))
        .order_by(RunHandoff.created_at.desc())
    ).first()


def assert_no_active_handoff(session: Session, run_code: str, action: str) -> None:
    handoff = active_handoff_for_run(session, run_code)
    if handoff:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Run {run_code} is currently under handoff {handoff.handoff_code} "
                f"({handoff.state}); cannot {action} until the handoff is finalized or aborted."
            ),
        )


def _wait_for_execution_to_stop(execution_name: str, timeout_s: int = 120) -> None:
    from app.jobs.dispatcher import is_cloud_run_execution_active

    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        if not is_cloud_run_execution_active(execution_name):
            return
        time.sleep(2)
    raise HTTPException(
        status_code=409,
        detail=f"Cloud Run execution {execution_name} is still active after {timeout_s}s.",
    )


def create_handoff_lease(
    session: Session,
    run: ScraperRun,
    *,
    lease_owner: str | None = None,
) -> RunHandoff:
    existing = active_handoff_for_run(session, run.run_code)
    if existing:
        return existing

    handoff = RunHandoff(
        handoff_code=generate_handoff_code(),
        run_code=run.run_code,
        state="quiescing",
        lease_owner=lease_owner,
        resume_from_stage=run.stage,
    )
    session.add(handoff)
    session.commit()
    session.refresh(handoff)
    return handoff


def prepare_handoff_export(
    session: Session,
    run_code: str,
    *,
    lease_owner: str | None = None,
) -> RunHandoff:
    from app.config import settings
    from app.jobs.dispatcher import cancel_cloud_run_execution

    run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    handoff = create_handoff_lease(session, run, lease_owner=lease_owner)

    if settings.scraper_dispatch == "cloud_run" and run.cloud_run_execution:
        cancel_cloud_run_execution(run.cloud_run_execution)
        _wait_for_execution_to_stop(run.cloud_run_execution)

    if run.status in {"queued", "pending", "running"}:
        run.status = "interrupted"
        run.error_message = "Run exported for local handoff"
        session.add(run)
        session.commit()

    return handoff


def _collect_reference_rows(session: Session, run: ScraperRun) -> dict[str, list[dict[str, Any]]]:
    location = session.exec(
        select(DataLocation).where(DataLocation.code == run.location_code)
    ).first()

    boundaries: list[GeoBoundary] = []
    boxes: list[GeoBoundaryBox] = []
    if location:
        config = location.config or {}
        names = {config.get("city"), config.get("state"), config.get("country")}
        names = {name for name in names if name}
        if names:
            boundaries = session.exec(select(GeoBoundary).where(GeoBoundary.name.in_(names))).all()
            boundary_ids = [b.id for b in boundaries if b.id is not None]
            if boundary_ids:
                boxes = session.exec(
                    select(GeoBoundaryBox).where(GeoBoundaryBox.boundary_id.in_(boundary_ids))
                ).all()

    mappings = session.exec(select(PlaceTypeMapping).where(PlaceTypeMapping.is_active)).all()

    return {
        "data_locations": [serialize_row(location)] if location else [],
        "geo_boundaries": [serialize_row(boundary) for boundary in boundaries],
        "geo_boundary_boxes": [serialize_row(box) for box in boxes],
        "place_type_mappings": [serialize_row(mapping) for mapping in mappings],
    }


def build_run_bundle(session: Session, run_code: str, handoff_code: str) -> dict[str, Any]:
    run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    handoff = session.exec(
        select(RunHandoff).where(RunHandoff.handoff_code == handoff_code)
    ).first()
    if not handoff or handoff.run_code != run_code:
        raise HTTPException(status_code=404, detail="Handoff not found")

    scoped_rows: dict[str, list[dict[str, Any]]] = {
        "scraper_runs": [serialize_row(run)],
        "discovery_cells": [
            serialize_row(row)
            for row in session.exec(
                select(DiscoveryCell).where(DiscoveryCell.run_code == run_code)
            ).all()
        ],
        "scraped_places": [
            serialize_row(row)
            for row in session.exec(
                select(ScrapedPlace).where(ScrapedPlace.run_code == run_code)
            ).all()
        ],
        "raw_collector_data": [
            serialize_row(row)
            for row in session.exec(
                select(RawCollectorData).where(RawCollectorData.run_code == run_code)
            ).all()
        ],
        "scraped_assets": [
            serialize_row(row)
            for row in session.exec(
                select(ScrapedAsset).where(ScrapedAsset.run_code == run_code)
            ).all()
        ],
        "run_handoffs": [serialize_row(handoff)],
    }
    scoped_rows.update(_collect_reference_rows(session, run))
    counts = {table: len(rows) for table, rows in scoped_rows.items()}

    return {
        "manifest": {
            "handoff_code": handoff_code,
            "run_code": run_code,
            "resume_from_stage": run.stage,
            "created_at": datetime.now(UTC).isoformat(),
            "row_counts": counts,
        },
        "data": scoped_rows,
    }


def mark_handoff_exported(
    session: Session,
    handoff_code: str,
    *,
    bundle_uri: str,
    manifest_sha256: str,
) -> RunHandoff:
    handoff = session.exec(
        select(RunHandoff).where(RunHandoff.handoff_code == handoff_code)
    ).first()
    if not handoff:
        raise HTTPException(status_code=404, detail="Handoff not found")
    handoff.state = "exported"
    handoff.bundle_uri = bundle_uri
    handoff.manifest_sha256 = manifest_sha256
    handoff.exported_at = datetime.now(UTC)
    session.add(handoff)
    session.commit()
    session.refresh(handoff)
    return handoff


def abort_handoff(session: Session, run_code: str) -> RunHandoff:
    handoff = active_handoff_for_run(session, run_code)
    if not handoff:
        raise HTTPException(status_code=404, detail="Active handoff not found")
    handoff.state = "aborted"
    session.add(handoff)
    session.commit()
    session.refresh(handoff)
    return handoff


def _upsert_reference_rows(session: Session, rows: dict[str, list[dict[str, Any]]]) -> None:
    for item in rows.get("data_locations", []):
        session.merge(hydrate_row(DataLocation, item))
    for item in rows.get("geo_boundaries", []):
        session.merge(hydrate_row(GeoBoundary, item))
    for item in rows.get("geo_boundary_boxes", []):
        session.merge(hydrate_row(GeoBoundaryBox, item))
    for item in rows.get("place_type_mappings", []):
        session.merge(hydrate_row(PlaceTypeMapping, item))


def _replace_run_scoped_rows(
    session: Session, run_code: str, rows: dict[str, list[dict[str, Any]]]
) -> None:
    session.exec(delete(ScrapedAsset).where(ScrapedAsset.run_code == run_code))
    session.exec(delete(RawCollectorData).where(RawCollectorData.run_code == run_code))
    session.exec(delete(ScrapedPlace).where(ScrapedPlace.run_code == run_code))
    session.exec(delete(DiscoveryCell).where(DiscoveryCell.run_code == run_code))

    imported_run = None
    for item in rows.get("scraper_runs", []):
        imported_run = hydrate_row(ScraperRun, item)
        imported_run.cloud_run_execution = None
        session.merge(imported_run)

    for item in rows.get("discovery_cells", []):
        session.add(hydrate_row(DiscoveryCell, item))
    for item in rows.get("scraped_places", []):
        session.add(hydrate_row(ScrapedPlace, item))
    for item in rows.get("raw_collector_data", []):
        session.add(hydrate_row(RawCollectorData, item))
    for item in rows.get("scraped_assets", []):
        session.add(hydrate_row(ScrapedAsset, item))

    if imported_run is None:
        raise HTTPException(status_code=400, detail="Bundle missing scraper run data")


def _validate_bundle(bundle: dict[str, Any], run_code: str, handoff: RunHandoff) -> None:
    manifest = bundle.get("manifest") or {}
    if manifest.get("run_code") != run_code:
        raise HTTPException(status_code=400, detail="Bundle run_code does not match target run")
    if manifest.get("handoff_code") != handoff.handoff_code:
        raise HTTPException(status_code=400, detail="Bundle handoff_code does not match target")


def finalize_handoff_bundle(
    session: Session,
    run_code: str,
    handoff_code: str,
    bundle: dict[str, Any],
) -> tuple[RunHandoff, bool]:
    handoff = session.exec(
        select(RunHandoff).where(RunHandoff.handoff_code == handoff_code)
    ).first()
    if not handoff or handoff.run_code != run_code:
        raise HTTPException(status_code=404, detail="Handoff not found")

    _validate_bundle(bundle, run_code, handoff)
    payload = json.dumps(bundle, ensure_ascii=True, sort_keys=True).encode("utf-8")
    digest = hashlib.sha256(payload).hexdigest()
    if handoff.state == "completed" and handoff.manifest_sha256 == digest:
        return handoff, False

    handoff.state = "finalizing"
    handoff.claimed_at = handoff.claimed_at or datetime.now(UTC)
    handoff.manifest_sha256 = digest
    session.add(handoff)
    session.commit()

    rows = bundle.get("data") or {}
    _upsert_reference_rows(session, rows)
    _replace_run_scoped_rows(session, run_code, rows)

    run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
    pending_assets = session.exec(
        select(func.count())
        .select_from(ScrapedAsset)
        .where(ScrapedAsset.run_code == run_code)
        .where(ScrapedAsset.status == "pending_upload")
    ).one()
    if run:
        run.cloud_run_execution = None
        if pending_assets == 0 and run.stage is None and run.status != "cancelled":
            run.status = "completed"
        session.add(run)

    handoff.state = "completed"
    handoff.finalized_at = datetime.now(UTC)
    session.add(handoff)
    session.commit()
    session.refresh(handoff)

    triggered_sync = bool(run and run.status == "completed" and pending_assets == 0)
    return handoff, triggered_sync
