"""
Service layer for the run activity snapshot.

Extracted from the API layer to keep the endpoint handler thin.
`get_activity_snapshot()` runs all DB queries and returns a plain dict
that the endpoint can return directly.
"""

from __future__ import annotations

from sqlmodel import Session, func, select

from app.constants import ENRICHING_SNAPSHOT_LIMIT
from app.db.models import DiscoveryCell, RunHandoff, ScrapedPlace, ScraperRun
from app.services.handoff import ACTIVE_HANDOFF_STATES
from app.services.scraped_assets import get_asset_stats


def get_activity_snapshot(run_code: str, session: Session) -> dict:
    """
    Return a lightweight progress snapshot for the given run.

    Runs 7 DB queries to aggregate cell and place counters.  Intended to be
    polled by the admin UI at regular intervals.

    Returns a dict with the following keys:
        cells_total, cells_saturated,
        places_total, places_pending, places_enriching,
        places_complete, places_failed, places_filtered,
        images_downloaded, images_failed,
        review_images_downloaded, review_images_failed,
        places_synced, places_sync_failed.
    """
    run = session.exec(select(ScraperRun).where(ScraperRun.run_code == run_code)).first()
    if run is None:
        return {}
    asset_stats = get_asset_stats(run_code, session)
    handoff = session.exec(
        select(RunHandoff)
        .where(RunHandoff.run_code == run_code)
        .where(RunHandoff.state.in_(ACTIVE_HANDOFF_STATES))
        .order_by(RunHandoff.created_at.desc())
    ).first()

    cells_total = session.exec(
        select(func.count()).select_from(DiscoveryCell).where(DiscoveryCell.run_code == run_code)
    ).one()
    cells_saturated = session.exec(
        select(func.count())
        .select_from(DiscoveryCell)
        .where(DiscoveryCell.run_code == run_code)
        .where(DiscoveryCell.saturated == True)  # noqa: E712
    ).one()

    places_total = session.exec(
        select(func.count()).select_from(ScrapedPlace).where(ScrapedPlace.run_code == run_code)
    ).one()
    places_complete = session.exec(
        select(func.count())
        .select_from(ScrapedPlace)
        .where(ScrapedPlace.run_code == run_code)
        .where(ScrapedPlace.enrichment_status == "complete")
    ).one()
    places_failed = session.exec(
        select(func.count())
        .select_from(ScrapedPlace)
        .where(ScrapedPlace.run_code == run_code)
        .where(ScrapedPlace.enrichment_status == "failed")
    ).one()

    enriching = session.exec(
        select(ScrapedPlace)
        .where(ScrapedPlace.run_code == run_code)
        .where(ScrapedPlace.enrichment_status == "enriching")
        .limit(ENRICHING_SNAPSHOT_LIMIT)
    ).all()

    places_filtered = session.exec(
        select(func.count())
        .select_from(ScrapedPlace)
        .where(ScrapedPlace.run_code == run_code)
        .where(ScrapedPlace.enrichment_status == "filtered")
    ).one()

    direct_sync = (run.rate_limit_events or {}).get("direct_catalog_sync") or {}
    return {
        "cells_total": cells_total,
        "cells_saturated": cells_saturated,
        "places_total": places_total,
        "places_pending": max(
            0,
            places_total - places_complete - places_failed - places_filtered - len(enriching),
        ),
        "places_enriching": [{"place_code": p.place_code, "name": p.name} for p in enriching],
        "places_complete": places_complete,
        "places_failed": places_failed,
        "places_filtered": places_filtered,
        "images_downloaded": run.images_downloaded,
        "images_failed": run.images_failed,
        "review_images_downloaded": run.review_images_downloaded,
        "review_images_failed": run.review_images_failed,
        "places_synced": run.places_synced,
        "places_sync_failed": run.places_sync_failed,
        "places_sync_quality_filtered": run.places_sync_quality_filtered,
        "places_sync_name_filtered": run.places_sync_name_filtered,
        "detail_fetch_total": run.total_items,
        "detail_fetch_cached": run.detail_fetch_cached,
        "handoff_state": handoff.state if handoff else None,
        "asset_pending": asset_stats.pending,
        "asset_uploaded": asset_stats.uploaded,
        "asset_failed": asset_stats.failed,
        "oldest_pending_asset_age_s": asset_stats.oldest_pending_asset_age_s,
        "direct_catalog_sync_state": direct_sync.get("state"),
        "direct_catalog_synced": int(direct_sync.get("synced") or 0),
        "direct_catalog_failed": int(direct_sync.get("failed") or 0),
        "direct_catalog_quality_filtered": int(direct_sync.get("quality_filtered") or 0),
        "direct_catalog_name_filtered": int(direct_sync.get("name_filtered") or 0),
        "direct_catalog_images_replaced": int(direct_sync.get("images_replaced") or 0),
        "direct_catalog_images_preserved": int(direct_sync.get("images_preserved") or 0),
    }
