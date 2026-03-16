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
    # PostgreSQL connection pool tuning. pool_size + max_overflow = max concurrent
    # connections. Raise if you see pool overflow errors during large runs.
    scraper_pool_size: int = int(os.environ.get("SCRAPER_POOL_SIZE", "10"))
    scraper_max_overflow: int = int(os.environ.get("SCRAPER_MAX_OVERFLOW", "10"))
    scraper_pool_timeout: int = int(os.environ.get("SCRAPER_POOL_TIMEOUT", "30"))

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

    # ── GCS image storage ─────────────────────────────────────────────────────
    # Required. GCS bucket for image storage.
    # Same env var and bucket as the catalog API (IMAGE_STORAGE=gcs + GCS_BUCKET_NAME).
    # Scraped images are uploaded to images/places/ — matching the catalog's
    # PREFIX_PLACES — so all place images share one folder regardless of origin.
    gcs_bucket_name: str = os.environ.get("GCS_BUCKET_NAME", "")

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
    # Number of Playwright browser contexts kept in the pool. Idle contexts are
    # reused across grid cells; only `maps_browser_concurrency` are active at once.
    # 15 contexts × ~80-200 MB each — size Cloud Run Job memory accordingly.
    maps_browser_pool_size: int = int(os.environ.get("MAPS_BROWSER_POOL_SIZE", "15"))
    # Max navigations per browser context before recycling (prevents fingerprinting).
    maps_browser_max_pages: int = int(os.environ.get("MAPS_BROWSER_MAX_PAGES", "30"))
    # Run Chromium headless (set false for local debugging).
    maps_browser_headless: bool = os.environ.get("MAPS_BROWSER_HEADLESS", "true").lower() == "true"
    # Max concurrent grid cell navigations in browser mode.
    # Each concurrent navigation needs its own Chromium context (~200 MB).
    # 10 active contexts ≈ 2 GB; ensure Cloud Run Job has enough RAM (8 GiB for 10).
    maps_browser_concurrency: int = int(os.environ.get("MAPS_BROWSER_CONCURRENCY", "10"))
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
    # sync completes. Requires CATALOG_API_KEY to be set.
    trigger_seo_after_sync: bool = (
        os.environ.get("SCRAPER_TRIGGER_SEO_AFTER_SYNC", "false").lower() == "true"
    )
    # Shared secret for the catalog API's internal endpoints.
    # Must match CATALOG_API_KEY set on the catalog API service.
    # Generate with: openssl rand -hex 32
    catalog_api_key: str = os.environ.get("CATALOG_API_KEY", "")

    def job_env_vars(self) -> dict[str, str]:
        """Return all env vars that must be forwarded to a Cloud Run Job execution.

        Only vars that the scraper *task* (not the HTTP server) needs are included.
        API-service-only vars (CORS origins, dispatcher config) are excluded.
        Empty values are omitted so they don't clobber secrets already mounted on
        the job's container definition.
        """
        raw: dict[str, str] = {
            # ── API keys / secrets ────────────────────────────────────────────
            "GOOGLE_MAPS_API_KEY": self.google_maps_api_key,
            "FOURSQUARE_API_KEY": self.foursquare_api_key,
            "OUTSCRAPER_API_KEY": self.outscraper_api_key,
            "BESTTIME_API_KEY": self.besttime_api_key,
            "GEMINI_API_KEY": self.gemini_api_key,
            "CATALOG_API_KEY": self.catalog_api_key,
            # ── Database ──────────────────────────────────────────────────────
            "DATABASE_URL": self.database_url,
            "SCRAPER_DB_PATH": self.scraper_db_path,
            "SCRAPER_POOL_SIZE": str(self.scraper_pool_size),
            "SCRAPER_MAX_OVERFLOW": str(self.scraper_max_overflow),
            "SCRAPER_POOL_TIMEOUT": str(self.scraper_pool_timeout),
            # ── Runtime ───────────────────────────────────────────────────────
            "MAIN_SERVER_URL": self.main_server_url,
            "SCRAPER_TIMEZONE": self.scraper_timezone,
            # ── Logging ───────────────────────────────────────────────────────
            "LOG_LEVEL": self.log_level,
            "LOG_FORMAT": self.log_format,
            # ── GCP / GCS ─────────────────────────────────────────────────────
            "GOOGLE_CLOUD_PROJECT": self.google_cloud_project,
            "GCS_BUCKET_NAME": self.gcs_bucket_name,
            # ── Concurrency ───────────────────────────────────────────────────
            "SCRAPER_DISCOVERY_CONCURRENCY": str(self.discovery_concurrency),
            "SCRAPER_DETAIL_CONCURRENCY": str(self.detail_concurrency),
            "SCRAPER_ENRICHMENT_CONCURRENCY": str(self.enrichment_concurrency),
            "SCRAPER_OVERPASS_CONCURRENCY": str(self.overpass_concurrency),
            "SCRAPER_OVERPASS_JITTER_MAX": str(self.overpass_jitter_max),
            "SCRAPER_MAX_PHOTOS": str(self.max_photos),
            "SCRAPER_IMAGE_CONCURRENCY": str(self.image_concurrency),
            # ── Quality gates ─────────────────────────────────────────────────
            "SCRAPER_GATE_IMAGE_DOWNLOAD": str(self.gate_image_download),
            "SCRAPER_GATE_ENRICHMENT": str(self.gate_enrichment),
            "SCRAPER_GATE_SYNC": str(self.gate_sync),
            # ── Browser / grid ────────────────────────────────────────────────
            "BROWSER_GRID_CELL_SIZE_KM": str(self.browser_grid_cell_size_km),
            "SCRAPER_BACKEND": self.scraper_backend,
            "MAPS_BROWSER_POOL_SIZE": str(self.maps_browser_pool_size),
            "MAPS_BROWSER_MAX_PAGES": str(self.maps_browser_max_pages),
            "MAPS_BROWSER_HEADLESS": str(self.maps_browser_headless).lower(),
            "MAPS_BROWSER_CONCURRENCY": str(self.maps_browser_concurrency),
            "MAPS_BROWSER_CELL_DELAY_MIN": str(self.maps_browser_cell_delay_min),
            "MAPS_BROWSER_CELL_DELAY_MAX": str(self.maps_browser_cell_delay_max),
            # ── Post-sync ─────────────────────────────────────────────────────
            "SCRAPER_TRIGGER_SEO_AFTER_SYNC": str(self.trigger_seo_after_sync).lower(),
        }
        # Drop empty strings — avoids overriding secrets already mounted on the job.
        return {k: v for k, v in raw.items() if v}


settings = Settings()
