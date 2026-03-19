from datetime import UTC, datetime
from typing import Any

from sqlalchemy import UniqueConstraint
from sqlmodel import JSON, Column, Field, SQLModel


class DataLocation(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    code: str = Field(index=True, unique=True)
    name: str = Field(index=True)
    source_type: str = Field(default="gmaps")  # "gmaps"
    config: dict[str, Any] = Field(default={}, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class ScraperRun(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    run_code: str = Field(index=True, unique=True)
    location_code: str = Field(foreign_key="datalocation.code")
    status: str = Field(
        default="queued"
    )  # queued, pending, running, completed, failed, cancelled, interrupted
    stage: str | None = Field(
        default=None
    )  # discovery, detail_fetch, image_download, enrichment, syncing (null when done)
    total_items: int | None = Field(default=None)
    processed_items: int = Field(default=0)
    discovered_resource_names: list[str] = Field(default=[], sa_column=Column(JSON))
    error_message: str | None = Field(default=None)
    images_downloaded: int = Field(default=0)
    images_failed: int = Field(default=0)
    review_images_downloaded: int = Field(default=0)
    review_images_failed: int = Field(default=0)
    places_synced: int = Field(default=0)
    places_sync_failed: int = Field(default=0)
    places_sync_quality_filtered: int = Field(default=0)
    places_sync_name_filtered: int = Field(default=0)
    sync_failure_details: list[str] = Field(default=[], sa_column=Column(JSON))
    places_filtered: int = Field(default=0)
    detail_fetch_cached: int = Field(default=0)
    geo_box_label: str | None = Field(default=None)
    # If set, this run only processes the geo boundary box with this label.
    # Null means process all boxes (local dispatch / city / state locations).
    cloud_run_execution: str | None = Field(default=None)
    # Full Cloud Run execution resource name, e.g.
    # projects/{project}/locations/{region}/jobs/{job}/executions/{id}
    # Set by the dispatcher when SCRAPER_DISPATCH=cloud_run so the cancel
    # endpoint can terminate the execution via the Executions API.
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    # ── Per-stage timing metrics (seconds) ─────────────────────────────────
    discovery_duration_s: float | None = Field(default=None)
    detail_fetch_duration_s: float | None = Field(default=None)
    image_download_duration_s: float | None = Field(default=None)
    enrichment_duration_s: float | None = Field(default=None)
    sync_duration_s: float | None = Field(default=None)
    avg_time_per_place_s: float | None = Field(default=None)


class ScrapedPlace(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("run_code", "place_code", name="uq_scrapedplace_run_place"),)
    id: int | None = Field(default=None, primary_key=True)
    run_code: str = Field(foreign_key="scraperrun.run_code", index=True)
    place_code: str = Field(index=True)
    name: str
    raw_data: dict[str, Any] = Field(default={}, sa_column=Column(JSON))
    enrichment_status: str = Field(default="pending")
    # "pending" | "enriching" | "complete" | "failed" | "filtered"
    description_source: str | None = Field(default=None)
    # which source won: "wikipedia", "gmaps_editorial", "gmaps_generative",
    #                    "wikidata", "knowledge_graph", "llm_synthesized"
    description_score: float | None = Field(default=None)
    quality_score: float | None = Field(default=None)
    quality_gate: str | None = Field(default=None)
    city: str | None = Field(default=None, index=True)
    state: str | None = Field(default=None, index=True)
    country: str | None = Field(default=None, index=True)
    # ── Promoted from raw_data for query-level access ────────────────────────
    lat: float | None = Field(default=None)
    lng: float | None = Field(default=None)
    rating: float | None = Field(default=None)
    user_rating_count: int | None = Field(default=None)
    google_place_id: str | None = Field(default=None, index=True)
    address: str | None = Field(default=None)
    religion: str | None = Field(default=None, index=True)
    place_type: str | None = Field(default=None, index=True)
    business_status: str | None = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class RawCollectorData(SQLModel, table=True):
    """Preserves the verbatim JSON response from each source per place."""

    id: int | None = Field(default=None, primary_key=True)
    place_code: str = Field(index=True)
    collector_name: str = Field(index=True)
    # "gmaps", "osm", "wikipedia", "wikidata", "knowledge_graph",
    # "besttime", "foursquare", "outscraper"
    run_code: str = Field(foreign_key="scraperrun.run_code", index=True)
    raw_response: dict[str, Any] = Field(default={}, sa_column=Column(JSON))
    status: str = Field(default="success")
    # "success", "failed", "skipped", "not_configured"
    error_message: str | None = Field(default=None)
    collected_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class GeoBoundary(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True)  # "UAE", "Dubai", "Mumbai"
    boundary_type: str  # "country", "state", or "city"
    country: str | None = None  # parent country (e.g., "UAE", "India", "USA")
    state: str | None = None  # parent state for cities (e.g., "California", "Maharashtra")
    lat_min: float
    lat_max: float
    lng_min: float
    lng_max: float
    radius_km: float | None = None  # approximate search radius in km


class PlaceTypeMapping(SQLModel, table=True):
    """Maps religions to Google Maps place types for scraping."""

    id: int | None = Field(default=None, primary_key=True)
    religion: str = Field(index=True)  # "islam", "christianity", "hinduism"
    source_type: str = Field(default="gmaps")  # "gmaps"
    gmaps_type: str  # Google Maps API type: "mosque", "church", "cathedral", etc.
    our_place_type: str  # Our internal type name: "mosque", "church", "temple"
    is_active: bool = Field(default=True)  # Enable/disable this mapping
    display_order: int = Field(default=0)  # For ordering results
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class DiscoveryCell(SQLModel, table=True):
    """Records each bounding box searched via Google Places API during discovery.

    Persisted immediately after the API call so interrupted runs can resume
    by skipping already-searched bounding boxes.
    Only cells where an actual API call was made are stored — oversized cells
    that auto-subdivide without calling the API are not recorded.
    """

    id: int | None = Field(default=None, primary_key=True)
    run_code: str = Field(index=True)
    lat_min: float
    lat_max: float
    lng_min: float
    lng_max: float
    depth: int
    radius_m: float
    result_count: int  # 0-20; if 20, area was saturated and subdivided
    saturated: bool
    resource_names: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    place_type: str = Field(default="", index=True)
    discovery_method: str = Field(default="quadtree")
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class GlobalDiscoveryCell(SQLModel, table=True):
    """Cross-run discovery cache keyed by bounding box + place_type.

    After month 1, recurring runs of the same city can skip 95%+ of discovery
    API calls by reusing cached results that are still within the TTL window.

    TTL is enforced in application logic (GlobalCellStore), not DB constraints.
    """

    __tablename__ = "globaldiscoverycell"

    id: int | None = Field(default=None, primary_key=True)
    lat_min: float
    lat_max: float
    lng_min: float
    lng_max: float
    place_type: str = Field(default="", index=True)
    discovery_method: str = Field(default="quadtree")
    result_count: int
    saturated: bool
    resource_names: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    searched_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class GeoBoundaryBox(SQLModel, table=True):
    """One of potentially many bounding boxes composing a geographic boundary.

    Countries like India or USA span huge areas that include neighboring
    countries when expressed as a single rectangle.  Splitting them into
    15-20 tighter boxes greatly reduces wasted search area and avoids
    cross-border contamination.

    When no boxes exist for a boundary, scrapers fall back to the single
    bounding box stored on the GeoBoundary row itself.
    """

    id: int | None = Field(default=None, primary_key=True)
    boundary_id: int = Field(foreign_key="geoboundary.id", index=True)
    lat_min: float
    lat_max: float
    lng_min: float
    lng_max: float
    label: str | None = Field(default=None)  # e.g. "north", "south_coast"


class GlobalGmapsCache(SQLModel, table=True):
    """Cross-run cache for raw GMaps API responses keyed by place_code.

    Avoids re-fetching place details within the TTL window (90 days).
    TTL is enforced in application logic (GlobalGmapsCacheStore), not DB constraints.
    """

    __tablename__ = "globalgmapscache"

    id: int | None = Field(default=None, primary_key=True)
    place_code: str = Field(index=True, unique=True)
    raw_response: dict[str, Any] = Field(default={}, sa_column=Column(JSON))
    quality_score: float | None = Field(default=None)
    cached_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
