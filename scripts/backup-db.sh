#!/usr/bin/env bash
# Daily Postgres backup: dump both production DBs, bundle, retain locally,
# and optionally upload to GCS. Called from crontab — see scripts/cron/soulstep-cron.
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/soulstep}"
BACKUP_DIR="$DEPLOY_DIR/backups"
TIMESTAMP=$(date -u +%Y%m%d_%H%M%S)
BACKUP_STEM="soulstep_${TIMESTAMP}"
WORK_DIR="$BACKUP_DIR/$BACKUP_STEM"
ARCHIVE_FILE="$BACKUP_DIR/${BACKUP_STEM}.tar.gz"
RETAIN_DAYS="${RETAIN_DAYS:-7}"

load_env() {
  if [ -f "$DEPLOY_DIR/.env" ]; then
    while IFS= read -r line; do
      [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]] && export "$line" 2>/dev/null || true
    done < "$DEPLOY_DIR/.env"
  fi
}

upload_file() {
  local src="$1"
  local dest="$2"
  if command -v gcloud >/dev/null 2>&1; then
    gcloud storage cp "$src" "$dest"
  elif command -v gsutil >/dev/null 2>&1; then
    gsutil cp "$src" "$dest"
  else
    echo "[backup] Neither gcloud nor gsutil is installed; cannot upload to GCS." >&2
    return 1
  fi
}

dump_db() {
  local db_name="$1"
  local output_file="$2"
  echo "[backup] Dumping database $db_name"
  docker compose -f "$DEPLOY_DIR/docker-compose.prod.yml" \
    exec -T postgres \
    pg_dump -U "$POSTGRES_USER" "$db_name" \
    | gzip > "$output_file"
}

load_env

POSTGRES_USER="${POSTGRES_USER:-soulstep}"
POSTGRES_DB="${POSTGRES_DB:-soulstep}"
SCRAPER_POSTGRES_DB="${SCRAPER_POSTGRES_DB:-soulstep_scraper}"

mkdir -p "$WORK_DIR"

dump_db "$POSTGRES_DB" "$WORK_DIR/catalog.sql.gz"
dump_db "$SCRAPER_POSTGRES_DB" "$WORK_DIR/scraper.sql.gz"

cat > "$WORK_DIR/manifest.env" <<EOF
BACKUP_CREATED_AT_UTC=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
POSTGRES_USER=$POSTGRES_USER
POSTGRES_DB=$POSTGRES_DB
SCRAPER_POSTGRES_DB=$SCRAPER_POSTGRES_DB
GOOGLE_CLOUD_PROJECT=${GOOGLE_CLOUD_PROJECT:-}
GCS_BUCKET_NAME=${GCS_BUCKET_NAME:-}
BACKUP_GCS_BUCKET=${BACKUP_GCS_BUCKET:-}
EOF

tar -C "$BACKUP_DIR" -czf "$ARCHIVE_FILE" "$BACKUP_STEM"
rm -rf "$WORK_DIR"

echo "[backup] Backup archive written: $ARCHIVE_FILE ($(du -sh "$ARCHIVE_FILE" | cut -f1))"

if [ -n "${BACKUP_GCS_BUCKET:-}" ]; then
  echo "[backup] Uploading to gs://$BACKUP_GCS_BUCKET/"
  upload_file "$ARCHIVE_FILE" "gs://$BACKUP_GCS_BUCKET/" && echo "[backup] Upload complete."
fi

find "$BACKUP_DIR" -name "soulstep_*.tar.gz" -mtime "+$RETAIN_DAYS" -delete
find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name "soulstep_*" -mtime "+$RETAIN_DAYS" -exec rm -rf {} +
echo "[backup] Pruned backups older than $RETAIN_DAYS days."
echo "[backup] Done."
