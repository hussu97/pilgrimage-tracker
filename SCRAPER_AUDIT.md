# SoulStep Scraper API — Deep Audit (Browser Automation Method)

> **Date**: 2026-03-19
> **Scope**: `soulstep-scraper-api/` — browser-based scraper job (`SCRAPER_BACKEND=browser`)

---

## Table of Contents

1. [Pipeline Stages](#1-pipeline-stages)
2. [Caching Mechanisms](#2-caching-mechanisms)
3. [Retry Mechanisms](#3-retry-mechanisms)
4. [Concurrency Controls](#4-concurrency-controls)
5. [Rate Limiting](#5-rate-limiting)
6. [Failsafe & Error Handling](#6-failsafe--error-handling)
7. [Browser Pool Management](#7-browser-pool-management)
8. [Roadmap: Issues, Improvements & Enhancements](#8-roadmap)

---

## 1. Pipeline Stages

### Entry Point

| Step | File | Description |
|------|------|-------------|
| Trigger | `app/api/v1/scraper.py` | `POST /runs` with a `DataLocation` code |
| Record | `app/db/scraper.py` | Creates `ScraperRun` with status `"queued"` |
| Fan-out | `app/api/v1/scraper.py` | Country-level scans in Cloud Run mode split into multiple runs (one per geo box) |
| Dispatch | `app/jobs/dispatcher.py` | **Local**: BackgroundTasks in a dedicated OS thread with its own asyncio loop. **Cloud Run**: dispatches a Cloud Run Job container via GCP API |
| Job entry | `app/jobs/run.py` | Reads `SCRAPER_RUN_CODE` + `SCRAPER_RUN_ACTION` env vars, calls `run_scraper_task()` or `resume_scraper_task()` |

### Orchestrator: `run_scraper_task()` (`app/db/scraper.py`)

```
1. Load ScraperRun → set status "running"
2. Load DataLocation config
3. run_gmaps_scraper(run_code, config, session)     ← Discovery + Detail Fetch
4. run_enrichment_pipeline(run_code)                 ← External data enrichment
5. (optional) sync_run_to_server_async()             ← Push to catalog API
6. Mark status "completed" (or "cancelled")
```

### Stage 1: Browser-Based Discovery

**File**: `app/scrapers/gmaps_browser.py` → `run_gmaps_scraper_browser()`

| Sub-stage | What happens |
|-----------|-------------|
| **1a — Grid generation** | Load geographic boundary (city/country). Generate fixed 3km × 3km grid cells covering the boundary. If constrained to a geo box (from fan-out), filter cells to that box. Initialize shared structures: `ThreadSafeIdSet` (cross-type dedup), `GlobalCellStore` (cross-run cache), memory monitor (logs RSS every 30s, triggers `gc.collect()` at >80%), cancellation watcher (polls DB every 10s), progress callback. |
| **1b — Per-type grid search** | For each active place type (mosque, church, temple, etc.), run `_run_type_pass()`. Up to 3 place types processed concurrently (`TYPE_CONCURRENCY = 3`). Each type runs `search_grid_browser()` across all grid cells. |
| **1b.i — Cell search** | For each cell: check per-run cache → check global cache → if not cached, acquire browser session from pool → navigate to `google.com/maps/search/{type}/@{lat},{lng},{zoom}z` → dismiss GDPR consent banner → check for bot detection (reCAPTCHA, "unusual traffic") → if blocked, recycle session and return empty → wait for results panel → scroll until stable (exponential backoff, max 30 scrolls, 60s timeout) → extract `<a href="/maps/place/...">` links → parse place IDs (ChIJ or hex CID format) → deduplicate → save to per-run + global caches → random 5–12s delay between cells. |
| **1c — Summary** | Merge all place IDs across all types. Update `run.total_items`. Set `run.stage = "detail_fetch"`. |

### Stage 2: Detail Fetch

**File**: `app/scrapers/gmaps_browser.py` → calls `app/scrapers/gmaps.py::fetch_place_details()`

Uses `BrowserGmapsCollector` to fetch place details **without Google Maps API key**.

| Step | Description |
|------|-------------|
| Dedup check | Skip places already fetched in this run |
| Cache check | Query `GlobalGmapsCache` for entries fresher than 90 days |
| Parallel fetch | Split into workers with semaphore (default 20 concurrent). For each place: navigate to place page → extract all details (address, phone, hours, reviews, photos) → `build_place_data()` transforms into standardized format with computed fields (place code, extracted address components, rating, hours, reviews up to 5, review photos up to 2/review, place photos up to 3) |
| Quality scoring | Compute quality score (0–1) based on name specificity, address completeness, rating, review count, hours, description length, location accuracy |
| Batch writes | Every 10 places: create `ScrapedPlace` record with `raw_data` JSON, upload browser-captured images to GCS, update `run.processed_items` |

### Stage 3: Image Download & GCS Upload

**File**: `app/collectors/gmaps.py::download_place_images()`

| Step | Description |
|------|-------------|
| Extract URLs | From `raw_data` (already captured by browser during detail fetch) |
| Parallel download | Concurrency limit: 40 concurrent CDN downloads |
| GCS upload | `images/places/{run_code}/{place_code}/{hash}.jpg` for place photos; `images/reviews/{run_code}/{place_code}/{review_idx}/{hash}.jpg` for review photos |
| DB update | Update `ScrapedPlace.raw_data` with GCS URLs |

### Stage 4: Enrichment Pipeline

**File**: `app/pipeline/enrichment.py::run_enrichment_pipeline()`

| Sub-stage | Description |
|-----------|-------------|
| **4a — Quality gate** | Filter out places with quality score below `GATE_ENRICHMENT` (0.75). Mark as `enrichment_status = "filtered"`. |
| **4b — Name check** | Skip enrichment for generic names (bare type words like "Mosque", single-word names). Mark as `enrichment_status = "complete"`. |
| **4c — Phased enrichment** | Up to 5 places enriched concurrently. Each place runs 3 dependency phases: |
| Phase 0 (sequential) | **OSM collector** — query OpenStreetMap tags, building class, address |
| Phase 1 (concurrent) | **Wikipedia + Wikidata** — article, description, sameAs links, founding date (uses OSM tags from Phase 0) |
| Phase 2 (concurrent) | **Foursquare, Outscraper, BestTime, Knowledge Graph, Gemini LLM** — venue details, reviews, busyness, semantic data, description tie-breaking |
| Merge | `merge_collector_results()` → final description, tags, confidence scores. Raw responses stored in `RawCollectorData` table. |

### Stage 5: Auto-Sync (Optional)

**File**: `app/db/scraper.py::sync_run_to_server_async()`

If `AUTO_SYNC_AFTER_RUN = true`: batch places into chunks of 25, POST to `MAIN_SERVER_URL/api/v1/admin/scraper/{run_code}/sync`, track success/failure per place.

---

## 2. Caching Mechanisms

### 2.1 Global Cross-Run Discovery Cache (`GlobalCellStore`)

| Property | Value |
|----------|-------|
| **File** | `app/scrapers/cell_store.py` |
| **Purpose** | Avoid repeated discovery calls across multiple runs |
| **TTL** | 30 days (configurable via `DEFAULT_TTL_DAYS`) |
| **Key** | `(lat_min, lat_max, lng_min, lng_max, place_type, discovery_method)` |
| **Persistence** | `GlobalDiscoveryCell` table in scraper DB |
| **Pre-loading** | Non-expired cells loaded on init via date cutoff |
| **Thread-safety** | `threading.Lock()` for in-memory dict; fresh `Session` per DB write |
| **Hit rate** | After month 1, recurring runs skip 95%+ of discovery calls |
| **Storage** | List of resource names + result count + saturation flag + `searched_at` |

### 2.2 Per-Run Cell Cache (`DiscoveryCellStore`)

| Property | Value |
|----------|-------|
| **File** | `app/scrapers/cell_store.py` |
| **Purpose** | Resume interrupted runs by skipping already-searched cells |
| **Scope** | Single `(run_code, place_type, discovery_method)` tuple |
| **Persistence** | `DiscoveryCell` table |
| **Key** | `(lat_min, lat_max, lng_min, lng_max)` rounded to 8 decimals (~1mm) |
| **Operations** | `pre_seed_id_set()` loads resource names at start; `save()` persists immediately after each search (idempotent); `get()` returns cached cell or None |
| **Thread-safety** | `threading.Lock()` for DB writes (prevents SQLite "database is locked") |

### 2.3 Global GMaps Detail Cache (`GlobalGmapsCacheStore`)

| Property | Value |
|----------|-------|
| **File** | `app/scrapers/gmaps_cache.py` |
| **Purpose** | Cache raw Google Maps `getPlace` API responses per place |
| **TTL** | 90 days (`DEFAULT_STALE_THRESHOLD_DAYS`) |
| **Key** | `place_code` (unique) |
| **Persistence** | `GlobalGmapsCache` table |
| **Storage** | `raw_response` JSON + `quality_score` float + `cached_at` |
| **Race-safety** | IntegrityError handled by upsert (update existing entry) |
| **Pre-loading** | Non-expired entries loaded on init |

### 2.4 In-Memory Browser Session Pool

| Property | Value |
|----------|-------|
| **File** | `app/services/browser_pool.py` |
| **Purpose** | Reuse Playwright browser contexts across navigations |
| **Pool size** | `MAPS_BROWSER_POOL_SIZE` (default 8) |
| **Recycling** | After `MAPS_BROWSER_MAX_PAGES` (default 30) navigations |
| **Dead eviction** | On acquire, closed/dead sessions detected and removed |
| **Anti-fingerprinting** | Each context gets unique user agent, viewport, timezone |

### Summary: What Is Avoided on Rerun

| What | Cache Layer | Avoided Work |
|------|-------------|-------------|
| Already-searched grid cells (same run) | Per-run `DiscoveryCellStore` | Browser navigation + scroll + parse |
| Already-searched grid cells (any run, <30d) | Global `GlobalCellStore` | Same as above, cross-run |
| Already-fetched place details (<90d) | `GlobalGmapsCacheStore` | Browser navigation to place page |
| Already-enriched places | `enrichment_status != "pending"` check | All collector API calls |
| Already-synced places | `sync_status` field on `ScrapedPlace` | Catalog API POST |

---

## 3. Retry Mechanisms

### 3.1 HTTP Rate Limit Retry (429)

| Property | Value |
|----------|-------|
| **File** | `app/scrapers/base.py` (`async_request_with_backoff`) |
| **Trigger** | HTTP 429 |
| **Max retries** | 5 |
| **Backoff** | `5 * 2^attempt` (5s, 10s, 20s, 40s, 80s) |
| **Scope** | All async HTTP requests (collector API calls) |

### 3.2 Transient Network Error Retry

| Property | Value |
|----------|-------|
| **File** | `app/scrapers/base.py` (`async_request_with_backoff`) |
| **Errors** | `httpx.ReadTimeout`, `httpx.ConnectTimeout`, `httpx.ConnectError` |
| **Max retries** | 5 |
| **Backoff** | Same exponential as 429 |
| **Non-retryable** | Other exceptions → logged, return None |

### 3.3 Browser Cell Retry

| Property | Value |
|----------|-------|
| **File** | `app/scrapers/gmaps_browser.py` (`search_area_browser`) |
| **Max retries** | `BROWSER_CELL_MAX_RETRIES = 2` |
| **Backoff** | `2^attempt + random(0, 1)` (released outside semaphore so no slot held) |
| **Non-retryable** | `BlockedError` (CAPTCHA), `CircuitOpenError`, `AcquireTimeoutError` → return empty |
| **Retryable** | `TargetClosedError`, timeout, DOM errors → retry with backoff |
| **On error** | Failed session force-recycled |

### 3.4 Browser Session Acquire Retry

| Property | Value |
|----------|-------|
| **File** | `app/services/browser_pool.py` (`acquire()`) |
| **Max retries** | `BROWSER_ACQUIRE_MAX_RETRIES = 5` |
| **Triggers** | Semaphore timeout, pool exhaustion, Chromium crash (`TargetClosedError`) |
| **Backoff** | `min(1.0 * 2^attempt, 16.0)` (1s, 2s, 4s, 8s, 16s) |
| **Semaphore timeout** | 90s (`BROWSER_ACQUIRE_TIMEOUT_S`) |
| **Dead detection** | Checks `is_connected()`, auto-reinits on failure |

### 3.5 Sync to Catalog Retry

| Property | Value |
|----------|-------|
| **File** | `app/db/scraper.py` (`_post_batch_async`) |
| **Max retries** | `_MAX_HTTP_RETRIES = 3` |
| **Backoff** | `2^attempt` (2s, 4s) |
| **Retryable** | 503, 504, 429 |
| **Non-retryable** | 4xx, 500 → logged as failure |
| **Granularity** | Each batch (25 places) retried independently |

---

## 4. Concurrency Controls

| Component | Type | Default | Config Env | Purpose |
|-----------|------|---------|-----------|---------|
| Discovery API calls | Semaphore | 10 | `SCRAPER_DISCOVERY_CONCURRENCY` | searchNearby throttle |
| Detail fetch | Semaphore | 20 | `SCRAPER_DETAIL_CONCURRENCY` | getPlace throttle |
| Browser navigations | Semaphore | 8 | `MAPS_BROWSER_CONCURRENCY` | Active browser navigations |
| Browser pool | Pool | 8 | `MAPS_BROWSER_POOL_SIZE` | Playwright context reuse (~200MB each) |
| Place type passes | Constant | 3 | `TYPE_CONCURRENCY` | Concurrent type passes in discovery |
| Enrichment places | Semaphore | 5 | `SCRAPER_ENRICHMENT_CONCURRENCY` | Per-place parallelism |
| Overpass API | Semaphore | 2 | `SCRAPER_OVERPASS_CONCURRENCY` | OSM public API limit |
| Image downloads | Semaphore | 40 | `SCRAPER_IMAGE_CONCURRENCY` | CDN parallel requests |
| DB connections | Pool | 10+5 | `SCRAPER_POOL_SIZE` + `_MAX_OVERFLOW` | SQLAlchemy connection pool |
| Rate limiter burst | Token-bucket | 3 | (hardcoded) | Per-endpoint token allowance |
| Sync batches | Constant | 1 | `SYNC_BATCH_CONCURRENCY` | Sequential sync to catalog |

**Memory footprint estimate**: 8 browser contexts × ~200MB ≈ 1.6 GB. Cloud Run Jobs should have 8 GiB.

---

## 5. Rate Limiting

### Token-Bucket Rate Limiter (`app/scrapers/base.py`)

| Endpoint | RPS | Notes |
|----------|-----|-------|
| `gmaps_search` | 10 | searchNearby throttle |
| `gmaps_details` | 15 | getPlace throttle |
| `gmaps_photo` | 15 | Photo CDN |
| `overpass` | 5 | Public OSM API |
| `wikipedia` | 5 | Wikimedia API |
| `wikidata` | 5 | Wikidata SPARQL |
| `knowledge_graph` | 2 | Google KG API |
| `besttime` | 1–2 | Busyness API |
| `foursquare` | 1–2 | Venue API |
| `outscraper` | 1–2 | Review scraping |

- **Burst**: Up to 3 tokens consumed immediately before refill
- **Thread-safe**: Per-endpoint `threading.Condition` / `asyncio.Lock`

### Browser-Specific Throttling

| Control | Value | Purpose |
|---------|-------|---------|
| Cell delay | Random 5–12s between cells | Mimic human think-time |
| Scroll delay | Random 0.5–1.5s per scroll step | Allow lazy-loaded DOM to populate |

---

## 6. Failsafe & Error Handling

### 6.1 Circuit Breaker (Browser Blocks)

| Property | Value |
|----------|-------|
| **File** | `app/services/browser_pool.py` (`_CircuitBreaker`) |
| **States** | closed → open → half_open → closed/open |
| **Trigger** | 3 consecutive block detections (CAPTCHA, "unusual traffic", access denied) |
| **Pause** | 600s (10 minutes) |
| **Half-open** | After pause, allows 1 probe request |
| **Reset** | `reset_breaker()` called between place-type passes (prevents cascade) |

### 6.2 Dead Browser Detection

| Indicator | Response |
|-----------|----------|
| `"target" in msg and "closed" in msg` (TargetClosedError) | Force reinit: tear down all sessions, close browser/playwright, retry with backoff |
| `"connection closed" in msg` (Chromium OOM/crash) | Same as above |
| `page.is_closed()` on acquire | Evict dead session from pool |

### 6.3 Interrupted Run Recovery

| Trigger | Action |
|---------|--------|
| Process killed mid-run | `_mark_interrupted_runs()` on startup finds runs stuck in 'running' → marks 'interrupted' |
| Resume `stage=None` or `"discovery"` | Re-run full pipeline |
| Resume `stage="detail_fetch"` | Skip discovery, resume from cached DiscoveryCell resource names |
| Resume `stage="image_download"` | Skip to image phase |
| Resume `stage="enrichment"` | Skip to enrichment (already-enriched places auto-skipped) |

### 6.4 Partial Results Persistence

| What | When Saved | Batch Size |
|------|-----------|------------|
| Discovery cells | Immediately after each cell search | 1 (real-time) |
| Scraped places | During detail fetch | Every 10 places |
| Images | After download batch | Every 50 places |
| Enrichment status | Per-place after completion | 1 (real-time) |
| Run error | On failure | `error_message[:500]` |

### 6.5 Quality Gates

| Gate | Threshold | Applied Before |
|------|-----------|---------------|
| Image download | 0.75 | Downloading place images |
| Enrichment | 0.75 | Running external collectors |
| Sync | 0.75 | Pushing to catalog API |
| Name specificity | Heuristic | Enrichment (generic names skipped) |

### 6.6 Resource Cleanup (Shutdown)

1. Stop queue processor background task
2. Close all browser contexts (5s timeout per context)
3. Close browser process (10s timeout)
4. Stop Playwright (10s timeout)
5. Sleep 0.2s for child process termination
6. Custom exception handler suppresses benign `TargetClosedError` during shutdown

---

## 7. Browser Pool Management

### Session Lifecycle

```
acquire()
  ├─ Semaphore acquire (blocks until slot available, 90s timeout)
  ├─ Check reusable sessions:
  │   ├─ If session.nav_count < max_pages && !session.in_use → reuse
  │   └─ If page.is_closed() → evict dead session
  ├─ Create new session if pool < pool_size:
  │   ├─ new_context(user_agent, viewport, timezone, geolocation, proxy)
  │   ├─ Add SOCS/CONSENT cookies (EU GDPR bypass)
  │   ├─ Route handler blocks fonts/media/stylesheets
  │   └─ Apply stealth patches (navigator.webdriver, etc.)
  └─ Return session (in_use = True)

release(session, recycle=False)
  ├─ If recycle or nav_count >= max_pages:
  │   ├─ Close page (5s timeout)
  │   ├─ Close context (10s timeout)
  │   └─ Remove from pool
  └─ Else: mark in_use = False for reuse
```

### Chromium Launch Args

| Category | Flags |
|----------|-------|
| Stealth | `--disable-blink-features=AutomationControlled` |
| Memory | `--disable-dev-shm-usage` (critical in containers) |
| GPU | `--disable-gpu`, `--disable-accelerated-2d-canvas` |
| Background | `--disable-background-networking`, `--disable-sync`, `--disable-translate` |
| Linux | `--no-zygote`, `--disable-features=site-per-process` |

### Anti-Fingerprinting

- **Proxy rotation**: Round-robin or random via `ProxyRotator` (`BROWSER_PROXY_LIST`)
- **Geolocation spoofing**: Random user agent, viewport (480–1920px), timezone per context
- **Session recycling**: After 30 navigations to prevent behavioral fingerprinting

---

## 8. Roadmap

### CRITICAL — Bugs & Data Integrity

| # | Issue | File | Description | Impact |
|---|-------|------|-------------|--------|
| C1 | Enrichment status race condition | `app/pipeline/enrichment.py` | Between quality-gate commit and enrichment gather, another process can modify `ScrapedPlace` records. The in-memory `places` list becomes stale, risking double-enrichment. | Wasted API calls, inconsistent data |
| C2 | Sync failure list overwrites | `app/db/scraper.py` | `run.sync_failure_details = failed_entries` overwrites previous failures on retry instead of appending. Old failure history lost. | Lost debugging info |
| C3 | Resume fallback uses JSON column | `app/db/scraper.py` | When resuming from `detail_fetch`, falls back to `run.discovered_resource_names` (JSON column) if no `DiscoveryCell` records found. May be truncated or incomplete at 50K+ scale. | Potential data loss on resume |

### HIGH — Performance Bottlenecks

| # | Issue | File | Description | Fix | Est. Impact |
|---|-------|------|-------------|-----|-------------|
| H1 | Sequential sync batches | `app/db/scraper.py` | `SYNC_BATCH_CONCURRENCY = 1` — 1000 places at 25/batch = 40 batches, each sequential. 5s/batch = 200s wasted. | Use `asyncio.gather()` with semaphore of 5 | **3+ min saved per run** |
| H2 | Collector registry re-instantiation | `app/collectors/registry.py` | `get_all_collectors()`, `get_enabled_collectors()`, `get_enrichment_collectors()`, `get_enrichment_phases()` create new collector instances on every call. During enrichment: 10 concurrent × 100+ iterations = 1000+ unnecessary allocations. | Add `@functools.lru_cache()` or cache at module level | **Reduced GC pressure, minor speedup** |
| H3 | Cancellation polling per place | `app/pipeline/enrichment.py` | Opens a new DB session and queries entire `ScraperRun` row after each place enrichment (1000+ times per run). | Use `asyncio.Event()` set by a background watcher | **1000+ fewer DB round-trips** |
| H4 | Place type mapping queries | `app/scrapers/gmaps.py` | Three separate functions (`get_place_type_mappings()`, `get_gmaps_type_to_our_type()`, `detect_religion_from_types()`) each query the same `PlaceTypeMapping` table independently. | Fetch once, derive three dicts | **100+ fewer DB queries** |
| H5 | No parallelism in type passes (browser) | `app/scrapers/gmaps_browser.py` | While `TYPE_CONCURRENCY = 3` exists, the grid cells within each type pass are processed with a semaphore but each cell navigation is heavyweight. Increasing browser pool could speed up discovery. | Consider dynamic pool scaling or larger pool with memory guard | **30–50% faster discovery** |

### MEDIUM — Code Quality & Maintainability

| # | Issue | File | Description | Fix |
|---|-------|------|-------------|-----|
| M1 | Hardcoded timeout values | `app/constants.py` | `BROWSER_ACQUIRE_TIMEOUT_S = 90.0`, `BROWSER_CELL_TIMEOUT_S`, backoff intervals not configurable via env vars. | Add to `config.py` and forward in `job_env_vars()` |
| M2 | Magic number for saturation | `app/scrapers/gmaps.py` | `len(names) == 20` uses literal instead of `GMAPS_MAX_RESULTS_PER_CALL` constant. | Import and use the constant |
| M3 | Duplicate `load_dotenv()` | `app/config.py` + `app/main.py` | Called in both files; harmless but redundant. | Remove from `main.py` |
| M4 | Error message truncation | `app/db/scraper.py` | `str(e)[:500]` hardcoded — may hide root cause. No env var to configure. | Make configurable or store full trace in a separate field |
| M5 | Duplicate time normalization | `app/scrapers/gmaps.py` + `app/collectors/gmaps_browser.py` | Python `normalize_to_24h()` and JavaScript opening-hours parser duplicate logic. | Extract shared format spec or add shared test vectors |
| M6 | Async/sync boundary complexity | `app/jobs/dispatcher.py` | `_run_local()` creates a new event loop in a thread just to run an async function. Works but convoluted. | Simplify to direct async task queueing |

### LOW — Enhancements & Nice-to-Haves

| # | Enhancement | Description | Benefit |
|---|-------------|-------------|---------|
| L1 | Per-stage timing metrics | Track elapsed time for each stage in `ScraperRun` (discovery_duration_s, detail_fetch_duration_s, etc.) | SLA monitoring, bottleneck identification |
| L2 | Image failure rate alerting | Track rate of image download failures as early indicator of GCS issues. | Proactive incident detection |
| L3 | Average time per place | Compute and store avg processing time for dashboards. | Capacity planning |
| L4 | Configurable image batch size | `_IMAGE_DB_BATCH = 50` hardcoded. Increase to 100–200 for PostgreSQL deployments. | Fewer DB transactions |
| L5 | Quadtree cache improvement | Current cache stores "found 20 results" but not "keep subdividing". On resumption, re-traverses the tree. | Faster resume for high-density regions |
| L6 | Dynamic browser pool scaling | Scale pool size based on available memory instead of fixed 8. | Better resource utilization on larger instances |
| L7 | Structured logging | Replace `logger.info(f"...")` with structured JSON logs for better querying in Cloud Logging. | Improved observability |
| L8 | Webhook notifications | Send webhook on run completion/failure for integration with Slack/monitoring. | Faster incident response |
| L9 | Warm-up discovery cache | Pre-populate `GlobalCellStore` from previous runs on startup to avoid cold-start misses. | Faster first run after deployment |
| L10 | Deduplicate collector results | Some collectors return overlapping data (e.g., Wikipedia + Wikidata both return descriptions). The merge function handles this, but wasteful API calls could be avoided by checking what data is already available. | Fewer API calls, faster enrichment |

### Speed Optimization Priority

If the goal is to **make the scraper run faster**, prioritize in this order:

1. **H1 — Parallelize sync batches** (easiest win, ~3 min saved per 1K places)
2. **H5 — Increase browser pool / concurrency** (30–50% faster discovery, but needs more RAM)
3. **H3 — Replace cancellation polling with event** (eliminates 1K+ DB round-trips)
4. **H2 — Cache collector instances** (minor but easy 5-min fix)
5. **H4 — Consolidate PlaceTypeMapping queries** (minor but easy)
6. **L5 — Improve quadtree cache for resume** (faster warm restarts)
7. **L6 — Dynamic pool scaling** (auto-tune to available resources)

---

## Appendix: Configuration Reference

### Browser Discovery

| Env Var | Default | Description |
|---------|---------|-------------|
| `SCRAPER_BACKEND` | `"browser"` | `"browser"` or `"api"` |
| `BROWSER_GRID_CELL_SIZE_KM` | `3.0` | Grid cell size in km |
| `MAPS_BROWSER_CONCURRENCY` | `8` | Concurrent browser navigations |
| `MAPS_BROWSER_POOL_SIZE` | `8` | Browser context pool size |
| `MAPS_BROWSER_MAX_PAGES` | `30` | Navigations per context before recycling |
| `MAPS_BROWSER_HEADLESS` | `true` | Headless mode |
| `MAPS_BROWSER_CELL_DELAY_MIN` | `5.0` | Min delay between cells (seconds) |
| `MAPS_BROWSER_CELL_DELAY_MAX` | `12.0` | Max delay between cells (seconds) |
| `BROWSER_PROXY_LIST` | `""` | Comma-separated proxy URLs |
| `BROWSER_PROXY_ROTATION` | `"round_robin"` | `"round_robin"` or `"random"` |

### Detail Fetch

| Env Var | Default | Description |
|---------|---------|-------------|
| `SCRAPER_DETAIL_CONCURRENCY` | `20` | Max parallel detail fetches |
| `SCRAPER_MAX_PHOTOS` | `3` | Photos per place |
| `SCRAPER_MAX_REVIEWS` | `5` | Reviews per place |
| `SCRAPER_MAX_REVIEW_IMAGES` | `2` | Images per review |
| `SCRAPER_IMAGE_CONCURRENCY` | `40` | Parallel CDN downloads |

### Enrichment

| Env Var | Default | Description |
|---------|---------|-------------|
| `SCRAPER_ENRICHMENT_CONCURRENCY` | `5` | Concurrent place enrichments |
| `SCRAPER_OVERPASS_CONCURRENCY` | `2` | OSM API concurrency |
| `SCRAPER_OVERPASS_JITTER_MAX` | `1.5` | Max jitter between Overpass calls (seconds) |

### Quality Gates

| Env Var | Default | Description |
|---------|---------|-------------|
| `SCRAPER_GATE_IMAGE_DOWNLOAD` | `0.75` | Min quality for image download |
| `SCRAPER_GATE_ENRICHMENT` | `0.75` | Min quality for enrichment |
| `SCRAPER_GATE_SYNC` | `0.75` | Min quality for catalog sync |
