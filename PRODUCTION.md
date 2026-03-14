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
     translate.googleapis.com \
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
  -t REGION-docker.pkg.dev/PROJECT_ID/soulstep/api:latest \
  ./soulstep-catalog-api
docker push REGION-docker.pkg.dev/PROJECT_ID/soulstep/api:latest
```

**Option B — Cloud Build (no local Docker):**
```bash
gcloud builds submit ./soulstep-catalog-api \
  --tag REGION-docker.pkg.dev/PROJECT_ID/soulstep/api:latest
```

### Deploy

```bash
gcloud run deploy soulstep-catalog-api \
  --image REGION-docker.pkg.dev/PROJECT_ID/soulstep/api:latest \
  --platform managed \
  --region REGION \
  --allow-unauthenticated \
  --add-cloudsql-instances PROJECT_ID:REGION:soulstep-db \
  --set-secrets "JWT_SECRET=JWT_SECRET:latest,DATABASE_URL=DATABASE_URL:latest,RESEND_API_KEY=RESEND_API_KEY:latest" \
  --set-env-vars "CORS_ORIGINS=https://PROJECT_ID.web.app https://PROJECT_ID.firebaseapp.com,JWT_EXPIRE=30m,REFRESH_EXPIRE=30d,RESEND_FROM_EMAIL=noreply@soul-step.org,RESET_URL_BASE=https://soul-step.org,IMAGE_STORAGE=gcs,GCS_BUCKET_NAME=soulstep-images,LOG_FORMAT=json" \
  --min-instances 0 \
  --max-instances 10 \
  --memory 512Mi \
  --timeout 30
```

Copy the **Service URL** from the output (e.g. `https://soulstep-catalog-api-xxxx-uc.a.run.app`).

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
  --update-env-vars "CORS_ORIGINS=https://soul-step.org https://PROJECT_ID.web.app https://PROJECT_ID.firebaseapp.com,FRONTEND_URL=https://soul-step.org,API_BASE_URL=https://soulstep-catalog-api-xxxx.a.run.app,RESET_URL_BASE=https://soul-step.org"
```

### Cold start notes

`--min-instances 0` = scales to zero (free). Set `--min-instances 1` to eliminate cold starts (~$10/month).

On cold start, the app runs Alembic migrations before serving traffic (~5s for the first Cloud SQL connection). To avoid this latency: run migrations as a pre-deploy Cloud Run Job and set `RUN_MIGRATIONS_ON_START=false`.

---

## 4. Deploy Web Frontend

### Initialize Firebase Hosting

```bash
npm install -g firebase-tools
firebase login
firebase init hosting
```

When prompted:
- **Use an existing project** → select `PROJECT_ID`
- **Public directory**: `apps/soulstep-customer-web/dist`
- **Single-page app**: `Yes`
- **Set up automatic builds with GitHub**: `No` (CI/CD handles this)
- **Overwrite `dist/index.html`**: `No`

`firebase.json` and `.firebaserc` are already checked in — skip `firebase init` if they exist.

### Build and deploy

```bash
cd apps/soulstep-customer-web
VITE_API_URL=https://soulstep-catalog-api-xxxx.a.run.app npm run build
cd ../..
firebase deploy --only hosting:web
```

Your app is live at `https://PROJECT_ID.web.app`. Add this URL to `CORS_ORIGINS` on the API (see §3).

### Custom domain

Firebase console → **Hosting** → **Add custom domain** → follow DNS verification. TLS cert is provisioned automatically.

### Frontend VITE_* variables

`VITE_*` variables are baked into the build at CI time. Store them as GitHub Actions secrets:

| Secret | Value |
|---|---|
| `VITE_API_URL` | Cloud Run API URL |
| `VITE_ADSENSE_PUBLISHER_ID` | Google AdSense publisher ID |

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
  -t REGION-docker.pkg.dev/PROJECT_ID/soulstep/scraper:latest .
docker push REGION-docker.pkg.dev/PROJECT_ID/soulstep/scraper:latest
```

**Deploy:**

```bash
gcloud run deploy soulstep-scraper-api \
  --image REGION-docker.pkg.dev/PROJECT_ID/soulstep/scraper:latest \
  --platform managed \
  --region REGION \
  --no-allow-unauthenticated \
  --set-secrets "GOOGLE_MAPS_API_KEY=SCRAPER_GOOGLE_MAPS_API_KEY:latest,GEMINI_API_KEY=SCRAPER_GEMINI_API_KEY:latest,BESTTIME_API_KEY=SCRAPER_BESTTIME_API_KEY:latest,FOURSQUARE_API_KEY=SCRAPER_FOURSQUARE_API_KEY:latest,OUTSCRAPER_API_KEY=SCRAPER_OUTSCRAPER_API_KEY:latest" \
  --set-env-vars "MAIN_SERVER_URL=https://soulstep-catalog-api-xxxx.a.run.app,SCRAPER_TIMEZONE=Asia/Dubai,SCRAPER_DB_PATH=/tmp/scraper.db,LOG_FORMAT=json" \
  --memory 1Gi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 1 \
  --timeout 3600
```

> `--no-allow-unauthenticated` — scraper is internal only. Access via `gcloud auth print-identity-token`.
> `--timeout 3600` — scrape runs take up to 60 min.
> `--max-instances 1` — prevents concurrent runs (SQLite write conflicts).

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
  -t REGION-docker.pkg.dev/PROJECT_ID/soulstep/scraper-job:latest .
docker push REGION-docker.pkg.dev/PROJECT_ID/soulstep/scraper-job:latest
```

**Deploy the Cloud Run Job:**
```bash
gcloud run jobs create soulstep-scraper-job \
  --image REGION-docker.pkg.dev/PROJECT_ID/soulstep/scraper-job:latest \
  --region REGION \
  --memory 2Gi \
  --cpu 2 \
  --task-timeout 86400 \
  --max-retries 1 \
  --set-env-vars "SCRAPER_BACKEND=browser,GOOGLE_CLOUD_PROJECT=PROJECT_ID"
```

**Configure the API service to use the job:**
```bash
gcloud run services update soulstep-scraper-api \
  --region REGION \
  --update-env-vars "SCRAPER_DISPATCH=cloud_run,CLOUD_RUN_JOB_NAME=soulstep-scraper-job,CLOUD_RUN_REGION=REGION"
```

**Update after job image changes:**
```bash
docker build --platform linux/amd64 -f Dockerfile.job \
  -t REGION-docker.pkg.dev/PROJECT_ID/soulstep/scraper-job:latest .
docker push REGION-docker.pkg.dev/PROJECT_ID/soulstep/scraper-job:latest

gcloud run jobs update soulstep-scraper-job \
  --image REGION-docker.pkg.dev/PROJECT_ID/soulstep/scraper-job:latest \
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

### Cleanup orphaned images (daily 2 AM UTC)

```bash
gcloud run jobs create cleanup-job \
  --image REGION-docker.pkg.dev/PROJECT_ID/soulstep/api:latest \
  --region REGION \
  --set-cloudsql-instances PROJECT_ID:REGION:soulstep-db \
  --set-secrets "DATABASE_URL=DATABASE_URL:latest" \
  --command "python" --args="-m,app.jobs.cleanup_orphaned_images" \
  --max-retries 1 --task-timeout 300

gcloud scheduler jobs create http run-cleanup-job \
  --location REGION --schedule "0 2 * * *" --time-zone "UTC" \
  --uri "https://REGION-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/PROJECT_ID/jobs/cleanup-job:run" \
  --http-method POST --oauth-service-account-email "${SERVICE_ACCOUNT}"
```

### Timezone backfill (one-off, run manually after adding places)

```bash
gcloud run jobs create backfill-timezones \
  --image REGION-docker.pkg.dev/PROJECT_ID/soulstep/api:latest \
  --region REGION \
  --set-cloudsql-instances PROJECT_ID:REGION:soulstep-db \
  --set-secrets "DATABASE_URL=DATABASE_URL:latest" \
  --command "python" --args="-m,app.jobs.backfill_timezones" \
  --max-retries 1

gcloud run jobs execute backfill-timezones --region REGION --wait
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

gcloud scheduler jobs create http daily-sync-places \
  --location REGION --schedule "0 2 * * *" --time-zone "UTC" \
  --uri "https://REGION-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/PROJECT_ID/jobs/sync-places:run" \
  --http-method POST --oauth-service-account-email "${SERVICE_ACCOUNT}"
```

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
  --uri "https://REGION-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/PROJECT_ID/jobs/translate-content:run" \
  --http-method POST --oauth-service-account-email "${SERVICE_ACCOUNT}"
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
| `deploy-web` | `apps/soulstep-customer-web/` changed | Builds web app → deploys to Firebase Hosting (`web` target) |
| `deploy-admin-web` | `apps/soulstep-admin-web/` changed | Builds admin app → deploys to Firebase Hosting (`admin` target) |
| `deploy-scraper` | `soulstep-scraper-api/` changed | Builds `scraper` image → deploys Cloud Run service |

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
| `VITE_API_URL` | Production catalog API URL (baked into web build) |
| `VITE_ADSENSE_PUBLISHER_ID` | AdSense publisher ID |
| `FIREBASE_TOKEN` | Run `firebase login:ci` and copy the token |

---

## 9. Mobile

Mobile builds are identical regardless of backend deployment. The app is not containerised — build locally or via EAS.

### Production checklist

1. Set `bundleIdentifier` (iOS) and `package` (Android) in `app.json`
2. Set `name` and `slug` to production values
3. Set `EXPO_PUBLIC_API_URL` to the production API URL in EAS secrets or `.env`
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

The backend serves all SEO files automatically:

| Endpoint | Description |
|---|---|
| `GET /sitemap.xml` | Dynamic sitemap — all places with hreflang + image entries |
| `GET /robots.txt` | Crawl directives (allows ChatGPT-User, Claude-Web, PerplexityBot, etc.) |
| `GET /llms.txt` | AI chatbot discoverability |
| `GET /feed.xml` | RSS 2.0 (50 most recent places) |
| `GET /feed.atom` | Atom 1.0 |

### Submit to Google Search Console

1. Add property → **URL prefix** → enter the production frontend URL
2. Verify ownership (HTML file in `public/`, meta tag, or DNS TXT record)
3. **Sitemaps** → enter `sitemap.xml` → Submit (use the backend API URL, not frontend)
4. Check **Coverage** and **Performance** after 24–48 hours

### Submit to Bing Webmaster Tools

1. Add site → verify ownership → **Sitemaps** → submit backend sitemap URL

### SEO generation (post-sync)

After syncing 10K+ places:

```bash
cd soulstep-catalog-api && source .venv/bin/activate

# Generate English SEO slugs + meta
python scripts/generate_seo.py --generate

# Translate to all 5 languages (requires GOOGLE_CLOUD_PROJECT)
python scripts/generate_seo.py --translate
```

Or auto-trigger after sync by setting on the scraper service:
```bash
gcloud run services update soulstep-scraper-api --region REGION \
  --update-env-vars "SCRAPER_TRIGGER_SEO_AFTER_SYNC=true" \
  --set-secrets "SCRAPER_CATALOG_ADMIN_TOKEN=SCRAPER_CATALOG_ADMIN_TOKEN:latest"
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

### Catalog API (`soulstep-catalog-api/`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `JWT_SECRET` | **Yes** | `dev-secret` | JWT signing secret — always override in prod |
| `JWT_EXPIRE` | No | `30m` | Access token lifetime |
| `REFRESH_EXPIRE` | No | `30d` | Refresh token lifetime |
| `DATABASE_URL` | **Yes (prod)** | SQLite | PostgreSQL connection string |
| `PORT` | No | `3000` | Server port |
| `CORS_ORIGINS` | No | localhost origins | Space-separated allowed origins |
| `FRONTEND_URL` | **Yes (prod)** | `http://localhost:5173` | Public web frontend URL |
| `API_BASE_URL` | No | `http://localhost:3000` | Public API URL — RSS/Atom self links |
| `RESEND_API_KEY` | No | — | Resend.com key for password-reset emails |
| `RESEND_FROM_EMAIL` | No | `noreply@soul-step.org` | Email sender address |
| `RESET_URL_BASE` | No | `http://localhost:5173` | Frontend base URL for reset links |
| `GOOGLE_MAPS_API_KEY` | No | — | Required for place search autocomplete |
| `GOOGLE_CLOUD_PROJECT` | No | — | GCP project ID — GCS + Cloud Translation |
| `TRANSLATION_BACKEND` | No | `api` | `api` or `browser` |
| `BROWSER_POOL_SIZE` | No | `2` | Concurrent browser contexts |
| `BROWSER_MAX_TRANSLATIONS` | No | `50` | Translations per context before recycling |
| `BROWSER_TRANSLATE_MULTI_SIZE` | No | `5` | Texts per batch request |
| `BROWSER_HEADLESS` | No | `true` | Browser headless mode |
| `IMAGE_STORAGE` | No | `blob` | `blob` (DB) or `gcs` |
| `GCS_BUCKET_NAME` | No | — | GCS bucket (required when `IMAGE_STORAGE=gcs`) |
| `ADS_ENABLED` | No | `false` | Master ads switch |
| `ADSENSE_PUBLISHER_ID` | No | — | Google AdSense publisher ID |
| `ADMOB_APP_ID_IOS` | No | — | AdMob App ID for iOS |
| `ADMOB_APP_ID_ANDROID` | No | — | AdMob App ID for Android |
| `MIN_APP_VERSION_SOFT` | No | — | Soft-update semver threshold |
| `MIN_APP_VERSION_HARD` | No | — | Hard-update semver threshold (HTTP 426) |
| `LATEST_APP_VERSION` | No | — | Current latest release |
| `DATA_SCRAPER_URL` | No | — | Scraper API URL for admin proxy |
| `SCRAPER_DATABASE_URL` | No | — | Scraper PostgreSQL URL for sync-places job |
| `GLITCHTIP_DSN` | No | — | Sentry-compatible error tracking DSN |
| `LOG_LEVEL` | No | `INFO` | `DEBUG`, `INFO`, `WARNING`, `ERROR` |
| `LOG_FORMAT` | No | `json` | `json` (production) or `text` (local dev) |

### Scraper (`soulstep-scraper-api/`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `GOOGLE_MAPS_API_KEY` | Yes (api mode) | — | Google Maps/Places API key |
| `MAIN_SERVER_URL` | Yes | `http://127.0.0.1:3000` | Catalog API URL for syncing places |
| `PORT` | No | `8001` | Scraper API listen port |
| `SCRAPER_BACKEND` | No | `api` | `api` or `browser` |
| `SCRAPER_DISPATCH` | No | `local` | `local` or `cloud_run` |
| `CLOUD_RUN_JOB_NAME` | No | `soulstep-scraper-job` | Cloud Run Job name |
| `CLOUD_RUN_REGION` | No | `us-central1` | Cloud Run region |
| `MAPS_BROWSER_POOL_SIZE` | No | `2` | Concurrent Chromium contexts |
| `MAPS_BROWSER_MAX_PAGES` | No | `30` | Navigations per session before recycling |
| `MAPS_BROWSER_HEADLESS` | No | `true` | Chromium headless mode |
| `BROWSER_GRID_CELL_SIZE_KM` | No | `3.0` | Grid cell side-length (km) for browser discovery |
| `DATABASE_URL` | No | — | PostgreSQL URL (overrides `SCRAPER_DB_PATH`) |
| `SCRAPER_DB_PATH` | No | `scraper.db` | SQLite path |
| `SCRAPER_TIMEZONE` | No | `UTC` | Fallback timezone |
| `SCRAPER_DISCOVERY_CONCURRENCY` | No | `10` | Max concurrent discovery calls |
| `SCRAPER_DETAIL_CONCURRENCY` | No | `20` | Max concurrent detail fetches |
| `SCRAPER_ENRICHMENT_CONCURRENCY` | No | `10` | Max concurrent enrichment tasks |
| `SCRAPER_MAX_PHOTOS` | No | `3` | Photos per place |
| `SCRAPER_IMAGE_CONCURRENCY` | No | `40` | Max concurrent image downloads |
| `SCRAPER_OVERPASS_CONCURRENCY` | No | `2` | Max concurrent Overpass requests |
| `SCRAPER_OVERPASS_JITTER_MAX` | No | `1.5` | Random jitter between Overpass requests |
| `SCRAPER_GATE_IMAGE_DOWNLOAD` | No | `0.75` | Quality gate — image download phase |
| `SCRAPER_GATE_ENRICHMENT` | No | `0.75` | Quality gate — enrichment phase |
| `SCRAPER_GATE_SYNC` | No | `0.75` | Quality gate — sync phase |
| `GEMINI_API_KEY` | No | — | LLM tie-breaking for description selection |
| `BESTTIME_API_KEY` | No | — | BestTime collector |
| `FOURSQUARE_API_KEY` | No | — | Foursquare collector |
| `OUTSCRAPER_API_KEY` | No | — | Outscraper collector |
| `SCRAPER_TRIGGER_SEO_AFTER_SYNC` | No | `false` | Auto-trigger SEO generation after sync |
| `SCRAPER_CATALOG_ADMIN_TOKEN` | No | — | Admin JWT for auto-SEO |
| `GOOGLE_CLOUD_PROJECT` | No | — | GCP project ID |
| `LOG_FORMAT` | No | `json` | `json` (Cloud Run) or `text` |
| `LOG_LEVEL` | No | `INFO` | Python log level |

### Web frontend (`apps/soulstep-customer-web/`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `VITE_API_URL` | **Yes (prod)** | _(relative)_ | Production API URL — baked in at build time |
| `VITE_API_BASE_URL` | No | `https://api.soul-step.org` | Public API URL shown on Developers page |
| `VITE_PROXY_TARGET` | No | `http://127.0.0.1:3000` | Dev server proxy target |
| `VITE_ADSENSE_PUBLISHER_ID` | No | — | Google AdSense publisher ID |
| `VITE_GLITCHTIP_DSN` | No | — | Client-side error tracking DSN |
| `VITE_UMAMI_WEBSITE_ID` | No | — | Umami Cloud analytics website ID |

### Mobile (`apps/soulstep-customer-mobile/`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `EXPO_PUBLIC_API_URL` | No | `http://127.0.0.1:3000` | API base URL for device / Expo Go |
| `EXPO_PUBLIC_INVITE_LINK_BASE_URL` | No | — | Base URL for group invite links |
| `EXPO_PUBLIC_ADMOB_APP_ID_IOS` | No | — | AdMob App ID for iOS |
| `EXPO_PUBLIC_ADMOB_APP_ID_ANDROID` | No | — | AdMob App ID for Android |
| `EXPO_PUBLIC_UMAMI_WEBSITE_ID` | No | — | Umami analytics website ID |

---

## 13. Cost Estimate

| Service | What it runs | Free tier | ~Cost beyond free |
|---|---|---|---|
| **Cloud Run** | API + scraper | 2M requests/month, 180k vCPU-sec/month | ~$0.40 per 1M requests |
| **Cloud SQL** | PostgreSQL 15 | None | ~$7/month (`db-f1-micro`) |
| **Cloud Run Jobs** | cleanup, backfill, sync-places, translate-content | — | ~$0.02/hour per CPU |
| **Artifact Registry** | Docker images | 0.5 GB free | $0.10/GB/month |
| **Firebase Hosting** | Web + Admin SPAs | 10 GB storage, 360 MB/day transfer | $0.026/GB transfer |
| **Secret Manager** | Credentials | 6 active versions free | $0.06 per 10k accesses |
| **Cloud Scheduler** | Cron jobs | 3 jobs free | $0.10/job/month |
| **Cloud Build** | CI builds | 120 min/day free | $0.003/build-min |

Typical cost for low traffic: **~$15–20/month** (dominated by Cloud SQL).
