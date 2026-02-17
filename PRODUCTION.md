# Production Deployment Plans

This document outlines how to deploy Pilgrimage Tracker to production. **Update the relevant plan(s) whenever deployment-relevant changes are made** (e.g. new env vars, new services, build steps).

Current system: **Backend** (Python FastAPI in `server/`), **Web app** (Vite + React in `apps/web/`), **Mobile app** (Expo / React Native in `apps/mobile/`), optional **Data Scraper** (`data_scraper/`). API is versioned at `/api/v1`. For production, set `DATABASE_URL` to a PostgreSQL connection string (dev uses SQLite by default).

---

## Environment Variables Reference

### Backend (`server/`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `JWT_SECRET` | **Yes** | `dev-secret-change-in-production` | JWT signing secret — always override in prod |
| `JWT_EXPIRE` | No | `30m` | Access token lifetime. Supports `30m`, `1h`, `7d`, or integer minutes |
| `REFRESH_EXPIRE` | No | `30d` | Refresh token lifetime. Same format as `JWT_EXPIRE` |
| `DATABASE_URL` | **Yes (prod)** | `sqlite:///pilgrimage.db` | PostgreSQL connection string for production |
| `CORS_ORIGINS` | No | `http://localhost:5173 http://127.0.0.1:5173` | **Space-separated** list of allowed origins (not comma-separated) |
| `PORT` | No | `3000` | Server port — Dockerfile uses `${PORT:-3000}` |
| `RESEND_API_KEY` | No | _(empty)_ | Resend.com API key for password-reset emails |
| `RESEND_FROM_EMAIL` | No | `noreply@pilgrimage-tracker.app` | From address for transactional emails |
| `RESET_URL_BASE` | No | `http://localhost:5173` | Frontend base URL for password-reset links |

### Data Scraper (`data_scraper/`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `MAIN_SERVER_URL` | No | `http://127.0.0.1:3000` | URL of main API (used for data sync) |
| `GOOGLE_MAPS_API_KEY` | Yes (gmaps scraper) | _(empty)_ | Google Maps API key |
| `SCRAPER_TIMEZONE` | No | UTC fallback | IANA timezone for places without Google UTC offset (e.g. `Asia/Dubai`) |

### Web frontend (`apps/web/`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `VITE_API_URL` | **Yes (prod)** | _(relative `/api` in dev)_ | Production API base URL — **baked in at build time** |

### Mobile (`apps/mobile/`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `EXPO_PUBLIC_API_URL` | No | `http://127.0.0.1:3000` | API base URL for device/Expo Go |

---

## Plan 1: Docker

Deploy the full stack with Docker Compose. Dockerfiles for all services are checked into the repo.

### Files

| File | Description |
|---|---|
| `server/Dockerfile` | FastAPI backend — `python:3.12-slim` |
| `data_scraper/Dockerfile` | Scraper service — `python:3.12-slim` |
| `apps/web/Dockerfile` | Multi-stage: Node 20 build → nginx:1.27-alpine serve |
| `apps/web/nginx.conf` | nginx SPA config (copied into web image) |
| `docker-compose.yml` | Wires all services + PostgreSQL |

### Quick Start

```bash
# 1. Copy and fill out env vars
cp .env.example .env   # edit JWT_SECRET, VITE_API_URL, etc.

# 2. Build and start (api + db + web)
docker compose up -d --build

# 3. (Optional) start the scraper service too
docker compose --profile scraper up -d scraper
```

### docker-compose.yml Services

| Service | Image/Build | Port | Notes |
|---|---|---|---|
| `db` | `postgres:15-alpine` | internal | PostgreSQL; data persisted in `postgres_data` volume |
| `api` | `./server` | `3000` | FastAPI; waits for `db` health; auto-runs Alembic migrations on start |
| `web` | `./apps/web` | `80` | nginx serving the compiled React SPA |
| `scraper` | `./data_scraper` | `8001` | Optional; activate with `--profile scraper` |

### Required `.env` for Docker

```dotenv
POSTGRES_PASSWORD=changeme_strong_password
JWT_SECRET=your-long-random-secret
VITE_API_URL=http://localhost:3000   # or public API URL
CORS_ORIGINS=http://localhost        # space-separated; add web domain

# Optional
JWT_EXPIRE=30m
REFRESH_EXPIRE=30d
RESEND_API_KEY=
RESEND_FROM_EMAIL=noreply@pilgrimage-tracker.app
RESET_URL_BASE=http://localhost
GOOGLE_MAPS_API_KEY=
SCRAPER_TIMEZONE=UTC
API_PORT=3000
WEB_PORT=80
SCRAPER_PORT=8001
```

### Build Web Image Manually

`VITE_API_URL` is baked in at build time — the variable must be set before building:

```bash
docker build \
  --build-arg VITE_API_URL=https://api.yourdomain.com \
  -t pilgrimage-web \
  apps/web/
```

### Migrations

Alembic migrations run **automatically on API startup** via `alembic upgrade head`. No manual migration step needed.

### Scheduled Jobs

```bash
# Cleanup orphaned review images (run daily, e.g. 2 AM)
docker exec <api_container> python -m app.jobs.cleanup_orphaned_images

# Backfill place timezones (run once after adding new places)
docker exec <api_container> python -m app.jobs.backfill_timezones
```

Example cron entry (on the host):
```
0 2 * * * docker exec pilgrimage-api python -m app.jobs.cleanup_orphaned_images
```

### Mobile

Not containerised. Build locally or via CI:
```bash
cd apps/mobile
eas build --platform ios
eas build --platform android
```
Set `EXPO_PUBLIC_API_URL` to the production API URL in your EAS build config or `.env`.

---

## Plan 2: Free Online Services (Render, Vercel, etc.)

### Backend — Render (Web Service)

1. Connect GitHub repo to Render.
2. **Root directory:** `server`
3. **Build command:** `pip install -r requirements.txt`
4. **Start command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. **Environment variables:**

```
JWT_SECRET           = <strong random string>
DATABASE_URL         = <Render Postgres / Supabase / Neon connection string>
CORS_ORIGINS         = https://your-app.vercel.app  (space-separated if multiple origins)
JWT_EXPIRE           = 30m
REFRESH_EXPIRE       = 30d
RESEND_API_KEY       = <optional, for password reset emails>
RESEND_FROM_EMAIL    = noreply@yourdomain.com
RESET_URL_BASE       = https://your-app.vercel.app
```

Render automatically sets `$PORT` — the start command picks it up.

Migrations run automatically on startup.

### Database

- **Render Postgres** — free tier (90-day trial, then paid)
- **Supabase** / **Neon** — generous free tier; set `DATABASE_URL` in the Render env vars

### Web Frontend — Vercel

1. Connect repo; set **Root Directory** to `apps/web`.
2. **Build command:** `npm run build`
3. **Output directory:** `dist`
4. **Environment variable:**
   ```
   VITE_API_URL = https://your-api.onrender.com
   ```

> **Note:** `VITE_API_URL` is baked in at build time. Redeploy after changing it.

### Data Scraper — Render (Optional Web Service)

Only needed for automated data scraping:

1. **Root directory:** `data_scraper`
2. **Build command:** `pip install -r requirements.txt`
3. **Start command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. **Environment variables:**
   ```
   MAIN_SERVER_URL       = https://your-api.onrender.com
   GOOGLE_MAPS_API_KEY   = <key>
   SCRAPER_TIMEZONE      = UTC
   ```

Can be run locally or on-demand instead of deploying.

### Mobile

Build locally or via GitHub Actions. Set `EXPO_PUBLIC_API_URL` to production API URL before building:
```bash
EXPO_PUBLIC_API_URL=https://your-api.onrender.com eas build --platform ios
EXPO_PUBLIC_API_URL=https://your-api.onrender.com eas build --platform android
```

### Scheduled Jobs (Render Cron or External)

```
# Cleanup orphaned images daily
python -m app.jobs.cleanup_orphaned_images

# Backfill timezones (run once after adding new place data)
python -m app.jobs.backfill_timezones
```

Options:
- **Render Cron Jobs** — available on paid plans
- **External cron** (e.g. cron-job.org) — call a cleanup endpoint via HTTP
- **GitHub Actions** — scheduled workflow that triggers the job via the API

---

## Plan 3: Google Cloud Platform (GCP)

### Backend — Cloud Run

1. Build and push image to **Artifact Registry**:
   ```bash
   docker build -t gcr.io/PROJECT_ID/pilgrimage-api ./server
   docker push gcr.io/PROJECT_ID/pilgrimage-api
   ```
2. Deploy to **Cloud Run**:
   ```bash
   gcloud run deploy pilgrimage-api \
     --image gcr.io/PROJECT_ID/pilgrimage-api \
     --platform managed \
     --region us-central1 \
     --allow-unauthenticated \
     --set-env-vars "DATABASE_URL=...,JWT_SECRET=...,CORS_ORIGINS=https://your-web-url.com"
   ```
3. Use **Secret Manager** for `JWT_SECRET`, `DATABASE_URL`, `RESEND_API_KEY`.
4. Environment variables to set:
   ```
   DATABASE_URL         = postgresql://... (Cloud SQL private IP or socket)
   JWT_SECRET           = (from Secret Manager)
   CORS_ORIGINS         = https://your-web.web.app  (space-separated)
   JWT_EXPIRE           = 30m
   REFRESH_EXPIRE       = 30d
   RESEND_API_KEY       = (from Secret Manager)
   RESEND_FROM_EMAIL    = noreply@yourdomain.com
   RESET_URL_BASE       = https://your-web.web.app
   ```

Migrations run automatically on container startup.

### Database — Cloud SQL (PostgreSQL)

- Create a **PostgreSQL 15** Cloud SQL instance.
- Enable **Cloud SQL Auth Proxy** or a VPC connector for private IP connectivity.
- Store the connection string in **Secret Manager**; inject as `DATABASE_URL`.
- Connection pool configured automatically (pool_size=20, max_overflow=30).

### Web Frontend — Firebase Hosting

```bash
cd apps/web
VITE_API_URL=https://your-api-url.run.app npm run build
npx firebase deploy --only hosting
```

Or **Cloud Storage + Load Balancer:**
- Upload `apps/web/dist/` to a GCS bucket.
- Configure a Load Balancer with a CDN backend serving the bucket.

### Data Scraper — Cloud Run (Optional)

```bash
docker build -t gcr.io/PROJECT_ID/pilgrimage-scraper ./data_scraper
docker push gcr.io/PROJECT_ID/pilgrimage-scraper

gcloud run deploy pilgrimage-scraper \
  --image gcr.io/PROJECT_ID/pilgrimage-scraper \
  --set-env-vars "MAIN_SERVER_URL=https://your-api.run.app,SCRAPER_TIMEZONE=UTC"
```

Can also be deployed as a **Cloud Run Job** for scheduled batch scraping.

### Mobile

```bash
EXPO_PUBLIC_API_URL=https://your-api.run.app eas build --platform ios
EXPO_PUBLIC_API_URL=https://your-api.run.app eas build --platform android
```

Optional: **Firebase App Distribution** for beta, **EAS Update** for OTA JS updates.

### Scheduled Jobs — Cloud Scheduler

```bash
# Create daily job to clean up orphaned images
gcloud scheduler jobs create http cleanup-orphaned-images \
  --schedule="0 2 * * *" \
  --uri="https://your-api.run.app/admin/cleanup-images" \
  --http-method=POST \
  --headers="Authorization=Bearer <token>"
```

Or deploy a **Cloud Run Job** that executes:
```bash
python -m app.jobs.cleanup_orphaned_images
python -m app.jobs.backfill_timezones  # run once after new data imports
```

### Optional GCP Services

- **Cloud Storage** — for user avatars and review photos (configure backend with bucket name + credentials)
- **Cloud Monitoring + Cloud Logging** — built-in for Cloud Run; add Sentry for error tracking

---

## Mobile Production Checklist

Before submitting to App Store / Play Store:

1. **Set bundle identifiers** in `apps/mobile/app.json`:
   ```json
   {
     "expo": {
       "ios": { "bundleIdentifier": "com.yourcompany.pilgrimagetracker" },
       "android": { "package": "com.yourcompany.pilgrimagetracker" }
     }
   }
   ```
2. **Set app name and slug** (`name`, `slug` in `app.json`) to production values.
3. **Configure EAS** — `eas.json` is already set up with development/preview/production profiles.
4. **Build:**
   ```bash
   cd apps/mobile
   eas build --platform ios --profile production
   eas build --platform android --profile production
   ```
5. **Submit:**
   ```bash
   eas submit --platform ios
   eas submit --platform android
   ```

---

## Data Strategy — Scraper Service

The `data_scraper/` service enriches pilgrimage place data from multiple sources.

**Sources:**
- **Google Sheets** — CSV export with OSM/Wikipedia enrichment
- **Google Maps API** — grid-based search with attribute extraction

**Deployment options:**

| Option | When to Use |
|---|---|
| **Local / On-Demand** | Development, one-off data loads |
| **Render / Cloud Run Service** | Continuous or webhook-triggered scraping |
| **Cloud Run Job** | Scheduled batch updates via Cloud Scheduler |

**Data flow:**
1. Create a data location (gsheet or gmaps config via API)
2. Create a run → background scraping task starts
3. Sync to main server → places created/updated with attributes

---

## Summary

| Plan | Backend | DB | Web | Mobile |
|---|---|---|---|---|
| **1 Docker** | Docker container (`server/Dockerfile`) | Postgres in Compose or external | nginx Docker image (`apps/web/Dockerfile`) | EAS build, submit to stores |
| **2 Free** | Render Web Service | Render Postgres / Supabase / Neon | Vercel | EAS build |
| **3 GCP** | Cloud Run | Cloud SQL (PostgreSQL 15) | Firebase Hosting or GCS + LB | EAS build |

Keep this file in sync with the codebase: when deployment steps or environment variables change, update the corresponding plan(s).
