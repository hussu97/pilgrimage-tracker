#!/usr/bin/env bash
# Restore a dual-DB Postgres backup bundle produced by scripts/backup-db.sh.
# Usage:
#   ./scripts/restore-db.sh /path/to/soulstep_YYYYMMDD_HHMMSS.tar.gz [--yes]
#   ./scripts/restore-db.sh gs://bucket/path/soulstep_YYYYMMDD_HHMMSS.tar.gz [--yes]
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/soulstep}"
INPUT_PATH=""
ASSUME_YES=false
TMP_DIR=""

load_env() {
  if [ -f "$DEPLOY_DIR/.env" ]; then
    while IFS= read -r line; do
      [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]] && export "$line" 2>/dev/null || true
    done < "$DEPLOY_DIR/.env"
  fi
}

usage() {
  cat <<'EOF'
Usage:
  ./scripts/restore-db.sh <backup-bundle.tar.gz|bundle-dir|gs://bucket/object.tar.gz> [--yes]

The bundle must contain:
  - catalog.sql.gz
  - scraper.sql.gz
  - manifest.env
EOF
}

download_file() {
  local src="$1"
  local dest="$2"
  if command -v gcloud >/dev/null 2>&1; then
    gcloud storage cp "$src" "$dest"
  elif command -v gsutil >/dev/null 2>&1; then
    gsutil cp "$src" "$dest"
  else
    echo "[restore] Neither gcloud nor gsutil is installed; cannot download from GCS." >&2
    return 1
  fi
}

reset_db() {
  local db_name="$1"
  docker compose -f "$DEPLOY_DIR/docker-compose.prod.yml" \
    exec -T postgres \
    psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 <<SQL
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = '$db_name' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS "$db_name";
CREATE DATABASE "$db_name";
SQL
}

restore_db() {
  local db_name="$1"
  local input_file="$2"
  echo "[restore] Restoring $db_name from $(basename "$input_file")"
  gunzip -c "$input_file" | docker compose -f "$DEPLOY_DIR/docker-compose.prod.yml" \
    exec -T postgres \
    psql -U "$POSTGRES_USER" -d "$db_name" -v ON_ERROR_STOP=1
}

while [ $# -gt 0 ]; do
  case "$1" in
    --yes)
      ASSUME_YES=true
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      if [ -n "$INPUT_PATH" ]; then
        echo "[restore] Unexpected argument: $1" >&2
        usage
        exit 1
      fi
      INPUT_PATH="$1"
      ;;
  esac
  shift
done

if [ -z "$INPUT_PATH" ]; then
  usage
  exit 1
fi

load_env

POSTGRES_USER="${POSTGRES_USER:-soulstep}"
POSTGRES_DB="${POSTGRES_DB:-soulstep}"
SCRAPER_POSTGRES_DB="${SCRAPER_POSTGRES_DB:-soulstep_scraper}"

trap 'if [ -n "$TMP_DIR" ] && [ -d "$TMP_DIR" ]; then rm -rf "$TMP_DIR"; fi' EXIT

if [[ "$INPUT_PATH" == gs://* ]]; then
  TMP_DIR="$(mktemp -d)"
  LOCAL_ARCHIVE="$TMP_DIR/$(basename "$INPUT_PATH")"
  echo "[restore] Downloading bundle from $INPUT_PATH"
  download_file "$INPUT_PATH" "$LOCAL_ARCHIVE"
  INPUT_PATH="$LOCAL_ARCHIVE"
fi

if [ -d "$INPUT_PATH" ]; then
  BUNDLE_DIR="$INPUT_PATH"
else
  if [ ! -f "$INPUT_PATH" ]; then
    echo "[restore] Backup bundle not found: $INPUT_PATH" >&2
    exit 1
  fi
  [ -n "$TMP_DIR" ] || TMP_DIR="$(mktemp -d)"
  tar -C "$TMP_DIR" -xzf "$INPUT_PATH"
  FIRST_ENTRY="$(find "$TMP_DIR" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
  if [ -z "$FIRST_ENTRY" ]; then
    echo "[restore] Could not find extracted backup bundle contents." >&2
    exit 1
  fi
  BUNDLE_DIR="$FIRST_ENTRY"
fi

CATALOG_FILE="$BUNDLE_DIR/catalog.sql.gz"
SCRAPER_FILE="$BUNDLE_DIR/scraper.sql.gz"

if [ ! -f "$CATALOG_FILE" ] || [ ! -f "$SCRAPER_FILE" ]; then
  echo "[restore] Bundle is missing catalog.sql.gz or scraper.sql.gz: $BUNDLE_DIR" >&2
  exit 1
fi

echo "[restore] Bundle: $INPUT_PATH"
echo "[restore] Catalog DB: $POSTGRES_DB"
echo "[restore] Scraper DB: $SCRAPER_POSTGRES_DB"
if [ "$ASSUME_YES" != true ]; then
  read -rp "This will DROP and recreate both databases. Continue? [y/N] " CONFIRM
  [ "$CONFIRM" = "y" ] || { echo "Aborted."; exit 0; }
fi

docker compose -f "$DEPLOY_DIR/docker-compose.prod.yml" up -d postgres >/dev/null

reset_db "$POSTGRES_DB"
restore_db "$POSTGRES_DB" "$CATALOG_FILE"

reset_db "$SCRAPER_POSTGRES_DB"
restore_db "$SCRAPER_POSTGRES_DB" "$SCRAPER_FILE"

echo "[restore] Done."
