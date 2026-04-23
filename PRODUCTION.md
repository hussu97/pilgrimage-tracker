# Production Deployment

SoulStep backends (catalog-api + scraper-api) run on a **single GCP e2-micro VM** (europe-west1-d)
via Docker Compose with Postgres 15 in a container. Web frontends deploy to **Vercel**. The
Playwright scraper stays on **Cloud Run Jobs** (3 regions). No Cloud SQL, no Secret Manager.

Update this file whenever deployment-relevant changes are made: new env vars, new services, DB
migrations, or build commands.

For moving the backend stack into a different GCP account/project, follow
**[docs/backend-gcp-project-migration.md](docs/backend-gcp-project-migration.md)**.

---

## 1. Overview

SoulStep is deployed as a hybrid: VM for always-on HTTP services + Cloud Run Jobs for ephemeral
Playwright workloads.

| Component | Where | Notes |
|---|---|---|
| catalog-api | GCP e2-micro VM (europe-west1-d) | Docker Compose, nginx, Let's Encrypt |
| scraper-api | GCP e2-micro VM (europe-west1-d) | Same VM, same Compose stack |
| PostgreSQL 15 | GCP e2-micro VM | Docker container (`postgres:15`) |
| Playwright scraper job | Cloud Run Job | 3 regions; dispatched by scraper-api |
| Customer web | Vercel | `apps/soulstep-customer-web` |
| Admin web | Vercel | `apps/soulstep-admin-web` |
| Container images | GHCR (`ghcr.io/hussu97/`) | Public packages |
| Place images | GCS (`soulstep-images`) | objectAdmin granted to VM SA |
| DB backups | GCS (`soulstep-db-backups`) | objectCreator granted to VM SA |
| Logs | Cloud Ops Agent on VM | `docker compose logs` + cron log files |
| Error tracking | Sentry | SENTRY_DSN (backend), VITE/NEXT/EXPO DSNs (frontends) |

---

## 2. VM Provisioning

```bash
# Create the VM
gcloud compute instances create soulstep-vm \
  --project=project-fa2d7f52-2bc4-4a46-8ae \
  --zone=europe-west1-d \
  --machine-type=e2-micro \
  --image-family=debian-12 \
  --image-project=debian-cloud \
  --boot-disk-size=20GB \
  --boot-disk-type=pd-ssd \
  --tags=http-server,https-server \
  --scopes=cloud-platform

# Firewall rules
gcloud compute firewall-rules create allow-http-https \
  --project=project-fa2d7f52-2bc4-4a46-8ae \
  --allow=tcp:80,tcp:443 \
  --target-tags=http-server,https-server

# Get external IP (for DNS + GitHub Secrets)
gcloud compute instances describe soulstep-vm \
  --zone=europe-west1-d \
  --format="value(networkInterfaces[0].accessConfigs[0].natIP)"
```

Grant VM service account (`${PROJECT_NUMBER}-compute@developer.gserviceaccount.com`) access to GCS:

```bash
PROJECT_NUMBER=$(gcloud projects describe project-fa2d7f52-2bc4-4a46-8ae --format="value(projectNumber)")
SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
gcloud storage buckets add-iam-policy-binding gs://soulstep-images --member="serviceAccount:${SA}" --role=roles/storage.objectAdmin
gcloud storage buckets create gs://soulstep-db-backups --location=europe-west1
gcloud storage buckets add-iam-policy-binding gs://soulstep-db-backups --member="serviceAccount:${SA}" --role=roles/storage.objectCreator
```

Bootstrap (one-time):

```bash
gcloud compute ssh soulstep-vm --zone=europe-west1-d
# On the VM:
curl -fsSL https://raw.githubusercontent.com/hussu97/pilgrimage-tracker/main/scripts/vm-bootstrap.sh | bash
```

The script installs Docker, gcloud CLI, clones repo to `/opt/soulstep`, creates `certbot/` + `backups/`, starts Postgres, installs crontab. After bootstrap: copy `.env.example` → `/opt/soulstep/.env`, fill in secrets, add deploy SSH public key to `~/.ssh/authorized_keys`.

---

## 3. GitHub Secrets Setup

Go to **GitHub → hussu97/pilgrimage-tracker → Settings → Environments → production**.

### VM Connection

| Secret | Value |
|---|---|
| `SERVER_HOST` | VM external IP |
| `SERVER_USER` | VM deploy user (e.g. `hussainabbasi`) |
| `SERVER_SSH_KEY` | Ed25519 private key — public half added to VM's `~/.ssh/authorized_keys` |

### Runtime Secrets (written to `/opt/soulstep/.env` on every deploy)

| Secret | Description |
|---|---|
| `USE_SSL` | `false` initially; `true` after TLS certs are issued |
| `POSTGRES_USER` | e.g. `soulstep` |
| `POSTGRES_PASSWORD` | `openssl rand -hex 32` |
| `POSTGRES_DB` | catalog-api DB name, e.g. `soulstep` |
| `SCRAPER_POSTGRES_DB` | scraper-api DB name, e.g. `soulstep_scraper` |
| `JWT_SECRET` | `openssl rand -hex 32` |
| `CATALOG_API_KEY` | `openssl rand -hex 32` — shared between catalog-api and scraper-api |
| `GOOGLE_MAPS_API_KEY` | Google Places API key (Enable "Places API (New)") |
| `RESEND_API_KEY` | Resend.com key for transactional email |
| `RESEND_FROM_EMAIL` | `noreply@soul-step.org` |
| `CORS_ORIGINS` | `https://soul-step.org https://www.soul-step.org https://admin.soul-step.org` |
| `FRONTEND_URL` | `https://soul-step.org` |
| `RESET_URL_BASE` | `https://soul-step.org` |
| `GCS_BUCKET_NAME` | `soulstep-images` |
| `GOOGLE_CLOUD_PROJECT` | `project-fa2d7f52-2bc4-4a46-8ae` |
| `SENTRY_DSN` | Sentry DSN for catalog-api + scraper-api error tracking |
| `ADS_ENABLED` | `false` |
| `ADSENSE_PUBLISHER_ID` | Google AdSense publisher ID (only needed when `ADS_ENABLED=true`) |
| `SCRAPER_GEMINI_API_KEY` | Google Gemini API key |
| `SCRAPER_FOURSQUARE_API_KEY` | Foursquare API key |
| `SCRAPER_ALLOWED_ORIGINS` | `https://admin.soul-step.org` |
| `SCRAPER_TIMEZONE` | `Asia/Dubai` |
| `BACKUP_GCS_BUCKET` | `soulstep-db-backups` |
| `LOG_LEVEL` | `INFO` |

### GitHub Environment Variables (workflow metadata)

These values are read by `.github/workflows/deploy-vm.yml` and are the canonical place to bind the repo to a specific GCP project:

| Variable | Description |
|---|---|
| `GCP_PROJECT_ID` | Target GCP project ID for Cloud Run job deploys |
| `GCP_REGION` | Primary deploy region / Artifact Registry region |
| `GCP_ARTIFACT_REGISTRY_HOST` | Example: `europe-west1-docker.pkg.dev` |
| `GCP_ARTIFACT_REGISTRY_REPO` | Artifact Registry repo name, usually `soulstep` |
| `GCP_DEPLOY_SERVICE_ACCOUNT` | GitHub Actions deploy SA email |
| `GCP_WIF_PROVIDER` | Full Workload Identity provider resource |
| `CLOUD_RUN_JOB_NAME` | Cloud Run Job name, default `soulstep-scraper-api-job` |
| `CLOUD_RUN_EXTRA_JOB_REGIONS` | Comma-separated extra regions, e.g. `europe-west4,europe-west2` |

### Vercel + Cloud Run Job Secrets

| Secret | Used by |
|---|---|
| `VERCEL_TOKEN` | Vercel deployments |
| `VERCEL_ORG_ID` | Vercel |
| `VERCEL_PROJECT_ID_WEB` | Customer web Vercel project |
| `VERCEL_PROJECT_ID_ADMIN` | Admin web Vercel project |

GCP auth for the Cloud Run Job uses **Workload Identity Federation** (keyless):
- Pool/provider/service account are supplied via the GitHub environment variables above.
- The current production values can be discovered from the `production` environment in GitHub.

---

## 4. GHCR Package Visibility

Images are pushed to GitHub Container Registry. Cloud Run Jobs pull public GHCR images without
authentication.

After the first CI run: **GitHub → hussu97 → Packages** → open each package → **Package settings → Change visibility → Public**. Do this for `soulstep-catalog-api`, `soulstep-scraper-api`, and `soulstep-scraper-api-job`.

---

## 5. DNS

Add these A records at your DNS provider for `soul-step.org`:

| Type | Name | Value |
|---|---|---|
| A | `catalog-api` | VM external IP |
| A | `scraper-api` | VM external IP |

Apex / `www` / `admin` records point to Vercel (unchanged).

Wait for propagation (`dig catalog-api.soul-step.org` shows VM IP) before issuing TLS certs.

---

## 6. TLS — Let's Encrypt

With nginx running in HTTP-only mode (`USE_SSL=false`) and DNS pointing at the VM:

```bash
# SSH into VM
cd /opt/soulstep

# Issue SAN cert for both subdomains
docker compose -f docker-compose.prod.yml run --rm --entrypoint "" certbot \
  certbot certonly --webroot -w /var/www/certbot \
  -d catalog-api.soul-step.org -d scraper-api.soul-step.org \
  --email admin@soul-step.org --agree-tos --no-eff-email
```

Then enable HTTPS:

```bash
sed -i 's/USE_SSL=false/USE_SSL=true/' /opt/soulstep/.env
# Also update the USE_SSL GitHub Secret → true
docker compose -f docker-compose.prod.yml up -d --force-recreate nginx
```

Certs auto-renew every 12 h via the certbot container in `docker-compose.prod.yml`. If the ACME
challenge fails, verify nginx is up in HTTP-only mode and port 80 is open in GCP firewall.

---

## 7. CI/CD

| Workflow | Trigger | What it does |
|---|---|---|
| `deploy-vm.yml` | Tests pass on `main` | Builds catalog-api + scraper-api images → GHCR; deploys to VM via SSH; updates Cloud Run Job in 3 regions (WIF auth, target project/region from GitHub environment variables) |
| `deploy.yml` | Changes to `apps/` on `main` | Deploys customer-web + admin-web to Vercel. No Cloud Run steps. |
| `tests.yml` | Every push/PR | Runs backend pytest + frontend Vitest/Jest suites |
| `update-env.yml` | Manual | Rewrites `/opt/soulstep/.env` from GitHub secrets without full redeploy; now matches the full backend env surface from `deploy-vm.yml` |

**`deploy-vm.yml` jobs:**

| Job | Triggers when | Action |
|---|---|---|
| `build-catalog-api` | `soulstep-catalog-api/` changed | Build + push to GHCR, Trivy scan |
| `build-scraper-api` | `soulstep-scraper-api/` changed | Build API image + job image (Playwright), push to GHCR, Trivy scan |
| `deploy-vm` | Either changed | SSH → write `.env` → `git pull` → `docker compose pull` → `up --force-recreate` → health check → nginx reload |
| `deploy-scraper-job` | Scraper changed | Update Cloud Run Job in 3 regions (WIF auth; project/provider/service-account come from GitHub environment variables) |

VM deploy sequence: `git pull` → `docker compose pull` → `docker compose up --force-recreate` → alembic migrations run via catalog-api lifespan hook → health check (30 × 5 s) → `nginx reload` → `docker image prune -f`.

---

## 8. Vercel Web Frontends

Both web apps deploy automatically via `deploy.yml`. Set these environment variables in the
**Vercel dashboard** for each project:

| App | Variable | Value |
|---|---|---|
| Customer web | `NEXT_PUBLIC_API_BASE_URL` | `https://catalog-api.soul-step.org` |
| Customer web | `INTERNAL_API_URL` | `https://catalog-api.soul-step.org` |
| Customer web | `NEXT_PUBLIC_SENTRY_DSN` | Sentry DSN (client-side) |
| Customer web | `NEXT_PUBLIC_UMAMI_WEBSITE_ID` | Umami website ID (optional). Must be set in Vercel — when unset the analytics `<Script>` tag in `app/layout.tsx` is not rendered and all tracking silently no-ops. |
| Admin web | `VITE_API_URL` | `https://catalog-api.soul-step.org` |
| Admin web | `VITE_SENTRY_DSN` | Sentry DSN (client-side) |

---

## 9. Scraper Cloud Run Job

The Playwright browser scraper (`soulstep-scraper-api-job`) runs as a Cloud Run Job. It is:

- **Triggered** from the admin web UI → scraper-api `POST /runs` → dispatched to Cloud Run
- **Built** automatically by `deploy-vm.yml` when `soulstep-scraper-api/` changes
- **Image:** `ghcr.io/hussu97/soulstep-scraper-api-job:latest` (public GHCR) + pushed to Artifact Registry per region
- **Resources:** 6 GB RAM, 4 vCPU, 24 h task timeout, max 1 retry
- **Regions:** europe-west1 (max 3 jobs), europe-west4 (max 5 jobs), europe-west2 (max 5 jobs)
- **DB connectivity:** Job connects to VM Postgres at `https://catalog-api.soul-step.org` via `CATALOG_API_KEY`

To trigger manually:

```bash
gcloud run jobs execute soulstep-scraper-api-job \
  --region=europe-west1 \
  --project=project-fa2d7f52-2bc4-4a46-8ae
```

### Egress path for Google Maps requests

Cloud Run's default egress IP pool is on Google Maps' bot-wall (every request redirects to `google.com/sorry/index`). To work around this without paid proxies, the scraper routes browser traffic through **tinyproxy on the VM**:

- **Proxy address:** `http://10.132.0.2:3128` (VM internal VPC IP).
- **Route:** Cloud Run Job → Direct VPC Egress (`private-ranges-only`) → VM tinyproxy → VM external IP `34.76.105.103` → Google Maps.
- **Wiring:** `docker-compose.prod.yml` defaults `BROWSER_PROXY_LIST` to `http://10.132.0.2:3128`. The scraper's `job_env_vars()` forwards the value to every Cloud Run Job execution. Playwright's `ProxyRotator` in `soulstep-scraper-api/app/services/browser_pool.py` passes it into every browser context's `proxy=` config.
- **Override:** set GitHub secret `BROWSER_PROXY_LIST=http://user:pass@host:port[,...]` to use external proxies instead.

**Tinyproxy install:** handled by `scripts/vm-bootstrap.sh` step [4/9] — idempotent, runs on every fresh VM. Binds to `0.0.0.0:3128` with `Allow 10.128.0.0/9` ACL so only VPC-internal traffic (Cloud Run Jobs via Direct VPC Egress) can use it. `systemctl enable tinyproxy` makes it survive reboots.

**The existing `default-allow-internal` firewall rule (source `10.128.0.0/9`) already permits Cloud Run Jobs in all three regions to reach the VM's internal IP — no new firewall rule needed.** GCP's default ingress policy also blocks `3128` from the public internet, so the `0.0.0.0` bind is not externally reachable.

**⚠️ Static internal IP required.** `docker-compose.prod.yml` defaults `BROWSER_PROXY_LIST` to `http://10.132.0.2:3128`. The VM **must** have primary internal IP `10.132.0.2` for this contract to hold. Reserve it when creating / recreating the VM:

```bash
gcloud compute instances create soulstep-vm \
  --zone=europe-west1-b \
  --private-network-ip=10.132.0.2 \
  ...
```

If the VM is ever recreated on a different internal IP, either re-reserve `.2` or update the compose default + `BROWSER_PROXY_LIST` GitHub secret.

**⚠️ Static external IP required.** The VM's **external** IP is what Google Maps actually sees. If GCP rotates it, the new IP may land back on the bot-wall. Confirm it's reserved:

```bash
gcloud compute addresses list --filter="users~soulstep-vm" --format="table(name,address,addressType)"
# addressType should be EXTERNAL and status RESERVED (not EPHEMERAL)
```

Promote ephemeral → static once:

```bash
gcloud compute addresses create soulstep-vm-ip \
  --addresses=$(gcloud compute instances describe soulstep-vm \
    --zone=europe-west1-b --format='get(networkInterfaces[0].accessConfigs[0].natIP)') \
  --region=europe-west1
```

**Verify the proxy is working** (from the VM):

```bash
curl -sL --proxy http://10.132.0.2:3128 -o /dev/null \
  -w "http=%{http_code} final=%{url_effective}\n" \
  https://www.google.com/maps/search/mosque/@25.55,55.90,15z?hl=en
# Expect: http=200 final=…/maps/search/… (NOT /sorry/index)
```

**Failure mode** (if tinyproxy dies or the VM's IP also gets flagged): the hardened circuit breaker in `browser_pool.py::_CircuitBreaker` detects the pattern — 3 cold-start block events → `_permanent=True` → grid pass aborts immediately → run marked `status=failed` with `error_message` pointing to `BROWSER_PROXY_LIST`. No more silent 10-minute-wasting runs.

### Portable run handoff

For large interrupted runs, operators can now export a production `run_code`, continue it locally, and finalize it back into production as the same run:

```bash
cd soulstep-scraper-api
source .venv/bin/activate
python scripts/handoff.py export --run-code run_abc123 --prod-dsn postgresql://...
python scripts/handoff.py resume-local --bundle /tmp/run_abc123-....json.gz --local-database-url postgresql://...
python scripts/handoff.py finalize --bundle /tmp/run_abc123-....json.gz --prod-url https://scraper-api.soul-step.org
```

Operational notes:
- `POST /api/v1/scraper/runs/{run_code}/handoff/export` also exists on the server and freezes the run by creating a `RunHandoff`.
- While a handoff is active, run mutations (`resume`, `cancel`, `sync`, `retry-images`, `re-enrich`) return `409`.
- Finalize uploads raw gzip bytes to `POST /api/v1/scraper/runs/{run_code}/handoff/finalize?handoff_code=...`; production remains the only place that performs the final sync/SEO steps.

---

## 10. Multi-Region Scraper Dispatch

### Architecture

```
                scraper-api (VM, europe-west1)
                ┌─────────────────────────┐
                │  Queue Processor        │
                │  (polls every 15s)      │
                └────────┬────────────────┘
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
   europe-west1    europe-west4    europe-west2
   max 3 jobs      max 5 jobs      max 5 jobs
```

The queue processor tracks active jobs per region and dispatches new jobs to whichever region has
capacity. All regions share the same GCS bucket (cross-region egress: $0.01/GB same-continent).

### Region Table

| Region | Max Jobs | Notes |
|---|---|---|
| europe-west1 (Belgium) | 3 | Primary — also hosts VM services; reduced quota budget |
| europe-west4 (Netherlands) | 5 | $0.01/GB GCS egress, +20–50 ms DB latency |
| europe-west2 (London) | 5 | $0.01/GB GCS egress, +20–50 ms DB latency |

### How to Add a Region

1. Create Artifact Registry repo: `gcloud artifacts repositories create soulstep --repository-format=docker --location=$NEW_REGION`
2. One-time image push:
```bash
docker buildx build --platform linux/amd64 -f soulstep-scraper-api/Dockerfile.job \
  -t ${NEW_REGION}-docker.pkg.dev/${PROJECT_ID}/soulstep/soulstep-scraper-api-job:latest \
  --push ./soulstep-scraper-api
```
3. Create Cloud Run Job:
```bash
gcloud run jobs create soulstep-scraper-api-job --region "$NEW_REGION" \
  --image "${NEW_REGION}-docker.pkg.dev/${PROJECT_ID}/soulstep/soulstep-scraper-api-job:latest" \
  --memory 6Gi --cpu 4 --task-timeout 86400 --max-retries 1
```
4. Grant `roles/run.jobsExecutorWithOverrides` to the deploy service account.
5. Update `CLOUD_RUN_REGIONS` in `deploy-vm.yml`: `europe-west1:3,europe-west4:5,europe-west2:5,$NEW_REGION:5`
6. Add `$NEW_REGION` to `EXTRA_JOB_REGIONS` in `deploy-vm.yml` so CI auto-deploys future images.

### Quota Budget (europe-west1 — primary region)

| Component | mCPU reserved | Memory reserved |
|---|---|---|
| catalog-api (max 3 containers) | 3,000 | 1.5 GiB |
| scraper-api (max 2 containers) | 2,000 | 1.0 GiB |
| **Available for jobs** | **15,000** | **40.45 GiB** |
| **Max parallel jobs** | **3** (CPU-limited) | 6 (memory-limited) |

Extra regions: **5 parallel jobs each** (20,000 mCPU ÷ 4,000 per job = 5).

---

## 11. Environment Variables

Secrets flow via **GitHub Actions Secrets** → VM `.env`. Web/mobile build-time vars go in **Vercel dashboard** or **EAS secrets**.

### catalog-api (`soulstep-catalog-api`)

| Variable | Mandatory | Default | Description |
|---|---|---|---|
| `JWT_SECRET` | ✓ | — | `openssl rand -hex 32`. |
| `CATALOG_API_KEY` | ✓ | — | Internal secret shared with scraper-api (`X-API-Key`). |
| `POSTGRES_USER` | ✓ | — | PostgreSQL username. Shared with scraper-api. |
| `POSTGRES_PASSWORD` | ✓ | — | PostgreSQL password. |
| `POSTGRES_DB` | ✓ | — | catalog-api DB name. Example: `soulstep` |
| `SCRAPER_POSTGRES_DB` | ✓ | — | scraper-api DB name. Example: `soulstep_scraper` |
| `RESEND_API_KEY` | ✓ | — | Resend.com key for password-reset emails. |
| `CORS_ORIGINS` | ✓ | `localhost` only | Space-separated browser origins. Example: `https://soul-step.org https://admin.soul-step.org` |
| `FRONTEND_URL` | ✓ | `http://localhost:5173` | Customer web URL — used in OG, sitemap, JSON-LD, email links. |
| `GOOGLE_MAPS_API_KEY` | — | — | Places API key for search autocomplete. |
| `JWT_EXPIRE` | — | `30m` | Access-token lifetime (`30m`, `2h`, `7d`, or integer minutes). |
| `REFRESH_EXPIRE` | — | `30d` | Refresh-token lifetime. |
| `RESEND_FROM_EMAIL` | — | `noreply@soul-step.org` | Verified sender address. |
| `RESET_URL_BASE` | — | `http://localhost:5173` | Frontend base URL for password-reset links. |
| `VERIFY_URL_BASE` | — | _(same as `RESET_URL_BASE`)_ | Frontend base URL for email-verification links. |
| `LOG_LEVEL` | — | `INFO` | `DEBUG` \| `INFO` \| `WARNING` \| `ERROR` |
| `LOG_FORMAT` | — | `json` | `json` for Cloud Logging; `text` for local dev. |
| `GOOGLE_CLOUD_PROJECT` | — | — | GCP project ID. Required for GCS image storage. |
| `IMAGE_STORAGE` | — | `blob` | `blob` (base64 in DB) or `gcs` (Cloud Storage — recommended). |
| `GCS_BUCKET_NAME` | — | — | GCS bucket for place images. Required when `IMAGE_STORAGE=gcs`. |
| `DATA_SCRAPER_URL` | — | `http://localhost:8001` | scraper-api URL for admin proxy. Docker Compose: `http://scraper-api:8080`. |
| `ADS_ENABLED` | — | `false` | Master switch for ads. |
| `ADSENSE_PUBLISHER_ID` | — | — | AdSense publisher ID. Required when `ADS_ENABLED=true`. |
| `ADMOB_APP_ID_IOS` | — | — | AdMob App ID (iOS). Required when `ADS_ENABLED=true`. |
| `ADMOB_APP_ID_ANDROID` | — | — | AdMob App ID (Android). Required when `ADS_ENABLED=true`. |
| `MIN_APP_VERSION_SOFT` | — | — | Soft update gate — clients below see a non-blocking banner. |
| `MIN_APP_VERSION_HARD` | — | — | Hard update gate — clients below get HTTP 426. |
| `LATEST_APP_VERSION` | — | — | Current release, returned by `GET /api/v1/app-version`. |
| `APP_STORE_URL_IOS` | — | — | App Store URL for update prompts. |
| `APP_STORE_URL_ANDROID` | — | — | Play Store URL for update prompts. |
| `SENTRY_DSN` | — | — | Sentry DSN for backend errors. Shared with scraper-api via Compose. |

---

### scraper-api (`soulstep-scraper-api`)

| Variable | Mandatory | Default | Description |
|---|---|---|---|
| `CATALOG_API_KEY` | ✓ | — | Must match catalog-api's value. Required for sync and SEO trigger. |
| `MAIN_SERVER_URL` | ✓ | — | catalog-api URL. Compose: `http://catalog-api:3000`. Cloud Run Job: `https://catalog-api.soul-step.org`. |
| `SCRAPER_FOURSQUARE_API_KEY` | — | — | Foursquare key. Skipped gracefully when unset. |
| `SCRAPER_OUTSCRAPER_API_KEY` | — | — | Outscraper key for extended reviews. Skipped when unset. |
| `SCRAPER_BESTTIME_API_KEY` | — | — | BestTime.app key for busyness forecasts. Skipped when unset. |
| `SCRAPER_GEMINI_API_KEY` | — | — | Gemini key for LLM quality scoring. Falls back to heuristics. |
| `SCRAPER_ALLOWED_ORIGINS` | — | `http://localhost:5174,...` | CORS origins. Production: `https://admin.soul-step.org` |
| `SCRAPER_TIMEZONE` | — | `UTC` | Fallback IANA timezone when Google Maps omits a UTC offset. |
| `DATABASE_URL` | — | — | PostgreSQL DSN. Assembled by `docker-compose.prod.yml` — do not set directly. |
| `SCRAPER_POOL_SIZE` | — | `10` | Persistent PostgreSQL connections per process. |
| `SCRAPER_MAX_OVERFLOW` | — | `10` | Extra connections during bursts. |
| `LOG_LEVEL` | — | `INFO` | `DEBUG` \| `INFO` \| `WARNING` \| `ERROR` |
| `LOG_FORMAT` | — | `text` | `text` for local dev; `json` for Cloud Logging. |
| `SCRAPER_DISPATCH` | — | `local` | `local` — in-process. `cloud_run` — Cloud Run Job. **Set `cloud_run` in production.** |
| `CLOUD_RUN_JOB_NAME` | — | `soulstep-scraper-api-job` | Job name. Required when `SCRAPER_DISPATCH=cloud_run`. |
| `CLOUD_RUN_REGION` | — | `us-central1` | Fallback region. Required when `SCRAPER_DISPATCH=cloud_run`. |
| `CLOUD_RUN_REGIONS` | — | `europe-west1:3,europe-west4:5,europe-west2:5` | Multi-region config. Stored in GitHub runtime secrets and written into the VM `.env`. |
| `SCRAPER_CLOUD_RUN_DATABASE_URL` | — | — | Postgres DSN for the Cloud Run Job, using the VM's internal GCP IP (`10.132.0.2`). Passed as `DATABASE_URL` override when dispatching. Falls back to `DATABASE_URL` (docker-internal) when unset — only safe when `SCRAPER_DISPATCH=local`. |
| `GOOGLE_CLOUD_PROJECT` | — | — | GCP project ID. Required for Cloud Run Job dispatch. |
| `GCS_BUCKET_NAME` | — | — | GCS bucket for scraped images. Must match catalog-api's value. |
| `SCRAPER_DISCOVERY_CONCURRENCY` | — | `15` | Primary discovery throughput knob: max concurrent browser grid-cell navigations. |
| `SCRAPER_DETAIL_CONCURRENCY` | — | `8` | Max concurrent browser detail-fetch workers. Still capped by `MAPS_BROWSER_CONCURRENCY` when that override is explicitly set. |
| `SCRAPER_FAIL_FAST_MIN_ATTEMPTS` | — | `500` | Minimum detail-fetch attempts before the auto-pause fail-fast logic can trigger. Set very high values carefully: they delay interruption during systemic failures. |
| `SCRAPER_ENRICHMENT_CONCURRENCY` | — | `10` | Max places enriched in parallel. |
| `SCRAPER_MAX_PHOTOS` | — | `3` | Max photos stored per place. |
| `SCRAPER_MAX_REVIEWS` | — | `5` | Max reviews scraped per place. |
| `MAPS_BROWSER_POOL_SIZE` | — | _(defaults to `SCRAPER_DISCOVERY_CONCURRENCY` when unset)_ | Max Playwright contexts kept warm. Leave unset unless you need a separate override. |
| `MAPS_BROWSER_CONCURRENCY` | — | _(defaults to `SCRAPER_DISCOVERY_CONCURRENCY` when unset)_ | Active browser pool semaphore. Leave unset unless you need a separate override from discovery. |
| `MAPS_BROWSER_CELL_DELAY_MIN` | — | `1.0` | Minimum per-cell discovery delay in seconds. |
| `MAPS_BROWSER_CELL_DELAY_MAX` | — | `2.0` | Maximum per-cell discovery delay in seconds. |
| `SCRAPER_AUTO_SYNC_AFTER_RUN` | — | `false` | Auto-sync to catalog-api after enrichment. |
| `SCRAPER_TRIGGER_SEO_AFTER_SYNC` | — | `false` | Auto-call catalog-api SEO endpoint after sync. |

Recommended browser-only Cloud Run starting point for the current scraper job size (`6 GiB`, `4 vCPU`):
- `SCRAPER_DISCOVERY_CONCURRENCY=18`
- `SCRAPER_DETAIL_CONCURRENCY=12`
- `MAPS_BROWSER_POOL_SIZE=18`
- `MAPS_BROWSER_CONCURRENCY=18`
- `MAPS_BROWSER_CELL_DELAY_MIN=1.0`
- `MAPS_BROWSER_CELL_DELAY_MAX=2.0`

Treat those as optimistic starting values, not guarantees. Raise them one step at a time while watching Cloud Logging for RSS growth, Chromium crashes, acquire timeouts, and Google block-rate increases.

---

### Customer Web (`apps/soulstep-customer-web`)

All `NEXT_PUBLIC_*` vars are baked into the JS bundle at build time — visible to end users.
Never put secrets in `NEXT_PUBLIC_*` vars.

| Variable | Where set | Default | Description |
|---|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | Vercel dashboard | — | Catalog API public URL. Example: `https://catalog-api.soul-step.org` |
| `INTERNAL_API_URL` | Vercel dashboard | _(falls back to `NEXT_PUBLIC_API_BASE_URL`)_ | Server-only URL for SSR metadata fetches. Never use `NEXT_PUBLIC_` prefix. |
| `NEXT_PUBLIC_SENTRY_DSN` | Vercel dashboard | — | Sentry DSN for client-side error tracking. |
| `NEXT_PUBLIC_ADSENSE_PUBLISHER_ID` | Vercel dashboard | — | Google AdSense ID. Required when backend returns `ADS_ENABLED=true`. |
| `NEXT_PUBLIC_UMAMI_WEBSITE_ID` | Vercel dashboard | — | Umami analytics website ID. Must be set for tracking to work; `app/layout.tsx` only renders the `<Script>` tag when this is truthy, and the tracking hook gates every `track()` call on it being configured. |

---

### Admin Web (`apps/soulstep-admin-web`)

| Variable | Where set | Default | Description |
|---|---|---|---|
| `VITE_API_URL` | Vercel dashboard | _(relative)_ | Catalog API base URL. Example: `https://catalog-api.soul-step.org` |
| `VITE_SENTRY_DSN` | Vercel dashboard | — | Sentry DSN for client-side error tracking. |
| `VITE_FRONTEND_URL` | Vercel dashboard | `https://soul-step.org` | Customer web URL for place-preview links in the SEO admin page. |

---

### Mobile (`apps/soulstep-customer-mobile`)

All `EXPO_PUBLIC_*` vars are bundled at build time — visible in decompiled app bundles.

| Variable | Where set | Default | Description |
|---|---|---|---|
| `EXPO_PUBLIC_API_URL` | EAS secrets | `http://127.0.0.1:3000` | Backend API URL. Production: `https://catalog-api.soul-step.org` |
| `EXPO_PUBLIC_INVITE_LINK_BASE_URL` | EAS secrets | — | Base URL for group invite links. Example: `https://soul-step.org/invite` |
| `EXPO_PUBLIC_ADMOB_APP_ID_IOS` | EAS secrets | — | AdMob App ID for iOS. Required when AdMob is enabled. |
| `EXPO_PUBLIC_ADMOB_APP_ID_ANDROID` | EAS secrets | — | AdMob App ID for Android. Required when AdMob is enabled. |
| `EXPO_PUBLIC_UMAMI_WEBSITE_ID` | EAS secrets | — | Umami analytics website ID. |
| `EXPO_PUBLIC_SENTRY_DSN` | EAS secrets | — | Sentry DSN for mobile error tracking. |

---

## 12. VM Scheduled Jobs

Managed by `scripts/cron/soulstep-cron` (installed by `vm-bootstrap.sh`):

| Schedule | Script / Command | Description |
|---|---|---|
| `0 2 * * *` | `scripts/backup-db.sh` | bundle catalog DB + scraper DB → local `/opt/soulstep/backups/` + GCS upload |
| `0 3 * * *` | `docker compose exec catalog-api python -m app.jobs.sync_places` | Sync place data from scraper to catalog |
| `0 5 * * 1` | `docker compose exec catalog-api python -m app.jobs.cleanup_orphaned_images` | Delete GCS images with no corresponding DB record |
| `0 4 * * 0` | `docker compose exec catalog-api python -m app.jobs.backfill_timezones` | Backfill missing timezone fields on places |

Cron logs: `/var/log/soulstep-backup.log`, `/var/log/soulstep-sync.log`.

To add a job: edit `scripts/cron/soulstep-cron`, then run `crontab scripts/cron/soulstep-cron` on the VM.

---

## 13. Observability

### Docker logs

```bash
# SSH into VM
docker compose -f /opt/soulstep/docker-compose.prod.yml logs -f catalog-api
docker compose -f /opt/soulstep/docker-compose.prod.yml logs -f scraper-api
docker compose -f /opt/soulstep/docker-compose.prod.yml logs -f nginx

# Cron logs
tail -f /var/log/soulstep-backup.log
tail -f /var/log/soulstep-sync.log
```

### Container health

```bash
docker compose -f /opt/soulstep/docker-compose.prod.yml ps
docker stats --no-stream   # memory / CPU usage
```

### Cloud Ops Agent + Sentry

The VM runs the **Cloud Ops Agent** — forwards container stdout/stderr to Cloud Logging (GCP Console → Log Explorer, filter `resource.type="gce_instance"`).

**Sentry DSNs** — check dashboard after every deploy:

| Variable | Service |
|---|---|
| `SENTRY_DSN` | catalog-api + scraper-api |
| `NEXT_PUBLIC_SENTRY_DSN` | Customer web |
| `VITE_SENTRY_DSN` | Admin web |
| `EXPO_PUBLIC_SENTRY_DSN` | Mobile app |

---

## 14. Backups

Automated daily at **02:00 UTC** via `scripts/backup-db.sh`:
- bundle both DBs into `soulstep_YYYYMMDD_HHMMSS.tar.gz`
- Upload to `gs://soulstep-db-backups/`
- Keep 7 days of local copies in `/opt/soulstep/backups/`

```bash
# Manual backup
DEPLOY_DIR=/opt/soulstep /opt/soulstep/scripts/backup-db.sh

# Restore from local file
/opt/soulstep/scripts/restore-db.sh /opt/soulstep/backups/soulstep_20260419_020000.tar.gz --yes

# Restore from GCS
/opt/soulstep/scripts/restore-db.sh gs://soulstep-db-backups/soulstep_20260419_020000.tar.gz --yes
```

---

## 15. Rollback

```bash
# SSH into VM — roll back to a specific image SHA
cd /opt/soulstep
docker pull ghcr.io/hussu97/soulstep-catalog-api:<git-sha>
docker tag ghcr.io/hussu97/soulstep-catalog-api:<git-sha> ghcr.io/hussu97/soulstep-catalog-api:latest
docker compose -f docker-compose.prod.yml up -d --force-recreate catalog-api
# Repeat for soulstep-scraper-api if needed
```

**Database rollback:** restore from the backup taken before the deploy (§14).

**Vercel rollback:** Vercel dashboard → Deployments → **Promote** a prior build.

---

## 16. Cost Estimate

| Resource | Monthly |
|---|---|
| VM e2-micro (europe-west1) | ~$6.11 |
| 20 GB pd-ssd boot disk | ~$3.74 |
| GCS `soulstep-images` | ~$0.50 |
| GCS `soulstep-db-backups` (~1 GB rolling, 7-day retention) | ~$0.02 |
| GHCR (public packages) | $0 |
| Cloud Run scraper Job (pay per use, ~$0.40/job-hour) | ~$0–1 |
| Artifact Registry (3 regions × ~$0.50–1.00) | ~$1.50–3.00 |
| **Total** | **~$11.90–14.40/mo (~$0.40/day)** |

Cloud Run idle cost is $0 — jobs only bill during execution.
