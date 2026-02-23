from fastapi import APIRouter

from app.api.v1.admin import check_ins, groups, places, reviews, scraper_proxy, users

admin_router = APIRouter(prefix="/admin", tags=["admin"])
admin_router.include_router(scraper_proxy.router, prefix="/scraper", tags=["admin-scraper"])
admin_router.include_router(users.router, tags=["admin-users"])
admin_router.include_router(places.router, tags=["admin-places"])
admin_router.include_router(reviews.router, tags=["admin-reviews"])
admin_router.include_router(check_ins.router, tags=["admin-check-ins"])
admin_router.include_router(groups.router, tags=["admin-groups"])
