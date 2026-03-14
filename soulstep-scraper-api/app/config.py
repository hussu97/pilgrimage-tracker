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

    # ── Quality gate thresholds (0.0–1.0) ────────────────────────────────────
    # Tune per-run via env vars to allow more/fewer places through each gate.
    gate_image_download: float = float(os.environ.get("SCRAPER_GATE_IMAGE_DOWNLOAD", "0.75"))
    gate_enrichment: float = float(os.environ.get("SCRAPER_GATE_ENRICHMENT", "0.75"))
    gate_sync: float = float(os.environ.get("SCRAPER_GATE_SYNC", "0.75"))

    # ── Browser grid discovery ────────────────────────────────────────────────
    # Side-length (km) for each fixed grid cell in browser discovery mode.
    browser_grid_cell_size_km: float = float(os.environ.get("BROWSER_GRID_CELL_SIZE_KM", "3.0"))

    # ── Browser scraper backend ───────────────────────────────────────────────
    # Toggle between Google Places API (default) and browser-based scraping.
    # SCRAPER_BACKEND=browser uses Playwright at $0 API cost (slower, stealth-based).
    # SCRAPER_BACKEND=api  uses Google Places API (fast, reliable, costs ~$8/10K places).
    scraper_backend: str = os.environ.get("SCRAPER_BACKEND", "api")
    # Number of concurrent Playwright browser contexts for Maps scraping.
    maps_browser_pool_size: int = int(os.environ.get("MAPS_BROWSER_POOL_SIZE", "3"))
    # Max navigations per browser context before recycling (prevents fingerprinting).
    maps_browser_max_pages: int = int(os.environ.get("MAPS_BROWSER_MAX_PAGES", "30"))
    # Run Chromium headless (set false for local debugging).
    maps_browser_headless: bool = os.environ.get("MAPS_BROWSER_HEADLESS", "true").lower() == "true"
    # Max concurrent grid cell navigations in browser mode.
    # Keep at 1 (sequential) to avoid triggering Google's concurrent-request bot detection.
    # Raise to 2 only if you have rotating proxies / multiple IPs.
    maps_browser_concurrency: int = int(os.environ.get("MAPS_BROWSER_CONCURRENCY", "1"))
    # Random delay range (seconds) injected between consecutive cell navigations.
    # Mimics human think-time between page visits.
    maps_browser_cell_delay_min: float = float(os.environ.get("MAPS_BROWSER_CELL_DELAY_MIN", "5.0"))
    maps_browser_cell_delay_max: float = float(
        os.environ.get("MAPS_BROWSER_CELL_DELAY_MAX", "12.0")
    )

    # ── Job dispatcher ────────────────────────────────────────────────────────
    # Controls how scraper runs are dispatched after POST /runs.
    # SCRAPER_DISPATCH=local       (default) runs in-process via BackgroundTasks.
    #                               No GCP required; works locally and in simple deployments.
    # SCRAPER_DISPATCH=cloud_run   dispatches a Cloud Run Job execution.
    #                               Requires CLOUD_RUN_JOB_NAME, CLOUD_RUN_REGION,
    #                               and GOOGLE_CLOUD_PROJECT to be set.
    scraper_dispatch: str = os.environ.get("SCRAPER_DISPATCH", "local")
    # Cloud Run Job name (without project/region prefix).
    cloud_run_job_name: str = os.environ.get("CLOUD_RUN_JOB_NAME", "soulstep-scraper-job")
    # Cloud Run region for job dispatch.
    cloud_run_region: str = os.environ.get("CLOUD_RUN_REGION", "us-central1")

    # ── Post-sync automation ──────────────────────────────────────────────────
    # If true, automatically call the catalog API's SEO generation endpoint after
    # sync completes. Requires SCRAPER_CATALOG_ADMIN_TOKEN to be set.
    trigger_seo_after_sync: bool = (
        os.environ.get("SCRAPER_TRIGGER_SEO_AFTER_SYNC", "false").lower() == "true"
    )
    # JWT Bearer token for the catalog API admin endpoints.
    # Obtain by logging in as an admin user: POST /api/v1/auth/login
    catalog_admin_token: str = os.environ.get("SCRAPER_CATALOG_ADMIN_TOKEN", "")


settings = Settings()
