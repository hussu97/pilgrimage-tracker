from datetime import UTC, datetime
from typing import Any

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
        default="pending"
    )  # pending, running, completed, failed, cancelled, interrupted
    stage: str | None = Field(
        default=None
    )  # discovery, detail_fetch, enrichment (null when not running)
    total_items: int | None = Field(default=None)
    processed_items: int = Field(default=0)
    discovered_resource_names: list[str] = Field(default=[], sa_column=Column(JSON))
    error_message: str | None = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class ScrapedPlace(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    run_code: str = Field(foreign_key="scraperrun.run_code", index=True)
    place_code: str = Field(index=True)
    name: str
    raw_data: dict[str, Any] = Field(default={}, sa_column=Column(JSON))
    enrichment_status: str = Field(default="pending")
    # "pending" | "enriching" | "complete" | "failed"
    description_source: str | None = Field(default=None)
    # which source won: "wikipedia", "gmaps_editorial", "gmaps_generative",
    #                    "wikidata", "knowledge_graph", "llm_synthesized"
    description_score: float | None = Field(default=None)
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
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
