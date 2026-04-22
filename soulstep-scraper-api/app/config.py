"""
Centralised application configuration.

All environment variables are read here once at import time.  Import `settings`
from this module rather than calling ``os.environ.get()`` in individual files.

Defaults are chosen to work out-of-the-box in local development (SQLite, no
external API keys required).
"""

from __future__ import annotations

import os

from dotenv import load_dotenv

load_dotenv()


class Settings:
    """Flat namespace for all configuration values used across the scraper API."""

    # ── Optional collector keys ───────────────────────────────────────────────
    foursquare_api_key: str = os.environ.get("FOURSQUARE_API_KEY", "")
    outscraper_api_key: str = os.environ.get("OUTSCRAPER_API_KEY", "")
    besttime_api_key: str = os.environ.get("BESTTIME_API_KEY", "")
    gemini_api_key: str = os.environ.get("GEMINI_API_KEY", "")

    # ── Database ──────────────────────────────────────────────────────────────
    database_url: str = os.environ.get("DATABASE_URL", "")
    # When SCRAPER_DISPATCH=cloud_run, the Cloud Run Job must reach postgres via
    # the VM's internal GCP IP (through Serverless VPC connector), not the
    # docker-internal hostname "postgres" that the API container uses.
    # Set this to postgresql://user:pass@10.132.0.2:5432/soulstep_scraper on the VM.
    # Falls back to database_url when unset (local dev, where dispatch is local anyway).
    scraper_cloud_run_database_url: str = os.environ.get("SCRAPER_CLOUD_RUN_DATABASE_URL", "")
    scraper_db_path: str = os.environ.get("SCRAPER_DB_PATH", "scraper.db")
    # PostgreSQL connection pool tuning. pool_size + max_overflow = max concurrent
    # connections this process can hold. Cloud SQL small instances (db-f1-micro,
    # db-g1-small) have max_connections=25-50, shared with the catalog API.
    # Keep pool_size + max_overflow ≤ 7 to leave headroom for the catalog API.
    # Raise SCRAPER_POOL_SIZE / SCRAPER_MAX_OVERFLOW on larger Cloud SQL tiers.
    scraper_pool_size: int = int(os.environ.get("SCRAPER_POOL_SIZE", "10"))
    scraper_max_overflow: int = int(os.environ.get("SCRAPER_MAX_OVERFLOW", "5"))
    scraper_pool_timeout: int = int(os.environ.get("SCRAPER_POOL_TIMEOUT", "30"))

    # ── Runtime ───────────────────────────────────────────────────────────────
    main_server_url: str = os.environ.get("MAIN_SERVER_URL", "http://127.0.0.1:3000")
    # Public URL forwarded to Cloud Run jobs instead of MAIN_SERVER_URL.
    # Set this when the scraper-API container uses a Docker-internal hostname
    # (e.g. http://catalog-api:3000) that Cloud Run jobs cannot resolve.
    cloud_run_catalog_url: str = os.environ.get("CLOUD_RUN_CATALOG_URL", "")
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
    # Primary discovery throughput knob: max concurrent browser grid-cell
    # navigations during the discovery phase.
    discovery_concurrency: int = int(os.environ.get("SCRAPER_DISCOVERY_CONCURRENCY", "15"))
    # Max concurrent browser detail-fetch workers. This is still capped by the
    # active browser pool sem when MAPS_BROWSER_CONCURRENCY is explicitly set.
    detail_concurrency: int = int(os.environ.get("SCRAPER_DETAIL_CONCURRENCY", "8"))
    # Max concurrent places enriched in parallel. Keep ≤ pool_size so each
    # concurrent worker can always get a DB connection without overflow.
    enrichment_concurrency: int = int(os.environ.get("SCRAPER_ENRICHMENT_CONCURRENCY", "5"))
    # Max concurrent Overpass API calls (across all enrichment workers).
    overpass_concurrency: int = int(os.environ.get("SCRAPER_OVERPASS_CONCURRENCY", "2"))
    # Max jitter sleep (seconds) added before each Overpass call to spread burst.
    overpass_jitter_max: float = float(os.environ.get("SCRAPER_OVERPASS_JITTER_MAX", "1.5"))
    # Max photos stored per place. Billed at $0.007/1000 per photo media request.
    # 3 is enough for list cards + detail hero; raise to 5-10 only if needed.
    max_photos: int = int(os.environ.get("SCRAPER_MAX_PHOTOS", "3"))
    # Max reviews scraped per place (from Google Places API and browser extraction).
    max_reviews: int = int(os.environ.get("SCRAPER_MAX_REVIEWS", "5"))
    # Max review-attached photos downloaded per review (browser mode only).
    # Each review photo is uploaded to GCS and stored on the Review record.
    # Default: 2
    max_review_images: int = int(os.environ.get("SCRAPER_MAX_REVIEW_IMAGES", "2"))
    # Max concurrent image downloads (plain CDN, no API rate limit).
    image_concurrency: int = int(os.environ.get("SCRAPER_IMAGE_CONCURRENCY", "40"))
    # Minimum number of detail-fetch attempts before the auto-pause fail-fast
    # logic becomes eligible. Raise carefully: very high values can let a
    # systemic outage burn hours of Cloud Run time before pausing.
    fail_fast_min_attempts: int = int(os.environ.get("SCRAPER_FAIL_FAST_MIN_ATTEMPTS", "500"))

    # ── Quality gate thresholds (0.0–1.0) ────────────────────────────────────
    # Tune per-run via env vars to allow more/fewer places through each gate.
    gate_image_download: float = float(os.environ.get("SCRAPER_GATE_IMAGE_DOWNLOAD", "0.75"))
    gate_enrichment: float = float(os.environ.get("SCRAPER_GATE_ENRICHMENT", "0.75"))
    gate_sync: float = float(os.environ.get("SCRAPER_GATE_SYNC", "0.75"))

    # ── Browser grid discovery ────────────────────────────────────────────────
    # Side-length (km) for each fixed grid cell in browser discovery mode.
    browser_grid_cell_size_km: float = float(os.environ.get("BROWSER_GRID_CELL_SIZE_KM", "3.0"))

    # ── Browser scraper ───────────────────────────────────────────────────────
    # Number of Playwright browser contexts kept in the pool. If unset, discovery
    # follows SCRAPER_DISCOVERY_CONCURRENCY so there is no hidden lower cap.
    # Idle contexts are reused across grid cells; only `maps_browser_concurrency`
    # are active at once.
    maps_browser_pool_size: int = int(
        os.environ.get("MAPS_BROWSER_POOL_SIZE")
        or os.environ.get("SCRAPER_DISCOVERY_CONCURRENCY", "15")
    )
    # Max navigations per browser context before recycling (prevents fingerprinting).
    maps_browser_max_pages: int = int(os.environ.get("MAPS_BROWSER_MAX_PAGES", "30"))
    # Run Chromium headless (set false for local debugging).
    maps_browser_headless: bool = os.environ.get("MAPS_BROWSER_HEADLESS", "true").lower() == "true"
    # Max concurrent active browser navigations. If unset, discovery uses
    # SCRAPER_DISCOVERY_CONCURRENCY directly; set this only to override the
    # browser-pool cap independently (for example, detail fetch tuning).
    maps_browser_concurrency: int = int(
        os.environ.get("MAPS_BROWSER_CONCURRENCY")
        or os.environ.get("SCRAPER_DISCOVERY_CONCURRENCY", "15")
    )
    # Comma-separated proxy URLs for browser contexts (e.g. "http://proxy1:8080,http://proxy2:8080").
    # Empty = no proxy. Each new context picks the next proxy in rotation.
    browser_proxy_list: str = os.environ.get("BROWSER_PROXY_LIST", "")
    # Proxy rotation strategy: "round_robin" or "random".
    browser_proxy_rotation: str = os.environ.get("BROWSER_PROXY_ROTATION", "round_robin")
    # Random delay range (seconds) injected between consecutive cell navigations.
    # Keeps some human-like pacing without dominating long country-scale runs.
    maps_browser_cell_delay_min: float = float(os.environ.get("MAPS_BROWSER_CELL_DELAY_MIN", "1.0"))
    maps_browser_cell_delay_max: float = float(os.environ.get("MAPS_BROWSER_CELL_DELAY_MAX", "2.0"))

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
    # Multi-region capacity config.  Format: "region1:max_jobs,region2:max_jobs,..."
    # Each region has its own independent Cloud Run quota — spreading jobs across
    # regions avoids exhausting a single region's per-project CPU/memory limits.
    # Falls back to cloud_run_region with max_jobs=5 when unset.
    cloud_run_regions: str = os.environ.get("CLOUD_RUN_REGIONS", "")

    @property
    def region_capacity(self) -> list[dict]:
        """Return [{region: str, max_jobs: int}, ...] parsed from CLOUD_RUN_REGIONS."""
        if self.cloud_run_regions:
            result = []
            for entry in self.cloud_run_regions.split(","):
                entry = entry.strip()
                if not entry:
                    continue
                if ":" in entry:
                    region, cap = entry.split(":", 1)
                    result.append({"region": region.strip(), "max_jobs": int(cap.strip())})
                else:
                    result.append({"region": entry, "max_jobs": 5})
            return result
        return [{"region": self.cloud_run_region, "max_jobs": 5}]

    @property
    def available_regions(self) -> list[str]:
        """Return list of region names from region_capacity."""
        return [r["region"] for r in self.region_capacity]

    @property
    def total_max_jobs(self) -> int:
        """Sum of max_jobs across all configured regions."""
        return sum(r["max_jobs"] for r in self.region_capacity)

    # ── Post-sync automation ──────────────────────────────────────────────────
    # If true, automatically sync to the catalog API immediately after enrichment
    # completes (no manual POST /runs/{code}/sync step needed). Requires MAIN_SERVER_URL
    # and CATALOG_API_KEY to be set.
    auto_sync_after_run: bool = (
        os.environ.get("SCRAPER_AUTO_SYNC_AFTER_RUN", "true").lower() == "true"
    )
    # If true, automatically call the catalog API's SEO generation endpoint after
    # sync completes. Requires CATALOG_API_KEY to be set.
    trigger_seo_after_sync: bool = (
        os.environ.get("SCRAPER_TRIGGER_SEO_AFTER_SYNC", "true").lower() == "true"
    )
    # Shared secret for the catalog API's internal endpoints.
    # Must match CATALOG_API_KEY set on the catalog API service.
    # Generate with: openssl rand -hex 32
    catalog_api_key: str = os.environ.get("CATALOG_API_KEY", "")

    # ── Observability ─────────────────────────────────────────────────────────
    sentry_dsn: str = os.environ.get("SENTRY_DSN", "")

    def job_env_vars(self) -> dict[str, str]:
        """Return all env vars that must be forwarded to a Cloud Run Job execution.

        Only vars that the scraper *task* (not the HTTP server) needs are included.
        API-service-only vars (CORS origins, dispatcher config) are excluded.
        Empty values are omitted so they don't clobber secrets already mounted on
        the job's container definition.
        """
        raw: dict[str, str] = {
            # ── API keys / secrets ────────────────────────────────────────────
            "FOURSQUARE_API_KEY": self.foursquare_api_key,
            "OUTSCRAPER_API_KEY": self.outscraper_api_key,
            "BESTTIME_API_KEY": self.besttime_api_key,
            "GEMINI_API_KEY": self.gemini_api_key,
            "CATALOG_API_KEY": self.catalog_api_key,
            # ── Database ──────────────────────────────────────────────────────
            "DATABASE_URL": self.scraper_cloud_run_database_url or self.database_url,
            "SCRAPER_DB_PATH": self.scraper_db_path,
            "SCRAPER_POOL_SIZE": str(self.scraper_pool_size),
            "SCRAPER_MAX_OVERFLOW": str(self.scraper_max_overflow),
            "SCRAPER_POOL_TIMEOUT": str(self.scraper_pool_timeout),
            # ── Runtime ───────────────────────────────────────────────────────
            "MAIN_SERVER_URL": self.cloud_run_catalog_url or self.main_server_url,
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
            "SCRAPER_MAX_REVIEWS": str(self.max_reviews),
            "SCRAPER_MAX_REVIEW_IMAGES": str(self.max_review_images),
            "SCRAPER_IMAGE_CONCURRENCY": str(self.image_concurrency),
            "SCRAPER_FAIL_FAST_MIN_ATTEMPTS": str(self.fail_fast_min_attempts),
            # ── Quality gates ─────────────────────────────────────────────────
            "SCRAPER_GATE_IMAGE_DOWNLOAD": str(self.gate_image_download),
            "SCRAPER_GATE_ENRICHMENT": str(self.gate_enrichment),
            "SCRAPER_GATE_SYNC": str(self.gate_sync),
            # ── Browser / grid ────────────────────────────────────────────────
            "BROWSER_GRID_CELL_SIZE_KM": str(self.browser_grid_cell_size_km),
            "MAPS_BROWSER_POOL_SIZE": str(self.maps_browser_pool_size),
            "MAPS_BROWSER_MAX_PAGES": str(self.maps_browser_max_pages),
            "MAPS_BROWSER_HEADLESS": str(self.maps_browser_headless).lower(),
            "MAPS_BROWSER_CONCURRENCY": str(self.maps_browser_concurrency),
            "MAPS_BROWSER_CELL_DELAY_MIN": str(self.maps_browser_cell_delay_min),
            "MAPS_BROWSER_CELL_DELAY_MAX": str(self.maps_browser_cell_delay_max),
            "BROWSER_PROXY_LIST": self.browser_proxy_list,
            "BROWSER_PROXY_ROTATION": self.browser_proxy_rotation,
            # Pass-throughs (no typed setting — read directly in worker code)
            "BROWSER_SOCS_COOKIE": os.environ.get("BROWSER_SOCS_COOKIE", ""),
            "MEMORY_LIMIT_MB": os.environ.get("MEMORY_LIMIT_MB", ""),
            "WIKIPEDIA_MAX_DISTANCE_KM": os.environ.get("WIKIPEDIA_MAX_DISTANCE_KM", ""),
            # ── Post-sync ─────────────────────────────────────────────────────
            "SCRAPER_AUTO_SYNC_AFTER_RUN": str(self.auto_sync_after_run).lower(),
            "SCRAPER_TRIGGER_SEO_AFTER_SYNC": str(self.trigger_seo_after_sync).lower(),
            # ── Observability ──────────────────────────────────────────────────
            "SENTRY_DSN": self.sentry_dsn,
        }
        # Drop empty strings — avoids overriding secrets already mounted on the job.
        return {k: v for k, v in raw.items() if v}


settings = Settings()
