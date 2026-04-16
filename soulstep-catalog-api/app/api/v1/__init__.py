from fastapi import APIRouter

from app.api.v1 import (
    ads,
    analytics,
    app_version,
    auth,
    blog,
    cities,
    groups,
    homepage,
    i18n,
    notifications,
    places,
    reviews,
    search,
    users,
    visitors,
)
from app.api.v1.admin import admin_router

api_router = APIRouter(prefix="/api/v1", tags=["v1"])
api_router.include_router(i18n.router, tags=["i18n"])
api_router.include_router(app_version.router, tags=["app-version"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(places.router, prefix="/places", tags=["places"])
api_router.include_router(cities.router, prefix="/cities", tags=["cities"])
api_router.include_router(reviews.router, prefix="/reviews", tags=["reviews"])
api_router.include_router(groups.router, prefix="/groups", tags=["groups"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
api_router.include_router(visitors.router, prefix="/visitors", tags=["visitors"])
api_router.include_router(search.router, prefix="/search", tags=["search"])
api_router.include_router(ads.router, tags=["ads"])
api_router.include_router(analytics.router, tags=["analytics"])
api_router.include_router(homepage.router, tags=["homepage"])
api_router.include_router(blog.router, tags=["blog"])
api_router.include_router(admin_router)
