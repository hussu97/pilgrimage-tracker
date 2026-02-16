# Production deployment plans

This document outlines how to deploy Pilgrimage Tracker to production. **Update the relevant plan(s) whenever deployment-relevant changes are made** (e.g. new env vars, new services, build steps).

Current system: **Backend** (Python FastAPI in `server/`), **Web app** (Vite + React in `apps/web/`), **Mobile app** (Expo / React Native in `apps/mobile/`). API is versioned at `/api/v1`. For production, replace in-memory stores with PostgreSQL (and optional file storage).

---

## Plan 1: Docker

Deploy using Docker and Docker Compose.

### Backend (Main API)

- **Dockerfile** (in `server/` or repo root):
  - Base image: `python:3.14-slim` (or `python:3.12-slim` if 3.14 is unavailable in your registry).
  - Copy `server/` (or `app/`), install deps from `requirements.txt`.
  - Run: `uvicorn app.main:app --host 0.0.0.0 --port 3000`.
- **Environment:**
  - `JWT_SECRET` - Required for auth
  - `DATABASE_URL` - PostgreSQL connection (for production; dev uses SQLite)
  - `PORT` - Optional, defaults to 3000
  - `CORS_ORIGINS` - Comma-separated allowed origins
- **Build:** `docker build -t pilgrimage-api -f server/Dockerfile .` (adjust context/path as needed).

### Data Scraper Service (Optional)

- **Dockerfile** (in `data_scraper/` or separate):
  - Base image: `python:3.14-slim`
  - Copy `data_scraper/`, install deps from `requirements.txt`
  - Run: `uvicorn app.main:app --host 0.0.0.0 --port 8001`
- **Environment:**
  - `MAIN_SERVER_URL` - URL of main API (e.g., `http://pilgrimage-api:3000` or public URL)
  - `GOOGLE_MAPS_API_KEY` - Required for gmaps scraper
- **Build:** `docker build -t pilgrimage-scraper -f data_scraper/Dockerfile .`
- **Note:** This service is optional and only needed if you want to run data scraping in production

### Database

- Use **PostgreSQL** in production. Option A: run Postgres in Docker Compose. Option B: use a managed Postgres (e.g. Supabase, Neon) and set `DATABASE_URL` in the API container.
- **Docker Compose example:** Define services:
  - `api` - Main server (build from server Dockerfile)
  - `scraper` - Optional scraper service (build from data_scraper Dockerfile)
  - `db` - PostgreSQL 15
  - Set `DATABASE_URL` for api pointing to `db`
  - Set `MAIN_SERVER_URL` for scraper pointing to `api`

### Web frontend

- **Build:** From repo root, `npm run build` for web (or `npm run build -w @pilgrimage-tracker/web`). Output is in `apps/web/dist/`.
- **Serving:** Option A: Nginx container serving `apps/web/dist` and proxying `/api` to the API. Option B: separate Dockerfile that builds the app and serves with nginx or a static server.
- **Env:** Set `VITE_API_URL` at **build time** to the public API URL (e.g. `https://api.yourdomain.com`). If API is same-origin, use relative `/api` and configure reverse proxy.

### Mobile app

- Not run in Docker. Build locally or in CI: `cd apps/mobile && npx expo export` then build with EAS Build or `expo run:ios` / `expo run:android`. Submit to App Store / Play Store. Set API URL in app config or env (e.g. `EXPO_PUBLIC_API_URL`) to production API.

### Updates

- When adding new env vars (e.g. `CORS_ORIGINS`, `SENTRY_DSN`), document them in this section and in the Dockerfile/Compose example.
- When adding a new service (e.g. Redis, worker), add a container and wire it in Compose; update this doc.

### Scheduled Jobs

- **Orphaned Images Cleanup:** Run `python -m app.jobs.cleanup_orphaned_images` daily to delete review images not attached to any review after 24 hours. Schedule with cron in the API container or as a separate container with shared database access.
  - Example cron: `0 2 * * * cd /app && python -m app.jobs.cleanup_orphaned_images` (runs at 2 AM daily)

### Dependencies

- **Pillow:** Required for review photo upload image processing (compression, resizing). Included in `requirements.txt` (pillow>=10.0.0)

---

## Plan 2: Free online services (Render, Vercel, etc.)

Deploy backend and web on free-tier or low-cost services; use a free or cheap Postgres and optional file storage.

### Main Backend (Render, Railway, Fly.io, etc.)

- **Render (Web Service):**
  - Connect repo; root or `server/` as working directory.
  - Build: `pip install -r requirements.txt` (or set Python version and use `pip install -r server/requirements.txt` if root).
  - Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`. Render sets `PORT`.
  - Env: `JWT_SECRET`, `DATABASE_URL` (e.g. from Render Postgres or external Supabase/Neon), `CORS_ORIGINS`.
- **CORS:** Set allowed origins to the web app URL (e.g. Vercel preview and production).
- **Database:** Use Render Postgres, or Supabase/Neon free tier; set `DATABASE_URL` in the backend service.

### Data Scraper Service (Optional)

- **Render (Background Worker or Web Service):**
  - Connect repo; `data_scraper/` as working directory
  - Build: `pip install -r requirements.txt`
  - Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
  - Env:
    - `MAIN_SERVER_URL` - URL of main backend (e.g., `https://your-api.onrender.com`)
    - `GOOGLE_MAPS_API_KEY` - For gmaps scraper
- **Note:** Only deploy if you need automated data scraping. Can be run locally or on-demand instead.

### Web frontend (Vercel, Netlify)

- **Vercel:**
  - Connect repo; set **Root Directory** to `apps/web`.
  - Build: `npm run build` (or `npm ci && npm run build` from repo root with root as root and build command running in `apps/web` — adjust per monorepo setup). Output directory: `dist`.
  - Env: `VITE_API_URL` = production API URL (e.g. `https://your-api.onrender.com`).
- **Netlify:** Same idea: build command and publish directory for `apps/web`, set `VITE_API_URL`.

### Mobile app

- Build locally or in CI (e.g. GitHub Actions). Set `EXPO_PUBLIC_API_URL` to production API. Build iOS/Android with Expo (EAS or local) and submit to stores.

### Updates

- When adding env vars or build steps, update this section.
- If you add serverless functions or a separate worker, document the service and env here.

### Scheduled Jobs

- **Orphaned Images Cleanup:** Run `python -m app.jobs.cleanup_orphaned_images` daily to delete review images not attached to any review after 24 hours. Options:
  - Render Cron Jobs (if available on your plan)
  - External cron service (e.g., cron-job.org) calling a cleanup endpoint
  - GitHub Actions scheduled workflow that runs the job via API

### Dependencies

- **Pillow:** Required for review photo upload image processing. Included in `requirements.txt` and automatically installed during build

---

## Plan 3: Google Cloud Platform (GCP)

Deploy using GCP services.

### Main Backend (Cloud Run)

- **Container:** Build API image (same as Plan 1 Dockerfile) and push to **Artifact Registry** (e.g. `gcr.io/PROJECT_ID/pilgrimage-api` or Artifact Registry path).
- **Cloud Run service:** Deploy the image. Set env: `JWT_SECRET`, `DATABASE_URL`, `CORS_ORIGINS`. Use **Secret Manager** for secrets. Set min instances 0 for cost savings; scale as needed.
- **Database:** Use **Cloud SQL (PostgreSQL)**. Create instance; allow Cloud Run to connect (VPC connector or public IP + authorized networks). Set `DATABASE_URL` to Cloud SQL connection (e.g. Unix socket or private IP).

### Data Scraper Service (Optional, Cloud Run)

- **Container:** Build scraper image and push to Artifact Registry
- **Cloud Run service:** Deploy with env:
  - `MAIN_SERVER_URL` - URL of main Cloud Run service
  - `GOOGLE_MAPS_API_KEY` - From Secret Manager
- **Note:** Can run as separate Cloud Run service or as Cloud Run Job for scheduled scraping

### Database (Cloud SQL)

- Create PostgreSQL instance; run migrations if any. Store connection name and credentials in Secret Manager; inject into Cloud Run as `DATABASE_URL`.

### Web frontend (Firebase Hosting or Cloud Storage + CDN)

- **Option A – Firebase Hosting:** Build web app (`npm run build` in `apps/web`); deploy with `firebase deploy`. Set `VITE_API_URL` to Cloud Run URL at build time.
- **Option B – Cloud Storage + Load Balancer:** Build app; upload `dist/` to a GCS bucket; configure Load Balancer and optional CDN to serve the bucket. API URL can be same Load Balancer with path-based routing or a separate Cloud Run URL.

### Mobile app

- Build with Expo (EAS or local); set `EXPO_PUBLIC_API_URL` to Cloud Run (or API URL). Submit to App Store / Play Store. Optional: use EAS Update or Firebase App Distribution for beta.

### Optional GCP services

- **Storage:** Use **Cloud Storage** for avatars and photos if you add file uploads; configure backend to use GCS (e.g. via bucket name and credentials).
- **Monitoring:** Cloud Monitoring and Logging for Cloud Run; optional Sentry or similar.

### Updates

- When adding new GCP resources (e.g. Redis, Pub/Sub), document them here.
- When changing secrets or env vars, update this section and Secret Manager usage.

### Scheduled Jobs

- **Orphaned Images Cleanup:** Run `python -m app.jobs.cleanup_orphaned_images` daily to delete review images not attached to any review after 24 hours. Use **Cloud Scheduler** to trigger a Cloud Run Job or Cloud Function that runs the cleanup script with database access.
  - Example: Create Cloud Scheduler job that hits `/admin/cleanup-images` endpoint (add auth header) or triggers Cloud Run Job

### Dependencies

- **Pillow:** Required for review photo upload image processing. Included in `requirements.txt` and automatically installed during Cloud Run build

---

---

## Data Strategy

### Data Enrichment (Scraper Service)

The project includes a unified scraper service in `data_scraper/` that supports multiple data sources:

**Sources:**
- **Google Sheets** - CSV export with OSM/Wikipedia enrichment
- **Google Maps API** - Grid-based search with attribute extraction

**Deployment Options:**

1. **Local/On-Demand** (Recommended for development):
   - Run scraper service locally on port 8001
   - Create data locations and runs via API
   - Sync to main server when ready
   - No production deployment needed

2. **Deployed Service** (For automated scraping):
   - Deploy as separate service (Render/Cloud Run)
   - Expose API for scheduled or webhook-triggered scraping
   - Auto-sync to main server

3. **Cloud Run Job** (For scheduled batch updates):
   - Package scraper as Cloud Run Job
   - Schedule via Cloud Scheduler
   - Run specific scraping tasks on a schedule

**Environment Variables:**
- `MAIN_SERVER_URL` - URL of main API
- `GOOGLE_MAPS_API_KEY` - Required for gmaps scraper

**Data Flow:**
1. Create data location (gsheet or gmaps config)
2. Create run → background scraping task
3. Sync to main server → places created/updated with attributes and source tag

---

## Summary

| Plan   | Backend        | DB              | Web frontend      | Mobile        |
|--------|----------------|-----------------|-------------------|---------------|
| 1 Docker | Docker container | Postgres (Compose or external) | Nginx/static in Docker or same host | Local/CI build, stores |
| 2 Free | Render / Railway / Fly | Render Postgres, Supabase, Neon | Vercel / Netlify | Local/CI build, stores |
| 3 GCP  | Cloud Run      | Cloud SQL       | Firebase Hosting or GCS + LB | Local/CI build, stores |

Keep this file in sync with the codebase: when deployment steps or environment change, update the corresponding plan(s).
