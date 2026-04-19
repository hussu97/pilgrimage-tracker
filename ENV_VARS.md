# Environment Variables

This is the **single source of truth** for all environment variables across every SoulStep service.
The `.env.example` file in each service directory mirrors this document for local development — keep
them identical in content whenever a variable is added, renamed, removed, or has its default changed.

> **Legend**
> - **Mandatory** — must be set in production; the service will not function correctly without it.
> - **Optional** — has a sensible built-in default; override only when needed.
> - **Conditional** — required only when a related feature is enabled (noted in the description).
> - **Local dev only** — consumed by the dev toolchain (Vite, Python process), never sent to production.

---

## Production Platform Summary

| Platform | When to use it | Services |
|---|---|---|
| **GitHub Actions Secrets** (runtime) | All sensitive runtime values — API keys, passwords, DB credentials; written to VM `.env` at every deploy | Catalog API, Scraper API |
| **docker-compose.prod.yml env** | Non-sensitive runtime configuration passed to containers | Catalog API, Scraper API |
| **GitHub Actions secrets** (build-time) | Baked into the web JS bundle at CI build time | Customer Web, Admin Web |
| **EAS secrets** (build-time) | Baked into the mobile app bundle via Expo EAS | Mobile |
| `.env` / `.env.local` | Local development only — never committed | All services |

---

## 1. Catalog API (`soulstep-catalog-api`)

### Mandatory

#### GitHub Actions Secrets → VM `.env`

| Variable | Description |
|---|---|
| `JWT_SECRET` | HMAC-HS256 signing secret for access and refresh tokens. Generate: `python -c "import secrets; print(secrets.token_hex(32))"`. The default `dev-secret-change-in-production` **must** be replaced in production. |
| `CATALOG_API_KEY` | Shared secret for internal service-to-service calls (scraper → catalog API). Sent as the `X-API-Key` header by the scraper; must match `CATALOG_API_KEY` on the scraper. Generate: `openssl rand -hex 32`. |
| `POSTGRES_USER` | PostgreSQL username. Example: `soulstep`. Used by both the catalog API and scraper API. |
| `POSTGRES_PASSWORD` | PostgreSQL password. Generate: `openssl rand -hex 32`. Used by both services. |
| `POSTGRES_DB` | Catalog API database name. Example: `soulstep`. `docker-compose.prod.yml` assembles `DATABASE_URL` for the catalog-api as `postgresql://POSTGRES_USER:POSTGRES_PASSWORD@postgres:5432/POSTGRES_DB`. |
| `SCRAPER_POSTGRES_DB` | Scraper API database name. Example: `soulstep_scraper`. `docker-compose.prod.yml` assembles `DATABASE_URL` for the scraper-api as `postgresql://POSTGRES_USER:POSTGRES_PASSWORD@postgres:5432/SCRAPER_POSTGRES_DB`. Created automatically on first Postgres start via `docker/postgres-init.sql`. |
| `RESEND_API_KEY` | Resend.com API key for transactional email (password-reset flows). When unset, the reset link is printed to the console (dev fallback only). |

#### docker-compose.prod.yml (non-sensitive)

| Variable | Description |
|---|---|
| `CORS_ORIGINS` | Space-separated list of browser origins allowed to call this API. When unset, defaults to `localhost:5173` and `localhost:3000` (local dev only — **do not** leave unset in production). Example: `https://soul-step.org https://www.soul-step.org` |
| `FRONTEND_URL` | Public URL of the customer-facing web app. Used in OG share redirects, sitemap.xml, JSON-LD structured data, and email links. Default: `http://localhost:5173`. Example: `https://soul-step.org` |

---

### Optional

#### GitHub Actions Secrets → VM `.env` (optional)

| Variable | Default | Description |
|---|---|---|
| `GOOGLE_MAPS_API_KEY` | — | Google Places API key — required for place-search autocomplete. Enable "Places API (New)" at console.cloud.google.com. Without this key, all search-autocomplete requests return empty results. |

#### docker-compose.prod.yml (non-sensitive)

| Variable | Default | Description |
|---|---|---|
| `JWT_EXPIRE` | `30m` | Access-token lifetime. Accepts `30m`, `2h`, `7d`, or an integer number of minutes. |
| `REFRESH_EXPIRE` | `30d` | Refresh-token lifetime. Same format as `JWT_EXPIRE`. |
| `RESEND_FROM_EMAIL` | `noreply@soul-step.org` | "From" address for outgoing emails. Must be a verified sender domain in your Resend account. |
| `RESET_URL_BASE` | `http://localhost:5173` | Frontend base URL prepended to the reset token when building password-reset email links. Example: `https://soul-step.org` |
| `VERIFY_URL_BASE` | _(same as `RESET_URL_BASE`)_ | Frontend base URL for email-verification links. Defaults to `RESET_URL_BASE`. Example: `https://soul-step.org` |
| `LOG_LEVEL` | `INFO` | Log verbosity. Values: `DEBUG` \| `INFO` \| `WARNING` \| `ERROR` |
| `LOG_FORMAT` | `json` | Log format. `json` — structured JSON for Cloud Logging / Cloud Run. `text` — human-readable for local dev. |
| `GOOGLE_CLOUD_PROJECT` | — | GCP project ID. Required when using GCS image storage or Cloud Translation outside GCP. On Cloud Run, automatically inferred from workload identity — safe to omit. |
| `IMAGE_STORAGE` | `blob` | Backend for place images. `blob` — base64-encoded in the database (fine for SQLite and small deployments). `gcs` — Google Cloud Storage (recommended for production). |
| `GCS_BUCKET_NAME` | — | GCS bucket name. **Conditional** — required when `IMAGE_STORAGE=gcs`. Must match `GCS_BUCKET_NAME` in the scraper so both services share a single bucket. Example: `soulstep-images` |
| `DATA_SCRAPER_URL` | `http://localhost:8001` | URL of the soulstep-scraper-api instance. Used by admin scraper-proxy endpoints (`/api/v1/admin/scraper/*`). |

| `ADS_ENABLED` | `false` | Master switch for the ads subsystem. When `false`, the ads-config endpoint returns empty values for all clients. |
| `ADSENSE_PUBLISHER_ID` | — | **Conditional** — Google AdSense publisher ID. Required when `ADS_ENABLED=true` (web). Find in AdSense console: Ads → Overview → Publisher ID. Example: `ca-pub-xxxxxxxxxxxxxxxxxxxxxxxx` |
| `ADMOB_APP_ID_IOS` | — | **Conditional** — Google AdMob App ID for iOS. Required when `ADS_ENABLED=true` (mobile). Get from AdMob console: Apps → App settings → App ID. |
| `ADMOB_APP_ID_ANDROID` | — | **Conditional** — Google AdMob App ID for Android. Required when `ADS_ENABLED=true` (mobile). |
| `MIN_APP_VERSION_SOFT` | — | Soft update gate: clients below this semver see a non-blocking update banner but can still use the app. Leave unset to disable. Example: `1.0.0` |
| `MIN_APP_VERSION_HARD` | — | Hard update gate: clients below this semver receive HTTP 426 and cannot make API calls until they update. Leave unset to disable. |
| `LATEST_APP_VERSION` | — | Current latest release version — returned by `GET /api/v1/app-version`. Example: `1.0.0` |
| `APP_STORE_URL_IOS` | — | App-store deep-link URL for iOS shown inside update prompts. Example: `https://apps.apple.com/app/idXXXXXXXXX` |
| `APP_STORE_URL_ANDROID` | — | App-store deep-link URL for Android shown inside update prompts. Example: `https://play.google.com/store/apps/details?id=com.soulstep` |
| `SENTRY_DSN` | — | Sentry DSN for server-side error tracking. Passed to both catalog-api and scraper-api via `docker-compose.prod.yml`. When unset, error tracking is disabled. Example: `https://xxx@sentry.io/yyy` |

#### Local Dev Only (`.env`)

| Variable | Default | Description |
|---|---|---|
| `GOOGLE_APPLICATION_CREDENTIALS` | — | Path to a service-account JSON key file for GCP authentication. Only needed locally when accessing GCS or Cloud Translation. On Cloud Run, workload identity (ADC) is used automatically — **do not** set this in production. Example: `/path/to/service-account.json` |

---

## 2. Scraper API (`soulstep-scraper-api`)

### Mandatory

#### GitHub Actions Secrets → VM `.env`

| Variable | Description |
|---|---|
| `GOOGLE_MAPS_API_KEY` | Google Maps / Places API key — used by the GMaps collector for place discovery and detail fetching. Enable "Places API (New)" at console.cloud.google.com. **Not required** when `SCRAPER_BACKEND=browser` (browser mode makes no API calls). |
| `CATALOG_API_KEY` | Shared secret for catalog API internal endpoints (sent as `X-API-Key` header). Must match `CATALOG_API_KEY` on the catalog API. Required when `SCRAPER_TRIGGER_SEO_AFTER_SYNC=true` or when syncing places. Generate: `openssl rand -hex 32` |

#### docker-compose.prod.yml (non-sensitive)

| Variable | Description |
|---|---|
| `MAIN_SERVER_URL` | URL of the soulstep-catalog-api. Within the VM compose network, use `http://catalog-api:3000` (the docker service name). For the Cloud Run scraper Job, use `https://catalog-api.soul-step.org`. |

---

### Optional

#### GitHub Actions Secrets → VM `.env` (optional)

| Variable | Default | Description |
|---|---|---|
| `FOURSQUARE_API_KEY` | — | Foursquare API key — enriches places with categories and popularity. Free tier at foursquare.com/developer. When unset, the Foursquare collector is skipped gracefully. |
| `OUTSCRAPER_API_KEY` | — | Outscraper API key — retrieves extended Google reviews beyond the 5-review limit. Sign up at outscraper.com. When unset, the Outscraper collector is skipped gracefully. |
| `BESTTIME_API_KEY` | — | BestTime.app API key — adds busyness forecasts and peak-hours data. Sign up at besttime.app. When unset, the BestTime collector is skipped gracefully. |
| `KNOWLEDGE_GRAPH_API_KEY` | — | Google Knowledge Graph API key — fetches entity descriptions for places. Free at 100k requests/day via console.cloud.google.com. When unset, the Knowledge Graph collector is skipped gracefully. |
| `GEMINI_API_KEY` | — | Google Gemini API key — used for LLM tie-breaking when two candidate descriptions score within 0.15 of each other (~10–20% of places). Free key at aistudio.google.com. When unset, heuristic-only quality scoring is used. |
| `DATABASE_URL` | — | PostgreSQL connection string for the scraper's own database. In production, assembled by `docker-compose.prod.yml` as `postgresql://POSTGRES_USER:POSTGRES_PASSWORD@postgres:5432/SCRAPER_POSTGRES_DB` (e.g. `soulstep_scraper`). When unset, falls back to `SCRAPER_DB_PATH` (SQLite — local dev only). |

#### docker-compose.prod.yml (non-sensitive)

| Variable | Default | Description |
|---|---|---|
| `SCRAPER_ALLOWED_ORIGINS` | `http://localhost:5174,http://127.0.0.1:5174` | Comma-separated list of origins allowed to call this scraper API. Typically the admin web app running locally or in production. |
| `SCRAPER_TIMEZONE` | `UTC` | Fallback IANA timezone for places where Google Maps does not return a UTC offset. Example: `Asia/Dubai` |
| `SCRAPER_DB_PATH` | `scraper.db` | Path to the SQLite database file. Only used when `DATABASE_URL` is unset — local development only. **Do not rely on this in production:** Cloud Run containers have an ephemeral filesystem and all SQLite data is lost when the container exits. Set `DATABASE_URL` (PostgreSQL) instead. |
| `SCRAPER_POOL_SIZE` | `10` | **Conditional** — persistent PostgreSQL connections kept open per process. Only applied when `DATABASE_URL` is a PostgreSQL URL. |
| `SCRAPER_MAX_OVERFLOW` | `10` | **Conditional** — extra PostgreSQL connections allowed during traffic bursts. Budget: `SCRAPER_POOL_SIZE + SCRAPER_MAX_OVERFLOW` = max concurrent connections. |
| `SCRAPER_POOL_TIMEOUT` | `30` | **Conditional** — seconds to wait for a free PostgreSQL connection before raising an error. |
| `LOG_LEVEL` | `INFO` | Log verbosity. Values: `DEBUG` \| `INFO` \| `WARNING` \| `ERROR` |
| `LOG_FORMAT` | `text` | Log format. `text` — human-readable for local dev. `json` — structured JSON for Cloud Logging / Cloud Run. |
| `SCRAPER_BACKEND` | `api` | Discovery and detail-fetch backend. `api` — Google Places API HTTP calls; fast, reliable; requires `GOOGLE_MAPS_API_KEY`; costs ~$8 per 10K places. `browser` — Playwright/Chromium; no API calls, no cost; ~24–48 h per 10K places. |
| `SCRAPER_DISPATCH` | `local` | How scrape runs are executed after `POST /runs`. `local` — in-process via FastAPI BackgroundTasks. `cloud_run` — dispatches a Cloud Run Job via the GCP Jobs API. |
| `CLOUD_RUN_JOB_NAME` | `soulstep-scraper-job` | **Conditional** — Cloud Run Job name. Required when `SCRAPER_DISPATCH=cloud_run`. |
| `CLOUD_RUN_REGION` | `us-central1` | **Conditional** — GCP region for Cloud Run Job dispatch. Required when `SCRAPER_DISPATCH=cloud_run`. |
| `CLOUD_RUN_REGIONS` | — | Multi-region capacity config. Format: `region1:max_jobs,region2:max_jobs,...` (e.g. `europe-west1:3,europe-west4:5`). When set, the queue processor distributes jobs across regions based on available capacity. Falls back to `CLOUD_RUN_REGION` with max 5 jobs when unset. See [MULTI_REGION_JOBS.md](MULTI_REGION_JOBS.md). |
| `GOOGLE_CLOUD_PROJECT` | — | GCP project ID. Required for Cloud Run Job dispatch and Cloud SQL connections outside GCP. On Cloud Run, automatically inferred from workload identity — safe to omit. |
| `GCS_BUCKET_NAME` | — | **Conditional** — GCS bucket for scraped image storage. Required when the catalog API is configured with `IMAGE_STORAGE=gcs`. Must match `GCS_BUCKET_NAME` in the catalog API. Example: `soulstep-images` |
| `SCRAPER_DISCOVERY_CONCURRENCY` | `15` | Max concurrent Google Places `searchNearby` calls during discovery. |
| `SCRAPER_DETAIL_CONCURRENCY` | `30` | Max concurrent Google Places `getPlace` detail calls. |
| `SCRAPER_ENRICHMENT_CONCURRENCY` | `10` | Max places enriched (all collectors) in parallel. |
| `SCRAPER_OVERPASS_CONCURRENCY` | `2` | Max concurrent Overpass API requests across all enrichment workers. Keep low — Overpass is a public server with strict rate limits. |
| `SCRAPER_OVERPASS_JITTER_MAX` | `1.5` | Max random jitter (seconds) injected before each Overpass request to spread burst load. |
| `SCRAPER_MAX_PHOTOS` | `3` | Max photos stored per place. Google charges $0.007 per 1000 Photo Media requests — 3 covers list cards and the detail-page hero. |
| `SCRAPER_MAX_REVIEWS` | `5` | Max reviews scraped per place (Google Places API and browser extraction). |
| `SCRAPER_MAX_REVIEW_IMAGES` | `2` | **Browser mode only.** Max photos downloaded per review. Each review photo is uploaded to GCS and attached to the synced Review record. |
| `SCRAPER_IMAGE_CONCURRENCY` | `40` | Max concurrent image downloads (plain CDN, no API rate limit). |
| `SCRAPER_GATE_IMAGE_DOWNLOAD` | `0.75` | Quality gate (0.0–1.0) — places below this score are dropped before the image-download phase. Lower = more permissive. |
| `SCRAPER_GATE_ENRICHMENT` | `0.75` | Quality gate (0.0–1.0) — places below this score are dropped before the enrichment phase. |
| `SCRAPER_GATE_SYNC` | `0.75` | Quality gate (0.0–1.0) — places below this score are dropped before sync to the catalog. |
| `WIKIPEDIA_MAX_DISTANCE_KM` | `100` | Max distance (km) between a place's coordinates and a Wikipedia article's coordinates before the article is rejected as irrelevant. |
| `BROWSER_GRID_CELL_SIZE_KM` | `3.0` | **Browser mode only.** Side-length (km) of each fixed grid cell used to tile a search area. Smaller = more overlap, more coverage. |
| `MAPS_BROWSER_POOL_SIZE` | `3` | **Browser mode only.** Number of concurrent Playwright browser contexts. Each context is an isolated session with its own cookies and fingerprint. |
| `MAPS_BROWSER_MAX_PAGES` | `30` | **Browser mode only.** Max page navigations per browser context before recycling it (prevents fingerprint buildup). |
| `MAPS_BROWSER_HEADLESS` | `true` | **Browser mode only.** Run Chromium in headless mode. Set to `false` for local visual debugging. |
| `MAPS_BROWSER_CONCURRENCY` | `3` | **Browser mode only.** Max concurrent grid-cell navigations across all browser contexts. Keep at 1 (sequential) to avoid bot detection; raise to 2–3 only with rotating proxies. |
| `MAPS_BROWSER_CELL_DELAY_MIN` | `5.0` | **Browser mode only.** Minimum random delay (seconds) between consecutive cell navigations. Mimics human think-time. |
| `MAPS_BROWSER_CELL_DELAY_MAX` | `12.0` | **Browser mode only.** Maximum random delay (seconds) between consecutive cell navigations. Delay is sampled uniformly from `[CELL_DELAY_MIN, CELL_DELAY_MAX]`. |
| `SCRAPER_AUTO_SYNC_AFTER_RUN` | `false` | Automatically sync scraped places to the catalog API immediately after enrichment completes — no manual POST `/runs/{code}/sync` step needed. Requires `MAIN_SERVER_URL` and `CATALOG_API_KEY`. |
| `SCRAPER_TRIGGER_SEO_AFTER_SYNC` | `false` | Automatically call the catalog API's SEO-generation endpoint after each sync completes. Requires `CATALOG_API_KEY`. |

---

## 3. Customer Web (`apps/soulstep-customer-web`)

All variables are optional — the app uses relative URLs (`/api/v1/...`) and requires a reverse-proxy
or same-origin deployment when no absolute API URL is set.

All `NEXT_PUBLIC_*` variables are **baked into the JavaScript bundle at build time** and are visible
to anyone who inspects the built assets. Never put secrets in `NEXT_PUBLIC_*` vars.

### GitHub Actions Secrets (baked into build)

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_ADSENSE_PUBLISHER_ID` | — | **Conditional** — Google AdSense publisher ID. Required when the backend returns `ADS_ENABLED=true` for this client. When unset, the AdSense script is not loaded. Example: `ca-pub-xxxxxxxxxxxxxxxxxxxxxxxx` |
| `NEXT_PUBLIC_UMAMI_WEBSITE_ID` | — | Umami Cloud website ID for privacy-friendly, cookie-free analytics. When unset, Umami analytics are disabled. Example: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |
| `NEXT_PUBLIC_SENTRY_DSN` | — | Sentry DSN for client-side error tracking in the customer web app (`sentry.client.config.ts`). When unset, client-side error tracking is disabled. |

### Local Dev Only (`.env.local`)

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_PROXY_TARGET` | `http://127.0.0.1:3000` | Dev-server proxy target for `/api` requests. Only used by the Next.js dev server — has no effect in production builds. |
| `NEXT_PUBLIC_API_BASE_URL` | `https://catalog-api.soul-step.org` | Public API base URL — used on the Developers page to render example curl commands and API endpoint URLs. |
| `INTERNAL_API_URL` | — | **Server-only** — internal API URL for SSR metadata fetching. Set to the Cloud Run internal URL of the catalog API for low-latency server-side fetches that don't route through the public internet. Falls back to `NEXT_PUBLIC_API_BASE_URL`, then `https://catalog-api.soul-step.org`. Never use `NEXT_PUBLIC_` prefix — this must remain server-side only. Example: `https://soulstep-catalog-api-xxxx.europe-west1.run.app` |

---

## 4. Admin Web (`apps/soulstep-admin-web`)

All admin web variables are optional. There are no mandatory production variables — the admin web
routes all API calls through the catalog proxy at `/api/v1/admin/scraper` by default.

All `VITE_*` variables are **baked into the JavaScript bundle at build time** and are visible to
anyone who inspects the built assets. `API_PROXY_TARGET` is consumed only at dev-server startup
and is never exposed to the browser bundle.

### GitHub Actions Secrets (baked into build)

| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | _(relative)_ | Catalog API base URL used by the admin web API client. When unset, the app uses relative URLs. Set in production if the admin app is deployed separately from the catalog API. Example: `https://catalog-api.soul-step.org` |
| `VITE_SENTRY_DSN` | — | Sentry DSN for client-side error tracking in the admin web app (`src/lib/sentry.ts`). When unset, error tracking is disabled. Example: `https://xxx@sentry.io/yyy` |

### Local Dev Only (`.env.local`)

| Variable | Default | Description |
|---|---|---|
| `API_PROXY_TARGET` | `http://127.0.0.1:3000` | Catalog API URL used by the Vite dev server to proxy `/api` requests. **Not** `VITE_`-prefixed — consumed by `vite.config.ts` at startup, never exposed to the browser. Hybrid mode: set to `https://catalog-api.soul-step.org` to run the local admin UI against the production catalog API. |
| `VITE_SCRAPER_API_URL` | — | Direct URL for the soulstep-scraper-api. When set, the admin web calls the scraper at this URL directly, bypassing the catalog proxy. Used for local hybrid mode (local scraper + production catalog API). Example: `http://127.0.0.1:8001` |
| `VITE_FRONTEND_URL` | `https://soul-step.org` | Public URL of the customer-facing web frontend. Used in the SEO detail page to generate place-preview links for review. |

---

## 5. Mobile (`apps/soulstep-customer-mobile`)

All mobile variables are optional. There are no mandatory production variables — the app ships with
a default API URL of `http://127.0.0.1:3000` which must be overridden for production builds.

All `EXPO_PUBLIC_*` variables are **bundled into the JavaScript at build time** and are visible to
anyone who decompiles the app bundle. Never put secrets in `EXPO_PUBLIC_*` vars.

### EAS Secrets (baked into build)

| Variable | Default | Description |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | `http://127.0.0.1:3000` | Backend API base URL used by the API client. Simulator (iOS/Android): `127.0.0.1` resolves to your machine — default works. Physical device / Expo Go: use your machine's LAN IP (e.g. `192.168.1.x:3000`) because the device cannot reach localhost on your laptop. Production: set to the public Cloud Run URL. Example: `https://catalog-api.soul-step.org` |
| `EXPO_PUBLIC_INVITE_LINK_BASE_URL` | — | Base URL prepended to the invite code when sharing a group invite link. When unset, the invite link sharing feature is disabled. Example: `https://soul-step.org/invite` |
| `EXPO_PUBLIC_ADMOB_APP_ID_IOS` | — | **Conditional** — AdMob App ID for iOS. Required when the AdMob SDK is initialised in `app.json` / `app.config.ts`. When unset, AdMob initialisation is skipped and no ads are shown. |
| `EXPO_PUBLIC_ADMOB_APP_ID_ANDROID` | — | **Conditional** — AdMob App ID for Android. Required when the AdMob SDK is initialised in `app.json` / `app.config.ts`. |
| `EXPO_PUBLIC_UMAMI_WEBSITE_ID` | — | Umami Cloud website ID for privacy-friendly, cookie-free analytics. When unset, Umami analytics are disabled. Example: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |
| `EXPO_PUBLIC_SENTRY_DSN` | — | Sentry DSN for error tracking in the mobile app (`index.js`). When unset (or in dev), error tracking is disabled. Example: `https://xxx@sentry.io/yyy` |
