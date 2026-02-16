from fastapi import FastAPI
from app.db.session import create_db_and_tables
from app.db.seed_geo import seed_geo_boundaries
from app.db.seed_place_types import seed_place_type_mappings
from app.api.v1 import api_router
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Pilgrimage Data Scraper API")

@app.on_event("startup")
def on_startup():
    create_db_and_tables()
    seed_geo_boundaries()
    seed_place_type_mappings()

app.include_router(api_router)

@app.get("/health")
def health():
    return {"status": "ok"}
