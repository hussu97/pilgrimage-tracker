import os
import re


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


SECRET_KEY = os.environ.get("JWT_SECRET", "dev-secret-change-in-production")
# Access token lifetime. Default: 30 minutes.
JWT_EXPIRE = _parse_jwt_expire(os.environ.get("JWT_EXPIRE", "30m"))
# Refresh token lifetime. Default: 30 days.
REFRESH_EXPIRE = _parse_jwt_expire(os.environ.get("REFRESH_EXPIRE", "30d"))
ALGORITHM = "HS256"

# Resend.com email integration
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
RESEND_FROM_EMAIL = os.environ.get("RESEND_FROM_EMAIL", "noreply@pilgrimage-tracker.app")
RESET_URL_BASE = os.environ.get("RESET_URL_BASE", "http://localhost:5173")

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
