# Production Deployment

SoulStep backends run on a **single GCP e2-micro VM** (europe-west1-d) with Docker Compose, served via nginx + Let's Encrypt. Web frontends deploy to **Vercel**. The Playwright scraper stays on **Cloud Run Jobs**.

Update this file whenever deployment-relevant changes are made: new env vars, new services, DB migrations, or build commands.

---

## Table of Contents

- [1. Prerequisites](#1-prerequisites)
- [2. Provision the VM](#2-provision-the-vm)
- [3. Bootstrap the VM](#3-bootstrap-the-vm)
- [4. GitHub Secrets Setup](#4-github-secrets-setup)
- [5. GHCR Package Visibility](#5-ghcr-package-visibility)
- [6. DNS](#6-dns)
- [7. TLS — Let's Encrypt](#7-tls--lets-encrypt)
- [8. Database Migration (Cloud SQL → VM)](#8-database-migration-cloud-sql--vm)
- [9. CI/CD](#9-cicd)
- [10. Deploy Web Frontends (Vercel)](#10-deploy-web-frontends-vercel)
- [11. Scraper Cloud Run Job](#11-scraper-cloud-run-job)
- [12. Mobile](#12-mobile)
- [13. SEO & Search Engines](#13-seo--search-engines)
- [14. Observability](#14-observability)
- [15. Backups](#15-backups)
- [16. Rollback](#16-rollback)
- [17. Cost Estimate](#17-cost-estimate)

---

## 1. Prerequisites

- **gcloud CLI** — `brew install google-cloud-sdk`
- **Docker** — local Docker for testing compose files
- **SSH key pair** — ed25519 key for VM deploy access

Log in:
```bash
gcloud auth login
gcloud config set project project-fa2d7f52-2bc4-4a46-8ae
```

---

## 2. Provision the VM

```bash
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
```

Firewall rules (allow HTTP + HTTPS):
```bash
gcloud compute firewall-rules create allow-http-https \
  --project=project-fa2d7f52-2bc4-4a46-8ae \
  --allow=tcp:80,tcp:443 \
  --target-tags=http-server,https-server
```

Get the VM's external IP (used in DNS and GitHub Secrets):
```bash
gcloud compute instances describe soulstep-vm \
  --zone=europe-west1-d \
  --format="value(networkInterfaces[0].accessConfigs[0].natIP)"
```

Grant the VM's default service account access to GCS (for image storage and DB backups):
```bash
PROJECT_NUMBER=$(gcloud projects describe project-fa2d7f52-2bc4-4a46-8ae --format="value(projectNumber)")
SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# Image bucket (catalog-api reads/writes place images)
gcloud storage buckets add-iam-policy-binding gs://soulstep-images \
  --member="serviceAccount:${SA}" \
  --role=roles/storage.objectAdmin

# Backup bucket (created once)
gcloud storage buckets create gs://soulstep-db-backups --location=europe-west1
gcloud storage buckets add-iam-policy-binding gs://soulstep-db-backups \
  --member="serviceAccount:${SA}" \
  --role=roles/storage.objectCreator
```

---

## 3. Bootstrap the VM

SSH into the VM and run the one-shot setup script:

```bash
gcloud compute ssh soulstep-vm --zone=europe-west1-d

# On the VM:
curl -fsSL https://raw.githubusercontent.com/hussu97/soulstep/main/scripts/vm-bootstrap.sh | bash
```

This script:
1. Installs Docker + Docker Compose
2. Installs gcloud CLI (for GCS backup uploads)
3. Clones the repo to `/opt/soulstep`
4. Creates `certbot/` and `backups/` directories
5. Starts Postgres
6. Installs the crontab (backup, sync, cleanup, backfill)

After bootstrap, copy `.env.example` to `/opt/soulstep/.env` and fill in all values:
```bash
cp /opt/soulstep/.env.example /opt/soulstep/.env
nano /opt/soulstep/.env   # fill in secrets
```

Add the deploy SSH public key to the deploy user's authorized_keys:
```bash
# Run on the VM — paste the public half of SERVER_SSH_KEY
echo "ssh-ed25519 AAAA... github-deploy" >> ~/.ssh/authorized_keys
```

---

## 4. GitHub Secrets Setup

Go to **GitHub → hussu97/soulstep → Settings → Environments → production** and add:

### VM Connection

| Secret | Value |
|---|---|
| `SERVER_HOST` | VM external IP (from §2) |
| `SERVER_USER` | VM deploy user (e.g. `hussainabbasi`) |
| `SERVER_SSH_KEY` | Ed25519 private key — public half added to VM's `~/.ssh/authorized_keys` |

### Runtime Secrets (written to `/opt/soulstep/.env` on every deploy)

| Secret | Description |
|---|---|
| `USE_SSL` | `false` initially; `true` after certs are issued |
| `POSTGRES_USER` | e.g. `soulstep` |
| `POSTGRES_PASSWORD` | Strong random password |
| `POSTGRES_DB` | catalog-api database name, e.g. `soulstep` |
| `SCRAPER_POSTGRES_DB` | scraper-api database name, e.g. `soulstep_scraper` (auto-created by `docker/postgres-init.sql`) |
| `JWT_SECRET` | `openssl rand -hex 32` |
| `CATALOG_API_KEY` | `openssl rand -hex 32` — shared between catalog + scraper |
| `GOOGLE_MAPS_API_KEY` | Google Places API key |
| `RESEND_API_KEY` | Resend.com key for emails |
| `RESEND_FROM_EMAIL` | `noreply@soul-step.org` |
| `CORS_ORIGINS` | `https://soul-step.org https://www.soul-step.org https://admin.soul-step.org` |
| `FRONTEND_URL` | `https://soul-step.org` |
| `RESET_URL_BASE` | `https://soul-step.org` |
| `GCS_BUCKET_NAME` | `soulstep-images` |
| `GOOGLE_CLOUD_PROJECT` | `project-fa2d7f52-2bc4-4a46-8ae` |
| `SENTRY_DSN` | Sentry DSN for error tracking (catalog-api + scraper-api) |
| `ADS_ENABLED` | `false` |
| `ADSENSE_PUBLISHER_ID` | AdSense publisher ID (when ads enabled) |
| `SCRAPER_GOOGLE_MAPS_API_KEY` | Google Maps key for scraper |
| `SCRAPER_GEMINI_API_KEY` | Gemini API key |
| `SCRAPER_FOURSQUARE_API_KEY` | Foursquare API key |
| `SCRAPER_ALLOWED_ORIGINS` | `https://admin.soul-step.org` |
| `SCRAPER_TIMEZONE` | `Asia/Dubai` |
| `CLOUD_RUN_REGIONS` | `europe-west1:3,europe-west4:5` |
| `BACKUP_GCS_BUCKET` | `soulstep-db-backups` |
| `LOG_LEVEL` | `INFO` |

### Existing Secrets (keep — used for Vercel + Cloud Run Job)

| Secret | Used by |
|---|---|
| `VERCEL_TOKEN` | Vercel deployments |
| `VERCEL_ORG_ID` | Vercel |
| `VERCEL_PROJECT_ID_WEB` | Customer web Vercel project |
| `VERCEL_PROJECT_ID_ADMIN` | Admin web Vercel project |

GCP auth for scraper-api Cloud Run Job continues to use **Workload Identity Federation** (keyless) — no JSON key secret needed.

---

## 5. GHCR Package Visibility

Docker images are pushed to GitHub Container Registry (GHCR). Cloud Run Jobs pull public GHCR images without authentication.

After the first CI run creates the packages, make them public:

1. Go to **GitHub → hussu97 → Packages**
2. Open `soulstep-catalog-api` → **Package settings** → **Change visibility** → **Public**
3. Repeat for `soulstep-scraper-api` and `soulstep-scraper-api-job`

---

## 6. DNS

Add these records at your DNS provider for `soul-step.org`:

| Type | Name | Value |
|---|---|---|
| A | `catalog-api` | VM external IP |
| A | `scraper-api` | VM external IP |

The apex / `www` / `admin` records point to Vercel (unchanged).

Wait for DNS propagation (`dig catalog-api.soul-step.org` shows VM IP) before issuing TLS certs.

---

## 7. TLS — Let's Encrypt

With nginx running in HTTP-only mode (`USE_SSL=false`) and DNS pointing at the VM:

```bash
# SSH into the VM
cd /opt/soulstep

# Issue cert for both subdomains (one SAN cert)
docker compose -f docker-compose.prod.yml run --rm --entrypoint "" certbot \
  certbot certonly --webroot -w /var/www/certbot \
  -d catalog-api.soul-step.org -d scraper-api.soul-step.org \
  --email admin@soul-step.org --agree-tos --no-eff-email
```

Then enable HTTPS:
```bash
# Update .env on VM
sed -i 's/USE_SSL=false/USE_SSL=true/' /opt/soulstep/.env

# Also update GitHub Secret USE_SSL → true
# Then reload nginx
docker compose -f docker-compose.prod.yml up -d --force-recreate nginx
```

Certs auto-renew every 12 h via the certbot container.

---

## 8. Database Migration (Cloud SQL → VM)

Only needed once during the initial cutover. The database is small (~810 MB).

```bash
# 1. Export from Cloud SQL
gcloud sql export sql soulstep-db gs://soulstep-db-backups/migration_$(date +%Y%m%d).sql.gz \
  --database=soulstep \
  --project=project-fa2d7f52-2bc4-4a46-8ae

# 2. On the VM — download and restore
gsutil cp gs://soulstep-db-backups/migration_YYYYMMDD.sql.gz /tmp/
gunzip -c /tmp/migration_YYYYMMDD.sql.gz | \
  docker compose -f /opt/soulstep/docker-compose.prod.yml \
  exec -T postgres psql -U soulstep soulstep

# 3. Smoke test (before DNS cutover)
curl --resolve catalog-api.soul-step.org:443:<VM_IP> https://catalog-api.soul-step.org/health
curl --resolve catalog-api.soul-step.org:443:<VM_IP> https://catalog-api.soul-step.org/api/v1/places?page_size=1

# 4. Update DNS A records (api + scraper → VM IP)
# 5. Keep Cloud SQL running for 48 h as fallback, then delete
```

---

## 9. CI/CD

### VM deploy workflow (`.github/workflows/deploy-vm.yml`)

Triggered on `Tests` workflow success on `main`. Runs four jobs:

| Job | Triggers when | Action |
|---|---|---|
| `build-catalog-api` | `soulstep-catalog-api/` changed | Build + push to `ghcr.io/hussu97/soulstep-catalog-api`, Trivy scan |
| `build-scraper-api` | `soulstep-scraper-api/` changed | Build lean image + job image (Playwright), push both to GHCR, Trivy scan |
| `deploy-vm` | Either service changed | SSH → write `.env` → `git pull` → `docker compose pull` → `docker compose up --force-recreate` → health check → nginx reload |
| `deploy-scraper-job` | Scraper changed | Update `soulstep-scraper-api-job` Cloud Run Job in 3 regions (WIF auth) |

### Deploy sequence on the VM

```
git pull origin main
docker compose -f docker-compose.prod.yml pull catalog-api scraper-api
docker compose -f docker-compose.prod.yml up -d --force-recreate catalog-api scraper-api
# catalog-api startup runs alembic migrations automatically (lifespan hook)
# health check loop (30 × 5s)
docker compose -f docker-compose.prod.yml up -d --no-deps nginx
docker image prune -f
```

### Vercel web deploy (`.github/workflows/deploy.yml`)

Unchanged — still deploys `apps/soulstep-customer-web` and `apps/soulstep-admin-web` to Vercel on changes.

### GCP Workload Identity Federation (for scraper Cloud Run Job)

The deploy-vm.yml continues to authenticate to GCP keylessly via WIF for the Cloud Run Job deploy step:
- Pool: `github-pool`
- Provider: `github-provider`
- Service account: `github-deploy@project-fa2d7f52-2bc4-4a46-8ae.iam.gserviceaccount.com`

---

## 10. Deploy Web Frontends (Vercel)

Both web apps deploy to Vercel automatically via `.github/workflows/deploy.yml`. No changes from previous setup.

**Environment variables to set in Vercel dashboard:**

| App | Variable | Value |
|---|---|---|
| Customer web | `NEXT_PUBLIC_API_BASE_URL` | `https://catalog-api.soul-step.org` |
| Customer web | `INTERNAL_API_URL` | `https://catalog-api.soul-step.org` |
| Admin web | `VITE_API_BASE_URL` | `https://catalog-api.soul-step.org` |

---

## 11. Scraper Cloud Run Job

The Playwright-based browser scraper (`soulstep-scraper-api-job`) continues to run on Cloud Run. It is:
- Triggered from the admin web UI
- Built automatically by `deploy-vm.yml` when `soulstep-scraper-api/` changes
- Image: `ghcr.io/hussu97/soulstep-scraper-api-job:latest` (public GHCR)
- Deployed to 3 regions: `europe-west1`, `europe-west4`, `europe-west2`
- Resources: 6 GB RAM, 4 vCPU, 24 h task timeout

The scraper job calls `https://catalog-api.soul-step.org` (the VM) to sync scraped places into the catalog via `CATALOG_API_KEY`.

See [MULTI_REGION_JOBS.md](MULTI_REGION_JOBS.md) for multi-region capacity configuration.

---

## 12. Mobile

No change. Expo / React Native app distributed via EAS Build and app stores.

**EAS secrets:** Update `EXPO_PUBLIC_API_BASE_URL` → `https://catalog-api.soul-step.org` if not already set.

---

## 13. SEO & Search Engines

After cutover, resubmit sitemaps:

1. **Google Search Console** → Sitemaps → `https://catalog-api.soul-step.org/sitemap.xml`
2. **Bing Webmaster Tools** → Sitemap → same URL
3. **Verify** `https://catalog-api.soul-step.org/robots.txt` and `https://catalog-api.soul-step.org/llms.txt` are accessible

---

## 14. Observability

### Logs

```bash
# SSH into VM
docker compose -f /opt/soulstep/docker-compose.prod.yml logs -f catalog-api
docker compose -f /opt/soulstep/docker-compose.prod.yml logs -f scraper-api
docker compose -f /opt/soulstep/docker-compose.prod.yml logs -f nginx

# Cron job logs
tail -f /var/log/soulstep-backup.log
tail -f /var/log/soulstep-sync.log
```

### Container health

```bash
docker compose -f /opt/soulstep/docker-compose.prod.yml ps
docker stats --no-stream   # memory usage
```

### Error tracking

Sentry receives all unhandled exceptions via `SENTRY_DSN` (backend) and `NEXT_PUBLIC_SENTRY_DSN` / `VITE_SENTRY_DSN` / `EXPO_PUBLIC_SENTRY_DSN` (frontends). Check the Sentry dashboard after deploys.

---

## 15. Backups

Automated daily backup (02:00 UTC) via `scripts/backup-db.sh`:
- Dumps Postgres → `soulstep_YYYYMMDD_HHMMSS.sql.gz`
- Uploads to `gs://soulstep-db-backups/`
- Keeps 7 days of local copies in `/opt/soulstep/backups/`

Manual backup:
```bash
DEPLOY_DIR=/opt/soulstep /opt/soulstep/scripts/backup-db.sh
```

Restore from backup:
```bash
# Local file
/opt/soulstep/scripts/restore-db.sh /opt/soulstep/backups/soulstep_20260419_020000.sql.gz

# From GCS
/opt/soulstep/scripts/restore-db.sh soulstep_20260419_020000.sql.gz --from-gcs
```

---

## 16. Rollback

To roll back to a previous image:

```bash
# SSH into VM
cd /opt/soulstep

# Pull a specific SHA tag
docker pull ghcr.io/hussu97/soulstep-catalog-api:<git-sha>
docker tag ghcr.io/hussu97/soulstep-catalog-api:<git-sha> \
           ghcr.io/hussu97/soulstep-catalog-api:latest

docker compose -f docker-compose.prod.yml up -d --force-recreate catalog-api
```

For database rollback: restore from the backup taken before the problematic deploy (see §15).

---

## 17. Cost Estimate

| Resource | Monthly |
|---|---|
| VM e2-micro (europe-west1) | ~$6.11 |
| 20 GB pd-ssd | ~$3.74 |
| GCS `soulstep-images` | ~$0.50 |
| GCS `soulstep-db-backups` (~1 GB rolling) | ~$0.02 |
| GHCR (public packages) | $0 |
| Cloud Run scraper Job (pay per run) | ~$0–1 |
| **Total** | **~$10.40–11.40/mo (~$0.35/day)** |
