#!/usr/bin/env bash
#
# Idempotent VM-level provisioning. Run by .github/workflows/deploy-vm.yml on
# every deploy, so none of this lives only as hand-made state on the box.
#
# Everything here was applied by hand during the 2026-08-02 cost audit. Without
# it in the repo, a VM rebuild (or anyone re-running vm-bootstrap.sh) silently
# reintroduces the problems described below.
#
# Safe to run repeatedly — every step checks before acting.

set -euo pipefail

log() { echo "[vm-provision] $*"; }

# ── 1. Cloud Ops Agent: keep the logging sub-agent OFF ────────────────────────
#
# fluent-bit could not flush to Cloud Logging:
#   [warn] [http_client] cannot increase buffer: current=4192 requested=36960
#   [warn] [output:stackdriver] http_do=-1
#   [warn] [engine] failed to flush chunk, retry in 6 seconds
# ...and retried forever. Measured: ~10.8M Cloud Logging API requests/month
# (~4.2/s), ~38 KB/s constant egress (~90 GB/mo), ~2% CPU, and 587 MB of its own
# error logs — while ZERO entries actually reached Cloud Logging. It also filled
# /var/log/journal to 2 GB and drove the 20 GB boot disk to 95% full.
#
# Metrics sub-agent is deliberately left running: it is free and it is what
# makes VM memory/disk observable at all.
OPS_CFG=/etc/google-cloud-ops-agent/config.yaml
if [ -f "$OPS_CFG" ]; then
  if ! grep -q "SOULSTEP-DISABLED-LOGGING" "$OPS_CFG"; then
    log "disabling ops-agent logging pipeline"
    sudo tee -a "$OPS_CFG" >/dev/null <<'EOF'

# SOULSTEP-DISABLED-LOGGING (managed by scripts/vm-provision.sh)
# See the script for why. Re-enable only after confirming the flush bug is gone.
logging:
  service:
    pipelines:
      default_pipeline:
        receivers: []
EOF
    sudo systemctl restart google-cloud-ops-agent || true
  else
    log "ops-agent logging already disabled"
  fi
fi

if systemctl list-unit-files 2>/dev/null | grep -q google-cloud-ops-agent-fluent-bit; then
  if [ "$(systemctl is-enabled google-cloud-ops-agent-fluent-bit 2>/dev/null || echo unknown)" != "masked" ]; then
    log "masking fluent-bit sub-agent"
    sudo systemctl stop google-cloud-ops-agent-fluent-bit || true
    sudo systemctl mask google-cloud-ops-agent-fluent-bit || true
  else
    log "fluent-bit already masked"
  fi
fi

# ── 2. Cap journald ───────────────────────────────────────────────────────────
# It had grown to 2.0 GB on a 20 GB disk.
if ! grep -qE '^SystemMaxUse=200M' /etc/systemd/journald.conf 2>/dev/null; then
  log "capping journald at 200M"
  sudo sed -i 's/^#\?SystemMaxUse=.*/SystemMaxUse=200M/' /etc/systemd/journald.conf
  grep -qE '^SystemMaxUse=' /etc/systemd/journald.conf || \
    echo 'SystemMaxUse=200M' | sudo tee -a /etc/systemd/journald.conf >/dev/null
  sudo systemctl restart systemd-journald || true
else
  log "journald already capped"
fi

# ── 3. Cap Docker container logs ──────────────────────────────────────────────
# Container logs were uncapped json-file. Two chatty FastAPI services plus nginx
# on a 20 GB disk is a slow-motion outage.
if [ ! -f /etc/docker/daemon.json ]; then
  log "adding docker log rotation"
  sudo mkdir -p /etc/docker
  sudo tee /etc/docker/daemon.json >/dev/null <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
EOF
  # Reload rather than restart: restarting dockerd bounces every container.
  # New limits apply to containers created after this point, which the deploy
  # step does anyway when it recreates services.
  sudo systemctl reload docker 2>/dev/null || log "docker reload skipped (applies on next daemon restart)"
else
  log "docker daemon.json already present — leaving alone"
fi

# ── 4. TLS expiry watchdog ────────────────────────────────────────────────────
# certbot has restart: always and renews every 12h, but if renewal ever fails
# there is nothing to say so. The cert silently expired on 2026-07-18 and both
# APIs served an expired cert for 15 days before anyone noticed.
# Zero marginal cost: uses the Resend key already in .env.
if [ -x /opt/soulstep/scripts/check-cert-expiry.sh ]; then
  CRON_LINE="17 8 * * * /opt/soulstep/scripts/check-cert-expiry.sh >> /var/log/soulstep-cert-check.log 2>&1"
  if ! crontab -l 2>/dev/null | grep -qF "check-cert-expiry.sh"; then
    log "installing daily cert-expiry check"
    ( crontab -l 2>/dev/null || true; echo "$CRON_LINE" ) | crontab -
  else
    log "cert-expiry check already scheduled"
  fi
fi

log "done"
