from fastapi import APIRouter

from app.api.v1 import scraper

api_router = APIRouter(prefix="/api/v1", tags=["v1"])
api_router.include_router(scraper.router, prefix="/scraper", tags=["scraper"])
