from fastapi import APIRouter

from app.api.v1 import auth, groups, i18n, notifications, places, reviews, users, visitors

api_router = APIRouter(prefix="/api/v1", tags=["v1"])
api_router.include_router(i18n.router, tags=["i18n"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(places.router, prefix="/places", tags=["places"])
api_router.include_router(reviews.router, prefix="/reviews", tags=["reviews"])
api_router.include_router(groups.router, prefix="/groups", tags=["groups"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
api_router.include_router(visitors.router, prefix="/visitors", tags=["visitors"])
