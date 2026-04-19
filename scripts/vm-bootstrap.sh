#!/usr/bin/env bash
# Run once on a fresh Debian 12 e2-micro VM to set up the SoulStep backend.
# Usage: bash vm-bootstrap.sh
set -euo pipefail

DEPLOY_DIR=/opt/soulstep
REPO_URL=https://github.com/hussu97/soulstep.git
DEPLOY_USER=deploy

echo "=== [1/8] Install Docker ==="
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$DEPLOY_USER" || true
sudo systemctl enable docker
sudo systemctl start docker

echo "=== [2/8] Install gcloud CLI (for GCS backup uploads) ==="
if ! command -v gcloud &>/dev/null; then
  curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg \
    | sudo gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg
  echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" \
    | sudo tee /etc/apt/sources.list.d/google-cloud-sdk.list
  sudo apt-get update && sudo apt-get install -y google-cloud-cli
fi

echo "=== [3/8] Clone repo ==="
sudo mkdir -p "$DEPLOY_DIR"
sudo chown "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_DIR"
if [ ! -d "$DEPLOY_DIR/.git" ]; then
  git clone "$REPO_URL" "$DEPLOY_DIR"
else
  echo "Repo already cloned — skipping."
fi

echo "=== [4/8] Create certbot directories ==="
mkdir -p "$DEPLOY_DIR/certbot/www" "$DEPLOY_DIR/certbot/conf"

echo "=== [5/8] Create backup directory ==="
mkdir -p "$DEPLOY_DIR/backups"

echo "=== [6/8] Start Postgres (HTTP-only, before certs) ==="
cd "$DEPLOY_DIR"
docker compose -f docker-compose.prod.yml up -d postgres
echo "Waiting for Postgres to be healthy..."
for i in $(seq 1 30); do
  docker compose -f docker-compose.prod.yml exec -T postgres \
    pg_isready -U soulstep -d soulstep > /dev/null 2>&1 && break
  sleep 3
done
echo "Postgres is ready."

echo "=== [7/8] Install crontab ==="
crontab -l 2>/dev/null | grep -v soulstep > /tmp/crontab_clean || true
cat "$DEPLOY_DIR/scripts/cron/soulstep-cron" >> /tmp/crontab_clean
crontab /tmp/crontab_clean
echo "Crontab installed."

echo "=== [8/8] Done! ==="
cat <<'NEXT'

Next steps:
  1. Copy .env.example to /opt/soulstep/.env and fill in all values (USE_SSL=false for now).
  2. Point DNS: add A records for catalog-api.soul-step.org and scraper-api.soul-step.org → this VM's IP.
  3. Bring up all services (HTTP only):
       cd /opt/soulstep && docker compose -f docker-compose.prod.yml up -d
  4. Issue Let's Encrypt certificate:
       docker compose -f docker-compose.prod.yml run --rm --entrypoint "" certbot \
         certbot certonly --webroot -w /var/www/certbot \
         -d catalog-api.soul-step.org -d scraper-api.soul-step.org \
         --email admin@soul-step.org --agree-tos --no-eff-email
  5. Set USE_SSL=true in .env, then:
       docker compose -f docker-compose.prod.yml up -d --force-recreate nginx
  6. Add SSH public key to ~/.ssh/authorized_keys for the deploy user.
  7. Add GitHub Actions secrets: SERVER_HOST, SERVER_USER, SERVER_SSH_KEY (see PRODUCTION.md).
  8. Make GHCR packages public: GitHub → soulstep repo → Packages → each package → Package settings → Change visibility → Public.

NEXT
