"""
Named constants for the SoulStep Scraper API.

Centralises all magic numbers so they can be found and changed in one place.
Import from here rather than duplicating literals across modules.
"""

# ── Sync pipeline ─────────────────────────────────────────────────────────────

# Number of places sent to the server in a single batch POST.
SYNC_BATCH_SIZE: int = 25

# Batches are sent sequentially (one at a time) to avoid overwhelming the catalog
# service. This constant is kept for reference but is no longer used as a semaphore.
SYNC_BATCH_CONCURRENCY: int = 1

# ── Detail-fetch pipeline ─────────────────────────────────────────────────────

# Number of place details written to the DB in one flush during fetch_place_details.
DETAIL_FLUSH_BATCH_SIZE: int = 10

# ── Discovery (quadtree) ──────────────────────────────────────────────────────

# Minimum bounding-box radius (metres) at which quadtree stops subdividing.
MIN_DISCOVERY_RADIUS_M: int = 500

# Google Places API hard limit for searchNearby radius (metres).
MAX_DISCOVERY_RADIUS_M: int = 50_000

# Maximum results returned by a single Google Places searchNearby call.
GMAPS_MAX_RESULTS_PER_CALL: int = 20

# ── Cache / staleness ─────────────────────────────────────────────────────────

# Default number of days before a cached place detail is considered stale.
DEFAULT_STALE_THRESHOLD_DAYS: int = 90

# ── Concurrency limits ────────────────────────────────────────────────────────

# Default max concurrent Google Maps discovery API calls.
DEFAULT_DISCOVERY_CONCURRENCY: int = 10

# Default max concurrent Google Maps detail-fetch API calls.
DEFAULT_DETAIL_CONCURRENCY: int = 20

# Default max concurrent places enriched in parallel.
DEFAULT_ENRICHMENT_CONCURRENCY: int = 10

# Number of places shown in the "currently enriching" snapshot in the activity endpoint.
ENRICHING_SNAPSHOT_LIMIT: int = 5

# ── Browser grid discovery ────────────────────────────────────────────────────

# Default side-length (km) for each fixed grid cell used in browser discovery.
BROWSER_GRID_CELL_SIZE_KM: float = 3.0

# Maximum scroll attempts before giving up on a single browser cell.
BROWSER_SCROLL_MAX_ATTEMPTS: int = 30

# Number of consecutive scrolls with no new place links before declaring the
# feed fully loaded (stable threshold).
BROWSER_SCROLL_STABLE_THRESHOLD: int = 3

# Pixels scrolled inside the results feed per scroll step.
BROWSER_SCROLL_PIXEL_STEP: int = 800

# ── Browser timeout / retry safety nets ──────────────────────────────────────

# Max seconds to wait for a browser session from the pool semaphore.
BROWSER_ACQUIRE_TIMEOUT_S: float = 90.0

# Max seconds for a single grid cell navigation (acquire → extract → release).
BROWSER_CELL_TIMEOUT_S: float = 120.0

# Max seconds for the scroll-until-stable loop inside a single cell.
BROWSER_SCROLL_TIMEOUT_S: float = 60.0

# Max seconds for a single page.evaluate() call (scroll step / link count).
BROWSER_EVALUATE_TIMEOUT_S: float = 10.0

# Max recursive retries when pool.acquire() finds all sessions busy.
BROWSER_ACQUIRE_MAX_RETRIES: int = 5

# ── Quality gate thresholds ───────────────────────────────────────────────────
# These are authoritative in app/pipeline/place_quality.py.
# Do NOT override them here — import from place_quality directly.
