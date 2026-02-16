from typing import Optional, List, Dict, Any
from datetime import datetime
from sqlmodel import Field, SQLModel, JSON, Column

class DataLocation(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    code: str = Field(index=True, unique=True)
    name: str = Field(index=True)
    source_type: str = Field(default="gsheet")  # "gsheet" or "gmaps"
    config: Dict[str, Any] = Field(default={}, sa_column=Column(JSON))
    sheet_code: Optional[str] = Field(default=None)  # backward compat
    created_at: datetime = Field(default_factory=datetime.utcnow)

class ScraperRun(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    run_code: str = Field(index=True, unique=True)
    location_code: str = Field(foreign_key="datalocation.code")
    status: str = Field(default="pending")  # pending, running, completed, failed, cancelled
    total_items: Optional[int] = Field(default=None)
    processed_items: int = Field(default=0)
    created_at: datetime = Field(default_factory=datetime.utcnow)

class ScrapedPlace(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    run_code: str = Field(foreign_key="scraperrun.run_code", index=True)
    place_code: str = Field(index=True)
    name: str
    raw_data: Dict[str, Any] = Field(default={}, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow)

class GeoBoundary(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)          # "UAE", "Dubai", "Mumbai"
    boundary_type: str                      # "country" or "city"
    country: Optional[str] = None           # parent country for cities (e.g., "UAE", "India")
    lat_min: float
    lat_max: float
    lng_min: float
    lng_max: float
