#!/usr/bin/env bash
#
# Daily TLS expiry watchdog. Installed as a cron job by scripts/vm-provision.sh.
#
# certbot renews at 30 days remaining. If we ever drop below WARN_DAYS, renewal
# is failing and nobody would otherwise know — which is exactly what happened
# before the 2026-08-02 audit: the certbot container was down, the cert expired
# on 18 Jul, and both APIs served an expired cert for 15 days.
#
# No additional monthly cost: reuses the Resend API key already in
# /opt/soulstep/.env (Resend's free tier is 3,000 emails/month). If the key is
# missing it still exits non-zero and logs loudly, so cron mail / the log file
# picks it up.

set -uo pipefail

DOMAIN="${CERT_DOMAIN:-catalog-api.soul-step.org}"
WARN_DAYS="${WARN_DAYS:-21}"
ENV_FILE="/opt/soulstep/.env"
STAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

END_DATE=$(echo | openssl s_client -connect "${DOMAIN}:443" -servername "${DOMAIN}" 2>/dev/null \
           | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)

if [ -z "${END_DATE}" ]; then
  echo "${STAMP} ERROR could not read certificate from ${DOMAIN}"
  SUBJECT="[SoulStep] TLS check FAILED for ${DOMAIN}"
  BODY="Could not retrieve a certificate from ${DOMAIN}:443 at ${STAMP}. The host may be down, or nginx may not be serving TLS."
  DAYS_LEFT=-1
else
  END_EPOCH=$(date -d "${END_DATE}" +%s 2>/dev/null || date -j -f "%b %d %T %Y %Z" "${END_DATE}" +%s 2>/dev/null)
  DAYS_LEFT=$(( (END_EPOCH - $(date +%s)) / 86400 ))
  echo "${STAMP} ${DOMAIN} expires ${END_DATE} (${DAYS_LEFT} days)"
  if [ "${DAYS_LEFT}" -ge "${WARN_DAYS}" ]; then
    exit 0   # healthy — stay quiet
  fi
  SUBJECT="[SoulStep] TLS cert expires in ${DAYS_LEFT} days"
  BODY="${DOMAIN} expires ${END_DATE} (${DAYS_LEFT} days left).

certbot renews at 30 days, so being below ${WARN_DAYS} means renewal is failing.

Check:
  docker ps --filter name=certbot
  docker compose -f /opt/soulstep/docker-compose.prod.yml logs --tail=50 certbot
  docker compose -f /opt/soulstep/docker-compose.prod.yml run --rm \\
    --entrypoint 'certbot renew --webroot -w /var/www/certbot --dry-run' certbot"
fi

# shellcheck disable=SC1090
[ -f "$ENV_FILE" ] && RESEND_API_KEY=$(grep -E '^RESEND_API_KEY=' "$ENV_FILE" | cut -d= -f2- | tr -d '"')
ALERT_TO="${CERT_ALERT_EMAIL:-h_abbasi97@hotmail.com}"

if [ -z "${RESEND_API_KEY:-}" ]; then
  echo "${STAMP} WARN no RESEND_API_KEY in ${ENV_FILE}; cannot email. Alert was: ${SUBJECT}"
  exit 1
fi

PAYLOAD=$(python3 -c "
import json,sys
print(json.dumps({
  'from': 'SoulStep Ops <noreply@soul-step.org>',
  'to': ['${ALERT_TO}'],
  'subject': '''${SUBJECT}''',
  'text': '''${BODY}'''
}))
")

CODE=$(curl -sS -o /tmp/resend-resp.json -w '%{http_code}' -X POST https://api.resend.com/emails \
  -H "Authorization: Bearer ${RESEND_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "${PAYLOAD}")

if [ "$CODE" = "200" ]; then
  echo "${STAMP} alert emailed to ${ALERT_TO} (${DAYS_LEFT} days left)"
else
  echo "${STAMP} ERROR Resend returned HTTP ${CODE}: $(cat /tmp/resend-resp.json 2>/dev/null)"
  exit 1
fi
