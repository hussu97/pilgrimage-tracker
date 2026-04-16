# Production Deployment

SoulStep runs on **Google Cloud Platform** (Cloud Run + Cloud SQL) with **Firebase Hosting** for both web frontends.

Update this file whenever deployment-relevant changes are made: new env vars, new services, DB migrations, or build commands.

---

## Table of Contents

- [1. Prerequisites](#1-prerequisites)
- [2. Infrastructure Setup](#2-infrastructure-setup)
  - [2.1 Artifact Registry](#21-artifact-registry)
  - [2.2 Cloud SQL](#22-cloud-sql)
  - [2.3 Secret Manager + IAM](#23-secret-manager--iam)
- [3. Deploy Catalog API](#3-deploy-catalog-api)
- [3.1 Custom Domain (`api.soul-step.org`)](#31-custom-domain-apisoul-steporg)
- [4. Deploy Web Frontend](#4-deploy-web-frontend)
- [5. Deploy Admin Dashboard](#5-deploy-admin-dashboard)
- [6. Deploy Scraper](#6-deploy-scraper)
  - [6.1 API Service](#61-api-service)
  - [6.2 Cloud Run Job (browser mode)](#62-cloud-run-job-browser-mode)
  - [6.3 Persistent scraper database (optional)](#63-persistent-scraper-database-optional)
- [7. Scheduled Jobs](#7-scheduled-jobs)
- [8. CI/CD](#8-cicd)
- [9. Mobile](#9-mobile)
- [10. SEO & Search Engines](#10-seo--search-engines)
- [11. Observability](#11-observability)
- [12. Environment Variables Reference](#12-environment-variables-reference)
- [13. Cost Estimate](#13-cost-estimate)

---

Throughout this guide, replace:
- `PROJECT_ID` → your GCP project ID (e.g. `my-project-123`)
- `REGION` → your chosen region (e.g. `europe-west1`)

---

## 1. Prerequisites

1. **Install gcloud CLI:**

   ```bash
   brew install google-cloud-sdk   # macOS
   # or: https://cloud.google.com/sdk/docs/install
   ```

2. **Log in and configure Docker auth:**

   ```bash
   gcloud auth login
   gcloud auth configure-docker REGION-docker.pkg.dev
   ```

3. **Create or select a GCP project:**

   ```bash
   gcloud projects create PROJECT_ID --name="SoulStep"
   gcloud config set project PROJECT_ID
   ```

4. **Enable billing** at console.cloud.google.com/billing.

5. **Enable all required APIs:**

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
     --project PROJECT_ID
   ```

6. **Add Firebase to your GCP project** (one-time, required for Hosting):
   - Go to [console.firebase.google.com](https://console.firebase.google.com)
   - Click **Add project** → **Add Firebase to a Google Cloud Platform project** → select `PROJECT_ID`
   - Skip Google Analytics → click **Add Firebase**

---

## 2. Infrastructure Setup

### 2.1 Artifact Registry

```bash
gcloud artifacts repositories create soulstep \
  --repository-format=docker \
  --location=REGION \
  --description="SoulStep Docker images"
```

Image prefix: `REGION-docker.pkg.dev/PROJECT_ID/soulstep/`

### 2.2 Cloud SQL

```bash
# Create the PostgreSQL instance
gcloud sql instances create soulstep-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=REGION \
  --storage-type=SSD \
  --storage-size=10GB \
  --backup-start-time=03:00

# Create the catalog database and user
gcloud sql databases create soulstep --instance=soulstep-db
gcloud sql users create soulstep --instance=soulstep-db --password=STRONG_DB_PASSWORD

# Get the connection name (needed in deploy commands)
gcloud sql instances describe soulstep-db --format="value(connectionName)"
# Output: PROJECT_ID:REGION:soulstep-db
```

The `DATABASE_URL` for Cloud Run uses a Unix socket:
```
postgresql://soulstep:STRONG_DB_PASSWORD@/soulstep?host=/cloudsql/PROJECT_ID:REGION:soulstep-db
```

### 2.3 Secret Manager + IAM

Store sensitive values in Secret Manager — never pass them as plain `--set-env-vars`.

```bash
# JWT signing secret
echo -n "$(openssl rand -hex 32)" | \
  gcloud secrets create JWT_SECRET --data-file=- --replication-policy=automatic

# Internal service auth key (shared between catalog API and scraper)
echo -n "$(openssl rand -hex 32)" | \
  gcloud secrets create catalog-api-key --data-file=- --replication-policy=automatic

# Database URL (from §2.2)
echo -n "postgresql://soulstep:STRONG_DB_PASSWORD@/soulstep?host=/cloudsql/PROJECT_ID:REGION:soulstep-db" | \
  gcloud secrets create DATABASE_URL --data-file=- --replication-policy=automatic

# Resend API key (optional — for password-reset emails)
echo -n "re_your_resend_key" | \
  gcloud secrets create RESEND_API_KEY --data-file=- --replication-policy=automatic
```

Grant the default compute service account the required IAM roles:

```bash
PROJECT_NUMBER=$(gcloud projects describe PROJECT_ID --format="value(projectNumber)")
SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor"

gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/cloudsql.client"
```

> **Why both roles?** `secretAccessor` lets Cloud Run read secrets at startup. `cloudsql.client` lets the Cloud SQL Auth Proxy authenticate the Unix socket connection. Missing either role causes a crash on startup.

To update a secret value later:
```bash
echo -n "new-value" | gcloud secrets versions add SECRET_NAME --data-file=-
```

---

## 3. Deploy Catalog API

### Build and push the image

**Option A — local Docker:**
```bash
docker build --platform linux/amd64 \
  -t REGION-docker.pkg.dev/PROJECT_ID/soulstep/soulstep-catalog-api:latest \
  ./soulstep-catalog-api
docker push REGION-docker.pkg.dev/PROJECT_ID/soulstep/soulstep-catalog-api:latest
```

**Option B — Cloud Build (no local Docker):**
```bash
gcloud builds submit ./soulstep-catalog-api \
  --tag REGION-docker.pkg.dev/PROJECT_ID/soulstep/soulstep-catalog-api:latest
```

### Deploy

```bash
gcloud run deploy soulstep-catalog-api \
  --image REGION-docker.pkg.dev/PROJECT_ID/soulstep/soulstep-catalog-api:latest \
  --platform managed \
  --region REGION \
  --allow-unauthenticated \
  --add-cloudsql-instances PROJECT_ID:REGION:soulstep-db \
  --set-secrets "JWT_SECRET=JWT_SECRET:latest,DATABASE_URL=DATABASE_URL:latest,RESEND_API_KEY=RESEND_API_KEY:latest,CATALOG_API_KEY=catalog-api-key:latest" \
  --set-env-vars "CORS_ORIGINS=https://PROJECT_ID.web.app https://PROJECT_ID.firebaseapp.com,JWT_EXPIRE=30m,REFRESH_EXPIRE=30d,RESEND_FROM_EMAIL=noreply@soul-step.org,RESET_URL_BASE=https://soul-step.org,IMAGE_STORAGE=gcs,GCS_BUCKET_NAME=soulstep-images,LOG_FORMAT=json" \
  --min-instances 0 \
  --max-instances 10 \
  --memory 512Mi \
  --timeout 30
```

Copy the **Service URL** from the output (e.g. `https://soulstep-catalog-api-xxxx-uc.a.run.app`). This is the raw Cloud Run URL — after setting up the custom domain (§3.1), use `https://api.soul-step.org` everywhere instead.

### GCS image storage

On Cloud Run, workload identity (ADC) handles auth automatically — no `GOOGLE_APPLICATION_CREDENTIALS` needed.

```bash
# Create the bucket
gcloud storage buckets create gs://soulstep-images --location=REGION

# Allow public reads
gcloud storage buckets add-iam-policy-binding gs://soulstep-images \
  --member=allUsers --role=roles/storage.objectViewer

# Grant the service account write access
gcloud storage buckets add-iam-policy-binding gs://soulstep-images \
  --member="serviceAccount:${SERVICE_ACCOUNT}" --role=roles/storage.objectAdmin
```

### Managing backend env vars

Backend env vars live on the Cloud Run service and persist across deploys.

**Update specific variables:**
```bash
gcloud run services update soulstep-catalog-api \
  --region REGION \
  --update-env-vars "VAR_NAME=value,ANOTHER_VAR=value"
```

**View current env vars:**
```bash
gcloud run services describe soulstep-catalog-api \
  --region REGION \
  --format="yaml(spec.template.spec.containers[0].env)"
```

**Update CORS after deploying frontends** (both Firebase domains must be included):
```bash
gcloud run services update soulstep-catalog-api \
  --region REGION \
  --update-env-vars "CORS_ORIGINS=https://soul-step.org https://PROJECT_ID.web.app https://PROJECT_ID.firebaseapp.com,FRONTEND_URL=https://soul-step.org,API_BASE_URL=https://api.soul-step.org,RESET_URL_BASE=https://soul-step.org"
```

### Cold start notes

`--min-instances 0` = scales to zero (free). Set `--min-instances 1` to eliminate cold starts (~$10/month).

On cold start, the app runs Alembic migrations before serving traffic (~5s for the first Cloud SQL connection). To avoid this latency: run migrations as a pre-deploy Cloud Run Job and set `RUN_MIGRATIONS_ON_START=false`.

### 3.1 Custom Domain (`api.soul-step.org`)

Map the subdomain `api.soul-step.org` to the Cloud Run service so all API and SEO endpoints use a clean, stable URL instead of the raw Cloud Run URL.

**Step 1 — Create the domain mapping:**

```bash
gcloud beta run domain-mappings create \
  --service=soulstep-catalog-api \
  --domain=api.soul-step.org \
  --region=REGION
```

**Step 2 — Get the required DNS records:**

```bash
gcloud beta run domain-mappings describe \
  --domain=api.soul-step.org \
  --region=REGION
```

**Step 3 — Add DNS records** in your DNS provider (wherever `soul-step.org` is managed):

| Type | Name | Value |
|------|------|-------|
| CNAME | `api` | `ghs.googlehosted.com.` |

GCP provisions a managed TLS certificate automatically. Propagation takes a few minutes to a couple of hours.

**Step 4 — Verify:**

```bash
# Wait for certificate provisioning, then test
curl -s https://api.soul-step.org/health
```

**Step 5 — Update env vars to use the custom domain:**

```bash
gcloud run services update soulstep-catalog-api \
  --region REGION \
  --update-env-vars "API_BASE_URL=https://api.soul-step.org"
```

After the domain is live, all services and frontends should point to `https://api.soul-step.org` instead of the raw Cloud Run URL:

| Service | Variable | Value |
|---------|----------|-------|
| Catalog API | `API_BASE_URL` | `https://api.soul-step.org` |
| Customer Web | `NEXT_PUBLIC_API_BASE_URL` | `https://api.soul-step.org` |
| Admin Web | `VITE_API_URL` | `https://api.soul-step.org` |
| Admin Web | `API_PROXY_TARGET` (hybrid mode) | `https://api.soul-step.org` |
| Mobile | `EXPO_PUBLIC_API_URL` | `https://api.soul-step.org` |
| Scraper | `MAIN_SERVER_URL` | `https://api.soul-step.org` |

> **SEO note:** `robots.txt`, `sitemap.xml`, `llms.txt`, `/feed.xml`, `/feed.atom`, and `/.well-known/ai-plugin.json` are all served by the catalog API. With the custom domain, search engines and AI crawlers access them at `https://api.soul-step.org/sitemap.xml`, etc. The frontend static copies in `apps/soulstep-customer-web/public/` (`robots.txt`, `llms.txt`, `ai-plugin.json`) also reference `api.soul-step.org`.

---

## 4. Deploy Web Frontend

The customer web app uses **Next.js 15** with server-side rendering (SSR). Deployed to **Firebase Hosting** (Web Frameworks) via GitHub Actions — on every push to `main` that touches `apps/soulstep-customer-web/`, CI installs dependencies and runs `firebase deploy --only hosting:web` automatically.

Firebase Hosting serves static assets from its global CDN and routes SSR requests to a managed Cloud Run function in `europe-west1`. No Docker image or Cloud Run service to manage manually.

**Firebase Hosting sites:**
- Customer web: `project-fa2d7f52-2bc4-4a46-8ae.web.app` (default project site, mapped to `soul-step.org`)
- Admin: `soulstep-admin.web.app` (mapped to admin subdomain)

### Manual deploy

```bash
cd apps/soulstep-customer-web
npm ci
cd ../..
firebase deploy --only hosting:web
```

### Custom domain

Firebase Hosting → **Custom domains** → Add `soul-step.org`. TLS cert is provisioned automatically.

### Environment variables

`NEXT_PUBLIC_*` variables are baked into the Next.js build at CI time. Store them as GitHub Actions secrets:

| Secret | Description |
|---|---|
| `NEXT_PUBLIC_ADSENSE_PUBLISHER_ID` | Google AdSense publisher ID |
| `NEXT_PUBLIC_UMAMI_WEBSITE_ID` | Umami analytics website ID |

Server-side SSR calls fall back to `https://api.soul-step.org` automatically — no extra runtime secrets needed.

---

## 5. Deploy Admin Dashboard

The admin dashboard is a separate Firebase Hosting site on the same project.

### Build and deploy

```bash
cd apps/soulstep-admin-web
npm run build
cd ../..
firebase deploy --only hosting:admin
```

The `firebase.json` already defines both `web` and `admin` hosting targets — see `.firebaserc` for site mappings.

---

## 6. Deploy Scraper

The scraper is optional — only needed for automated place discovery in production.

### 6.1 API Service

The scraper API service handles HTTP requests. Scrape runs execute in the background (local dispatch) or via a Cloud Run Job (cloud_run dispatch).

**Store scraper secrets:**

```bash
echo -n "your-google-maps-api-key" | \
  gcloud secrets create SCRAPER_GOOGLE_MAPS_API_KEY --data-file=- --replication-policy=automatic

# Optional collectors
echo -n "your-gemini-key" | \
  gcloud secrets create SCRAPER_GEMINI_API_KEY --data-file=- --replication-policy=automatic
echo -n "your-besttime-key" | \
  gcloud secrets create SCRAPER_BESTTIME_API_KEY --data-file=- --replication-policy=automatic
echo -n "your-foursquare-key" | \
  gcloud secrets create SCRAPER_FOURSQUARE_API_KEY --data-file=- --replication-policy=automatic
echo -n "your-outscraper-key" | \
  gcloud secrets create SCRAPER_OUTSCRAPER_API_KEY --data-file=- --replication-policy=automatic

# Grant access
for SECRET in SCRAPER_GOOGLE_MAPS_API_KEY SCRAPER_GEMINI_API_KEY SCRAPER_BESTTIME_API_KEY SCRAPER_FOURSQUARE_API_KEY SCRAPER_OUTSCRAPER_API_KEY; do
  gcloud secrets add-iam-policy-binding $SECRET \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role="roles/secretmanager.secretAccessor" 2>/dev/null || true
done
```

**Build and push:**

```bash
cd soulstep-scraper-api

# API Service image (base deps only, no Playwright ~200 MB)
docker build --platform linux/amd64 -f Dockerfile \
  -t REGION-docker.pkg.dev/PROJECT_ID/soulstep/soulstep-scraper-api:latest .
docker push REGION-docker.pkg.dev/PROJECT_ID/soulstep/soulstep-scraper-api:latest
```

**Deploy:**

```bash
gcloud run deploy soulstep-scraper-api \
  --image REGION-docker.pkg.dev/PROJECT_ID/soulstep/soulstep-scraper-api:latest \
  --platform managed \
  --region REGION \
  --no-allow-unauthenticated \
  --set-secrets "GOOGLE_MAPS_API_KEY=SCRAPER_GOOGLE_MAPS_API_KEY:latest,GEMINI_API_KEY=SCRAPER_GEMINI_API_KEY:latest,BESTTIME_API_KEY=SCRAPER_BESTTIME_API_KEY:latest,FOURSQUARE_API_KEY=SCRAPER_FOURSQUARE_API_KEY:latest,OUTSCRAPER_API_KEY=SCRAPER_OUTSCRAPER_API_KEY:latest" \
  --set-env-vars "MAIN_SERVER_URL=https://api.soul-step.org,SCRAPER_TIMEZONE=Asia/Dubai,SCRAPER_DB_PATH=/tmp/scraper.db,LOG_FORMAT=json" \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 2 \
  --no-cpu-throttling \
  --timeout 3600
```

> `--no-allow-unauthenticated` — scraper is internal only. Access via `gcloud auth print-identity-token`.
> `--timeout 3600` — scrape runs take up to 60 min.
> `--max-instances 2` — lightweight service that dispatches jobs; 2 instances handle admin polling and queue processing.
> `--no-cpu-throttling` — keeps CPU allocated after the HTTP response so background tasks (queue processor, Cloud Run Job dispatch) can complete. Without this, Cloud Run freezes the CPU once a response is returned, killing any in-flight background work.

**Tell the catalog API where the scraper is:**
```bash
gcloud run services update soulstep-catalog-api \
  --region REGION \
  --update-env-vars "DATA_SCRAPER_URL=https://soulstep-scraper-api-xxxx.a.run.app"
```

**Trigger and monitor runs** (requires identity token):
```bash
TOKEN=$(gcloud auth print-identity-token)
SCRAPER_URL=https://soulstep-scraper-api-xxxx.a.run.app

# Check health
curl -H "Authorization: Bearer $TOKEN" $SCRAPER_URL/health

# Start a run
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"location_code": "loc_XXXXX"}' $SCRAPER_URL/api/v1/scraper/runs

# Poll status
curl -H "Authorization: Bearer $TOKEN" $SCRAPER_URL/api/v1/scraper/runs/run_XXXXX

# Sync to catalog
curl -X POST -H "Authorization: Bearer $TOKEN" $SCRAPER_URL/api/v1/scraper/runs/run_XXXXX/sync
```

Alternatively, use the admin dashboard → Scraper section (wraps all calls through the catalog API proxy).

### 6.2 Cloud Run Job (browser mode)

When `SCRAPER_BACKEND=browser` and `SCRAPER_DISPATCH=cloud_run`, the API dispatches a separate Cloud Run Job for Chromium — keeping the API at 512 MB while the job handles the 2 GB Chromium workload.

**Build the job image** (includes Playwright + Chromium, ~900 MB):
```bash
docker build --platform linux/amd64 -f Dockerfile.job \
  -t REGION-docker.pkg.dev/PROJECT_ID/soulstep/soulstep-scraper-api-job:latest .
docker push REGION-docker.pkg.dev/PROJECT_ID/soulstep/soulstep-scraper-api-job:latest
```

**Deploy the Cloud Run Job:**
```bash
gcloud run jobs create soulstep-scraper-api-job \
  --image REGION-docker.pkg.dev/PROJECT_ID/soulstep/soulstep-scraper-api-job:latest \
  --region REGION \
  --memory 6Gi \
  --cpu 4 \
  --task-timeout 86400 \
  --max-retries 1 \
  --set-env-vars "SCRAPER_BACKEND=browser,GOOGLE_CLOUD_PROJECT=PROJECT_ID"
```

**Configure the API service to use the job:**
```bash
gcloud run services update soulstep-scraper-api \
  --region REGION \
  --update-env-vars "SCRAPER_DISPATCH=cloud_run,CLOUD_RUN_JOB_NAME=soulstep-scraper-api-job,CLOUD_RUN_REGION=REGION"
```

**Grant the scraper API service account permission to trigger the job:**

The scraper API uses `google-cloud-run` (via `run_v2.JobsClient`) to dispatch the job with env var overrides (`SCRAPER_RUN_CODE`, `SCRAPER_RUN_ACTION`). This requires the `run.jobs.runWithOverrides` permission — **`roles/run.invoker` does NOT include it** (see [issue #298810674](https://issuetracker.google.com/issues/298810674)).

Use `roles/run.jobsExecutorWithOverrides` — the minimal predefined role that includes both `run.jobs.run` and `run.jobs.runWithOverrides`.

```bash
# Find the service account the scraper API runs as
SA=$(gcloud run services describe soulstep-scraper-api \
  --region REGION \
  --format="value(spec.template.spec.serviceAccountName)")
# If empty, use the default Compute SA: PROJECT_NUMBER-compute@developer.gserviceaccount.com

# Grant it permission to trigger the job with overrides
gcloud run jobs add-iam-policy-binding soulstep-scraper-api-job \
  --region REGION \
  --member="serviceAccount:${SA}" \
  --role="roles/run.jobsExecutorWithOverrides"
```

**Update after job image changes:**
```bash
docker build --platform linux/amd64 -f Dockerfile.job \
  -t REGION-docker.pkg.dev/PROJECT_ID/soulstep/soulstep-scraper-api-job:latest .
docker push REGION-docker.pkg.dev/PROJECT_ID/soulstep/soulstep-scraper-api-job:latest

gcloud run jobs update soulstep-scraper-api-job \
  --image REGION-docker.pkg.dev/PROJECT_ID/soulstep/soulstep-scraper-api-job:latest \
  --region REGION
```

### 6.3 Persistent scraper database (optional)

By default, the scraper uses ephemeral SQLite (`/tmp/scraper.db`) on Cloud Run. Geo/place-type seeds re-run on startup (idempotent), so this is fine for on-demand scraping.

For persistent run history across cold starts, point the scraper at PostgreSQL on the existing Cloud SQL instance:

```bash
# Create a dedicated database and user
gcloud sql databases create soulstep-scraper --instance=soulstep-db
gcloud sql users create soulstep-scraper --instance=soulstep-db --password=STRONG_SCRAPER_PASSWORD

# Store the connection string
echo -n "postgresql://soulstep-scraper:STRONG_SCRAPER_PASSWORD@/soulstep-scraper?host=/cloudsql/PROJECT_ID:REGION:soulstep-db" | \
  gcloud secrets create SCRAPER_DATABASE_URL --data-file=- --replication-policy=automatic

gcloud secrets add-iam-policy-binding SCRAPER_DATABASE_URL \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor"

# Redeploy scraper with DATABASE_URL
gcloud run services update soulstep-scraper-api \
  --region REGION \
  --add-cloudsql-instances PROJECT_ID:REGION:soulstep-db \
  --set-secrets "DATABASE_URL=SCRAPER_DATABASE_URL:latest,..."
```

---

## 7. Scheduled Jobs

All five catalog jobs are created/updated automatically by the `deploy-jobs` workflow in `.github/workflows/deploy.yml`. The commands below are for reference or manual (non-CI) use.

```bash
PROJECT_NUMBER=$(gcloud projects describe PROJECT_ID --format="value(projectNumber)")
SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
```

### Cleanup orphaned images (weekly Mondays 5 AM UTC)

```bash
gcloud run jobs create cleanup-job \
  --image REGION-docker.pkg.dev/PROJECT_ID/soulstep/soulstep-catalog-api:latest \
  --region REGION \
  --set-cloudsql-instances PROJECT_ID:REGION:soulstep-db \
  --set-secrets "DATABASE_URL=DATABASE_URL:latest" \
  --command "python" --args="-m,app.jobs.cleanup_orphaned_images" \
  --max-retries 1 --task-timeout 300

gcloud scheduler jobs create http weekly-cleanup-job \
  --location REGION --schedule "0 5 * * 1" --time-zone "UTC" \
  --uri "https://run.googleapis.com/v2/projects/PROJECT_ID/locations/REGION/jobs/cleanup-job:run" \
  --http-method POST \
  --oauth-service-account-email "${SERVICE_ACCOUNT}" \
  --oauth-token-scope "https://www.googleapis.com/auth/cloud-platform"
```

### Timezone backfill (weekly, Sundays 3 AM UTC)

```bash
gcloud run jobs create backfill-timezones \
  --image REGION-docker.pkg.dev/PROJECT_ID/soulstep/soulstep-catalog-api:latest \
  --region REGION \
  --set-cloudsql-instances PROJECT_ID:REGION:soulstep-db \
  --set-secrets "DATABASE_URL=DATABASE_URL:latest" \
  --command "python" --args="-m,app.jobs.backfill_timezones" \
  --max-retries 1

# Run once manually if needed
gcloud run jobs execute backfill-timezones --region REGION --wait

# Scheduled weekly run
gcloud scheduler jobs create http weekly-backfill-timezones \
  --location REGION --schedule "0 3 * * 0" --time-zone "UTC" \
  --uri "https://run.googleapis.com/v2/projects/PROJECT_ID/locations/REGION/jobs/backfill-timezones:run" \
  --http-method POST \
  --oauth-service-account-email "${SERVICE_ACCOUNT}" \
  --oauth-token-scope "https://www.googleapis.com/auth/cloud-platform"
```

### Daily place sync (sync-places, daily 2 AM UTC)

Reads enriched places from the scraper PostgreSQL DB and upserts them into the catalog.

```bash
docker build --platform linux/amd64 -f Dockerfile.sync \
  -t REGION-docker.pkg.dev/PROJECT_ID/soulstep/sync-places:latest .
docker push REGION-docker.pkg.dev/PROJECT_ID/soulstep/sync-places:latest

gcloud run jobs create sync-places \
  --image REGION-docker.pkg.dev/PROJECT_ID/soulstep/sync-places:latest \
  --region REGION \
  --set-cloudsql-instances PROJECT_ID:REGION:soulstep-db \
  --set-secrets "DATABASE_URL=DATABASE_URL:latest,SCRAPER_DATABASE_URL=SCRAPER_DATABASE_URL:latest" \
  --memory 1Gi --cpu 1 --task-timeout 1800 --max-retries 1

# Grant the scheduler SA permission to invoke Cloud Run jobs (run once per project)
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/run.invoker"

# Cloud Run Jobs v2 API requires OAuth2 tokens — use --oauth-service-account-email
gcloud scheduler jobs create http daily-sync-places \
  --location REGION --schedule "0 2 * * *" --time-zone "UTC" \
  --uri "https://run.googleapis.com/v2/projects/PROJECT_ID/locations/REGION/jobs/sync-places:run" \
  --http-method POST \
  --oauth-service-account-email "${SERVICE_ACCOUNT}" \
  --oauth-token-scope "https://www.googleapis.com/auth/cloud-platform"
```

> **IAM note:** The `roles/run.invoker` grant above is required. Without it Cloud Scheduler gets a 403 when
> triggering the job. The v2 Cloud Run Admin API (`run.googleapis.com/v2/...`) requires **OAuth2** auth
> (`--oauth-service-account-email` + `--oauth-token-scope`), not OIDC — OIDC is only for invoking Cloud Run services.

### Daily content translation (translate-content, daily 4 AM UTC)

Translates missing content for ar, hi, te, ml using headless Chromium.

```bash
docker build --platform linux/amd64 -f Dockerfile.translate \
  -t REGION-docker.pkg.dev/PROJECT_ID/soulstep/translate-content:latest .
docker push REGION-docker.pkg.dev/PROJECT_ID/soulstep/translate-content:latest

gcloud run jobs create translate-content \
  --image REGION-docker.pkg.dev/PROJECT_ID/soulstep/translate-content:latest \
  --region REGION \
  --set-cloudsql-instances PROJECT_ID:REGION:soulstep-db \
  --set-secrets "DATABASE_URL=DATABASE_URL:latest" \
  --memory 4Gi --cpu 2 --task-timeout 900 --max-retries 0

gcloud scheduler jobs create http daily-translate-content \
  --location REGION --schedule "0 4 * * *" --time-zone "UTC" \
  --uri "https://run.googleapis.com/v2/projects/PROJECT_ID/locations/REGION/jobs/translate-content:run" \
  --http-method POST \
  --oauth-service-account-email "${SERVICE_ACCOUNT}" \
  --oauth-token-scope "https://www.googleapis.com/auth/cloud-platform"
```

### Run any job manually

```bash
gcloud run jobs execute JOB_NAME --region REGION [--wait]
```

---

## 8. CI/CD

The workflow at `.github/workflows/deploy.yml` runs on every push to `main`.

| Job | Trigger | What it does |
|---|---|---|
| `deploy-api` | `soulstep-catalog-api/` changed | Builds `api` image → deploys Cloud Run service |
| `deploy-jobs` | `soulstep-catalog-api/` changed (after `deploy-api`) | Builds `sync-places` + `translate-content` images → creates/updates all 5 Cloud Run Jobs |
| `deploy-web` | `apps/soulstep-customer-web/` changed | Installs deps → `firebase deploy` → Firebase Hosting (`web` target, default project site) |
| `deploy-admin-web` | `apps/soulstep-admin-web/` changed | Builds admin app → deploys to Firebase Hosting (`admin` target) |
| `deploy-scraper` | `soulstep-scraper-api/` changed | Builds `scraper` image → deploys Cloud Run service + upserts scraper job (primary + extra regions) |

### Workflow-level variables

These are set in `.github/workflows/deploy.yml` under `env:` — they are **not** runtime service env vars and do **not** belong in `ENV_VARS.md`.

| Variable | Default | Description |
|---|---|---|
| `EXTRA_JOB_REGIONS` | `""` (empty) | Comma-separated list of extra GCP regions to deploy the scraper Cloud Run Job to (e.g. `europe-west4,europe-west2`). When non-empty, CI builds the job image with tags for all regions in a single `docker buildx build --push` and upserts the Cloud Run Job in each region. See [MULTI_REGION_JOBS.md](MULTI_REGION_JOBS.md). |

### Create the deploy service account

```bash
gcloud iam service-accounts create github-deploy \
  --display-name "GitHub Actions deploy" \
  --project PROJECT_ID

SA_EMAIL="github-deploy@PROJECT_ID.iam.gserviceaccount.com"

for ROLE in roles/run.admin roles/artifactregistry.writer roles/iam.serviceAccountUser roles/cloudbuild.builds.editor; do
  gcloud projects add-iam-policy-binding PROJECT_ID \
    --member="serviceAccount:${SA_EMAIL}" --role="${ROLE}"
done

# Export key and store as GitHub secret GCP_SA_KEY
gcloud iam service-accounts keys create gcp-key.json --iam-account="${SA_EMAIL}"
cat gcp-key.json   # copy → GitHub Actions secret
rm gcp-key.json
```

### Required GitHub secrets

| Secret | Description |
|---|---|
| `GCP_SA_KEY` | Full JSON of the deploy service account key |
| `NEXT_PUBLIC_ADSENSE_PUBLISHER_ID` | AdSense publisher ID (baked into Next.js build) |
| `NEXT_PUBLIC_UMAMI_WEBSITE_ID` | Umami analytics website ID (baked into Next.js build) |
| `FIREBASE_TOKEN` | Run `firebase login:ci` and copy the token (admin-web only) |

---

## 9. Mobile

Mobile builds are identical regardless of backend deployment. The app is not containerised — build locally or via EAS.

### Production checklist

1. Set `bundleIdentifier` (iOS) and `package` (Android) in `app.json`
2. Set `name` and `slug` to production values
3. Set `EXPO_PUBLIC_API_URL=https://api.soul-step.org` in EAS secrets or `.env`
4. Configure icons, splash screen, and scheme in `app.json`

### Build and submit

```bash
cd apps/soulstep-customer-mobile
npm install -g eas-cli

eas build --platform ios --profile production
eas build --platform android --profile production

eas submit --platform ios
eas submit --platform android
```

### Beta testing (Firebase App Distribution)

```bash
# Preview build (ad-hoc signed for testers)
eas build --platform android --profile preview
eas build --platform ios --profile preview   # requires Apple Developer account

# Upload to Firebase App Distribution
firebase appdistribution:distribute path/to/app.apk \
  --app YOUR_ANDROID_FIREBASE_APP_ID \
  --groups "internal" \
  --release-notes "Description of what changed"
```

---

## 10. SEO & Search Engines

The backend serves all SEO files automatically at `https://api.soul-step.org`:

| URL | Description |
|---|---|
| `https://api.soul-step.org/sitemap.xml` | Dynamic sitemap — all places with hreflang + image entries |
| `https://api.soul-step.org/robots.txt` | Crawl directives (allows ChatGPT-User, Claude-Web, PerplexityBot, etc.) |
| `https://api.soul-step.org/llms.txt` | AI chatbot discoverability |
| `https://api.soul-step.org/llms-full.txt` | Richer AI discoverability document |
| `https://api.soul-step.org/.well-known/ai-plugin.json` | AI agent/plugin discovery |
| `https://api.soul-step.org/feed.xml` | RSS 2.0 (50 most recent places) |
| `https://api.soul-step.org/feed.atom` | Atom 1.0 |

### Submit to Google Search Console

1. Add property → **URL prefix** → enter the production frontend URL (`https://soul-step.org`)
2. Verify ownership (HTML file in `public/`, meta tag, or DNS TXT record)
3. **Sitemaps** → enter `https://api.soul-step.org/sitemap.xml` → Submit
4. Check **Coverage** and **Performance** after 24–48 hours

### Submit to Bing Webmaster Tools

1. Add site → verify ownership → **Sitemaps** → submit `https://api.soul-step.org/sitemap.xml`

### SEO generation (post-sync)

After syncing 10K+ places:

```bash
cd soulstep-catalog-api && source .venv/bin/activate

# Generate English SEO slugs + meta
python scripts/generate_seo.py --generate
```

Or auto-trigger after sync by setting on the scraper service:
```bash
gcloud run services update soulstep-scraper-api --region REGION \
  --update-env-vars "SCRAPER_TRIGGER_SEO_AFTER_SYNC=true" \
  --update-secrets "CATALOG_API_KEY=catalog-api-key:latest"
```

### AI citation monitoring

```
GET /api/v1/admin/seo/ai-citations?days=30
```

Returns AI crawler visit counts, bot breakdown, and top cited places. No setup needed — middleware runs automatically.

---

## 11. Observability

### Prometheus metrics

```
GET /metrics
```

Enabled automatically by `prometheus-fastapi-instrumentator`. Restrict access to this endpoint via firewall rules in production — allow only from your monitoring network. Scrape with Prometheus; visualise with Grafana.

### GlitchTip error tracking

[GlitchTip](https://glitchtip.com) is an open-source Sentry-compatible error tracker.

1. Deploy a GlitchTip instance (Docker image: `glitchtip/glitchtip`)
2. Create a project and obtain a DSN
3. Set `GLITCHTIP_DSN` on the Cloud Run service:
   ```bash
   gcloud run services update soulstep-catalog-api --region REGION \
     --update-env-vars "GLITCHTIP_DSN=https://key@glitchtip.example.com/1"
   ```

Client-side error tracking: set `VITE_GLITCHTIP_DSN` in the web build (via GitHub Actions secret).

---

## 12. Environment Variables Reference

See **[ENV_VARS.md](./ENV_VARS.md)** for the complete reference — mandatory vs optional, where to
configure each variable in production (Secret Manager, Cloud Run env vars, GitHub Actions secrets,
EAS secrets), and descriptions for every variable in every service.

---

## 13. Cost Estimate

| Service | What it runs | Free tier | ~Cost beyond free |
|---|---|---|---|
| **Cloud Run** | API + scraper | 2M requests/month, 180k vCPU-sec/month | ~$0.40 per 1M requests |
| **Cloud SQL** | PostgreSQL 15 | None | ~$7/month (`db-f1-micro`) |
| **Cloud Run Jobs** | cleanup, backfill, sync-places, translate-content | — | ~$0.02/hour per CPU |
| **Cloud Run Jobs (scraper)** | browser scraping (4 vCPU / 6 GiB) | — | ~$0.40/hour (see §13.1) |
| **Artifact Registry** | Docker images | 0.5 GB free | $0.10/GB/month |
| **Firebase Hosting** | Web + Admin SPAs | 10 GB storage, 360 MB/day transfer | $0.026/GB transfer |
| **Secret Manager** | Credentials | 6 active versions free | $0.06 per 10k accesses |
| **Cloud Scheduler** | Cron jobs | 3 jobs free | $0.10/job/month |
| **Cloud Build** | CI builds | 120 min/day free | $0.003/build-min |

Typical cost for low traffic: **~$15–20/month** (dominated by Cloud SQL).

### 13.1 Scraper Job Cost Estimate (browser backend)

The scraper Cloud Run Job runs with **4 vCPU / 6 GiB** (`SCRAPER_BACKEND=browser`). For multi-region deployment, see [MULTI_REGION_JOBS.md](MULTI_REGION_JOBS.md).
All discovery and detail collection is done via Playwright — **$0 API cost**.

**Compute pricing (Cloud Run Jobs):**
| Resource | Rate | Job config | Per-second |
|---|---|---|---|
| vCPU | $0.00002400/vCPU-s | 4 vCPU | $0.0000960 |
| Memory | $0.00000250/GiB-s | 6 GiB | $0.0000150 |
| **Total** | | | **$0.0001160/s = ~$0.42/hour** |

**100k places estimate (fully browser-based, $0 API cost):**

| Phase | Per-item | Concurrency | Wall time | Compute cost |
|---|---|---|---|---|
| Discovery (browser grid) | ~15-30s/cell, ~15 places/cell | 10 | ~3–6 hours | $1.26–$2.52 |
| Detail fetch (browser) | ~10-15s/place | 10 | ~28–42 hours | $11.76–$17.64 |
| Image download (CDN) | ~0.1s/place | 40 | ~4 min | $0.03 |
| Enrichment (Overpass etc.) | ~1s/place | 10 | ~2.8 hours | $1.18 |
| Sync to catalog | ~0.05s/place | — | ~1.4 hours | $0.59 |
| **Total** | | | **~36–53 hours** | **~$15–$22** |

**Key settings for this estimate:**
```
MAPS_BROWSER_POOL_SIZE=5          # 5 contexts in pool (reused across cells)
MAPS_BROWSER_MAX_PAGES=30         # recycle context every 30 navigations
MAPS_BROWSER_CONCURRENCY=10       # 10 grid cells / detail pages in parallel
```

> **Note:** The dominant cost is Cloud Run compute during detail fetching (~80% of wall time). To speed up, increase `MAPS_BROWSER_CONCURRENCY` and `MAPS_BROWSER_POOL_SIZE` — but also increase Job memory accordingly (~200 MB per active context).
