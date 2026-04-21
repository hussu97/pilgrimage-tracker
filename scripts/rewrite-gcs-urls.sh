#!/usr/bin/env bash
# Rewrite persisted storage.googleapis.com URLs after migrating to a new GCS bucket.
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/soulstep}"
OLD_BUCKET=""
NEW_BUCKET=""
DRY_RUN=false
ASSUME_YES=false

usage() {
  cat <<'EOF'
Usage:
  ./scripts/rewrite-gcs-urls.sh --old-bucket <old-bucket> --new-bucket <new-bucket> [--dry-run] [--yes]

This updates backend-owned URLs stored in:
  - catalog DB: placeimage, reviewimage, groupcoverimage, review.photo_urls,
    group.cover_image_url, blog_post.cover_image_url
  - scraper DB: scrapedplace.raw_data JSON (image_urls + external_reviews[*].photo_urls)
EOF
}

load_env() {
  if [ -f "$DEPLOY_DIR/.env" ]; then
    while IFS= read -r line; do
      [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]] && export "$line" 2>/dev/null || true
    done < "$DEPLOY_DIR/.env"
  fi
}

psql_counts() {
  local db_name="$1"
  local sql="$2"
  docker compose -f "$DEPLOY_DIR/docker-compose.prod.yml" \
    exec -T postgres \
    psql -U "$POSTGRES_USER" -d "$db_name" -v ON_ERROR_STOP=1 \
      -v old_prefix="$OLD_PREFIX" \
      -v new_prefix="$NEW_PREFIX" \
      -P pager=off \
      -c "$sql"
}

psql_apply() {
  local db_name="$1"
  local sql="$2"
  docker compose -f "$DEPLOY_DIR/docker-compose.prod.yml" \
    exec -T postgres \
    psql -U "$POSTGRES_USER" -d "$db_name" -v ON_ERROR_STOP=1 \
      -v old_prefix="$OLD_PREFIX" \
      -v new_prefix="$NEW_PREFIX" <<SQL
$sql
SQL
}

while [ $# -gt 0 ]; do
  case "$1" in
    --old-bucket)
      OLD_BUCKET="${2:-}"
      shift 2
      ;;
    --new-bucket)
      NEW_BUCKET="${2:-}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --yes)
      ASSUME_YES=true
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

if [ -z "$OLD_BUCKET" ] || [ -z "$NEW_BUCKET" ]; then
  usage
  exit 1
fi

if [ "$OLD_BUCKET" = "$NEW_BUCKET" ]; then
  echo "Old and new buckets must be different." >&2
  exit 1
fi

load_env

POSTGRES_USER="${POSTGRES_USER:-soulstep}"
POSTGRES_DB="${POSTGRES_DB:-soulstep}"
SCRAPER_POSTGRES_DB="${SCRAPER_POSTGRES_DB:-soulstep_scraper}"
OLD_PREFIX="https://storage.googleapis.com/${OLD_BUCKET}/"
NEW_PREFIX="https://storage.googleapis.com/${NEW_BUCKET}/"

CATALOG_COUNT_SQL=$(cat <<'SQL'
SELECT 'placeimage.gcs_url' AS target, count(*) AS rows
FROM placeimage
WHERE gcs_url LIKE :'old_prefix' || '%'
UNION ALL
SELECT 'reviewimage.gcs_url', count(*)
FROM reviewimage
WHERE gcs_url LIKE :'old_prefix' || '%'
UNION ALL
SELECT 'groupcoverimage.gcs_url', count(*)
FROM groupcoverimage
WHERE gcs_url LIKE :'old_prefix' || '%'
UNION ALL
SELECT 'review.photo_urls', count(*)
FROM review
WHERE EXISTS (
  SELECT 1
  FROM jsonb_array_elements_text(COALESCE(review.photo_urls::jsonb, '[]'::jsonb)) AS elem
  WHERE elem LIKE :'old_prefix' || '%'
)
UNION ALL
SELECT 'group.cover_image_url', count(*)
FROM "group"
WHERE cover_image_url LIKE :'old_prefix' || '%'
UNION ALL
SELECT 'blog_post.cover_image_url', count(*)
FROM blog_post
WHERE cover_image_url LIKE :'old_prefix' || '%';
SQL
)

SCRAPER_COUNT_SQL=$(cat <<'SQL'
SELECT 'scrapedplace.raw_data' AS target, count(*) AS rows
FROM scrapedplace
WHERE raw_data::text LIKE '%' || :'old_prefix' || '%';
SQL
)

echo "[rewrite] Catalog DB matches"
psql_counts "$POSTGRES_DB" "$CATALOG_COUNT_SQL"
echo
echo "[rewrite] Scraper DB matches"
psql_counts "$SCRAPER_POSTGRES_DB" "$SCRAPER_COUNT_SQL"

if [ "$DRY_RUN" = true ]; then
  echo
  echo "[rewrite] Dry run only; no changes applied."
  exit 0
fi

if [ "$ASSUME_YES" != true ]; then
  echo
  read -rp "Rewrite bucket URLs from ${OLD_BUCKET} to ${NEW_BUCKET}? [y/N] " CONFIRM
  [ "$CONFIRM" = "y" ] || { echo "Aborted."; exit 0; }
fi

CATALOG_APPLY_SQL=$(cat <<'SQL'
BEGIN;

UPDATE placeimage
SET gcs_url = replace(gcs_url, :'old_prefix', :'new_prefix')
WHERE gcs_url LIKE :'old_prefix' || '%';

UPDATE reviewimage
SET gcs_url = replace(gcs_url, :'old_prefix', :'new_prefix')
WHERE gcs_url LIKE :'old_prefix' || '%';

UPDATE groupcoverimage
SET gcs_url = replace(gcs_url, :'old_prefix', :'new_prefix')
WHERE gcs_url LIKE :'old_prefix' || '%';

UPDATE review
SET photo_urls = (
  SELECT COALESCE(
    jsonb_agg(
      to_jsonb(
        CASE
          WHEN elem LIKE :'old_prefix' || '%' THEN replace(elem, :'old_prefix', :'new_prefix')
          ELSE elem
        END
      )
    ),
    '[]'::jsonb
  )::json
  FROM jsonb_array_elements_text(COALESCE(review.photo_urls::jsonb, '[]'::jsonb)) AS elem
)
WHERE EXISTS (
  SELECT 1
  FROM jsonb_array_elements_text(COALESCE(review.photo_urls::jsonb, '[]'::jsonb)) AS elem
  WHERE elem LIKE :'old_prefix' || '%'
);

UPDATE "group"
SET cover_image_url = replace(cover_image_url, :'old_prefix', :'new_prefix')
WHERE cover_image_url LIKE :'old_prefix' || '%';

UPDATE blog_post
SET cover_image_url = replace(cover_image_url, :'old_prefix', :'new_prefix')
WHERE cover_image_url LIKE :'old_prefix' || '%';

COMMIT;
SQL
)

SCRAPER_APPLY_SQL=$(cat <<'SQL'
BEGIN;

UPDATE scrapedplace
SET raw_data = replace(raw_data::text, :'old_prefix', :'new_prefix')::json
WHERE raw_data::text LIKE '%' || :'old_prefix' || '%';

COMMIT;
SQL
)

echo "[rewrite] Applying catalog DB updates"
psql_apply "$POSTGRES_DB" "$CATALOG_APPLY_SQL"
echo "[rewrite] Applying scraper DB updates"
psql_apply "$SCRAPER_POSTGRES_DB" "$SCRAPER_APPLY_SQL"

echo
echo "[rewrite] Post-update counts"
echo "[rewrite] Catalog DB"
psql_counts "$POSTGRES_DB" "$CATALOG_COUNT_SQL"
echo
echo "[rewrite] Scraper DB"
psql_counts "$SCRAPER_POSTGRES_DB" "$SCRAPER_COUNT_SQL"
