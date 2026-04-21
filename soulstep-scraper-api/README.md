# SoulStep Scraper API

FastAPI service that orchestrates place-data scraping from Google Maps and dispatches Playwright jobs to Cloud Run.

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
| `GOOGLE_MAPS_API_KEY` | Knowledge Graph Search enrichment collector (optional — scraping itself is browser-only) |
| `SCRAPER_DISPATCH` | `local` (in-process) or `cloud_run` (production) |
| `CLOUD_RUN_JOB_NAME` | Cloud Run Job name for the Playwright scraper |
| `CLOUD_RUN_REGION` | Primary Cloud Run region |
| `CLOUD_RUN_REGIONS` | Comma-separated regions for multi-region dispatch |
| `GCS_BUCKET_NAME` | GCS bucket for scraped images |
| `GOOGLE_CLOUD_PROJECT` | GCP project ID |

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/runs` | Start a new scraper run |
| GET | `/runs` | List all runs |
| GET | `/runs/:runCode` | Get run status and results |
| POST | `/runs/:runCode/sync` | Sync scraped data to catalog-api |
| DELETE | `/runs/:runCode` | Delete a run |
| GET | `/collectors` | List collector configurations |

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
