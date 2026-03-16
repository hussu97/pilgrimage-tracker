# Local Scraper → Remote Catalog Sync

Run the scraper locally and push enriched places to any catalog API instance (local, staging, or production).

---

## Overview

The scraper (`soulstep-scraper-api/`) is a standalone FastAPI service that:
1. Discovers sacred sites via Google Maps or Playwright/Chromium
2. Enriches them with descriptions from Wikipedia, Wikidata, OSM, and more
3. Scores each place against quality gates (0.0–1.0)
4. Syncs passing places to the catalog API (`soulstep-catalog-api/`) via a batch endpoint

You can run the scraper on your laptop and point `MAIN_SERVER_URL` at any catalog URL — local, staging, or production.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Python 3.11+ | `python --version` |
| Google Maps API key | Required for `SCRAPER_BACKEND=api` (default). Not needed for browser mode. |
| Running catalog API | Local (`http://127.0.0.1:3000`) or remote URL |

---

## Setup

```bash
cd soulstep-scraper-api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install -r requirements-dev.txt   # for tests
```

Create a `.env` file:

```dotenv
# Required
GOOGLE_MAPS_API_KEY=AIza...

# Target catalog API — change to staging/prod URL when syncing remotely
MAIN_SERVER_URL=http://127.0.0.1:3000

# Optional enrichment
GEMINI_API_KEY=AIza...

# Logging
LOG_FORMAT=text   # human-readable locally
LOG_LEVEL=INFO
```

Start the scraper:

```bash
uvicorn app.main:app --port 8001 --reload
```

Health check:

```bash
curl -s http://127.0.0.1:8001/health
```

---

## Optional: Use Production PostgreSQL for Scraper Data

By default the scraper stores runs and scraped places in a local SQLite file. If you want scrape runs visible in the **production admin dashboard** without syncing, point the scraper at the production PostgreSQL database instead.

```dotenv
# Replace with your actual connection string
DATABASE_URL=postgresql://user:password@host:5432/soulstep-scraper
```

On startup, the scraper runs its own Alembic migrations using a separate `scraper_alembic_version` table — no interference with the catalog API.

> **Note:** `MAIN_SERVER_URL` is still needed when you want to *sync passing places into the catalog* (copy enriched places into the `Place` table). That's a separate step from where the scraper stores its working data.

---

## Step-by-Step: Run a Full Scrape

### 1. Create a data location

Define what region to scrape. Scope to exactly one of `city`, `state`, or `country`:

```bash
curl -s -X POST http://127.0.0.1:8001/api/v1/scraper/data-locations \
  -H "Content-Type: application/json" \
  -d '{"name": "Dubai Sacred Sites", "city": "Dubai", "max_results": 50}'
```

Save the `code` from the response (e.g. `loc_abc12345`).

**Test with a small batch first** — use `max_results: 5` to verify the pipeline end-to-end before a large run:

```bash
curl -s -X POST http://127.0.0.1:8001/api/v1/scraper/data-locations \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Run", "city": "Dubai", "max_results": 5}'
```

### 2. Start a scrape run

```bash
curl -s -X POST http://127.0.0.1:8001/api/v1/scraper/runs \
  -H "Content-Type: application/json" \
  -d '{"location_code": "loc_abc12345"}'
```

Returns a `run_code`. The scraper runs discovery + enrichment in the background.

### 3. Monitor progress

```bash
curl -s http://127.0.0.1:8001/api/v1/scraper/runs/run_abc12345
```

Key fields: `status`, `stage`, `processed_items`, `total_items`.

Or poll the activity snapshot for richer progress:

```bash
curl -s http://127.0.0.1:8001/api/v1/scraper/runs/run_abc12345/activity | python -m json.tool
```

### 4. Check quality metrics

After enrichment completes, review quality before syncing:

```bash
curl -s "http://127.0.0.1:8001/api/v1/scraper/quality-metrics?run_code=run_abc12345" | python -m json.tool
```

Look at `gate_breakdown` and `score_distribution`. If too many places are filtered out, lower the gate thresholds in `.env`:

```dotenv
SCRAPER_GATE_IMAGE_DOWNLOAD=0.50
SCRAPER_GATE_ENRICHMENT=0.40
SCRAPER_GATE_SYNC=0.40
```

### 5. Review in the admin dashboard (optional)

If the admin web app is running:
1. Navigate to **Scraper → Runs**
2. Click the run to open **Run Detail**
3. Check the **Quality Metrics** tab — score distribution and gate breakdown
4. Click any place row to see the inline quality-score breakdown

### 6. Sync to the catalog

Once satisfied with quality, sync passing places to the catalog API:

```bash
curl -s -X POST http://127.0.0.1:8001/api/v1/scraper/runs/run_abc12345/sync
```

Sync runs in the background. Monitor via the activity endpoint — watch `places_synced` increment.

Verify on the catalog:

```bash
curl -s "http://127.0.0.1:3000/api/v1/places?limit=20" | python -m json.tool
```

---

## Configuring MAIN_SERVER_URL

| Environment | Value |
|---|---|
| Local development | `http://127.0.0.1:3000` |
| Production | `https://api.soul-step.org` |

Change `MAIN_SERVER_URL` in `.env` to point at any catalog instance.

---

## Useful Operations

### Resume an interrupted run

If the scraper was interrupted (power loss, process kill):

```bash
curl -s -X POST http://127.0.0.1:8001/api/v1/scraper/runs/run_abc12345/resume
```

Restarts from the stored `stage` field — already-enriched places are skipped automatically.

### Re-enrich without re-scraping

If you update prompts, add a new collector, or change quality gates:

```bash
curl -s -X POST http://127.0.0.1:8001/api/v1/scraper/runs/run_abc12345/re-enrich
```

Re-runs enrichment on existing scraped data without re-doing discovery (no Google Maps API calls).

### Cancel a run

```bash
curl -s -X POST http://127.0.0.1:8001/api/v1/scraper/runs/run_abc12345/cancel
```

### List all runs

```bash
curl -s http://127.0.0.1:8001/api/v1/scraper/runs
```

### View per-place quality breakdown

```bash
curl -s "http://127.0.0.1:8001/api/v1/scraper/runs/run_abc12345/places/gplc_xxx/quality-breakdown"
```

Returns factor-by-factor scoring: Rating & Reviews, Description, Images, Contact, Attributes.

---

## Quality Gate Reference

Quality gates are set via env vars (default 0.75 each):

| Gate | Env var | Applied before |
|---|---|---|
| Image download | `SCRAPER_GATE_IMAGE_DOWNLOAD` | Enrichment phase |
| Enrichment | `SCRAPER_GATE_ENRICHMENT` | Enrichment starts |
| Sync | `SCRAPER_GATE_SYNC` | Sync to catalog |

Lower a gate to be more permissive; raise it to be stricter. The Quality Metrics dashboard shows how many places fall near each threshold, making it easy to tune without re-scraping.
