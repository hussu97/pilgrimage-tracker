# Putting Cloudflare (free) in front of the SoulStep APIs

**Status:** origin side done and verified 2026-08-02. The nameserver switch is the only
remaining step and needs the Cloudflare + Namecheap accounts.

**Why:** `catalog-api` already sets `Cache-Control` (`max-age=600` on places, `31536000
immutable` on images) and gzips responses, so a Cloudflare edge absorbs repeat traffic and cuts
VM egress. It also gives free bot controls, which matter because `robots.txt` deliberately
invites GPTBot / ClaudeBot / PerplexityBot, and it removes the constant internet scan noise
currently hitting nginx directly (`/cgi-bin/index2.asp` probes and bare-IP scans show up in the
access log continuously).

Cloudflare's free plan **requires** moving nameservers to Cloudflare — the CNAME-only
("partial") setup is a Business-plan feature. So the apex and every subdomain move with it, and
the records below must survive the import.

---

## 1. Already done (origin side)

| Change | Where |
|---|---|
| `set_real_ip_from` for all Cloudflare IPv4/IPv6 ranges + `real_ip_header CF-Connecting-IP` | `nginx/conf.d/cloudflare-real-ip.conf`, wired in via `nginx/Dockerfile` — **deployed and live** |
| uvicorn `--proxy-headers --forwarded-allow-ips='*'` | `soulstep-catalog-api/Dockerfile` — **ships on next CI build** |

Without the first, every request would arrive as a Cloudflare edge IP and the
`limit_req_zone $binary_remote_addr` bucket in `nginx.conf` would silently become a single
global rate limit instead of per-IP.

**Verified not spoofable.** Sending a forged header from a non-Cloudflare address is correctly
ignored — nginx logged the real client IP, not the forged one:

```bash
curl -H "CF-Connecting-IP: 1.2.3.4" https://catalog-api.soul-step.org/health
# nginx access log showed the caller's true IP, not 1.2.3.4 ✓
```

That is the whole point of scoping `set_real_ip_from` to Cloudflare's ranges. If you ever widen
it, anyone can forge their source IP and bypass rate limiting.

---

## 2. DNS snapshot taken before migration — 2026-08-02 11:06 UTC

Keep this. After Cloudflare imports the zone, diff its record list against this table. Anything
missing must be added by hand **before** you switch nameservers.

| Name | Type | Value | Breaks if lost |
|---|---|---|---|
| `soul-step.org` | A | `216.198.79.1` | Vercel — main site |
| `www` | CNAME | `14207b2dfa71a2e3.vercel-dns-017.com` | Vercel — www |
| `admin` | CNAME | `06a73ed78e2f883a.vercel-dns-017.com` | Vercel — admin dashboard |
| `catalog-api` | A | `34.76.105.103` | the VM — catalog API |
| `scraper-api` | A | `34.76.105.103` | the VM — scraper API |
| `soul-step.org` | TXT | `hosting-site=project-fa2d7f52-2bc4-4a46-8ae` | Firebase hosting verification |
| `soul-step.org` | TXT | `google-site-verification=mlxZoEm7pzR6gMQ2s1RHt17BOGTQIXT0oAJQeeilv3E` | Search Console |
| `_dmarc` | TXT | `v=DMARC1; p=none;` | DMARC policy |
| `resend._domainkey` | TXT | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDMh48HBbjUyb/N5MrEtt…` | ⚠️ **outbound email** |

⚠️ **`resend._domainkey` is the one to watch.** It is the DKIM key for Resend. If it does not
come across, every transactional email silently starts failing or landing in spam — password
resets, email verification, notifications.

There are **no MX records**, so there is no inbound mail to break. There are no AAAA and no CAA
records.

Re-run the snapshot any time with:

```bash
for T in NS SOA A AAAA MX TXT CAA; do echo "-- $T --"; dig +short $T soul-step.org; done
for S in www admin catalog-api scraper-api; do echo "$S: $(dig +short $S.soul-step.org)"; done
dig +short TXT _dmarc.soul-step.org resend._domainkey.soul-step.org
```

---

## 3. Cutover

1. Cloudflare → **Add a site** → `soul-step.org` → **Free** plan. It scans and imports records.
2. **Diff the imported list against the table above.** Add anything missing. This is the step
   that breaks domains — do not skip it.
3. Set proxy status:
   - `catalog-api` → **Proxied** (orange cloud)
   - `scraper-api` → **Proxied** (orange cloud)
   - apex, `www`, `admin` → **DNS only** (grey cloud) so Vercel keeps serving them
4. **SSL/TLS → Overview → Full (strict).** The origin has a valid Let's Encrypt cert
   (renewed 2026-08-02, valid to 31 Oct), so strict works and anything weaker is pointless.
5. Namecheap → Domain List → `soul-step.org` → Nameservers → **Custom DNS** → the two
   Cloudflare nameservers. Propagation is usually well under an hour.

### Keep certbot working

The HTTP-01 challenge now passes through Cloudflare. Leave port 80 open on the origin and add a
Cloudflare **Cache Rule**: if URI path starts with `/.well-known/` → **Bypass cache**.
If a renewal ever fails, check this first.

---

## 4. After cutover — verify

```bash
# Should show a cf-ray header
curl -sI https://catalog-api.soul-step.org/health | grep -iE "cf-ray|server"

# Everything still 200
for H in catalog-api scraper-api; do
  curl -sS -o /dev/null -m 20 -w "$H: %{http_code}\n" https://$H.soul-step.org/health
done
curl -sS -o /dev/null -m 20 -w "apex: %{http_code}\n" https://soul-step.org

# Origin must log REAL client IPs, not 104.x / 172.71.x / 162.158.x
docker compose -f /opt/soulstep/docker-compose.prod.yml logs --tail=30 nginx

# DKIM must still resolve, or transactional email quietly dies
dig +short TXT resend._domainkey.soul-step.org
```

If nginx still logs Cloudflare ranges, `cloudflare-real-ip.conf` did not load:

```bash
docker exec soulstep-nginx-1 ls /etc/nginx/conf.d/   # expect cloudflare-real-ip.conf + default.conf
docker exec soulstep-nginx-1 nginx -t
```

---

## 5. After cutover — lock the origin to Cloudflare (optional, recommended)

Once traffic is confirmed flowing through Cloudflare, stop accepting direct connections. This
also ends the constant scanner noise in the access log.

**Do not run this until step 4 passes** — it will cut off direct access to the APIs.

```bash
export P=project-fa2d7f52-2bc4-4a46-8ae A=pilgrimage.tracker@gmail.com

CF=$(curl -s https://www.cloudflare.com/ips-v4 | paste -sd, -)

gcloud compute firewall-rules create allow-http-https-cloudflare \
  --project=$P --account=$A --network=default --direction=INGRESS \
  --action=ALLOW --rules=tcp:80,tcp:443 --source-ranges="$CF" \
  --description="Origin reachable only via Cloudflare edge"

# Then remove the open-to-the-world rules
gcloud compute firewall-rules delete allow-http-https soulstep-allow-http-https \
  --project=$P --account=$A --quiet
```

Rollback if something breaks:

```bash
gcloud compute firewall-rules create allow-http-https --project=$P --account=$A \
  --network=default --direction=INGRESS --action=ALLOW --rules=tcp:80,tcp:443 \
  --source-ranges=0.0.0.0/0 --target-tags=http-server,https-server
```

### While you are in the firewall

Two unrelated rules found during the 2026-08-02 audit that should go:

```bash
# RDP open to the whole internet on a Debian VM — serves no purpose
gcloud compute firewall-rules delete default-allow-rdp --project=$P --account=$A --quiet

# SSH open to 0.0.0.0/0 — narrow to your own IP, or move to IAP
gcloud compute firewall-rules update default-allow-ssh --project=$P --account=$A \
  --source-ranges="YOUR.IP.HERE/32"
```
