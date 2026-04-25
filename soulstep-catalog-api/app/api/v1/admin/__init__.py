from fastapi import APIRouter, Request
from slowapi import Limiter

from app.core.security import decode_token


def _admin_key_func(request: Request) -> str:
    """Rate limit admin endpoints per authenticated user (extracted from JWT).

    Falls back to client IP when no valid JWT is present.
    """
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        user_code = decode_token(auth[7:])
        if user_code:
            return user_code
    return request.client.host if request.client else "unknown"


admin_limiter = Limiter(key_func=_admin_key_func)

# Sub-module imports must come AFTER admin_limiter is defined because bulk.py imports it.  # noqa: E402
from app.api.v1.admin import (  # noqa: E402
    ads,
    analytics,
    app_versions,
    audit_log,
    bulk,
    bulk_translations,
    check_ins,
    city_aliases,
    content_translations,
    export,
    groups,
    health,
    notifications,
    place_attributes,
    places,
    reviews,
    scraper_proxy,
    seo,
    stats,
    sync_places,
    translations,
    users,
)

admin_router = APIRouter(prefix="/admin", tags=["admin"])
admin_router.include_router(scraper_proxy.router, prefix="/scraper", tags=["admin-scraper"])
admin_router.include_router(users.router, tags=["admin-users"])
admin_router.include_router(places.router, tags=["admin-places"])
admin_router.include_router(reviews.router, tags=["admin-reviews"])
admin_router.include_router(check_ins.router, tags=["admin-check-ins"])
admin_router.include_router(groups.router, tags=["admin-groups"])
admin_router.include_router(bulk_translations.router, tags=["admin-bulk-translations"])
admin_router.include_router(translations.router, tags=["admin-translations"])
admin_router.include_router(app_versions.router, tags=["admin-app-versions"])
admin_router.include_router(content_translations.router, tags=["admin-content-translations"])
admin_router.include_router(place_attributes.router, tags=["admin-place-attributes"])
admin_router.include_router(stats.router, tags=["admin-stats"])
admin_router.include_router(bulk.router, tags=["admin-bulk"])
admin_router.include_router(export.router, tags=["admin-export"])
admin_router.include_router(audit_log.router, tags=["admin-audit-log"])
admin_router.include_router(notifications.router, tags=["admin-notifications"])
admin_router.include_router(seo.router, tags=["admin-seo"])
admin_router.include_router(ads.router, tags=["admin-ads"])
admin_router.include_router(health.router, tags=["admin-health"])
admin_router.include_router(analytics.router, tags=["admin-analytics"])
admin_router.include_router(sync_places.router, tags=["admin-sync-places"])
admin_router.include_router(
    city_aliases.router, prefix="/city-aliases", tags=["Admin - City Aliases"]
)
