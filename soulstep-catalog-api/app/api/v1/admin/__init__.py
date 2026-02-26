from fastapi import APIRouter

from app.api.v1.admin import (
    ads,
    app_versions,
    audit_log,
    bulk,
    check_ins,
    content_translations,
    export,
    groups,
    notifications,
    place_attributes,
    places,
    reviews,
    scraper_proxy,
    seo,
    stats,
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
