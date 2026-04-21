#!/usr/bin/env bash
# Bootstrap the backend-only GCP resources SoulStep needs in a fresh project.
set -euo pipefail

PROJECT_ID=""
REGION="europe-west1"
ARTIFACT_REPO="soulstep"
IMAGE_BUCKET=""
BACKUP_BUCKET=""
SERVICE_ACCOUNT_NAME="github-deploy"
WIF_POOL="github-pool"
WIF_PROVIDER="github-provider"
GITHUB_REPOSITORY="hussu97/pilgrimage-tracker"
CLOUD_RUN_JOB_NAME="soulstep-scraper-api-job"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/gcp-bootstrap-backend-project.sh --project-id <project-id> [options]

Options:
  --region <region>                 Default: europe-west1
  --artifact-repo <name>            Default: soulstep
  --image-bucket <bucket-name>      Default: <project-id>-soulstep-images
  --backup-bucket <bucket-name>     Default: <project-id>-soulstep-db-backups
  --service-account <name>          Default: github-deploy
  --wif-pool <name>                 Default: github-pool
  --wif-provider <name>             Default: github-provider
  --github-repository <owner/repo>  Default: hussu97/pilgrimage-tracker
  --cloud-run-job-name <name>       Default: soulstep-scraper-api-job
  -h, --help

This script assumes:
  1. the GCP project already exists
  2. billing is already linked
  3. you are authenticated with gcloud
EOF
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command not found: $1" >&2
    exit 1
  fi
}

project_has_role() {
  local member="$1"
  local role="$2"
  gcloud projects get-iam-policy "$PROJECT_ID" \
    --flatten="bindings[].members" \
    --filter="bindings.members:${member} AND bindings.role:${role}" \
    --format="value(bindings.role)" \
    | grep -qx "$role"
}

grant_project_role() {
  local member="$1"
  local role="$2"
  if project_has_role "$member" "$role"; then
    echo "[bootstrap] Project binding already present: $member -> $role"
    return
  fi
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="$member" \
    --role="$role" \
    --quiet >/dev/null
}

bucket_has_role() {
  local bucket="$1"
  local member="$2"
  local role="$3"
  gcloud storage buckets get-iam-policy "gs://$bucket" \
    --flatten="bindings[].members" \
    --filter="bindings.members:${member} AND bindings.role:${role}" \
    --format="value(bindings.role)" \
    | grep -qx "$role"
}

grant_bucket_role() {
  local bucket="$1"
  local member="$2"
  local role="$3"
  if bucket_has_role "$bucket" "$member" "$role"; then
    echo "[bootstrap] Bucket binding already present: gs://$bucket $member -> $role"
    return
  fi
  gcloud storage buckets add-iam-policy-binding "gs://$bucket" \
    --member="$member" \
    --role="$role" >/dev/null
}

while [ $# -gt 0 ]; do
  case "$1" in
    --project-id)
      PROJECT_ID="${2:-}"
      shift 2
      ;;
    --region)
      REGION="${2:-}"
      shift 2
      ;;
    --artifact-repo)
      ARTIFACT_REPO="${2:-}"
      shift 2
      ;;
    --image-bucket)
      IMAGE_BUCKET="${2:-}"
      shift 2
      ;;
    --backup-bucket)
      BACKUP_BUCKET="${2:-}"
      shift 2
      ;;
    --service-account)
      SERVICE_ACCOUNT_NAME="${2:-}"
      shift 2
      ;;
    --wif-pool)
      WIF_POOL="${2:-}"
      shift 2
      ;;
    --wif-provider)
      WIF_PROVIDER="${2:-}"
      shift 2
      ;;
    --github-repository)
      GITHUB_REPOSITORY="${2:-}"
      shift 2
      ;;
    --cloud-run-job-name)
      CLOUD_RUN_JOB_NAME="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [ -z "$PROJECT_ID" ]; then
  usage
  exit 1
fi

require_cmd gcloud

IMAGE_BUCKET="${IMAGE_BUCKET:-${PROJECT_ID}-soulstep-images}"
BACKUP_BUCKET="${BACKUP_BUCKET:-${PROJECT_ID}-soulstep-db-backups}"

echo "[bootstrap] Using project: $PROJECT_ID"
gcloud config set project "$PROJECT_ID" >/dev/null

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
if [ -z "$PROJECT_NUMBER" ]; then
  echo "Could not resolve project number for $PROJECT_ID" >&2
  exit 1
fi

DEPLOY_SA_EMAIL="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
COMPUTE_SA_EMAIL="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
WIF_PROVIDER_RESOURCE="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL}/providers/${WIF_PROVIDER}"
REPO_PRINCIPAL="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL}/attribute.repository/${GITHUB_REPOSITORY}"

echo "[bootstrap] Enabling required APIs"
gcloud services enable \
  artifactregistry.googleapis.com \
  compute.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  run.googleapis.com \
  serviceusage.googleapis.com \
  sts.googleapis.com \
  storage.googleapis.com \
  --project "$PROJECT_ID" >/dev/null

echo "[bootstrap] Ensuring Artifact Registry repository exists"
gcloud artifacts repositories describe "$ARTIFACT_REPO" \
  --location="$REGION" >/dev/null 2>&1 \
  || gcloud artifacts repositories create "$ARTIFACT_REPO" \
    --repository-format=docker \
    --location="$REGION" \
    --description="SoulStep backend images" \
    --quiet >/dev/null

echo "[bootstrap] Ensuring GCS buckets exist"
gcloud storage buckets describe "gs://$IMAGE_BUCKET" >/dev/null 2>&1 \
  || gcloud storage buckets create "gs://$IMAGE_BUCKET" \
    --location="$REGION" \
    --uniform-bucket-level-access >/dev/null

gcloud storage buckets describe "gs://$BACKUP_BUCKET" >/dev/null 2>&1 \
  || gcloud storage buckets create "gs://$BACKUP_BUCKET" \
    --location="$REGION" \
    --uniform-bucket-level-access >/dev/null

echo "[bootstrap] Ensuring deploy service account exists"
gcloud iam service-accounts describe "$DEPLOY_SA_EMAIL" >/dev/null 2>&1 \
  || gcloud iam service-accounts create "$SERVICE_ACCOUNT_NAME" \
    --display-name="SoulStep GitHub deploy" >/dev/null

echo "[bootstrap] Ensuring Workload Identity pool/provider exist"
gcloud iam workload-identity-pools describe "$WIF_POOL" \
  --location=global >/dev/null 2>&1 \
  || gcloud iam workload-identity-pools create "$WIF_POOL" \
    --location=global \
    --display-name="GitHub Actions deploys" >/dev/null

gcloud iam workload-identity-pools providers describe "$WIF_PROVIDER" \
  --location=global \
  --workload-identity-pool="$WIF_POOL" >/dev/null 2>&1 \
  || gcloud iam workload-identity-pools providers create-oidc "$WIF_PROVIDER" \
    --location=global \
    --workload-identity-pool="$WIF_POOL" \
    --display-name="GitHub Actions OIDC" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
    --attribute-condition="assertion.repository=='${GITHUB_REPOSITORY}'" >/dev/null

echo "[bootstrap] Granting deploy-time project roles"
grant_project_role "serviceAccount:${DEPLOY_SA_EMAIL}" "roles/artifactregistry.writer"
grant_project_role "serviceAccount:${DEPLOY_SA_EMAIL}" "roles/compute.networkUser"
grant_project_role "serviceAccount:${DEPLOY_SA_EMAIL}" "roles/run.admin"

echo "[bootstrap] Granting VM/runtime project roles"
grant_project_role "serviceAccount:${COMPUTE_SA_EMAIL}" "roles/run.admin"

echo "[bootstrap] Granting bucket access"
grant_bucket_role "$IMAGE_BUCKET" "serviceAccount:${COMPUTE_SA_EMAIL}" "roles/storage.objectAdmin"
grant_bucket_role "$BACKUP_BUCKET" "serviceAccount:${COMPUTE_SA_EMAIL}" "roles/storage.objectAdmin"

echo "[bootstrap] Granting GitHub repository access to the deploy service account"
gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA_EMAIL" \
  --member="$REPO_PRINCIPAL" \
  --role="roles/iam.workloadIdentityUser" >/dev/null
gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA_EMAIL" \
  --member="$REPO_PRINCIPAL" \
  --role="roles/iam.serviceAccountTokenCreator" >/dev/null

cat <<EOF

[bootstrap] Done.

Project:
  PROJECT_ID=$PROJECT_ID
  PROJECT_NUMBER=$PROJECT_NUMBER
  REGION=$REGION

Created / ensured:
  Artifact Registry repo: $ARTIFACT_REPO
  Image bucket: gs://$IMAGE_BUCKET
  Backup bucket: gs://$BACKUP_BUCKET
  Deploy service account: $DEPLOY_SA_EMAIL
  Workload Identity provider: $WIF_PROVIDER_RESOURCE

Update these GitHub Environment variables (production):
  GCP_PROJECT_ID=$PROJECT_ID
  GCP_REGION=$REGION
  GCP_ARTIFACT_REGISTRY_HOST=${REGION}-docker.pkg.dev
  GCP_ARTIFACT_REGISTRY_REPO=$ARTIFACT_REPO
  GCP_DEPLOY_SERVICE_ACCOUNT=$DEPLOY_SA_EMAIL
  GCP_WIF_PROVIDER=$WIF_PROVIDER_RESOURCE
  CLOUD_RUN_JOB_NAME=$CLOUD_RUN_JOB_NAME
  CLOUD_RUN_EXTRA_JOB_REGIONS=europe-west4,europe-west2

Update these GitHub Environment secrets (production):
  GOOGLE_CLOUD_PROJECT=$PROJECT_ID
  GCS_BUCKET_NAME=$IMAGE_BUCKET
  BACKUP_GCS_BUCKET=$BACKUP_BUCKET

Next:
  1. Create the VM in this project and reserve internal IP 10.132.0.2 plus a static external IP.
  2. Run scripts/vm-bootstrap.sh on the new VM.
  3. Migrate both databases and sync the image bucket.
  4. Deploy from GitHub Actions into the new project.
EOF
