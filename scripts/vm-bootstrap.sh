#!/usr/bin/env bash
# Run once on a fresh Debian 12 e2-micro VM to set up the SoulStep backend.
set -euo pipefail

DEPLOY_DIR=/opt/soulstep
REPO_URL=https://github.com/hussu97/pilgrimage-tracker.git
# Default to the current user so chown/usermod/crontab target whoever runs this script.
# Override: DEPLOY_USER=myuser bash vm-bootstrap.sh
DEPLOY_USER=${DEPLOY_USER:-$(whoami)}

echo "=== [1/9] Install Docker ==="
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$DEPLOY_USER"
sudo systemctl enable docker
sudo systemctl start docker

echo "=== [2/9] Install Google Cloud Ops Agent (ships Docker logs → Cloud Logging) ==="
if ! systemctl is-active --quiet google-cloud-ops-agent 2>/dev/null; then
  curl -sSO https://dl.google.com/cloudagents/add-google-cloud-ops-agent-repo.sh
  sudo bash add-google-cloud-ops-agent-repo.sh --also-install
  rm -f add-google-cloud-ops-agent-repo.sh
fi

echo "=== [3/9] Install gcloud CLI (for GCS backup uploads) ==="
if ! command -v gcloud &>/dev/null; then
  curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg \
    | sudo gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg
  echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" \
    | sudo tee /etc/apt/sources.list.d/google-cloud-sdk.list
  sudo apt-get update && sudo apt-get install -y google-cloud-cli
fi

echo "=== [4/9] Install tinyproxy (browser egress proxy for Cloud Run Jobs) ==="
# Cloud Run's shared egress pool is on Google Maps' bot-wall. Cloud Run Jobs
# (Direct VPC Egress, private-ranges-only) forward browser traffic to this
# proxy so Maps requests egress via the VM's clean external IP. The compose
# default BROWSER_PROXY_LIST=http://10.132.0.2:3128 assumes the VM's primary
# internal IP is 10.132.0.2 — reserve that as a static internal IP on the NIC
# if you recreate the VM. See PRODUCTION.md §9.
if ! command -v tinyproxy &>/dev/null; then
  sudo apt-get update -qq
  sudo apt-get install -y tinyproxy
fi
sudo tee /etc/tinyproxy/tinyproxy.conf > /dev/null <<'TINYPROXY_EOF'
User tinyproxy
Group tinyproxy
Port 3128
Listen 0.0.0.0
Timeout 600
DefaultErrorFile "/usr/share/tinyproxy/default.html"
StatFile "/usr/share/tinyproxy/stats.html"
LogFile "/var/log/tinyproxy/tinyproxy.log"
LogLevel Info
PidFile "/run/tinyproxy/tinyproxy.pid"
MaxClients 100
Allow 10.128.0.0/9
Allow 127.0.0.1
ConnectPort 443
ConnectPort 563
DisableViaHeader Yes
TINYPROXY_EOF
sudo systemctl enable tinyproxy
sudo systemctl restart tinyproxy

echo "=== [5/9] Clone repo ==="
sudo mkdir -p "$DEPLOY_DIR"
sudo chown "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_DIR"

# Grant passwordless sudo for the specific commands CI needs
echo "$DEPLOY_USER ALL=(ALL) NOPASSWD: /bin/mkdir, /bin/chown, /usr/bin/tee" \
  | sudo tee /etc/sudoers.d/soulstep-deploy > /dev/null
sudo chmod 440 /etc/sudoers.d/soulstep-deploy
if [ ! -d "$DEPLOY_DIR/.git" ]; then
  # Clone as DEPLOY_USER so the working tree is owned correctly
  sudo -u "$DEPLOY_USER" git clone "$REPO_URL" "$DEPLOY_DIR"
else
  echo "Repo already cloned — skipping."
fi

echo "=== [6/9] Create certbot directories ==="
mkdir -p "$DEPLOY_DIR/certbot/www" "$DEPLOY_DIR/certbot/conf"

echo "=== [7/9] Create backup directory ==="
mkdir -p "$DEPLOY_DIR/backups"

echo "=== [8/9] Install crontab for $DEPLOY_USER ==="
# Strip any existing soulstep entries then append the current cron file
(crontab -u "$DEPLOY_USER" -l 2>/dev/null | grep -v soulstep || true) > /tmp/crontab_clean
cat "$DEPLOY_DIR/scripts/cron/soulstep-cron" >> /tmp/crontab_clean
crontab -u "$DEPLOY_USER" /tmp/crontab_clean
echo "Crontab installed."

echo "=== [9/9] Done! ==="
cat <<NEXT

Next steps:
  1. Add the deploy SSH public key to ~/.ssh/authorized_keys so CI can connect.
  2. Add GitHub Actions secrets: SERVER_HOST, SERVER_USER=$DEPLOY_USER, SERVER_SSH_KEY (see PRODUCTION.md).
  3. Make GHCR packages public: GitHub → Packages → each package → Package settings → Change visibility → Public.
  4. Point DNS: add A records for catalog-api.soul-step.org and scraper-api.soul-step.org → this VM's IP.
  5. Trigger a CI deploy (push any commit). It will write .env and bring up all services.
     — On first deploy, Postgres initialises from the env vars written by CI.
  6. Once services are up, issue a Let's Encrypt certificate (USE_SSL must be false first):
       cd $DEPLOY_DIR
       docker compose -f docker-compose.prod.yml run --rm --entrypoint "" certbot \\
         certbot certonly --webroot -w /var/www/certbot \\
         -d catalog-api.soul-step.org -d scraper-api.soul-step.org \\
         --email admin@soul-step.org --agree-tos --no-eff-email
  7. Set USE_SSL=true via the GitHub Secret, then re-trigger CI to redeploy nginx with TLS.

NOTE: Docker group membership takes effect on the next login.
      If you need docker commands immediately, run: newgrp docker

NEXT
