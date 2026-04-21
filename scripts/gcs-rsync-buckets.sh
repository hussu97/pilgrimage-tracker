#!/usr/bin/env bash
# Sync one GCS bucket into another for backend migration cutovers.
set -euo pipefail

SOURCE_BUCKET=""
TARGET_BUCKET=""
DELETE_EXTRA=false

usage() {
  cat <<'EOF'
Usage:
  ./scripts/gcs-rsync-buckets.sh --source-bucket <old-bucket> --target-bucket <new-bucket> [--delete-extra]

Examples:
  ./scripts/gcs-rsync-buckets.sh --source-bucket soulstep-images --target-bucket project-new-soulstep-images
  ./scripts/gcs-rsync-buckets.sh --source-bucket old --target-bucket new --delete-extra
EOF
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command not found: $1" >&2
    exit 1
  fi
}

while [ $# -gt 0 ]; do
  case "$1" in
    --source-bucket)
      SOURCE_BUCKET="${2:-}"
      shift 2
      ;;
    --target-bucket)
      TARGET_BUCKET="${2:-}"
      shift 2
      ;;
    --delete-extra)
      DELETE_EXTRA=true
      shift
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

if [ -z "$SOURCE_BUCKET" ] || [ -z "$TARGET_BUCKET" ]; then
  usage
  exit 1
fi

if [ "$SOURCE_BUCKET" = "$TARGET_BUCKET" ]; then
  echo "Source and target buckets must be different." >&2
  exit 1
fi

require_cmd gcloud

ARGS=(storage rsync "gs://${SOURCE_BUCKET}" "gs://${TARGET_BUCKET}" --recursive)
if [ "$DELETE_EXTRA" = true ]; then
  ARGS+=(--delete-unmatched-destination-objects)
fi

echo "[rsync] Syncing gs://${SOURCE_BUCKET} -> gs://${TARGET_BUCKET}"
gcloud "${ARGS[@]}"
echo "[rsync] Done."
