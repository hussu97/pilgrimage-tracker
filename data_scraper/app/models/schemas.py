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
    place_type: Optional[str] = None
    max_results: Optional[int] = None

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
