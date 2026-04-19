#!/usr/bin/env bash
# Restore a Postgres backup from a local .sql.gz file.
# Usage: ./scripts/restore-db.sh /path/to/soulstep_YYYYMMDD_HHMMSS.sql.gz [--from-gcs]
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/soulstep}"

# Load .env
set -a
# shellcheck disable=SC1091
[ -f "$DEPLOY_DIR/.env" ] && source "$DEPLOY_DIR/.env"
set +a

POSTGRES_USER="${POSTGRES_USER:-soulstep}"
POSTGRES_DB="${POSTGRES_DB:-soulstep}"
BACKUP_FILE="${1:-}"
FROM_GCS="${2:-}"

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: $0 <backup-file.sql.gz> [--from-gcs]"
  exit 1
fi

if [ "$FROM_GCS" = "--from-gcs" ]; then
  echo "[restore] Downloading from GCS: $BACKUP_FILE"
  LOCAL_FILE="/tmp/$(basename "$BACKUP_FILE")"
  gsutil cp "gs://${BACKUP_GCS_BUCKET}/$BACKUP_FILE" "$LOCAL_FILE"
  BACKUP_FILE="$LOCAL_FILE"
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "[restore] File not found: $BACKUP_FILE"
  exit 1
fi

echo "[restore] Restoring from: $BACKUP_FILE"
echo "[restore] Target: $POSTGRES_DB"
read -rp "This will DROP and recreate the database. Continue? [y/N] " CONFIRM
[ "$CONFIRM" = "y" ] || { echo "Aborted."; exit 0; }

# Drop + recreate
docker compose -f "$DEPLOY_DIR/docker-compose.prod.yml" \
  exec -T postgres \
  psql -U "$POSTGRES_USER" -c "DROP DATABASE IF EXISTS \"$POSTGRES_DB\";"
docker compose -f "$DEPLOY_DIR/docker-compose.prod.yml" \
  exec -T postgres \
  psql -U "$POSTGRES_USER" -c "CREATE DATABASE \"$POSTGRES_DB\";"

# Restore
gunzip -c "$BACKUP_FILE" | \
  docker compose -f "$DEPLOY_DIR/docker-compose.prod.yml" \
  exec -T postgres \
  psql -U "$POSTGRES_USER" "$POSTGRES_DB"

echo "[restore] Done."
