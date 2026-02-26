# Production Deployment Plans

This document outlines how to deploy SoulStep to production. **Update the relevant plan(s) whenever deployment-relevant changes are made** (e.g. new env vars, new services, build steps).

Current system: **Backend** (Python FastAPI in `soulstep-catalog-api/`), **Web app** (Vite + React in `apps/soulstep-customer-web/`), **Mobile app** (Expo / React Native in `apps/soulstep-customer-mobile/`), optional **Data Scraper** (`soulstep-scraper-api/`). API is versioned at `/api/v1`. For production, set `DATABASE_URL` to a PostgreSQL connection string (dev uses SQLite by default).

---

## Environment Variables Reference

### Backend (`soulstep-catalog-api/`)

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
| `GOOGLE_CLOUD_PROJECT` | No | _(empty)_ | GCP project ID — required for the translation backfill script (`scripts/backfill_translations.py`). When empty, the script skips machine translation and only runs the legacy attribute migration |
| `GOOGLE_APPLICATION_CREDENTIALS` | No | _(empty)_ | Path to a GCP service account JSON key with the **Cloud Translation API** and **Storage Object Admin** roles. Not needed on GCP Cloud Run (uses built-in ADC). Required for Docker / Render / any non-GCP host |
| `IMAGE_STORAGE` | No | `blob` | `blob` = store images as DB blobs (dev default); `gcs` = upload to Google Cloud Storage |
| `GCS_BUCKET_NAME` | No | _(empty)_ | GCS bucket name (required when `IMAGE_STORAGE=gcs`). Bucket objects must be publicly readable |

> **Note:** Version enforcement can also be configured per-platform via the `AppVersionConfig` DB table (editable at runtime without redeployment). DB values take priority over env vars.

### Data Scraper (`soulstep-scraper-api/`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `MAIN_SERVER_URL` | No | `http://127.0.0.1:3000` | URL of main API (used for data sync) |
| `GOOGLE_MAPS_API_KEY` | Yes (gmaps scraper) | _(empty)_ | Google Maps API key |
| `SCRAPER_TIMEZONE` | No | UTC fallback | IANA timezone for places without Google UTC offset (e.g. `Asia/Dubai`) |
| `SCRAPER_DB_PATH` | No | `scraper.db` (cwd) | Path to the SQLite database file — **set to `/data/scraper.db` in production** and mount a persistent volume at `/data` |

### Web frontend (`apps/soulstep-customer-web/`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `VITE_API_URL` | **Yes (prod)** | _(relative `/api` in dev)_ | Production API base URL — **baked in at build time** |
| `VITE_ADSENSE_PUBLISHER_ID` | No | _(empty)_ | Google AdSense publisher ID for web ads |

### Mobile (`apps/soulstep-customer-mobile/`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `EXPO_PUBLIC_API_URL` | No | `http://127.0.0.1:3000` | API base URL for device/Expo Go |
| `EXPO_PUBLIC_ADMOB_APP_ID_IOS` | No | _(empty)_ | Google AdMob App ID for iOS |
| `EXPO_PUBLIC_ADMOB_APP_ID_ANDROID` | No | _(empty)_ | Google AdMob App ID for Android |

---

## Observability

### Prometheus Metrics

The backend exposes a `GET /metrics` endpoint (added automatically by `prometheus-fastapi-instrumentator`).

- In production, **restrict access** to `/metrics` via nginx or a firewall rule — allow only from your internal monitoring network.
- Scrape with Prometheus; visualise with Grafana.
- No additional env var is needed; the endpoint is enabled at startup.

### GlitchTip Error Tracking

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

## Plan 1: Docker

Deploy the full stack with Docker Compose. Dockerfiles for all services are checked into the repo.

### Files

| File | Description |
|---|---|
| `soulstep-catalog-api/Dockerfile` | FastAPI backend — `python:3.12-slim` |
| `soulstep-scraper-api/Dockerfile` | Scraper service — `python:3.12-slim` |
| `apps/soulstep-customer-web/Dockerfile` | Multi-stage: Node 20 build → nginx:1.27-alpine serve |
| `apps/soulstep-customer-web/nginx.conf` | nginx SPA config (copied into web image) |
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
| `api` | `./soulstep-catalog-api` | `3000` | FastAPI; waits for `db` health; auto-runs Alembic migrations on start |
| `web` | `./apps/soulstep-customer-web` | `80` | nginx serving the compiled React SPA |
| `scraper` | `./soulstep-scraper-api` | `8001` | Optional; activate with `--profile scraper`; SQLite DB persisted in `scraper_data` volume at `/data/scraper.db` |

> **Scraper database:** The scraper uses its own SQLite database (separate from the main API's PostgreSQL). In `docker-compose.yml`, a named volume `scraper_data` is mounted at `/data` inside the container, and `SCRAPER_DB_PATH=/data/scraper.db` tells the app to write there. Without this, `scraper.db` would be lost on every container restart.

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

> **GCS image storage (Docker):** Mount a GCP service account JSON into the container (`-v /path/to/sa.json:/run/secrets/gcs-sa.json`) and set `GOOGLE_APPLICATION_CREDENTIALS=/run/secrets/gcs-sa.json`. The service account needs `roles/storage.objectAdmin` on the bucket. Create the bucket with public-read ACLs or an IAM policy binding `allUsers:roles/storage.objectViewer`.

### Build Web Image Manually

`VITE_API_URL` is baked in at build time — the variable must be set before building:

```bash
docker build \
  --build-arg VITE_API_URL=https://api.soul-step.org \
  -t soulstep-web \
  apps/soulstep-customer-web/
```

### Migrations

Alembic migrations run **automatically on API startup** via `alembic upgrade head`. No manual migration step needed.

Migration `0004_groups_revamp` adds: `checkin.group_code` (nullable FK, indexed), `group.cover_image_url / start_date / end_date / updated_at`, and the new `groupplacenote` table. No new environment variables or external services are required.

### Scheduled Jobs

```bash
# Cleanup orphaned review images (run daily, e.g. 2 AM)
docker exec <api_container> python -m app.jobs.cleanup_orphaned_images

# Backfill place timezones (run once after adding new places)
docker exec <api_container> python -m app.jobs.backfill_timezones
```

Example cron entry (on the host):
```
0 2 * * * docker exec soulstep-api python -m app.jobs.cleanup_orphaned_images
```

### Translation Backfill (Google Cloud Translation API)

The `scripts/backfill_translations.py` script machine-translates Place and Review content into Arabic and Hindi using the **Google Cloud Translation API v3**. It authenticates via **Application Default Credentials (ADC)** — a GCP service account key JSON file, not interactive OAuth.

#### One-time GCP setup

1. **Create a GCP project** (or reuse an existing one) and note the project ID.
2. **Enable the Cloud Translation API:**
   ```bash
   gcloud services enable translate.googleapis.com --project YOUR_PROJECT_ID
   ```
3. **Create a service account and download a key:**
   ```bash
   gcloud iam service-accounts create soulstep-translate \
     --display-name "SoulStep Translation" \
     --project YOUR_PROJECT_ID

   gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
     --member="serviceAccount:soulstep-translate@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
     --role="roles/cloudtranslate.user"

   gcloud iam service-accounts keys create translate-key.json \
     --iam-account="soulstep-translate@YOUR_PROJECT_ID.iam.gserviceaccount.com"
   ```
4. **Keep `translate-key.json` safe** — you'll mount it into the container.

#### Running in Docker

Add the service account key and env vars to your `.env`:

```dotenv
GOOGLE_CLOUD_PROJECT=your-gcp-project-id
GOOGLE_APPLICATION_CREDENTIALS=/app/credentials/translate-key.json
```

Mount the key file when running the backfill:

```bash
# Dry run first (no writes)
docker exec <api_container> python -m scripts.backfill_translations --dry-run

# Full run (translate Arabic + Hindi)
docker exec <api_container> python -m scripts.backfill_translations --langs ar hi
```

If the key is not baked into the image, mount it at runtime:

```bash
docker run --rm \
  -v $(pwd)/translate-key.json:/app/credentials/translate-key.json:ro \
  -e GOOGLE_APPLICATION_CREDENTIALS=/app/credentials/translate-key.json \
  -e GOOGLE_CLOUD_PROJECT=your-gcp-project-id \
  -e DATABASE_URL=postgresql://... \
  soulstep-api \
  python -m scripts.backfill_translations --langs ar hi
```

> **Cost:** Google Cloud Translation API v3 charges ~$20 per million characters. A typical backfill of a few hundred places costs well under $1.

### Mobile

Not containerised. Build locally or via CI:
```bash
cd apps/soulstep-customer-mobile
eas build --platform ios
eas build --platform android
```
Set `EXPO_PUBLIC_API_URL` to the production API URL in your EAS build config or `.env`.

---

## Plan 2: Free Online Services (Render + Vercel)

Recommended free-tier setup: **Render** for the backend API (and optionally the scraper), **Neon** for the database (generous free tier, no expiry), **Vercel** for the web frontend.

---

### Step 1 — Create the Database (Neon — recommended free tier)

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

### Step 2 — Deploy the Backend API on Render

1. Go to [render.com](https://render.com) → **New** → **Web Service**.
2. Connect your GitHub account and select the `soulstep` repo.
3. Fill in the service settings:

   | Setting | Value |
   |---|---|
   | **Name** | `soulstep-api` (or any name) |
   | **Region** | Same region as your database |
   | **Root Directory** | `soulstep-catalog-api` |
   | **Runtime** | `Python 3` |
   | **Build Command** | `pip install -r requirements.txt` |
   | **Start Command** | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
   | **Instance Type** | Free |

4. Click **Advanced** → **Add Environment Variable** → add each variable below:

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | The Neon (or Render Postgres) connection string from Step 1 |
   | `JWT_SECRET` | A long random string — generate with `openssl rand -hex 32` |
   | `CORS_ORIGINS` | `https://your-app.vercel.app` (you'll get this URL in Step 4; update it then) |
   | `JWT_EXPIRE` | `30m` |
   | `REFRESH_EXPIRE` | `30d` |
   | `RESET_URL_BASE` | `https://your-app.vercel.app` (same as CORS_ORIGINS) |
   | `RESEND_API_KEY` | Optional — leave empty if not using email |
   | `RESEND_FROM_EMAIL` | `noreply@soul-step.org` (only needed with Resend) |

5. Click **Create Web Service**. Render will build and deploy; first deploy takes ~2 min.
6. Once live, your API URL is `https://soulstep-api.onrender.com` (shown at the top of the service page). Copy it.

> **Migrations:** Alembic runs `alembic upgrade head` automatically every time the app starts — no manual migration step required.

> **Auto-deploy:** By default Render deploys on every push to `main`. If you're using the GitHub Actions deploy workflow (see below), **disable auto-deploy**: Service → Settings → **Auto-Deploy → Off**. The workflow will trigger deploys via a deploy hook after tests pass.

---

### Step 3 — Get the Render Deploy Hook (for GitHub Actions)

1. In your Render API service → **Settings** tab → scroll to **Deploy Hook**.
2. Click **Generate Deploy Hook** → copy the URL (looks like `https://api.render.com/deploy/srv-xxx?key=yyy`).
3. Save it — you'll add it as a GitHub secret in Step 6.

---

### Step 4 — Deploy the Web Frontend on Vercel

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
   | `VITE_API_URL` | `https://soulstep-api.onrender.com` (your Render API URL from Step 2) |

4. Click **Deploy**. Once deployed, copy your Vercel URL (e.g. `https://soulstep.vercel.app`).
5. **Go back to Render** → your API service → **Environment** tab → update `CORS_ORIGINS` and `RESET_URL_BASE` to your Vercel URL, then **Save** (Render will redeploy automatically).

> **VITE_API_URL is baked in at build time.** If you ever change the API URL, update this env var in Vercel and redeploy.

> **Get Vercel IDs for GitHub Actions:** In your Vercel project → **Settings → General** → note the **Project ID**. Your **Org/Team ID** is at [vercel.com/account](https://vercel.com/account) → Settings → copy the **ID** under your username/team. You'll need both in Step 6.

---

### Step 5 — Data Scraper on Render (Optional)

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
   | `MAIN_SERVER_URL` | `https://soulstep-api.onrender.com` |
   | `GOOGLE_MAPS_API_KEY` | Your Google Maps API key |
   | `SCRAPER_TIMEZONE` | e.g. `Asia/Dubai` or `UTC` |

3. Get the scraper's deploy hook (same as Step 3) and save it as `RENDER_SCRAPER_DEPLOY_HOOK_URL` in Step 6.

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

---

### Step 6 — GitHub Actions: CI/CD Pipeline

The workflow at `.github/workflows/deploy.yml` runs on every push to `main`:

1. Runs server tests (`pytest`) and web build (`tsc + vite build`)
2. On success, triggers the Render deploy hook (redeploys the API)
3. On success, runs `vercel build --prod` + `vercel deploy --prebuilt --prod`

**Required GitHub Secrets and Variables**

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

**GitHub Environment (optional but recommended)**

The deploy jobs reference the `production` environment. To create it:

1. Repo → **Settings → Environments → New environment** → name it `production`.
2. Add **Required reviewers** if you want a manual approval gate before deploys go out.
3. Move the secrets above into the environment instead of the repo level for tighter scoping.

**What the pipeline does on a push to `main`:**

```
push to main
  ├── test-server (pytest)   ─┐
  └── test-web (tsc + build) ─┴─ both must pass ──► deploy-backend (Render hook)
                                                  └► deploy-web (Vercel CLI)
                                                  └► deploy-scraper (Render hook, if DEPLOY_SCRAPER=true)
```

---

### Translation Backfill on Render

The backfill script requires Google Cloud Translation API credentials. Since Render is not GCP, you must provide a service account key.

#### Setup

1. Complete the **one-time GCP setup** described in Plan 1 (create a service account with `roles/cloudtranslate.user` and download the key JSON).
2. Add environment variables to the **Render API service**:

   | Key | Value |
   |---|---|
   | `GOOGLE_CLOUD_PROJECT` | Your GCP project ID |
   | `GOOGLE_APPLICATION_CREDENTIALS` | `/etc/secrets/gcp-key.json` |
   | `IMAGE_STORAGE` | `gcs` (optional — enable GCS image backend) |
   | `GCS_BUCKET_NAME` | Your GCS bucket name (optional) |

3. **Store the key as a Render secret file:**
   - Go to your API service → **Environment** → **Secret Files**.
   - Click **Add Secret File** → filename: `gcp-key.json`, paste the full JSON contents of the service account key.
   - Render mounts secret files at `/etc/secrets/<filename>`.
   - The same key file is used for both Translation API and Cloud Storage — ensure the service account has both `roles/cloudtranslate.user` and `roles/storage.objectAdmin`.

#### Running the backfill

Use Render's **Shell** tab or SSH into the service:

```bash
# Dry run
python -m scripts.backfill_translations --dry-run

# Full run
python -m scripts.backfill_translations --langs ar hi
```

Alternatively, trigger it via a one-off Render Job or from GitHub Actions:

```bash
# From GitHub Actions — hit the API container via SSH or a one-off Render job
curl -X POST https://api.render.com/deploy/srv-xxx?key=yyy  # redeploy after adding env vars
```

> **Tip:** You can also run the script locally against the production database by setting `DATABASE_URL` to the Neon connection string and `GOOGLE_CLOUD_PROJECT` + `gcloud auth application-default login` on your machine.

---

### Scheduled Jobs (Render or GitHub Actions)

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
          curl -s -X POST https://soulstep-api.onrender.com/admin/cleanup-images \
            -H "Authorization: Bearer ${{ secrets.ADMIN_API_KEY }}"
```

---

### Mobile

Build and submit from your local machine or CI:

```bash
cd apps/soulstep-customer-mobile
# Set the API URL in app.json or pass via eas.json env
eas build --platform ios --profile production
eas build --platform android --profile production
eas submit --platform ios
eas submit --platform android
```

---

## Plan 3: Google Cloud Platform (GCP)

Services used: **Cloud Run** (API + optional scraper), **Cloud SQL** (PostgreSQL 15), **Firebase Hosting** (web), **Artifact Registry** (Docker images), **Secret Manager** (credentials), **Cloud Scheduler** (cron jobs).

Throughout this section, replace:
- `PROJECT_ID` → your GCP project ID (e.g. `project-fa2d7f52-2bc4-4a46-8ae`)
- `REGION` → your chosen region (e.g. `europe-west1`)

---

### Prerequisites

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

### Step 1 — Create the Artifact Registry repository

Docker images need a registry before Cloud Run can pull them.

```bash
gcloud artifacts repositories create soulstep \
  --repository-format=docker \
  --location=REGION \
  --description="SoulStep images"
```

Your image prefix will be: `REGION-docker.pkg.dev/PROJECT_ID/soulstep/`

---

### Step 2 — Create the Database (Cloud SQL)

#### 2a. Create the Cloud SQL instance

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

#### 2b. Create the database and app user

```bash
# Create the database
gcloud sql databases create soulstep --instance=soulstep-db

# Create the app user (use a strong password)
gcloud sql users create soulstep \
  --instance=soulstep-db \
  --password=STRONG_DB_PASSWORD
```

#### 2c. Get the connection name

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

### Step 3 — Store Secrets in Secret Manager

Never pass sensitive values as plain `--set-env-vars`. Use Secret Manager and mount them as secrets.

```bash
# JWT secret — generate with: openssl rand -hex 32
echo -n "your-long-random-jwt-secret" | \
  gcloud secrets create JWT_SECRET \
    --data-file=- \
    --replication-policy=automatic

# Database URL (the full connection string from Step 2c)
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

### Step 4 — Build and Push the API Image

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

### Step 5 — Deploy the API to Cloud Run

```bash
gcloud run deploy soulstep-api \
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
https://soulstep-api-xxxxxxxxxxxx-uc.a.run.app
```

> **Migrations:** Alembic runs `alembic upgrade head` automatically on every cold start. No manual step needed.

> **GCS image storage (GCP):** On Cloud Run, grant the Cloud Run service account `roles/storage.objectAdmin` on the bucket — no `GOOGLE_APPLICATION_CREDENTIALS` file needed (workload identity / ADC is used automatically). Create the bucket: `gcloud storage buckets create gs://soulstep-images --location=REGION`. Grant public read: `gcloud storage buckets add-iam-policy-binding gs://soulstep-images --member=allUsers --role=roles/storage.objectViewer`.

> **Cold starts:** `--min-instances 0` = free (scales to zero when idle). Set `--min-instances 1` to eliminate cold starts (~$10/month for one always-on instance).

#### Update CORS after deploying the web frontend (Step 6)

After you have the Firebase URL, come back and patch the env vars.

> **Important:** Firebase Hosting gives every project **two** default domains — both must be in `CORS_ORIGINS` or you'll get CORS errors depending on which URL the browser uses:
> - `https://PROJECT_ID.web.app`
> - `https://PROJECT_ID.firebaseapp.com`
>
> `CORS_ORIGINS` is **space-separated** (not comma-separated). The `--update-env-vars` flag uses commas to separate variable assignments, so quote the value carefully:

```bash
gcloud run services update soulstep-api \
  --region REGION \
  --update-env-vars "CORS_ORIGINS=https://PROJECT_ID.web.app https://PROJECT_ID.firebaseapp.com,RESET_URL_BASE=https://PROJECT_ID.web.app"
```

---

### Step 5b — Managing Environment Variables (GCP)

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
| `VITE_API_URL` | `https://soulstep-api-834941457147.europe-west1.run.app` |
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
  --update-env-vars "CORS_ORIGINS=https://soul-step.org https://project-fa2d7f52-2bc4-4a46-8ae.web.app https://project-fa2d7f52-2bc4-4a46-8ae.firebaseapp.com,FRONTEND_URL=https://soul-step.org,API_BASE_URL=https://soulstep-api-834941457147.europe-west1.run.app,RESET_URL_BASE=https://soul-step.org,RESEND_FROM_EMAIL=noreply@soul-step.org,JWT_EXPIRE=30m,REFRESH_EXPIRE=30d"
```

> Secrets (`JWT_SECRET`, `DATABASE_URL`, `RESEND_API_KEY`) are managed separately via Secret Manager — see Step 3 above.

---

### Step 6 — Deploy the Web Frontend (Firebase Hosting)

#### 6a. Install Firebase CLI and initialise the project

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

#### 6b. Build and deploy

```bash
cd apps/soulstep-customer-web
VITE_API_URL=https://soulstep-api-xxxxxxxxxxxx-uc.a.run.app npm run build
cd ../..
firebase deploy --only hosting
```

Your app is live at `https://PROJECT_ID.web.app`. Copy this URL and go back to Step 5 to update `CORS_ORIGINS`.

#### 6c. Custom domain (optional)

Firebase console → **Hosting** → **Add custom domain** → follow the DNS verification steps. Firebase provisions a TLS cert automatically within minutes.

---

### Step 7 — Data Scraper on Cloud Run (Optional)

Only needed for automated place scraping in production.

#### Scraper database on GCP

> **Cloud Run is stateless** — the container filesystem is wiped between instances and on scale-to-zero. The scraper's SQLite `scraper.db` does **not** persist across invocations.

**Recommended approach: run the scraper as a Cloud Run Job, not a long-running Service.**

A Cloud Run Job starts, runs a full scrape-and-sync cycle, then exits cleanly. Within a single job execution the SQLite file exists in `/tmp` or WORKDIR for the duration of the job. The geo and place-type seed data re-seeds automatically on each run (idempotent), so nothing is lost between job runs. Scraping run history lives in the database only for the duration of that job.

This is covered in Step 8 below with Cloud Run Jobs.

**If you do need a long-running scraper Service** (e.g. for a webhook-triggered scraping API), SQLite will reset on every cold start. In that case, use **Cloud SQL** for the scraper's database:

1. Create a second database on the existing Cloud SQL instance:
   ```bash
   gcloud sql databases create scraper --instance=soulstep-db
   gcloud sql users create scraper \
     --instance=soulstep-db \
     --password=SCRAPER_DB_PASSWORD
   ```
2. Store the connection string in Secret Manager:
   ```bash
   echo -n "postgresql://scraper:SCRAPER_DB_PASSWORD@/scraper?host=/cloudsql/PROJECT_ID:REGION:soulstep-db" | \
     gcloud secrets create SCRAPER_DATABASE_URL --data-file=- --replication-policy=automatic
   ```
3. Pass it to the scraper deploy command via `SCRAPER_DB_PATH` is not enough here — you'd need to extend `soulstep-scraper-api/app/db/session.py` to support `DATABASE_URL` for PostgreSQL if you go this route. For now, the Cloud Run Job approach is recommended.

#### Deploy as a long-running Service (if needed)

```bash
# Build and push
gcloud builds submit ./soulstep-scraper-api \
  --tag REGION-docker.pkg.dev/PROJECT_ID/soulstep/scraper:latest

# Deploy (no-allow-unauthenticated = internal/service-account calls only)
gcloud run deploy soulstep-scraper \
  --image REGION-docker.pkg.dev/PROJECT_ID/soulstep/scraper:latest \
  --platform managed \
  --region REGION \
  --no-allow-unauthenticated \
  --set-env-vars "MAIN_SERVER_URL=https://soulstep-api-xxxxxxxxxxxx-uc.a.run.app,SCRAPER_TIMEZONE=UTC,GOOGLE_MAPS_API_KEY=your-key" \
  --memory 512Mi
```

Note: without a persistent volume, the SQLite DB is ephemeral. Geo/place-type seeds will re-run on each cold start (safe). Run history will be lost between cold starts.

---

### Step 8 — Scheduled Jobs (Cloud Scheduler + Cloud Run Jobs)

#### 8a. Create a reusable Cloud Run Job for the cleanup task

Cloud Run Jobs run to completion then exit — perfect for cron tasks.

```bash
PROJECT_NUMBER=$(gcloud projects describe PROJECT_ID --format="value(projectNumber)")
SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

gcloud run jobs create cleanup-job \
  --image REGION-docker.pkg.dev/PROJECT_ID/soulstep/api:latest \
  --region REGION \
  --add-cloudsql-instances PROJECT_ID:REGION:soulstep-db \
  --set-secrets "DATABASE_URL=DATABASE_URL:latest" \
  --command "python" \
  --args "-m,app.jobs.cleanup_orphaned_images" \
  --max-retries 1 \
  --task-timeout 300
```

Test it runs correctly:
```bash
gcloud run jobs execute cleanup-job --region REGION --wait
```

#### 8b. Schedule it with Cloud Scheduler

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

#### 8c. Backfill translations (one-off or periodic, run after adding new places/reviews)

On GCP, the translation backfill is the **simplest** — Cloud Run Jobs automatically have Application Default Credentials (ADC) via the compute service account. No service account key file is needed.

**Prerequisites:**

1. **Enable the Cloud Translation API** (add to the enable APIs command in Prerequisites):
   ```bash
   gcloud services enable translate.googleapis.com --project PROJECT_ID
   ```

2. **Grant the compute service account the translation role:**
   ```bash
   PROJECT_NUMBER=$(gcloud projects describe PROJECT_ID --format="value(projectNumber)")
   SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

   gcloud projects add-iam-policy-binding PROJECT_ID \
     --member="serviceAccount:${SERVICE_ACCOUNT}" \
     --role="roles/cloudtranslate.user"
   ```

**Create the Cloud Run Job:**

```bash
gcloud run jobs create backfill-translations \
  --image REGION-docker.pkg.dev/PROJECT_ID/soulstep/api:latest \
  --region REGION \
  --add-cloudsql-instances PROJECT_ID:REGION:soulstep-db \
  --set-secrets "DATABASE_URL=DATABASE_URL:latest" \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=PROJECT_ID" \
  --command "python" \
  --args "-m,scripts.backfill_translations,--langs,ar,hi" \
  --max-retries 1 \
  --task-timeout 600 \
  --memory 512Mi
```

**Run it:**

```bash
# One-off execution
gcloud run jobs execute backfill-translations --region REGION --wait
```

**Schedule it (optional — e.g. weekly to catch new content):**

```bash
gcloud scheduler jobs create http run-backfill-translations \
  --location REGION \
  --schedule "0 3 * * 0" \
  --time-zone "UTC" \
  --uri "https://REGION-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/PROJECT_ID/jobs/backfill-translations:run" \
  --http-method POST \
  --oauth-service-account-email "${SERVICE_ACCOUNT}"
```

> **Dry run:** To test without writing, update the job args temporarily:
> ```bash
> gcloud run jobs update backfill-translations --region REGION \
>   --args "-m,scripts.backfill_translations,--langs,ar,hi,--dry-run"
> gcloud run jobs execute backfill-translations --region REGION --wait
> ```

#### 8d. Backfill timezones (one-off job, run after adding new place data)

```bash
gcloud run jobs create backfill-timezones \
  --image REGION-docker.pkg.dev/PROJECT_ID/soulstep/api:latest \
  --region REGION \
  --add-cloudsql-instances PROJECT_ID:REGION:soulstep-db \
  --set-secrets "DATABASE_URL=DATABASE_URL:latest" \
  --command "python" \
  --args "-m,app.jobs.backfill_timezones" \
  --max-retries 1

gcloud run jobs execute backfill-timezones --region REGION --wait
```

---

### Step 9 — Mobile

```bash
cd apps/soulstep-customer-mobile
eas build --platform ios --profile production
eas build --platform android --profile production
eas submit --platform ios
eas submit --platform android
```

Set `EXPO_PUBLIC_API_URL` to your Cloud Run API URL in `apps/soulstep-customer-mobile/.env` or via EAS secrets before building.

---

### Step 9b — Firebase App Distribution (Beta Testing)

Firebase App Distribution lets you share pre-release builds with testers before submitting to the app stores.

> **Apple Developer account requirement:**
> - **Android** — not required. Any APK can be distributed freely.
> - **iOS** — **yes, required** ($99/year). iOS apps must be signed with an ad-hoc provisioning profile tied to tester device UDIDs. Without an Apple Developer account, iOS distribution is not possible outside TestFlight (which also requires the same account).

#### 9b-i. One-time setup

1. In the [Firebase console](https://console.firebase.google.com) → your project → **App Distribution**.
2. Register your apps:
   - **Add Android app** → enter your package name (e.g. `com.yourcompany.soulstep.mobile`) → download `google-services.json` → place it in `apps/soulstep-customer-mobile/`.
   - **Add iOS app** → enter your bundle ID (e.g. `com.yourcompany.soulstep.mobile`) → download `GoogleService-Info.plist` → place it in `apps/soulstep-customer-mobile/`.
3. Note the **App ID** for each platform — visible in **Project Settings → Your apps**. Looks like `1:834941457147:android:xxxx`.
4. Create a tester group: **App Distribution → Testers & Groups → Add group** → name it (e.g. `internal`).
5. Add tester emails to the group.

#### 9b-ii. Build a distributable binary with EAS

Use the `preview` profile (produces a `.apk` for Android and an ad-hoc signed `.ipa` for iOS) rather than `production` (which produces store-ready builds):

```bash
cd apps/soulstep-customer-mobile

# Android — produces a downloadable .apk (no Apple account needed)
eas build --platform android --profile preview

# iOS — produces an ad-hoc .ipa (requires Apple Developer account)
eas build --platform ios --profile preview
```

Once the build finishes, EAS prints a download URL. Download the `.apk` / `.ipa` file.

#### 9b-iii. Upload to Firebase App Distribution

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

#### 9b-iv. Automate via EAS (optional)

EAS can upload to Firebase App Distribution automatically after a successful build by adding a submit profile in `eas.json`. See the [EAS Submit docs](https://docs.expo.dev/submit/introduction/) for configuration.

---

### Step 10 — GitHub Actions CI/CD for GCP

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
        docker build \
          -t REGION-docker.pkg.dev/PROJECT_ID/soulstep/api:${{ github.sha }} \
          ./soulstep-catalog-api
        docker push REGION-docker.pkg.dev/PROJECT_ID/soulstep/api:${{ github.sha }}

    - name: Deploy to Cloud Run
      run: |
        gcloud run deploy soulstep-api \
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

### GCP Services and Estimated Costs

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

## Mobile Production Checklist

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
4. **Build:**
   ```bash
   cd apps/soulstep-customer-mobile
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

The `soulstep-scraper-api/` service enriches sacred place data from multiple sources.

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
| **1 Docker** | Docker container (`soulstep-catalog-api/Dockerfile`) | Postgres in Compose or external | nginx Docker image (`apps/soulstep-customer-web/Dockerfile`) | EAS build, submit to stores |
| **2 Free** | Render Web Service | Render Postgres / Supabase / Neon | Vercel | EAS build |
| **3 GCP** | Cloud Run | Cloud SQL (PostgreSQL 15) | Firebase Hosting | EAS build |

Keep this file in sync with the codebase: when deployment steps or environment variables change, update the corresponding plan(s).

---

## SEO & Search Engine Submission

### Environment Variable: FRONTEND_URL

The pre-rendering and SEO services need to know the public URL of the frontend to generate canonical URLs, sitemaps, and structured data correctly. Add this to the backend API service:

| Variable | Required | Default | Description |
|---|---|---|---|
| `FRONTEND_URL` | **Yes (prod)** | `http://localhost:5173` | Public URL of the web frontend — used in sitemap, share pages, JSON-LD |
| `API_BASE_URL` | No | `http://localhost:3000` | Public URL of the API — used in RSS/Atom feed self links |

### Sitemap and Robots.txt Endpoints

The backend automatically serves:
- `GET /sitemap.xml` — Dynamic XML sitemap with all place pages, hreflang alternates, and image entries
- `GET /sitemap-index.xml` — Auto-generated sitemap index when >50k places
- `GET /robots.txt` — Crawl directives allowing AI bots (ChatGPT-User, Claude-Web, PerplexityBot)
- `GET /llms.txt` and `GET /llms-full.txt` — AI chatbot discoverability files

### Google Search Console

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

### Bing Webmaster Tools

1. **Sign in** to [Bing Webmaster Tools](https://www.bing.com/webmasters).
2. **Add your site:** Enter your frontend URL → **Add**.
3. **Verify ownership:** Use the XML file method (deploy to `public/`) or DNS TXT record.
4. **Submit sitemap:**
   - Go to **Sitemaps** → **Submit sitemap**.
   - Enter the full backend sitemap URL: `https://api.soul-step.org/sitemap.xml`.
5. **Monitor:** Check the **Dashboard** for crawl stats and index coverage.

### Yandex Webmaster (optional — for Russian-speaking markets)

1. Sign in at [webmaster.yandex.com](https://webmaster.yandex.com).
2. Add your site and verify ownership via meta tag or DNS TXT record.
3. Submit sitemap: **Indexing** → **Sitemap files** → add the backend sitemap URL.

### AI Bot Verification

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

### SEO Script: Generate and Translate SEO Content

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

Requires `GOOGLE_CLOUD_PROJECT` and `GOOGLE_APPLICATION_CREDENTIALS` env vars for translation (same as `backfill_translations.py` — see Translation Backfill section above).

### RSS and Atom Feeds

Two syndication feeds are served by the backend:
- `GET /feed.xml` — RSS 2.0 (50 most recently added places)
- `GET /feed.atom` — Atom 1.0 (same content, Atom format)

Submit these URLs to relevant feed aggregators or AI systems that consume structured feeds.

### AI Citation Monitoring

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
