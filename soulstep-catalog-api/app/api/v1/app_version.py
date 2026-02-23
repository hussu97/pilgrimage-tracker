"""GET /api/v1/app-version — returns version metadata for mobile clients.

The response lets the app decide whether to show a soft-update banner
(below min_version_soft) or hard-block (below min_version_hard).

Values come from the AppVersionConfig DB table (per-platform rows) with
env-var fallbacks when the table is empty or the row is missing.
"""

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select

from app.core import config
from app.db.models import AppVersionConfig
from app.db.session import get_db_session

router = APIRouter()


@router.get("/app-version", tags=["app-version"])
def get_app_version(
    platform: str = Query(default="ios", description="'ios' or 'android'"),
    db: Session = Depends(get_db_session),
):
    """Return version metadata for the given platform.

    No auth required — called on app startup before the user logs in.
    """
    row = db.exec(select(AppVersionConfig).where(AppVersionConfig.platform == platform)).first()

    if row:
        return {
            "min_version_soft": row.min_version_soft,
            "min_version_hard": row.min_version_hard,
            "latest_version": row.latest_version,
            "store_url": row.store_url,
        }

    # Env-var fallback
    store_url = config.APP_STORE_URL_IOS if platform == "ios" else config.APP_STORE_URL_ANDROID
    return {
        "min_version_soft": config.MIN_APP_VERSION_SOFT,
        "min_version_hard": config.MIN_APP_VERSION_HARD,
        "latest_version": config.LATEST_APP_VERSION,
        "store_url": store_url,
    }
