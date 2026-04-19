#!/usr/bin/env bash
# Daily Postgres backup: dump → gzip → local retention + optional GCS upload.
# Called from crontab — see scripts/cron/soulstep-cron.
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/soulstep}"
BACKUP_DIR="$DEPLOY_DIR/backups"
TIMESTAMP=$(date -u +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/soulstep_${TIMESTAMP}.sql.gz"
RETAIN_DAYS=7

# Load .env to get POSTGRES_* and BACKUP_GCS_BUCKET
set -a
# shellcheck disable=SC1091
[ -f "$DEPLOY_DIR/.env" ] && source "$DEPLOY_DIR/.env"
set +a

POSTGRES_USER="${POSTGRES_USER:-soulstep}"
POSTGRES_DB="${POSTGRES_DB:-soulstep}"

mkdir -p "$BACKUP_DIR"

echo "[backup] Starting backup → $BACKUP_FILE"
docker compose -f "$DEPLOY_DIR/docker-compose.prod.yml" \
  exec -T postgres \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" \
  | gzip > "$BACKUP_FILE"

echo "[backup] Backup written: $(du -sh "$BACKUP_FILE" | cut -f1)"

# Upload to GCS if bucket is configured
if [ -n "${BACKUP_GCS_BUCKET:-}" ]; then
  echo "[backup] Uploading to gs://$BACKUP_GCS_BUCKET/"
  gsutil cp "$BACKUP_FILE" "gs://$BACKUP_GCS_BUCKET/" && \
    echo "[backup] Upload complete."
fi

# Prune local backups older than RETAIN_DAYS
find "$BACKUP_DIR" -name "soulstep_*.sql.gz" -mtime "+$RETAIN_DAYS" -delete
echo "[backup] Pruned backups older than $RETAIN_DAYS days."
echo "[backup] Done."
