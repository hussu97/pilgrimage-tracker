from fastapi import APIRouter

from app.api.v1.admin import scraper_proxy

admin_router = APIRouter(prefix="/admin", tags=["admin"])
admin_router.include_router(scraper_proxy.router, prefix="/scraper", tags=["admin-scraper"])
