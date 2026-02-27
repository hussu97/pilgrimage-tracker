from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict


class DataLocationCreate(BaseModel):
    name: str
    source_type: Literal["gmaps"] = "gmaps"
    # gmaps fields
    country: str | None = None
    state: str | None = None  # State/province level (e.g., "California", "Maharashtra")
    city: str | None = None  # City level (most granular)
    max_results: int | None = None  # Limit results for testing
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
    run_code: str
    location_code: str
    status: str
    stage: str | None = None
    total_items: int | None = None
    processed_items: int = 0
    error_message: str | None = None
    created_at: datetime


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
