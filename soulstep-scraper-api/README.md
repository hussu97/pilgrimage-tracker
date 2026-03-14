# SoulStep Scraper API

FastAPI service that discovers sacred places via Google Maps, enriches them from multiple sources, scores data quality, and syncs the best results to the catalog API.

## Setup

### 1. Install dependencies

```bash
cd soulstep-scraper-api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt          # production dependencies
pip install -r requirements-dev.txt      # adds pytest, ruff (dev/test only)
```

**Browser mode only** (required for `SCRAPER_BACKEND=browser`):

```bash
pip install -r requirements-job.txt      # Playwright, timezonefinder, google-cloud-run
playwright install chromium              # download Chromium binary (~300 MB)
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env — set GOOGLE_MAPS_API_KEY and MAIN_SERVER_URL at minimum
```

### 3. Run

```bash
uvicorn app.main:app --reload --port 8001
```

Health check: `curl http://127.0.0.1:8001/health`

If port 8001 is occupied: `lsof -ti :8001 | xargs kill -9`

### 4. Run tests

```bash
python -m pytest tests/ -v
```

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `GOOGLE_MAPS_API_KEY` | Yes (api mode) | — | Google Maps/Places API key. Not needed in browser mode. |
| `MAIN_SERVER_URL` | Yes | `http://127.0.0.1:3000` | Catalog API URL — scraped places are synced here |
| `PORT` | No | `8001` | Scraper API listen port |
| `SCRAPER_BACKEND` | No | `api` | `api` (Google Places HTTP) or `browser` (Playwright/Chromium) |
| `SCRAPER_DISPATCH` | No | `local` | `local` (in-process) or `cloud_run` (Cloud Run Job) |
| `CLOUD_RUN_JOB_NAME` | No | `soulstep-scraper-job` | Cloud Run Job name (cloud_run dispatch only) |
| `CLOUD_RUN_REGION` | No | `us-central1` | Cloud Run region (cloud_run dispatch only) |
| `MAPS_BROWSER_POOL_SIZE` | No | `2` | Concurrent Chromium contexts (browser mode only) |
| `MAPS_BROWSER_MAX_PAGES` | No | `30` | Navigations per session before recycling (browser mode only) |
| `MAPS_BROWSER_HEADLESS` | No | `true` | Chromium headless; set `false` for local debugging |
| `BROWSER_GRID_CELL_SIZE_KM` | No | `3.0` | Grid cell side-length in km for browser discovery mode |
| `SCRAPER_TIMEZONE` | No | `UTC` | Fallback timezone for places without a Google UTC offset |
| `DATABASE_URL` | No | — | PostgreSQL URL — overrides `SCRAPER_DB_PATH` when set |
| `SCRAPER_DB_PATH` | No | `scraper.db` | SQLite database path |
| `SCRAPER_DISCOVERY_CONCURRENCY` | No | `10` | Max concurrent `searchNearby` calls |
| `SCRAPER_DETAIL_CONCURRENCY` | No | `20` | Max concurrent `getPlace` calls |
| `SCRAPER_ENRICHMENT_CONCURRENCY` | No | `10` | Max places enriched concurrently |
| `SCRAPER_MAX_PHOTOS` | No | `3` | Photos per place (Photo Media: $0.007/1000) |
| `SCRAPER_IMAGE_CONCURRENCY` | No | `40` | Max concurrent image downloads |
| `SCRAPER_OVERPASS_CONCURRENCY` | No | `2` | Max concurrent Overpass API requests |
| `SCRAPER_OVERPASS_JITTER_MAX` | No | `1.5` | Random jitter between Overpass requests (seconds) |
| `SCRAPER_GATE_IMAGE_DOWNLOAD` | No | `0.75` | Quality gate for image download phase |
| `SCRAPER_GATE_ENRICHMENT` | No | `0.75` | Quality gate for enrichment phase |
| `SCRAPER_GATE_SYNC` | No | `0.75` | Quality gate for sync phase |
| `WIKIPEDIA_MAX_DISTANCE_KM` | No | `100` | Max distance to accept a Wikipedia article as relevant |
| `GEMINI_API_KEY` | No | — | Enables LLM tie-breaking for description selection |
| `BESTTIME_API_KEY` | No | — | BestTime collector (busyness forecasts) |
| `FOURSQUARE_API_KEY` | No | — | Foursquare collector (tips, popularity) |
| `OUTSCRAPER_API_KEY` | No | — | Outscraper collector (extended reviews) |
| `SCRAPER_TRIGGER_SEO_AFTER_SYNC` | No | `false` | Auto-trigger bulk SEO generation after sync |
| `SCRAPER_CATALOG_ADMIN_TOKEN` | No | — | Admin JWT for catalog API (required with auto-SEO) |
| `GOOGLE_CLOUD_PROJECT` | No | — | GCP project ID — used for Cloud Run Jobs |
| `LOG_FORMAT` | No | `json` | `json` (Cloud Run) or `text` (local dev) |
| `LOG_LEVEL` | No | `INFO` | `DEBUG`, `INFO`, `WARNING`, `ERROR` |

## Pipeline

Each scraper run goes through these stages:

```
Discovery         — quadtree searchNearby via Google Maps
    ↓
Detail Fetch      — getPlace for each discovered place (full field mask)
    ↓
Image Download    — fetch photos from Google Photo CDN
    ↓ [GATE_IMAGE_DOWNLOAD = 0.75]
Enrichment        — multi-source collectors in dependency phases:
    Phase 0: OSM/Overpass     — amenities, contact, multilingual names
    Phase 1: Wikipedia        — descriptions (en/ar/hi), images
              Wikidata         — founding date, heritage, socials
    Phase 2: Knowledge Graph  — entity descriptions (free, 100k/day)
              BestTime         — busyness forecasts (optional, paid)
              Foursquare       — tips, popularity (optional, paid)
              Outscraper       — extended reviews (optional, paid)
    ↓ [GATE_ENRICHMENT = 0.75]
Quality Assessment — heuristic scoring + optional Gemini LLM tie-breaking
    ↓ [GATE_SYNC = 0.75]
Sync              — POST /places/batch to catalog API
```

## Scraper Backends

| Backend | API key | Cost | Speed |
|---|---|---|---|
| `api` (default) | Required | ~$0.008/place | ~3h per 10K places |
| `browser` | Not required | $0 | ~24–48h per 10K places |

The `browser` backend uses Playwright to drive Google Maps in Chromium, avoiding API billing. All downstream phases (enrichment, quality, sync) work identically regardless of which backend ran discovery.

### Google Places API cost breakdown

| Phase | Endpoint | Rate |
|---|---|---|
| Discovery | `searchNearby` POST | $0.040 / 1000 |
| Detail fetch | `getPlace` GET (full mask) | $0.040 / 1000 |
| Image download | `{photo}/media` GET | $0.007 / 1000 |

## Job Dispatcher

Controls how runs are executed after `POST /runs`:

| `SCRAPER_DISPATCH` | Behavior |
|---|---|
| `local` (default) | Runs scraper in-process via FastAPI BackgroundTasks. Works for local dev and simple Cloud Run Service deployments. |
| `cloud_run` | Dispatches a Cloud Run Job. API service stays at ~512 MB; Chromium runs in the 2 GB job container. |

For Cloud Run Job setup, see `PRODUCTION.md §5.9h`.

## Usage

### 1. Create a data location

```bash
curl -X POST http://127.0.0.1:8001/api/v1/scraper/data-locations \
  -H "Content-Type: application/json" \
  -d '{"name": "Dubai Mosques", "city": "Dubai", "max_results": 50}'
```

Scope to exactly one of: `city`, `state`, or `country`.

### 2. Start a run

```bash
curl -X POST http://127.0.0.1:8001/api/v1/scraper/runs \
  -H "Content-Type: application/json" \
  -d '{"location_code": "loc_abc123"}'
```

Runs in the background. Save the `run_code`.

### 3. Monitor progress

```bash
curl http://127.0.0.1:8001/api/v1/scraper/runs/{run_code}
```

Run status values: `pending` → `running` → `completed` / `failed` / `cancelled` / `interrupted`

### 4. Resume an interrupted run

```bash
curl -X POST http://127.0.0.1:8001/api/v1/scraper/runs/{run_code}/resume
```

Restarts from the stored `stage` field (`discovery`, `detail_fetch`, or `enrichment`). Already-enriched places are skipped.

### 5. Sync to catalog

```bash
curl -X POST http://127.0.0.1:8001/api/v1/scraper/runs/{run_code}/sync
```

## API Reference

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/scraper/data-locations` | Create data location (city/state/country) |
| `GET` | `/api/v1/scraper/data-locations` | List all data locations |
| `POST` | `/api/v1/scraper/runs` | Start a scraper run |
| `GET` | `/api/v1/scraper/runs/{run_code}` | Get run status |
| `GET` | `/api/v1/scraper/runs/{run_code}/data` | Scraped places for a run |
| `GET` | `/api/v1/scraper/runs/{run_code}/raw-data` | Raw collector data (debugging) |
| `POST` | `/api/v1/scraper/runs/{run_code}/re-enrich` | Re-enrich without re-discovery |
| `POST` | `/api/v1/scraper/runs/{run_code}/sync` | Sync passing places to catalog |
| `POST` | `/api/v1/scraper/runs/{run_code}/resume` | Resume interrupted/failed run |
| `POST` | `/api/v1/scraper/runs/{run_code}/cancel` | Cancel a run |
| `GET` | `/api/v1/scraper/runs/{run_code}/place-codes` | Place codes for a run |
| `DELETE` | `/api/v1/scraper/runs/{run_code}` | Delete run and all related data |
| `GET` | `/api/v1/scraper/collectors` | List available collectors |
| `GET` | `/api/v1/scraper/quality-metrics` | Aggregate quality stats |
| `GET` | `/api/v1/scraper/runs/{run_code}/places/{place_code}/quality-breakdown` | Per-place quality factors |
| `GET` | `/api/v1/scraper/map/cells` | Discovery cells (for map view) |
| `GET` | `/api/v1/scraper/map/places` | Scraped places with lat/lng (for map view) |

## Collectors

| Collector | Source | Cost | Extracts |
|---|---|---|---|
| `gmaps` / `gmaps_browser` | Google Places / Playwright | ~$0.008/place / $0 | Details, photos, reviews, hours, accessibility |
| `osm` | Overpass API | Free | Amenities, contact, multilingual names |
| `wikipedia` | Wikipedia REST API | Free | Descriptions (en/ar/hi), images |
| `wikidata` | Wikidata SPARQL | Free | Founding date, heritage status, socials |
| `knowledge_graph` | Google KG Search | Free (100k/day) | Entity descriptions, schema.org types |
| `besttime` | BestTime API | Paid | Busyness forecasts, peak hours |
| `foursquare` | Foursquare API | Paid | User tips, popularity |
| `outscraper` | Outscraper API | Paid | Extended Google reviews |

## Quality Assessment

Descriptions are scored 0.0–1.0 by:
- **Source reliability** (40%): Wikipedia > editorial > knowledge graph > wikidata
- **Length/detail** (30%): longer descriptions score higher
- **Specificity** (30%): place name mentions + relevant keywords

When the top two candidates score within 0.15 of each other, Gemini can optionally break the tie. Requires `GEMINI_API_KEY`; triggered for ~10–20% of places.

## Geographic Boundaries

Pre-seeded regions (auto-populated on first startup):

- **Countries**: UAE, India, USA, Pakistan
- **UAE cities** (8): Dubai, Abu Dhabi, Sharjah, Ajman, Ras Al Khaimah, Fujairah, Umm Al Quwain, Al Ain
- **USA states** (8): California, Texas, New York, Florida, Illinois, Pennsylvania, Ohio, Georgia
- **India**: all 28 states + 50+ cities (Mumbai, Delhi, Bangalore, …)
- **Pakistan**: 7 provinces + top 50 cities

## Scripts

```bash
# Delete all scraper data (runs, places, cells) — preserves DataLocation records
python scripts/reset_scraper_data.py
```

## Directory Structure

```
soulstep-scraper-api/app/
  config.py              # Centralised settings (all env vars)
  constants.py           # Named constants (batch sizes, radii, concurrency defaults)
  scrapers/
    gmaps.py             # API-mode discovery + detail fetching (quadtree search)
    gmaps_browser.py     # Browser-mode discovery + detail fetching (Playwright)
  collectors/
    base.py              # BaseCollector ABC, CollectorResult dataclass
    gmaps.py             # GmapsCollector
    gmaps_browser.py     # BrowserGmapsCollector (same CollectorResult shape)
    osm.py               # OsmCollector (Overpass API)
    wikipedia.py         # WikipediaCollector
    wikidata.py          # WikidataCollector
    knowledge_graph.py   # KnowledgeGraphCollector
    besttime.py          # BestTimeCollector (optional/paid)
    foursquare.py        # FoursquareCollector (optional/paid)
    outscraper.py        # OutscraperCollector (optional/paid)
    registry.py          # Collector factory
  pipeline/
    enrichment.py        # Orchestrator — runs collectors in dependency phases
    quality.py           # Description scoring + LLM tie-breaking
    merger.py            # Combines collector outputs into final data
    place_quality.py     # Place-level quality score (0.0–1.0) + gate thresholds
  services/
    browser_pool.py      # MapsBrowserPool with circuit breaker + session recycling
    browser_stealth.py   # Stealth JS patches + UA/viewport/timezone randomisation
    run_activity.py      # get_activity_snapshot() — polled by admin UI
    quality_metrics.py   # compute_quality_metrics() — aggregate quality stats
    query_log.py         # Records every outbound Google Places API call
  jobs/
    dispatcher.py        # dispatch_run() — local vs cloud_run
    run.py               # Cloud Run Job entrypoint
  db/
    models.py            # SQLModel ORM models
    session.py           # Engine + SessionDep
    scraper.py           # Orchestration (run, resume, sync)
  api/v1/
    scraper.py           # FastAPI router — all endpoints
```
