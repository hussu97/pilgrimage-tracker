import logging
import os
import re

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


def _parse_jwt_expire(value: str) -> int:
    """Parse a duration string into minutes. Supports '7d', '24h', '30m', or integer minutes."""
    value = str(value).strip().lower()
    try:
        return int(value)
    except ValueError:
        pass
    match = re.fullmatch(r"(\d+)([dhm])", value)
    if match:
        amount, unit = int(match.group(1)), match.group(2)
        if unit == "d":
            return amount * 24 * 60
        if unit == "h":
            return amount * 60
        if unit == "m":
            return amount
    raise ValueError(
        f"Invalid duration value: '{value}'. "
        "Use '7d', '24h', '30m', or an integer number of minutes."
    )


_JWT_SECRET_DEFAULT = "dev-secret-change-in-production"
SECRET_KEY = os.environ.get("JWT_SECRET", _JWT_SECRET_DEFAULT)
if SECRET_KEY == _JWT_SECRET_DEFAULT:
    logger.warning(
        "JWT_SECRET is using the insecure default value. "
        "Set a strong random secret in production: "
        'python -c "import secrets; print(secrets.token_hex(32))"'
    )
# Access token lifetime. Default: 30 minutes.
JWT_EXPIRE = _parse_jwt_expire(os.environ.get("JWT_EXPIRE", "30m"))
# Refresh token lifetime. Default: 30 days.
REFRESH_EXPIRE = _parse_jwt_expire(os.environ.get("REFRESH_EXPIRE", "30d"))
ALGORITHM = "HS256"

# Resend.com email integration
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
RESEND_FROM_EMAIL = os.environ.get("RESEND_FROM_EMAIL", "noreply@soul-step.org")
RESET_URL_BASE = os.environ.get("RESET_URL_BASE", "http://localhost:5173")

# Public URL of this API — used in RSS/Atom feeds, robots.txt sitemap, and llms.txt.
API_BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:3000")

# Database connection string. Defaults to local SQLite for development.
_sqlite_url = "sqlite:///soulstep.db"
DATABASE_URL = os.environ.get("DATABASE_URL", _sqlite_url)

# Frontend URL (for OG share redirect)
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")

# App version enforcement (mobile only)
# Set to a semver string like "1.1.0" to enforce; leave empty to disable.
MIN_APP_VERSION_SOFT = os.environ.get("MIN_APP_VERSION_SOFT", "")
MIN_APP_VERSION_HARD = os.environ.get("MIN_APP_VERSION_HARD", "")
LATEST_APP_VERSION = os.environ.get("LATEST_APP_VERSION", "")
APP_STORE_URL_IOS = os.environ.get("APP_STORE_URL_IOS", "")
APP_STORE_URL_ANDROID = os.environ.get("APP_STORE_URL_ANDROID", "")

# Logging
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")
LOG_FORMAT = os.environ.get("LOG_FORMAT", "json")  # "json" | "text"

# Google Places API key (used for search proxy endpoints)
GOOGLE_MAPS_API_KEY = os.environ.get("GOOGLE_MAPS_API_KEY", "")

# Data scraper service URL (used by admin scraper proxy)
DATA_SCRAPER_URL = os.environ.get("DATA_SCRAPER_URL", "http://localhost:8001")

# Ads integration
ADS_ENABLED = os.environ.get("ADS_ENABLED", "false").lower() == "true"
ADSENSE_PUBLISHER_ID = os.environ.get("ADSENSE_PUBLISHER_ID", "")
ADMOB_APP_ID_IOS = os.environ.get("ADMOB_APP_ID_IOS", "")
ADMOB_APP_ID_ANDROID = os.environ.get("ADMOB_APP_ID_ANDROID", "")

# Internal service auth — shared secret used by the scraper to call write endpoints.
# Required in production; set to any placeholder string in local dev (e.g. "dev-key").
CATALOG_API_KEY = os.environ.get("CATALOG_API_KEY", "")
if not CATALOG_API_KEY:
    logger.warning(
        "CATALOG_API_KEY is not set. "
        "POST /places and POST /places/batch will reject all requests. "
        "Set a strong random key: openssl rand -hex 32"
    )

# Image storage backend
IMAGE_STORAGE = os.environ.get("IMAGE_STORAGE", "blob")  # "blob" | "gcs"
GCS_BUCKET_NAME = os.environ.get("GCS_BUCKET_NAME", "")
