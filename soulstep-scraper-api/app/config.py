"""
Centralised application configuration.

All environment variables are read here once at import time.  Import `settings`
from this module rather than calling ``os.environ.get()`` in individual files.

Defaults are chosen to work out-of-the-box in local development (SQLite, no
external API keys required except Google Maps for actual scraping).
"""

from __future__ import annotations

import os

from dotenv import load_dotenv

load_dotenv()


class Settings:
    """Flat namespace for all configuration values used across the scraper API."""

    # ── Required ──────────────────────────────────────────────────────────────
    google_maps_api_key: str = os.environ.get("GOOGLE_MAPS_API_KEY", "")

    # ── Optional collector keys ───────────────────────────────────────────────
    foursquare_api_key: str = os.environ.get("FOURSQUARE_API_KEY", "")
    outscraper_api_key: str = os.environ.get("OUTSCRAPER_API_KEY", "")
    besttime_api_key: str = os.environ.get("BESTTIME_API_KEY", "")
    gemini_api_key: str = os.environ.get("GEMINI_API_KEY", "")

    # ── Database ──────────────────────────────────────────────────────────────
    database_url: str = os.environ.get("DATABASE_URL", "")
    scraper_db_path: str = os.environ.get("SCRAPER_DB_PATH", "scraper.db")

    # ── Runtime ───────────────────────────────────────────────────────────────
    main_server_url: str = os.environ.get("MAIN_SERVER_URL", "http://127.0.0.1:3000")
    scraper_allowed_origins: str = os.environ.get(
        "SCRAPER_ALLOWED_ORIGINS",
        "http://localhost:5174,http://127.0.0.1:5174",
    )
    scraper_timezone: str = os.environ.get("SCRAPER_TIMEZONE", "")

    # ── Logging ───────────────────────────────────────────────────────────────
    log_level: str = os.environ.get("LOG_LEVEL", "INFO")
    log_format: str = os.environ.get("LOG_FORMAT", "text")

    # ── GCP (Cloud Run) ───────────────────────────────────────────────────────
    google_cloud_project: str = os.environ.get("GOOGLE_CLOUD_PROJECT", "")

    # ── Concurrency (configurable via env for tuning) ─────────────────────────
    # Max concurrent Google Places searchNearby calls during discovery.
    discovery_concurrency: int = int(os.environ.get("SCRAPER_DISCOVERY_CONCURRENCY", "10"))
    # Max concurrent Google Places getDetails calls during detail fetch.
    detail_concurrency: int = int(os.environ.get("SCRAPER_DETAIL_CONCURRENCY", "20"))
    # Max concurrent places enriched in parallel.
    enrichment_concurrency: int = int(os.environ.get("SCRAPER_ENRICHMENT_CONCURRENCY", "10"))
    # Max concurrent Overpass API calls (across all enrichment workers).
    overpass_concurrency: int = int(os.environ.get("SCRAPER_OVERPASS_CONCURRENCY", "2"))
    # Max jitter sleep (seconds) added before each Overpass call to spread burst.
    overpass_jitter_max: float = float(os.environ.get("SCRAPER_OVERPASS_JITTER_MAX", "1.5"))
    # Max photos stored per place. Billed at $0.007/1000 per photo media request.
    # 3 is enough for list cards + detail hero; raise to 5-10 only if needed.
    max_photos: int = int(os.environ.get("SCRAPER_MAX_PHOTOS", "3"))
    # Max concurrent image downloads (plain CDN, no API rate limit).
    image_concurrency: int = int(os.environ.get("SCRAPER_IMAGE_CONCURRENCY", "40"))


settings = Settings()
