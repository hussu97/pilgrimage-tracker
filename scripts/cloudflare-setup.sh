#!/usr/bin/env bash
#
# Prepare soul-step.org on Cloudflare (free plan) via the API.
#
# Recreates the exact DNS zone captured 2026-08-02 (see
# docs/cloudflare-migration.md), proxies only the two API subdomains, and sets
# SSL to Full (strict).
#
# This script CANNOT and does NOT change nameservers — that happens at
# Namecheap, by hand. Until you do that, everything here is inert: adding a zone
# to Cloudflare has no effect on live traffic while the registrar still points
# at dns1/dns2.registrar-servers.com. That is what makes it safe to run early.
#
# Usage:
#   export CLOUDFLARE_API_TOKEN=...      # Zone:Edit + Zone Settings:Edit + Zone:Read
#   ./scripts/cloudflare-setup.sh        # dry run — prints what it would do
#   ./scripts/cloudflare-setup.sh --apply
#
# Create the token at:
#   https://dash.cloudflare.com/profile/api-tokens  ->  Create Token
#   Permissions: Zone:Zone:Edit, Zone:DNS:Edit, Zone:Zone Settings:Edit
#   (A token, not your Global API Key. Tokens are scopable and revocable.)

set -euo pipefail

DOMAIN="soul-step.org"
VM_IP="34.76.105.103"
API="https://api.cloudflare.com/client/v4"
APPLY=false
[[ "${1:-}" == "--apply" ]] && APPLY=true

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "ERROR: CLOUDFLARE_API_TOKEN is not set." >&2
  exit 1
fi

cf() {  # cf METHOD PATH [JSON_BODY]
  local method=$1 path=$2 body=${3:-}
  if [[ -n "$body" ]]; then
    curl -sS -X "$method" "${API}${path}" \
      -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
      -H "Content-Type: application/json" --data "$body"
  else
    curl -sS -X "$method" "${API}${path}" \
      -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}"
  fi
}

ok() { python3 -c "import json,sys; d=json.load(sys.stdin); sys.exit(0 if d.get('success') else 1)"; }
err() { python3 -c "import json,sys; d=json.load(sys.stdin); print('  '+ '; '.join(e.get('message','?') for e in d.get('errors',[])))"; }

echo "== verifying token =="
TOK=$(cf GET /user/tokens/verify)
echo "$TOK" | ok || { echo "  token rejected:"; echo "$TOK" | err; exit 1; }
echo "  token OK"

# ── zone ─────────────────────────────────────────────────────────────────────
echo "== zone: ${DOMAIN} =="
ZONE_JSON=$(cf GET "/zones?name=${DOMAIN}")
ZONE_ID=$(echo "$ZONE_JSON" | python3 -c "import json,sys; r=json.load(sys.stdin).get('result',[]); print(r[0]['id'] if r else '')")

if [[ -z "$ZONE_ID" ]]; then
  if ! $APPLY; then
    echo "  [dry-run] would CREATE zone ${DOMAIN} (free plan)"
    ZONE_ID="<pending>"
  else
    ACCT=$(cf GET /accounts | python3 -c "import json,sys; r=json.load(sys.stdin)['result']; print(r[0]['id'] if r else '')")
    [[ -z "$ACCT" ]] && { echo "  ERROR: token cannot see any account; it needs Account scope to create a zone." >&2; exit 1; }
    CREATED=$(cf POST /zones "{\"name\":\"${DOMAIN}\",\"account\":{\"id\":\"${ACCT}\"},\"type\":\"full\"}")
    echo "$CREATED" | ok || { echo "  zone create failed:"; echo "$CREATED" | err; exit 1; }
    ZONE_ID=$(echo "$CREATED" | python3 -c "import json,sys; print(json.load(sys.stdin)['result']['id'])")
    echo "  created zone ${ZONE_ID}"
  fi
else
  echo "  zone already exists: ${ZONE_ID}"
fi

# ── records ──────────────────────────────────────────────────────────────────
# type|name|content|proxied     (snapshot of 2026-08-02, docs/cloudflare-migration.md)
# Only the two API subdomains are proxied. Vercel-served names stay DNS-only so
# Vercel keeps terminating TLS and serving them.
RECORDS=(
  "A|${DOMAIN}|216.198.79.1|false"
  "CNAME|www.${DOMAIN}|14207b2dfa71a2e3.vercel-dns-017.com|false"
  "CNAME|admin.${DOMAIN}|06a73ed78e2f883a.vercel-dns-017.com|false"
  "A|catalog-api.${DOMAIN}|${VM_IP}|true"
  "A|scraper-api.${DOMAIN}|${VM_IP}|true"
  "TXT|${DOMAIN}|hosting-site=project-fa2d7f52-2bc4-4a46-8ae|false"
  "TXT|${DOMAIN}|google-site-verification=mlxZoEm7pzR6gMQ2s1RHt17BOGTQIXT0oAJQeeilv3E|false"
  "TXT|_dmarc.${DOMAIN}|v=DMARC1; p=none;|false"
)

echo "== dns records =="
echo "  NOTE: resend._domainkey (DKIM) is deliberately NOT in this list."
echo "        The key is long and must be copied verbatim from the current zone."
echo "        Fetch it with:  dig +short TXT resend._domainkey.${DOMAIN}"
echo "        Add it by hand and confirm it resolves BEFORE moving nameservers,"
echo "        or transactional email silently starts failing."
echo

EXISTING="{}"
if [[ "$ZONE_ID" != "<pending>" ]]; then
  EXISTING=$(cf GET "/zones/${ZONE_ID}/dns_records?per_page=200")
fi

for rec in "${RECORDS[@]}"; do
  IFS='|' read -r TYPE NAME CONTENT PROXIED <<< "$rec"
  FOUND=$(echo "$EXISTING" | python3 -c "
import json,sys
try: d=json.load(sys.stdin)
except Exception: print(''); sys.exit()
for r in d.get('result',[]) or []:
    if r['type']=='$TYPE' and r['name']=='$NAME' and r['content'].strip('\"')=='''$CONTENT''':
        print(r['id']); break
" 2>/dev/null || true)

  if [[ -n "$FOUND" ]]; then
    echo "  = exists   ${TYPE} ${NAME}"
    continue
  fi
  if ! $APPLY; then
    echo "  + would add ${TYPE} ${NAME} -> ${CONTENT} (proxied=${PROXIED})"
    continue
  fi
  BODY=$(python3 -c "
import json
print(json.dumps({'type':'$TYPE','name':'$NAME','content':'''$CONTENT''','ttl':1,'proxied':$PROXIED}))
")
  RESP=$(cf POST "/zones/${ZONE_ID}/dns_records" "$BODY")
  if echo "$RESP" | ok; then
    echo "  + added    ${TYPE} ${NAME} (proxied=${PROXIED})"
  else
    echo "  ! failed   ${TYPE} ${NAME}"; echo "$RESP" | err
  fi
done

# ── settings ─────────────────────────────────────────────────────────────────
echo "== ssl mode =="
if ! $APPLY; then
  echo "  [dry-run] would set SSL -> strict (origin has a valid Let's Encrypt cert)"
else
  RESP=$(cf PATCH "/zones/${ZONE_ID}/settings/ssl" '{"value":"strict"}')
  if echo "$RESP" | ok; then
    echo "  SSL = Full (strict)"
  else
    echo "  ! could not set SSL"; echo "$RESP" | err
  fi
  RESP=$(cf PATCH "/zones/${ZONE_ID}/settings/always_use_https" '{"value":"on"}')
  if echo "$RESP" | ok; then
    echo "  Always Use HTTPS = on"
  fi
fi

# ── nameservers ──────────────────────────────────────────────────────────────
echo
echo "== FINAL MANUAL STEP =="
if [[ "$ZONE_ID" == "<pending>" ]]; then
  echo "  (dry run — re-run with --apply, then this prints the nameservers)"
else
  cf GET "/zones/${ZONE_ID}" | python3 -c "
import json,sys
r=json.load(sys.stdin).get('result',{})
ns=r.get('name_servers') or []
print('  Zone status: %s' % r.get('status'))
if ns:
    print('  Set these two nameservers at Namecheap (Domain List -> Manage -> Custom DNS):')
    for n in ns: print('    %s' % n)
else:
    print('  No nameservers returned yet — check the Cloudflare dashboard.')
"
fi
cat <<'EOF'

  BEFORE you switch nameservers:
    1. dig +short TXT resend._domainkey.soul-step.org   -> add this to Cloudflare by hand
    2. Diff the Cloudflare record list against docs/cloudflare-migration.md section 2
    3. Add a Cache Rule: URI path starts with /.well-known/  ->  Bypass cache
       (certbot's HTTP-01 renewal goes through the proxy once DNS moves)

  AFTER propagation, verify with the commands in docs/cloudflare-migration.md section 4,
  then optionally lock the origin firewall to Cloudflare ranges (section 5).
EOF
