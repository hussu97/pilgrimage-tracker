from datetime import datetime
from typing import Any

from sqlmodel import JSON, Column, Field, SQLModel


class DataLocation(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    code: str = Field(index=True, unique=True)
    name: str = Field(index=True)
    source_type: str = Field(default="gsheet")  # "gsheet" or "gmaps"
    config: dict[str, Any] = Field(default={}, sa_column=Column(JSON))
    sheet_code: str | None = Field(default=None)  # backward compat
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ScraperRun(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    run_code: str = Field(index=True, unique=True)
    location_code: str = Field(foreign_key="datalocation.code")
    status: str = Field(default="pending")  # pending, running, completed, failed, cancelled
    total_items: int | None = Field(default=None)
    processed_items: int = Field(default=0)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ScrapedPlace(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    run_code: str = Field(foreign_key="scraperrun.run_code", index=True)
    place_code: str = Field(index=True)
    name: str
    raw_data: dict[str, Any] = Field(default={}, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow)


class GeoBoundary(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True)  # "UAE", "Dubai", "Mumbai"
    boundary_type: str  # "country" or "city"
    country: str | None = None  # parent country for cities (e.g., "UAE", "India")
    lat_min: float
    lat_max: float
    lng_min: float
    lng_max: float


class PlaceTypeMapping(SQLModel, table=True):
    """Maps religions to Google Maps place types for scraping."""

    id: int | None = Field(default=None, primary_key=True)
    religion: str = Field(index=True)  # "islam", "christianity", "hinduism"
    source_type: str = Field(default="gmaps")  # "gmaps" or "gsheet"
    gmaps_type: str  # Google Maps API type: "mosque", "church", "cathedral", etc.
    our_place_type: str  # Our internal type name: "mosque", "church", "temple"
    is_active: bool = Field(default=True)  # Enable/disable this mapping
    display_order: int = Field(default=0)  # For ordering results
    created_at: datetime = Field(default_factory=datetime.utcnow)
