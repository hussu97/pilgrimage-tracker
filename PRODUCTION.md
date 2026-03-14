# Production Deployment Plans

This document outlines how to deploy SoulStep to production. **Update the relevant plan(s) whenever deployment-relevant changes are made** (e.g. new env vars, new services, build steps).

---

## Table of Contents

- [1. Overview](#1-overview)
- [2. Environment Variables](#2-environment-variables)
  - [2.1 Backend API](#21-backend-api-soulstep-catalog-api)
  - [2.2 Data Scraper](#22-data-scraper-soulstep-scraper-api)
  - [2.3 Web Frontend](#23-web-frontend-appssoulstep-customer-web)
  - [2.4 Mobile](#24-mobile-appssoulstep-customer-mobile)
- [3. Plan A — Docker Compose](#3-plan-a--docker-compose)
  - [3.1 Files](#31-files)
  - [3.2 Quick Start](#32-quick-start)
  - [3.3 Services](#33-services)
  - [3.4 Required .env](#34-required-env)
  - [3.5 Building the Web Image](#35-building-the-web-image)
  - [3.6 GCS Image Storage (Docker)](#36-gcs-image-storage-docker)
  - [3.7 Scheduled Jobs (Docker)](#37-scheduled-jobs-docker)
  - [3.8 Translation Backfill (Docker)](#38-translation-backfill-docker)
- [4. Plan B — Render + Vercel (Free Tier)](#4-plan-b--render--vercel-free-tier)
  - [4.1 Create Database (Neon)](#41-create-database-neon)
  - [4.2 Deploy Backend API (Render)](#42-deploy-backend-api-render)
  - [4.3 Deploy Web Frontend (Vercel)](#43-deploy-web-frontend-vercel)
  - [4.4 Data Scraper on Render (optional)](#44-data-scraper-on-render-optional)
  - [4.5 CI/CD (GitHub Actions)](#45-cicd-github-actions)
  - [4.6 Translation Backfill on Render](#46-translation-backfill-on-render)
  - [4.7 Scheduled Jobs on Render](#47-scheduled-jobs-on-render)
- [5. Plan C — Google Cloud Platform](#5-plan-c--google-cloud-platform)
  - [5.1 Prerequisites](#51-prerequisites)
  - [5.2 Artifact Registry](#52-artifact-registry)
  - [5.3 Database (Cloud SQL)](#53-database-cloud-sql)
  - [5.4 Secrets (Secret Manager) + IAM Roles](#54-secrets-secret-manager--iam-roles)
  - [5.5 Build & Push API Image](#55-build--push-api-image)
  - [5.6 Deploy API (Cloud Run)](#56-deploy-api-cloud-run)
  - [5.7 Deploy Web Frontend (Firebase Hosting)](#57-deploy-web-frontend-firebase-hosting)
  - [5.8 Managing Environment Variables](#58-managing-environment-variables)
  - [5.9 Data Scraper (Cloud Run, optional)](#59-data-scraper-cloud-run-optional)
  - [5.10 Scheduled Jobs (Cloud Scheduler + Cloud Run Jobs)](#510-scheduled-jobs-cloud-scheduler--cloud-run-jobs)
  - [5.11 CI/CD (GitHub Actions for GCP)](#511-cicd-github-actions-for-gcp)
  - [5.12 Estimated Costs](#512-estimated-costs)
- [6. Operations Guide](#6-operations-guide)
  - [6.1 Database Migrations](#61-database-migrations)
  - [6.2 Translation Backfill](#62-translation-backfill)
  - [6.3 Scheduled Jobs](#63-scheduled-jobs)
  - [6.4 Scraper Database Options](#64-scraper-database-options)
- [7. Mobile](#7-mobile)
  - [7.1 Production Checklist](#71-production-checklist)
  - [7.2 Building & Submitting](#72-building--submitting)
  - [7.3 Beta Testing (Firebase App Distribution)](#73-beta-testing-firebase-app-distribution)
- [8. SEO & Search Engine Submission](#8-seo--search-engine-submission)
  - [8.1 Endpoints](#81-endpoints)
  - [8.2 Google Search Console](#82-google-search-console)
  - [8.3 Bing Webmaster Tools](#83-bing-webmaster-tools)
  - [8.4 Yandex (optional)](#84-yandex-optional)
  - [8.5 AI Bot Verification](#85-ai-bot-verification)
  - [8.6 SEO Generation Script](#86-seo-generation-script)
  - [8.7 AI Citation Monitoring](#87-ai-citation-monitoring)
- [9. Observability](#9-observability)
  - [9.1 Prometheus Metrics](#91-prometheus-metrics)
  - [9.2 GlitchTip Error Tracking](#92-glitchtip-error-tracking)

---

## 1. Overview

Current system: **Backend** (Python FastAPI in `soulstep-catalog-api/`), **Web app** (Vite + React in `apps/soulstep-customer-web/`), **Mobile app** (Expo / React Native in `apps/soulstep-customer-mobile/`), optional **Data Scraper** (`soulstep-scraper-api/`). API is versioned at `/api/v1`. For production, set `DATABASE_URL` to a PostgreSQL connection string (dev uses SQLite by default).

| Plan | Backend | DB | Web | Mobile |
|---|---|---|---|---|
| **A — Docker** | Docker container (`soulstep-catalog-api/Dockerfile`) | Postgres in Compose or external | nginx Docker image (`apps/soulstep-customer-web/Dockerfile`) | EAS build, submit to stores |
| **B — Free** | Render Web Service | Render Postgres / Supabase / Neon | Vercel | EAS build |
| **C — GCP** | Cloud Run | Cloud SQL (PostgreSQL 15) | Firebase Hosting | EAS build |

All plans share the same operations (migrations, backfill scripts, scheduled jobs) documented in [§6 Operations Guide](#6-operations-guide), the same mobile build process in [§7 Mobile](#7-mobile), and the same SEO setup in [§8 SEO](#8-seo--search-engine-submission).

---

## 2. Environment Variables

All environment variables documented here. Plan-specific sections reference this table — they do not redefine variables.

### 2.1 Backend API (`soulstep-catalog-api/`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `JWT_SECRET` | **Yes** | `dev-secret-change-in-production` | JWT signing secret — always override in prod |
| `JWT_EXPIRE` | No | `30m` | Access token lifetime. Supports `30m`, `1h`, `7d`, or integer minutes |
| `REFRESH_EXPIRE` | No | `30d` | Refresh token lifetime. Same format as `JWT_EXPIRE` |
| `DATABASE_URL` | **Yes (prod)** | `sqlite:///soulstep.db` | PostgreSQL connection string for production |
| `CORS_ORIGINS` | No | `http://localhost:5173 http://127.0.0.1:5173` | **Space-separated** list of allowed origins (not comma-separated) |
| `PORT` | No | `3000` | Server port — Dockerfile uses `${PORT:-3000}` |
| `RESEND_API_KEY` | No | _(empty)_ | Resend.com API key for password-reset emails |
| `RESEND_FROM_EMAIL` | No | `noreply@soul-step.org` | From address for transactional emails |
| `RESET_URL_BASE` | No | `http://localhost:5173` | Frontend base URL for password-reset links |
| `MIN_APP_VERSION_SOFT` | No | _(empty)_ | Semver (e.g. `1.1.0`) — mobile clients below this see a soft-update banner. Empty = disabled |
| `MIN_APP_VERSION_HARD` | No | _(empty)_ | Semver (e.g. `1.0.0`) — mobile clients below this are blocked with HTTP 426. Empty = disabled |
| `LATEST_APP_VERSION` | No | _(empty)_ | Current latest release (e.g. `1.2.0`) — returned by `GET /api/v1/app-version` |
| `APP_STORE_URL_IOS` | No | _(empty)_ | App Store URL for iOS update link |
| `APP_STORE_URL_ANDROID` | No | _(empty)_ | Play Store URL for Android update link |
| `LOG_LEVEL` | No | `INFO` | Python logging level (`DEBUG`, `INFO`, `WARNING`, `ERROR`) |
| `LOG_FORMAT` | No | `json` | `json` for structured JSON logs (production); `text` for human-readable (dev) |
| `ADS_ENABLED` | No | `false` | Master switch for ads across all platforms |
| `ADSENSE_PUBLISHER_ID` | No | _(empty)_ | Google AdSense publisher ID (e.g. `ca-pub-xxxxxxxxxxxxxxxx`) |
| `ADMOB_APP_ID_IOS` | No | _(empty)_ | Google AdMob App ID for iOS |
| `ADMOB_APP_ID_ANDROID` | No | _(empty)_ | Google AdMob App ID for Android |
| `GOOGLE_CLOUD_PROJECT` | No | _(empty)_ | GCP project ID — used by the `translate-content` Cloud Run Job and GCS image backend |
| `GOOGLE_APPLICATION_CREDENTIALS` | No | _(empty)_ | Path to a GCP service account JSON key with the **Cloud Translation API** and **Storage Object Admin** roles. Not needed on GCP Cloud Run (uses built-in ADC). Required for Docker / Render / any non-GCP host |
| `IMAGE_STORAGE` | No | `blob` | `blob` = store images as DB blobs (dev default); `gcs` = upload to Google Cloud Storage |
| `GCS_BUCKET_NAME` | No | _(empty)_ | GCS bucket name (required when `IMAGE_STORAGE=gcs`). Bucket objects must be publicly readable |
| `FRONTEND_URL` | **Yes (prod)** | `http://localhost:5173` | Public URL of the web frontend — used in sitemap, share pages, JSON-LD |
| `API_BASE_URL` | No | `http://localhost:3000` | Public URL of the API — used in RSS/Atom feed self links |

> **Note:** Version enforcement can also be configured per-platform via the `AppVersionConfig` DB table (editable at runtime without redeployment). DB values take priority over env vars.

### 2.2 Data Scraper (`soulstep-scraper-api/`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `MAIN_SERVER_URL` | No | `http://127.0.0.1:3000` | URL of main API (used for data sync) |
| `GOOGLE_MAPS_API_KEY` | Yes (gmaps scraper) | _(empty)_ | Google Maps API key |
| `SCRAPER_TIMEZONE` | No | UTC fallback | IANA timezone for places without Google UTC offset (e.g. `Asia/Dubai`) |
| `SCRAPER_DB_PATH` | No | `scraper.db` (cwd) | Path to the SQLite database file — **set to `/data/scraper.db` in production** and mount a persistent volume at `/data` |
| `DATABASE_URL` | No | _(empty)_ | PostgreSQL connection string — when set, the scraper uses PostgreSQL instead of SQLite. Takes priority over `SCRAPER_DB_PATH`. See [§6.4](#64-scraper-database-options) |
| `SCRAPER_DISCOVERY_CONCURRENCY` | No | `10` | Max concurrent `searchNearby` calls during quadtree discovery |
| `SCRAPER_DETAIL_CONCURRENCY` | No | `20` | Max concurrent `getPlace` calls during detail fetch |
| `SCRAPER_ENRICHMENT_CONCURRENCY` | No | `10` | Max places enriched concurrently |
| `SCRAPER_MAX_PHOTOS` | No | `3` | Photos stored per place. Photo media requests are billed at $0.007/1000 — lower values reduce cost and Phase 3 download time |
| `SCRAPER_IMAGE_CONCURRENCY` | No | `40` | Max concurrent image downloads in Phase 3 (CDN, no API rate limit) |
| `SCRAPER_BACKEND` | No | `api` | `api` = Google Places API (default); `browser` = Playwright/Chromium ($0 API cost, ~24–48h/10K places) |
| `MAPS_BROWSER_POOL_SIZE` | No | `2` | Number of concurrent Chromium contexts (browser mode only) |
| `MAPS_BROWSER_MAX_PAGES` | No | `30` | Navigations per browser session before recycling (browser mode only) |
| `MAPS_BROWSER_HEADLESS` | No | `true` | Run Chromium headless (`true`) or visible for local debugging (`false`) |
| `LOG_FORMAT` | No | `json` | `json` = structured stdout (Cloud Run / Cloud Logging); `text` = human-readable + local `logs/external_queries.log` file |
| `LOG_LEVEL` | No | `INFO` | Python log level (`DEBUG`, `INFO`, `WARNING`, `ERROR`) |

### 2.3 Web Frontend (`apps/soulstep-customer-web/`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `VITE_API_URL` | **Yes (prod)** | _(relative `/api` in dev)_ | Production API base URL — **baked in at build time** |
| `VITE_ADSENSE_PUBLISHER_ID` | No | _(empty)_ | Google AdSense publisher ID for web ads |
| `VITE_UMAMI_WEBSITE_ID` | No | _(empty)_ | Umami Cloud website ID for privacy-friendly analytics. Script proxied via `/umami/script.js` to bypass adblockers. Get from Umami Cloud dashboard |

### 2.4 Mobile (`apps/soulstep-customer-mobile/`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `EXPO_PUBLIC_API_URL` | No | `http://127.0.0.1:3000` | API base URL for device/Expo Go |
| `EXPO_PUBLIC_ADMOB_APP_ID_IOS` | No | _(empty)_ | Google AdMob App ID for iOS |
| `EXPO_PUBLIC_ADMOB_APP_ID_ANDROID` | No | _(empty)_ | Google AdMob App ID for Android |
| `EXPO_PUBLIC_UMAMI_WEBSITE_ID` | No | _(empty)_ | Umami Cloud website ID for analytics. Sends directly to `cloud.umami.is` (no adblocker risk in native apps) |

---

## 3. Plan A — Docker Compose

Deploy the full stack with Docker Compose. Dockerfiles for all services are checked into the repo.

Migrations run automatically on API startup (see [§6.1](#61-database-migrations)). For scheduled jobs, see [§3.7](#37-scheduled-jobs-docker). For mobile builds, see [§7](#7-mobile).

### 3.1 Files

| File | Description |
|---|---|
| `soulstep-catalog-api/Dockerfile` | FastAPI backend — `python:3.12-slim` |
| `soulstep-scraper-api/Dockerfile` | Scraper service — `python:3.12-slim` |
| `apps/soulstep-customer-web/Dockerfile` | Multi-stage: Node 20 build → nginx:1.27-alpine serve |
| `apps/soulstep-customer-web/nginx.conf` | nginx SPA config (copied into web image) |
| `docker-compose.yml` | Wires all services + PostgreSQL |

### 3.2 Quick Start

```bash
# 1. Copy and fill out env vars
cp .env.example .env   # edit JWT_SECRET, VITE_API_URL, etc.

# 2. Build and start (api + db + web)
docker compose up -d --build

# 3. (Optional) start the scraper service too
docker compose --profile scraper up -d scraper
```

### 3.3 Services

| Service | Image/Build | Port | Notes |
|---|---|---|---|
| `db` | `postgres:15-alpine` | internal | PostgreSQL; data persisted in `postgres_data` volume |
| `api` | `./soulstep-catalog-api` | `3000` | FastAPI; waits for `db` health; auto-runs Alembic migrations on start |
| `web` | `./apps/soulstep-customer-web` | `80` | nginx serving the compiled React SPA |
| `scraper` | `./soulstep-scraper-api` | `8001` | Optional; activate with `--profile scraper`; SQLite DB persisted in `scraper_data` volume at `/data/scraper.db` |

> **Scraper database:** The scraper uses its own SQLite database (separate from the main API's PostgreSQL). In `docker-compose.yml`, a named volume `scraper_data` is mounted at `/data` inside the container, and `SCRAPER_DB_PATH=/data/scraper.db` tells the app to write there. Without this, `scraper.db` would be lost on every container restart. For persistent PostgreSQL instead, see [§6.4](#64-scraper-database-options).

> **Browser scraper mode (Docker):** To use `SCRAPER_BACKEND=browser`, set the env var in `docker-compose.yml` or your `.env`. The scraper `Dockerfile` already installs Chromium system dependencies and runs `playwright install chromium`, so no extra build steps are required. Increase the scraper container's memory to at least **2 GB** and allow longer run timeouts — browser scraping takes ~24–48h per 10K places compared to ~3h for the API path. `GOOGLE_MAPS_API_KEY` is not required in browser mode.

### 3.4 Required `.env`

```dotenv
POSTGRES_PASSWORD=changeme_strong_password
JWT_SECRET=your-long-random-secret
VITE_API_URL=http://localhost:3000   # or public API URL
CORS_ORIGINS=http://localhost        # space-separated; add web domain

# Optional
JWT_EXPIRE=30m
REFRESH_EXPIRE=30d
RESEND_API_KEY=
RESEND_FROM_EMAIL=noreply@soul-step.org
RESET_URL_BASE=http://localhost
GOOGLE_MAPS_API_KEY=
SCRAPER_TIMEZONE=UTC
# SCRAPER_DB_PATH is set inside docker-compose.yml — no need to set it here
API_PORT=3000
WEB_PORT=80
SCRAPER_PORT=8001

# GCS image storage (optional — defaults to blob/DB storage)
# IMAGE_STORAGE=gcs
# GCS_BUCKET_NAME=soulstep-images
# GOOGLE_APPLICATION_CREDENTIALS=/run/secrets/gcs-sa.json
```

### 3.5 Building the Web Image

`VITE_API_URL` is baked in at build time — the variable must be set before building:

```bash
docker build \
  --build-arg VITE_API_URL=https://api.soul-step.org \
  -t soulstep-web \
  apps/soulstep-customer-web/
```

### 3.6 GCS Image Storage (Docker)

Mount a GCP service account JSON into the container (`-v /path/to/sa.json:/run/secrets/gcs-sa.json`) and set `GOOGLE_APPLICATION_CREDENTIALS=/run/secrets/gcs-sa.json`. The service account needs `roles/storage.objectAdmin` on the bucket. Create the bucket with public-read ACLs or an IAM policy binding `allUsers:roles/storage.objectViewer`.

### 3.7 Scheduled Jobs (Docker)

```bash
# Cleanup orphaned review images (run daily, e.g. 2 AM)
docker exec <api_container> python -m app.jobs.cleanup_orphaned_images

# Backfill place timezones (run once after adding new places)
docker exec <api_container> python -m app.jobs.backfill_timezones
```

Example cron entry (on the host):
```
0 2 * * * docker exec soulstep-catalog-api python -m app.jobs.cleanup_orphaned_images
```

For the full list of available jobs, see [§6.3](#63-scheduled-jobs).

### 3.8 Post-Sync SEO Generation (Docker)

After syncing 10K+ places, all imported places have `seo_slug = NULL`.
Run SEO generation using one of these methods:

**Option A — Automatic (recommended for production)**
Set env vars on the scraper service:
- `SCRAPER_TRIGGER_SEO_AFTER_SYNC=true`
- `SCRAPER_CATALOG_ADMIN_TOKEN=<jwt_from_admin_login>`
SEO generation will fire automatically after each sync completes.

**Option B — Manual script**
```bash
cd soulstep-catalog-api && source .venv/bin/activate
python scripts/generate_seo.py --generate
python scripts/generate_seo.py --translate  # requires GOOGLE_CLOUD_PROJECT
```

**Option C — Admin API**
```bash
curl -X POST https://your-catalog-url/api/v1/admin/seo/generate \
  -H "Authorization: Bearer <admin_jwt>" \
  -H "Content-Type: application/json" \
  -d '{"force": false}'
```

---

## 4. Plan B — Render + Vercel (Free Tier)

Recommended free-tier setup: **Render** for the backend API (and optionally the scraper), **Neon** for the database (generous free tier, no expiry), **Vercel** for the web frontend.

Migrations run automatically on API startup (see [§6.1](#61-database-migrations)). For mobile builds, see [§7](#7-mobile).

---

### 4.1 Create Database (Neon)

> **Why Neon over Render Postgres?** Render's free Postgres expires after 90 days. Neon's free tier doesn't expire and gives you 0.5 GB storage.

1. Go to [neon.tech](https://neon.tech) → **Sign up** (GitHub login works).
2. Click **New Project** → give it a name (e.g. `soulstep`).
3. Choose region closest to your Render region (e.g. `us-east-1`).
4. Click **Create Project**.
5. On the project dashboard, click **Connection string** → choose **Pooled connection** (psycopg2-compatible).
6. Copy the string — it looks like:
   ```
   postgresql://user:password@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require
   ```
7. **Save this string** — you'll paste it as `DATABASE_URL` in the next step.

> **If using Render Postgres instead:** Dashboard → New → PostgreSQL → fill name/region → Create. Then go to the database page → **Connection** tab → copy the **Internal Database URL** (use internal URL when API and DB are both on Render; it's faster and doesn't count as egress).

---

### 4.2 Deploy Backend API (Render)

1. Go to [render.com](https://render.com) → **New** → **Web Service**.
2. Connect your GitHub account and select the `soulstep` repo.
3. Fill in the service settings:

   | Setting | Value |
   |---|---|
   | **Name** | `soulstep-catalog-api` (or any name) |
   | **Region** | Same region as your database |
   | **Root Directory** | `soulstep-catalog-api` |
   | **Runtime** | `Python 3` |
   | **Build Command** | `pip install -r requirements.txt` |
   | **Start Command** | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
   | **Instance Type** | Free |

   > **Browser translation backend (optional):** If you set `TRANSLATION_BACKEND=browser`, Playwright and Chromium must be installed separately — they are intentionally excluded from `requirements.txt` to keep the default footprint small (~200 MB for Chromium). Change the build command to: `pip install -r requirements.txt && pip install playwright && playwright install chromium --with-deps`.

4. Click **Advanced** → **Add Environment Variable** → add each variable below:

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | The Neon (or Render Postgres) connection string from §4.1 |
   | `JWT_SECRET` | A long random string — generate with `openssl rand -hex 32` |
   | `CORS_ORIGINS` | `https://your-app.vercel.app` (you'll get this URL in §4.3; update it then) |
   | `JWT_EXPIRE` | `30m` |
   | `REFRESH_EXPIRE` | `30d` |
   | `RESET_URL_BASE` | `https://your-app.vercel.app` (same as CORS_ORIGINS) |
   | `RESEND_API_KEY` | Optional — leave empty if not using email |
   | `RESEND_FROM_EMAIL` | `noreply@soul-step.org` (only needed with Resend) |

5. Click **Create Web Service**. Render will build and deploy; first deploy takes ~2 min.
6. Once live, your API URL is `https://soulstep-catalog-api.onrender.com` (shown at the top of the service page). Copy it.

> **Auto-deploy:** By default Render deploys on every push to `main`. If you're using the GitHub Actions deploy workflow (see [§4.5](#45-cicd-github-actions)), **disable auto-deploy**: Service → Settings → **Auto-Deploy → Off**. The workflow will trigger deploys via a deploy hook after tests pass.

---

### 4.3 Deploy Web Frontend (Vercel)

1. Go to [vercel.com](https://vercel.com) → **Add New Project** → import the `soulstep` repo.
2. On the **Configure Project** screen:

   | Setting | Value |
   |---|---|
   | **Root Directory** | `apps/soulstep-customer-web` |
   | **Framework Preset** | `Vite` (Vercel auto-detects) |
   | **Build Command** | `npm run build` |
   | **Output Directory** | `dist` |

3. Under **Environment Variables**, add:

   | Key | Value |
   |---|---|
   | `VITE_API_URL` | `https://soulstep-catalog-api.onrender.com` (your Render API URL from §4.2) |

4. Click **Deploy**. Once deployed, copy your Vercel URL (e.g. `https://soulstep.vercel.app`).
5. **Go back to Render** → your API service → **Environment** tab → update `CORS_ORIGINS` and `RESET_URL_BASE` to your Vercel URL, then **Save** (Render will redeploy automatically).

> **VITE_API_URL is baked in at build time.** If you ever change the API URL, update this env var in Vercel and redeploy.

> **Get Vercel IDs for GitHub Actions:** In your Vercel project → **Settings → General** → note the **Project ID**. Your **Org/Team ID** is at [vercel.com/account](https://vercel.com/account) → Settings → copy the **ID** under your username/team. You'll need both in [§4.5](#45-cicd-github-actions).

---

### 4.4 Data Scraper on Render (optional)

Only needed if you want the scraper service running in production:

1. **New** → **Web Service** → same repo.

   | Setting | Value |
   |---|---|
   | **Root Directory** | `soulstep-scraper-api` |
   | **Build Command** | `pip install -r requirements.txt` |
   | **Start Command** | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |

2. Environment variables:

   | Key | Value |
   |---|---|
   | `MAIN_SERVER_URL` | `https://soulstep-catalog-api.onrender.com` |
   | `GOOGLE_MAPS_API_KEY` | Your Google Maps API key |
   | `SCRAPER_TIMEZONE` | e.g. `Asia/Dubai` or `UTC` |

3. Get the scraper's deploy hook (same process as the API deploy hook) and save it as `RENDER_SCRAPER_DEPLOY_HOOK_URL` in [§4.5](#45-cicd-github-actions).

#### Scraper database persistence on Render

> **Important:** Render's free tier has **ephemeral storage** — the filesystem is wiped on every deploy and restart. The scraper's `scraper.db` will be lost unless you attach a persistent disk.

**Option A — Render Persistent Disk (recommended, ~$0.25/GB/month):**

1. In your scraper service → **Settings → Disks → Add Disk**.
2. Set **Mount Path** to `/data` and choose a size (1 GB is plenty).
3. Add the environment variable:

   | Key | Value |
   |---|---|
   | `SCRAPER_DB_PATH` | `/data/scraper.db` |

Render will mount the disk at `/data` and the scraper will write its SQLite file there. Data persists across deploys and restarts.

**Option B — Accept ephemeral storage (simpler, free):**

If you're running the scraper on-demand (trigger a scrape, sync data to the main API, then stop), you don't need persistence. The seeded geo/timezone data re-seeds automatically on every startup (idempotent). Only scraping run history is lost on restart. Set no `SCRAPER_DB_PATH` — it defaults to `scraper.db` in the working directory.

For more on SQLite vs PostgreSQL for the scraper, see [§6.4](#64-scraper-database-options).

---

### 4.5 CI/CD (GitHub Actions)

The workflow at `.github/workflows/deploy.yml` runs on every push to `main`:

1. Runs server tests (`pytest`) and web build (`tsc + vite build`)
2. On success, triggers the Render deploy hook (redeploys the API)
3. On success, runs `vercel build --prod` + `vercel deploy --prebuilt --prod`

#### Get the Render Deploy Hook

1. In your Render API service → **Settings** tab → scroll to **Deploy Hook**.
2. Click **Generate Deploy Hook** → copy the URL (looks like `https://api.render.com/deploy/srv-xxx?key=yyy`).

#### Required GitHub Secrets and Variables

Go to your GitHub repo → **Settings → Secrets and Variables → Actions**.

Under **Secrets** (encrypted):

| Secret name | Where to get it |
|---|---|
| `RENDER_API_DEPLOY_HOOK_URL` | Render → API service → Settings → Deploy Hook |
| `RENDER_SCRAPER_DEPLOY_HOOK_URL` | Render → Scraper service → Settings → Deploy Hook (skip if not using scraper) |
| `VERCEL_TOKEN` | [vercel.com/account/tokens](https://vercel.com/account/tokens) → **Create Token** |
| `VERCEL_ORG_ID` | Vercel → Account Settings → copy the **ID** field |
| `VERCEL_PROJECT_ID` | Vercel → Project → Settings → General → copy **Project ID** |

Under **Variables** (non-secret):

| Variable name | Value |
|---|---|
| `DEPLOY_SCRAPER` | `true` to also deploy the scraper; omit or set to anything else to skip |

#### GitHub Environment (optional but recommended)

The deploy jobs reference the `production` environment. To create it:

1. Repo → **Settings → Environments → New environment** → name it `production`.
2. Add **Required reviewers** if you want a manual approval gate before deploys go out.
3. Move the secrets above into the environment instead of the repo level for tighter scoping.

#### What the pipeline does on a push to `main`

```
push to main
  ├── test-server (pytest)   ─┐
  └── test-web (tsc + build) ─┴─ both must pass ──► deploy-backend (Render hook)
                                                  └► deploy-web (Vercel CLI)
                                                  └► deploy-scraper (Render hook, if DEPLOY_SCRAPER=true)
```

---

### 4.6 Scheduled Jobs on Render

**Option A — Render Cron Job (paid plans only):**

New → Cron Job → same repo, root directory `server`:
- Build: `pip install -r requirements.txt`
- Command: `python -m app.jobs.cleanup_orphaned_images`
- Schedule: `0 2 * * *` (2 AM daily)

**Option B — GitHub Actions scheduled workflow (free):**

Create `.github/workflows/cleanup.yml`:

```yaml
on:
  schedule:
    - cron: '0 2 * * *'   # 2 AM UTC daily
  workflow_dispatch:

jobs:
  cleanup:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger cleanup via API endpoint
        run: |
          curl -s -X POST https://soulstep-catalog-api.onrender.com/admin/cleanup-images \
            -H "Authorization: Bearer ${{ secrets.ADMIN_API_KEY }}"
```

For the full list of available jobs, see [§6.3](#63-scheduled-jobs).

---

### 4.8 Post-Sync SEO Generation (Render)

After syncing 10K+ places, all imported places have `seo_slug = NULL`.
Run SEO generation using one of these methods:

**Option A — Automatic (recommended for production)**
Set env vars on the scraper service:
- `SCRAPER_TRIGGER_SEO_AFTER_SYNC=true`
- `SCRAPER_CATALOG_ADMIN_TOKEN=<jwt_from_admin_login>`
SEO generation will fire automatically after each sync completes.

**Option B — Manual script**
```bash
cd soulstep-catalog-api && source .venv/bin/activate
python scripts/generate_seo.py --generate
python scripts/generate_seo.py --translate  # requires GOOGLE_CLOUD_PROJECT
```

**Option C — Admin API**
```bash
curl -X POST https://your-catalog-url/api/v1/admin/seo/generate \
  -H "Authorization: Bearer <admin_jwt>" \
  -H "Content-Type: application/json" \
  -d '{"force": false}'
```

---

## 5. Plan C — Google Cloud Platform

Services used: **Cloud Run** (API + optional scraper), **Cloud SQL** (PostgreSQL 15), **Firebase Hosting** (web), **Artifact Registry** (Docker images), **Secret Manager** (credentials), **Cloud Scheduler** (cron jobs).

Throughout this section, replace:
- `PROJECT_ID` → your GCP project ID (e.g. `project-fa2d7f52-2bc4-4a46-8ae`)
- `REGION` → your chosen region (e.g. `europe-west1`)

Migrations run automatically on API startup (see [§6.1](#61-database-migrations)). For mobile builds, see [§7](#7-mobile).

---

### 5.1 Prerequisites

1. **Install the gcloud CLI:**
   ```bash
   # macOS
   brew install google-cloud-sdk

   # Or download from: https://cloud.google.com/sdk/docs/install
   ```

2. **Log in and configure Docker auth:**
   ```bash
   gcloud auth login
   gcloud auth configure-docker REGION-docker.pkg.dev
   ```

3. **Create a GCP project** (skip if you have one):
   ```bash
   gcloud projects create PROJECT_ID --name="SoulStep"
   gcloud config set project PROJECT_ID
   ```

4. **Enable billing** — Cloud Run, Cloud SQL, and Artifact Registry all require a billing account. Go to [console.cloud.google.com/billing](https://console.cloud.google.com/billing) and link one to the project.

5. **Enable all required APIs in one command:**
   ```bash
   gcloud services enable \
     run.googleapis.com \
     sqladmin.googleapis.com \
     secretmanager.googleapis.com \
     artifactregistry.googleapis.com \
     cloudscheduler.googleapis.com \
     cloudbuild.googleapis.com \
     firebase.googleapis.com \
     firebasehosting.googleapis.com \
     translate.googleapis.com \
     --project PROJECT_ID
   ```

---

### 5.2 Artifact Registry

Docker images need a registry before Cloud Run can pull them.

```bash
gcloud artifacts repositories create soulstep \
  --repository-format=docker \
  --location=REGION \
  --description="SoulStep images"
```

Your image prefix will be: `REGION-docker.pkg.dev/PROJECT_ID/soulstep/`

---

### 5.3 Database (Cloud SQL)

#### a. Create the Cloud SQL instance

```bash
gcloud sql instances create soulstep-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=REGION \
  --storage-type=SSD \
  --storage-size=10GB \
  --backup-start-time=03:00
```

> `db-f1-micro` is the cheapest tier (~$7/month). Use `db-g1-small` or higher for meaningful production traffic.

#### b. Create the database and app user

```bash
# Create the database
gcloud sql databases create soulstep --instance=soulstep-db

# Create the app user (use a strong password)
gcloud sql users create soulstep \
  --instance=soulstep-db \
  --password=STRONG_DB_PASSWORD
```

#### c. Get the connection name

```bash
gcloud sql instances describe soulstep-db \
  --format="value(connectionName)"
# Output: PROJECT_ID:REGION:soulstep-db
```

Save this value — it's used in Cloud Run deploys as `--add-cloudsql-instances`.

The `DATABASE_URL` for Cloud Run uses a Unix socket (no proxy needed when running in Cloud Run):
```
postgresql://soulstep:STRONG_DB_PASSWORD@/soulstep?host=/cloudsql/PROJECT_ID:REGION:soulstep-db
```

---

### 5.4 Secrets (Secret Manager) + IAM Roles

Never pass sensitive values as plain `--set-env-vars`. Use Secret Manager and mount them as secrets.

```bash
# JWT secret — generate with: openssl rand -hex 32
echo -n "your-long-random-jwt-secret" | \
  gcloud secrets create JWT_SECRET \
    --data-file=- \
    --replication-policy=automatic

# Database URL (the full connection string from §5.3c)
echo -n "postgresql://soulstep:STRONG_DB_PASSWORD@/soulstep?host=/cloudsql/PROJECT_ID:REGION:soulstep-db" | \
  gcloud secrets create DATABASE_URL \
    --data-file=- \
    --replication-policy=automatic

# Resend API key (optional — only needed for password-reset emails)
echo -n "re_your_resend_api_key" | \
  gcloud secrets create RESEND_API_KEY \
    --data-file=- \
    --replication-policy=automatic
```

To update a secret value later:
```bash
echo -n "new-value" | gcloud secrets versions add JWT_SECRET --data-file=-
```

#### Grant Cloud Run the required IAM roles

The default Cloud Run compute service account needs two roles — **both are required** or the service will crash on startup:

| Role | Why it's needed |
|---|---|
| `roles/secretmanager.secretAccessor` | Reads `JWT_SECRET`, `DATABASE_URL`, etc. from Secret Manager at startup |
| `roles/cloudsql.client` | Allows the Cloud SQL Auth Proxy sidecar (mounted via `--add-cloudsql-instances`) to authenticate and open the Unix socket. Without this the socket exists but every connection attempt is refused. |

```bash
PROJECT_NUMBER=$(gcloud projects describe PROJECT_ID --format="value(projectNumber)")
SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# Required: read secrets mounted via --set-secrets
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor"

# Required: connect to Cloud SQL via the proxy socket (--add-cloudsql-instances)
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/cloudsql.client"
```

> **Symptom if `cloudsql.client` is missing:** the app starts, the socket path `/cloudsql/PROJECT_ID:REGION:instance/.s.PGSQL.5432` is created, but every connection attempt returns `psycopg2.OperationalError: Connection refused`. Adding the role and redeploying fixes it immediately.

---

### 5.5 Build & Push API Image

**Option A — build locally (requires Docker):**
```bash
docker build --platform linux/amd64 -t REGION-docker.pkg.dev/PROJECT_ID/soulstep/api:latest ./soulstep-catalog-api
docker push REGION-docker.pkg.dev/PROJECT_ID/soulstep/api:latest
```

**Option B — build in the cloud with Cloud Build (no local Docker needed):**
```bash
gcloud builds submit ./soulstep-catalog-api \
  --tag REGION-docker.pkg.dev/PROJECT_ID/soulstep/api:latest
```

---

### 5.6 Deploy API (Cloud Run)

```bash
gcloud run deploy soulstep-catalog-api \
  --image REGION-docker.pkg.dev/PROJECT_ID/soulstep/api:latest \
  --platform managed \
  --region REGION \
  --allow-unauthenticated \
  --add-cloudsql-instances PROJECT_ID:REGION:soulstep-db \
  --set-secrets "JWT_SECRET=JWT_SECRET:latest,DATABASE_URL=DATABASE_URL:latest,RESEND_API_KEY=RESEND_API_KEY:latest" \
  --set-env-vars "CORS_ORIGINS=https://PROJECT_ID.web.app,JWT_EXPIRE=30m,REFRESH_EXPIRE=30d,RESEND_FROM_EMAIL=noreply@soul-step.org,RESET_URL_BASE=https://PROJECT_ID.web.app,IMAGE_STORAGE=gcs,GCS_BUCKET_NAME=soulstep-images" \
  --min-instances 0 \
  --max-instances 10 \
  --memory 512Mi \
  --timeout 30
```

Once deployed, copy the **Service URL** shown at the end of the output — it looks like:
```
https://soulstep-catalog-api-xxxxxxxxxxxx-uc.a.run.app
```

> **GCS image storage (GCP):** On Cloud Run, grant the Cloud Run service account `roles/storage.objectAdmin` on the bucket — no `GOOGLE_APPLICATION_CREDENTIALS` file needed (workload identity / ADC is used automatically). Create the bucket: `gcloud storage buckets create gs://soulstep-images --location=REGION`. Grant public read: `gcloud storage buckets add-iam-policy-binding gs://soulstep-images --member=allUsers --role=roles/storage.objectViewer`.

> **Cold starts:** `--min-instances 0` = free (scales to zero when idle). Set `--min-instances 1` to eliminate cold starts (~$10/month for one always-on instance).
>
> **Startup migration latency:** On cold start the app runs Alembic migrations, which requires establishing a Cloud SQL connection (~5s for the first IAM-authenticated connection). To eliminate this:
> - **Option A — always-warm:** use `--min-instances 1` so the container never fully shuts down.
> - **Option B — separate migration step:** run migrations as a pre-deploy Cloud Run Job, then set `RUN_MIGRATIONS_ON_START=false` in the service env vars. The app skips `run_migrations()` when this var is `false`.

#### Update CORS after deploying the web frontend (§5.7)

After you have the Firebase URL, come back and patch the env vars.

> **Important:** Firebase Hosting gives every project **two** default domains — both must be in `CORS_ORIGINS` or you'll get CORS errors depending on which URL the browser uses:
> - `https://PROJECT_ID.web.app`
> - `https://PROJECT_ID.firebaseapp.com`
>
> `CORS_ORIGINS` is **space-separated** (not comma-separated). The `--update-env-vars` flag uses commas to separate variable assignments, so quote the value carefully:

```bash
gcloud run services update soulstep-catalog-api \
  --region REGION \
  --update-env-vars "CORS_ORIGINS=https://PROJECT_ID.web.app https://PROJECT_ID.firebaseapp.com,RESET_URL_BASE=https://PROJECT_ID.web.app"
```

---

### 5.7 Deploy Web Frontend (Firebase Hosting)

#### a. Install Firebase CLI and initialise the project

**Prerequisite — add Firebase to your GCP project (one-time, required)**

A GCP project and a Firebase project are separate things. Firebase Hosting returns a 404 until Firebase is explicitly enabled on the project.

**Option A — web console (recommended, always works):**
1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add project** → select **"Add Firebase to a Google Cloud Platform project"**
3. Choose `PROJECT_ID` from the dropdown
4. Skip Google Analytics when prompted
5. Click **Add Firebase** and wait for it to finish

**Option B — CLI (may return 403 on projects not originally created via Firebase console):**
```bash
npm install -g firebase-tools
firebase login
firebase projects:addfirebase PROJECT_ID
```
If this returns a 403, use the web console instead (Option A).

Once Firebase is enabled on the project:

```bash
firebase init hosting
```

When prompted:
- **Use an existing project** → select your GCP project ID
- **Public directory:** `apps/soulstep-customer-web/dist`
- **Single-page app (rewrite all URLs to /index.html):** `Yes`
- **Set up automatic builds with GitHub:** `No` (`.github/workflows/deploy.yml` handles this via Firebase token)
- **Overwrite `dist/index.html`:** `No`

This creates `firebase.json` and `.firebaserc` at the repo root (both are already checked in — skip this step if they exist).

#### b. Build and deploy

```bash
cd apps/soulstep-customer-web
VITE_API_URL=https://soulstep-catalog-api-xxxxxxxxxxxx-uc.a.run.app npm run build
cd ../..
firebase deploy --only hosting
```

Your app is live at `https://PROJECT_ID.web.app`. Copy this URL and go back to [§5.6](#56-deploy-api-cloud-run) to update `CORS_ORIGINS`.

#### c. Custom domain (optional)

Firebase console → **Hosting** → **Add custom domain** → follow the DNS verification steps. Firebase provisions a TLS cert automatically within minutes.

---

### 5.8 Managing Environment Variables

There are two categories of env vars in the GCP setup:

| Category | Where they live | How to change them |
|---|---|---|
| **Frontend** (`VITE_*`) | Baked into the build at CI time | GitHub repo Secrets |
| **Backend** (Cloud Run) | Set on the Cloud Run service | `gcloud` CLI or GCP Console — persists across deploys |

---

#### Frontend `VITE_*` variables → GitHub Secrets

These are injected during `npm run build` in the GitHub Actions workflow. To add or update one:

**Via GitHub UI:**
1. Go to your repo on GitHub → **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Add the name and value → **Add secret**

**Current frontend secrets used by the workflow:**

| Secret name | Value |
|---|---|
| `VITE_API_URL` | `https://soulstep-catalog-api-834941457147.europe-west1.run.app` |
| `VITE_ADSENSE_PUBLISHER_ID` | `ca-pub-7902951158656200` |

> After adding a secret, the next `git push` to `main` will pick it up automatically.

---

#### Backend env vars → Cloud Run

These live on the Cloud Run service and **persist across every deploy** — the GitHub Actions `gcloud run deploy` command does not overwrite them.

**Option A — GCP Console (UI):**
1. Go to [console.cloud.google.com](https://console.cloud.google.com) → **Cloud Run**
2. Click **soulstep-catalog-api** → **Edit & Deploy New Revision**
3. Scroll to **Variables & Secrets** tab
4. Under **Environment variables**, click **+ Add variable** for each one
5. Click **Deploy** — a new revision is created with the updated vars

**Option B — CLI:**

Add or update specific variables (safe — only touches the vars you name):
```bash
gcloud run services update soulstep-catalog-api \
  --region europe-west1 \
  --update-env-vars "VAR_NAME=value,ANOTHER_VAR=value"
```

Replace all env vars at once (overwrites everything not listed — use with care):
```bash
gcloud run services update soulstep-catalog-api \
  --region europe-west1 \
  --set-env-vars "VAR1=value1,VAR2=value2"
```

View current env vars on the running service:
```bash
gcloud run services describe soulstep-catalog-api \
  --region europe-west1 \
  --format="yaml(spec.template.spec.containers[0].env)"
```

**Full set of backend env vars for production:**
```bash
gcloud run services update soulstep-catalog-api \
  --region europe-west1 \
  --update-env-vars "CORS_ORIGINS=https://soul-step.org https://project-fa2d7f52-2bc4-4a46-8ae.web.app https://project-fa2d7f52-2bc4-4a46-8ae.firebaseapp.com,FRONTEND_URL=https://soul-step.org,API_BASE_URL=https://soulstep-catalog-api-834941457147.europe-west1.run.app,RESET_URL_BASE=https://soul-step.org,RESEND_FROM_EMAIL=noreply@soul-step.org,JWT_EXPIRE=30m,REFRESH_EXPIRE=30d"
```

> Secrets (`JWT_SECRET`, `DATABASE_URL`, `RESEND_API_KEY`) are managed separately via Secret Manager — see [§5.4](#54-secrets-secret-manager--iam-roles).

---

### 5.9 Data Scraper (Cloud Run, optional)

Only needed for automated place scraping in production.

The scraper (`soulstep-scraper-api`) is an **HTTP API service** — scrape runs are triggered via `POST /api/v1/scraper/runs` and monitored via `GET /api/v1/scraper/runs/{run_code}`. It runs as a long-lived Cloud Run Service, **not** a one-shot job.

> **SQLite is ephemeral on Cloud Run** — the scraper's `scraper.db` is wiped on every cold start. This is fine: geo/place-type seeds re-run automatically on startup (idempotent), and scrape run history only needs to persist for the duration of an active run session. If you need persistent run history, see [§5.9f](#f-persistent-run-history-optional-upgrade).

---

#### a. Store scraper API keys in Secret Manager

```bash
# Required
echo -n "your-google-maps-api-key" | \
  gcloud secrets create SCRAPER_GOOGLE_MAPS_API_KEY --data-file=- --replication-policy=automatic

# Optional collectors — only create if you have the keys
echo -n "your-besttime-key" | \
  gcloud secrets create SCRAPER_BESTTIME_API_KEY --data-file=- --replication-policy=automatic

echo -n "your-foursquare-key" | \
  gcloud secrets create SCRAPER_FOURSQUARE_API_KEY --data-file=- --replication-policy=automatic

echo -n "your-outscraper-key" | \
  gcloud secrets create SCRAPER_OUTSCRAPER_API_KEY --data-file=- --replication-policy=automatic

echo -n "your-gemini-key" | \
  gcloud secrets create SCRAPER_GEMINI_API_KEY --data-file=- --replication-policy=automatic
```

Grant the compute service account access:
```bash
PROJECT_NUMBER=$(gcloud projects describe project-fa2d7f52-2bc4-4a46-8ae --format="value(projectNumber)")
SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

for SECRET in SCRAPER_GOOGLE_MAPS_API_KEY SCRAPER_BESTTIME_API_KEY SCRAPER_FOURSQUARE_API_KEY SCRAPER_OUTSCRAPER_API_KEY SCRAPER_GEMINI_API_KEY; do
  gcloud secrets add-iam-policy-binding $SECRET \
    --member="serviceAccount:${SA}" \
    --role="roles/secretmanager.secretAccessor" 2>/dev/null || true
done
```

---

#### b. Build and push the scraper image

```bash
gcloud builds submit ./soulstep-scraper-api \
  --tag europe-west1-docker.pkg.dev/project-fa2d7f52-2bc4-4a46-8ae/soulstep/scraper:latest \
  --region europe-west1
```

---

#### c. Deploy as a Cloud Run Service

```bash
gcloud run deploy soulstep-scraper-api \
  --image europe-west1-docker.pkg.dev/project-fa2d7f52-2bc4-4a46-8ae/soulstep/scraper:latest \
  --platform managed \
  --region europe-west1 \
  --no-allow-unauthenticated \
  --set-secrets "GOOGLE_MAPS_API_KEY=SCRAPER_GOOGLE_MAPS_API_KEY:latest,BESTTIME_API_KEY=SCRAPER_BESTTIME_API_KEY:latest,FOURSQUARE_API_KEY=SCRAPER_FOURSQUARE_API_KEY:latest,OUTSCRAPER_API_KEY=SCRAPER_OUTSCRAPER_API_KEY:latest,GEMINI_API_KEY=SCRAPER_GEMINI_API_KEY:latest" \
  --set-env-vars "MAIN_SERVER_URL=https://soulstep-catalog-api-834941457147.europe-west1.run.app,SCRAPER_TIMEZONE=Asia/Dubai,SCRAPER_DB_PATH=/tmp/scraper.db,LOG_FORMAT=json" \
  --memory 1Gi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 1 \
  --timeout 3600
```

> `--no-allow-unauthenticated` — the scraper is internal only, not public.
>
> `--timeout 3600` — scrape runs can take up to 60 min; Cloud Run's default 5-min timeout would kill them.
>
> `--max-instances 1` — prevents concurrent runs which would cause SQLite write conflicts.

> **Browser mode (SCRAPER_BACKEND=browser):** Add `SCRAPER_BACKEND=browser` (and optionally `MAPS_BROWSER_POOL_SIZE`, `MAPS_BROWSER_MAX_PAGES`, `MAPS_BROWSER_HEADLESS`) to `--set-env-vars`. Increase resources to `--memory 2Gi --cpu 2`. `GOOGLE_MAPS_API_KEY` is not required and can be omitted from `--set-secrets`. The `Dockerfile` already installs all Chromium dependencies — no image changes are needed.
>
> ```bash
> gcloud run services update soulstep-scraper-api \
>   --region REGION \
>   --memory 2Gi \
>   --cpu 2 \
>   --update-env-vars "SCRAPER_BACKEND=browser,MAPS_BROWSER_POOL_SIZE=2,MAPS_BROWSER_MAX_PAGES=30,MAPS_BROWSER_HEADLESS=true"
> ```

Once deployed, copy the **Service URL** — it looks like:
```
https://soulstep-scraper-api-834941457147.europe-west1.run.app
```

Tell the catalog API where to find the scraper (enables the admin dashboard scraper proxy):
```bash
gcloud run services update soulstep-catalog-api \
  --region europe-west1 \
  --update-env-vars "DATA_SCRAPER_URL=https://soulstep-scraper-api-834941457147.europe-west1.run.app"
```

---

#### d. Trigger and monitor scrape runs

The scraper requires an identity token (it's not public). Use `gcloud auth print-identity-token` to authenticate:

```bash
TOKEN=$(gcloud auth print-identity-token)
SCRAPER_URL=https://soulstep-scraper-api-834941457147.europe-west1.run.app

# 1. Check the scraper is healthy
curl -H "Authorization: Bearer $TOKEN" $SCRAPER_URL/health

# 2. List existing data locations (cities/regions configured for scraping)
curl -H "Authorization: Bearer $TOKEN" $SCRAPER_URL/api/v1/scraper/data-locations

# 3. Create a data location (first time setup — repeat for each city you want to scrape)
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Dubai", "city": "Dubai", "max_results": 50}' \
  $SCRAPER_URL/api/v1/scraper/data-locations

# 4. Start a scrape run (use the location_code returned in step 3)
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"location_code": "loc_XXXXXXXX"}' \
  $SCRAPER_URL/api/v1/scraper/runs

# 5. Poll run status (use the run_code returned in step 4)
curl -H "Authorization: Bearer $TOKEN" \
  $SCRAPER_URL/api/v1/scraper/runs/run_XXXXXXXX

# 6. Once status = "completed", sync scraped places to the catalog API
curl -X POST -H "Authorization: Bearer $TOKEN" \
  $SCRAPER_URL/api/v1/scraper/runs/run_XXXXXXXX/sync
```

Alternatively, use the **admin dashboard** (soulstep-admin-web) → Scraper section, which wraps all of these calls through the catalog API proxy.

---

#### e. Redeploy after code changes

```bash
gcloud builds submit ./soulstep-scraper-api \
  --tag europe-west1-docker.pkg.dev/project-fa2d7f52-2bc4-4a46-8ae/soulstep/scraper:latest \
  --region europe-west1

gcloud run deploy soulstep-scraper-api \
  --image europe-west1-docker.pkg.dev/project-fa2d7f52-2bc4-4a46-8ae/soulstep/scraper:latest \
  --region europe-west1 \
  --quiet
```

---

#### f. Persistent run history (optional upgrade)

By default the scraper uses SQLite, which is wiped on every Cloud Run cold start. To keep full `ScraperRun`, `ScrapedPlace`, and `RawCollectorData` history across restarts, point the scraper at a PostgreSQL database using the `DATABASE_URL` environment variable. The scraper's `app/db/session.py` reads this variable and selects the appropriate engine automatically. See [§6.4](#64-scraper-database-options) for the full SQLite vs PostgreSQL comparison.

> **When to do this:** only if you need long-term audit history or multi-instance safety. If you run the scraper on-demand and sync results immediately, ephemeral SQLite is simpler.

##### Create a scraper database on the existing Cloud SQL instance

The main API already has a Cloud SQL instance (`soulstep-db`). Add a second database and user for the scraper rather than provisioning a new instance.

```bash
# Create a dedicated database
gcloud sql databases create soulstep-scraper --instance=soulstep-db

# Create a dedicated app user (use a strong password)
gcloud sql users create soulstep-scraper \
  --instance=soulstep-db \
  --password=STRONG_SCRAPER_DB_PASSWORD
```

The connection string follows the same Unix-socket pattern as the main API:

```
postgresql://soulstep-scraper:STRONG_SCRAPER_DB_PASSWORD@/soulstep-scraper?host=/cloudsql/PROJECT_ID:REGION:soulstep-db
```

##### Store the connection string in Secret Manager

```bash
echo -n "postgresql://soulstep-scraper:STRONG_SCRAPER_DB_PASSWORD@/soulstep-scraper?host=/cloudsql/PROJECT_ID:REGION:soulstep-db" | \
  gcloud secrets create SCRAPER_DATABASE_URL \
    --data-file=- \
    --replication-policy=automatic
```

Grant the compute service account access:

```bash
PROJECT_NUMBER=$(gcloud projects describe project-fa2d7f52-2bc4-4a46-8ae --format="value(projectNumber)")
SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

gcloud secrets add-iam-policy-binding SCRAPER_DATABASE_URL \
  --member="serviceAccount:${SA}" \
  --role="roles/secretmanager.secretAccessor"
```

The compute service account already has `roles/cloudsql.client` from [§5.4](#54-secrets-secret-manager--iam-roles) — no additional IAM changes are needed.

##### Redeploy the scraper with DATABASE_URL

Update the existing scraper service to mount the secret and connect to PostgreSQL:

```bash
gcloud run services update soulstep-scraper-api \
  --region europe-west1 \
  --add-cloudsql-instances PROJECT_ID:REGION:soulstep-db \
  --set-secrets "GOOGLE_MAPS_API_KEY=SCRAPER_GOOGLE_MAPS_API_KEY:latest,\
BESTTIME_API_KEY=SCRAPER_BESTTIME_API_KEY:latest,\
FOURSQUARE_API_KEY=SCRAPER_FOURSQUARE_API_KEY:latest,\
OUTSCRAPER_API_KEY=SCRAPER_OUTSCRAPER_API_KEY:latest,\
GEMINI_API_KEY=SCRAPER_GEMINI_API_KEY:latest,\
DATABASE_URL=SCRAPER_DATABASE_URL:latest"
```

> **What changes:** `DATABASE_URL` is now set, so `session.py` creates a PostgreSQL engine instead of SQLite. On the next cold start, Alembic runs migrations 0001 → 0002 → 0003 against the PostgreSQL database. Migration 0003 is a no-op on fresh databases (tables are created correctly from 0001 with the right types).

> **`SCRAPER_DB_PATH` is ignored** when `DATABASE_URL` is set — you can leave it unset or remove it from the service's env vars.

##### What happens on startup

1. `session.py` detects `DATABASE_URL` and creates a PostgreSQL engine (psycopg2).
2. `run_migrations()` runs Alembic against the PostgreSQL database:
   - Fresh DB: runs 0001 → 0002 → 0003, creating all tables with `TIMESTAMPTZ` columns.
   - Existing DB already at head: no-op.
3. `seed_geo_boundaries()` and `seed_place_type_mappings()` run as usual (idempotent upserts).

Scrape runs, scraped places, and raw collector data now survive cold starts.

##### Local development with PostgreSQL (optional)

To test the PostgreSQL path locally, set `DATABASE_URL` in your `.env` before starting the scraper:

```dotenv
DATABASE_URL=postgresql://soulstep-scraper:password@localhost:5432/soulstep-scraper
```

You can spin up a local PostgreSQL instance with Docker:

```bash
docker run -d \
  --name scraper-postgres \
  -e POSTGRES_USER=soulstep-scraper \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=soulstep-scraper \
  -p 5432:5432 \
  postgres:15-alpine
```

Then start the scraper normally — it will automatically run Alembic migrations against the local PostgreSQL database on startup.

---

#### g. Post-Sync SEO Generation (GCP)

After syncing 10K+ places, all imported places have `seo_slug = NULL`.
Run SEO generation using one of these methods:

**Option A — Automatic (recommended for production)**
Set env vars on the scraper service:
- `SCRAPER_TRIGGER_SEO_AFTER_SYNC=true`
- `SCRAPER_CATALOG_ADMIN_TOKEN=<jwt_from_admin_login>`
SEO generation will fire automatically after each sync completes.

Store the admin token in Secret Manager:
```bash
echo -n "your-admin-jwt-token" | \
  gcloud secrets create SCRAPER_CATALOG_ADMIN_TOKEN --data-file=- --replication-policy=automatic

# Then add to the scraper Cloud Run service:
gcloud run services update soulstep-scraper-api \
  --region europe-west1 \
  --set-secrets "SCRAPER_CATALOG_ADMIN_TOKEN=SCRAPER_CATALOG_ADMIN_TOKEN:latest" \
  --set-env-vars "SCRAPER_TRIGGER_SEO_AFTER_SYNC=true"
```

**Option B — Manual script**
```bash
cd soulstep-catalog-api && source .venv/bin/activate
python scripts/generate_seo.py --generate
python scripts/generate_seo.py --translate  # requires GOOGLE_CLOUD_PROJECT
```

**Option C — Admin API**
```bash
curl -X POST https://your-catalog-url/api/v1/admin/seo/generate \
  -H "Authorization: Bearer <admin_jwt>" \
  -H "Content-Type: application/json" \
  -d '{"force": false}'
```

---

### 5.10 Scheduled Jobs (Cloud Scheduler + Cloud Run Jobs)

> **CI-managed:** All five jobs below are created/updated automatically by the `deploy-jobs` workflow job in `.github/workflows/deploy.yml` on every push to `main` that touches `soulstep-catalog-api/`. The `gcloud` commands in each section are for reference or manual (non-CI) deployments only.

#### a. Cleanup job

Cloud Run Jobs run to completion then exit — perfect for cron tasks.

```bash
PROJECT_NUMBER=$(gcloud projects describe PROJECT_ID --format="value(projectNumber)")
SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

gcloud run jobs create cleanup-job \
  --image REGION-docker.pkg.dev/PROJECT_ID/soulstep/api:latest \
  --region REGION \
  --set-cloudsql-instances PROJECT_ID:REGION:soulstep-db \
  --set-secrets "DATABASE_URL=DATABASE_URL:latest" \
  --command "python" \
  --args="-m,app.jobs.cleanup_orphaned_images" \
  --max-retries 1 \
  --task-timeout 300
```

Test it runs correctly:
```bash
gcloud run jobs execute cleanup-job --region REGION --wait
```

Schedule it with Cloud Scheduler:

```bash
gcloud scheduler jobs create http run-cleanup-job \
  --location REGION \
  --schedule "0 2 * * *" \
  --time-zone "UTC" \
  --uri "https://REGION-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/PROJECT_ID/jobs/cleanup-job:run" \
  --http-method POST \
  --oauth-service-account-email "${SERVICE_ACCOUNT}"
```

To trigger manually at any time:
```bash
gcloud run jobs execute cleanup-job --region REGION
```

#### b. Timezone backfill job

```bash
gcloud run jobs create backfill-timezones \
  --image REGION-docker.pkg.dev/PROJECT_ID/soulstep/api:latest \
  --region REGION \
  --set-cloudsql-instances PROJECT_ID:REGION:soulstep-db \
  --set-secrets "DATABASE_URL=DATABASE_URL:latest" \
  --command "python" \
  --args="-m,app.jobs.backfill_timezones" \
  --max-retries 1

gcloud run jobs execute backfill-timezones --region REGION --wait
```

#### d. Daily place sync worker (sync-places)

Reads all scraped places from the scraper PostgreSQL DB and upserts them into the catalog DB. Uses a separate `Dockerfile.sync` image — no uvicorn, no Playwright, just the catalog app package.

**Build and push the sync image:**

```bash
docker build --platform linux/amd64 -f Dockerfile.sync -t REGION-docker.pkg.dev/PROJECT_ID/soulstep/sync-places:latest .
docker push REGION-docker.pkg.dev/PROJECT_ID/soulstep/sync-places:latest
```

**Create the Cloud Run Job:**

```bash
gcloud run jobs create sync-places \
  --image REGION-docker.pkg.dev/PROJECT_ID/soulstep/sync-places:latest \
  --region REGION \
  --set-cloudsql-instances PROJECT_ID:REGION:soulstep-db \
  --set-secrets "DATABASE_URL=DATABASE_URL:latest,SCRAPER_DATABASE_URL=SCRAPER_DATABASE_URL:latest" \
  --memory 1Gi --cpu 1 \
  --task-timeout 1800 \
  --max-retries 1
```

**Secret:** `SCRAPER_DATABASE_URL` is already in Secret Manager — it is shared with the scraper service (`SCRAPER_DATABASE_URL` → scraper's `DATABASE_URL`). No extra setup needed.

**Schedule daily at 2 AM UTC:**

```bash
gcloud scheduler jobs create http daily-sync-places \
  --location REGION \
  --schedule "0 2 * * *" \
  --time-zone "UTC" \
  --uri "https://REGION-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/PROJECT_ID/jobs/sync-places:run" \
  --http-method POST \
  --oauth-service-account-email "${SERVICE_ACCOUNT}"
```

**Run manually:**

```bash
gcloud run jobs execute sync-places --region REGION --wait
```

**Local test:**

```bash
cd soulstep-catalog-api && source .venv/bin/activate
SCRAPER_DATABASE_URL=postgresql://... python -m app.jobs.sync_places
```

---

#### e. Daily content translation worker (translate-content)

Translates all missing content translations (places, reviews, cities, attribute definitions) for all target languages (ar, hi, te, ml) using headless Chromium. Uses a separate `Dockerfile.translate` image that includes Playwright and Chromium.

**Build and push the translation image:**

```bash
docker build --platform linux/amd64 -f Dockerfile.translate -t REGION-docker.pkg.dev/PROJECT_ID/soulstep/translate-content:latest .
docker push REGION-docker.pkg.dev/PROJECT_ID/soulstep/translate-content:latest
```

**Create the Cloud Run Job:**

```bash
gcloud run jobs create translate-content \
  --image REGION-docker.pkg.dev/PROJECT_ID/soulstep/translate-content:latest \
  --region REGION \
  --set-cloudsql-instances PROJECT_ID:REGION:soulstep-db \
  --set-secrets "DATABASE_URL=DATABASE_URL:latest" \
  --memory 4Gi --cpu 2 \
  --task-timeout 86400 \
  --max-retries 0
```

> **Note:** 24h timeout (`86400`) is intentional — large translation workloads (100k+ items) can run for many hours. `--max-retries 0` prevents double-translation on restarts.

**Schedule daily at 4 AM UTC** (after sync-places finishes):

```bash
gcloud scheduler jobs create http daily-translate-content \
  --location REGION \
  --schedule "0 4 * * *" \
  --time-zone "UTC" \
  --uri "https://REGION-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/PROJECT_ID/jobs/translate-content:run" \
  --http-method POST \
  --oauth-service-account-email "${SERVICE_ACCOUNT}"
```

**Run manually:**

```bash
gcloud run jobs execute translate-content --region REGION --wait
```

**Local test (requires Playwright installed):**

```bash
cd soulstep-catalog-api && source .venv/bin/activate
pip install playwright && playwright install chromium
python -m app.jobs.translate_content
```

**Optional env vars:**

| Variable | Default | Description |
|---|---|---|
| `BROWSER_POOL_SIZE` | 2 | Concurrent browser contexts |
| `BROWSER_MAX_TRANSLATIONS` | 50 | Translations per context before recycling |
| `BROWSER_HEADLESS` | true | Run headless (set false for local debug) |
| `BROWSER_TRANSLATE_MULTI_SIZE` | 5 | Texts per browser request (1–8) |

---

### 5.11 CI/CD (GitHub Actions for GCP)

The workflow in `.github/workflows/deploy.yml` handles the full deployment pipeline on every push to `main`, including building and updating all Cloud Run Jobs automatically.

**Workflow jobs summary:**

| Job | Trigger | What it does |
|---|---|---|
| `deploy-api` | `catalog` path changed | Builds `api` image, deploys Cloud Run service |
| `deploy-jobs` | `catalog` path changed (after `deploy-api`) | Builds `sync-places` + `translate-content` images; updates/creates all 5 Cloud Run Jobs |
| `deploy-web` | `web` path changed | Builds + deploys customer web to Firebase Hosting |
| `deploy-admin-web` | `admin` path changed | Builds + deploys admin web to Firebase Hosting |
| `deploy-scraper` | `scraper` path changed | Builds `scraper` image, deploys Cloud Run service |

To automate GCP deployments from the existing `.github/workflows/deploy.yml`, you need a dedicated service account with the right permissions.

#### Create a deploy service account

```bash
gcloud iam service-accounts create github-deploy \
  --display-name "GitHub Actions deploy" \
  --project PROJECT_ID

SA_EMAIL="github-deploy@PROJECT_ID.iam.gserviceaccount.com"

# Grant required roles
gcloud projects add-iam-policy-binding PROJECT_ID --member="serviceAccount:${SA_EMAIL}" --role="roles/run.admin"
gcloud projects add-iam-policy-binding PROJECT_ID --member="serviceAccount:${SA_EMAIL}" --role="roles/artifactregistry.writer"
gcloud projects add-iam-policy-binding PROJECT_ID --member="serviceAccount:${SA_EMAIL}" --role="roles/iam.serviceAccountUser"
gcloud projects add-iam-policy-binding PROJECT_ID --member="serviceAccount:${SA_EMAIL}" --role="roles/cloudbuild.builds.editor"

# Export key (paste contents into GitHub secret GCP_SA_KEY)
gcloud iam service-accounts keys create gcp-key.json --iam-account="${SA_EMAIL}"
cat gcp-key.json   # copy output → GitHub secret
rm gcp-key.json    # delete local copy immediately
```

Add `GCP_SA_KEY` (the full JSON) as a GitHub Actions secret.

#### Example deploy jobs to add to `.github/workflows/deploy.yml`

Replace or extend the Render/Vercel jobs with these:

```yaml
deploy-gcp-api:
  name: Deploy API to Cloud Run
  needs: [test-server, test-web]
  runs-on: ubuntu-latest
  environment: production
  steps:
    - uses: actions/checkout@v4

    - uses: google-github-actions/auth@v2
      with:
        credentials_json: ${{ secrets.GCP_SA_KEY }}

    - uses: google-github-actions/setup-gcloud@v2

    - name: Configure Docker auth for Artifact Registry
      run: gcloud auth configure-docker REGION-docker.pkg.dev --quiet

    - name: Build and push image
      run: |
        docker build --platform linux/amd64 \
          -t REGION-docker.pkg.dev/PROJECT_ID/soulstep/api:${{ github.sha }} \
          ./soulstep-catalog-api
        docker push REGION-docker.pkg.dev/PROJECT_ID/soulstep/api:${{ github.sha }}

    - name: Deploy to Cloud Run
      run: |
        gcloud run deploy soulstep-catalog-api \
          --image REGION-docker.pkg.dev/PROJECT_ID/soulstep/api:${{ github.sha }} \
          --region REGION \
          --platform managed \
          --quiet

deploy-gcp-web:
  name: Deploy Web to Firebase Hosting
  needs: [test-server, test-web]
  runs-on: ubuntu-latest
  environment: production
  steps:
    - uses: actions/checkout@v4

    - uses: actions/setup-node@v4
      with:
        node-version: "20"
        cache: npm
        cache-dependency-path: apps/soulstep-customer-web/package-lock.json

    - name: Install deps and build
      working-directory: apps/soulstep-customer-web
      run: |
        npm ci
        npm run build
      env:
        VITE_API_URL: ${{ secrets.VITE_API_URL }}

    - uses: google-github-actions/auth@v2
      with:
        credentials_json: ${{ secrets.GCP_SA_KEY }}

    - name: Deploy to Firebase Hosting
      run: npx firebase-tools deploy --only hosting --token ${{ secrets.FIREBASE_TOKEN }}
```

Add `FIREBASE_TOKEN` as a GitHub secret — generate it with:
```bash
firebase login:ci
```

---

### 5.12 Estimated Costs

| Service | What it runs | Free tier | ~Cost beyond free |
|---|---|---|---|
| **Cloud Run** | API + scraper | 2M requests/month, 180k vCPU-sec/month | ~$0.40 per 1M requests |
| **Cloud SQL** | PostgreSQL 15 | None | ~$7/month (`db-f1-micro`) |
| **Artifact Registry** | Docker images | 0.5 GB free | $0.10/GB/month |
| **Firebase Hosting** | Web SPA | 10 GB storage, 360 MB/day transfer | $0.026/GB transfer |
| **Secret Manager** | Secrets | 6 active secret versions free | $0.06 per 10k accesses |
| **Cloud Scheduler** | Cron jobs | 3 jobs free | $0.10/job/month |
| **Cloud Build** | CI builds | 120 min/day free | $0.003/build-min |

---

## 6. Operations Guide

Shared operations across all deployment plans. Each plan section references these — platform-specific execution commands are in the plan sections above.

### 6.1 Database Migrations

Alembic migrations run **automatically on API startup** via `alembic upgrade head`. No manual migration step is needed for any plan.

Notable migrations:
- `0004_groups_revamp` adds: `checkin.group_code` (nullable FK, indexed), `group.cover_image_url / start_date / end_date / updated_at`, and the new `groupplacenote` table. No new environment variables or external services are required.

### 6.2 Scheduled Jobs

Available jobs (run from the `soulstep-catalog-api` working directory):

| Job | Command | Schedule | Description |
|---|---|---|---|
| Cleanup orphaned images | `python -m app.jobs.cleanup_orphaned_images` | Daily (e.g. 2 AM UTC) | Removes review images no longer referenced by any review |
| Backfill timezones | `python -m app.jobs.backfill_timezones` | One-off after adding new places | Populates timezone data for places missing it |

Plan-specific scheduling:
- **Docker:** Host cron — see [§3.7](#37-scheduled-jobs-docker)
- **Render:** Render Cron Job or GitHub Actions — see [§4.7](#47-scheduled-jobs-on-render)
- **GCP:** Cloud Scheduler + Cloud Run Jobs — see [§5.10](#510-scheduled-jobs-cloud-scheduler--cloud-run-jobs)

### 6.4 Scraper Database Options

The `soulstep-scraper-api/` service enriches sacred place data from multiple sources:
- **Google Sheets** — CSV export with OSM/Wikipedia enrichment
- **Google Maps API** — grid-based search with attribute extraction

**Data flow:**
1. Create a data location (gsheet or gmaps config via API)
2. Create a run → background scraping task starts
3. Sync to main server → places created/updated with attributes

The scraper supports two database backends:

| Backend | Env var | When to use |
|---|---|---|
| **SQLite** (default) | `SCRAPER_DB_PATH` | Development, on-demand scraping where history isn't needed. Geo/place-type seeds re-run automatically on startup (idempotent). |
| **PostgreSQL** | `DATABASE_URL` | Long-term audit history, multi-instance safety, or persistent run history across Cloud Run cold starts. |

**Priority:** When `DATABASE_URL` is set, `session.py` creates a PostgreSQL engine and ignores `SCRAPER_DB_PATH`. When `DATABASE_URL` is not set, SQLite is used at the path specified by `SCRAPER_DB_PATH` (defaults to `scraper.db` in the working directory).

**Startup behavior:** On every startup, the scraper runs Alembic migrations (0001 → 0002 → 0003) against whichever database is selected, then runs `seed_geo_boundaries()` and `seed_place_type_mappings()` (idempotent upserts).

| Deployment | Recommended |
|---|---|
| **Local / On-Demand** | SQLite (default) |
| **Docker Compose** | SQLite with persistent volume (`scraper_data` at `/data`) |
| **Render** | SQLite with persistent disk or accept ephemeral — see [§4.4](#44-data-scraper-on-render-optional) |
| **Cloud Run** | SQLite (ephemeral) or PostgreSQL for persistent history — see [§5.9f](#f-persistent-run-history-optional-upgrade) |

---

## 7. Mobile

Mobile builds are identical for all deployment plans. The mobile app is not containerised — it is built locally or via CI using Expo Application Services (EAS).

### 7.1 Production Checklist

Before submitting to App Store / Play Store:

1. **Set bundle identifiers** in `apps/soulstep-customer-mobile/app.json`:
   ```json
   {
     "expo": {
       "ios": { "bundleIdentifier": "com.yourcompany.soulstep.mobile" },
       "android": { "package": "com.yourcompany.soulstep.mobile" }
     }
   }
   ```
2. **Set app name and slug** (`name`, `slug` in `app.json`) to production values.
3. **Configure EAS** — `eas.json` is already set up with development/preview/production profiles.
4. **Set `EXPO_PUBLIC_API_URL`** to the production API URL in your EAS build config or `.env`.

### 7.2 Building & Submitting

```bash
cd apps/soulstep-customer-mobile

# Build
eas build --platform ios --profile production
eas build --platform android --profile production

# Submit to stores
eas submit --platform ios
eas submit --platform android
```

### 7.3 Beta Testing (Firebase App Distribution)

Firebase App Distribution lets you share pre-release builds with testers before submitting to the app stores.

> **Apple Developer account requirement:**
> - **Android** — not required. Any APK can be distributed freely.
> - **iOS** — **yes, required** ($99/year). iOS apps must be signed with an ad-hoc provisioning profile tied to tester device UDIDs. Without an Apple Developer account, iOS distribution is not possible outside TestFlight (which also requires the same account).

#### a. One-time setup

1. In the [Firebase console](https://console.firebase.google.com) → your project → **App Distribution**.
2. Register your apps:
   - **Add Android app** → enter your package name (e.g. `com.yourcompany.soulstep.mobile`) → download `google-services.json` → place it in `apps/soulstep-customer-mobile/`.
   - **Add iOS app** → enter your bundle ID (e.g. `com.yourcompany.soulstep.mobile`) → download `GoogleService-Info.plist` → place it in `apps/soulstep-customer-mobile/`.
3. Note the **App ID** for each platform — visible in **Project Settings → Your apps**. Looks like `1:834941457147:android:xxxx`.
4. Create a tester group: **App Distribution → Testers & Groups → Add group** → name it (e.g. `internal`).
5. Add tester emails to the group.

#### b. Build with EAS preview profile

Use the `preview` profile (produces a `.apk` for Android and an ad-hoc signed `.ipa` for iOS) rather than `production` (which produces store-ready builds):

```bash
cd apps/soulstep-customer-mobile

# Android — produces a downloadable .apk (no Apple account needed)
eas build --platform android --profile preview

# iOS — produces an ad-hoc .ipa (requires Apple Developer account)
eas build --platform ios --profile preview
```

Once the build finishes, EAS prints a download URL. Download the `.apk` / `.ipa` file.

#### c. Upload to Firebase App Distribution

```bash
# Install Firebase CLI if not already installed
npm install -g firebase-tools
firebase login

# Android
firebase appdistribution:distribute path/to/app.apk \
  --app YOUR_ANDROID_FIREBASE_APP_ID \
  --groups "internal" \
  --release-notes "Short description of what changed"

# iOS
firebase appdistribution:distribute path/to/app.ipa \
  --app YOUR_IOS_FIREBASE_APP_ID \
  --groups "internal" \
  --release-notes "Short description of what changed"
```

Testers receive an email with a download link. Android testers install directly; iOS testers must first install the Firebase App Distribution profile on their device (prompted on first download).

#### d. Automate via EAS

EAS can upload to Firebase App Distribution automatically after a successful build by adding a submit profile in `eas.json`. See the [EAS Submit docs](https://docs.expo.dev/submit/introduction/) for configuration.

---

## 8. SEO & Search Engine Submission

Post-deployment setup for search engine indexing and AI discoverability. Not required for the application to function.

### 8.1 Endpoints

The backend automatically serves:
- `GET /sitemap.xml` — Dynamic XML sitemap with all place pages, hreflang alternates, and image entries
- `GET /sitemap-index.xml` — Auto-generated sitemap index when >50k places
- `GET /robots.txt` — Crawl directives allowing AI bots (ChatGPT-User, Claude-Web, PerplexityBot)
- `GET /llms.txt` and `GET /llms-full.txt` — AI chatbot discoverability files
- `GET /feed.xml` — RSS 2.0 (50 most recently added places)
- `GET /feed.atom` — Atom 1.0 (same content, Atom format)

Submit feed URLs to relevant feed aggregators or AI systems that consume structured feeds.

### 8.2 Google Search Console

1. **Sign in** to [Google Search Console](https://search.google.com/search-console).
2. **Add property:** Click **Add property** → choose **URL prefix** → enter your production frontend URL (e.g. `https://soul-step.org`).
3. **Verify ownership** using one of:
   - **HTML file** — download the verification file and deploy it to `apps/soulstep-customer-web/public/`
   - **HTML meta tag** — add `<meta name="google-site-verification" content="...">` to `apps/soulstep-customer-web/index.html`
   - **DNS TXT record** — add the TXT record to your domain's DNS
4. **Submit the sitemap:**
   - In Search Console → **Sitemaps** → enter `sitemap.xml` → **Submit**.
   - The full URL should be `https://api.soul-step.org/sitemap.xml` (the backend API URL).
5. **Monitor indexing:** Check **Coverage** and **Performance** reports after 24-48 hours.

> **Note:** Submit the backend API sitemap URL, not the frontend URL. The sitemap is generated dynamically by the FastAPI backend.

### 8.3 Bing Webmaster Tools

1. **Sign in** to [Bing Webmaster Tools](https://www.bing.com/webmasters).
2. **Add your site:** Enter your frontend URL → **Add**.
3. **Verify ownership:** Use the XML file method (deploy to `public/`) or DNS TXT record.
4. **Submit sitemap:**
   - Go to **Sitemaps** → **Submit sitemap**.
   - Enter the full backend sitemap URL: `https://api.soul-step.org/sitemap.xml`.
5. **Monitor:** Check the **Dashboard** for crawl stats and index coverage.

### 8.4 Yandex (optional)

For Russian-speaking markets:

1. Sign in at [webmaster.yandex.com](https://webmaster.yandex.com).
2. Add your site and verify ownership via meta tag or DNS TXT record.
3. Submit sitemap: **Indexing** → **Sitemap files** → add the backend sitemap URL.

### 8.5 AI Bot Verification

The `robots.txt` (served at `GET /robots.txt`) explicitly allows the following AI crawlers:

```
User-agent: ChatGPT-User
Allow: /

User-agent: GPTBot
Allow: /

User-agent: Claude-Web
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: PerplexityBot
Allow: /
```

No further verification is needed — these bots read `robots.txt` automatically.

### 8.6 SEO Generation Script

After adding new places, run the SEO generation script to create titles, descriptions, slugs, and FAQs:

```bash
# Generate English SEO for all new places:
python -m scripts.generate_seo --generate

# Generate English SEO + translate to Arabic and Hindi:
python -m scripts.generate_seo --generate --translate --langs ar hi

# Translate only (when English SEO already exists):
python -m scripts.generate_seo --translate --langs ar hi

# Dry run (no writes):
python -m scripts.generate_seo --generate --translate --dry-run
```

Requires `GOOGLE_CLOUD_PROJECT` and `GOOGLE_APPLICATION_CREDENTIALS` env vars for translation (same setup as [§6.2](#62-translation-backfill)).

### 8.7 AI Citation Monitoring

The admin dashboard tracks when AI crawlers visit pre-rendered share pages:

```
GET /api/v1/admin/seo/ai-citations?days=30
```

This endpoint returns:
- Total AI crawler visits in the period
- Breakdown by bot (ChatGPT, Claude, Perplexity, etc.)
- Top places being cited by AI systems
- Paginated recent visit log

No additional setup required — the middleware runs automatically in production.

---

## 9. Observability

### 9.1 Prometheus Metrics

The backend exposes a `GET /metrics` endpoint (added automatically by `prometheus-fastapi-instrumentator`).

- In production, **restrict access** to `/metrics` via nginx or a firewall rule — allow only from your internal monitoring network.
- Scrape with Prometheus; visualise with Grafana.
- No additional env var is needed; the endpoint is enabled at startup.

### 9.2 GlitchTip Error Tracking

[GlitchTip](https://glitchtip.com) is an open-source, self-hostable Sentry-compatible error tracker.

1. Deploy a GlitchTip instance (Docker image: `glitchtip/glitchtip`).
2. Create a project and obtain a DSN (e.g. `https://abc@glitchtip.example.com/1`).
3. Set the DSN as `GLITCHTIP_DSN` in your backend env vars.
4. When ready, install `sentry-sdk` and add the integration:
   ```python
   import sentry_sdk
   from sentry_sdk.integrations.starlette import StarletteIntegration
   sentry_sdk.init(dsn=os.environ["GLITCHTIP_DSN"], integrations=[StarletteIntegration()])
   ```

---

Keep this file in sync with the codebase: when deployment steps or environment variables change, update the corresponding plan(s).
