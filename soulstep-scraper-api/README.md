# SoulStep Scraper API

FastAPI service that orchestrates place-data scraping from Google Maps, dispatches Playwright jobs to Cloud Run, and now supports exporting interrupted runs for local continuation before finalizing them back into production.

## Quick Start

```bash
cd soulstep-scraper-api
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# For local browser (Playwright) mode only:
pip install -r requirements-job.txt
playwright install chromium

cp ../.env.example .env          # edit values
uvicorn app.main:app --port 8001 --reload
```

Health check: `curl http://127.0.0.1:8001/health`

## Environment Variables

Copy the root `.env.example` to `.env`. Key variables:

| Variable | Description |
|---|---|
| `MAIN_SERVER_URL` | Catalog-API base URL (e.g. `http://catalog-api:3000`) |
| `SCRAPER_DISPATCH` | `local` (in-process) or `cloud_run` (production) |
| `CLOUD_RUN_JOB_NAME` | Cloud Run Job name for the Playwright scraper |
| `CLOUD_RUN_REGION` | Primary Cloud Run region |
| `CLOUD_RUN_REGIONS` | Comma-separated regions for multi-region dispatch |
| `GCS_BUCKET_NAME` | GCS bucket for scraped images |
| `GOOGLE_CLOUD_PROJECT` | GCP project ID |
| `SCRAPER_DISCOVERY_CONCURRENCY` | Primary discovery concurrency knob for browser grid search |
| `MAPS_BROWSER_POOL_SIZE` | Optional browser-context override; leave blank to follow discovery concurrency |
| `MAPS_BROWSER_CONCURRENCY` | Optional active browser override; leave blank to follow discovery concurrency |
| `MAPS_BROWSER_CELL_DELAY_MIN/MAX` | Per-cell browser discovery jitter range |

For the current Cloud Run Job size (`6 GiB`, `4 vCPU`), an aggressive browser-only starting point is:
- `SCRAPER_DISCOVERY_CONCURRENCY=18`
- `SCRAPER_DETAIL_CONCURRENCY=12`
- `MAPS_BROWSER_POOL_SIZE=18`
- `MAPS_BROWSER_CONCURRENCY=18`
- `MAPS_BROWSER_CELL_DELAY_MIN=1.0`
- `MAPS_BROWSER_CELL_DELAY_MAX=2.0`

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/runs` | Start a new scraper run |
| GET | `/runs` | List all runs |
| GET | `/runs/:runCode` | Get run status and results |
| POST | `/runs/:runCode/resume` | Resume an interrupted, failed, or cancelled run; accepts `?force=true` to bypass the active-execution guard |
| POST | `/runs/:runCode/cancel` | Cancel a queued, pending, running, or interrupted run |
| POST | `/runs/:runCode/sync` | Sync scraped data to catalog-api |
| POST | `/runs/:runCode/retry-images` | Drain failed/pending asset queue items again |
| POST | `/runs/:runCode/re-enrich` | Re-run enrichment on stored scraped places |
| POST | `/runs/:runCode/handoff/export` | Lease a run for handoff, export a bundle on the server, and freeze normal run mutations |
| GET | `/runs/:runCode/handoff` | Inspect the most recent handoff state for a run |
| POST | `/runs/:runCode/handoff/finalize?handoff_code=...` | Upload a completed `.json.gz` bundle back to prod and finalize/import it |
| POST | `/runs/:runCode/handoff/abort` | Abort the active handoff so normal run mutations can continue |
| POST | `/runs/handoff/export-batch` | Lease/export a batch of child runs for a location (useful for country fan-out runs) |
| DELETE | `/runs/:runCode` | Delete a run |
| GET | `/collectors` | List collector configurations |

## Run Handoff Workflow

The scraper now supports a portable run-handoff flow for large interrupted runs:

1. Export or lease the production run:

```bash
cd soulstep-scraper-api
source .venv/bin/activate
python scripts/handoff.py export --run-code run_abc123 --prod-dsn postgresql://...
```

2. Import the bundle into a local DB and resume it locally with sync disabled:

```bash
python scripts/handoff.py resume-local \
  --bundle /tmp/run_abc123-handoff.json.gz \
  --local-database-url postgresql://...
```

For operator workflows that should keep running after the terminal closes, use
the all-in-one background command. It writes the bundle, SQLite DB, and log under
`local-handoffs/`, then starts `python -m app.jobs.run` inside a detached
`screen` session:

```bash
python scripts/handoff.py start-local-bg \
  --run-code run_abc123 \
  --prod-dsn postgresql://... \
  --lease-owner hussain-local
```

By default, `start-local-bg` inherits scraper concurrency from `.env`. Pass
`--detail-concurrency`, `--browser-pool-size`, `--browser-concurrency`, or
`--image-concurrency` only when a specific local run needs different limits.

3. Finalize the completed bundle back into production:

```bash
python scripts/handoff.py finalize \
  --bundle /tmp/run_abc123-handoff.json.gz \
  --local-database-url sqlite:///local-handoffs/run_abc123.db \
  --prod-url https://scraper-api.soul-step.org
```

Bundle finalize uploads raw `application/gzip` bytes to
`POST /api/v1/scraper/runs/{run_code}/handoff/finalize?handoff_code=...`.
When `--local-database-url` is passed, the CLI first rebuilds a fresh finalize
bundle from the current local DB so production receives the completed local rows,
not the original export snapshot.

For unattended operations, use `finalize-bg`. It refreshes the finalize bundle,
starts a detached `screen` job, uploads the bundle to production, then polls the
production run/activity endpoints until the catalog sync completes. Logs and the
refreshed bundle stay inside `local-handoffs/`:

```bash
python scripts/handoff.py finalize-bg \
  --bundle local-handoffs/run_abc123-hof_abc.json.gz \
  --prod-url https://scraper-api.soul-step.org
```

Generated files:

- `local-handoffs/run_abc123-hof_abc-finalize.json.gz` — fresh bundle rebuilt from the local DB.
- `local-handoffs/run_abc123.catalog-sync.log` — JSON-line finalize/catalog-sync progress log.

The monitor-friendly command below checks one or more local runs, verifies they
are complete with no pending/failed assets or recent local errors, and starts
`finalize-bg` exactly once for each ready run:

```bash
python scripts/handoff.py monitor \
  --run-code run_abc123 \
  --run-code run_def456 \
  --prod-url https://scraper-api.soul-step.org
```

To pause safely before taking the laptop offline, stop the local worker through
the handoff CLI instead of killing random Chromium processes:

```bash
python scripts/handoff.py pause-local --run-code run_abc123
```

This marks the local DB run as cancelled so the scraper's cancellation watcher
can exit between batches without losing committed `ScrapedPlace` or
`ScrapedAsset` progress. To resume the same local DB later:

```bash
python scripts/handoff.py resume-bg \
  --run-code run_abc123 \
  --detail-concurrency 3 \
  --browser-pool-size 3 \
  --browser-concurrency 3
```

`resume-bg` is also useful after a laptop sleep/crash: if the old `screen`
session is gone but `local-handoffs/run_abc123.db` remains, it resumes from the
persisted stage and skips already-fetched places.

During an active handoff, mutating run actions such as `resume`, `cancel`, `sync`,
`retry-images`, and `re-enrich` return `409` until the handoff is finalized or aborted.

## Image Pipeline

- Detail fetch now preserves both `source_image_urls` and `source_photo_urls`.
- Browser-captured bytes are stored durably in the `ScrapedAsset` queue instead of being uploaded inline during `_flush_detail_buffer`.
- Asset uploads/drains run in parallel while detail fetch is active.
- The `image_download` stage is now a bounded queue barrier over leftover assets, not the primary image-fetching stage.

## Cloud Run Job

The Playwright scraper runs as a Cloud Run Job (`soulstep-scraper-api-job`), separate from this HTTP service.

- **Production:** Set `SCRAPER_DISPATCH=cloud_run` — the scraper-api dispatches jobs to Cloud Run automatically.
- **Local dev:** Set `SCRAPER_DISPATCH=local` for in-process execution (requires Playwright installed).
- The job image is built from `Dockerfile.job` and deployed independently of the HTTP service.

## Tests

```bash
source .venv/bin/activate
python -m pytest tests/ -v
```
