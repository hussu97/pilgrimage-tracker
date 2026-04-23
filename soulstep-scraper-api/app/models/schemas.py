from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class DataLocationCreate(BaseModel):
    name: str
    source_type: Literal["gmaps"] = "gmaps"
    # gmaps fields
    country: str | None = None
    state: str | None = None  # State/province level (e.g., "California", "Maharashtra")
    city: str | None = None  # City level (most granular)
    max_results: int | None = Field(default=None, ge=1, le=100_000)  # Limit results for testing
    force_refresh: bool | None = False  # Ignore cached places and force fresh fetch
    stale_threshold_days: int | None = 90  # Re-fetch if cached data older than this


class DataLocationResponse(BaseModel):
    code: str
    name: str
    source_type: str
    config: dict[str, Any]
    created_at: datetime


class ScraperRunCreate(BaseModel):
    location_code: str


class ScraperRunResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    run_code: str
    location_code: str
    status: str
    stage: str | None = None
    total_items: int | None = None
    processed_items: int = 0
    error_message: str | None = None
    geo_box_label: str | None = None
    cloud_run_execution: str | None = None
    created_at: datetime
    # Per-stage timing metrics (seconds)
    discovery_duration_s: float | None = None
    detail_fetch_duration_s: float | None = None
    image_download_duration_s: float | None = None
    enrichment_duration_s: float | None = None
    sync_duration_s: float | None = None
    avg_time_per_place_s: float | None = None
    # Visibility + idempotency (migration 0023)
    last_sync_at: datetime | None = None
    rate_limit_events: dict = {}
    handoff_state: str | None = None
    asset_pending: int = 0
    asset_uploaded: int = 0
    asset_failed: int = 0
    oldest_pending_asset_age_s: int | None = None


class ScraperRunsCreateResponse(BaseModel):
    """Response for POST /runs — always returns a list (1 or N runs for cloud_run fan-out)."""

    runs: list[ScraperRunResponse]


class RunHandoffResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    handoff_code: str
    run_code: str
    state: str
    lease_owner: str | None = None
    exported_at: datetime | None = None
    claimed_at: datetime | None = None
    finalized_at: datetime | None = None
    resume_from_stage: str | None = None
    bundle_uri: str | None = None
    manifest_sha256: str | None = None
    error_message: str | None = None
    created_at: datetime


class HandoffExportResponse(BaseModel):
    handoff: RunHandoffResponse
    run_code: str
    status: str


class HandoffBatchExportRequest(BaseModel):
    location_code: str
    statuses: list[str] = Field(default_factory=lambda: ["interrupted", "failed"])
    lease_owner: str | None = None


class HandoffBatchExportResponse(BaseModel):
    location_code: str
    run_codes: list[str]
    handoffs: list[RunHandoffResponse]


class HandoffFinalizeResponse(BaseModel):
    handoff: RunHandoffResponse
    run_code: str
    status: str
    triggered_sync: bool


class SyncRequest(BaseModel):
    run_code: str


class PlaceTypeMappingCreate(BaseModel):
    religion: str
    source_type: Literal["gmaps"] = "gmaps"
    gmaps_type: str
    our_place_type: str
    is_active: bool = True
    display_order: int = 0


class PlaceTypeMappingUpdate(BaseModel):
    religion: str | None = None
    source_type: Literal["gmaps"] | None = None
    gmaps_type: str | None = None
    our_place_type: str | None = None
    is_active: bool | None = None
    display_order: int | None = None


class PlaceTypeMappingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    religion: str
    source_type: str
    gmaps_type: str
    our_place_type: str
    is_active: bool
    display_order: int
    created_at: datetime


class CollectorStatusResponse(BaseModel):
    name: str
    requires_api_key: bool
    is_available: bool
    api_key_env_var: str | None = None


class RawCollectorDataResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    place_code: str
    collector_name: str
    status: str
    error_message: str | None = None
    raw_response: dict[str, Any]
    collected_at: datetime


class ScraperStatsResponse(BaseModel):
    total_locations: int
    total_runs: int
    total_places_scraped: int
    last_run_at: datetime | None = None
    last_run_status: str | None = None


# ── Quality Metrics ────────────────────────────────────────────────────────────


class ScoreBucket(BaseModel):
    bucket: str  # e.g. "0.0-0.1"
    count: int


class GateCount(BaseModel):
    gate: str  # "below_image_gate" | "below_enrichment_gate" | "below_sync_gate" | "passed"
    count: int


class NearThresholdCount(BaseModel):
    gate: str
    threshold: float
    count: int  # places with quality_score in [threshold-0.05, threshold+0.05]


class DescriptionSourceCount(BaseModel):
    source: str
    count: int


class EnrichmentStatusCount(BaseModel):
    status: str
    count: int


class PerRunSummaryItem(BaseModel):
    run_code: str
    location_name: str | None
    status: str
    total_scraped: int
    total_passed: int
    avg_score: float | None
    created_at: datetime


class QualityMetricsResponse(BaseModel):
    score_distribution: list[ScoreBucket]
    gate_breakdown: list[GateCount]
    near_threshold_counts: list[NearThresholdCount]
    avg_quality_score: float | None
    median_quality_score: float | None
    description_source_breakdown: list[DescriptionSourceCount]
    enrichment_status_breakdown: list[EnrichmentStatusCount]
    per_run_summary: list[PerRunSummaryItem]
    overall_stats: dict


# ── Map Endpoints ───────────────────────────────────────────────────────────────


class MapCellItem(BaseModel):
    lat_min: float
    lat_max: float
    lng_min: float
    lng_max: float
    depth: int
    result_count: int
    run_code: str


class MapPlaceItem(BaseModel):
    place_code: str
    name: str
    lat: float
    lng: float
    enrichment_status: str
    quality_gate: str | None
    quality_score: float | None
    run_code: str
