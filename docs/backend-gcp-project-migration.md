# Backend GCP Project Migration

This runbook migrates **backend-only** SoulStep infrastructure from one GCP account/project into a **new GCP account with a new project**. Frontend hosting stays on Vercel and does not move.

The target backend footprint is unchanged:

- `catalog-api` + `scraper-api` on one GCE VM via Docker Compose
- PostgreSQL 15 on that VM
- Cloud Run Job for the Playwright scraper
- GCS image bucket
- GCS backup bucket
- GitHub Actions deploys via Workload Identity Federation

---

## 1. What Is Project-Bound Today

These are the backend pieces tied to the current GCP project and therefore must move together:

| Area | What moves |
|---|---|
| Compute | VM, static external IP, reserved internal IP `10.132.0.2`, firewall rule |
| Database | catalog Postgres DB + scraper Postgres DB |
| Storage | image bucket + backup bucket |
| Serverless | Cloud Run Job(s) in `europe-west*` |
| CI/CD | GitHub Actions WIF provider, deploy service account, Artifact Registry repo |
| Runtime config | `GOOGLE_CLOUD_PROJECT`, `GCS_BUCKET_NAME`, `BACKUP_GCS_BUCKET`, Cloud Run job metadata |

The repo now includes migration helpers for the move:

- `scripts/gcp-bootstrap-backend-project.sh`
- `scripts/gcs-rsync-buckets.sh`
- `scripts/rewrite-gcs-urls.sh`
- `scripts/backup-db.sh` and `scripts/restore-db.sh` now handle **both** backend databases as one bundle

---

## 2. Important Migration Constraints

### GCS bucket names cannot be renamed

You will almost certainly use a **different** image bucket name in the new project.

### Image URLs are stored in the databases

The backend persists absolute `https://storage.googleapis.com/<bucket>/...` URLs in multiple places:

- catalog DB:
  - `placeimage.gcs_url`
  - `reviewimage.gcs_url`
  - `groupcoverimage.gcs_url`
  - `review.photo_urls`
  - `group.cover_image_url`
  - `blog_post.cover_image_url`
- scraper DB:
  - `scrapedplace.raw_data.image_urls`
  - `scrapedplace.raw_data.external_reviews[*].photo_urls`

If the bucket name changes, you **must** run `scripts/rewrite-gcs-urls.sh` after restoring the databases into the new project.

### The VM internal IP matters

`docker-compose.prod.yml` still assumes the VM internal VPC IP is `10.132.0.2` for:

- `SCRAPER_CLOUD_RUN_DATABASE_URL`
- `BROWSER_PROXY_LIST` default tinyproxy path

For the smoothest migration, create the new VM with:

- a reserved internal IP of `10.132.0.2`
- a reserved static external IP

---

## 3. Migration Strategy

Use a two-pass cutover:

1. Build the new project and VM first.
2. Do an **initial bucket sync** and **initial DB restore** while the old project is still serving traffic.
3. Validate the new stack privately.
4. During a short maintenance window:
   - stop writes on the old backend
   - take a final DB backup
   - run a final bucket sync
   - restore the final DB bundle
   - rewrite URLs if the bucket changed
   - switch DNS for `catalog-api.soul-step.org` and `scraper-api.soul-step.org`

This keeps downtime limited to the final backup/restore/DNS cutover window.

---

## 4. Inputs You Need Before Starting

Pick these values up front:

```bash
export OLD_PROJECT_ID="project-fa2d7f52-2bc4-4a46-8ae"
export NEW_PROJECT_ID="your-new-project-id"
export NEW_PROJECT_NAME="SoulStep Backend 2"
export REGION="europe-west1"
export ZONE="europe-west1-b"

export OLD_IMAGE_BUCKET="soulstep-images"
export OLD_BACKUP_BUCKET="soulstep-db-backups"
export NEW_IMAGE_BUCKET="${NEW_PROJECT_ID}-soulstep-images"
export NEW_BACKUP_BUCKET="${NEW_PROJECT_ID}-soulstep-db-backups"

export VM_NAME="soulstep-vm"
export VM_INTERNAL_IP="10.132.0.2"
export CLOUD_RUN_JOB_NAME="soulstep-scraper-api-job"
```

You also need:

- a billing account in the new GCP account
- access to update GitHub `production` environment variables/secrets
- access to update DNS A records for `catalog-api.soul-step.org` and `scraper-api.soul-step.org`

---

## 5. Create the New GCP Project

### 5.1 Create project and attach billing

```bash
gcloud auth login
gcloud projects create "$NEW_PROJECT_ID" --name="$NEW_PROJECT_NAME"

gcloud billing accounts list
export BILLING_ACCOUNT_ID="XXXXXX-XXXXXX-XXXXXX"

gcloud billing projects link "$NEW_PROJECT_ID" \
  --billing-account="$BILLING_ACCOUNT_ID"
```

### 5.2 Bootstrap backend resources

Run the project bootstrap helper from the repo root:

```bash
./scripts/gcp-bootstrap-backend-project.sh \
  --project-id "$NEW_PROJECT_ID" \
  --region "$REGION" \
  --image-bucket "$NEW_IMAGE_BUCKET" \
  --backup-bucket "$NEW_BACKUP_BUCKET" \
  --cloud-run-job-name "$CLOUD_RUN_JOB_NAME"
```

This creates or ensures:

- required GCP APIs
- Artifact Registry repo
- image bucket
- backup bucket
- GitHub deploy service account
- GitHub Actions Workload Identity pool/provider
- IAM bindings for deploys and runtime access

---

## 6. Create the New VM

### 6.1 Reserve a static external IP

```bash
gcloud config set project "$NEW_PROJECT_ID"

gcloud compute addresses create soulstep-vm-ip \
  --region="$REGION"

export VM_EXTERNAL_IP="$(
  gcloud compute addresses describe soulstep-vm-ip \
    --region="$REGION" \
    --format='value(address)'
)"
```

### 6.2 Create the VM with the reserved internal IP

```bash
gcloud compute instances create "$VM_NAME" \
  --project="$NEW_PROJECT_ID" \
  --zone="$ZONE" \
  --machine-type=e2-micro \
  --image-family=debian-12 \
  --image-project=debian-cloud \
  --boot-disk-size=20GB \
  --boot-disk-type=pd-ssd \
  --tags=http-server,https-server \
  --scopes=cloud-platform \
  --private-network-ip="$VM_INTERNAL_IP" \
  --address="$VM_EXTERNAL_IP"
```

### 6.3 Ensure HTTP/HTTPS firewall rule exists

```bash
gcloud compute firewall-rules describe allow-http-https >/dev/null 2>&1 || \
gcloud compute firewall-rules create allow-http-https \
  --project="$NEW_PROJECT_ID" \
  --allow=tcp:80,tcp:443 \
  --target-tags=http-server,https-server
```

### 6.4 Bootstrap the VM

```bash
gcloud compute ssh "$VM_NAME" --project="$NEW_PROJECT_ID" --zone="$ZONE"
```

Then on the VM:

```bash
curl -fsSL https://raw.githubusercontent.com/hussu97/pilgrimage-tracker/main/scripts/vm-bootstrap.sh | bash
```

This installs:

- Docker
- Cloud Ops Agent
- gcloud CLI
- tinyproxy
- the repo in `/opt/soulstep`
- cron entries

---

## 7. Update GitHub Actions Config

### 7.1 Production environment variables

In **GitHub → Settings → Environments → production**, set these environment variables:

| Variable | Value |
|---|---|
| `GCP_PROJECT_ID` | new project ID |
| `GCP_REGION` | `europe-west1` |
| `GCP_ARTIFACT_REGISTRY_HOST` | `europe-west1-docker.pkg.dev` |
| `GCP_ARTIFACT_REGISTRY_REPO` | `soulstep` |
| `GCP_DEPLOY_SERVICE_ACCOUNT` | deploy SA email from bootstrap script |
| `GCP_WIF_PROVIDER` | full provider resource from bootstrap script |
| `CLOUD_RUN_JOB_NAME` | `soulstep-scraper-api-job` |
| `CLOUD_RUN_EXTRA_JOB_REGIONS` | `europe-west4,europe-west2` |

### 7.2 Production environment secrets

Update these existing secrets for the new backend project:

| Secret | Value |
|---|---|
| `SERVER_HOST` | new VM external IP |
| `SERVER_USER` | VM SSH user |
| `SERVER_SSH_KEY` | private key whose public key is on the new VM |
| `GOOGLE_CLOUD_PROJECT` | new project ID |
| `GCS_BUCKET_NAME` | new image bucket |
| `BACKUP_GCS_BUCKET` | new backup bucket |
| `CLOUD_RUN_CATALOG_URL` | `http://<NEW_VM_EXTERNAL_IP>:3000` |
| `CLOUD_RUN_REGIONS` | `europe-west1:3,europe-west4:5,europe-west2:5` |

All other runtime secrets stay the same unless you intentionally rotate them.

---

## 8. Pre-Copy the Image Bucket

Run an initial copy before downtime:

```bash
./scripts/gcs-rsync-buckets.sh \
  --source-bucket "$OLD_IMAGE_BUCKET" \
  --target-bucket "$NEW_IMAGE_BUCKET"
```

This can be repeated safely. Do it again during final cutover to capture the delta.

---

## 9. Take the First Dual-DB Backup

Run this on the **old VM** after pulling the commit that contains the new scripts:

```bash
cd /opt/soulstep
git pull origin main
./scripts/backup-db.sh
```

The script now produces a tarball that contains:

- `catalog.sql.gz`
- `scraper.sql.gz`
- `manifest.env`

Find the newest bundle:

```bash
ls -1t /opt/soulstep/backups/soulstep_*.tar.gz | head -n 1
```

If you want the bundle in the new backup bucket, copy it directly:

```bash
export LATEST_BACKUP="$(
  gcloud storage ls gs://${OLD_BACKUP_BUCKET}/soulstep_*.tar.gz | sort | tail -n1
)"
gcloud storage cp "$LATEST_BACKUP" "gs://${NEW_BACKUP_BUCKET}/"
```

If cross-project copy is inconvenient, use `gcloud compute scp` or download locally and upload manually.

---

## 10. Restore on the New VM

SSH into the **new VM**:

```bash
gcloud compute ssh "$VM_NAME" --project="$NEW_PROJECT_ID" --zone="$ZONE"
```

On the VM:

```bash
cd /opt/soulstep
git pull origin main

LATEST_NEW_BUNDLE="$(gcloud storage ls gs://${NEW_BACKUP_BUCKET}/soulstep_*.tar.gz | sort | tail -n1)"
DEPLOY_DIR=/opt/soulstep ./scripts/restore-db.sh "$LATEST_NEW_BUNDLE" --yes
```

This drops and recreates:

- `POSTGRES_DB`
- `SCRAPER_POSTGRES_DB`

and restores both from the bundle.

---

## 11. Rewrite Persisted Bucket URLs

If `NEW_IMAGE_BUCKET` differs from `OLD_IMAGE_BUCKET`, run:

```bash
cd /opt/soulstep

DEPLOY_DIR=/opt/soulstep ./scripts/rewrite-gcs-urls.sh \
  --old-bucket "$OLD_IMAGE_BUCKET" \
  --new-bucket "$NEW_IMAGE_BUCKET" \
  --dry-run

DEPLOY_DIR=/opt/soulstep ./scripts/rewrite-gcs-urls.sh \
  --old-bucket "$OLD_IMAGE_BUCKET" \
  --new-bucket "$NEW_IMAGE_BUCKET" \
  --yes
```

Do not skip this. Without it, existing places, reviews, and group images will still point at the old project’s bucket.

---

## 12. First Deploy Into the New Project

Once GitHub variables/secrets are updated, trigger a backend deploy:

```bash
git commit --allow-empty -m "chore: trigger backend deploy"
git push origin main
```

Or run the workflows manually if preferred.

After deploy, verify on the new VM:

```bash
docker compose -f /opt/soulstep/docker-compose.prod.yml ps
curl -s http://127.0.0.1:3000/health
curl -s http://127.0.0.1:8080/health
```

Also verify the Cloud Run job exists in all intended regions:

```bash
for region in europe-west1 europe-west4 europe-west2; do
  gcloud run jobs describe "$CLOUD_RUN_JOB_NAME" \
    --project="$NEW_PROJECT_ID" \
    --region="$region" \
    --format="value(name)" || true
done
```

---

## 13. Final Cutover

### 13.1 Freeze the old backend

During the maintenance window, stop writes on the old VM:

```bash
ssh <OLD_VM_USER>@<OLD_VM_HOST> '
  cd /opt/soulstep &&
  docker compose -f docker-compose.prod.yml stop catalog-api scraper-api
'
```

### 13.2 Run the final bucket sync

```bash
./scripts/gcs-rsync-buckets.sh \
  --source-bucket "$OLD_IMAGE_BUCKET" \
  --target-bucket "$NEW_IMAGE_BUCKET"
```

### 13.3 Run the final DB backup

On the old VM:

```bash
cd /opt/soulstep
./scripts/backup-db.sh
```

Copy the newest bundle into the new backup bucket again, then restore it on the new VM:

```bash
cd /opt/soulstep
LATEST_NEW_BUNDLE="$(gcloud storage ls gs://${NEW_BACKUP_BUCKET}/soulstep_*.tar.gz | sort | tail -n1)"
DEPLOY_DIR=/opt/soulstep ./scripts/restore-db.sh "$LATEST_NEW_BUNDLE" --yes
```

If the bucket name changed, rerun the URL rewrite script after the final restore.

### 13.4 Point backend DNS to the new VM

Update these A records to the **new** VM external IP:

- `catalog-api.soul-step.org`
- `scraper-api.soul-step.org`

### 13.5 Re-issue TLS certs on the new VM

On the new VM:

```bash
cd /opt/soulstep

docker compose -f docker-compose.prod.yml run --rm --entrypoint "" certbot \
  certbot certonly --webroot -w /var/www/certbot \
  -d catalog-api.soul-step.org -d scraper-api.soul-step.org \
  --email admin@soul-step.org --agree-tos --no-eff-email
```

Then set `USE_SSL=true` in GitHub `production` secrets and redeploy, or edit `/opt/soulstep/.env` and recreate nginx:

```bash
sed -i 's/^USE_SSL=.*/USE_SSL=true/' /opt/soulstep/.env
docker compose -f docker-compose.prod.yml up -d --force-recreate nginx
```

---

## 14. Verification Checklist

Run these checks after cutover:

### Backend health

```bash
curl -s https://catalog-api.soul-step.org/health
curl -s https://scraper-api.soul-step.org/health
```

### Bucket object visibility

Pick a known object from the new bucket:

```bash
gcloud storage ls "gs://${NEW_IMAGE_BUCKET}/images/places/**" | head
curl -I "https://storage.googleapis.com/${NEW_IMAGE_BUCKET}/<known-object>"
```

### Cloud Run job execution

```bash
gcloud run jobs execute "$CLOUD_RUN_JOB_NAME" \
  --project="$NEW_PROJECT_ID" \
  --region="$REGION"
```

Then inspect:

```bash
gcloud run jobs executions list \
  --project="$NEW_PROJECT_ID" \
  --region="$REGION" \
  --job="$CLOUD_RUN_JOB_NAME"
```

### Runtime path from scraper-api to Cloud Run

From the admin UI or scraper API, create a small run and confirm:

- a new Cloud Run execution resource is written onto the scraper run
- resume/cancel works
- image downloads land in the new bucket

### DB sanity

On the new VM:

```bash
docker compose -f /opt/soulstep/docker-compose.prod.yml exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT COUNT(*) FROM place;"

docker compose -f /opt/soulstep/docker-compose.prod.yml exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$SCRAPER_POSTGRES_DB" -c "SELECT COUNT(*) FROM scrapedplace;"
```

---

## 15. Rollback

If the new project fails verification:

1. Point backend DNS A records back to the old VM external IP.
2. Restart services on the old VM:
   ```bash
   cd /opt/soulstep
   docker compose -f docker-compose.prod.yml up -d catalog-api scraper-api nginx
   ```
3. Revert GitHub `production` environment variables/secrets to the old project values.
4. Investigate and retry the migration later.

Do not delete the old project until the new one has been stable in production for at least one full scraper cycle plus one successful backup cycle.
