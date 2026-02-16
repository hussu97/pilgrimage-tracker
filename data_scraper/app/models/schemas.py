from pydantic import BaseModel
from typing import Optional, List, Dict, Any, Literal
from datetime import datetime

class DataLocationCreate(BaseModel):
    name: str
    source_type: Literal["gsheet", "gmaps"] = "gsheet"
    # gsheet fields
    sheet_url: Optional[str] = None
    # gmaps fields
    country: Optional[str] = None
    city: Optional[str] = None  # More granular than country
    max_results: Optional[int] = None  # Limit results for testing
    force_refresh: Optional[bool] = False  # Ignore cached places and force fresh fetch
    stale_threshold_days: Optional[int] = 90  # Re-fetch if cached data older than this

class DataLocationResponse(BaseModel):
    code: str
    name: str
    source_type: str
    config: Dict[str, Any]
    sheet_code: Optional[str] = None
    created_at: datetime

class ScraperRunCreate(BaseModel):
    location_code: str

class ScraperRunResponse(BaseModel):
    run_code: str
    location_code: str
    status: str
    total_items: Optional[int] = None
    processed_items: int = 0
    created_at: datetime

class SyncRequest(BaseModel):
    run_code: str


class PlaceTypeMappingCreate(BaseModel):
    religion: str
    source_type: Literal["gmaps", "gsheet"] = "gmaps"
    gmaps_type: str
    our_place_type: str
    is_active: bool = True
    display_order: int = 0


class PlaceTypeMappingUpdate(BaseModel):
    religion: Optional[str] = None
    source_type: Optional[Literal["gmaps", "gsheet"]] = None
    gmaps_type: Optional[str] = None
    our_place_type: Optional[str] = None
    is_active: Optional[bool] = None
    display_order: Optional[int] = None


class PlaceTypeMappingResponse(BaseModel):
    id: int
    religion: str
    source_type: str
    gmaps_type: str
    our_place_type: str
    is_active: bool
    display_order: int
    created_at: datetime

    class Config:
        from_attributes = True
