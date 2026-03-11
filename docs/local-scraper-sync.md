# Local Scraper → Remote Catalog Sync

This guide explains how to run the scraper service locally and push the resulting places to a remote catalog API instance (e.g., a staging or production server on Render / Cloud Run).

---

## 1. Overview

The SoulStep scraper service (`soulstep-scraper-api`) is a standalone FastAPI app that:
1. Discovers sacred sites via Google Maps / other collectors
2. Enriches them with descriptions from Wikipedia, Wikidata, etc.
3. Scores each place against quality gates
4. Syncs passing places to the catalog API (`soulstep-catalog-api`) via its batch endpoint

You can run the scraper on your laptop and point it at any catalog URL — local, staging, or production.

---

## 2. Prerequisites

| Requirement | Notes |
|---|---|
| Python 3.11+ | `python --version` |
| Google Maps API key | `GOOGLE_MAPS_API_KEY` env var |
| Running catalog API | Local (`http://127.0.0.1:3000`) or remote URL |
| (Optional) Wikipedia / Wikidata | No key needed — public APIs |
| (Optional) OpenAI / Anthropic key | For LLM enrichment |

---

## 3. Set Up the Local Scraper

```bash
cd soulstep-scraper-api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Create a `.env` file in `soulstep-scraper-api/`:

```dotenv
# Local SQLite (default for dev)
DATABASE_URL=sqlite:///./scraper.db

# Required for Google Maps discovery
GOOGLE_MAPS_API_KEY=AIza...

# Target catalog API — change to remote URL when syncing to staging/prod
MAIN_SERVER_URL=http://127.0.0.1:3000

# Optional enrichment keys
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

Start the scraper:

```bash
uvicorn app.main:app --port 3100 --reload
```

Health check:

```bash
curl -s http://127.0.0.1:3100/health
```

---

## 4. Use the Production Postgres DB (optional but recommended)

By default the scraper stores its data (runs, scraped places, data locations) in a local SQLite file. If you want that data visible in the **prod admin dashboard** without syncing, point the scraper at the prod Postgres DB instead.

First install the Postgres driver if you haven't already:

```bash
pip install psycopg2-binary
```

Then replace `DATABASE_URL` in `.env` with the prod connection string (get it from your hosting provider — Render, Supabase, etc. — usually labeled "External Database URL"):

```dotenv
DATABASE_URL=postgresql://user:password@host:5432/dbname
```

On startup, the scraper runs Alembic migrations against this DB using a separate `scraper_alembic_version` table, so it won't interfere with the catalog API's own migrations.

All scraper data (runs, scraped places, data locations) will now live in prod Postgres and the admin web app on prod will see it immediately through the catalog API's scraper proxy — no manual sync step needed to view run state.

> **Note:** `MAIN_SERVER_URL` is still needed when you want to *sync passing places into the catalog* (i.e. copy enriched places into the `Place` table). That's a separate step from where the scraper stores its own working data.

---

## 5. Configure `MAIN_SERVER_URL`

`MAIN_SERVER_URL` is the base URL of the catalog API that will receive synced places.

| Environment | Value |
|---|---|
| Local development | `http://127.0.0.1:3000` |
| Render staging | `https://soulstep-catalog-api-staging.onrender.com` |
| Production | `https://api.soulstep.app` |

> **No auth needed for the batch sync endpoint** — the catalog API's `/api/v1/admin/places/batch` endpoint is internal and does not require a user token (it uses a shared `BATCH_SYNC_SECRET` env var instead). Ensure both services have the same secret set.

---

## 6. Create a Data Location

A **Data Location** defines where to scrape (city, state, or country):

```bash
# First seed the geographic boundary if not already present
curl -s -X POST http://127.0.0.1:3100/api/v1/scraper/data-locations \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Dubai Sacred Sites",
    "city": "Dubai",
    "max_results": 50
  }'
```

Save the `code` from the response (e.g. `loc_abc12345`).

---

## 7. Start a Run

```bash
curl -s -X POST http://127.0.0.1:3100/api/v1/scraper/runs \
  -H "Content-Type: application/json" \
  -d '{"location_code": "loc_abc12345"}'
```

The run starts immediately in a background task. Save the `run_code` from the response.

---

## 8. Monitor Progress

**Activity snapshot** (poll every few seconds):

```bash
curl -s http://127.0.0.1:3100/api/v1/scraper/runs/run_abc12345/activity | python -m json.tool
```

Key fields:
- `places_total` — total discovered so far
- `places_enriching` — currently being enriched
- `places_complete` — enrichment done
- `places_filtered` — failed quality gates

**Quality metrics** (after enrichment completes):

```bash
curl -s "http://127.0.0.1:3100/api/v1/scraper/quality-metrics?run_code=run_abc12345" | python -m json.tool
```

Review the `gate_breakdown` and `score_distribution` to validate thresholds before syncing.

---

## 9. Review Quality in Admin Dashboard

If you have the admin web app running locally:

1. Navigate to **Scraper → Quality Metrics** (`/scraper/quality`)
2. Select the run from the dropdown
3. Check the Score Distribution chart — ensure the bulk of places pass the 0.40 gate
4. Review Near-Threshold Sensitivity to see how many places are borderline

---

## 10. Sync to Catalog

Once you're satisfied with quality, sync passing places to the catalog API:

```bash
curl -s -X POST http://127.0.0.1:3100/api/v1/scraper/runs/run_abc12345/sync
```

The sync runs in the background. Monitor via the activity endpoint — watch `places_synced` increment.

To check on the remote catalog, list recently added places:

```bash
curl -s "https://api.soulstep.app/api/v1/places?page_size=20" | python -m json.tool
```

---

## 11. Tips

### Test with a small batch first

Use `max_results=5` when creating a data location to verify the pipeline end-to-end before a large run:

```json
{ "name": "Test Run", "city": "Dubai", "max_results": 5 }
```

### Adjust quality gates

Quality thresholds are in `soulstep-scraper-api/app/pipeline/place_quality.py`:

```python
IMAGE_GATE = 0.20       # filtered if quality_score < 0.20
ENRICHMENT_GATE = 0.35  # filtered if quality_score < 0.35 (after enrichment)
SYNC_GATE = 0.40        # filtered from sync if quality_score < 0.40
```

Lower a gate to be more permissive; raise it to be stricter. Use the Quality Metrics dashboard to evaluate the impact.

### Re-enrich without re-scraping

If you update prompts or add a new collector, you can re-run enrichment on existing scraped data without re-doing discovery:

```bash
curl -s -X POST http://127.0.0.1:3100/api/v1/scraper/runs/run_abc12345/re-enrich
```

### Resume interrupted runs

If the scraper was interrupted (power loss, process kill), resume from where it left off:

```bash
curl -s -X POST http://127.0.0.1:3100/api/v1/scraper/runs/run_abc12345/resume
```
