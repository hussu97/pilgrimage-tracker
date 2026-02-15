from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime

class DataLocationCreate(BaseModel):
    name: str
    sheet_url: str

class DataLocationResponse(BaseModel):
    code: str
    name: str
    sheet_code: str
    created_at: datetime

class ScraperRunCreate(BaseModel):
    location_code: str

class ScraperRunResponse(BaseModel):
    run_code: str
    location_code: str
    status: str
    created_at: datetime

class SyncRequest(BaseModel):
    run_code: str
