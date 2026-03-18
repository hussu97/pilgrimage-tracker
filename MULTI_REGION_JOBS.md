# Multi-Region Scraper Job Deployment

This guide covers how to spread scraper Cloud Run Jobs across multiple GCP regions. Each region has its own independent quota (20,000 mCPU / 42.95 GiB), so multi-region deployment avoids exhausting a single region's limits.

---

## Architecture

```
                    Scraper API (europe-west1)
                    ┌──────────────────────┐
                    │  Queue Processor     │
                    │  (polls every 15s)   │
                    └──────┬───────────────┘
                           │
            ┌──────────────┼──────────────┐
            ▼              ▼              ▼
     europe-west1    europe-west4    europe-west2
     max 3 jobs      max 5 jobs     max 5 jobs
```

- **Only the scraper API service** runs in the primary region
- **Jobs can run in any configured region** — they connect to the primary Cloud SQL via cross-region auth proxy
- The **queue processor** tracks active jobs per region and dispatches new jobs to whichever region has capacity

---

## What stays in the primary region only

| Resource | Notes |
|---|---|
| Cloud SQL database | Accessible globally via Cloud SQL Auth Proxy |
| GCS bucket | Accessible globally; cross-region egress applies ($0.01/GB same-continent) |
| Secret Manager secrets | Global — no changes needed |
| Catalog API service | Primary region only |
| Scraper API service | Primary region only |

---

## Setup: Adding a New Region

### 1. Create Artifact Registry repository

```bash
gcloud artifacts repositories create soulstep \
  --repository-format=docker \
  --location=$NEW_REGION \
  --description="SoulStep container images ($NEW_REGION)"
```

### 2. Push the job image to the new region

```bash
PROJECT_ID=your-gcp-project-id
NEW_REGION=europe-west4  # region to add

# Authenticate Docker for both registries
gcloud auth configure-docker europe-west1-docker.pkg.dev --quiet
gcloud auth configure-docker $NEW_REGION-docker.pkg.dev --quiet

# Get latest image tag (commit SHA from CI)
TAG=$(gcloud artifacts docker tags list \
  europe-west1-docker.pkg.dev/$PROJECT_ID/soulstep/soulstep-scraper-api-job \
  --sort-by=~UPDATE_TIME --limit=1 --format='value(tag)' | awk -F: '{print $NF}')
echo "Using tag: $TAG"

# Pull from primary region, tag for new region, push
docker pull europe-west1-docker.pkg.dev/$PROJECT_ID/soulstep/soulstep-scraper-api-job:$TAG
docker tag \
  europe-west1-docker.pkg.dev/$PROJECT_ID/soulstep/soulstep-scraper-api-job:$TAG \
  $NEW_REGION-docker.pkg.dev/$PROJECT_ID/soulstep/soulstep-scraper-api-job:$TAG
docker push $NEW_REGION-docker.pkg.dev/$PROJECT_ID/soulstep/soulstep-scraper-api-job:$TAG
```

#### If the image doesn't exist yet (first-time build)

If CI hasn't deployed the scraper job image yet, build it locally first:

```bash
docker build --platform linux/amd64 \
  -f soulstep-scraper-api/Dockerfile.job \
  -t europe-west1-docker.pkg.dev/$PROJECT_ID/soulstep/soulstep-scraper-api-job:latest \
  ./soulstep-scraper-api
docker push europe-west1-docker.pkg.dev/$PROJECT_ID/soulstep/soulstep-scraper-api-job:latest

# Then tag and push to the new region
docker tag \
  europe-west1-docker.pkg.dev/$PROJECT_ID/soulstep/soulstep-scraper-api-job:latest \
  $NEW_REGION-docker.pkg.dev/$PROJECT_ID/soulstep/soulstep-scraper-api-job:latest
docker push $NEW_REGION-docker.pkg.dev/$PROJECT_ID/soulstep/soulstep-scraper-api-job:latest
```

Set `TAG=latest` for step 3 below.

> `TAG` is the git commit SHA used by CI (e.g. `83e6170...`). After initial setup,
> CI handles this automatically via `EXTRA_JOB_REGIONS` (step 7).

### 3. Create the Cloud Run Job

```bash
gcloud run jobs create soulstep-scraper-api-job \
  --region $NEW_REGION \
  --image "$NEW_REGION-docker.pkg.dev/$PROJECT_ID/soulstep/soulstep-scraper-api-job:$TAG" \
  --set-cloudsql-instances "$PROJECT_ID:europe-west1:soulstep-db" \
  --memory 6Gi --cpu 4 \
  --task-timeout 86400 --max-retries 1
```

### 4. Grant IAM permissions

The job's service account needs `roles/run.jobsExecutorWithOverrides` in the new region:

```bash
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:SA_EMAIL" \
  --role="roles/run.jobsExecutorWithOverrides"
```

### 5. Mount secrets

Secret Manager is global. Reference the same secret names when creating the job — no extra setup.

### 6. Update scraper API config

Set `CLOUD_RUN_REGIONS` on the scraper API service:

```bash
# Format: region1:max_jobs,region2:max_jobs,...
CLOUD_RUN_REGIONS=europe-west1:3,$NEW_REGION:5
```

### 7. Update GitHub Actions for auto-deploy

Set `EXTRA_JOB_REGIONS` in `.github/workflows/deploy.yml`:

```yaml
env:
  EXTRA_JOB_REGIONS: "europe-west4,europe-west2"
```

Or set it as a GitHub Actions secret/variable.

---

## Quota Budget (europe-west1 with services)

| Component | mCPU | Memory (GiB) |
|---|---|---|
| Catalog API (max 3) | 3,000 | 1.5 |
| Scraper API (max 2) | 2,000 | 1.0 |
| Reserved overhead | **5,000** | **2.5** |
| Available for jobs | **15,000** | **40.45** |
| **Max parallel jobs** | **3** (CPU-limited) | 6 (memory-limited) |

Extra regions (jobs only): **5 parallel jobs each** (20,000 mCPU / 4,000 per job = 5).

---

## Cost

### Per-job execution cost (4 vCPU / 6 GiB)

| Resource | Rate | Per hour |
|---|---|---|
| vCPU | $0.0000240/vCPU-s | $0.346 |
| Memory | $0.0000025/GiB-s | $0.054 |
| **Total per job-hour** | | **$0.40** |

### Fixed overhead per extra region (monthly)

| Item | Cost |
|---|---|
| Artifact Registry storage | $0.50-1.00 |
| Cross-region GCS egress (same continent) | $0.01/GB |
| Cloud Run idle | $0.00 |
| **Total fixed/month** | **~$1-2** |

### Recommended regions (cheapest)

| Region | GCS egress | DB latency |
|---|---|---|
| **europe-west4** (Netherlands) | $0.01/GB | +20-50ms |
| **europe-west2** (London) | $0.01/GB | +20-50ms |
| us-central1 (Iowa) | $0.08/GB | +100-200ms |
