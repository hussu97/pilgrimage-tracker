"""
Service layer for quality metric aggregation.

Extracted from the API layer to keep the endpoint handler thin.
`compute_quality_metrics()` executes all DB queries and returns the
fully-populated `QualityMetricsResponse` object ready for serialisation.
"""

from __future__ import annotations

from sqlmodel import Session, func, select

from app.db.models import DataLocation, ScrapedPlace, ScraperRun
from app.models.schemas import (
    DescriptionSourceCount,
    EnrichmentStatusCount,
    GateCount,
    NearThresholdCount,
    PerRunSummaryItem,
    QualityMetricsResponse,
    ScoreBucket,
)
from app.pipeline.place_quality import GATE_ENRICHMENT, GATE_IMAGE_DOWNLOAD, GATE_SYNC


def compute_quality_metrics(
    session: Session,
    run_code: str | None = None,
) -> QualityMetricsResponse:
    """
    Aggregate quality scoring statistics across all runs or a single run.

    Fetches all quality scores from the DB, then computes distribution buckets,
    gate breakdowns, near-threshold counts, avg/median, description source
    breakdown, enrichment status breakdown, per-run summaries, and overall stats.
    """
    base_filter = [ScrapedPlace.run_code == run_code] if run_code else []

    # Fetch all quality scores for distribution / median computation
    score_query = select(ScrapedPlace.quality_score).where(*base_filter)
    all_scores = [r for r in session.exec(score_query).all() if r is not None]

    # Score distribution — 10 buckets: 0.0-0.1, 0.1-0.2, ..., 0.9-1.0
    buckets: list[ScoreBucket] = []
    for i in range(10):
        lo = round(i * 0.1, 1)
        hi = round((i + 1) * 0.1, 1)
        label = f"{lo}-{hi}"
        count = sum(1 for s in all_scores if lo <= s < hi)
        if i == 9:
            count = sum(1 for s in all_scores if lo <= s <= hi)
        buckets.append(ScoreBucket(bucket=label, count=count))

    # Gate breakdown
    gate_order = ["below_image_gate", "below_enrichment_gate", "below_sync_gate", "passed"]
    gate_counts: list[GateCount] = []
    for gate in gate_order:
        gate_query = (
            select(func.count())
            .select_from(ScrapedPlace)
            .where(ScrapedPlace.quality_gate == gate, *base_filter)
        )
        cnt = session.exec(gate_query).one()
        gate_counts.append(GateCount(gate=gate, count=cnt))

    # Near-threshold counts (±0.05 band around each gate threshold)
    thresholds = [
        ("below_image_gate", GATE_IMAGE_DOWNLOAD),
        ("below_enrichment_gate", GATE_ENRICHMENT),
        ("below_sync_gate", GATE_SYNC),
    ]
    near_threshold: list[NearThresholdCount] = []
    for gate_label, threshold in thresholds:
        lo = threshold - 0.05
        hi = threshold + 0.05
        count = sum(1 for s in all_scores if lo <= s <= hi)
        near_threshold.append(NearThresholdCount(gate=gate_label, threshold=threshold, count=count))

    # Avg / median score
    avg_score = (sum(all_scores) / len(all_scores)) if all_scores else None
    median_score: float | None = None
    if all_scores:
        sorted_scores = sorted(all_scores)
        n = len(sorted_scores)
        mid = n // 2
        median_score = (
            sorted_scores[mid] if n % 2 == 1 else (sorted_scores[mid - 1] + sorted_scores[mid]) / 2
        )

    # Description source breakdown
    desc_query = (
        select(ScrapedPlace.description_source, func.count())
        .where(*base_filter)
        .group_by(ScrapedPlace.description_source)
    )
    desc_rows = session.exec(desc_query).all()
    desc_breakdown = [
        DescriptionSourceCount(source=row[0] if row[0] else "none", count=row[1])
        for row in desc_rows
    ]

    # Enrichment status breakdown
    status_query = (
        select(ScrapedPlace.enrichment_status, func.count())
        .where(*base_filter)
        .group_by(ScrapedPlace.enrichment_status)
    )
    status_rows = session.exec(status_query).all()
    status_breakdown = [EnrichmentStatusCount(status=row[0], count=row[1]) for row in status_rows]

    # Per-run summary (if run_code provided, single run; else all runs)
    run_query = select(ScraperRun).order_by(ScraperRun.created_at.desc())
    if run_code:
        run_query = run_query.where(ScraperRun.run_code == run_code)
    runs = session.exec(run_query).all()

    per_run_summary: list[PerRunSummaryItem] = []
    for run in runs:
        run_filter = [ScrapedPlace.run_code == run.run_code]
        run_total = session.exec(
            select(func.count()).select_from(ScrapedPlace).where(*run_filter)
        ).one()
        run_passed = session.exec(
            select(func.count())
            .select_from(ScrapedPlace)
            .where(ScrapedPlace.quality_gate == "passed", *run_filter)
        ).one()
        run_scores = [
            r
            for r in session.exec(select(ScrapedPlace.quality_score).where(*run_filter)).all()
            if r is not None
        ]
        run_avg = (sum(run_scores) / len(run_scores)) if run_scores else None

        loc = session.exec(
            select(DataLocation).where(DataLocation.code == run.location_code)
        ).first()

        per_run_summary.append(
            PerRunSummaryItem(
                run_code=run.run_code,
                location_name=loc.name if loc else None,
                status=run.status,
                total_scraped=run_total,
                total_passed=run_passed,
                avg_score=round(run_avg, 4) if run_avg is not None else None,
                created_at=run.created_at,
            )
        )

    # Overall stats
    total_scraped = session.exec(
        select(func.count()).select_from(ScrapedPlace).where(*base_filter)
    ).one()
    total_synced = session.exec(
        select(func.count())
        .select_from(ScraperRun)
        .where(
            *(
                ([ScraperRun.run_code == run_code] if run_code else [])
                + [ScraperRun.places_synced > 0]
            )
        )
    ).one()
    total_passed_count = next((g.count for g in gate_counts if g.gate == "passed"), 0)
    filter_rate = round(
        ((total_scraped - total_passed_count) / total_scraped * 100) if total_scraped > 0 else 0.0,
        1,
    )

    return QualityMetricsResponse(
        score_distribution=buckets,
        gate_breakdown=gate_counts,
        near_threshold_counts=near_threshold,
        avg_quality_score=round(avg_score, 4) if avg_score is not None else None,
        median_quality_score=round(median_score, 4) if median_score is not None else None,
        description_source_breakdown=desc_breakdown,
        enrichment_status_breakdown=status_breakdown,
        per_run_summary=per_run_summary,
        overall_stats={
            "total_scraped": total_scraped,
            "total_synced": total_synced,
            "overall_filter_rate_pct": filter_rate,
        },
    )
