# Changelog

All notable changes from implementing [IMPLEMENTATION_PROMPTS.md](IMPLEMENTATION_PROMPTS.md) and project process are documented here.

---

## [2026-05-05] — City place listing search + infinite scroll

### Backend
- Updated `GET /api/v1/cities/{city_slug}` and `GET /api/v1/cities/{city_slug}/{religion}` to accept `q` for place search across name, address, religion, and place type while preserving pagination.

### Frontend (web)
- Added search to `/explore/:citySlug` and `/explore/:citySlug/:religion` city listing pages.
- Replaced manual city place pagination with IntersectionObserver infinite scroll on desktop and mobile web.

### Tests
- Added backend coverage for city place search and city/religion place search.
- Added customer-web API client coverage for city place search query parameters.

---

## [2026-05-05] — Admin blog management + blog improvements

### Backend
- Added `view_count` and `link_click_count` columns to `blog_post` table (migration 0030).
- Made migration 0030 skip pre-existing blog metric columns so partially applied databases can rerun the migration safely.
- New admin blog CRUD endpoints under `GET|POST /api/v1/admin/blog/posts`, `PATCH|DELETE /api/v1/admin/blog/posts/{post_code}` — paginated list with search/category/status filters, create, update, delete.
- New `POST /api/v1/admin/blog/link-preview` endpoint: fetches Open Graph metadata (title, description, image, site_name) for a URL using httpx.
- Updated public `GET /api/v1/blog/posts` to support `search`, `category`, `tag`, and `limit` query parameters.
- New `POST /api/v1/blog/posts/{slug}/view` and `POST /api/v1/blog/posts/{slug}/link-click` endpoints for fire-and-forget metrics tracking.

### Frontend (web)
- Removed an unused React import from the blog listing page so the Next.js production build passes TypeScript checks.
- **Homepage**: Added a blog carousel section below the main places grid showing the 8 most recent blog posts with a 2.3-item peek effect on mobile and a 3–4 column grid on desktop. Includes a "View all" link to `/blog`.
- **Blog listing page**: Replaced static grid with an interactive filtering UI — keyword search, category pill filters, reading-time filter, and tag chips. Shows result count, empty state with clear-filters CTA, hover transitions, and tag badges on each card.
- **Blog post page**: URLs embedded in article paragraphs are now rendered as clickable links. A "Links in this article" section at the bottom of every post shows styled link preview cards (favicon + domain + URL) for each detected URL. Clicking any link fires a `POST /…/link-click` tracking call. A `POST /…/view` tracking call fires on first post load.
- Updated `getBlogPosts()` API client function to accept `search`, `category`, `tag`, and `limit` filters.

### Frontend (admin)
- New **Blog** section in the admin sidebar (BookOpen icon).
- **Blog list page** (`/blog`): paginated table of all posts (published and drafts) with columns for title/slug, category, published status, view count, link-click count, reading time, and publish date. Filter by search, category, and publish status. Metric stat cards show totals at a glance.
- **Blog create/edit page** (`/blog/new`, `/blog/:postCode/edit`): full-featured form with cover gradient preview, section editor (add/remove/reorder sections and paragraphs), tag input, category and reading-time fields, FAQ editor, published/draft toggle, and live link-preview detection — when a URL is typed into any paragraph, the admin preview card appears automatically via the `/admin/blog/link-preview` endpoint.

### Tests
- 15 new backend tests for public blog filtering and view/link-click tracking (`test_blog.py`).
- 14 new backend tests for admin blog CRUD, search, auth guards, and metric columns (`test_admin_blog.py`).
- Added regression coverage for idempotent blog metrics migration behavior.

---

## [2026-05-04] — Local handoff status table

### Backend
- **`soulstep-scraper-api/scripts/handoff.py`** — added `status-table`, which reports local handoff and direct catalog sync runs in a markdown table with active stage, screen activity, stage completion, 30-minute throughput, and ETA.
- **`soulstep-scraper-api/scripts/handoff.py`** — status table ETAs are now rendered as absolute Dubai-time completion timestamps instead of duration strings.
- **`soulstep-scraper-api/app/pipeline/enrichment.py`** — added per-place enrichment completion logs so local enrichment rates and ETAs can be calculated from recent log history.
- **`soulstep-catalog-api/app/jobs/sync_places.py`** — added direct catalog sync progress logs with scanned/synced/filter counters for recent sync throughput reporting.

### Docs
- Documented the new `status-table` command in `soulstep-scraper-api/README.md`.

### Tests
- Added handoff CLI coverage for detail-fetch status table throughput and ETA output.

---

## [2026-05-04] — Local handoff browser concurrency

### Backend
- **`soulstep-scraper-api/scripts/handoff.py`** — raised the default local handoff browser profile for `start-local-bg` / `resume-bg` from discovery/browser pool/browser concurrency `7` to `9` while keeping detail concurrency `30`, image concurrency `40`, max place photos `3`, and review images `0`.

### Docs
- Updated `soulstep-scraper-api/README.md` so the documented local handoff profile and example overrides match the new browser concurrency defaults.

---

## [2026-05-02] — Faster local handoff enrichment

### Backend
- Added local handoff enrichment tuning defaults and CLI overrides so resumed large runs use `SCRAPER_ENRICHMENT_CONCURRENCY=25`, `SCRAPER_OVERPASS_CONCURRENCY=8`, and `SCRAPER_OVERPASS_JITTER_MAX=0.25` instead of falling back to slow production defaults.
- Restored the scraper enrichment default to `10` workers and made Foursquare disable itself after auth failures so an invalid key does not add a wasted HTTP call to every remaining place.

### Docs
- Documented the local enrichment tuning profile and exposed enrichment/Overpass env vars in the production env template.

### Tests
- Added coverage for handoff enrichment tuning env injection and Foursquare auth-failure short-circuiting.

---

## [2026-05-02] — Desktop navigation hardening

### Frontend (web)
- Switched the desktop header navigation to native anchors so browser navigation still works even if client-side route interception is interrupted by stale app-shell state or runtime noise.
- Bumped the customer web release marker to refresh returning desktop browsers and allowed Sentry ingest endpoints in CSP to stop production error reporting from being blocked in the console.

### Tests
- Added customer-web regression coverage for the native desktop header navigation fallback and release marker bump.

---

## [2026-05-02] — Place image fallback hardening

### Frontend (web)
- Added a shared `PlaceImage` renderer that swaps missing or broken place, journey, city, deity, and review thumbnails to an accessible decorative SoulStep-style placeholder.
- Updated place cards, rows, detail heroes, journey covers, city cards, check-ins, and journey creation/edit surfaces to use the guarded renderer instead of showing broken image icons.

### Tests
- Added customer-web regression coverage for missing image placeholders, broken image fallback, and non-decorative fallback labelling.

---

## [2026-05-02] — SoulStep favicon branding

### Frontend (web)
- Replaced the customer-web timer favicon with the SoulStep brand mark and added PNG/ICO/apple-touch icon variants for browser tabs, bookmarks, and install surfaces.
- Added a web manifest route using SoulStep icon assets and bumped the customer web release marker so returning browsers refresh stale favicon metadata.

### Tests
- Added customer-web regression coverage that the favicon is the SoulStep mark and that manifest icon assets exist.

---

## [2026-05-02] — Local handoff concurrency profile

### Backend
- **`soulstep-scraper-api/scripts/handoff.py`** — made local handoff `start-local-bg` / `resume-bg` default to the large-run laptop profile: discovery/browser pool/browser concurrency `7`, detail concurrency `30`, image concurrency `40`, max place photos `3`, and review images `0`.
- **`soulstep-scraper-api/scripts/handoff.py`** — added `--discovery-concurrency` support so the browser pool cap and discovery navigation cap can be kept aligned from the CLI.
- **`soulstep-scraper-api/scripts/handoff.py`** — local handoff monitor now treats `needs_recapture` assets as unfinished work, preventing finalize/catalog sync from starting before recapture backlog is clean.

### Docs
- Documented the default local handoff tuning profile in `soulstep-scraper-api/README.md` and `PRODUCTION.md`.

### Tests
- Added handoff CLI coverage for the default local tuning profile, explicit override behavior, and recapture backlog finalization blocking.

---

## [2026-05-01] — AdSense low-value content hardening

### Frontend (web)
- Removed the root-shell `useSearchParams` CSR bailout so public pages prerender meaningful HTML instead of the splash/loading shell.
- Seeded the web i18n provider with backend English translations during SSR so crawler-visible content shows real copy, not translation keys.
- Added visible editorial guidance to indexable discovery, places, explore, blog, city, and place pages; rendered `/` as the real home page; and marked the interactive map page `noindex, follow`.
- Bumped the customer web release marker so returning browsers refresh stale app-shell state.

### Tests
- Added coverage for crawl-visible public editorial content and reran the full customer-web Vitest suite, typecheck, and production build.

---

## [2026-05-01] — Homepage serialization and null-coordinate hardening

### Backend
- **`soulstep-catalog-api/app/api/v1/homepage.py`** — encoded the composite homepage payload with FastAPI's JSON encoder before returning `JSONResponse`, preventing journey/group datetime fields from crashing response serialization.

### Frontend (web)
- **`apps/soulstep-customer-web`** — made place coordinate types nullable where catalog rows can lack coordinates and guarded map/directions surfaces so null `lat`/`lng` values do not crash the app.

### Tests
- Added homepage serialization regression coverage and customer-web coordinate/discovery draft tests for null-coordinate places.

---

## [2026-04-29] — Mobile responsiveness and translation fixes

### Frontend (web)
- Fixed mobile horizontal overflow by adding `overflow-x-hidden` to the root layout container, preventing any overflowing element from causing the page to scroll horizontally on mobile.

### Backend
- Added 10 missing translation keys in all five languages (en, ar, hi, te, ml): `common.close`, `common.search`, `common.showMap`, `common.hideMap`, `groups.active`, `groups.activeStreak`, `groups.create`, `groups.journeyCount`, `groups.journeyFound`, `checkins.noVisitsOnDate`.

---

## [2026-04-29] — Frontend release freshness rule

### Docs
- Added a project rule requiring frontend changes that affect the app shell, navigation, first-screen UX, translations, service-worker cleanup, or client-side cache behavior to bump or verify the customer web release marker so returning Safari/iOS browsers cannot stay on stale UI.

---

## [2026-04-29] — Safari stale web shell refresh

### Frontend (web)
- Added a release-aware refresh guard that clears persisted API caches, unregisters legacy service workers, deletes Cache Storage, and reloads once with a cache-busting URL when a browser profile carries stale SoulStep web state.
- Versioned the legacy service-worker cleanup marker so future release refreshes can rerun cleanup instead of being blocked by an older session marker.

---

## [2026-04-29] — Discovery-first customer web journey redesign

### Frontend (web)
- Reworked the customer web Home surface into a cleaner Discover experience with search, shared filters, recommended places, non-blocking first-visit guidance, and a selected-places tray for starting a journey.
- Made `/journeys` the canonical journeys route, with `/groups/*` kept as redirect-compatible legacy URLs, and updated customer navigation to visible Discover, Map, Journeys, and Profile destinations.
- Simplified journey creation so `/journeys/new` starts with place selection and can prefill from Discover-selected places instead of forcing intent cards first.
- Standardized discovery filters across the Discover, Places, and Map surfaces and filtered low-quality city labels from home discovery modules.
- Moved CSP into real Next.js headers, removed pre-consent AdSense script loading, and guarded invite-link rendering from server-side `window` access.

### Backend
- Added translation keys for the redesigned web discovery and journey-planning UI in all supported languages.

### Docs
- Updated the customer web README to reflect the canonical Discover/Journeys route model.

### Tests
- Added discovery utility coverage for city-quality filtering and selected-place journey draft serialization.

---

## [2026-04-29] — Web-only cleanup, Umami proxy, and mobile browser layout hardening

### Backend
- **`soulstep-catalog-api`** — removed native-app version enforcement endpoints, admin app-version management, the `AppVersionConfig` model/seed rows, hard-update middleware, and mobile-only env vars; added migration `0029_drop_app_version_config.py`.
- **Ads config** — simplified ad configuration to web-only (`platform=web`) while leaving historical analytics platform fields intact.

### Frontend (web)
- **Umami** — moved tracking to neutral same-origin `/lib/app.js` plus server-side `/api/send`, removed the broken domain filter, and forced `data-do-not-track="false"`.
- **Cache cleanup** — removed stale Vite/PWA entry files, added service-worker tombstones for `/sw.js`, `/service-worker.js`, and `/registerSW.js`, and added one-time client cleanup for old service workers and Cache Storage entries.
- **Mobile web layout** — centralized bottom-nav sizing with `--mobile-bottom-nav-height` and offset sticky footers, FABs, map sheets, footers, and page padding so bottom actions remain reachable.
- **Native app removal** — deleted `apps/soulstep-customer-mobile/` and removed mobile CI paths/jobs.

### Admin
- Removed the App Versions admin page, route, API helpers, types, and tests.

### Docs
- Updated README, architecture, production env docs, project rules, roadmap, Umami analytics notes, and web/legal/static copy for the web-only product.

### Tests
- Added service-worker cleanup unit coverage and a Playwright mobile-bottom-nav regression for `/home`, `/places`, `/groups`, `/places/:code`, and `/map`; updated backend/admin tests for removed app-version and web-only ad config behavior.

---

## [2026-04-28] — Requeue pending detail placeholders on resume

### Backend
- **`soulstep-scraper-api/app/scrapers/gmaps_shared.py`** — local/prod scraper resume now removes non-terminal `detail_fetch_status='pending'` placeholder rows before building the already-fetched skip list, so interrupted handoff runs do not silently strand pending places outside the detail-fetch queue.

### Tests
- **`soulstep-scraper-api/tests/test_browser_gmaps.py`** — added regression coverage proving pending detail placeholders are re-fetched on resume while completed places still advance progress idempotently.

---

## [2026-04-27] — Browser detail fetch watchdog

### Backend
- **`soulstep-scraper-api/app/collectors/gmaps_browser.py`** — added a hard 600-second watchdog around each browser place-detail fetch and recycle the browser session on cancellation so a single wedged Google Maps page cannot stall a local handoff worker for hours.
- **`soulstep-scraper-api/app/constants.py`** — centralized the new per-place detail watchdog limit as `BROWSER_DETAIL_TIMEOUT_S`.

### Tests
- **`soulstep-scraper-api/tests/test_browser_gmaps.py`** — added coverage for the hard detail watchdog and cancellation-triggered browser session recycling.

---

## [2026-04-27] — Harden ads.txt for ad crawlers

### Frontend (web)
- **`apps/soulstep-customer-web/vercel.json`** — added an explicit `/ads.txt` header override so the static Google seller file is served as `text/plain` with crawler-friendly cache headers instead of inheriting the app-shell `no-store` policy.
- **`apps/soulstep-customer-web/vercel.json`** and **`nginx.conf`** — applied the same crawler-friendly cache behavior to `/robots.txt`, `/llms.txt`, and `/.well-known/*`, including Docker/nginx deployments, while keeping the app shell itself on `no-store`.

### Tests
- **`apps/soulstep-customer-web/src/__tests__/adsTxt.test.ts`** — added regression coverage for the static Google seller entry, canonical robots sitemap URL, and Vercel crawler-file header overrides.

---

## [2026-04-27] — Chunked sitemap index for large catalogues

### Backend
- **`soulstep-catalog-api/app/api/v1/sitemap.py`** — `/sitemap.xml` now returns a sitemap index, `/sitemaps/static.xml` serves static/blog/city URLs, and `/sitemaps/places-N.xml` serves bounded place chunks with hreflang and image sitemap entries so large catalogues no longer produce oversized XML responses.
- **`soulstep-catalog-api/app/api/v1/seo_static.py`** — updated `llms.txt` endpoint copy to describe sitemap index behavior.

### Frontend (web)
- **`apps/soulstep-customer-web/app/api/sitemap/route.ts`** and **`app/api/sitemaps/[...path]/route.ts`** — proxy sitemap index and chunk files through `soul-step.org` without Next ISR body caching, avoiding Vercel `FALLBACK_BODY_TOO_LARGE` failures.
- **`apps/soulstep-customer-web/next.config.ts`** — added `/sitemaps/:path*` rewrite to the new sitemap chunk proxy route.

### Docs
- **`ARCHITECTURE.md`**, **`soulstep-catalog-api/README.md`**, **`apps/soulstep-customer-web/README.md`**, and **`apps/soulstep-customer-web/public/llms.txt`** — documented the sitemap index/chunk layout.

### Tests
- **`soulstep-catalog-api/tests/test_seo.py`** and **`tests/test_seo_p2.py`** — added coverage for sitemap index generation, bounded place chunks, static sitemap URLs, image sitemap entries, and hreflang URLs in place chunks.

---

## [2026-04-27] — Detached direct catalog sync workers

### Backend
- **`soulstep-catalog-api/app/api/v1/admin/sync_places.py`** — direct scraper-to-catalog control requests now launch the existing `app.jobs.sync_places` CLI as a detached process with run-scoped logs instead of FastAPI `BackgroundTasks`, so large finalize syncs are not tied to a uvicorn worker lifetime.
- **`soulstep-catalog-api/app/jobs/sync_places.py`** — direct sync now publishes running progress counters to the scraper DB during batch processing and marks the sync failed with an explicit error if the job crashes before completion.
- **`docker-compose.prod.yml`** and **`.env.example`** — added `CATALOG_SYNC_LOG_DIR` for detached direct sync job logs.

### Docs
- **`README.md`**, **`ARCHITECTURE.md`**, **`PRODUCTION.md`**, **`soulstep-catalog-api/README.md`**, and **`soulstep-scraper-api/README.md`** — documented that direct catalog sync is the default durable production path for future finalize/sync operations.

### Tests
- **`soulstep-catalog-api/tests/test_jobs.py`** — added coverage for detached control-job launch and crash-state publication back into the scraper DB.

---

## [2026-04-25] — Fix Vercel cache headers for frontend app shell

### Frontend (web)
- **`apps/soulstep-customer-web/vercel.json`** — added `headers` config: catch-all `no-store, no-cache, must-revalidate` for all paths (covers `index.html` and `sw.js`), then overrides with `public, max-age=31536000, immutable` for `/assets/*` (content-hashed JS/CSS bundles). Previously `vercel.json` only set the region, so Vercel applied no `Cache-Control` at all and browsers used heuristic caching on the HTML shell.

---

## [2026-04-25] — Fix browser caching of frontend app shell

### Frontend (web)
- **`apps/soulstep-customer-web/nginx.conf`** — added `Cache-Control: no-store, no-cache, must-revalidate` to the `location /` block so browsers and CDNs never heuristically cache `index.html` (the entry point that references hashed asset bundles).
- **`apps/soulstep-customer-web/vite.config.ts`** — removed `html` from Workbox `globPatterns` so the service worker no longer precaches `index.html`; added a `NetworkFirst` runtime caching strategy for navigation requests (3-second network timeout before falling back to cache); added `skipWaiting: true` and `clientsClaim: true` so a newly installed service worker takes control of all open tabs immediately without waiting for a full browser restart.

---

## [2026-04-25] — Direct catalog sync quality-only filtering

### Backend
- **`soulstep-catalog-api/app/jobs/sync_places.py`** — direct scraper-to-catalog sync now treats catalog quality/name gates as the only sync eligibility filters, allowing places outside a child run's boundary box or country to sync when they pass those gates while preserving SQLite local fallback behavior and Postgres streaming for large runs.

### Tests
- **`soulstep-catalog-api/tests/test_jobs.py`** — added regression coverage that high-quality out-of-country/out-of-box scraper rows are sent to catalog ingestion while low-quality and generic-name rows remain filtered.

---

## [2026-04-25] — Direct DB catalog sync for handoff finalization

### Backend
- **`soulstep-scraper-api/app/services/handoff.py`** — fixed prod finalize imports to regenerate local-only numeric IDs for run-scoped handoff rows, preventing local SQLite primary keys from colliding with existing production Postgres rows while preserving run/place/cache status data.
- **`docker-compose.prod.yml`** — increased the scraper-api VM memory limit so large handoff finalize imports can deserialize and swap run bundles without OOM-restarting the API container.
- **`.github/workflows/tests.yml`** — made production Compose changes trigger the VM deploy workflow so resource-limit updates actually recreate the running services.
- **`soulstep-catalog-api/app/services/place_ingest.py`** — factored catalog place ingestion into a shared service used by both `/places/batch` and direct DB jobs, preserving the existing quality/name/religion/attribute/review/translation behavior.
- **`soulstep-catalog-api/app/jobs/sync_places.py`** — added run-scoped direct scraper-to-catalog DB sync with `--run-code`, `--failed-only`, and `--dry-run`; the job streams scraper rows by run, updates scraper sync counters/status, and records direct catalog sync telemetry.
- **`soulstep-catalog-api/app/api/v1/admin/sync_places.py`** and **`soulstep-scraper-api/app/db/scraper.py`** — added the small authenticated control endpoint and scraper trigger path so finalize/sync can avoid bulk `/places/batch` uploads.
- **`soulstep-catalog-api/app/services/place_ingest.py`** — direct sync now replaces catalog images only when incoming scraper image count is equal or higher, otherwise preserving existing images and counting the preservation.
- **`docker-compose.prod.yml`** and **`.github/workflows/*env*`** — wired `SCRAPER_DATABASE_URL` for catalog-api and `SCRAPER_DIRECT_CATALOG_SYNC` for scraper-api production deployments.

### Docs
- **`README.md`**, **`ARCHITECTURE.md`**, **`PRODUCTION.md`**, **`soulstep-catalog-api/README.md`**, and **`soulstep-scraper-api/README.md`** — documented direct DB sync architecture, config, CLI, endpoint, and monitor counters.

### Tests
- **`soulstep-catalog-api/tests/test_jobs.py`** — added coverage for run-scoped direct sync status/counter writes and the catalog image replace/preserve rule.
- **`soulstep-scraper-api/tests/test_sync.py`** — added coverage that direct mode triggers the catalog control endpoint instead of posting catalog batches.
- **`soulstep-scraper-api/tests/test_handoff.py`** — added regression coverage for finalizing a bundle whose local surrogate IDs collide with existing production rows.

---

## [2026-04-25] — Background catalog sync finalization monitor

### Backend
- **`soulstep-scraper-api/scripts/handoff.py`** — added `finalize-bg` / `finalize-watch` so completed local handoff runs can rebuild a fresh finalize bundle from the local DB, upload it to production, and monitor the production catalog sync in a detached `screen` job.
- **`soulstep-scraper-api/scripts/handoff.py`** — stores refreshed finalize bundles and JSON-line catalog sync logs under `local-handoffs/` for each run.
- **`soulstep-scraper-api/scripts/handoff.py`** — added `monitor`, which checks local handoff runs and starts the background catalog sync job exactly once when a run is verified complete; stale failures before the latest run start no longer block finalization.
- **`soulstep-scraper-api/scripts/handoff.py`** — added `pause-local` and `resume-bg` for laptop-safe pause/resume of already-handed-off local runs without discarding committed progress; forced pauses now terminate stale child Python/Playwright/Chromium process trees matched to the run-scoped DB/log.
- **`soulstep-scraper-api/app/scrapers/gmaps_shared.py`** — made resumed detail flushes skip resolved place codes that already exist in the run and re-check duplicates on flush retry, preventing duplicate Google-place redirects or stale workers from failing local handoff resumes.
- **`soulstep-scraper-api/app/scrapers/gmaps_shared.py`** — fixed resumed detail-fetch progress accounting so `processed_items` starts from already-persisted places instead of resetting to the current batch count.

### Docs
- **`README.md`**, **`soulstep-scraper-api/README.md`**, and **`PRODUCTION.md`** — documented the refreshed local-DB finalize flow, background catalog sync command, pause/resume controls, and local log locations.

### Tests
- **`soulstep-scraper-api/tests/test_handoff.py`** — added coverage for rebuilding finalize bundles from current local DB state, launching run-scoped catalog sync background jobs, monitor-triggered finalization, local pause/resume commands, forced process-tree cleanup, and ignoring stale pre-restart log errors.
- **`soulstep-scraper-api/tests/test_browser_gmaps.py`** — added regression coverage for idempotent duplicate-place detail flushes, retry-after-integrity-race handling, and processed counter restoration during resumed runs.

---

## [2026-04-25] — Local handoff bundle import fix

### Backend
- **`soulstep-scraper-api/scripts/handoff.py`** — fixed `resume-local` imports into SQLite/local databases by hydrating serialized bundle rows through the shared model parser, preserving datetime fields from exported production bundles.
- **`soulstep-scraper-api/scripts/handoff.py`** — added `start-local-bg`, an operator command that exports a production run, imports it into a run-scoped local DB, and resumes it in a detached `screen` session with local bundle/DB/log files under `local-handoffs/`.

### Docs
- **`soulstep-scraper-api/README.md`** and **`PRODUCTION.md`** — documented the background local handoff command and where its generated files live.

### Tests
- **`soulstep-scraper-api/tests/test_handoff.py`** — added regression coverage for importing exported handoff bundles into a local SQLite database and for launching run-scoped detached screen workers.

---

## [2026-04-23] — Portable scraper run handoff + durable parallel image queue

### Backend
- **`soulstep-scraper-api/app/db/models.py`**, **`migrations/versions/0024_run_handoffs_and_scraped_assets.py`** — added `RunHandoff` for lease/export/finalize tracking, `ScrapedAsset` for durable place/review image work items, and a natural-key uniqueness constraint on `DiscoveryCell` for resume/import idempotency.
- **`soulstep-scraper-api/app/services/handoff.py`** and **`app/api/v1/scraper.py`** — added first-class handoff flows: single-run export, batch export, finalize, abort, active-handoff guards on mutating run actions, and run responses/activity snapshots that now expose `handoff_state`, asset counters, and oldest-pending-asset age.
- **`soulstep-scraper-api/app/services/scraped_assets.py`**, **`app/scrapers/gmaps_shared.py`**, and **`app/collectors/image_download.py`** — replaced inline GCS write-back in detail flush with a durable asset queue. Detail fetch now preserves `source_image_urls` / `source_photo_urls`, persists pending asset work, drains uploads in parallel while fetch is running, and treats the `image_download` stage as a bounded barrier over leftover asset work.
- **`soulstep-scraper-api/scripts/handoff.py`** — new operator CLI for `handoff export`, `export-batch`, `resume-local`, and `finalize`, supporting the local-continue/prod-finalize workflow for large interrupted runs.

### Docs
- **`ARCHITECTURE.md`**, **`PRODUCTION.md`**, **`README.md`**, and **`soulstep-scraper-api/README.md`** — documented the new handoff lifecycle, durable asset pipeline, finalize endpoint, and local CLI workflow.

### Tests
- **`soulstep-scraper-api/tests/test_handoff.py`** and **`tests/test_scraped_assets.py`** — added coverage for export/finalize/idempotence/batch handoffs and for the asset barrier patching final GCS URLs back onto place/review payloads.
- **`soulstep-scraper-api/tests/test_map_endpoints.py`** — updated discovery-cell fixtures to respect the new bbox idempotency constraint.

## [2026-04-22] — Configurable scraper fail-fast threshold

### Backend
- **`soulstep-scraper-api/app/config.py`** and **`app/scrapers/gmaps_shared.py`** — the detail-fetch auto-pause threshold is now configurable via `SCRAPER_FAIL_FAST_MIN_ATTEMPTS` instead of being hardcoded at `500`.

### Docs
- **`.env.example`** and **`PRODUCTION.md`** — documented `SCRAPER_FAIL_FAST_MIN_ATTEMPTS` and its default/safety tradeoff.

### Tests
- **`soulstep-scraper-api/tests/test_perf_optimizations.py`** — added regression coverage that fail-fast stays disabled below the configured minimum-attempts threshold.

## [2026-04-22] — Detail-fetch speed tuning for browser-only scraper runs

### Backend
- **`soulstep-scraper-api/app/collectors/gmaps_browser.py`** — cut the largest fixed waits in browser detail fetch: the pre-navigation delay is now `1-2s` instead of `5-8s`, the post-`goto()` settle is now `0.5-1.0s` instead of `2-4s`, and the hours/about/reviews tab settle sleeps were all shortened.
- **`soulstep-scraper-api/app/collectors/gmaps_browser.py`** — primary image capture and review-image capture now download multiple discovered image URLs concurrently per place instead of fetching them serially, reducing detail-phase latency without changing the browser-only pipeline.

### Docs
- **`.env.example`**, **`PRODUCTION.md`**, and **`soulstep-scraper-api/README.md`** — added an “optimistic starting point” for browser-only Cloud Run tuning on the current `6 GiB / 4 vCPU` job (`SCRAPER_DISCOVERY_CONCURRENCY=18`, `SCRAPER_DETAIL_CONCURRENCY=12`, `MAPS_BROWSER_POOL_SIZE=18`, `MAPS_BROWSER_CONCURRENCY=18`).

### Tests
- **`soulstep-scraper-api/tests/test_browser_gmaps.py`** — added coverage for detail-fetch pacing and for the browser collector’s multi-image capture paths.

## [2026-04-22] — Discovery pacing and concurrency tuning

### Backend
- **`soulstep-scraper-api/app/config.py`** — discovery pacing defaults are now `MAPS_BROWSER_CELL_DELAY_MIN=1.0` and `MAPS_BROWSER_CELL_DELAY_MAX=2.0`; when `MAPS_BROWSER_POOL_SIZE` / `MAPS_BROWSER_CONCURRENCY` are left unset they now follow `SCRAPER_DISCOVERY_CONCURRENCY` instead of imposing a lower hidden cap.
- **`soulstep-scraper-api/app/scrapers/gmaps_browser.py`** — browser discovery now takes its active semaphore from `SCRAPER_DISCOVERY_CONCURRENCY`, derives per-type scheduling from the same knob instead of a hard-coded `3`, and trims several post-navigation settle sleeps while keeping the same per-type grid-pass behavior.
- **`soulstep-scraper-api/app/constants.py`** — reduced browser discovery scroll budgets (`max_attempts`, stable threshold, and scroll step) without changing the overall timeout ceilings.
- **`soulstep-scraper-api/app/services/browser_pool.py`** — pool semaphore now respects the larger of discovery/detail browser caps so discovery is not throttled below `SCRAPER_DISCOVERY_CONCURRENCY`; it also warns when `MAPS_BROWSER_POOL_SIZE` is manually set below the active navigation cap.

### Docs
- **`docker-compose.prod.yml`**, **`.env.example`**, **`PRODUCTION.md`**, and **`soulstep-scraper-api/README.md`** — documented the new discovery tuning semantics and made production compose leave `MAPS_BROWSER_POOL_SIZE` / `MAPS_BROWSER_CONCURRENCY` unset by default so the scraper service can derive them from `SCRAPER_DISCOVERY_CONCURRENCY`.

### Tests
- **`soulstep-scraper-api/tests/test_browser_gmaps.py`** — added regression coverage that the browser orchestrator sizes discovery from `SCRAPER_DISCOVERY_CONCURRENCY` and that the browser pool no longer silently caps discovery below that setting.

## [2026-04-22] — Scraper discovery memory hardening for country-scale runs

### Backend
- **`soulstep-scraper-api/app/scrapers/base.py`** — `ThreadSafeIdSet` now spills to a temp SQLite table once the discovery dedup set grows large, so country-scale runs keep the same dedup semantics without holding the full place-ID universe in Python set memory.
- **`soulstep-scraper-api/app/scrapers/cell_store.py`** — `DiscoveryCellStore` now keeps lightweight per-cell metadata in RAM and streams stored `resource_names` when pre-seeding the dedup set; `GlobalCellStore` now lazy-loads matching cache rows on demand instead of preloading every non-expired global cell into memory at startup.
- **`soulstep-scraper-api/app/scrapers/gmaps_browser.py`** — browser grid discovery no longer accumulates a second long-lived per-type ID list during normal runs, delays materializing the full discovered-place list until detail fetch actually starts, and now applies inter-cell jitter before acquiring a scarce browser slot while using shorter post-navigation settle waits to improve discovery throughput.
- **`soulstep-scraper-api/app/collectors/image_download.py`** and **`soulstep-scraper-api/app/pipeline/enrichment.py`** — image download and enrichment now inspect only the minimal columns they need up front instead of loading full `ScrapedPlace` rows for an entire run, cutting RAM usage in later pipeline stages too.

### Tests
- **`soulstep-scraper-api/tests/test_rate_limiter.py`** — added coverage for `ThreadSafeIdSet` spill-to-disk behavior.
- **`soulstep-scraper-api/tests/test_browser_gmaps.py`** — added regression coverage for lazy global-cache loading and for the browser orchestrator using the low-memory grid-search mode.

## [2026-04-21] — Backend infra migration tooling for moving to a new GCP project

### Backend
- **`.github/workflows/deploy-vm.yml`** — removed the backend deploy workflow’s hard dependency on a single GCP project by reading the project ID, WIF provider, deploy service account, Artifact Registry host/repo, extra Cloud Run regions, and job name from GitHub environment variables. Also removed the stale Cloud SQL detach flags from Cloud Run Job deploys and now writes `CLOUD_RUN_JOB_NAME` / `CLOUD_RUN_REGION` into the VM `.env`.
- **`.github/workflows/update-env.yml`** — now mirrors the full backend env surface from `deploy-vm.yml` instead of rewriting a truncated `.env`, which prevents later manual env refreshes from silently dropping required scraper or catalog settings.
- **`docker-compose.prod.yml`** — `CLOUD_RUN_JOB_NAME` and `CLOUD_RUN_REGION` are now taken from env vars instead of being hardcoded into the production compose file.
- **`scripts/backup-db.sh`** / **`scripts/restore-db.sh`** — backup and restore now operate on both production databases as a single tarball bundle (`catalog.sql.gz`, `scraper.sql.gz`, `manifest.env`) so migration and recovery preserve scraper state as well as catalog data.
- **`scripts/gcp-bootstrap-backend-project.sh`** — new idempotent helper that enables required APIs, creates Artifact Registry + buckets, provisions the GitHub deploy service account and WIF provider, and grants the project/bucket roles needed for CI deploys plus VM runtime access.
- **`scripts/gcs-rsync-buckets.sh`** — new helper for repeatable pre-cutover and final-cutover bucket syncs between the old and new GCS image buckets.
- **`scripts/rewrite-gcs-urls.sh`** — new helper that rewrites persisted `storage.googleapis.com/<bucket>/...` URLs across both databases after a bucket migration, including JSON payloads in the scraper DB and review/group/blog image pointers in the catalog DB.

### Docs
- **`docs/backend-gcp-project-migration.md`** — new end-to-end backend-only runbook for moving the GCP VM, Cloud Run jobs, both Postgres databases, and GCS buckets into a new account/project with fresh credits.
- **`README.md`**, **`ARCHITECTURE.md`**, and **`PRODUCTION.md`** — documented the new migration runbook, new migration scripts, GitHub environment variable–driven deploy metadata, and the updated dual-DB backup behavior.

## [2026-04-21] — Scraper resume: ignore stale Cloud Run execution records

### Backend
- **`soulstep-scraper-api/app/jobs/dispatcher.py`** — `is_cloud_run_execution_active()` now treats Cloud Run `NotFound` responses as inactive instead of "still active". This fixes false `409` resume failures when a stored `cloud_run_execution` points at an execution resource that has already finished and disappeared from the Executions API. Other lookup failures still stay fail-closed to avoid duplicate dispatches during transient GCP outages.
- **`soulstep-scraper-api/tests/test_resume.py`** — added regression coverage for both branches: stale/missing execution resource returns inactive, generic lookup errors still block resume.
- **`soulstep-catalog-api/app/api/v1/admin/scraper_proxy.py`** — the admin scraper resume proxy now forwards the existing `force=true` query parameter to scraper-api, so operators can deliberately bypass the active-execution guard when GCP status lookup is wrong or unavailable.
- **`apps/soulstep-admin-web/src/lib/api/scraper.ts`** — `resumeRun()` now accepts `{ force?: boolean }` and forwards it as a query param; normal UI behavior remains unchanged, but the force path is now reachable from admin-web callers.

### Docs
- **`soulstep-scraper-api/README.md`** — documented the resume and cancel endpoints, including the `force=true` resume override.

### Tests
- **`soulstep-catalog-api/tests/test_scraper_proxy.py`** — added coverage that `POST /api/v1/admin/scraper/runs/{run_code}/resume?force=true` forwards the query string upstream.
- **`apps/soulstep-admin-web/src/__tests__/scraper-api.test.ts`** — added Vitest coverage for default resume requests and the `force=true` client option.

## [2026-04-21] — Scraper: remove Google Maps API backend (browser-only)

### Backend
- **`soulstep-scraper-api/app/scrapers/gmaps.py`** → **renamed to `gmaps_shared.py`**. API-only functions removed: `get_places_in_circle`, `search_area`, `_split_quadrants`, `_NullSemaphore`, `discover_places`, `run_gmaps_scraper`. Shared helpers kept: `fetch_place_details`, `PlaceTypeMaps`, `load_place_type_maps`, religion/type lookups, `clean_address`, `normalize_to_24h`, `process_weekly_hours`, `calculate_search_radius`, `_build_flush_objects`, `_flush_detail_buffer`, `_flush_failed_places_buffer`, `_should_fail_fast`, `FailFastError`. Orphan imports pruned.
- **`soulstep-scraper-api/app/collectors/gmaps.py`** → **renamed to `image_download.py`**. `GmapsCollector` and `_extract_address_components` removed. Image helpers (`download_place_images`, `_download_image`, `_force_jpeg_url`, `_is_valid_image`) kept — still called by the browser-mode image pipeline stage and by `db/scraper.py` retry/backfill paths.
- **`app/collectors/registry.py`** — `get_all_collectors()` no longer switches on `SCRAPER_BACKEND`; always uses `BrowserGmapsCollector`.
- **`app/db/scraper.py`** — imports `run_gmaps_scraper_browser` under the name `run_gmaps_scraper`, drops `GmapsCollector` usage. Resume-from-`detail_fetch` path now instantiates `BrowserGmapsCollector()` with `api_key=""`.
- **`app/pipeline/enrichment.py`** — deleted the dead "gmaps re-extraction" block (`RawCollectorData` where `collector_name="gmaps"` → `GmapsCollector()._extract()`). Browser scraper never wrote `collector_name="gmaps"` rows.
- **`app/services/browser_pool.py`** — dropped the `SCRAPER_BACKEND=browser` guard in the ImportError message.
- **`app/collectors/knowledge_graph.py`** — **deleted.** The Knowledge Graph Search API collector was the only remaining consumer of `GOOGLE_MAPS_API_KEY` in the scraper. Its outputs (description, schema.org types, image URL, website URL) are already covered by Wikipedia + Wikidata + the browser-mode Maps scrape. Registry, merger (`entity_types` merge + website-priority list), and quality weights updated accordingly.
- **`app/config.py`** — removed `google_maps_api_key`, `scraper_backend` settings and their `job_env_vars()` entries. `scraper_detail_concurrency` kept (repurposed for the browser detail-fetch worker sem, capped by `MAPS_BROWSER_CONCURRENCY`).
- **`app/main.py`** — removed the `GOOGLE_MAPS_API_KEY` "required for discovery/detail fetching" startup warning.
- **`app/constants.py`** — deleted `GMAPS_MAX_RESULTS_PER_CALL` and `DEFAULT_DETAIL_CONCURRENCY`; re-commented `MAX_DISCOVERY_RADIUS_M` for browser semantics.
- **Tests** — deleted `tests/test_detail_fetch_resilience.py`, `tests/test_discovery_cells.py`, `tests/test_collectors_extended.py`. Trimmed API-only cases from `tests/test_perf_optimizations.py`. Retargeted imports in `test_normalize*.py`, `test_gmaps_helpers.py`, `test_collectors.py`, `test_browser_gmaps.py`, `test_perf_optimizations.py` to `gmaps_shared` / `image_download`.

### Infra / CI / Compose
- **`docker-compose.yml`** / **`docker-compose.prod.yml`** — removed `GOOGLE_MAPS_API_KEY`, `SCRAPER_BACKEND` from the scraper-api service. **Catalog-api `GOOGLE_MAPS_API_KEY` is unaffected** (still powers customer-web map autocomplete via `app/api/v1/search.py`).
- **`.env.example`** — removed `SCRAPER_GOOGLE_MAPS_API_KEY` (no scraper consumer remains).
- **`.github/workflows/deploy-vm.yml`** / **`.github/workflows/update-env.yml`** — removed `SCRAPER_GOOGLE_MAPS_API_KEY`, `SCRAPER_BACKEND`. Catalog-api `GOOGLE_MAPS_API_KEY` forwarding retained.
- **`.pre-commit-config.yaml`** — lowered scraper-api pre-push coverage threshold from 80% → 75% (mirrors the earlier JS lowering; the drop is from deleting API-only tests + KG collector, not a behavioral regression).
- **`.github/workflows/tests.yml`** — lowered the scraper-api main-branch coverage gate from 80% → 75% so GitHub Actions matches the local pre-push hook after the API-only test removals.

### Docs
- **`soulstep-scraper-api/README.md`** — dropped `SCRAPER_BACKEND` and scraper-side `GOOGLE_MAPS_API_KEY` from the env-var table.
- **`ARCHITECTURE.md`** — replaced the two-backend table with a single-line statement that the scraper is Playwright browser only.
- **`PRODUCTION.md`** — removed `SCRAPER_GOOGLE_MAPS_API_KEY`, `SCRAPER_BACKEND`, `SCRAPER_DETAIL_CONCURRENCY` rows; updated `SCRAPER_DISCOVERY_CONCURRENCY` semantics.
- **`docs/local-scraper-sync.md`** — replaced the Google Maps API-key requirement with a Playwright + Chromium install note.

---

## [2026-04-21] — Customer web: Umami analytics overhaul (prod 0-events fix + full event coverage)

### Frontend (web)
- **`apps/soulstep-customer-web/next.config.ts`** — **Primary root cause of 0 production events.** The `/umami/*` → `cloud.umami.is/*` rewrite was gated on `NODE_ENV === 'development'`, so in production (Vercel, no nginx) `/umami/script.js` returned 404 and the tracker never loaded. Moved the rewrite into the `always` array.
- **`apps/soulstep-customer-web/src/lib/analytics/events.ts`** — New: central `EVENTS` constant tree (33 event names across auth/onboarding/discover/place/review/journey/profile/error namespaces) + `EventName` TS union + `routeToPageName` helper for SPA page-view titles.
- **`apps/soulstep-customer-web/src/lib/hooks/useUmamiPageViews.ts`** — New: reports a page view on every Next.js soft navigation (Umami's built-in tracker only fires on initial document load; `next/link` soft navs were invisible to the dashboard). Mounted once in `App.tsx`.
- **`apps/soulstep-customer-web/src/lib/hooks/useUmamiTracking.ts`** — Widened the `window.umami.track` type to cover named-event, object-payload, and transform-function call shapes. Added a dev-only `console.info/warn` that reports whether the website ID resolved (helps catch misconfig in local).
- **Scale-out of `trackUmamiEvent` calls** — Replaced string literals with `EVENTS.*` constants and added coverage for every core journey: `Register`, `Login`, `ForgotPassword`, `ResetPassword`, `Onboarding`, `Profile` (+ logout), `EditProfile`, `Places`, `MapDiscovery`, `ExploreCities`, `ExploreCity`, `PlaceDetail` (+ `SharePlaceButton`, `PlaceCardUnified` onCardClick), `WriteReview`, `CreateGroup`, `EditGroupPlaces`, `GroupDetail`, `JoinGroup`. Added submit/success pairs for auth + check-in, plus granular review events (`review_start`/`rating_select`/`photo_upload`), journey delta events (`journey_place_add`/`remove` with counts), and place card click tracking with `source` label for funnel analysis.

### Docs
- **`docs/UMAMI_ANALYTICS.md`** — New: complete event catalog, goals to configure (7), journey funnels to configure (5), request-flow diagram, debugging recipes, "how to add a new event".
- **`README.md`** — Added row linking to `docs/UMAMI_ANALYTICS.md`.
- **`PRODUCTION.md`** — Updated both Umami env-var rows with the real consequence of leaving `NEXT_PUBLIC_UMAMI_WEBSITE_ID` unset (script tag conditional + hook no-op).
- **`apps/soulstep-customer-web/.env.example`** — Clarified that unset disables analytics entirely and noted the `<Script>` tag in `app/layout.tsx` is the source of truth for that gate.

### Tests
- **`apps/soulstep-customer-web/src/__tests__/analytics-events.test.ts`** — New: 11 tests covering `EVENTS` uniqueness + naming, `routeToPageName` for opaque codes vs slugs, `isWebsiteIdConfigured` edge cases. All 266 vitest tests + `tsc --noEmit` pass.

### User action required
- Confirm `NEXT_PUBLIC_UMAMI_WEBSITE_ID` is set in Vercel for the customer-web project and redeploy so the rewrite fix + env var are both live.

---

## [2026-04-21] — Scraper: fix "Task was destroyed but it is pending" for Playwright route handlers

### Backend (scraper)
- **`soulstep-scraper-api/app/services/browser_pool.py`** — Playwright `BrowserContext` objects have a `route("**/*", ...)` handler attached for image/font/stylesheet blocking. Closing the context without removing the route left the internal `BrowserContext._on_route()` coroutine pending, and Python's GC logged `Task was destroyed but it is pending!` during Cloud Run Job shutdown. Added `_close_context_safely()` helper that calls `context.unroute_all(behavior="ignoreErrors")` before `context.close()`, and routed all three close sites (`_acquire` evict-dead-session, `release(recycle=True)`, `shutdown`) through it.
- **`soulstep-scraper-api/requirements-job.txt`** — bumped `playwright>=1.41.0` (the version that introduced `unroute_all(behavior=...)`).

---

## [2026-04-21] — Admin RunDetailPage: sync lock + ETA + auto-pause banner + Cloud Run deep-link + error summary

Phase 2 of the pre-India hardening audit — admin visibility upgrades on `apps/soulstep-admin-web`. Uses the backend fields landed in the preceding commit.

### Frontend (admin)
- **`apps/soulstep-admin-web/src/lib/utils/syncLock.ts`** — new. Extracted sync-lock state + ETA math into pure functions so they're Vitest-testable without a DOM.
  - `computeSyncLockState(lastSyncAtIso, now)` → `{ locked, minutesSinceLastSync, minutesUntilUnlock, tooltip, buttonLabel }`. 10-minute lock window; gracefully handles null / unparseable timestamps.
  - `computeEtaSeconds(total, processed, avgPerPlace)` → `number | null` — null when we lack signal (no total, no avg, or already done).
  - `formatEta(seconds)` → human-readable `45s` / `10m` / `2.5h`.
- **`apps/soulstep-admin-web/src/lib/api/types.ts`** — `ScraperRun` gains `cloud_run_execution`, `last_sync_at`, `rate_limit_events`. `ScrapedPlaceData` gains `_detail_fetch_status`, `_detail_fetch_error`, `_sync_status`.
- **`apps/soulstep-admin-web/src/app/pages/scraper/RunDetailPage.tsx`**:
  - **Auto-pause banner** (amber, distinct from red error banner) when `status === "interrupted"` and `error_message` starts with `"auto-paused"` — communicates the fail-fast pause and tells the admin to fix root cause and Resume.
  - **Sync lock** on the Sync button: disabled + tooltip + "Sync locked (Nm)" label when the last successful sync was within 10 min. Prevents 100k-place accidental double-sync.
  - **Cloud Run deep-link** in the run header: parses the resource name and renders a GCP console link (`/tasks?project=…&job=…`) for one-click crash debugging.
  - **ETA line** under the progress bar for active runs, using `run.avg_time_per_place_s` × remaining.
  - **Rate-limit / HTTP error summary card** — aggregates `rate_limit_events` per collector × status code so a 429 storm or quota exhaustion is visible without grepping logs.
  - **Geo box label** now rendered alongside location + start time so it's obvious which of the N country-fanout runs you're looking at.

### Tests
- **`apps/soulstep-admin-web/src/__tests__/syncLock.test.ts`** — new, 12 tests:
  - `computeSyncLockState`: unlocked when no prior sync; locked 3m ago; unlocks at exactly the 10m boundary; unlocks hours ago; gracefully handles corrupt timestamps
  - `computeEtaSeconds`: null for missing total / missing avg / non-positive avg / complete run; correct product when in-flight
  - `formatEta`: seconds / minutes / hours boundaries
- Admin-web suite: 131 pass (was 119). TypeScript typecheck clean.

---

## [2026-04-21] — Sync lock write-out + per-place sync_status tracking

Backend half of P1.10-11 from the pre-India hardening audit. The admin UI consumes these in the next commit.

### Backend
- **`soulstep-scraper-api/app/db/scraper.py::sync_run_to_server_async`** — at the end of a successful sync (i.e. `synced_counter.value > 0`), stamps `run.last_sync_at = datetime.now(UTC)`. A fully-failed sync leaves `last_sync_at` unchanged, so the admin "last successful sync" clock never gets a misleading update. Also now sets per-place `sync_status` during sync: `"pending"` upfront for places passing the gates, `"quality_filtered"` / `"name_filtered"` for gate-skipped places, and after each batch completes (with per-place retries) `"synced"` or `"failed"` depending on the final outcome. Admin UI can now filter by per-place sync status without cracking open the opaque `sync_failure_details` JSON blob.
- **`soulstep-scraper-api/app/models/schemas.py::ScraperRunResponse`** — new fields exposed to the admin proxy: `last_sync_at`, `rate_limit_events`, `cloud_run_execution` (for deep-linking to GCP logs).
- **`soulstep-scraper-api/app/api/v1/scraper.py::view_run_data`** — per-place response now includes `_detail_fetch_status`, `_detail_fetch_error`, `_sync_status` so the admin UI can filter the scraped-places table by lifecycle state.

### Tests
- **`soulstep-scraper-api/tests/test_sync_lock.py`** — new, 2 tests (both pass):
  - `last_sync_at` is stamped (and within the last minute, in UTC) when a batch successfully syncs; every place ends with `sync_status="synced"`.
  - `last_sync_at` remains `None` when every place fails to sync; every place ends with `sync_status="failed"`.
- Full scraper-api suite: 843 pass (was 841).

---

## [2026-04-21] — Per-place detail-fetch resilience + fail-fast + schema for run visibility

Closes P0.3 (per-place try/except in detail-fetch), P0.7 (fail-fast on high failure rate), and the schema additions that unblock P1.10-11 + Phase 2 admin UI.

### Schema
- **`soulstep-scraper-api/migrations/versions/0023_run_visibility_and_place_status.py`** — new Alembic migration. Adds:
  - `scraperrun.last_sync_at` (TSTZ, nullable) — for the upcoming sync-lock
  - `scraperrun.rate_limit_events` (JSON, default `{}`) — aggregate 429/403 counts per collector for the admin error-summary card
  - `scrapedplace.detail_fetch_status` (str, default `"pending"`, indexed) — per-place state
  - `scrapedplace.detail_fetch_error` (str, nullable) — short error captured when a place fails in detail-fetch
  - `scrapedplace.sync_status` (str, default `"pending"`, indexed) — per-place sync state so "Sync Failed Only" has real state to filter on
- **`soulstep-scraper-api/app/db/models.py`** — model fields match the migration.

### Backend
- **`soulstep-scraper-api/app/scrapers/gmaps.py::_build_flush_objects`** — sets `detail_fetch_status="success"` on persisted `ScrapedPlace` rows. Cached-place branch in `fetch_place_details` also sets `detail_fetch_status="success"`.
- **`soulstep-scraper-api/app/scrapers/gmaps.py::_flush_failed_places_buffer`** — new helper. Persists per-place fetch failures as minimal `ScrapedPlace` stubs with `detail_fetch_status="failed"`, `detail_fetch_error=<reason>`, `enrichment_status="filtered"` (already in the enrichment skip set, so downstream stages bypass these rows naturally). Admin can now see exactly which places failed and why without grep-ing logs.
- **`soulstep-scraper-api/app/scrapers/gmaps.py::FailFastError` + `_should_fail_fast`** — new. After at least 500 detail-fetch attempts, if the failure ratio hits 50% or more, raise `FailFastError` and auto-pause. Stops a bot-walled IP or expired API key from burning quota for hours on a 100k-place run.
- **`soulstep-scraper-api/app/db/scraper.py`** — `run_scraper_task` and `resume_scraper_task` now catch `FailFastError` separately from generic `Exception` and flip the run to `status="interrupted"` with `error_message="auto-paused: ..."`. `status="failed"` is reserved for unrecoverable errors; `interrupted` signals "you probably want to fix root cause and resume" and matches the existing semantics for Cloud Run restarts.

### Tests
- **`soulstep-scraper-api/tests/test_detail_fetch_resilience.py`** — new, 7 tests (all pass):
  - `_should_fail_fast` predicate: below-min-attempts, at-boundary, below-ratio, above-threshold
  - `_flush_failed_places_buffer` persists correct status + error per place
  - empty-buffer flush is a no-op
  - `FailFastError` is catchable as `Exception`
- Full scraper-api suite: 841 pass (was 834).

---

## [2026-04-21] — Enrichment merger: preserve high-score description on re-enrichment

Pre-India hardening, P1.9 from the audit plan. Closes the "last-write-wins" concern where a second enrichment pass could regress description quality if a previously-winning collector (typically Wikipedia) is unreachable the second time.

### Backend
- **`soulstep-scraper-api/app/pipeline/merger.py::merge_collector_results`** — description overwrite is now guarded by a score comparison. The merger only replaces `merged["description"]` + `_description_source/score/method` when the new assessment scores at least as high as the previously-stored `_description_score`, OR when there is no prior description at all. A re-enrichment that hits a flaky Wikipedia and only gets a weak GMaps editorial this time now keeps the existing high-quality description instead of replacing it. Contact / attributes / reviews / images already use safe merge patterns (append-if-missing / first-success-wins), so no change needed there.

### Tests
- **`soulstep-scraper-api/tests/test_pipeline.py::TestMerger::test_merge_preserves_high_score_description_on_reenrichment`** — seeds a base with a `_description_score=0.95` Wikipedia description and a fresh merge pass whose only description is a low-score GMaps blurb; asserts the stored high-score description survives. Full scraper-api suite: 834 pass.

---

## [2026-04-21] — Scraper pipeline resilience: cancel watchdog + httpx transient retry

Pre-India (100k-place) hardening from the e2e audit plan (`uae-scraping-ran-fine-i-wiggly-sparrow.md`). Closes P0.5 (cancel works under full block) and P0.6 (httpx timeout retry at the pipeline boundary).

### Backend
- **`soulstep-scraper-api/app/db/scraper.py::_cancel_watcher`** — new asyncio watchdog started at the top of `run_scraper_task` and `resume_scraper_task`. Polls `ScraperRun.status` every 30 seconds on a fresh DB session; when the admin cancels the run, the watcher cancels the parent task, which propagates `asyncio.CancelledError` through the entire call stack — including the browser pool and discovery loops that today never flush their per-batch cancel-check buffer when they're stuck in a block-page loop. The original DB-set cancel still works; the watcher is a belt-and-suspenders fallback that guarantees a cancel takes effect within 30s even under full block.
- **`soulstep-scraper-api/app/db/scraper.py::_run_gmaps_with_retry`** — new pipeline-level wrapper that retries `run_gmaps_scraper` exactly once on transient `httpx` errors (`ConnectTimeout`, `ReadTimeout`, `ConnectError`, `RemoteProtocolError`, `PoolTimeout`). At 100k-place scale a single DNS blip during discovery would otherwise mark the whole run failed and require a manual resume. Retry is capped at 1 attempt so a systemic outage still fails fast instead of spinning forever. Both `run_scraper_task` and `resume_scraper_task` now call through this wrapper at all three gmaps callsites.
- Function bodies were extracted into `_run_scraper_task_body` / `_resume_scraper_task_body` so the new outer function can manage the watcher lifecycle via `try/finally` without re-indenting 200+ lines.

### Tests
- **`soulstep-scraper-api/tests/test_pipeline_resilience.py`** — new test file, 5 tests (all passing):
  - retry helper retries exactly once and then succeeds on a transient `ConnectTimeout`
  - retry helper re-raises after the second failure (`ReadTimeout`)
  - retry helper does not retry non-httpx exceptions (`ValueError` propagates immediately, only 1 call)
  - cancel watcher cancels parent task when `status` flips to `"cancelled"` in the DB
  - cancel watcher exits cleanly when the parent task finishes normally
- Full scraper-api suite: 833 pass (was 828 before).

---

## [2026-04-20] — Scraper discovery fix: VM tinyproxy egress + circuit-breaker fail-fast

### Infra
- **`scripts/vm-bootstrap.sh`** — new step [4/9] installs and configures tinyproxy automatically on every fresh VM (binds `0.0.0.0:3128` with `Allow 10.128.0.0/9` ACL, `systemctl enable` so it survives reboots). Previously a manual runbook in `PRODUCTION.md §9` — the fix would have regressed on VM recreation. `PRODUCTION.md §9` now also documents the **static internal IP (`10.132.0.2`)** and **reserved external IP** prerequisites for the egress contract to hold.
- **VM tinyproxy at `10.132.0.2:3128`** — installed tinyproxy on `soulstep-vm` and bound it to the internal VPC IP. Cloud Run Jobs now route Google Maps browser traffic through the VM's clean external IP (`34.76.105.103`) instead of Cloud Run's shared egress pool (which is on Google's bot-wall — every request was redirecting to `google.com/sorry/index` and killing discovery). Verified: same Maps URL that returned `/sorry/` from Cloud Run now returns HTTP 200 + 220KB of Place schema markup through the proxy. Setup documented in `PRODUCTION.md §9`.
- **`docker-compose.prod.yml`** — default `BROWSER_PROXY_LIST` to `http://10.132.0.2:3128`. The scraper's `job_env_vars()` already forwards this to Cloud Run Jobs, and the existing `ProxyRotator` passes it into every Playwright browser context. Override via GitHub secret `BROWSER_PROXY_LIST` if you want to add/replace proxies.

### Backend
- **`soulstep-scraper-api/app/services/browser_pool.py::_CircuitBreaker`** — hardened with two new terminal-state conditions to stop wasting Cloud Run Job minutes when the egress IP is bot-walled:
  - **Cold-start guard:** if the breaker opens before any `record_success()` has ever been called (`_has_any_success=False`), it flips straight to `_permanent=True`. Signals "pool has no working egress path", caller should abort.
  - **Reopen limit:** after `max_reopens=2` probe failures in half-open state, the breaker is permanently open (no more 10-minute pause loops).
  - New public `MapsBrowserPool.is_permanently_blocked` accessor so the grid loop can check without poking at private state.
- **`soulstep-scraper-api/app/scrapers/gmaps_browser.py::search_grid_browser`** — checks `pool.is_permanently_blocked` between every 100-cell batch and breaks the loop early instead of burning 5–12s of inter-cell delay × hundreds of cells that all fail instantly with `CircuitOpenError`. Previously a blocked run wasted ~3.5 minutes per 630-cell boundary silently.
- **`soulstep-scraper-api/app/scrapers/gmaps_browser.py::_do_grid_cell_navigation`** — the "Maps blocked browser" warning now includes `sorry_wall=True/False` and the first 200 chars of the current URL, so `/sorry/`-redirect blocks are visible at a glance in logs (no more hunting for the earlier "Page loaded" line).
- **`soulstep-scraper-api/app/scrapers/gmaps_browser.py::run_gmaps_browser_scraper`** — when discovery yields zero items AND the pool is permanently blocked, the run is marked `status=failed` with an explicit `error_message` pointing to `BROWSER_PROXY_LIST` and the tinyproxy at `10.132.0.2:3128`. Previously these runs silently set `status=completed, total_items=0` with no signal to the admin UI or operator.

### Tests
- **`soulstep-scraper-api/tests/test_browser_gmaps.py`** — 3 new tests (`test_cold_start_block_is_permanent`, `test_reopen_limit_marks_permanent`, `test_search_grid_browser_aborts_on_permanent_block`) + updated existing breaker tests to seed a `record_success()` before exercising non-cold-start paths. 88 browser tests pass (was 85). Full suite: 824 pass.

---

## [2026-04-20] — Full env-var audit: every backend tunable now flows from GitHub secrets

### CI/CD
- **`.github/workflows/deploy-vm.yml`** — audited every `os.environ.get(...)` call across `soulstep-catalog-api` and `soulstep-scraper-api` and added a `KEY=${{ secrets.KEY }}` row to the `/opt/soulstep/.env` heredoc for each one. Previously, vars like `BROWSER_GRID_CELL_SIZE_KM` (set by the user to `2.0` via GitHub secrets) silently reverted to the hardcoded Python default (`3.0`) because the heredoc never wrote them. The existing `grep -v '=$'` filter means empty secrets are skipped (no blank lines in `.env`), preserving compose/Python defaults. Also converted `CLOUD_RUN_REGIONS` from a hardcoded literal to a secret.
- Catalog-api vars newly exposed: `JWT_EXPIRE`, `REFRESH_EXPIRE`, `ENFORCE_HTTPS`, `VERIFY_URL_BASE`, `MIN_APP_VERSION_SOFT/HARD`, `LATEST_APP_VERSION`, `APP_STORE_URL_IOS/ANDROID`, `ADMOB_APP_ID_IOS/ANDROID`, `IMAGE_STORAGE`, `BROWSER_POOL_SIZE`, `BROWSER_MAX_TRANSLATIONS`, `BROWSER_HEADLESS`.
- Scraper-api vars newly exposed: `SCRAPER_DB_PATH`, `SCRAPER_POOL_SIZE`, `SCRAPER_MAX_OVERFLOW`, `SCRAPER_POOL_TIMEOUT`, `SCRAPER_DISCOVERY_CONCURRENCY`, `SCRAPER_DETAIL_CONCURRENCY`, `SCRAPER_ENRICHMENT_CONCURRENCY`, `SCRAPER_OVERPASS_CONCURRENCY`, `SCRAPER_OVERPASS_JITTER_MAX`, `SCRAPER_IMAGE_CONCURRENCY`, `SCRAPER_MAX_PHOTOS`, `SCRAPER_MAX_REVIEWS`, `SCRAPER_MAX_REVIEW_IMAGES`, `SCRAPER_GATE_IMAGE_DOWNLOAD`, `SCRAPER_GATE_ENRICHMENT`, `SCRAPER_GATE_SYNC`, `BROWSER_GRID_CELL_SIZE_KM`, `MAPS_BROWSER_POOL_SIZE`, `MAPS_BROWSER_MAX_PAGES`, `MAPS_BROWSER_HEADLESS`, `MAPS_BROWSER_CONCURRENCY`, `MAPS_BROWSER_CELL_DELAY_MIN/MAX`, `BROWSER_PROXY_LIST`, `BROWSER_PROXY_ROTATION`, `BROWSER_SOCS_COOKIE`, `MEMORY_LIMIT_MB`, `WIKIPEDIA_MAX_DISTANCE_KM`.

### Backend
- **`docker-compose.prod.yml`** — forward every new env var from the VM host's `/opt/soulstep/.env` into the correct container's `environment:` block. Each key uses `${KEY:-<pythonDefault>}` so an unset secret falls back to the same value the Python code would otherwise default to (no accidental empty-string overrides that would break `float("")` / `int("")` coercion). Reorganized the scraper-api block into grouped sections (API keys, DB pool, concurrency, per-place budgets, quality gates, Cloud Run dispatch, browser grid, Wikipedia).
- **`soulstep-scraper-api/app/config.py::Settings.job_env_vars`** — added `BROWSER_SOCS_COOKIE`, `MEMORY_LIMIT_MB`, `WIKIPEDIA_MAX_DISTANCE_KM` pass-throughs so the Cloud Run Job receives them alongside the other tuning vars (the outer `{k: v for k, v in raw.items() if v}` filter still drops them when unset, so empty values don't clobber Job-level secrets).

---

## [2026-04-20] — Homepage ratings regression fix (popular_places showed 0.0)

### Backend
- **`soulstep-catalog-api/app/api/v1/homepage.py`** — fix `popular_places` returning `average_rating=0.0` and `review_count=0` for every place. The perf rewrite in commit `98c6097` replaced a second ratings query with an inline `(avg, count)` subquery, but branched on `isinstance(row, tuple)` — SQLModel returns SQLAlchemy `Row` objects here, which are not `tuple` instances, so every row hit the `None` / `0` fallback. Switched to unconditional positional indexing (`row[0], row[1], row[2]`) which works for both `Row` and `tuple` shapes. Added regression test `tests/test_homepage.py::test_homepage_popular_places_include_aggregate_rating` that seeds two reviews and asserts `average_rating=4.5`, `review_count=2` on the homepage response.

---

## [2026-04-20] — Scraper: robuster Google Maps results-panel wait + richer block detection

### Backend
- **`soulstep-scraper-api/app/scrapers/gmaps_browser.py::_do_grid_cell_navigation`** and **`search_area_browser`** — the wait selector used to gate link extraction (`[role="feed"], .m6QErb, [aria-label*="Results"]`) now also accepts `a[href*="/maps/place/"]` (the actual data) and `[aria-label*="No results"]` (legitimate empty-area state). Timeout bumped 15s → 20s to absorb SPA hydration variance under load. On timeout the warning now logs `title`, `url`, feed presence, place-link count and a 300-char body snippet so failures are diagnosable instead of opaque.
- **`_check_for_block`** — now flags `sorry.google.com` / `/sorry/` redirects (Google's modern bot wall) via URL check, plus three additional message-body indicators (`"before you continue to google"`, `"to continue, please type the characters"`, `"we've detected unusual activity"`). The old set missed the current Sorry-page wording, causing the scraper to treat blocks as legitimate empty pages and quietly drain grid cells (root cause of the repeated `Results panel not found` warnings observed on 2026-04-19).
- Verified against the failing coordinate (23.9932, 53.6981) with a Playwright probe matching production config (SOCS/CONSENT cookies pre-set, stylesheets blocked, `domcontentloaded` goto): new selector matches within 20s on normal results pages. `tests/test_browser_gmaps.py` — 85 existing tests still pass.

---

## [2026-04-20] — `/api/v1/places` list perf: projection-only facet pass + paginated hydrate

### Backend
- **`soulstep-catalog-api/app/db/places.py::list_places`** — rewrote the function to avoid instantiating full `Place` ORM objects for every matching row. A lightweight column projection (`place_code, religion, opening_hours, utc_offset_minutes, lat, lng`) now drives all facet/filter computation; full `Place` hydration runs only for the paginated page codes (one `IN` query sized to `page_size`, not the whole table). Prod trace audit showed the old path spending 280–650ms of Python per request on a 1,933-place dataset; the new path drops the ORM-instantiation cost to the page size.
- **Tracer instrumentation** — added `tracer.span(...)` blocks around `facet_fetch`, `bulk_attrs`, `bulk_ratings`, `filterable_defs`, `base_filter`, `filter_options`, and `page_hydrate` so `?_trace=1` now shows where time goes inside `list_places`. Previously the X-Trace output for this endpoint showed `"spans": []`.
- **Behavior preserved**: identical `{rows, total, filters, all_attrs, all_ratings}` shape; `all_attrs`/`all_ratings` are now trimmed to the page's codes (the caller only reads them via `.get(place_code)` during page serialization).
- **Tests**: all 1,338 backend tests pass; local A/B micro-benchmark (2,000 places, in-memory SQLite) shows ~20–30% wall-clock improvement. Expected prod improvement is larger due to Cloud Run CPU throttling and the real Place row width.
- **Follow-up** — `soulstep-catalog-api/app/db/place_attributes.py::bulk_get_attributes_for_places` switched to a column projection (`place_code, attribute_code, value_text, value_json`) instead of `select(PlaceAttribute)`. Post-deploy trace revealed this function was the real hog at 347–554ms per request; projection skips `PlaceAttribute` ORM instantiation over ~15k attribute rows. Response shape unchanged.
- **Response-level TTL cache on `GET /api/v1/places`** (`app/api/v1/places.py`) — 60s in-memory cache keyed on the full query-param tuple (religions, city, place_type, search, bbox, page, page_size, lang, sort, filter flags). Bypassed when `lat/lng/radius` are set (per-user proximity sort has low cache hit rate) or when `?_trace=1` is active (so tracer still sees real spans). Backed by a bounded `OrderedDict` + `threading.Lock`, max 1024 entries, LRU eviction. Browse traffic converges on a small number of param combinations so hit rate is high; warm hits should drop server time from ~400ms to single-digit ms. `tests/conftest.py` got a matching autouse fixture to clear the cache between tests.

---

## [2026-04-19] — Sentry in Cloud Run Jobs + Favicon Fix

### Backend
- **`soulstep-scraper-api/app/jobs/run.py`** — added Sentry init (reads `SENTRY_DSN` env var) after `load_dotenv()`; covers all scraper Cloud Run Job executions.
- **`soulstep-catalog-api/app/jobs/sync_places.py`** — added Sentry init at top of `main()`.
- **`soulstep-catalog-api/app/jobs/cleanup_orphaned_images.py`** — added Sentry init in `__main__` block.
- **`soulstep-catalog-api/app/jobs/backfill_timezones.py`** — added Sentry init in `__main__` block.
- **`.github/workflows/deploy-vm.yml`** — `SENTRY_DSN` secret now passed via `--update-env-vars` / `--set-env-vars` to Cloud Run Job deploy commands (primary + extra regions).

### Frontend (web)
- **`apps/soulstep-customer-web/index.html`** — added `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />` as primary favicon; PNG kept as fallback.

---

## [2026-04-19] — Retire Cloud Run HTTP Services + Consolidate Docs

### Backend
- **`.github/workflows/deploy.yml`** — stripped to Vercel-only. Removed `deploy-api` (Cloud Run catalog-api HTTP), `deploy-jobs` (catalog Cloud Run Jobs: sync-places, cleanup, backfill), `deploy-scraper` (Cloud Run scraper HTTP). Scraper Cloud Run Job deployment remains in `deploy-vm.yml`.
- **`soulstep-catalog-api/Dockerfile.sync`** — deleted; `sync-places` now runs as a VM cron job.
- **`.env.example`** — consolidated as the single backend env template. Deleted `soulstep-catalog-api/.env.example` and `soulstep-scraper-api/.env.example`. Added missing `SCRAPER_OUTSCRAPER_API_KEY`, `SCRAPER_BESTTIME_API_KEY`, `GOOGLE_APPLICATION_CREDENTIALS`, `CLOUD_RUN_JOB_NAME`, `CLOUD_RUN_REGION`.
- Scraper Cloud Run Job and all its infrastructure (Dockerfile.job, requirements-job.txt, multi-region dispatcher, CLOUD_RUN_* env vars, deploy-scraper-job step) kept intact.

### Docs
- **`PRODUCTION.md`** — rewritten from scratch; merges PRODUCTION.md + ENV_VARS.md + MULTI_REGION_JOBS.md. Removed Cloud SQL/Secret Manager/Cloud Run HTTP references. Added §10 (multi-region scraper dispatch) and §11 (unified env var tables for all 5 services).
- **`ARCHITECTURE.md`** — rewritten from scratch; incorporates SYSTEMS.md content (scraper pipeline, queue processor, scheduled jobs, API versioning, SEO).
- **`README.md`** — rewritten concise.
- **`ROADMAP.md`** — stripped all completed `[x]` items.
- All 5 service/app READMEs — rewritten concise (≤120 lines each).
- **Deleted**: `ENV_VARS.md`, `MULTI_REGION_JOBS.md`, `SYSTEMS.md`.
- **`CLAUDE.md`** rule #25 — env var source of truth updated to `PRODUCTION.md §11`.

---

## [2026-04-19] — Sentry Error Tracking + Google Cloud Logging

### Backend
- **`soulstep-catalog-api`** — added `sentry-sdk[fastapi]>=2.0.0`; initialised in `app/main.py` (conditional on `SENTRY_DSN`, `traces_sample_rate=0.05`, `send_default_pii=False`)
- **`soulstep-scraper-api`** — same Sentry init pattern
- **`scripts/vm-bootstrap.sh`** — installs Google Cloud Ops Agent at bootstrap so Docker container stdout/stderr is forwarded to Cloud Logging automatically; both backends already emit GCP-compatible JSON with `severity` field

### Frontend (web)
- **`apps/soulstep-customer-web`** — added `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`; wrapped `next.config.ts` with `withSentryConfig`; enabled on `NEXT_PUBLIC_SENTRY_DSN`
- **`apps/soulstep-admin-web`** — added `src/lib/sentry.ts` (`@sentry/react`); `initSentry()` called in `main.tsx`; enabled on `VITE_SENTRY_DSN`

### Frontend (mobile)
- **`apps/soulstep-customer-mobile`** — added `@sentry/react-native`; initialised in `index.js` (`Sentry.wrap(App)`) on `EXPO_PUBLIC_SENTRY_DSN`; disabled in `__DEV__`

### Docs
- **`ENV_VARS.md`** — replaced `GLITCHTIP_DSN` / `NEXT_PUBLIC_GLITCHTIP_DSN` with `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `VITE_SENTRY_DSN`, `EXPO_PUBLIC_SENTRY_DSN`
- **`PRODUCTION.md`** — updated error tracking section and secrets table to reference Sentry

---

## [2026-04-19] — VM Migration: Docker Compose + GHCR + SSH Deploy

### Backend
- **`docker-compose.prod.yml`** — new production orchestration: postgres:15 (tuned for e2-micro, 384 MB memory limit), catalog-api, scraper-api, nginx, certbot; all services on `soulstep_net` bridge network
- **`nginx/`** — alpine nginx reverse proxy with `USE_SSL` toggle; `http.conf` (pre-TLS) and `ssl.conf` (TLS + HSTS) templates; `entrypoint.sh` selects config at container startup; `catalog-api.soul-step.org` → catalog-api:3000, `scraper-api.soul-step.org` → scraper-api:8080
- **`scripts/vm-bootstrap.sh`** — one-shot Debian 12 VM provisioning: Docker, gcloud CLI, repo clone, Postgres start, crontab install
- **`scripts/backup-db.sh`** — daily pg_dump → gzip → local + GCS, 7-day local retention
- **`scripts/restore-db.sh`** — restore from `.sql.gz` (local or `--from-gcs`)
- **`scripts/cron/soulstep-cron`** — 4 VM crontab entries replacing Cloud Run Jobs: DB backup 02:00, place sync 03:00, image cleanup Mon 05:00, timezone backfill Sun 04:00 (all UTC)
- **`.env.example`** (root) — VM env template written to `/opt/soulstep/.env` by GitHub Actions on every deploy
- Migrations continue to run automatically on `catalog-api` startup via the existing `lifespan → run_migrations()` hook

### CI/CD
- **`.github/workflows/deploy-vm.yml`** — new SSH-based deployment workflow: builds `soulstep-catalog-api` + `soulstep-scraper-api` (lean) + `soulstep-scraper-api-job` (Playwright) images to GHCR; SSHes to VM, writes `.env` from GitHub Secrets, pulls images, `docker compose up --force-recreate`; updates Cloud Run Job in 3 regions (europe-west1/west4/west2) via WIF
- Runtime secrets moved from **GCP Secret Manager** to **GitHub Actions Secrets** (environment: `production`); written to VM `.env` at deploy time
- Docker images moved from **GAR** (`europe-west1-docker.pkg.dev`) to **GHCR** (`ghcr.io/hussu97/`) — simpler auth via `GITHUB_TOKEN`

### Docs
- **`PRODUCTION.md`** — full rewrite for VM deployment; removed Cloud Run / Cloud SQL / Artifact Registry / Secret Manager instructions
- **`ARCHITECTURE.md`** — updated production hosting description, monorepo layout (added `nginx/`, `scripts/`, `docker-compose.prod.yml`), and scheduled jobs section (Cloud Run Jobs → VM cron)
- **`ENV_VARS.md`** — updated platform summary and removed GCP Secret Manager / Cloud Run env var delivery descriptions; now references GitHub Actions Secrets and `docker-compose.prod.yml`

---

## [2026-04-16] — Migrate Web Frontends from Firebase Hosting to Vercel

### Frontend (web)
- **`apps/soulstep-customer-web/vercel.json`** — new Vercel config; deploys Next.js SSR to `cdg1` (Paris)
- **`apps/soulstep-admin-web/vercel.json`** — new Vercel config; SPA fallback + `/api/*` → `https://catalog-api.soul-step.org/api/*` server-side rewrite

### Docs
- **`PRODUCTION.md`** — sections 4, 5, CI table, and GitHub secrets table updated for Vercel
- **`apps/soulstep-admin-web/README.md`** — deployment note updated
- **`apps/soulstep-customer-web/.env.example`** and **`apps/soulstep-admin-web/.env.example`** — updated production env var instructions

### CI/CD
- **`.github/workflows/deploy.yml`** — `deploy-web` and `deploy-admin-web` jobs rewritten: GCP auth removed, now use `vercel pull → vercel build --prod → vercel deploy --prebuilt --prod` with `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID_WEB`/`VERCEL_PROJECT_ID_ADMIN` secrets
- **`firebase.json`** and **`.firebaserc`** — removed (no Firebase Hosting targets remain)

---

## [2026-04-16] — URL Cleanup: Clean SEO Slugs and City Pages

### Backend
- **`app/services/seo_generator.py`** — `generate_slug` rewrote disambiguation logic: uses city name for collision resolution instead of raw Google Place ID; city with digits (street address) is skipped; falls back to short 8-char hash only as last resort
- **`app/api/v1/sitemap.py`** — `_city_to_slug` now normalises Unicode (NFKD → ASCII); added `_is_real_city_slug` filter that rejects slugs with digits, length > 40 chars, or known garbage values; city pages now require ≥ 2 places (`_CITY_MIN_PLACES`)
- **`tests/test_seo.py`** — 19 new tests in `TestGenerateSlug`, `TestCitySlugFilter`, and `TestCityToSlug` covering clean slug generation and city filter edge cases

---

## [2026-04-16] — Backend Data Quality Fixes (B4 + B5)

### Backend
- **`app/db/models.py`** — `Place.lat` and `Place.lng` are now nullable (`float | None`); removes the (0.0, 0.0) sentinel anti-pattern (B5)
- **`app/models/schemas.py`** — `PlaceCreate.lat` / `PlaceCreate.lng` accept `None` (B5)
- **`app/api/v1/place_serializers.py`** — guard `get_nearby_places` call when coordinates are `None`; returns empty nearby list (B5)
- **`app/services/structured_data.py`** — `build_place_jsonld` only emits `geo` block when both `lat` and `lng` are set (B5)
- **`app/api/v1/admin/places.py`** — `GET /api/v1/admin/places/data-quality` endpoint lists places with `null_coordinates`, `zero_coordinates`, or `unknown_religion` issues; positioned before `{place_code}` route to avoid route shadowing (B4)
- **`migrations/versions/0028_nullable_coordinates.py`** — makes `lat`/`lng` nullable; backfills `(0.0, 0.0)` rows to `NULL` (B5)
- **`tests/test_b4_b5_data_quality.py`** — 10 new tests covering nullable coordinates, geo JSON-LD guard, and data-quality endpoint

### Scraper API
- **`app/pipeline/place_quality.py`** — added `VALID_SACRED_GMAPS_TYPES` frozenset and `is_sacred_site(raw_data)` function to filter non-sacred places at the sync gate (B4)
- **`app/collectors/gmaps.py`** — changed `lat`/`lng` defaults from `0` to `None` so missing coordinates are not stored as `(0.0, 0.0)` (B5)
- **`tests/test_sacred_site_filter.py`** — 19 new tests for `is_sacred_site()` including case-insensitivity, fallback to `types` list, and backwards-compat for empty raw_data

---

## [2026-04-16] — SSR Migration: SEO / GEO / AdSense Architecture

### Frontend (web)
- **`src/lib/server/api.ts`** — new server-only fetch module (`fetchBlogPost`, `fetchBlogPosts`, `fetchPlace`, `fetchCityMeta`) using `INTERNAL_API_URL` → `NEXT_PUBLIC_API_BASE_URL` → fallback, with 1h ISR revalidation
- **`src/components/server/JsonLd.tsx`** — new Server Component that renders `<script type="application/ld+json">` tags server-side (visible to all crawlers)
- **`src/lib/server/metadata.ts`** — metadata builders: `buildBlogMetadata`, `buildBlogListMetadata`, `buildBlogJsonLd`, `buildPlaceMetadata`, `buildPlaceJsonLd`, `buildCityMetadata`, `buildCityReligionMetadata`, `buildStaticMetadata`
- **`src/lib/types/blog.ts`** — added `author_name`, `tags`, `word_count`, `cover_image_url`, `faq_json` fields
- **`app/(main)/layout.tsx`** — removed `'use client'`; nav HTML now server-rendered (crawlers can see site navigation)
- **`src/components/layout/MainLayoutClient.tsx`** — new `'use client'` wrapper preserving existing Layout interactivity
- **Static pages** (`about`, `privacy`, `terms`, `contact`, `developers`) — added `export const metadata` via `buildStaticMetadata()`; unblocks AdSense review
- **`app/(main)/blog/[slug]/page.tsx`** — `generateMetadata()` + `<JsonLd>` with Article + FAQPage schema; blog posts now crawler-visible
- **`app/(main)/blog/page.tsx`** — static metadata for blog listing
- **`app/(main)/blog/[slug]/opengraph-image.tsx`** — dynamic 1200×630 OG image via `ImageResponse`; distinct per-post social cards
- **`app/(main)/places/[placeCode]/page.tsx`** and **`/[placeCode]/[slug]/page.tsx`** — `generateMetadata()` + `<JsonLd>` with PlaceOfWorship + BreadcrumbList + FAQPage schema
- **`app/(main)/explore/[city]/page.tsx`** and **`/[city]/[religion]/page.tsx`** — dynamic city/religion metadata
- **`app/(main)/home/page.tsx`** — static metadata + `<JsonLd>` with WebSite + SearchAction + Organization schema
- **`app/api/sitemap/route.ts`**, **`feed-xml/route.ts`**, **`feed-atom/route.ts`** — proxy routes for sitemap + RSS/Atom feeds (1h cache)
- **`next.config.ts`** — added rewrites for `/sitemap.xml`, `/feed.xml`, `/feed.atom` → proxy route handlers (all envs)
- **`public/robots.txt`** — added `soul-step.org/sitemap.xml` as primary sitemap
- **`.env.example`** — documented `INTERNAL_API_URL` (server-only, no `NEXT_PUBLIC_` prefix)

### Docs
- **`ENV_VARS.md`** — added `INTERNAL_API_URL` to Customer Web section

---

## [2026-04-16] — Migrate Blog to Backend API

### Backend
- **`app/db/models.py`** — added `BlogPost` SQLModel table with `post_code` PK, `slug` unique index, `title`, `description`, `published_at`, `updated_at`, `reading_time`, `category`, `cover_gradient`, `content` (JSON), `is_published`
- **`migrations/versions/0026_blog_posts.py`** — Alembic migration creating `blog_post` table
- **`app/api/v1/blog.py`** — new router: `GET /api/v1/blog/posts` (list, no content), `GET /api/v1/blog/posts/{slug}` (full detail)
- **`app/db/blog_seed_data.json`** — all 17 articles with publication dates spread Aug 2025 – Apr 2026 (~14 days apart) for organic crawl cadence
- **`app/db/seed.py`** — `_seed_blog_posts()` upserts articles on startup; called from `run_seed_system`
- **`app/api/v1/sitemap.py`** — removed hardcoded `_BLOG_SLUGS` tuple; sitemap now queries `blog_post` table dynamically
- **`tests/test_blog.py`** — 11 backend tests (list, detail, 404, ordering, field validation)

### Frontend (web)
- **`src/lib/types/blog.ts`** — new type file: `ArticleSection`, `BlogPostSummary`, `BlogPostDetail`
- **`src/lib/api/client.ts`** — added `getBlogPosts()` and `getBlogPost(slug)` with 5-min cache
- **`src/app/pages/BlogListPage.tsx`** — fetches from API with loading skeleton
- **`src/app/pages/BlogPostPage.tsx`** — fetches from API with loading skeleton; related posts via API
- **`src/app/pages/Home.tsx`** — blog section fetches from API; removed static import
- **`src/lib/blog/articles.ts`** — deleted (content now lives in the database)
- **`src/__tests__/blog.test.ts`** — rewritten to test API client functions with mocked fetch

---

## [2026-04-16] — Fix Customer Web Deployment for Next.js SSR

### Docs / CI
- **`firebase.json`** — removed stale `customer` hosting target (Next.js SSR cannot be served as static files on Firebase Hosting)
- **`.firebaserc`** — removed `customer` from hosting targets
- **`Dockerfile`** — rewrote for Next.js standalone output: multi-stage build using `node:20-slim` runner instead of nginx; copies `.next/standalone`, `.next/static`, and `public/`; added `ARG`/`ENV` for `NEXT_PUBLIC_*` build args
- **`next.config.ts`** — added `output: 'standalone'` for Docker/Cloud Run standalone server generation
- **`.github/workflows/deploy.yml`** — updated `deploy-web` job: builds Docker image → pushes to Artifact Registry → deploys to Cloud Run (`soulstep-customer-web`); replaced stale Vite cache and `VITE_*` env vars with `NEXT_PUBLIC_*`
- **`PRODUCTION.md`** §8 — updated CI/CD table and GitHub secrets to reflect Cloud Run deployment

---

## [2026-04-16] — Migrate Customer Web to Next.js 15 (SSR)

### Frontend (web)
- **Next.js 15 migration** — replaced Vite + React SPA with Next.js 15 App Router; all pages now server-side render so Google AdSense and crawlers receive real HTML content instead of a blank `<div id="root">`
- **App Router file structure** — created `app/` directory with `layout.tsx`, `page.tsx`, `not-found.tsx`, `AppClientShell.tsx`, `globals.css`, and a `(main)/` route group with one `page.tsx` per route (35 pages total)
- **React Router compat shim** — added `src/lib/navigation.tsx` re-exporting `useNavigate`, `useParams`, `useLocation`, `useSearchParams`, `Navigate`, `Link` as Next.js wrappers; all 37 page/component files updated to import from `@/lib/navigation`
- **SSR safety fixes** — added `typeof window === 'undefined'` guards to all `localStorage`/`sessionStorage`/`document`/`window` accesses in `useState` initializers and render-time code: `providers.tsx`, `useAdConsent.ts`, `useAnalytics.ts`, `cache.ts`, `theme.ts`, `searchHistory.ts`, `FeedbackPopup.tsx`, `Modal.tsx`
- **I18nReadyGate** — changed to render children on the server and show the animated splash only after client mount (`isClient` state), preventing blank SSR output
- **Env var rename** — `VITE_*` replaced with `NEXT_PUBLIC_*` across all source files and docs
- **PostCSS config** — converted `postcss.config.js` to CJS `module.exports` format (required by Next.js)
- **Service worker** — replaced `virtual:pwa-register` (Vite-only) with native Service Worker API in `sw-update.ts`
- **Sentry** — changed `@sentry/react` import to `@sentry/nextjs` in `ErrorBoundary.tsx`
- **Auth redirect** — replaced React Router `state={{ from }}` pattern with `?from=encodedPath` query param in `ProtectedRoute.tsx` and `Login.tsx`
- **Edit review** — replaced navigation state with `?editReview=code` query param in `PlaceDetail.tsx` and `WriteReview.tsx`

### Docs
- Updated: web README (Next.js commands, env vars, directory structure), ENV_VARS.md (VITE_* → NEXT_PUBLIC_*), .env.example, ARCHITECTURE.md, PRODUCTION.md (Next.js build + Cloud Run deployment), CHANGELOG

---

## [2026-04-16] — AdSense Compliance: Legal Pages, SEO, and Trust Signals

### Frontend (web)
- **Privacy Policy page** (`/privacy`) — comprehensive privacy policy covering data collection, Google AdSense cookies, Google Consent Mode v2, Umami analytics, user rights (GDPR/CCPA), and data deletion; satisfies all Google AdSense Required Content requirements
- **Terms of Service page** (`/terms`) — covers accounts, user-generated content, acceptable use, intellectual property, advertising, disclaimers, and liability
- **About page** (`/about`) — mission statement, features grid, 8-religion coverage grid with Material icons, data sources, open API callout, and Organization JSON-LD structured data
- **Contact page** (`/contact`) — 3-method contact grid (general inquiries, bug reports, API support) with response time commitment
- **Layout footer** — added desktop and mobile footers with links to About, Privacy, Terms, Contact, and API across all pages
- **index.html SEO** — added static meta description, Open Graph tags (type, site_name, title, description, url, image), Twitter Card tags, and a `<noscript>` fallback block with full descriptive content for non-JS crawlers

### Backend
- **Sitemap** — added /about, /privacy, /terms, /contact, /developers to the XML sitemap with monthly changefreq

### Docs
- Updated: web README (routes table), CHANGELOG

---

## [2026-03-19] — Scraper Observability & Performance Improvements

### Backend (scraper)
- **Per-stage timing metrics** — `ScraperRun` now tracks `discovery_duration_s`, `detail_fetch_duration_s`, `image_download_duration_s`, `enrichment_duration_s`, `sync_duration_s`, and `avg_time_per_place_s` for SLA monitoring and bottleneck identification
- **Consolidated place type mapping queries** — new `PlaceTypeMaps` class and `load_place_type_maps(session)` function query `PlaceTypeMapping` once and derive all lookup dicts (`gmaps_type_to_our_type`, `gmaps_type_to_religion`, `religion_to_gmaps_types`); eliminates 100+ redundant DB queries per run
- **Structured logging enrichment** — key log calls in `scraper.py`, `gmaps.py`, and `gmaps_browser.py` now include `extra={}` fields (`run_code`, `duration_s`, `places_found`, etc.) for Cloud Logging queryability
- **Migration 0021** — adds 6 nullable Float columns to `scraperrun` for timing metrics

---

## [2026-03-18] — Cloud Run Resource Optimization & Multi-Region Job Dispatch

### Backend (scraper)
- **Capacity-aware queue processor** — new `app/jobs/queue_processor.py` runs as a background asyncio task polling every 15s; counts active jobs per region and dispatches queued runs to regions with available capacity; supports both `cloud_run` and `local` dispatch modes
- **New `queued` status** — runs are now created with `status="queued"` instead of `pending`; the queue processor transitions them to `pending` when dispatching; status flow: `queued` → `pending` → `running` → `completed`/`failed`
- **Multi-region config** — new `CLOUD_RUN_REGIONS` env var (format: `region1:max_jobs,region2:max_jobs,...`) with `region_capacity`, `available_regions`, and `total_max_jobs` properties on Settings
- **Resume via queue** — resume endpoint now sets status back to `queued` and lets the queue processor handle dispatch (resume detection: `stage` set or `processed_items > 0`)
- **Dispatcher accepts region param** — `dispatch_cloud_run()` now takes an optional `region` parameter; re-raises exceptions so the queue processor can revert failed dispatches to `queued`
- **Cancel accepts queued status** — cancel endpoint now allows cancelling `queued` runs
- **Tests** — 28 new tests: 16 in `test_multi_region_dispatch.py` (config parsing, region extraction, active counting), 12 in `test_queue_processor.py` (capacity enforcement, FIFO ordering, failure recovery, resume detection, local mode, multi-region distribution)

### Infra
- **Catalog API resource limits** — `--cpu 1 --memory 512Mi --min-instances 0 --max-instances 3` (was: Cloud Run defaults)
- **Scraper API resource limits** — `--cpu 1 --memory 512Mi --min-instances 0 --max-instances 2` (was: `--max-instances 1`, no explicit cpu/memory)
- **Scraper Job memory reduction** — `--memory 6Gi` (was: `8Gi`); 2.3 GiB headroom over realistic peak of ~3.7 GB
- **Multi-region auto-deploy** — new `EXTRA_JOB_REGIONS` env var in `deploy.yml`; when set, CI tags/pushes the job image to extra region registries and upserts the Cloud Run Job in each region

### Docs
- **MULTI_REGION_JOBS.md** — new standalone guide: architecture, setup steps, quota budget, cost breakdown
- Updated: ENV_VARS.md, .env.example, scraper README (CLOUD_RUN_REGIONS, queue pipeline diagram), PRODUCTION.md (6 GiB job, service limits), ARCHITECTURE.md (queue processor + multi-region sections)

---

## [2026-03-18] — Review Image Support (Browser Mode) + Card Selector Fix

### Backend (scraper)
- **Browser card selector fix** — `_extract_reviews` JS now uses `.jftiEf` (one element per review card) instead of `[data-review-id]` which matched 32 nested sub-elements per card; author selector simplified to `.d4r55` only (eliminates author-stats text being concatenated into the name)
- **Review photo lazy-load trigger** — before extracting reviews, browser panel is scrolled and each review photo button has `scrollIntoView()` called to trigger Google Maps' IntersectionObserver and populate `img.src`; three fallbacks tried: `img.src`, `img.dataset.src`, CSS `background-image`
- **Review image download pipeline** — `_capture_review_images` method downloads review-attached photo bytes; `_review_image_bytes` returned as `list[tuple[review_idx, photo_idx, bytes]]` alongside normal scrape result
- **GCS upload write-back** — `_flush_detail_buffer` uploads review image bytes to GCS and writes back GCS URLs into `external_reviews[i].photo_urls` in `ScrapedPlace.raw_data`
- **`SCRAPER_MAX_REVIEW_IMAGES` config** — new optional env var (default `2`); limits photos downloaded per review in browser mode; forwarded to Cloud Run Job containers; documented in `ENV_VARS.md` and `.env.example`
- **Tests** — `TestReviewPhotoUrlsInBuildPlaceData` (2 tests): photo_urls preserved through `build_place_data`; `TestFlushDetailBufferReviewImages` (3 tests): GCS write-back, no-op when key absent, GCS failure leaves reviews unchanged; `TestCaptureReviewImages` (1 test): `max_review_images` config respected

### Backend (catalog API)
- **`ExternalReviewInput.photo_urls`** — new `list[str] = []` field on the Pydantic schema; validated during sync and passed through to DB
- **`upsert_external_reviews`** — stores `photo_urls` on `Review` records (dict and object input paths both handled)
- **`sync_places.py`** — `_sanitize_reviews` passes `photo_urls` when constructing `ExternalReviewInput`
- **Tests** — `test_upsert_external_reviews_stores_photo_urls` and `test_upsert_external_reviews_replaces_photo_urls_on_re_upsert` added to `test_reviews_db_extra.py`

---

## [2026-03-18] — Opening Hours Parsing Fix + Max Reviews Env Var

### Backend (scraper)
- **`normalize_to_24h` fix** — regex now handles en/em dashes without surrounding spaces (`"9 AM–12 PM"`) and times without minutes (`"9 AM"` vs `"9:00 AM"`); both formats returned by Google Places API v1 `weekdayDescriptions` are now correctly converted to 24h format
- **`SCRAPER_MAX_REVIEWS` env var** — replaces hardcoded `5` in `ReviewExtractor.from_gmaps()` and the browser `_extract_reviews` JS; default remains 5; forwarded to Cloud Run Job containers
- **`_extract_reviews` improvements** — extended Reviews tab selector to include `jsaction`/`role="tab"` variants; wait time after tab click increased from 1.5 s → 2.0 s; review card JS selector extended with `.GHT2ce` fallback
- **Tests** — 6 new `test_normalize.py` cases covering en-dash without spaces and times without minutes

### Backend (catalog API)
- **Concatenated multi-slot hours fix** — `_is_open_now_from_hours` now pre-processes Google's omitted-comma format (`"9–11:30 am6–8:30 pm"`) by inserting a comma at the AM/PM → digit boundary before slot splitting; places with two-slot days no longer return `open_status: "unknown"`
- **Tests** — 2 new `test_hours_parsing.py` cases covering concatenated multi-slot (lowercase and uppercase AM/PM)

---

## [2026-03-18] — Geo Box Tightening + Seed Reset + Parallel Per-Box Cloud Run Dispatch

### Backend
- **UAE geo boxes: 8 → 11** — trim `al_ain` lng_max 56.0→55.7 (avoids Oman's Buraimi); split `ras_al_khaimah` into `rak_main` + `rak_east_coast` (avoids Musandam exclave); split `fujairah` into `fujairah_south` + `fujairah_dibba` (avoids Oman's Dibba Al Baya at ~56.27°E lat 25.6°N)
- **India geo boxes: 25 → 28** — trim `northwest_punjab_haryana` lng_min 73.8→74.0; split `jammu_kashmir` into `jammu` + `kashmir_valley` (avoids Pakistan-occupied Kashmir and Aksai Chin); trim `west_gujarat` lat_max 24.5→22.8; add `gujarat_northwest` for Kutch/Bhuj (avoids Pakistan's Sindh at ~68.5°E)
- **Seed functions: delete-then-reinsert** — `seed_geo_boundaries` and `seed_geo_boundary_boxes` now clear existing rows before re-inserting; can be re-run without manual DB cleanup
- **`ScraperRun.geo_box_label`** — new nullable field; when set, run only processes the named geo boundary box
- **Migration 0018** — adds `geo_box_label` column to `scraperrun` table
- **`POST /runs` fan-out** — when `SCRAPER_DISPATCH=cloud_run` and location is a country, creates N parallel runs (one per geo box), each with `geo_box_label` set; local dispatch and city/state locations still create 1 run
- **`discover_places` + `run_gmaps_browser_scraper`** — filter geo boxes by `run.geo_box_label` when set; raises `RuntimeError` if the label doesn't match any seeded box

### Frontend (admin)
- **`ScraperRun` type** — add `geo_box_label?: string | null` field
- **`startRun`** — return type updated to `{ runs: ScraperRun[] }` to match new multi-run response
- **ScraperRunsPage** — new "Geo Box" column shows box label for country fan-out runs, "all" for city/state/local runs

---

## [2026-03-17] — Multi-Language SEO Template System

### Backend
- **New models**: `SEOLabel`, `SEOContentTemplate`, `PlaceSEOTranslation` — DB-driven SEO generation replacing hardcoded English strings
- **PlaceSEO**: Added `template_version` field to track which template version was used for generation; enables stale detection when templates change
- **SEO generation**: New `generate_all_langs()` generates SEO content (meta title, description, structured data, FAQ) for all supported languages using DB templates and labels
- **Admin CRUD**: Full endpoints for managing SEO templates (`GET/PATCH /admin/seo/templates`), labels (`GET/PATCH /admin/seo/labels`), and detecting stale SEO entries (`GET /admin/seo/stale`)
- **Generate endpoints**: `POST /admin/seo/generate` and `POST /admin/seo/places/{code}/generate` now accept a `langs` param to target specific languages
- **Seed system**: Default SEO templates and labels seeded on startup for all supported languages

### Frontend (admin)
- **SEO Templates page**: New admin page for managing SEO content templates with per-language editing
- **Coverage stats**: Per-language SEO coverage statistics showing generation completeness
- **Multi-lang bulk generate**: Bulk SEO generation with language selection support
- **Per-lang detail tabs**: Place SEO detail view with language tabs showing translated meta titles, descriptions, and FAQs

---

## [2026-03-17] — Fix Chromium TargetClosedError & EU Consent Redirect in Cloud Run

### Backend
- **Fix**: Removed `--single-process` Chromium flag that caused `TargetClosedError` when creating a 2nd browser context in Cloud Run containers
- **Fix**: EU GDPR consent redirect (`consent.google.com`) now handled — browser contexts pre-set `SOCS`/`CONSENT` cookies to bypass, with click-through fallback
- **Optimization**: Added memory-saving Chromium flags (`--disable-background-networking`, `--disable-sync`, `--mute-audio`, etc.) and `--disable-features=site-per-process` on Linux
- **Default change**: `MAPS_BROWSER_POOL_SIZE` reduced from 15 → 5 to fit safely in 4-8 GB Cloud Run Jobs
- **Resilience**: Added 1s stabilisation delay after browser reinit before retry
- **Diagnostics**: Startup logging now reports available memory and `/dev/shm` size on Linux

### Docs
- **Dockerfile.job**: Set `TMPDIR=/tmp` and ensure `/tmp` is writable by appuser for Chromium profile dirs

---

## [2026-03-17] — Standardize Pagination API

### Backend
- **Breaking**: All paginated endpoints now use `page` (1-indexed) + `page_size` query params and return `{ items, total, page, page_size }` response shape
- **Removed**: `cursor`/`next_cursor` from places list, `offset`/`limit` from notifications, reviews, cities
- **New**: `app/api/pagination.py` — shared `paginate_query()` helper and `offset_for()` utility
- **DB**: `list_places()` now accepts `offset` instead of `cursor` and returns `total` count
- **DB**: Added `count_notifications_for_user()` to notifications module

### Frontend (web)
- Updated all API client functions (`getPlaces`, `getPlaceReviews`, `getNotifications`, `getCities`) to use `page`/`page_size` params
- Updated all response consumers to read `items` instead of `places`/`reviews`/`notifications`/`cities`
- Converted Places page from cursor-based to page-based infinite scroll
- Converted ExploreCities page from offset-based to page-based infinite scroll

### Frontend (mobile)
- Mirror of all web API client and screen changes for feature parity

---

## [2026-03-17] — Fix: Cloud Run Job Hangs at "Acquiring browser session..."

### Backend
- **P0 fix**: Semaphore leak in `browser_pool.py` `acquire()` — if `_init()` or `_create_session()` threw an exception the semaphore was never released, causing all subsequent `acquire()` calls to deadlock
- **Container flags**: Added `--single-process`, `--no-zygote`, and `--disable-accelerated-2d-canvas` Chromium launch flags to prevent child-process IPC deadlocks in constrained Cloud Run containers
- **`_init()` resilience**: Partial Playwright/browser state is cleaned up on launch failure so retries start fresh instead of seeing stale objects
- **Resource bump**: Cloud Run Job upgraded from 2 GB / 2 vCPU → 8 GB / 4 vCPU to support 10 concurrent browser contexts
- **Defaults**: `MAPS_BROWSER_POOL_SIZE` 3 → 15, `MAPS_BROWSER_CONCURRENCY` 3 → 10
- **Tests**: Added semaphore-leak tests (init failure + session failure), extended Chromium flag assertions

### Docs
- **PRODUCTION.md**: Added §13.1 "Scraper Job Cost Estimate" — fully browser-based, $0 API cost, per-phase breakdown for 100k places

---

## [2026-03-17] — Fix: Sitemap XML + Custom Domain Docs

### Backend
- **Fix**: Removed duplicate `xmlns:xhtml` attribute in `sitemap.xml` that caused XML parse errors — `_register_ns()` already declares the namespace globally, so the manual `.set()` calls were redundant

### Docs
- **PRODUCTION.md**: Added §3.1 "Custom Domain (`catalog-api.soul-step.org`)" with step-by-step Cloud Run domain mapping, DNS CNAME setup, and env var update table
- **PRODUCTION.md**: Updated all placeholder Cloud Run URLs (`soulstep-catalog-api-xxxx.a.run.app`) to `catalog-api.soul-step.org` in CORS, build commands, GitHub secrets, SEO section, mobile checklist, and scraper deploy
- **PRODUCTION.md**: Expanded SEO section with full URLs and added `llms-full.txt` + `ai-plugin.json` to the endpoint table
- **Frontend static SEO files**: Updated `robots.txt`, `llms.txt`, and `ai-plugin.json` in `apps/soulstep-customer-web/public/` to use `catalog-api.soul-step.org` instead of the raw Cloud Run URL
- **docs/local-scraper-sync.md**: Updated production URL reference to `catalog-api.soul-step.org`

---

## [2026-03-17] — Fix: Scraper Job Hanging in GCP Cloud Run

### Backend
- **P0 fix**: Added missing `--disable-dev-shm-usage` Chromium flag to `browser_pool.py` — fixes silent browser hang in Docker/Cloud Run where `/dev/shm` is limited to 64 MB
- **Acquire timeout**: `pool.acquire()` now uses `asyncio.wait_for(90s)` on the semaphore and caps recursive retries at 5, raising `AcquireTimeoutError` instead of blocking forever
- **Route handler safety**: Wrapped `route.abort()`/`route.continue_()` in try/except so failed resource blocking doesn't leave requests unresolved
- **Cell timeout**: Each grid cell navigation is wrapped in `asyncio.wait_for(120s)` — returns `[]` on timeout instead of hanging
- **Scroll timeout**: The scroll-until-stable loop is wrapped in `asyncio.wait_for(60s)` with per-evaluate 10s timeouts
- **Diagnostic logging**: Added timing logs around acquire, page.goto, and scroll steps for debugging future hangs
- **New constants**: `BROWSER_ACQUIRE_TIMEOUT_S`, `BROWSER_CELL_TIMEOUT_S`, `BROWSER_SCROLL_TIMEOUT_S`, `BROWSER_EVALUATE_TIMEOUT_S`, `BROWSER_ACQUIRE_MAX_RETRIES` in `constants.py`
- **Tests**: 6 new tests covering Chromium flags, acquire timeout, retry limit, route handler safety, cell timeout, and scroll timeout

---

## [2026-03-17] — CI/CD: Make Tests Lightning Fast

### Backend
- **Session-scoped `client` fixture**: Both catalog and scraper `conftest.py` now create the `TestClient` once per session instead of per-test, eliminating ~1,977 ASGI lifespan startups
- **Smart `_reset_db`**: Tracks dirty tables via SQLAlchemy `before_cursor_execute` event; only DELETEs from tables that received writes (typically 2-5 vs all 35/10)
- **Pre-computed auth fixture**: `auth_client` now inserts a user directly with a pre-hashed password and creates JWT inline, skipping the HTTP round-trip and bcrypt per test
- **Python 3.12**: Updated `target-version` in both `pyproject.toml` files from `py311` to `py312`

### CI/CD
- **`uv` for Python installs**: Replaced `pip install` with `astral-sh/setup-uv@v4` + `uv pip install` for 10-100x faster dependency resolution; uses uv's built-in download cache (no broken venv symlinks)
- **Removed `pip-audit` from test workflow**: Moved to new weekly `audit.yml` workflow (Monday 6am UTC) — saves ~10-20s per Python job
- **Conditional coverage**: `--cov` flags only added on `main` branch pushes, not PR runs — saves ~20-30% overhead on PRs
- **Python 3.12 in CI**: Upgraded from 3.11 to 3.12 for 10-15% runtime improvement
- **Removed admin build step**: `npm run build` removed from admin-web test job (belongs in deploy workflow)
- **New `audit.yml` workflow**: Weekly dependency vulnerability scan via `pip-audit` for both services, with `workflow_dispatch` for manual runs

---

## [2026-03-16] — P0: Security & Data Protection

### Backend
- **Rate limit `/auth/refresh`**: Added `@limiter.limit("10/minute")` to the token-refresh endpoint (Item 1)
- **Account lockout**: Added `failed_login_attempts` + `locked_until` fields to `User`; login returns `423 Locked` with `Retry-After` header after 10 consecutive failures; resets on success (Item 2)
- **Admin rate limiting**: Added `admin_limiter` with per-user JWT key function; bulk endpoints limited to 10/minute (Item 3)
- **HTTPS redirect**: Added `HTTPSRedirectMiddleware` behind `ENFORCE_HTTPS` env flag; passes `exc.headers` in exception handler so `Retry-After` is forwarded correctly (Item 4)
- **Account deletion** (`DELETE /api/v1/users/me`): Anonymises PII, soft-deletes check-ins/reviews, revokes all refresh tokens (Item 5)
- **Email verification**: New `EmailVerification` model; `/auth/verify-email` and `/auth/resend-verification` endpoints; `email_verified` field in `UserResponse`; verification email sent on registration via Resend (Item 6)
- **Soft-delete on CheckIn/Review**: Added `deleted_at` column to both models; all query functions exclude soft-deleted rows; admin listing accepts `include_deleted=true`; bulk-delete endpoints now soft-delete instead of hard-delete (Item 7)
- **Migration `0024_security_and_data_protection`**: Single migration adding all new columns + `emailverification` table
- **26 new tests** in `tests/test_p0_security.py` covering all P0 items; 2 existing bulk tests updated for soft-delete behaviour; all 1254 tests pass

---

## [2026-03-17] — P1: CI/CD hardening, accessibility & UX, performance

### Backend
- **N+1 queries**: Eliminated per-row Place/User DB queries in `admin/check_ins.py`, `admin/reviews.py`, and `admin/users.py` — replaced with batch `WHERE ... IN (...)` lookups, reducing up to 4000 queries/page to 2
- **404 translations**: Added `errors.pageNotFound` and `errors.pageNotFoundDesc` keys for all 5 languages (en, ar, hi, te, ml) in `seed_data.json`

### Frontend (web)
- **Dark mode contrast**: Updated `dark-text-secondary` token from `#A39C94` to `#C4BDB5` in `tailwind.config.js` — meets WCAG AA 4.5:1 requirement (~4.8:1 on `#242424`)
- **Modal focus trap**: `Modal.tsx` now traps Tab/Shift+Tab focus within the dialog; auto-focuses first focusable element on open
- **Form labels**: `AuthModal.tsx` inputs now have visually hidden `<label>` elements (`sr-only`) for all login and register fields
- **Carousel accessibility**: New `HorizontalCarousel` component adds `role="region"`, `aria-label`, and ArrowLeft/ArrowRight keyboard navigation; applied to Home, NearbyPlaces, PlaceTimingsCarousel
- **404 page**: New `NotFoundPage.tsx` with icon, message, and links to Home and Places; catch-all route in `routes.tsx` now renders the page instead of silently redirecting
- **Request caching**: New `src/lib/api/cache.ts` TTL cache; `getTranslations` (30min), `getLanguages` (30min), `getMe` (1min) cached in `client.ts`; mutations invalidate relevant cache prefixes
- **AbortController**: `MapDiscovery.tsx` and `Places.tsx` now abort in-flight requests when new ones are issued; `getPlaces` accepts optional `AbortSignal`

### Frontend (mobile)
- **Dark mode contrast**: Updated `darkTextSecondary` token from `#A39C94` to `#C4BDB5` in `theme.ts`
- **Request caching**: New `src/lib/api/cache.ts` with same TTL cache; `getTranslations`, `getLanguages`, `getMe` cached in mobile `client.ts`; same mutation invalidation

### Docs / CI
- **Scraper healthcheck**: Added `HEALTHCHECK` to `soulstep-scraper-api/Dockerfile` (HTTP GET `/health` on port 8080)
- **docker-compose healthchecks**: Added explicit `healthcheck` entries for `api`, `web`, and `scraper` services in `docker-compose.yml`
- **docker-compose resource limits**: Added `deploy.resources.limits` to all services — db (512M/0.5CPU), api (512M/0.5CPU), web (256M/0.25CPU), scraper (1G/1CPU)

---

## [2026-03-16] — Security hardening: dockerignore, non-root containers, CI scanning, pagination bounds

### Backend
- **Pagination**: Added `le=100` upper-bound validation to all unbounded public `limit` params — places list, place reviews, group activity, and notifications endpoints
- **Pagination**: Tightened places list endpoint from `le=500` → `le=100`

### Docs / CI
- **Dockerignore**: Added `.dockerignore` to `soulstep-catalog-api/`, `soulstep-scraper-api/`, and `apps/soulstep-customer-web/` — excludes `.git`, `.venv`, `__pycache__`, `tests/`, `.env*`, `*.pyc`
- **Non-root Docker**: `soulstep-catalog-api` Dockerfile (main, `.sync`, `.translate`) now creates and switches to `appuser` before the entrypoint (scraper images already had this)
- **CI scanning**: Removed `|| true` from `pip-audit` steps in `tests.yml` so vulnerabilities now fail the build; changed Trivy `exit-code` from `"0"` to `"1"` in `deploy.yml` for both catalog-api and scraper-api image scans

---

## [2026-03-15] — CATALOG_API_KEY: internal service auth for catalog API

### Backend
- **Catalog API**: Added `CATALOG_API_KEY` env var to `app/core/config.py`; warns on startup if unset
- Added `validate_api_key` dep + `ApiKeyDep` — validates `X-API-Key` header against `CATALOG_API_KEY`
- Added `get_admin_or_api_key` dep + `AdminOrApiKeyDep` — accepts either a valid API key or a valid admin Bearer JWT
- `POST /api/v1/places` and `POST /api/v1/places/batch` now require `X-API-Key` header (`ApiKeyDep`)
- `POST /api/v1/admin/seo/generate` now accepts API key or admin JWT (`AdminOrApiKeyDep`); removed dependency on `SCRAPER_CATALOG_ADMIN_TOKEN`
- **Scraper**: Replaced `catalog_admin_token` / `SCRAPER_CATALOG_ADMIN_TOKEN` with `catalog_api_key` / `CATALOG_API_KEY`
- `_post_batch_async`, `_post_individual_async`, `_trigger_seo_generation_async` now pass `X-API-Key` header
- **Docker**: Both `api` and `scraper` services now receive `CATALOG_API_KEY` from host env (default: `dev-key`)
- **Docs**: Updated `.env.example` for both services, `PRODUCTION.md` (Secret Manager), `soulstep-scraper-api/README.md`
- **Tests**: Catalog API conftest sets `CATALOG_API_KEY=test-api-key`; all `POST /places` and `POST /places/batch` test calls include `X-API-Key` header; scraper sync tests updated for new parameter signatures

---

## [2026-03-15] — Remove blob image storage from scraper (GCS only)

### Backend
- **Scraper**: GCS is now the only image storage path — removed all base64 blob logic
- Rewrote `download_place_images()` in `app/collectors/gmaps.py` to download photos and upload directly to GCS in one pass (Phase 3 + Phase 3b merged); GCS public URLs stored in `image_urls`
- Deleted `upload_images_to_gcs()` and `cleanup_image_downloads()` from `app/collectors/gmaps.py`
- Deleted `POST /cleanup/images` endpoint and `_run_cleanup_images_bg()` from `app/api/v1/scraper.py`
- Simplified `_flush_detail_buffer()` in `app/scrapers/gmaps.py` — always uploads browser-captured bytes to GCS (removed blob fallback)
- Removed Phase 3b blocks from `app/scrapers/gmaps.py` and `app/scrapers/gmaps_browser.py`
- Simplified `build_sync_payloads()` in `app/db/scraper.py` — sync payload always uses `image_urls`; `image_blobs` removed
- Removed `image_blobs` from `build_place_data()` return dicts in both collector files
- Removed `image_blobs` from photo count in `app/pipeline/place_quality.py` (`score_place_quality` and `score_place_quality_breakdown`)
- Updated `app/services/gcs.py`: removed `is_gcs_configured()`, `upload_image_bytes()` now raises `RuntimeError` when `GCS_BUCKET_NAME` is unset
- `GCS_BUCKET_NAME` is now a required env var in `.env.example`, `README.md`, `PRODUCTION.md`, and `ARCHITECTURE.md`
- Deleted `tests/test_image_cleanup.py`; updated `TestDownloadPlaceImages` to verify GCS URL storage

---

## [2026-03-15] — Fix browser extractor lat/lng always 0

### Backend
- Fixed JS regex in `_EXTRACT_JS` (`gmaps_browser.py`) that parsed coordinates from the Google Maps URL; old pattern `/@lat,lng\//` never matched because the real URL format is `@lat,lng,zoom/` — updated to `/@lat,lng[,/]/` so coordinates are now correctly extracted

---

## [2026-03-15] — Fix missing content translations across frontend apps

### Backend
- `GET /api/v1/homepage` now accepts `lang` query param; overlays translated `name`/`address` on popular and recommended places, and translated city names using `City.translations`
- `GET /api/v1/cities/{city_slug}` and `GET /api/v1/cities/{city_slug}/{religion}` now accept `lang` query param; overlays translated place names/addresses and translated city name
- Added 14 new UI translation keys to `seed_data.json` (all 5 languages): `common.buddhism`, `common.sikhism`, `common.judaism`, `common.bahai`, `common.zoroastrianism`, `common.all`, and `common.place_type.*` (mosque, temple, church, synagogue, gurdwara, shrine, monastery, cathedral)
- Added backend tests for `lang` overlay on homepage, city, and city+religion endpoints

### Frontend (web)
- `getCityPlaces()`, `getCityReligionPlaces()`, `getHomepage()` API client methods now pass `lang=<locale>` when locale is non-English
- `Places.tsx`: religion filter labels use `t(r.labelKey)` instead of hardcoded English; place cards show `t(\`common.${religion}\`)` with English fallback
- `Home.tsx`: popular and recommended place cards show translated religion label
- `ExploreCity.tsx`: place religion badge uses `t()` translation key
- `ExploreCities.tsx`: city names display `city.translations?.[locale] || city.city` using backend-provided translations
- Added `translationHelpers.test.ts` covering religion/place_type key mapping and fallback behaviour

### Frontend (mobile)
- `getCityPlaces()`, `getCityReligionPlaces()`, `getHomepage()` API client methods now pass `lang=<locale>` when locale is non-English
- `HomeScreen.tsx`, `ExploreCityScreen.tsx`, `NearbyPlaces.tsx`: religion labels use `t(\`common.${religion}\`)` with English fallback
- `ExploreCitiesScreen.tsx`: city names use `city.translations?.[locale] || city.city`
- Added `translationHelpers.test.ts` in parity with web

---

## [2026-03-15]

### Backend
- Removed Google Cloud Translation API (`google-cloud-translate` dependency removed); translation now exclusively uses the Cloud Run browser job and local bulktranslator script
- Removed `POST /admin/translations/jobs` and `POST /admin/translations/jobs/{code}/cancel` endpoints; bulk translation jobs are now created only by the Cloud Run `translate_content` job
- Moved `_collect_missing_items` and `_flush_translations` helpers into `translate_content.py`; gutted `bulk_translations.py` to read-only (list/get/delete)
- Removed `--translate` mode from `scripts/generate_seo.py`; SEO translations go through standard translation paths

### Frontend (web)
- Removed "New Job" button and modal from BulkTranslationsPage admin UI
- Removed cancel job action from translation jobs table; jobs are now read-only in admin

---

## fix(scraper): align GCS path with catalog API (2026-03-14)

### Backend

- **`app/services/gcs.py`** — Rewrote to use the identical path format as the catalog API: `images/places/{token_hex(16)}.{ext}`, same `GCS_BUCKET_NAME` env var, no `make_public()` (uniform bucket-level access). Old path `places/places/{code}/{idx}.jpg` removed.
- **`app/config.py`** — Removed `gcs_image_prefix` setting (prefix is now hardcoded to `images/places/` to match catalog). Updated `gcs_bucket_name` comment.
- **`app/scrapers/gmaps.py`** / **`app/collectors/gmaps.py`** — Updated `upload_image_bytes()` callers to match simplified `(data, mime_type)` signature (no `place_code`/`idx` args).

---

## fix(scraper): GCS image upload pipeline + browser photo capture (2026-03-14)

### Backend

- **`app/services/gcs.py`** (new) — `upload_image_bytes(data, mime_type)` uploads to `GCS_BUCKET_NAME` bucket under `images/places/`; gracefully skips when `google-cloud-storage` is not installed.
- **`app/config.py`** — Added `gcs_bucket_name` setting (env: `GCS_BUCKET_NAME`).
- **`requirements.txt`** — Added `google-cloud-storage`.
- **`app/collectors/gmaps_browser.py`** — Added `_capture_page_images()` to `BrowserGmapsCollector`: after each place page loads, uses `page.evaluate(fetch(...))` to capture up to `SCRAPER_MAX_PHOTOS` image bytes from Google CDN directly in the browser. Bytes stored in `response["_image_bytes"]`; skips the separate httpx image download phase.
- **`app/scrapers/gmaps.py`** (`_flush_detail_buffer`) — Reads `_image_bytes` from response: if GCS configured → uploads and stores GCS URLs in `image_urls`; otherwise → base64-encodes into `image_blobs`, skipping the httpx download.
- **`app/collectors/gmaps.py`** — Added `upload_images_to_gcs(run_code, engine)`: post-download phase that uploads stored blobs to GCS and replaces `image_blobs` with `image_urls`. Called after `download_place_images` in both api and browser pipelines when GCS is configured.
- **`app/scrapers/gmaps.py`** / **`app/scrapers/gmaps_browser.py`** — Wired `upload_images_to_gcs` call after image download when `GCS_BUCKET_NAME` is set.

---

## fix(scraper): stream detail fetch progress to admin UI (2026-03-14)

### Backend

- **`app/scrapers/gmaps.py`** (`fetch_place_details`) — Replaced `asyncio.gather()` collect-all-then-flush pattern with `asyncio.as_completed` so each result is written to the DB as it arrives. `processed_items` now ticks up every batch of 10 during detail fetch instead of jumping from 0 to total at the end. Cancellation checks distributed periodically (every `flush_batch_size × 3` results) rather than blocking until all fetches complete.

---

## fix(map): viewport-bounded place fetching (2026-03-14)

### Frontend (web)

- **`apps/soulstep-customer-web/src/app/pages/MapDiscovery.tsx`** — Map now fetches places for the current viewport only (`min_lat/max_lat/min_lng/max_lng` passed to API). Previously fetched 200 places globally, causing `fitBounds` to zoom the map to world scale and returning far-off results. Added `onBoundsChange` handler, debounced viewport re-fetch (600 ms), `skipAutoFit` to keep map at user location. Search/filter changes reuse latest bounds via ref.

---

## feat(scraper): browser grid discovery + multi-box country borders (2026-03-14)

### Backend

- **`app/constants.py`** — Added `BROWSER_GRID_CELL_SIZE_KM`, `BROWSER_SCROLL_MAX_ATTEMPTS`, `BROWSER_SCROLL_STABLE_THRESHOLD`, `BROWSER_SCROLL_PIXEL_STEP` constants.
- **`app/config.py`** — Added `browser_grid_cell_size_km` setting (env: `BROWSER_GRID_CELL_SIZE_KM`, default `3.0`).
- **`app/db/models.py`** — Added `discovery_method` column to `DiscoveryCell` and `GlobalDiscoveryCell` (default `"quadtree"`); new `GeoBoundaryBox` model for multi-box country borders.
- **`migrations/versions/0016_discovery_method.py`** — Adds `discovery_method TEXT NOT NULL DEFAULT 'quadtree'` to both cell tables; idempotent.
- **`migrations/versions/0017_geo_boundary_boxes.py`** — Creates `geoboundarybox` table with FK to `geoboundary`.
- **`app/scrapers/cell_store.py`** — `DiscoveryCellStore` and `GlobalCellStore` now accept `discovery_method` parameter; grid and quadtree cells are keyed independently.
- **`app/scrapers/grid.py`** (new) — `generate_grid_cells()` divides a bbox into fixed 3 km cells with longitude correction; `generate_multi_box_grid_cells()` combines multiple boxes with overlap deduplication.
- **`app/scrapers/geo_utils.py`** (new) — `get_boundary_boxes()` returns seeded `GeoBoundaryBox` rows or falls back to single box from `GeoBoundary`.
- **`app/scrapers/gmaps_browser.py`** — Replaced fixed 3-scroll loop with `_scroll_until_stable()` (stable-count + end-of-list detection); added `_search_single_grid_cell()` and `search_grid_browser()` for grid traversal; orchestrator now uses grid discovery via `search_grid_browser` instead of `search_area_browser`.
- **`app/scrapers/gmaps.py`** — `discover_places()` now iterates over `get_boundary_boxes()` sub-boxes for multi-box API discovery.
- **`app/seeds/geo.py`** — Added `COUNTRY_BOXES` dict (India 18 boxes, Pakistan 6, USA 16, UAE 4) and `seed_geo_boundary_boxes()` idempotent seeder.
- **`tests/test_grid.py`** (new) — 11 tests: grid cell generation, longitude correction, multi-box dedup.
- **`tests/test_geo_boundary_boxes.py`** (new) — 7 tests: `get_boundary_boxes` fallback, seeder idempotency, correct box count.
- **`tests/test_browser_gmaps.py`** — Updated per-type test for new `search_grid_browser` architecture; added `TestScrollUntilStable` (2), `TestSearchGridBrowser` (3), `TestDiscoveryCellStoreMethodIsolation` (2), `TestGlobalCellStoreDiscoveryMethodKey` (2).

---

## feat(scraper): split Docker images — lean API vs full job container (2026-03-14)

### Backend

- `Dockerfile` — stripped to base deps only; no Playwright, no Chromium (~200 MB image)
- `Dockerfile.job` — new job image with Playwright + Chromium + job-only deps (~900 MB); used as the Cloud Run Job container
- `requirements.txt` — removed playwright, timezonefinder, google-cloud-run (moved to requirements-job.txt)
- `requirements-job.txt` — new; job-container-only deps (playwright, timezonefinder, google-cloud-run)

---

## feat(scraper): pluggable job dispatcher for Cloud Run decoupling (2026-03-14)

### Backend

- **`app/jobs/dispatcher.py`** (new) — `dispatch_run()` / `dispatch_resume()` replace direct `BackgroundTasks` calls in `POST /runs` and `POST /runs/{code}/resume`; switches between `local` (in-process) and `cloud_run` (GCP Jobs API) at runtime via `SCRAPER_DISPATCH`.
- **`app/jobs/run.py`** (new) — Cloud Run Job entrypoint; reads `SCRAPER_RUN_CODE` + `SCRAPER_RUN_ACTION` env vars and runs `run_scraper_task` / `resume_scraper_task` without an HTTP server.
- **`app/jobs/__init__.py`** (new) — package marker.
- **`app/config.py`** — Added `SCRAPER_DISPATCH` (`local`|`cloud_run`, default `local`), `CLOUD_RUN_JOB_NAME` (default `soulstep-scraper-job`), `CLOUD_RUN_REGION` (default `us-central1`).
- **`requirements.txt`** — Added `google-cloud-run>=0.10.0` (only imported when `SCRAPER_DISPATCH=cloud_run`).
- **`ARCHITECTURE.md`** — Added Job Dispatcher subsection under §8c documenting dispatch modes, config vars, new files, and integration notes.
- **`PRODUCTION.md`** — Added §5.9g (Cloud Run Job for browser scraper): deploy command, sizing, env vars for API service and job container; added three new env vars to §2.2 scraper table.
- **`soulstep-scraper-api/README.md`** — Added Job Dispatcher section with dispatch mode table, local/production config, and new files table.

---

## feat(scraper): browser-based Google Maps scraper backend (2026-03-14)

### Backend

- **`app/services/browser_stealth.py`** (new) — Stealth JS patches (removes `navigator.webdriver`, mocks plugins/chrome.runtime) plus per-session UA, viewport, and timezone randomisation to reduce bot-detection risk.
- **`app/services/browser_pool.py`** (new) — `MapsBrowserPool`: manages a pool of reusable Playwright Chromium contexts. Circuit breaker pauses all requests for 10 min after 3 consecutive blocks; CAPTCHA detection triggers immediate context recycle; sessions recycled every 30 navigations (configurable via `MAPS_BROWSER_MAX_PAGES`).
- **`app/scrapers/gmaps_browser.py`** (new) — `run_gmaps_scraper_browser()`: Playwright-driven quadtree discovery and detail extraction from Google Maps at $0 API cost (~24–48h per 10K places vs ~3h for the API path).
- **`app/collectors/gmaps_browser.py`** (new) — `BrowserGmapsCollector`: drop-in replacement for `GmapsCollector`; returns an identical `CollectorResult` shape so all downstream pipeline stages are unchanged.
- **`tests/test_browser_gmaps.py`** (new) — 43 unit tests covering pool lifecycle, circuit breaker state machine, CAPTCHA detection, stealth patches, and scraper output shape.
- **`app/config.py`** — Added `SCRAPER_BACKEND` (`api`|`browser`, default `api`), `MAPS_BROWSER_POOL_SIZE`, `MAPS_BROWSER_MAX_PAGES`, `MAPS_BROWSER_HEADLESS`.
- **`app/scrapers/gmaps.py`** — `run_gmaps_scraper()` checks `SCRAPER_BACKEND` at the top and delegates to the browser path when `browser` is set; existing API path unchanged.
- **`app/collectors/registry.py`** — Registers `BrowserGmapsCollector` instead of `GmapsCollector` when `SCRAPER_BACKEND=browser`.
- **`requirements.txt`** — Added `playwright>=1.40.0` and `timezonefinder>=6.0.0`.
- **`Dockerfile`** — Added Chromium system dependencies and `playwright install chromium` step.
- **`ARCHITECTURE.md`** — Added §8c documenting the browser scraper backend, new files, config vars, integration points, and Cloud Run sizing.
- **`PRODUCTION.md`** — Updated §2.2, §3 (Docker), and §5.9 (GCP) with new env vars and browser-mode Cloud Run sizing.
- **`soulstep-scraper-api/README.md`** — Added `SCRAPER_BACKEND` toggle section and browser-specific env var table.

---

## refactor(jobs): remove backfill-translations worker (2026-03-14)

### Backend

- **`scripts/backfill_translations.py`** — deleted; superseded by the `translate-content` Cloud Run Job which covers all four languages (ar/hi/te/ml), all entity types (place/review/city/attribute_def), and now includes the legacy `name_{lang}` PlaceAttribute migration.
- **`app/jobs/translate_content.py`** — added `_migrate_legacy_attributes()` (migrates old scraper `name_{lang}` PlaceAttribute rows into `ContentTranslation` with `source="scraper"`, idempotent); called at job startup before the main translation loop.
- **`.github/workflows/deploy.yml`** — removed `backfill-translations` Cloud Run Job from the `deploy-jobs` step.
- **`PRODUCTION.md`** — removed §3.8 (Docker backfill), §4.6 (Render backfill), §5.10b (GCP backfill job), §6.2 (Translation Backfill reference section), and the scheduled jobs table row.
- **`soulstep-catalog-api/README.md`** — removed Translation Backfill script section and cleaned up env var entries.

---

## feat(ci): auto-deploy all Cloud Run Jobs from GitHub Actions (2026-03-14)

### Backend / CI

- **`.github/workflows/deploy.yml`** — Added `deploy-jobs` workflow job (runs after `deploy-api` on every catalog change): builds and pushes `sync-places` and `translate-content` Docker images; updates or creates four Cloud Run Jobs (`cleanup-job`, `backfill-timezones`, `sync-places`, `translate-content`) using an idempotent `update || create` pattern so CI handles both first-time provisioning and image rollouts.
- **`PRODUCTION.md`** — §5.10 intro: noted all jobs are CI-managed. §5.10d: replaced the manual "Add SCRAPER_DATABASE_URL to Secret Manager" block with a note that the secret is already shared with the scraper service. §5.11: added workflow job summary table.

---

## feat(jobs): daily Cloud Run workers for place sync and content translation (2026-03-14)

### Backend

- **`app/jobs/sync_places.py`** (new) — Cloud Run Job that reads all `ScrapedPlace` rows from the scraper PostgreSQL DB via `SCRAPER_DATABASE_URL`, applies quality (`>= 0.75`) and name-specificity gates, builds `PlaceCreate` objects from `raw_data` JSON (inlined `_sanitize_religion`, `_sanitize_attributes`, `_sanitize_reviews` helpers), and calls `_process_chunk()` in batches of 50 for full upsert with images, attributes, reviews, and translations.
- **`app/jobs/translate_content.py`** (new) — Cloud Run Job that runs `_collect_missing_items()` for all entity types and languages (ar, hi, te, ml), translates via `translate_batch_browser_parallel`, flushes incrementally every 10 items, and creates a `BulkTranslationJob` row for admin dashboard visibility.
- **`Dockerfile.sync`** (new) — Lightweight Python 3.12-slim image for the sync worker (no Playwright, no uvicorn).
- **`Dockerfile.translate`** (new) — Python 3.12-slim image with Playwright + Chromium system deps for the translation worker.
- **`tests/test_jobs.py`** (new) — 32 unit tests covering all sanitizer helpers, `_build_place_create`, `main()` flows for both workers, and `translate_content` helpers.

### Docs

- **`PRODUCTION.md`** — Added §5.10d (`sync-places` Cloud Run Job: build, create, schedule at 2 AM UTC, `SCRAPER_DATABASE_URL` secret setup) and §5.10e (`translate-content` Cloud Run Job: build with Playwright, 4 GB/2 CPU, 24h timeout, schedule at 4 AM UTC, env var reference table).

---

## fix(bulk-translations): handle CancelledError on shutdown and clean up stale jobs on startup (2026-03-13)

### Backend

- **`app/api/v1/admin/bulk_translations.py`** — Added `except asyncio.CancelledError` handler in `_run_bulk_translation_job`. When the server shuts down and cancels the asyncio task, the job is now marked `failed` with message "Interrupted: server shutdown" before re-raising, instead of being left stuck in `pending`/`running` forever. Also wrapped the existing `except Exception` DB write in its own try/except (best-effort) to prevent a secondary crash from hiding the original error.
- **`app/main.py`** — Added startup cleanup in the `lifespan` function: any jobs left in `pending` or `running` state from a previous server process (whose asyncio tasks are now dead) are immediately marked `failed` with message "Interrupted: server restarted" before the app accepts traffic.
- **`tests/test_bulk_translations.py`** — Added `TestCancelledErrorHandling` (verifies `CancelledError` marks job failed, not stuck) and `TestStartupCleanup` (verifies the stale-job cleanup logic). Total tests: 12.

---

## feat(translations): parallel bulk browser translation with progress tracking (2026-03-13)

### Backend

- **`app/db/models.py`** — Added `BulkTranslationJob` SQLModel table (`bulk_translation_job`) with status, target_langs/entity_types JSON columns, progress counters (total/completed/failed/skipped), and cancellation support via `cancel_requested_at`. All datetime fields use `_TSTZ()`.
- **`migrations/versions/0022_bulk_translation_job.py`** (new) — Creates `bulk_translation_job` table with FK to `user.user_code`, `sa.JSON` for list columns, `sa.DateTime(timezone=True)` for timestamps.
- **`app/services/browser_translation.py`** — Added `asyncio.Semaphore` to `BrowserSessionPool` (prevents thundering-herd spin on parallel acquire). Added `translate_multi_browser()` (delimiter trick: joins N texts as `【1】text1\n【2】text2\n…`, translates in one request, splits on sentinels; falls back to individual calls on count mismatch). Added `translate_batch_browser_parallel()` (fan-out via `asyncio.gather`, partitioned into micro-batches; `on_result` async callback fires per resolved item for interrupt-resilient DB saves).
- **`app/api/v1/admin/bulk_translations.py`** (new) — Five admin endpoints: `POST /admin/translations/jobs` (create + launch BG task), `GET /admin/translations/jobs` (list paginated, newest first), `GET /admin/translations/jobs/{job_code}` (live progress), `POST /admin/translations/jobs/{job_code}/cancel` (set `cancel_requested_at`), `DELETE /admin/translations/jobs/{job_code}` (remove completed/failed, 409 if running). Background task collects missing `(entity_type, entity_code, field, lang, en_text)` tuples, translates via `translate_batch_browser_parallel`, saves each result immediately via fresh `Session(engine)`, updates progress counters in DB.
- **`app/api/v1/admin/__init__.py`** — Registered `bulk_translations.router` before `translations.router` to prevent path ambiguity with `GET /translations/{key}`.
- **`scripts/backfill_translations.py`** — `_backfill_places` and `_backfill_reviews` now detect `TRANSLATION_BACKEND=browser` and call `translate_batch_browser_parallel` with a sync-safe `on_result` callback instead of `translate_batch()`.
- **`tests/test_bulk_translations.py`** (new) — 10 integration tests: start job (returns pending, job_code prefix), admin-only guard (403), list empty, list paginated, get live progress, 404 on missing, cancel pending/409 on completed, delete completed/409 on running.
- **`tests/test_browser_translation_parallel.py`** (new) — 5 unit tests: multi-browser happy path, sentinel mismatch fallback, empty position preservation, on_result callback fires per item, semaphore limits concurrency.

### Frontend (web)

- **`apps/soulstep-admin-web/src/lib/api/types.ts`** — Added `BulkTranslationJob`, `StartJobBody`, `JobListResponse` interfaces.
- **`apps/soulstep-admin-web/src/lib/api/admin.ts`** — Added `startTranslationJob`, `listTranslationJobs`, `getTranslationJob`, `cancelTranslationJob`, `deleteTranslationJob`.
- **`apps/soulstep-admin-web/src/app/pages/content/BulkTranslationsPage.tsx`** (new) — Full page: header + New Job button, StatCards (Total/Active/Completed/Failed), DataTable with status badge, inline progress bar (`completed/total` + animated fill), Cancel/Delete actions, auto-poll every 3s while any job is active, modal bottom-sheet form (lang checkboxes ar/hi/te/ml, entity type checkboxes, multi_size slider 1–8).
- **`apps/soulstep-admin-web/src/app/router.tsx`** — Added route `/translations/bulk → BulkTranslationsPage`.
- **`apps/soulstep-admin-web/src/components/layout/Sidebar.tsx`** — Added "Bulk Translations" nav link with Zap icon under Content section.
- **`apps/soulstep-admin-web/src/__tests__/bulkTranslations.test.ts`** (new) — 10 pure logic tests: `computeProgress` (zero/partial/full/overflow), `STATUS_COLORS` (all keys present, all include `dark:` token), API endpoint path stubs for start/list/cancel.

---

## perf(backend): catalog service audit — latency, DB indexes, readability (2026-03-13)

### Backend

- **`app/api/v1/users.py`** — Fixed N+1 in `_format_check_ins()`: replaced per-row `get_place_by_code()` + `get_images()` calls with single bulk fetches (`get_places_by_codes()` + `get_images_bulk()`). User with 50 check-ins: 100+ queries → 2 queries.
- **`app/api/v1/groups.py`** — Fixed N+1 in `list_featured_groups()`: replaced `get_members_bulk([single_code])` in a loop with one `get_members_bulk(all_codes)` call. Fixed N+1 in `get_checklist()`: replaced per-member `get_user_by_code()` loops with a single `get_users_bulk()` covering members + note authors.
- **`app/api/v1/i18n.py`** — Added in-memory TTL cache for UITranslation DB overrides (1h per language). Added `Cache-Control` headers: `max-age=86400` for `/languages`, `max-age=3600` for `/translations`.
- **`app/api/v1/places.py`** — Deduplicated Haversine calculation in `get_recommended_places()` (distances computed once, stored with candidates, reused in output). Added `?include_related=true` param to place detail (skip nearby/similar fetches when false). Added `Cache-Control: public, max-age=600` to `/places/count`. Moved lazy `from sqlmodel import func` import to module top. Extracted `_normalize_hours()` helper. Added named constants: `NEARBY_RADIUS_KM`, `NEARBY_LIMIT`, `SIMILAR_LIMIT`, `RECOMMENDED_CANDIDATE_LIMIT`. Bulk-fetch images in `get_recommended_places()` via `get_images_bulk()`.
- **`app/db/models.py`** — Added `Index` import; added `__table_args__` with compound indexes to `CheckIn` model (`ix_checkin_user_date`, `ix_checkin_place_user`, `ix_checkin_group_place`). Added `index=True` to `GroupPlaceNote.user_code`.
- **`migrations/versions/0021_compound_indexes.py`** (new) — Adds 7 compound indexes: `checkin(user_code, checked_in_at)`, `checkin(place_code, user_code)`, `checkin(group_code, place_code)`, `review(place_code, created_at)`, `favorite(place_code)`, `contenttranslation(entity_code, lang)`, `analytics_event(event_type, created_at)`.

---

## feat(backend): headless browser translation backend (2026-03-13)

### Backend

- **`app/services/browser_translation.py`** (new) — Playwright-based translation backend that drives `translate.google.com` directly. Features: `BrowserSessionPool` (configurable pool size, context recycling), stealth JS patches (removes `navigator.webdriver`, mocks plugins/chrome.runtime), human-like typing (50–150ms/char), CAPTCHA detection, `_CircuitBreaker` (aborts batch after 3 consecutive failures), exponential backoff (5s → 60s cap), sync wrappers for script use.
- **`app/services/translation_service.py`** — refactored to route between backends. Old logic moved to `_translate_text_api()` / `_translate_batch_api()`. New public `translate_text()` and `translate_batch()` honour `TRANSLATION_BACKEND` env var and optional `TRANSLATION_FALLBACK`.
- **`app/main.py`** — lifespan shutdown calls `shutdown_pool()` when `TRANSLATION_BACKEND=browser`.
- **`requirements.txt`** — added `playwright>=1.40.0`.
- **`tests/test_browser_translation.py`** (new) — 18 mocked tests: pool lifecycle, stealth patches, happy path, CAPTCHA → None, timeout → None, circuit breaker, batch empty-position preservation, routing (api/browser), and fallback behaviour.

### New environment variables
| Variable | Default | Purpose |
|---|---|---|
| `TRANSLATION_BACKEND` | `api` | `api` or `browser` |
| `TRANSLATION_FALLBACK` | `false` | Fall back to API when browser returns None |
| `BROWSER_POOL_SIZE` | `2` | Concurrent browser contexts |
| `BROWSER_MAX_TRANSLATIONS` | `50` | Translations per context before recycling |
| `BROWSER_HEADLESS` | `true` | Headless mode (`false` for debugging) |

---

## Fix: frontend test coverage thresholds (2026-03-13)

### Frontend (web)

- **`vitest.config.ts`** — Exclude `src/components/**` from unit coverage (React components belong to e2e/integration scope per testing policy).
- **`theme.test.ts`** — Added tests that fire the matchMedia `change` event listener callback, covering both the system-theme re-apply branch and the no-op branch.
- **`share.test.ts`** — Added test for `typeof window === 'undefined'` SSR fallback branch.
- **`searchHistory.test.ts`** — Added test for corrupt-JSON catch block.
- **`feedbackPopup.test.ts`** — Added test for `clearTimer()` with no active timer.
- **`utils.test.ts`** — Added test for `cn()` with empty nested array (covers `if (result)` guard).
- **`imageUtils.test.ts`** — Added test with `VITE_API_URL` set, covering the `??` left-side branch.

### Frontend (mobile)

- **`jest.config.js`** — Exclude `src/components` from unit coverage (same policy as web).
- **`src/__tests__/theme.test.ts`** (new) — Full coverage for `getStoredTheme()` and `setStoredTheme()`.
- **`searchHistory.test.ts`** — Added test for AsyncStorage-throws catch block.
- **`share.test.ts`** — Added test for `openDirections()` when `Platform.select` returns `undefined`, covering the `!nativeUrl` early-return branch.
- **`mapBuilder.test.ts`** — Added tests for: `is_open_now: false` → `'closed'`, empty address + place_type fallback, and empty address + place_type → `''` fallback.

---

## Scraper config: reduce SCRAPER_MAX_PHOTOS default 4 → 3 (2026-03-13)

### Backend (soulstep-scraper-api)

- **`app/config.py`** — `SCRAPER_MAX_PHOTOS` default changed from `4` to `3`. Saves ~$65 per UAE scrape run; existing comments in `gmaps.py` and tests already referenced 3 as the intended default.

---

## Google Places API Cost & Observability (2026-03-13)

### Backend (soulstep-scraper-api)

- **`app/services/query_log.py`** (new) — lightweight external-query logger; records every outbound Google Places API call (endpoint, HTTP status, duration_ms, caller, sanitized request/response params) without leaking API keys. Uses `RotatingFileHandler` (5 MB × 3) when `LOG_FORMAT=text` and `K_SERVICE` is unset (local dev); propagates to stdout JSON on Cloud Run. Cloud Logging filter: `jsonPayload.event="external_query" AND jsonPayload.service="gmaps"` — filter by `jsonPayload.caller` to isolate `searchNearby` vs `getPlace` vs `autocomplete`.
- **`app/scrapers/gmaps.py`** — `get_places_in_circle()` instrumented: logs `searchNearby` POST calls with lat/lng/radius/types and result count.
- **`app/collectors/gmaps.py`** — `_fetch_details()` instrumented: logs `getPlace` GET calls with place name and field-mask tier (FULL after merge).
- **`app/collectors/gmaps.py`** — `fetch_details_split()` merged from two-stage (ESSENTIAL → conditional EXTENDED) into a single `getPlace` call using the full `FIELD_MASK`. At a typical 70% qualification rate, this reduces detail-fetch API calls by ~41% and cuts cost by ~11%. Breakeven is 57.5% — above that the merged call is cheaper.
- **`app/collectors/gmaps.py`** — `SCRAPER_MAX_PHOTOS` (default 4) caps photos per place in both `build_place_data()` and `_extract()`. Photo media requests are billed at $0.007/1000; capping at 4 vs the previous hardcoded 10 cuts photo API calls by 60%.
- **`app/collectors/gmaps.py`** — `download_place_images()` now uses `SCRAPER_IMAGE_CONCURRENCY` (default 40, was hardcoded 20) and commits DB write-backs in batches of 50 places (`_IMAGE_DB_BATCH`) instead of one giant transaction — reduces peak memory and shortens DB lock time on large runs.
- **`app/config.py`** — added `max_photos` (`SCRAPER_MAX_PHOTOS`, default 4) and `image_concurrency` (`SCRAPER_IMAGE_CONCURRENCY`, default 40) settings.

### Backend (soulstep-catalog-api)

- **`app/services/query_log.py`** (new) — self-contained external-query logger (mirrors scraper version); uses a local `_MaskingFormatter` with no private imports from catalog logging infra.
- **`app/api/v1/search.py`** — `autocomplete()` and `place_details()` instrumented with `log_query()` to record every live Google Places call.
- **`app/api/v1/search.py`** — `autocomplete()` gains an in-process TTL cache (10 min, max 500 entries, FIFO eviction). Cache key is `(q.lower().strip(), lat_bucket_0.1°, lng_bucket_0.1°)`. A user typing a search query character-by-character triggers only the first call; subsequent identical queries within 10 min are served from cache. Zero new dependencies — stdlib `threading.Lock` + `time.monotonic()`.
- **`tests/test_search.py`** — 4 new cache tests (hit, case-insensitive key, distinct queries, TTL expiry); autouse `_clear_autocomplete_cache` fixture added to `conftest.py`.
- **`.gitignore`** — added `logs/` to ignore local rotating log files from both services.

---

## API Optimization + Skeleton Loading (2026-03-12)

### Backend

- **`app/db/places.py`** — Added `get_nearby_places()` with bounding-box SQL pre-filter + Haversine; replaces full-table scan for nearby places in place detail and share endpoints
- **`app/db/check_ins.py`** — Added `count_places_visited_bulk()`: single GROUP BY query for multiple users; eliminates leaderboard N+1
- **`app/db/store.py`** — Added `get_users_bulk()`: batch-fetch users by codes in one query
- **`app/db/groups.py`** — Fixed `get_leaderboard()`, `get_last_activity()`, `get_group_progress()`, `get_activity()` to use bulk queries instead of per-user loops
- **`app/api/v1/places.py`** — `_place_detail()` now bulk-fetches images + ratings for related places; `get_place_reviews()` bulk-fetches review authors; nearby places uses `get_nearby_places()`
- **`app/api/v1/groups.py`** — Leaderboard route uses `get_users_bulk()`
- **`app/api/v1/homepage.py`** (new) — `GET /api/v1/homepage` composite endpoint returning groups, recommended_places, featured_journeys, popular_places, popular_cities, place_count in a single round-trip
- **Tests** — Added `test_homepage.py` (8 tests), `test_places.py` additions (nearby bounding box, bulk helpers), updated group mock fixtures

### Frontend (web)

- **`src/lib/api/client.ts`** — Added `getHomepage()` function + `HomepageData`, `GetHomepageParams`, and related types
- **`src/app/pages/Home.tsx`** — Replaced 6 separate API calls with single `getHomepage()` call; shows `HomeSkeleton` while loading
- **`src/components/common/Skeleton.tsx`** (new) — `SkeletonBox`, `SkeletonCircle`, `SkeletonText` primitives with shimmer animation
- **`src/components/common/skeletons/`** (new) — `HomeSkeleton`, `GroupListSkeleton`, `GroupDetailSkeleton`, `PlaceDetailSkeleton`, `ProfileSkeleton`, `CarouselSkeleton`
- **Groups, GroupDetail, PlaceDetail, Profile** — Replaced loading spinners with skeleton screens
- **Tests** — `homepage.test.ts` (2 tests), `skeleton.test.ts` (5 tests)

### Frontend (mobile)

- **`src/lib/api/client.ts`** — Added `getHomepage()` function + matching types (same interface as web)
- **`src/app/screens/HomeScreen.tsx`** — Replaced 6 separate API calls with single `getHomepage()` call; shows `HomeSkeleton` while loading
- **`src/components/common/Skeleton.tsx`** (new) — `SkeletonBox`, `SkeletonCircle`, `SkeletonText` with pulsing opacity animation
- **`src/components/common/skeletons/`** (new) — `HomeSkeleton`, `GroupListSkeleton`, `GroupDetailSkeleton`, `PlaceDetailSkeleton`, `ProfileSkeleton`, `CarouselSkeleton`
- **GroupDetail, PlaceDetail, Profile screens** — Replaced `ActivityIndicator` spinners with skeleton screens
- **Tests** — `homepage.test.ts` (2 tests), `skeleton.test.ts` (5 tests)

---

## Mobile Phase 4 — Join Modal, Journeys Redesign, Journey Detail FAB + Map, Check-in UX (2026-03-12)

### Frontend (mobile)

**Phase 4A — Join with Code Modal**

- **`JoinJourneyModal.tsx`** (new component) — Animated bottom-sheet modal (`React Native Modal` + `Animated.spring` slide-up, translateY 400→0) for joining a journey with an invite code; clipboard paste button; debounced 600ms preview fetch; preview card with journey name/member count; states (idle → loading-preview → preview → joining → success → error); success animated checkmark; auto-close + navigate to `GroupDetail` after 1.5s; dark mode
- **`HomeScreen.tsx`** — "Join with Code" quick action now opens `JoinJourneyModal` instead of navigating to `JoinGroup` screen
- **`GroupsScreen.tsx`** — Added "Join" icon button in header that also opens `JoinJourneyModal`

**Phase 4B — Groups/Journeys Redesign**

- **`GroupsScreen.tsx`** — Full premium redesign: horizontal stats banner (journey count, places visited, total sites); section header with count badge; journey cards now full-width `height:200` cards with cover image + gradient overlay, level badge, activity dot, member avatar stack, progress bar, "Continue →" CTA; staggered entrance animations (`Animated.timing`, 100ms per-card delay, `useNativeDriver:true`); FAB confirmed absent

**Phase 4C — Journey Detail: Remove Glass Bar, Add FAB**

- **`GroupDetailScreen.tsx`** — Removed entire glass contextual bottom bar; added floating "Add Place" FAB (`position:absolute`, `right:24`, `bottom:insets.bottom+24`, spring mount animation, admin-only, navigates to `EditGroupPlaces`); share + invite icon buttons moved to hero header row

**Phase 4D — Journey Detail: Check-in UX Upgrade**

- **`GroupDetailScreen.tsx`** — Duplicate check-in button in expanded section removed; inline check-in button now cycles through states: idle → loading (`ActivityIndicator`) → success (animated green checkmark, `Animated.spring`); `expo-haptics` `impactAsync(Medium)` on success; checklist re-fetched on success for immediate progress update

**Phase 4E — Journey Map View**

- **`JourneyMapView.tsx`** (new component) — `WebView`-based Leaflet map showing only this journey's places; auto-fits bounds; numbered markers (green=checked, primary=unvisited); marker tap fires `onPlaceSelect(placeCode)` prop; props: `places[]`, `onPlaceSelect?`, `height?`
- **`GroupDetailScreen.tsx`** — Map View section added below route tab content; selecting a marker expands that place card

**Tests**

- **`src/__tests__/journeyPhase4.test.ts`** (new, 30 tests) — Pure logic: invite code validation, error categorization, stats calc, progress level keys, check-in state transitions, map marker JSON

### Backend (translations)

- Added 17 new translation keys × 5 languages in `seed_data.json`: `groups.journey/journeys/placesVisited/totalSites/myJourneys/completed/enterInviteCode/joinJourney/pasteOrTypeCode/joinedSuccess/redirectingToJourney/alreadyMember/journeyFull/invalidCode/joinFailed/mapView`, `common.paste`

---

## Web Phase 4 & 5 — Join Modal, Journeys Redesign, Journey Detail FAB + Map, Desktop Layout Overhaul (2026-03-12)

### Frontend (web)

**Phase 4 — Major Redesigns**

- **`JoinJourneyModal.tsx`** (new) — Animated framer-motion bottom-sheet modal for joining a journey with an invite code: clipboard paste button, debounced 600ms preview fetch (`GET /api/v1/groups/by-invite/{code}`), preview card with journey name, states (idle → loading → preview → joining → success → error), success green checkmark with scale animation, redirect to group detail after 1.5s; dark mode compliant
- **`Home.tsx`** — "Join with Code" quick action now opens `JoinJourneyModal` instead of navigating to `/join`; `QuickActionsGrid` accepts `onJoinClick` prop; modal rendered via React fragment
- **`Groups.tsx`** — Full redesign: section header with journey count badge and "Join" button that opens `JoinJourneyModal`; horizontal stats bar (sites visited, journey count, active streak/completed); filter tabs (All / Active / Completed) with counts; journey cards now show full cover image with gradient overlay, progress bar animated with framer-motion stagger (index × 50ms delay), active/done badges on image, member count chip, "Continue →" CTA; desktop: `lg:grid lg:grid-cols-3 lg:gap-6`
- **`GroupDetail.tsx`** — Removed both bottom action bars (glass bar at z-40 and glass bar at z-[600]); added floating "Add Place" FAB (`fixed bottom-6 right-6 z-50`, framer-motion scale animation, admin/creator only); share and invite buttons moved to hero header area (icon buttons alongside back/settings); check-in UX upgraded: inline button shows green animated checkmark on success, `checkInSuccess` state; duplicate check-in button in expanded section replaced with "checked in" status indicator; place cards have scroll-target `id`s for map marker click highlighting
- **`JourneyMapView.tsx`** (new) — Vanilla Leaflet map component (same pattern as PlacesMap.tsx, avoids react-leaflet strict-mode bug) showing only the journey's places as markers; auto-fits bounds on mount; blue markers for unchecked, green for checked-in; marker click fires `onPlaceSelect(placeCode)` which scrolls to and expands the corresponding place card; props: `places`, `onPlaceSelect`, `className`
- **`GroupDetail.tsx`** — Desktop 2-column layout: `lg:grid lg:grid-cols-5 lg:gap-8`; left (3/5): route/itinerary + tabs; right (2/5 sticky): `JourneyMapView`, member list sidebar, leaderboard; mobile: collapsible map section with toggle button; `ChecklistPlace` type extended with optional `latitude`/`longitude`

**Phase 5 — Desktop Layout Overhaul**

- **`Layout.tsx`** — Already uses `max-w-6xl xl:max-w-7xl` — confirmed and unchanged
- **`Home.tsx`** — Desktop container updated to `max-w-2xl lg:max-w-6xl xl:max-w-7xl`; grid changed from `md:grid-cols-12` (8/4) to `lg:grid-cols-5` (3/2 = 60%/40%); right sidebar uses `lg:sticky lg:top-24`; section headers scaled to `lg:text-lg`
- **`Groups.tsx`** — Journey cards grid: `lg:grid lg:grid-cols-3 lg:gap-6` on desktop
- **`GroupDetail.tsx`** — Desktop sidebar: `lg:col-span-2 lg:sticky lg:top-24` with map, member list, and leaderboard
- **`MapDiscovery.tsx`** — Desktop side panel: `lg:flex lg:h-screen`; left panel (`lg:w-80`) with vertical filters, search, selected place summary; map fills remaining space (`flex-1`); mobile retains floating overlay unchanged; filter chips rendered vertically on desktop

---

## Web Phase 3 — Place Count Ticker, 2.3 Carousels, City Metrics, Map UX, Images, Journey Rename (2026-03-12)

### Frontend (web)
- **`Home.tsx`** — Replaced greeting/welcome/user-name header with an animated place count ticker: fetches `GET /api/v1/places/count` on mount, animates from 0 → total using `requestAnimationFrame` with ease-out cubic over 1200ms; displays count prominently with `t('dashboard.totalPlaces')` subtitle; notification bell and profile icon remain on the right; dark mode compliant
- **`Home.tsx`** — Applied 2.3-item peek carousel width to all horizontal carousel cards (popular places, recommended places, popular journeys): `w-[calc((100vw-2.5rem)/2.3)] lg:w-48 flex-shrink-0` with `hover:scale-[1.02] transition-transform duration-200` on each card; scroll containers use `flex flex-nowrap overflow-x-auto`; on desktop (`lg:`), popular-places and recommended carousels become CSS grids (`lg:grid-cols-3 xl:grid-cols-4`)
- **`ExploreCity.tsx`** — Added city metrics banner below the page title: fetches `GET /api/v1/cities?include_metrics=true`, shows total places count and check-ins last 30 days as stat columns with a divider, plus a color-coded popularity badge ("Trending" → amber, "Popular" → blue, "Growing" → green); card-style with `dark:bg-dark-surface` and `dark:border-dark-border`
- **`PlaceMapView.tsx`** — Enhanced bottom place sheet: upgraded shadow to `shadow-[0_-8px_40px_rgba(0,0,0,0.18)]`; converted the vertical place list inside the bottom sheet to a horizontal carousel using `w-[75vw] max-w-xs flex-shrink-0` cards with `hover:scale-[1.02] transition-transform duration-200`
- **`GroupDetail.tsx`** — Added gray fallback div with `<span className="material-icons">place</span>` icon when a checklist place has no `image_url`, ensuring every place row always shows an image element
- **`Groups.tsx`** — Audited for hardcoded strings; all display strings already use `t()` keys that resolve to journey terminology — no changes required
- **`seed_data.json`** — Added `explore.totalSites` and `explore.checkins30d` translation keys for all 5 languages (en, ar, hi, te, ml)
- **`src/__tests__/phase3Redesign.test.ts`** — Added 16 pure-logic tests covering place count parsing, popularity badge derivation, ease-out cubic ticker, and carousel card class helpers (22 test files, 225 tests total)

---

## Mobile Phase 3 — Place Count Ticker, 2.3 Carousels, City Metrics, Map UX, Images, Journey Rename (2026-03-12)

### Frontend (mobile)
- **`HomeScreen.tsx`** — Replaced greeting/welcome header with an animated place count ticker: fetches `GET /api/v1/places/count`, animates from 0 → total using `Animated.timing` with a 1400ms duration, displays count in large primary-colored bold text with `t('dashboard.totalPlaces')` subtitle; notification bell and avatar remain on the right; dark mode supported
- **`HomeScreen.tsx`** — Applied 2.3-item peek carousel width to all three horizontal carousels (popular places, recommended places, popular journeys): `cardWidth = Math.min((screenWidth - 40) / 2.3, 200)` applied inline to each card
- **`ExploreCityScreen.tsx`** — Added city metrics banner below the header: fetches cities with `include_metrics=true`, shows total places count, check-ins in last 30 days, and a colored popularity badge ("Trending"/"Popular"/"Growing") when present; card-style with dark mode support
- **`ExploreCityScreen.tsx`** — Added image thumbnail (44x44) with place icon fallback to each city place row
- **`MapDiscoveryScreen.tsx`** — Increased map carousel card width to `screenWidth * 0.75`; elevated bottom position by +24px (`insets.bottom + 96`); increased card shadow (`shadowRadius: 16`, `elevation: 8`); added `Animated.spring` press scale animation (1.0 → 0.96) on card press
- **`GroupDetailScreen.tsx`** — Added Material Icon place fallback when a checklist place has no `image_url`, ensuring images are always shown in the route tab
- **`GroupsScreen.tsx`** — Audited for hardcoded group strings; all display strings already use `t()` — no changes needed

---

## Backend: Phase 1 UI/UX Overhaul — Places Count, City Metrics, Journey Translations (2026-03-12)

### Backend
- **`soulstep-catalog-api/app/api/v1/places.py`** — Added `GET /api/v1/places/count` endpoint returning `{"total": int}`; registered before `/{place_code}` catch-all to avoid routing conflicts
- **`soulstep-catalog-api/app/api/v1/cities.py`** — Added `include_metrics: bool` query parameter to `GET /api/v1/cities`; when `true`, computes `checkins_30d` per city (check-ins in last 30 days) and derives `popularity_label` ("Trending" >50, "Popular" >20, "Growing" >5, `null` otherwise)
- **`soulstep-catalog-api/app/db/seed_data.json`** — Added `search.placeholder` and `dashboard.totalPlaces` translation keys for all 5 languages (en, ar, hi, te, ml); updated all `groups.*` values to use "journey(s)" terminology across all languages (keys unchanged)
- **`soulstep-catalog-api/tests/test_places.py`** — Added `TestPlacesCount` class (4 tests) covering empty state, count accuracy, no-auth, and int type
- **`soulstep-catalog-api/tests/test_cities.py`** — Added `TestCityMetrics` class (5 tests) covering fields presence, zero check-ins, counted check-ins, "Growing" and "Trending" labels
- **`soulstep-catalog-api/tests/test_i18n.py`** — Added 7 tests verifying `search.placeholder`, `dashboard.totalPlaces`, and journey rename (`groups.title == "Journeys"`) across all 5 languages

---

## Mobile Quick Fixes — Phase 2 (2026-03-12)

### Frontend (mobile)
- **`HomeScreen.tsx`** — Fixed bottom scroll cutoff: main ScrollView `contentContainerStyle` now uses `insets.bottom + 80` for `paddingBottom`; increased popular places fetch limit from 10 → 40 and removed `.slice(0, 10)` cap; removed "Show More" button from the Popular Places section header row
- **`PlacesScreen.tsx`** — Fixed bottom scroll cutoff: FlatList `contentContainerStyle` now uses `insets.bottom + 80` for `paddingBottom`
- **`ExploreCitiesScreen.tsx`** — Fixed bottom scroll cutoff: FlatList `contentContainerStyle` now uses `insets.bottom + 80` for `paddingBottom`
- **`FavoritesScreen.tsx`** — Changed empty state CTA navigation from `Main` tab to `MapDiscovery` stack screen
- **`GroupsScreen.tsx`** — Removed floating action button (FAB) with '+' icon from the bottom-right of the Journeys screen

---

## Web Quick Fixes: Scroll Padding, Navigation, Carousel, FAB, Alignment (2026-03-12)

### Frontend (web)
- **`apps/soulstep-customer-web/src/app/pages/Favorites.tsx`** — Changed empty-state CTA link from `/home` to `/map` so users are directed to the map discovery page
- **`apps/soulstep-customer-web/src/app/pages/Home.tsx`** — Increased popular places fetch limit from 10 to 40; removed `.slice(0, 10)` cap on popular places data; removed "Show More" link from Popular Places section header
- **`apps/soulstep-customer-web/src/app/pages/Groups.tsx`** — Removed the `+` FAB (Floating Action Button) fixed at the bottom-right of the Groups page
- **`apps/soulstep-customer-web/src/app/pages/CreateGroup.tsx`** — Added `justify-center` to the step indicator row container for centered alignment

---

## Delete Place Data: Fresh Start + Per-Run Deletion (2026-03-12)

### Backend
- **`soulstep-scraper-api/app/api/v1/scraper.py`** — Added `GET /runs/{run_code}/place-codes` endpoint; updated `DELETE /runs/{run_code}` to also cascade-delete `DiscoveryCell` rows
- **`soulstep-catalog-api/app/api/v1/admin/places.py`** — Added `_delete_place_records()` cascade helper; updated `DELETE /places/{place_code}` to use it; added `DELETE /places/batch` (body: `{ place_codes }`) and `DELETE /places/all` nuclear reset endpoints
- **`soulstep-catalog-api/app/api/v1/admin/scraper_proxy.py`** — Added `_proxy_json()` helper; updated `DELETE /admin/scraper/runs/{run_code}` to accept `?delete_catalog_places=true` — fetches place_codes from scraper and deletes catalog places before forwarding the run delete
- **`soulstep-catalog-api/scripts/reset_place_data.py`** (new) — Standalone script to wipe all Place data and related records from the catalog DB
- **`soulstep-scraper-api/scripts/reset_scraper_data.py`** (new) — Standalone script to wipe all run/place/cell/cache data from the scraper DB
- **`soulstep-catalog-api/tests/test_admin_places_delete.py`** (new) — 19 tests for single/batch/all delete with full cascade verification
- **`soulstep-scraper-api/tests/test_run_place_codes.py`** (new) — 7 tests for `GET /runs/{run_code}/place-codes` and DiscoveryCell cascade on run delete

### Frontend (web)
- **`apps/soulstep-admin-web/src/lib/api/types.ts`** — Added `places_synced: number` to `ScraperRun` interface
- **`apps/soulstep-admin-web/src/lib/api/scraper.ts`** — Updated `deleteRun(runCode, deleteCatalogPlaces?)` to pass `?delete_catalog_places=true` when requested
- **`apps/soulstep-admin-web/src/app/pages/scraper/ScraperRunsPage.tsx`** — Replaced `ConfirmDialog` for run deletion with an inline modal including a "Also delete synced catalog places" checkbox (disabled when `places_synced === 0`)

---

## Batch Place Sync Improvements (2026-03-11)

### Backend
- **`app/api/v1/places.py`** — `batch_create_places`: pre-fetches all existing Place rows in a single SELECT before the loop (was N individual SELECTs); deduplicates place_codes before processing (last entry wins); maintains a per-request location code cache so the same `(city, state, country)` tuple hits the DB only once; calls `session.rollback()` after a failed place so the session is clean for subsequent places; response now includes `"action": "created"|"updated"` per result, `"unique"`, and `"duplicates_skipped"` fields; `_upsert_single_place` now returns `(row, action)` and accepts optional `existing_map` and `loc_cache` kwargs
- **`app/db/place_attributes.py`** — added `bulk_upsert_attributes(place_code, attrs, session)`: fetches all existing attrs for the place once, updates/inserts in-memory, then flushes once — replaces N individual SELECT+commit+refresh calls (one per attribute) with a single round-trip
- **`app/models/schemas.py`** — `PlaceBatch.places` capped at 500 entries (`max_length=500`); oversized requests return 422
- **`tests/test_places.py`** — added `TestBatchEndpoint` (8 tests): action field, deduplication, error isolation via monkeypatch, total/unique/duplicates_skipped counts, shared location cache, batch size limit, attribute persistence

---

## Location Codes: Country/State/City Tables (2026-03-11)

### Backend
- **`app/db/models.py`** — added `Country`, `State`, `City` SQLModel tables with `*_code` stable identifiers, `iso_code`, `name`, and multilingual `translations` JSON; added nullable `city_code`, `state_code`, `country_code` FK columns to `Place`
- **`app/db/locations.py`** (new) — `get_or_create_country/state/city` helpers with deterministic slug codes and case-insensitive lookup; `resolve_location_codes(city, state, country, session)` returns `(city_code, state_code, country_code)` tuple
- **`migrations/versions/0019_location_codes.py`** (new) — creates `country`, `state`, `city` tables; adds `city_code`, `state_code`, `country_code` nullable columns to `place`
- **`app/db/seed_data.json`** — added `"locations"` section with 5 countries (UAE, India, Saudi Arabia, Israel, Turkey), 4 states, and 6 cities with 5-language translations
- **`app/db/seed.py`** — `_seed_locations()` upserts Country/State/City from seed data; called in `run_seed_system()`
- **`app/api/v1/places.py`** — `_upsert_single_place()` calls `resolve_location_codes()` and passes codes to `create_place`/`update_place`; `_place_to_item()` now includes `city`, `state`, `country`, `city_code`, `state_code`, `country_code` in all place responses
- **`app/db/places.py`** — `create_place` and `update_place` accept optional `city_code`, `state_code`, `country_code` params
- **`app/api/v1/cities.py`** — `list_cities` now enriches each city entry with `city_code` and `translations` from the `City` table (falls back to `null` for cities not yet in the table)
- **`tests/test_locations.py`** (new) — 16 unit tests for `get_or_create_*` idempotency, scoping, and `resolve_location_codes` partial/full/null cases
- **`tests/test_places.py`** — added `TestLocationCodes` with 3 integration tests verifying `city_code`/`state_code`/`country_code` populated by batch upsert and null for places without location strings

---

## Differentiated Step 2 for Each Journey Intent (2026-03-11)

### Backend
- **`app/api/v1/places.py`** — added `city: str | None` query parameter to `GET /api/v1/places`; passes to `list_places()`
- **`app/db/places.py`** — added `city: str | None = None` param to `list_places()`; filters via `Place.city.ilike(city)` (case-insensitive)
- **`app/db/seed_data.json`** — added 13 translation keys (`journey.intent.city/cityDesc/faith/faithDesc/route/routeDesc/scratch/scratchDesc`, `journey.pickCity/pickFaith/pickRoute/routeNoResults`) in all 5 languages (en/ar/hi/te/ml)
- **`tests/test_places.py`** — added `test_list_filter_by_city` and `test_list_filter_by_city_case_insensitive`

### Frontend (web)
- **`src/lib/api/client.ts`** — added `city?: string` to `GetPlacesParams`; added `FeaturedGroup` interface and `getFeaturedGroups()` function
- **`src/app/pages/CreateGroup.tsx`** — Step 2 now shows contextual sub-steps: city picker (grid of city cards) for "Explore My City", faith picker (3 religion cards) for "A Specific Faith", route picker (featured route cards) for "A Famous Route"; "Start from Scratch" unchanged; active filter chip shown in place list; `generateJourneyName` updated to use selected city/faith/route name

### Frontend (mobile)
- **`src/lib/api/client.ts`** — added `city?: string` to `GetPlacesParams`; added `FeaturedGroup` interface and `getFeaturedGroups()` function
- **`src/app/screens/CreateGroupScreen.tsx`** — Step 2 now shows contextual sub-steps mirroring web: city picker (FlatList of city cards), faith picker (3 religion cards), route picker (FlatList of featured route cards); back navigation restores picker from filtered place list; active filter chip; `generateJourneyName` updated to use selected city/faith/route

---

## i18n Audit & Dead Code Removal (2026-03-11)

### Backend
- **`app/db/seed_data.json`** — added 15 new translation keys (`explore.*`, `placeDetail.nearbyTitle/similarTitle/noGroupsYet`, `places.allSacredSites/browseSubtitle`, `onboarding.next`) in all 5 languages; backfilled 56 missing Telugu (`te`) and Malayalam (`ml`) keys (ads, consent, dashboard, journey.*, map, onboarding, nav); all 5 languages now have 435 keys

### Frontend (web)
- **Dead code removed**: deleted `FilterSheet.tsx`, `HomeHeader.tsx`, `PlaceListView.tsx` (places components) and `SearchOverlay.tsx` (search component) — none were imported anywhere
- **`src/lib/api/client.ts`** — removed unused `createGroupInvite()` and `getPlaceNotes()` functions
- **`src/app/pages/ExploreCities.tsx`** — replaced 5 hardcoded strings with `t('explore.*')` keys
- **`src/app/pages/ExploreCity.tsx`** — replaced 3 hardcoded strings with `t('explore.*')` keys
- **`src/app/pages/PlaceDetail.tsx`** — replaced 4 hardcoded strings (`NearbyPlaces` titles ×2 each, `noGroupsYet`) with `t('placeDetail.*')` keys

### Frontend (mobile)
- **`src/app/navigation.tsx`** — removed stale `GroupsScreen` import (it is a bottom-tab screen, not a stack screen)
- **`src/app/screens/ExploreCitiesScreen.tsx`** — replaced 4 hardcoded strings with `t('explore.*')` and `useI18n`
- **`src/app/screens/ExploreCityScreen.tsx`** — replaced 1 hardcoded string with `t('explore.noSites')`
- **`src/app/screens/PlacesScreen.tsx`** — replaced 2 hardcoded strings; replaced `'#f59e0b'` with `tokens.colors.goldRank`
- **`src/app/screens/OnboardingScreen.tsx`** — replaced hardcoded `'Next →'` with `t('onboarding.next')`
- **`src/app/screens/PlaceDetailScreen.tsx`** — replaced `NearbyPlaces` titles and `noGroupsYet` with `t()` keys; replaced `'#f59e0b'` with `tokens.colors.goldRank`
- **`src/components/places/PlaceReviewsList.tsx`** / **`NearbyPlaces.tsx`** — replaced `'#f59e0b'` with `tokens.colors.goldRank`
- **Auth screens** (`LoginScreen`, `RegisterScreen`, `ForgotPasswordScreen`, `ResetPasswordScreen`) — replaced `'#F1F5F9'` → `tokens.colors.silverLight`, `'#334155'` → `tokens.colors.navIconLight`, `'#dc2626'` → `tokens.colors.error`, `'#b91c1c'` → `tokens.colors.errorDark`
- **`src/lib/theme.ts`** — added `error`, `errorDark`, `navIconLight` color tokens

### Docs
- **`CLAUDE.md`** Rule 7 — updated supported languages to list all 5 (en, ar, hi, te, ml)

---

## Journey UX Pivot — Phases 2–6: Dashboard, Creation, Map, Detail, Onboarding (2026-03-11)

### Frontend (web)
- **`src/app/pages/CreateGroup.tsx`** — rewrite as 4-step Journey Creation flow: intent → build → polish → success; Framer Motion stagger-in intent cards, AnimatePresence chips, `generateJourneyName()` auto-naming
- **`src/app/pages/MapDiscovery.tsx`** (new) — full-screen Leaflet map with floating translucent search bar + religion filter chips overlay; 400ms debounced `getPlaces` fetch
- **`src/app/routes.tsx`** — added `/map` route; updated map link in Layout
- **`src/components/layout/Layout.tsx`** — map tab now links to `/map`; updated `isMap` detection
- **`src/app/pages/GroupDetail.tsx`** — Journey Detail redesign: hero with cover image + progress ring + glass back/share buttons; vertical timeline itinerary with number badges + connecting line; Route/Activity/Members tabs with Framer Motion transitions; glass contextual bottom bar
- **`src/app/pages/Onboarding.tsx`** (new) — 3-card swipeable onboarding flow with Framer Motion AnimatePresence; dot indicators; `localStorage('onboarding_done')` first-visit gate
- **`src/app/pages/Home.tsx`** — added `useEffect` redirect to `/onboarding` on first visit (no user + no onboarding flag)
- **`src/__tests__/onboarding.test.ts`** (new) — 8 Vitest tests for redirect logic

### Frontend (mobile)
- **`src/app/screens/HomeScreen.tsx`** — rewrite as Journey Dashboard: active journey hero card with progress ring, quick actions, recommended places carousel, popular journeys carousel, empty state
- **`src/app/screens/CreateGroupScreen.tsx`** — rewrite as 4-step Journey Creation flow mirroring web; `Animated` success reveal; same `generateJourneyName()` and translation keys
- **`src/app/screens/MapDiscoveryScreen.tsx`** (new) — full-screen WebView (Leaflet via CDN), floating search + religion chips overlay, bottom horizontal snap carousel synced with map pins via WebView messaging
- **`src/app/screens/GroupDetailScreen.tsx`** — Journey Detail redesign: hero with cover image + glass buttons + progress badge; Route/Activity/Members tab pills; timeline itinerary with circular number badges; glass contextual bottom bar
- **`src/app/screens/OnboardingScreen.tsx`** (new) — 3-card horizontal FlatList (pagingEnabled); dot indicators; `AsyncStorage('onboarding_done')` first-visit gate
- **`src/app/navigation.tsx`** — added `MapDiscovery`, `Onboarding` to `RootStackParamList` and stack
- **`src/components/layout/Layout.tsx`** — Map tab navigates to `MapDiscovery` screen
- **`src/app/screens/SplashScreen.tsx`** — checks `onboarding_done` flag; routes to `Onboarding` vs `Main`
- **`src/__tests__/onboarding.test.ts`** (new) — 7 Jest tests (parity with web)

---

## Journey UX Pivot — Phase 1: Foundation & Navigation (2026-03-11)

### Backend
- **`app/db/models.py`** — added `is_featured: bool = False` to `Group` model
- **`migrations/versions/0018_group_is_featured.py`** — migration for `is_featured` column
- **`app/api/v1/groups.py`** — added `GET /api/v1/groups/featured` (public, no auth) and `POST /api/v1/groups/{code}/optimize-route` (nearest-neighbour reorder)
- **`app/api/v1/places.py`** — added `GET /api/v1/places/recommended` (nearby + religion-filtered, excludes checked-in places)
- **`app/db/seed_data.json`** — added `journey.*`, `onboarding.*`, `dashboard.*`, and additional `map.*`/`nav.*` translation keys for en, ar, hi
- **`tests/test_journey_phase1.py`** (new) — 13 tests: featured groups, optimize-route, recommended places

### Frontend (web)
- **`src/components/layout/Layout.tsx`** — replaced 3-tab bottom nav with minimal 2-item bar (Dashboard + Map) and elevated center FAB for "New Journey"; updated desktop top nav to logo + Map + New Journey button + avatar
- **`src/app/routes.tsx`** — added `/journeys/*` route aliases (journey detail, new, edit, edit-places); kept `/groups/*` routes for deep-link compatibility
- **`src/app/pages/Home.tsx`** — complete rewrite as Journey Dashboard: active journey hero card with circular progress ring, quick-actions row, recommended places carousel, popular journeys carousel, my journeys list; Framer Motion animations
- **`src/__tests__/journeyPhase1.test.ts`** (new) — 14 tests: progress calc, haversine, nearest-neighbour ordering, URL helpers

### Frontend (mobile)
- **`src/components/layout/Layout.tsx`** — replaced bottom-tabs navigator with minimal 2-item bar (Dashboard + Map) + center FAB for "New Journey"; glass blur background
- **`src/app/navigation.tsx`** — updated `RootStackParamList` comments to use "Journey" terminology
- **`src/__tests__/journeyPhase1.test.ts`** (new) — 14 tests in parity with web

---

## SEO/GEO/AI Discoverability — Full Roadmap Implementation (2026-03-11)

### Backend
- **`app/api/v1/places.py`** — exposed `seo_title`, `seo_meta_description`, `seo_rich_description`, `seo_faq_json`, `seo_og_image_url`, `updated_at` in place detail; added `nearby_places` (Haversine 10 km) and `similar_places` (same religion)
- **`app/db/place_images.py`** — added `alt_text` to all image dicts in `get_images()` and `get_images_bulk()`
- **`app/services/structured_data.py`** — added `additionalType: TouristAttraction` to place JSON-LD
- **`app/api/v1/seo_static.py`** — enhanced `llms.txt` with OpenAPI spec, religion pages, feeds, example queries; added `/.well-known/ai-plugin.json` endpoint
- **`app/api/v1/share.py`** — semantic HTML for AI citation: `<address>`, `<table>` (opening hours), `<dl>` (attributes), `<blockquote>` (reviews); `share_city()` and `share_city_religion()` endpoints
- **`app/api/v1/cities.py`** (new) — `GET /api/v1/cities`, `GET /api/v1/cities/{city_slug}`, `GET /api/v1/cities/{city_slug}/{religion}`
- **`app/api/v1/__init__.py`** — registered `cities` router
- **`app/api/v1/sitemap.py`** — added `/explore` index, city pages (priority 0.7), and city/religion combo pages (priority 0.6) to sitemap
- **`tests/test_seo_frontend.py`** (new) — 15 tests: SEO fields, alt_text, TouristAttraction, llms.txt, ai-plugin, semantic HTML
- **`tests/test_cities.py`** (new) — 13 tests: city list, city places, religion filter, slug matching

### Frontend (web)
- **`src/lib/hooks/useHead.ts`** (new) — `useHead()` hook: dynamic title, meta, OG, Twitter, canonical, JSON-LD, hreflang via DOM manipulation
- **`src/lib/types/places.ts`** — added SEO fields, `alt_text` on images, `NearbyPlace` interface, `nearby_places`/`similar_places` on `PlaceDetail`
- **`src/app/pages/PlaceDetail.tsx`** — `useHead` with Place/BreadcrumbList/FAQPage JSON-LD, hreflang; `Breadcrumb`, `PlaceFAQ`, `NearbyPlaces` integration; propagated `alt_text`
- **`src/app/pages/Home.tsx`** — `useHead` with Organization + WebSite JSON-LD
- **`src/components/places/PlaceCard.tsx`** — `alt_text` propagation, `loading="lazy"`, merged `style` attributes
- **`src/components/places/PlaceFAQ.tsx`** (new) — collapsible FAQ accordion, dark mode
- **`src/components/common/Breadcrumb.tsx`** (new) — breadcrumb nav: linked items + plain last item
- **`src/components/places/NearbyPlaces.tsx`** (new) — horizontal scroll of place cards
- **`src/app/pages/Places.tsx`** (new) — `/places` index with religion filter, pagination, `useHead`
- **`src/app/pages/ExploreCities.tsx`** (new) — city browser with search, links to `/explore/:city`
- **`src/app/pages/ExploreCity.tsx`** (new) — places in city with religion filter chips
- **`src/app/pages/Developers.tsx`** (new) — API docs page with WebAPI JSON-LD, curl examples
- **`src/app/routes.tsx`** — added routes: `/places`, `/explore`, `/explore/:city`, `/explore/:city/:religion`, `/developers`
- **`src/lib/api/client.ts`** — added `getCities()`, `getCityPlaces()`, `getCityReligionPlaces()`
- **`index.html`** — font preload for Lexend
- **`src/__tests__/useHead.test.ts`** (new) — 6 pure logic tests

### Frontend (mobile)
- **`src/lib/types/places.ts`** — same type updates as web (SEO fields, alt_text, NearbyPlace)
- **`src/lib/api/client.ts`** — added `getCities()`, `getCityPlaces()`, `getCityReligionPlaces()`
- **`src/components/places/PlaceFAQ.tsx`** (new) — FAQ accordion for React Native
- **`src/components/places/NearbyPlaces.tsx`** (new) — horizontal scroll for React Native
- **`src/app/screens/ExploreCitiesScreen.tsx`** (new) — city browser screen
- **`src/app/screens/ExploreCityScreen.tsx`** (new) — city places screen with religion filter
- **`src/app/screens/PlacesScreen.tsx`** (new) — all places screen with religion filter
- **`src/app/navigation.tsx`** — added `ExploreCities`, `ExploreCity`, `Places` routes
- **`src/app/screens/PlaceDetailScreen.tsx`** — integrated `PlaceFAQ` and `NearbyPlaces`

---

## OpenStreetMap Coverage Map + Quality Metrics Sidebar Move (2026-03-11)

### Backend (scraper)
- **`app/models/schemas.py`** — added `MapCellItem` and `MapPlaceItem` Pydantic schemas
- **`app/api/v1/scraper.py`** — added `_extract_lat_lng()` helper + two new endpoints:
  - `GET /api/v1/scraper/map/cells?run_code=` — leaf (non-saturated) discovery cells for map rendering, no rectangle overlap
  - `GET /api/v1/scraper/map/places?run_code=` — scraped places with valid lat/lng for dot markers
- **`tests/test_map_endpoints.py`** (new) — 8 pytest tests covering empty DB, saturated-cell exclusion, zero-coord exclusion, run_code filtering, and response shape

### Frontend (admin)
- **`src/components/shared/MapView.tsx`** (new) — reusable Leaflet map component: `Rectangle` per cell (HSL green→red by result count), `CircleMarker` per place (colored by status), tooltips, 2000-item cap with warning badge, empty-state placeholder; exports `MapLegend`
- **`src/index.css`** — added Leaflet CSS import
- **`package.json`** — added `leaflet`, `react-leaflet`, `@types/leaflet`
- **`src/lib/api/types.ts`** — added `MapCellItem`, `MapPlaceItem` TypeScript interfaces
- **`src/lib/api/scraper.ts`** — added `getMapCells()`, `getMapPlaces()` API client functions
- **`src/components/layout/Sidebar.tsx`** — added "Quality" nav item (`BarChart3` icon) between Scraper and Content
- **`src/app/router.tsx`** — added `/quality` route for `QualityMetricsPage`; `/scraper/quality` now redirects to `/quality`
- **`src/app/pages/scraper/ScraperOverviewPage.tsx`** — updated Quality Metrics card link to `/quality`
- **`src/app/pages/DashboardPage.tsx`** — added "Scraper Coverage Map" panel: run dropdown, mini stat pills (cells / places / passed / filtered), `MapView` at 480 px, `MapLegend`
- **`src/app/pages/scraper/RunDetailPage.tsx`** — added 4th "Map" tab with lazy-loaded `MapTab` (loads only when tab becomes active), mini stat row, `MapView` at 520 px, `MapLegend`

### Docs
- **`soulstep-scraper-api/README.md`** — documented `GET /map/cells` and `GET /map/places` endpoints (sections 13 & 14)
- **`apps/soulstep-admin-web/README.md`** — documented Map tab in RunDetailPage and Quality top-level route

---

## Scraper API: Comprehensive Audit & Enhancement (2026-03-11)

### Backend (scraper)

**Architecture / Structure**
- **`app/config.py`** (new) — centralised `Settings` class; all env vars read once at import time; eliminates scattered `os.environ.get()` calls across 8+ files
- **`app/constants.py`** (new) — named constants for all magic numbers (`SYNC_BATCH_SIZE`, `SYNC_BATCH_CONCURRENCY`, `DETAIL_FLUSH_BATCH_SIZE`, `MIN_DISCOVERY_RADIUS_M`, `MAX_DISCOVERY_RADIUS_M`, etc.)
- **`app/seeds/geo.py`** and **`app/seeds/place_types.py`** (new) — seed files moved from `app/db/` to a dedicated `app/seeds/` package; `app/main.py` updated imports
- **`app/services/run_activity.py`** (new) — `get_activity_snapshot()` extracted from 60-line inline query in API layer
- **`app/services/quality_metrics.py`** (new) — `compute_quality_metrics()` extracted from 160-line inline statistics in API layer
- **`app/api/v1/scraper.py`** — thin `get_run_activity` and `get_quality_metrics` endpoints now delegate to service functions

**Concurrency & Resilience**
- **`app/scrapers/base.py`** — added `CircuitBreaker` class: opens after N consecutive failures, closes after `reset_timeout_s`, supports half-open probe
- **`app/scrapers/gmaps.py`** — discovery and detail-fetch semaphores now use `settings.discovery_concurrency` / `settings.detail_concurrency` (env `SCRAPER_DISCOVERY_CONCURRENCY` / `SCRAPER_DETAIL_CONCURRENCY`, defaults 10/20)
- **`app/pipeline/enrichment.py`** — enrichment semaphore uses `settings.enrichment_concurrency` (env `SCRAPER_ENRICHMENT_CONCURRENCY`, default 10)
- **`app/db/scraper.py`** — removed dead sync wrappers (`post_batch`, `handle_sync_failures`); replaced `nonlocal int` counter with `AtomicCounter` in `sync_run_to_server_async`; shared `httpx.AsyncClient` reused across all batch workers

**Reliability**
- **`app/pipeline/place_quality.py`** — fixed `AttributeError` when `raw_data["name"]` is `None` (now uses `or ""` guard)
- **`app/models/schemas.py`** — `DataLocationCreate.max_results` validated with `ge=1, le=100_000`
- **`app/main.py`** — `GOOGLE_MAPS_API_KEY` logs at `CRITICAL` level on startup if missing
- **`Dockerfile`** — runs as non-root `appuser` (security best practice)

**Dependencies**
- **`requirements-dev.txt`** (new) — dev/test deps (`pytest`, `pytest-asyncio`, `pytest-cov`, `ruff`) separated from production `requirements.txt`

**Tests**
- **`tests/test_backoff.py`** — added `TestCircuitBreaker` (7 tests): success, below-threshold failures, open-after-threshold, reset on success, half-open after timeout, `is_open` property
- **`tests/test_quality_breakdown.py`** — added `TestQualityScoringEdgeCases` (10 tests): all-zero inputs, null name, extremely long name, generic/specific names, status scores, rating edge cases, type stability

**Documentation**
- **`soulstep-scraper-api/README.md`** — added Mermaid pipeline diagram, ASCII fallback diagram with gate thresholds annotated, updated directory structure listing all new files, full env var reference table, corrected LLM provider to Gemini, added `requirements-dev.txt` install step

---

## Scraper: Migrate LLM Tie-Breaking from Anthropic to Google Gemini (2026-03-11)

### Backend (scraper)
- **`requirements.txt`** — replaced `anthropic` with `google-generativeai`
- **`app/pipeline/quality.py`** — `_llm_tiebreak()` now uses `google.generativeai.GenerativeModel` (`gemini-2.0-flash`) with `response_mime_type="application/json"` for clean JSON output; env var check updated from `ANTHROPIC_API_KEY` to `GEMINI_API_KEY`
- **`app/main.py`** — startup config check updated to `GEMINI_API_KEY`
- **`app/logger.py`** — `SECRET_ENV_VARS` updated from `ANTHROPIC_API_KEY` to `GEMINI_API_KEY`
- **`.env.example`** — replaced Anthropic key entry with `GEMINI_API_KEY` (get free key at aistudio.google.com)
- **`tests/test_pipeline_extended.py`** — all `_llm_tiebreak` mocks migrated from `anthropic` to `google.generativeai` using `patch("google.generativeai.configure")` / `patch("google.generativeai.GenerativeModel")`
- **`ARCHITECTURE.md`**, **`PRODUCTION.md`**, **`docs/local-scraper-sync.md`**, **`.github/workflows/deploy.yml`**, **`soulstep-scraper-api/README.md`** — all references updated from `ANTHROPIC_API_KEY`/`SCRAPER_ANTHROPIC_API_KEY` to `GEMINI_API_KEY`/`SCRAPER_GEMINI_API_KEY`

---

## Fix: Image Download 302 Redirect + Resume Gap (2026-03-11)

### Backend (scraper)
- **`app/collectors/gmaps.py`** — added `follow_redirects=True` to both `httpx.AsyncClient` instances in `_download_image()` (fallback client) and `download_place_images()` (shared client); Google's Places photo media endpoint now returns a 302 redirect to a CDN URL (`lh3.googleusercontent.com`) instead of 200, so httpx must follow the redirect to get the actual image bytes
- **`app/db/scraper.py`** — added `elif resume_from == "image_download"` case to `resume_scraper_task()`; runs with `stage="image_download"` now re-download images then continue to enrichment instead of being skipped when resuming from `stage="enrichment"`
- **`tests/test_collectors.py`** — added `TestDownloadImage` class with 5 tests: 200 returns content, raw 302 returns None (validates fix necessity), redirect-followed 200 returns CDN content, `ConnectError` retries and returns None, no-client path creates own client with `follow_redirects=True`
- **`tests/test_resume.py`** — added `test_resume_endpoint_accepts_image_download_stage` to verify runs with `stage="image_download"` are accepted and resume correctly

---

## Scraper Debug Log Fix + Quality Score Breakdown (2026-03-11)

### Backend (scraper)
- **`logger.py`** — extended noisy-logger suppression list to include `httpcore`, `httpcore.http11`, `httpcore.http2`, `httpcore.connection`; eliminates flood of connection-level DEBUG lines (e.g. `send_request_headers`, `connect_tcp`) when `LOG_LEVEL=DEBUG`
- **`place_quality.py`** — added `score_place_quality_breakdown(raw_data)` which mirrors the existing `score_place_quality()` logic but returns a structured breakdown: `{total_score, gate, factors[8]}` where each factor has `name`, `weight`, `raw_score`, `weighted`, `detail`
- **`scraper.py`** — new endpoint `GET /api/v1/scraper/runs/{run_code}/places/{place_code}/quality-breakdown`; recomputes breakdown from existing `raw_data` (no schema changes); returns 404 if run or place not found
- **`tests/test_quality_breakdown.py`** — 16 new tests covering breakdown logic (factor count, sum correctness, score parity with direct scorer, bounds, gate labels) and endpoint integration (404 cases, response shape, score accuracy)

### Frontend (admin)
- **`lib/api/types.ts`** — added `QualityFactor` and `QualityBreakdown` interfaces
- **`lib/api/scraper.ts`** — added `getPlaceQualityBreakdown(runCode, placeCode)` API client method
- **`RunDetailPage.tsx`** — replaced DataTable in Scraped Places tab with custom accordion rows; clicking any row lazily fetches and shows an inline `QualityBreakdownPanel` with: place header, total score badge, gate label, and 8 factor rows each with name, detail text, color-coded progress bar (green ≥80%, yellow ≥50%, red <50%), and weighted contribution value

---

## Umami Cloud Analytics Integration (2026-03-11)

### Frontend (web)
- **Adblocker-proof Umami tracking** — nginx proxies `/umami/script.js` and `/umami/api/send` to `cloud.umami.is` so all requests are same-origin and not blocked by uBlock Origin or similar
- **`nginx.conf`** — added `resolver 8.8.8.8`, two proxy `location` blocks for Umami script + collect API
- **`index.html`** — added Umami `<script>` tag using `data-host-url="/umami"` and `data-website-id="%VITE_UMAMI_WEBSITE_ID%"`
- **`vite.config.ts`** — added `/umami` dev proxy forwarding to `cloud.umami.is` so local development works without nginx
- **`VITE_UMAMI_WEBSITE_ID`** — new optional env var; added to `.env.example`
- **`src/__tests__/umami.test.ts`** — 17 Vitest tests for `buildUmamiPayload`, screen name normalisation, consent gating, website ID guard

### Frontend (mobile)
- **`src/lib/hooks/useUmamiTracking.ts`** — new hook; auto-tracks page views when screen name changes, exposes `trackUmamiEvent(name, data?)` for custom events; respects `analyticsConsent` flag; sends directly to `cloud.umami.is/api/send` (no adblocker risk in native apps)
- **`src/components/analytics/UmamiTrackerConnected.tsx`** — new component rendered inside `NavigationContainer`; reads consent from `AdProvider`, current route from `useNavigationState`, and calls `useUmamiTracking`
- **`src/app/navigation.tsx`** — added `<UmamiTrackerConnected />` inside `<NavigationContainer>`
- **`EXPO_PUBLIC_UMAMI_WEBSITE_ID`** — new optional env var; added to `.env.example`
- **`src/__tests__/umami.test.ts`** — 21 Jest tests for payload builder, screen name normalisation, consent gating, website ID guard, deduplication

---

## Quality Metrics Dashboard + Places Filter + Scraper Docs (2026-03-10)

### Backend (soulstep-scraper-api)
- **New `GET /scraper/quality-metrics?run_code=<optional>`** — aggregate quality scoring stats: score distribution (10 buckets), gate funnel, near-threshold sensitivity (±0.05 band), avg/median score, description source breakdown, enrichment status breakdown, per-run summary
- **New Pydantic schemas** in `app/models/schemas.py`: `ScoreBucket`, `GateCount`, `NearThresholdCount`, `DescriptionSourceCount`, `EnrichmentStatusCount`, `PerRunSummaryItem`, `QualityMetricsResponse`
- **New tests** `tests/test_quality_metrics.py` — 8 test cases covering empty DB, seeded distribution, gate breakdown, run_code filter, description source, enrichment status, avg score accuracy, near-threshold band counting

### Backend (soulstep-catalog-api)
- **`GET /admin/places`** — new `city_country` query param filters places by `address` ILIKE; no migration needed
- **`GET /admin/scraper/quality-metrics`** proxy added to `scraper_proxy.py`, forwarding `run_code` param to scraper service
- **Tests** — added `test_city_country_filter_matches_address` + `test_city_country_filter_case_insensitive` to `test_admin_places.py`; added `TestQualityMetricsProxy` (2 tests) to `test_scraper_proxy.py`

### Frontend (admin)
- **New `QualityMetricsPage`** (`/scraper/quality`) — run filter dropdown, 4 stat cards, score distribution BarChart with gate ReferenceLine markers, gate funnel BarChart (per-gate colors), description source + enrichment status PieCharts, near-threshold sensitivity table, per-run summary table with pagination
- **`PlacesListPage`** — added city/country SearchInput that filters by address field via `city_country` param
- **`ScraperOverviewPage`** — added "Quality Metrics" section card linking to `/scraper/quality`
- **`router.tsx`** — new route `/scraper/quality`
- **`lib/api/types.ts`** — added `QualityScoreBucket`, `QualityGateCount`, `NearThresholdCount`, `DescriptionSourceCount`, `EnrichmentStatusCount`, `PerRunSummaryItem`, `QualityOverallStats`, `QualityMetrics` interfaces
- **`lib/api/scraper.ts`** — added `getQualityMetrics(params?)`
- **`lib/api/admin.ts`** — added `city_country?` to `listPlaces` params
- **New utility** `lib/utils/qualityMetrics.ts` — `formatScore()`, `gateColor()`, `formatGateLabel()`
- **New tests** `src/__tests__/qualityMetrics.test.ts` — 16 Vitest tests for all 3 utility helpers

### Docs
- **New `docs/local-scraper-sync.md`** — guide for running the scraper locally and syncing to a remote catalog API (prerequisites, setup, data location, run, monitor, review quality, sync, tips)

---

## Place Quality Scoring & Pipeline Optimization (2026-03-10)

### Scraper (soulstep-scraper-api)
- **New `app/pipeline/place_quality.py`** — pure quality scoring engine computing a 0.0–1.0 score from GMaps metadata (Bayesian rating, business status, photo count, editorial/generative summaries, website, opening hours, name specificity, place type bonus); three configurable gate thresholds: `GATE_IMAGE_DOWNLOAD=0.20`, `GATE_ENRICHMENT=0.35`, `GATE_SYNC=0.40`; shared `is_generic_name()` re-exported for backwards-compat
- **New `app/scrapers/gmaps_cache.py`** — `GlobalGmapsCacheStore` following `GlobalCellStore` pattern; cross-run persistent cache for GMaps API responses (TTL 90 days); upsert on save, pre-loads non-expired entries on init
- **Data model** (`app/db/models.py`): `ScrapedPlace` gains `quality_score` (float, nullable) and `quality_gate` (str, nullable); `ScraperRun` gains `places_filtered` (int, default 0); new `GlobalGmapsCache` table for GMaps response cache
- **Migration `0008_quality_scoring.py`** — adds new columns and `globalgmapscache` table
- **`app/scrapers/gmaps.py`** `_flush_detail_buffer()` now computes and stores quality score + gate label on each `ScrapedPlace` immediately after detail fetch
- **`app/collectors/gmaps.py`** `build_place_data()` now stores `rating`, `user_rating_count`, `has_editorial`, `has_generative`, `gmaps_types` directly in raw_data for use by quality scorer; `download_place_images()` gates on `GATE_IMAGE_DOWNLOAD`
- **`app/pipeline/enrichment.py`** gates on `GATE_ENRICHMENT` — places below threshold are marked `enrichment_status="filtered"` and skipped; `_is_generic_name` aliased from `place_quality.is_generic_name` (backwards-compat)
- **`app/db/scraper.py`** sync converted to async httpx (`sync_run_to_server_async`): batches sent concurrently (semaphore=3), individual fallbacks also async; quality gate `GATE_SYNC` filters places before sync; `sync_run_to_server` wraps via `asyncio.run()`; sync fallback wrappers kept for test compat
- **`app/api/v1/scraper.py`** `GET /runs/{run_code}/data` now includes `_quality_score` and `_quality_gate` fields; `GET /runs/{run_code}/activity` now includes `places_filtered` count
- **New tests** `tests/test_place_quality.py` (36 tests) and `tests/test_gmaps_cache.py` (6 tests); updated `tests/test_sync.py` to use `AsyncMock` + quality gate tests; all 506 tests passing

### Frontend (admin)
- `apps/soulstep-admin-web/src/lib/api/types.ts` — `ScrapedPlaceData` gains `_quality_score` and `_quality_gate`; `RunActivity` gains `places_filtered`
- `RunDetailPage.tsx` — places data table has a new color-coded **Quality** column (green ≥0.4, yellow ≥0.2, red <0.2); activity panel shows **filtered** count alongside enriched/failed/pending

---

## Nginx gzip, Docker HEALTHCHECKs, Web Password Validation (2026-02-28)

### Infrastructure
- Enabled gzip compression in `apps/soulstep-customer-web/nginx.conf` (`gzip on`, `gzip_comp_level 6`, `gzip_min_length 1024`, covers JS/CSS/JSON/SVG/XML types)
- Added `HEALTHCHECK` to `soulstep-catalog-api/Dockerfile` (30s interval, 15s start period, Python urllib probe on `/health`)
- Added `HEALTHCHECK` to `apps/soulstep-customer-web/Dockerfile` (30s interval, 5s start period, wget probe on port 80)
- Updated `docker-compose.yml` `web` service to `depends_on: api: condition: service_healthy` so the web container waits for a healthy API before starting

### Frontend (web)
- Added `src/lib/utils/passwordRules.ts` — shared `checkRule()` and `ruleTranslationKey()` helpers mirroring mobile's inline logic
- Updated `AuthModal.tsx`: fetches password rules via `getFieldRules()` on mount with fallback defaults; shows a live ✓/○ rule checklist when password field is focused (register tab); fixed `minLength` on password input to use dynamic value from API; fixed `setSubmitting(true)` bug in `finally` block (now correctly `setSubmitting(false)` via `resetForm()`)
- 12 Vitest tests in `src/__tests__/passwordRules.test.ts` covering all rule types and edge cases — all passing

---

## Analytics & Tracking Pipeline (2026-02-28)

### Backend
- Added `AnalyticsEventType` enum to `enums.py` (10 event types)
- Added `AnalyticsEvent` model (high-volume table, no FK constraints for performance)
- Migration `0016_analytics_events.py` — creates `analytics_event` table with indexes
- `POST /api/v1/analytics/events` — batch ingestion endpoint (max 50 events, 10 req/min rate limit, works authenticated + anonymous)
- `GET /admin/analytics/overview` — total events, unique users/visitors/sessions, top event types, platform breakdown
- `GET /admin/analytics/top-places` — top places by view + interaction counts with period filter
- `GET /admin/analytics/trends` — event count trends by day/week/month with period and event_type filters
- `GET /admin/analytics/events` — paginated raw event log with filters (event_type, platform, user_code, session_id, date range)
- 15 pytest tests in `tests/test_analytics.py`, all passing

### Frontend (web)
- `useAnalytics.ts` hook — `AnalyticsProvider` with batched buffering (30s flush / 10-event auto-flush), `navigator.sendBeacon` on page unload, consent gating
- `AnalyticsProviderConnected` — wires hook to auth + ads contexts
- Auto page-view tracking via `usePageViewTracking()` in `AppRoutes`
- `trackEvent` calls in `PlaceDetail` (place_view, check_in, favorite_toggle), `Login` (login), `Register` (signup), `WriteReview` (review_submit)
- 11 Vitest pure-logic tests in `src/__tests__/analytics.test.ts`, all passing

### Frontend (mobile)
- `useAnalytics.ts` hook — mirrors web with `AppState` background flush instead of `sendBeacon`, platform from `Platform.OS`, app version from `expo-constants`
- `AnalyticsProviderConnected` — wires hook to auth + ads contexts
- `trackEvent` calls in `PlaceDetailScreen` (place_view, check_in, favorite_toggle), `LoginScreen` (login), `RegisterScreen` (signup)
- 13 Jest pure-logic tests in `src/__tests__/analytics.test.ts`, all passing

### Admin
- `AnalyticsDashboardPage` — 6-stat overview cards, event trends line chart (period/interval toggles), event type pie chart, top places bar chart, platform breakdown pie chart, paginated raw event log with type/platform filters
- New `/analytics` route and "Analytics" sidebar nav item (BarChart2 icon)
- `src/lib/api/analytics.ts` — API client functions for all 4 admin endpoints
- Analytics interfaces added to `src/lib/api/types.ts`

---

## Map View Pagination & Usability (2026-02-27)

### Backend
- Added bounding-box query params (`min_lat`, `max_lat`, `min_lng`, `max_lng`) to `GET /api/v1/places` for viewport-based filtering at the SQL level
- Bounding box filter handles antimeridian edge case
- Added `le=500` validation to `limit` parameter
- When bounding box is provided, radius filtering is skipped (bbox takes precedence)

### Frontend (web)
- Map view now fetches up to 200 places based on the visible viewport (bounding box) instead of a fixed 20 from center point
- "Search this area" floating button appears when the user pans the map — click to load places for the new area
- Default zoom increased from 11 to 14 (user location) and 3 to 5 (no location)
- Search location zoom increased from 12 to 15
- Added "My location" recenter button on the map (bottom-right)
- Loading spinner indicator during map place fetches
- Map no longer auto-fits bounds on every place update (prevents feedback loop with viewport fetching)
- Filters and search changes auto-refetch map places without requiring button click

### Frontend (mobile)
- Mirror of all web map view changes for feature parity
- Map zoom increased from 13 to 14 (default) and 15 (search)
- "Search this area" floating button above the bottom sheet
- "My location" recenter button via Leaflet custom control in WebView
- `updateMarkers()` JS function injected to update markers without rebuilding WebView HTML
- Loading spinner indicator on map

### Docs
- Added translation keys for `map.searchThisArea`, `map.loading`, `map.recenter` in all languages

---

## Scraper Async I/O Migration (2026-02-27)

### Backend (Scraper)

- **Full async I/O migration (3.1)** — Replaced `requests` + `ThreadPoolExecutor` with `httpx.AsyncClient` + `asyncio.gather()` across all layers:
  - All 8 collectors (`gmaps`, `osm`, `wikipedia`, `wikidata`, `knowledge_graph`, `besttime`, `foursquare`, `outscraper`) — `collect()` and all internal fetch methods are now `async def`.
  - New `AsyncRateLimiter` (token-bucket, `asyncio.Lock` + `asyncio.sleep`) and `async_request_with_backoff()` helper in `scrapers/base.py`.
  - `search_area()`, `get_places_in_circle()`, `discover_places()`, `fetch_place_details()`, `download_place_images()`, `run_gmaps_scraper()` — all `async def` using `asyncio.gather()` + `asyncio.Semaphore` for concurrency.
  - Enrichment pipeline (`pipeline/enrichment.py`) — `run_enrichment_pipeline()` uses `asyncio.Semaphore(3)` + `asyncio.gather()` across places; `_enrich_place()` runs phases in parallel via `asyncio.gather()`.
  - `run_scraper_task()` and `resume_scraper_task()` in `db/scraper.py` are now `async def`; Starlette auto-awaits them as background tasks.
- **PostgreSQL-ready (3.2)** — No code changes required; `app/db/session.py` already reads `DATABASE_URL` env var. Setting `DATABASE_URL=postgresql+psycopg2://...` on GCP Cloud Run is sufficient to enable PostgreSQL for concurrent writes.
- **Tests** — All 453 tests updated and passing. `pytest-asyncio` (`asyncio_mode = auto`) runs all `async def test_*` functions automatically; `AsyncMock` used throughout for async method patching; `httpx.AsyncClient` mocked with async context manager protocol.

---

## Scraper Performance & Scale Optimization (2026-02-27)

### Backend (Scraper)

- **Image phase decoupling (1.1)** — `build_place_data()` no longer downloads images inline. Images are stored as URLs only during detail fetch. New `download_place_images()` function (in `collectors/gmaps.py`) runs as a dedicated phase after `fetch_place_details()`, using `ThreadPoolExecutor(20)` + shared `requests.Session` for parallelised CDN downloads. Reduces `raw_data` size from 200–800KB to ~2–5KB per place (fixes 20–80GB storage bomb at 100K scale).
- **Resource name derivation from cells (1.2)** — `discover_places()` no longer writes the full place-name list to `ScraperRun.discovered_resource_names`. Resume logic now derives place IDs from `DiscoveryCell` records directly, preventing 3MB+ JSON serialisation on every run load at 100K scale.
- **Increased rate limits + workers (1.3)** — `gmaps_search` raised from 2→10 rps, `gmaps_details` 5→15 rps. Discovery pool raised from 4→32 workers; detail-fetch pool from 5→20 workers.
- **Connection pooling (1.4)** — `requests.Session` passed through `get_places_in_circle`, `search_area`, `_split_quadrants`, and the detail fetch worker, reusing TCP connections and avoiding per-request TLS handshake overhead.
- **Parallel discovery at all depths (2.2)** — `search_area` now submits quadrant children to the shared thread pool at every recursion depth (not just depth 0). A `threading.Semaphore(10)` caps concurrent API calls. Extracted `_split_quadrants()` helper. 3–5× faster discovery.
- **Token-bucket rate limiter (2.3)** — Replaced the "last-call + sleep" `RateLimiter` with a proper token-bucket using `threading.Condition`. Supports configurable burst (default 3 tokens), eliminates serial lock contention at 20+ workers.
- **Field mask split (2.4)** — `GmapsCollector` now has `FIELD_MASK_ESSENTIAL` and `FIELD_MASK_EXTENDED`. New `fetch_details_split()` fetches essential fields first and only calls the expensive Atmosphere-tier extended fields for OPERATIONAL places with a rating. Saves 15–30% in per-place API cost for closed/unrated places.
- **Cross-run discovery cache (2.1)** — New `GlobalDiscoveryCell` model + `GlobalCellStore` class. Keyed by bounding box + place_types_hash with 30-day TTL. After month 1, recurring runs of the same city skip ~95% of discovery API calls. Migration `0006_global_discovery_cache.py` adds the `globaldiscoverycell` table.
- **Tests** — 19 new tests in `tests/test_perf_optimizations.py` covering: image download phase, resource name derivation, token-bucket burst/throttle/refill/concurrency, `GlobalCellStore` (save, miss, expiry, upsert, thread safety), `fetch_details_split` quality gate, and `build_place_data` URL-only storage.

---

## Translation Cost Reduction (2026-02-27)

### Backend

- **`scripts/backfill_translations.py`** — Removed `address` from translatable place fields; addresses are location identifiers understood universally without translation (~25–33% cost reduction on place translations).
- **`--estimate` flag** — New CLI flag: scans all missing translations, prints per-language character counts and estimated cost at $20/million chars without making any API calls.
- **`--min-review-length` flag** — New CLI flag (default: 0): skips review fields (title/body) shorter than N characters, avoiding translation of low-value short reviews (e.g. "Great!", "5 stars").
- **Cost tracking** — `_backfill_places()` and `_backfill_reviews()` now return `(translated_count, total_chars)` for use in estimate summaries.

---

## Scraper Run Persistence & Resumability (2026-02-27)

### Backend (Scraper)

- **Model** — Added `stage` (String, nullable), `discovered_resource_names` (JSON list), `error_message` (String, nullable) fields to `ScraperRun`. Added `"interrupted"` as a valid status value.
- **Migration `0004_run_persistence.py`** — Adds the three new columns to the `scraperrun` table.
- **Stage tracking** — `run_scraper_task()` now sets `run.stage` to `"discovery"` → `"detail_fetch"` → `"enrichment"` as it progresses and stores `error_message` on failure.
- **Discovery persistence** — `run_gmaps_scraper()` persists discovered Google Maps resource names to `discovered_resource_names` after discovery, enabling detail-fetch to resume without re-discovering.
- **Idempotent detail fetch** — `fetch_place_details()` skips places already stored for a run (resume safety guard).
- **Idempotent enrichment** — `run_enrichment_pipeline()` skips places with `enrichment_status == "complete"`, making enrichment resumable without re-running collectors.
- **Startup detection** — `_mark_interrupted_runs()` in `lifespan()` detects runs stuck in `"running"` on startup (process crash/OOM) and marks them `"interrupted"`.
- **Resume endpoint** — `POST /runs/{run_code}/resume` resumes from stored stage; `resume_scraper_task()` orchestrator reads stage and skips completed phases.
- **Cancel update** — Cancel endpoint now also accepts `"interrupted"` status.
- **Schema** — `ScraperRunResponse` exposes `stage` and `error_message` fields.
- **Tests** — 10 new tests in `tests/test_resume.py` covering startup detection, resume endpoint, schema fields, JSON persistence, cancel behaviour.

### Backend (Catalog API)

- **Scraper proxy** — Added `POST /admin/scraper/runs/{run_code}/resume` proxy route.

### Frontend (Admin)

- **Types** — `ScraperRun` interface updated: `"interrupted"` added to `status` union, `stage: string | null` and `error_message: string | null` fields added.
- **API client** — `resumeRun(runCode)` function added to `scraper.ts`.
- **Status utility** — `statusVariant()` maps `"interrupted"` → `"warning"` (orange badge).
- **Runs list** — Stage column added showing current pipeline phase; Resume button (Play icon) shown for `interrupted`/`failed` runs; `"interrupted"` added to status filter dropdown.
- **Run detail** — 3-step stage pipeline indicator (Discovery → Detail Fetch → Enrichment) with highlighted current/completed steps and warning highlight for interrupted runs. Error message alert box shown when `error_message` is set. Resume button for `interrupted`/`failed` runs.

---

## GCS Image Storage (2026-02-26)

### Backend

- **`app/services/image_storage.py`** — New dual-backend image storage abstraction: `BlobStorageBackend` (default, stores blobs in DB) and `GCSStorageBackend` (uploads to GCS, returns public URL). Controlled by `IMAGE_STORAGE` env var (`blob` | `gcs`).
- **Model changes** — Added `gcs_url` field (nullable String) to `PlaceImage`, `ReviewImage`, `GroupCoverImage`. Made `blob_data` nullable on `ReviewImage` and `GroupCoverImage`.
- **Migration `0015_gcs_image_storage.py`** — Adds `gcs_url` column to all three image tables; makes `blob_data` nullable on `reviewimage` and `groupcoverimage` via `batch_alter_table` (SQLite-compatible).
- **CRUD updates** — `place_images.py`, `review_images.py`, `group_cover_images.py` updated to handle GCS type, accept `gcs_url` param, and clean up GCS objects on orphan cleanup.
- **API endpoints** — `POST /reviews/upload-photo`, `POST /groups/upload-cover` upload to GCS when enabled. `GET /reviews/images/{id}`, `GET /groups/cover/{code}`, `GET /places/{code}/images/{id}` redirect 301 to GCS URL when set.
- **Admin** — `DELETE /admin/places/{code}/images/{id}` deletes GCS object before DB row.
- **Data migration script** — `scripts/migrate_blobs_to_gcs.py` one-time script to migrate existing blob rows to GCS.
- **Config vars** — `IMAGE_STORAGE`, `GCS_BUCKET_NAME`, `GOOGLE_APPLICATION_CREDENTIALS`.
- **Dependency** — `google-cloud-storage>=2.14.0` added to `requirements.txt`.
- **Tests** — 11 new tests in `test_image_storage.py`; GCS tests added to `test_place_images.py`, `test_review_images.py`, `test_group_cover_upload.py`. All 973 tests pass.

---

## P2 Ad Integration — Monetization (2026-02-26)

### Backend

- **AdConfig model** — Server-driven feature flag per platform (web/ios/android): `ads_enabled`, `adsense_publisher_id`, `ad_slots` (JSON dict mapping slot names to ad unit IDs).
- **ConsentRecord model** — GDPR/CCPA audit trail: `user_code` or `visitor_code`, `consent_type` (ads/analytics), `granted`, `ip_address`, `user_agent`, timestamps.
- **`is_premium` field on User** — Boolean, default false. Render gating: premium users never see ads.
- **Public endpoints** — `GET /api/v1/ads/config?platform=web|ios|android` (no auth), `POST /api/v1/consent`, `GET /api/v1/consent`.
- **Admin endpoints** — `GET /admin/ads/config`, `PATCH /admin/ads/config/:id`, `GET /admin/ads/consent-stats`.
- **Migration** — `0014_ad_config_consent.py`: creates `ad_config` + `consent_record` tables, adds `is_premium` on `user`.
- **Config vars** — `ADS_ENABLED`, `ADSENSE_PUBLISHER_ID`, `ADMOB_APP_ID_IOS`, `ADMOB_APP_ID_ANDROID`.
- **Consent translation keys** — Added `consent.*` and `ads.*` keys for en, ar, hi in seed data.
- **Tests** — 21 new pytest tests for ads config, consent recording/retrieval, admin management, and consent stats.

### Frontend (web)

- **CSP updates** — `index.html` and `nginx.conf` updated to allow Google AdSense script-src, connect-src, and frame-src domains.
- **Google Consent Mode v2** — Default-deny consent snippet in `index.html`; `AdProvider` updates consent state via `gtag()` after user grants.
- **AdProvider context** — Fetches backend config, manages consent state, injects AdSense script after consent, exposes `canShowAds` flag.
- **AdBanner component** — Self-gating (consent + premium + feature flag), dark mode `dark:bg-dark-surface`, RTL-aware, test mode in dev.
- **ConsentBanner** — Fixed bottom sheet: "Accept All" + "Manage Preferences" with individual toggles.
- **useAdConsent hook** — localStorage persistence + fire-and-forget backend sync.
- **Ad placements** — PlaceDetail (3 slots), PlaceListView (in-feed every 5th card), CheckInsList (2 slots between sections), Favorites (every 4th card), GroupDetail (bottom), Profile (above version), Notifications (bottom).
- **Tests** — 8 Vitest tests for consent utilities.

### Frontend (mobile)

- **AdProvider context** — Same render gating as web; fetches config per-platform (ios/android).
- **AdBannerNative component** — Self-gating with `makeStyles(isDark)` pattern, placeholder for AdMob BannerAd.
- **AdInterstitial controller** — Singleton with 5-min cooldown, first-session grace period.
- **ConsentBanner** — Modal bottom sheet with Switch toggles for ads/analytics, dark mode support.
- **useAdConsent hook** — AsyncStorage persistence + backend sync.
- **app.json** — Added `react-native-google-mobile-ads` plugin config with placeholder App IDs.
- **Ad placements** — PlaceDetailScreen (3 slots), HomeScreen (in-feed every 5th card), CheckInsListScreen (2 slots), FavoritesScreen (every 4th card), GroupDetailScreen (bottom), ProfileScreen (above version), NotificationsScreen (bottom).
- **Tests** — 10 Jest tests for consent utilities and interstitial logic.

---

## P3 Code Quality — Scraper Service (2026-02-26)

### Backend (Scraper)

- **Shared utilities package** — Created `app/utils/__init__.py`, `app/utils/types.py` (TypedDict shapes: `DescriptionDict`, `ReviewDict`, `ImageDict`, `ContactDict`, `AttributeDict`, `ExistingDataDict`), and `app/utils/extractors.py` (`parse_iso_to_unix`, `make_description`, `ReviewExtractor`, `ContactExtractor`).
- **Reduced collector duplication** — ~150 lines of duplicated review/contact/description loops removed from `gmaps.py` (2 locations), `outscraper.py`, `foursquare.py`, `osm.py`, `wikidata.py`, `knowledge_graph.py`, `wikipedia.py`. All replaced with calls to the shared extractors.
- **Typed `CollectorResult`** — `descriptions`, `reviews`, `images`, `contact` fields now carry `DescriptionDict`, `ReviewDict`, `ImageDict`, `ContactDict` types from `app.utils.types`.
- **Decomposed `run_gmaps_scraper()`** — Extracted `discover_places()` (Phase 1: parallel quadtree) and `fetch_place_details()` (Phase 2: parallel detail fetch + cache). `run_gmaps_scraper()` is now an orchestrator (~25 lines).
- **Decomposed `sync_run_to_server()`** — Extracted `build_sync_payloads()`, `post_batch()`, `handle_sync_failures()`. `sync_run_to_server()` is now an orchestrator (~35 lines).
- **Removed unused dependencies** — `tqdm` and `httpx` removed from `soulstep-scraper-api/requirements.txt`.
- **New tests** — `tests/test_utils.py` (35 tests covering all extractor functions). Updated `tests/test_sync.py` to patch `requests.Session` instead of `requests.post` (4 tests updated). All 405 tests pass.

---

## Codebase Cleanup (2026-02-26)

### Backend

- **Dead code removal** — Deleted orphaned functions with zero callers: `_generate_place_code()` (`places.py`), `_gen_code()` (`admin/bulk.py`), `create_external_review()` (`reviews.py`), `update_user_religion()` (`store.py`), `add_image_url()` / `add_image_blob()` (`place_images.py`), `format_utc_offset()` (`timezone_utils.py`). Refactored `seed.py` to use inline `PlaceImage()` + `session.add()` instead of the deleted helpers.
- **Dead enums removed** — `AttributeDataType`, `AttributeCategory`, `AppPlatform` enums removed from `enums.py`. `ReviewSource.GOOGLE` value removed (never referenced).
- **Deleted empty placeholder** — `app/api/v2/__init__.py` deleted.
- **`html.escape` deduplication** — Replaced custom `_escape_html()` in `share.py` and `_e()` in `meta_tags.py` with stdlib `html.escape()` (imported as `_html` in `share.py` to avoid conflict with local `html` string variables).
- **`FRONTEND_URL` consolidation** — Six files (`structured_data.py`, `meta_tags.py`, `share.py`, `feed.py`, `sitemap.py`, `seo_static.py`) now import `FRONTEND_URL` from `app.core.config` instead of each calling `os.environ.get("FRONTEND_URL", ...)` independently.
- **`_upsert_single_place()` extraction** — Shared upsert logic from batch and single-place create endpoints in `places.py` extracted into a private helper, eliminating ~60 lines of duplication.
- **Test cleanup** — Removed `TestFormatUtcOffset`, `TestGeneratePlaceCode`, and `test_create_external_review` tests; updated `test_place_images.py` to use direct `PlaceImage()` construction.

### Frontend (web)

- **Dead file deletion** — Removed `Splash.tsx`, `PrimaryButton.tsx`, `SearchBar.tsx`, `SkeletonDetail.tsx`, `FilterChip.tsx` (all had zero imports).
- **Dead type removal** — `Visitor` interface removed from `types/users.ts`; `ExternalReview` interface and `external_reviews` field removed from `types/places.ts`; `ROUTES` object and `TOKEN_KEY` removed from `constants.ts`.
- **`formatDistance` deduplication** — Removed inline copies in `PlaceCardUnified.tsx` and `PlacesMap.tsx`; both now import from `@/lib/utils/place-utils`.
- **Theme storage key bug fix** — `providers.tsx` had `THEME_STORAGE_KEY = 'theme'` conflicting with `lib/theme.ts` which reads/writes `'soulstep-theme'` from constants. Removed the local constant; both files now use the shared key. Also removed the redundant `applyTheme()` call in `Profile.tsx` since `ThemeProvider.setTheme()` handles it.
- **i18n** — Replaced hardcoded strings with `t()` calls: `"Visited"` → `t('places.visited')`, `"List View"` → `t('home.listView')`, `"members"` → `t('groups.members').toLowerCase()` (in `AddToGroupSheet` and `PlaceDetail`), `"Share"` / `"Link copied"` / `"Shared"` → `t('common.share')` / `t('common.linkCopied')` / `t('common.shared')`, `ErrorState` retry label default → `t('common.retry')`. Added `home.listView`, `common.linkCopied`, and `common.shared` keys to `seed_data.json` (en, ar, hi).

### Frontend (mobile)

- **Dead file deletion** — Removed `SearchFilterBar.tsx`, `FilterChipsList.tsx`, `FilterChip.tsx`, `groupUtils.ts` (all unused in production).
- **Dead code removal** — `TabIcon` function removed from `Layout.tsx`; `shouldHardUpdate()` removed from `versionUtils.ts`; `Visitor` interface removed from `types/users.ts`; `ExternalReview` interface removed from `types/places.ts`; `SELECT_PATH`, `PLACE_CHECK_IN`, `SETTINGS` routes and `TOKEN_KEY` removed from `constants.ts`; exported `formatDistance` removed from `mapBuilder.ts`.
- **`formatDistance` deduplication** — `mapBuilder.ts`, `PlaceSelector.tsx`, and `PlaceScorecardRow.tsx` now import `formatDistance` from `place-utils.ts`.
- **Test cleanup** — Deleted `groups.test.ts`; removed `shouldHardUpdate` and `TOKEN_KEY` tests from `updateUtils.test.ts` and `utils.test.ts`; updated `mapBuilder.test.ts` to import `formatDistance` from `place-utils`.

### Admin

- **Dead API function removal** — `getAuditLogEntry()`, `bulkUpdatePlaceAttributes()`, `listPlaceAttributesByPlace()`, and `getTranslation()` removed from `admin.ts`; associated dead types `BulkAttributeEntry`, `BulkUpdateAttributesBody`, `PlaceAttributeItem` removed from `types.ts`.
- **`statusVariant` deduplication** — Extracted shared `statusVariant()` into `src/lib/utils/scraperStatus.ts`; `ScraperRunsPage`, `RunDetailPage`, and `ScraperOverviewPage` now import from it instead of each defining their own copy.
- **Topbar route labels** — Added missing breadcrumb labels for `/app-versions`, `/place-attributes`, `/content-translations`, `/notifications`, and `/seo`.

---

## P3 SEO & AI Discoverability (2026-02-25)

### Backend

- **Knowledge Graph entity linking** — `build_place_jsonld()` in `structured_data.py` now accepts `knowledge_graph_urls: list[str] | None`. The `sameAs` field is built as a string (single URL) or list (multiple), merging `place.website_url` with any Wikidata/Wikipedia/Google Maps URLs passed by the caller. Duplicates are deduplicated.
- **`build_dataset_jsonld()`** — New function in `structured_data.py`. Generates `Dataset` Schema.org JSON-LD for the SoulStep catalogue with `name`, `description`, `creator`, `license`, `keywords`, and optional `variableMeasured` per-religion counts.
- **`build_organization_jsonld()` enhancement** — Now includes `knowsAbout` field listing the religion categories SoulStep covers.
- **Static info pages for AI context** — Three new pre-rendered endpoints in `share.py`:
  - `GET /share/about` — `AboutPage` JSON-LD, mission statement, feature list, supported religions, data sources.
  - `GET /share/how-it-works` — `HowTo` JSON-LD with 7 ordered steps covering the full user journey.
  - `GET /share/coverage` — `Dataset` JSON-LD with live stats from DB: total places, city count, per-religion breakdown.
- **RSS 2.0 feed** (`GET /feed.xml`) — New `app/api/v1/feed.py`. Returns the 50 most recently added places as RSS 2.0 with `atom:link` self-reference, per-item categories (religion, place_type), `pubDate`, and `guid`.
- **Atom 1.0 feed** (`GET /feed.atom`) — Same 50 most recent places in Atom format with `id`, `title`, `updated`, `author`, `entry` elements including `summary` and `category`.
- **AI citation monitoring middleware** — New `ai_citation_middleware` in `main.py`. Detects 13 AI-assistant crawlers (ChatGPT, GPTBot, OAI-SearchBot, Claude, Anthropic, Perplexity, Common Crawl, Cohere, You.com, Meta, ByteDance, Diffbot, Omgili). Logs visits to `/share/` paths to a new `AICrawlerLog` DB table. Fire-and-forget via `ThreadPoolExecutor` — no latency added to responses.
- **`AICrawlerLog` model** — New SQLModel table `ai_crawler_log` in `models.py`. Columns: `id`, `bot_name` (indexed), `path`, `place_code` (nullable, indexed), `visited_at` (TIMESTAMPTZ, indexed).
- **Migration `0013_ai_crawler_log`** — Creates `ai_crawler_log` table with indexes on `bot_name`, `place_code`, and `visited_at`.
- **`GET /admin/seo/ai-citations`** — New admin endpoint in `admin/seo.py`. Returns `total_visits`, `period_days`, `by_bot` (sorted by count), `top_places` (top 10 by visit count), and `recent_logs` (paginated). Query params: `days` (1-365, default 30), `bot_name` filter, `page`/`page_size`.
- **`scripts/generate_seo.py`** — New CLI script for batch SEO generation and multi-language translation. Two modes:
  - `--generate`: Creates English SEO content (slug, title, meta_description, rich_description, FAQs) for places missing it.
  - `--translate --langs ar hi`: Translates existing English SEO fields to Arabic and Hindi via Google Cloud Translation API v3. Stores results in `ContentTranslation(entity_type="place_seo")`.
  - Supports `--dry-run`, `--force`, `--limit N` flags.
- **Tests** (`tests/test_seo_p3.py`) — 28 tests covering: Knowledge Graph sameAs (single/list/deduplicated/no-urls), `build_dataset_jsonld()` (basic fields, variableMeasured), static info pages (`/about`, `/how-it-works`, `/coverage`), RSS feed (200/valid XML/channel elements/items/empty), Atom feed (200/valid XML/required elements/entries), AI citations endpoint (auth required, empty state, reflected visits, bot filter, days param).
- **`PRODUCTION.md` — Search engine submission docs** — New section: `FRONTEND_URL`/`API_BASE_URL` env vars, Google Search Console step-by-step (add property, verify, submit sitemap), Bing Webmaster Tools, Yandex Webmaster, AI bot verification, SEO script usage, feed URLs, AI citation monitoring endpoint reference.

---

## P2 SEO & AI Discoverability (2026-02-25)

### Backend

- **`alt_text` on PlaceImage** — New nullable `alt_text` field on `PlaceImage` model. Migration `0012_place_image_alt_text.py`. Stores auto-generated or manually set SEO-friendly image alt text.
- **`generate_image_alt_text()`** — New function in `seo_generator.py`. Primary image: `"{name} – {religion_label} {type_label} in {city}"`. Additional images: `"{name} – interior view {n}"`.
- **`seo_slug` in place detail API** — `GET /api/v1/places/{code}` now returns `seo_slug` (from joined `PlaceSEO` row, or `null` if not yet generated). Used by frontend for canonical URL routing.
- **Auto-regenerate SEO on place patch** — `PATCH /api/v1/admin/places/{code}` now accepts `BackgroundTasks`. When any of `{name, religion, place_type, address, description, website_url}` is changed, `_regenerate_seo_bg()` is scheduled as a background task. Respects `is_manually_edited` flag.
- **Religion category pages** — New `GET /share/religion/{religion}` endpoint serving pre-rendered HTML landing pages per religion (Islam, Christianity, Hinduism, Buddhism, Sikhism, Judaism, Bahá'í, Zoroastrianism). Includes `ItemList` JSON-LD schema, meta tags, and place list. Keyword→religion mapping (mosque→islam, etc.).
- **Nearby + similar places on crawler pages** — Crawler visits to `GET /share/places/{code}` now include `<section class="nearby-places">` (within 10 km, Haversine) and `<section class="similar-places">` (same religion) sections with hyperlinks to other places.
- **Multi-language place pages** — New `GET /share/{lang}/places/{code}` endpoint (lang ∈ `en`/`ar`/`hi`). Sets `html[lang]` and `dir="rtl"` for Arabic. Returns 404 for unsupported languages.
- **Social preview improvements** — `share_place()` now reads `Accept-Language` header for `lang`/`dir` attributes. Religion-based fallback OG images (`_RELIGION_OG_IMAGES` dict) used when no place image exists.
- **Image sitemap** — `GET /sitemap.xml` now registers Google image namespace (`xmlns:image`) and emits `<image:image>` child elements per place URL, with `<image:loc>`, `<image:title>`, and `<image:caption>` from `alt_text` or auto-generated fallback. Images fetched in a single batch query.
- **hreflang language-specific URLs** — `sitemap.xml` hreflang alternates now point to `/share/{lang}/places/{code}` language-specific URLs (not all the same canonical). `build_place_meta_tags()` updated to match.
- **Tests** (`tests/test_seo_p2.py`) — 15 tests covering: `seo_slug` in place detail, auto-regenerate on patch, non-triggering fields, `generate_image_alt_text()` (primary/secondary/no-address), religion category page, multi-language pages, sitemap image namespace, sitemap hreflang URLs, `meta_tags` hreflang, OG fallback images, nearby/similar sections (crawler vs. human).

### Frontend (web)

- **`useDocumentTitle` hook** (`src/lib/hooks/useDocumentTitle.ts`) — Sets `document.title` to `"{title} | SoulStep"` (with title) or `"SoulStep"` (without). Resets on unmount. Applied to: `PlaceDetail` (place name), `Home` (bare app name), `Profile`, `Favorites`, `Groups`.
- **SEO-friendly URL slug routes** — New routes `/places/:placeCode/:slug` and `/places/:placeCode/:slug/review` added to `AppRoutes`. Both render the same components as the code-only routes.
- **Canonical slug redirect in PlaceDetail** — After place data loads, if `place.seo_slug` differs from URL `slug` param, the component fires a `replace` navigation to the canonical slug URL. Review links updated to use slug when available.
- **`seo_slug` type** — Added `seo_slug?: string` to `PlaceDetail` interface in `places.ts`.
- **Tests** (`src/__tests__/useDocumentTitle.test.ts`) — 6 tests covering bare app name, titled format, unmount reset, title update on rerender, undefined/empty handling.

### Frontend (mobile)

- **`slug?` in PlaceDetail navigation params** — `RootStackParamList.PlaceDetail` updated to `{ placeCode: string; slug?: string }` for future deep-link compatibility.
- **Navigation title from place data** — `PlaceDetailScreen` calls `navigation.setOptions({ title: place.name })` in a `useEffect` after place data loads, setting the native navigation bar title dynamically.
- **Tests** (`src/__tests__/documentTitle.test.ts`) — 7 tests covering title formatting, empty name, special characters, slug param type checking (optional/required).

---

## P0 Scraper Reliability (2026-02-25)

### Scraper

- **Structured logging** — Replaced all 79 `print()` statements across the scraper service with Python `logging` module calls. Created `app/logger.py` with:
  - `setup_logging()` — configures root logger from `LOG_LEVEL` (default `INFO`) and `LOG_FORMAT` (default `text`, supports `json` for production log aggregation).
  - `get_logger(name)` — returns a named `logging.Logger` for each module.
  - `_SecretMaskingFormatter` — automatically scrubs API keys, passwords, secrets, and tokens from all log messages using regex patterns.
  - `_JSONFormatter` — emits structured JSON with timestamp, level, logger name, and message for production pipelines.
  - `mask_secret()` / `mask_message()` — public helpers used by startup config logging.
  - Per-module loggers in: `app/main.py`, `app/scrapers/base.py`, `app/scrapers/gmaps.py`, `app/collectors/gmaps.py`, `app/pipeline/enrichment.py`, `app/pipeline/quality.py`, `app/db/scraper.py`, `app/db/seed_geo.py`, `app/db/seed_place_types.py`.
- **Startup config validation** — Added `_validate_startup_config()` called in `lifespan()`. On startup it logs all optional API keys (masked), warns for any missing keys that will cause collectors to skip, prints general runtime config, and runs a DB connectivity check.
- **Tests** — Added `tests/test_logger.py` with 25 tests covering `mask_secret`, `mask_message`, `setup_logging` (level, formatter, stdout, idempotency), `get_logger`, and `_JSONFormatter`.
- **Pre-existing test fixes** — Updated stale `MIN_RADIUS` constant assertion from 2000→500 and `page_size` default from 20→50 in `test_gmaps_helpers.py` and `test_list_runs.py`.

---

## P1 SEO & AI Discoverability Implementation (2026-02-25)

### Backend

- **PlaceSEO model + migration** — New `place_seo` table (`place_code` FK, `slug` unique, `seo_title`, `meta_description`, `rich_description`, `faq_json`, `og_image_url`, `is_manually_edited`, `generated_at`, `updated_at`). Migration `0011_place_seo.py`.
- **SEO content generation service** (`app/services/seo_generator.py`) — Template-based auto-generation of slugs (Unicode-aware), SEO titles, meta descriptions, rich descriptions, and FAQ pairs from place data. `is_manually_edited=True` prevents auto-overwrite on re-generation. `upsert_place_seo()` for create/update with force flag.
- **Schema.org JSON-LD service** (`app/services/structured_data.py`) — Generates `PlaceOfWorship`/`Mosque`/`HinduTemple`/`Church`/`BuddhistTemple`/`Gurdwara`/`Synagogue` JSON-LD, `BreadcrumbList`, `FAQPage`, and `Organization` schemas. Renders as `<script type="application/ld+json">` tags.
- **Meta tags service** (`app/services/meta_tags.py`) — Per-page HTML string with `<title>`, `<meta name="description">`, `<link rel="canonical">`, `og:*`, Twitter Cards, and `hreflang` alternates for `en`/`ar`/`hi`.
- **Enhanced share.py** — Bot/crawler detection via User-Agent regex (Googlebot, ChatGPT-User, Claude-Web, PerplexityBot, 30+ patterns). Crawlers receive full HTML with visible content, canonical link, JSON-LD, and FAQs; human browsers get OG tags + JS redirect unchanged.
- **Dynamic sitemap.xml** (`GET /sitemap.xml`) — XML sitemap from all Place rows with hreflang alternates, `lastmod` from SEO `updated_at`, and priority scoring. Served at root, not `/api/v1/`.
- **robots.txt** (`GET /robots.txt`) — Proper crawl directives allowing all public pages, blocking `/api/v1/auth/`, `/api/v1/admin/`, `/admin/`. Explicit per-agent allows for ChatGPT-User, Claude-Web, PerplexityBot, GPTBot. Sitemap reference.
- **llms.txt + llms-full.txt** (`GET /llms.txt`, `GET /llms-full.txt`) — Dynamic Markdown files describing SoulStep for AI chatbot discoverability. Place count pulled from DB. Full variant includes API response schema and example queries.
- **Admin SEO endpoints** (`app/api/v1/admin/seo.py`) — `GET /admin/seo/stats` (health metrics), `GET /admin/seo/places` (paginated list with coverage, search/filter), `GET /admin/seo/places/{code}`, `PATCH /admin/seo/places/{code}` (manual edit with slug conflict check), `POST /admin/seo/places/{code}/generate` (per-place regeneration with `force` flag), `POST /admin/seo/generate` (bulk generation). All require admin auth.
- **Tests** (`tests/test_seo.py`) — 34 tests covering robots.txt, llms.txt, sitemap, enhanced share endpoint (crawler vs. human), all admin SEO endpoints, slug conflict detection, `is_manually_edited` protection, and `seo_generator` unit tests.

### Frontend (Admin)

- **SEO types** (`types.ts`) — `SEOStats`, `SEOListItem`, `SEOListResponse`, `FAQItem`, `SEODetail`, `PatchSEOBody`, `GenerateResponse`.
- **SEO API functions** (`admin.ts`) — `getSEOStats()`, `listSEOPlaces()`, `getSEODetail()`, `patchSEO()`, `regenerateSEO()`, `bulkGenerateSEO()`.
- **SEO Dashboard page** (`pages/seo/SEODashboardPage.tsx`) — Coverage stats, progress bar, paginated table with SEO status badges, bulk-generate button, search/filter by religion and missing-only.
- **SERP Preview component** (`components/seo/SERPPreview.tsx`) — Live Google SERP-style preview with character-count warnings (green/amber/red) for title and description.
- **SEO Place Detail/Editor page** (`pages/seo/SEOPlaceDetailPage.tsx`) — View and edit `slug`, `seo_title`, `meta_description`, `rich_description`, `og_image_url`, FAQ pairs. Live SERP preview. Regenerate button. `is_manually_edited` badge.
- **Sidebar** — Added "SEO" nav item with `Search` icon between Content and Audit Log.
- **Router** — Added `/seo` → `SEODashboardPage` and `/seo/:placeCode` → `SEOPlaceDetailPage` routes.

### Docs

- **ROADMAP.md** — Marked 11 P1 SEO items as completed.

---

## SEO & AI Discoverability Roadmap (2026-02-25)

### Docs

- **ROADMAP.md — SEO & Discoverability section** — Added 26 new roadmap items across P1 (11 items: pre-rendering, PlaceSEO model, sitemap, robots.txt, JSON-LD, meta tags, llms.txt, FAQ content, admin dashboard/editor), P2 (8 items: slug URLs, hreflang, image SEO, internal linking, category pages, auto-regeneration), and P3 (7 items: Knowledge Graph linking, RSS feed, Cloud Translation, CI validation, AI citation monitoring).

---

## P0 Security Hardening (2026-02-25)

### Backend

- **httpOnly access_token cookie** — `POST /auth/login`, `/auth/register`, and `/auth/refresh` now set an `access_token` httpOnly, Secure, SameSite=Strict cookie (15-min TTL, `path=/api/v1`) in addition to the existing `refresh_token` cookie. Eliminates XSS token theft from localStorage.
- **Cookie fallback in `deps.py`** — `get_current_user_code()` and `get_optional_user()` now accept the JWT from either the `Authorization: Bearer` header or the `access_token` cookie, supporting both in-memory (normal) and page-reload (cookie restore) scenarios.
- **Information disclosure fix** — Removed `error_type: <ClassName>` from internal 500 error responses to prevent leaking Python class names.
- **Search rate limiting** — Added `@limiter.limit("30/minute")` to `GET /api/v1/search/autocomplete` and `GET /api/v1/search/place-details`.

### Scraper

- **Request timeouts** — Added `timeout=(5, 30)` (5 s connect, 30 s read) to all `requests.get()` / `requests.post()` calls across all 5 external-API collectors (`gmaps`, `foursquare`, `knowledge_graph`, `outscraper`, `besttime`) and as a default in `make_request_with_backoff()`. Prevents indefinitely hanging HTTP calls.

### Frontend (web)

- **In-memory token** — `apps/soulstep-customer-web/src/lib/api/client.ts` switched from `localStorage` to a module-level `_inMemoryToken` variable. Exported `setClientToken()` for provider integration.
- **Cookie-based session restore** — `AuthProvider` checks for a cached `USER_KEY` entry as a session hint, then calls `api.refreshToken()` on startup to restore the access token via the httpOnly refresh cookie. No token is ever written to `localStorage`.
- **OWASP security headers** — `nginx.conf` rewritten with: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `X-XSS-Protection`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security` (1 year, includeSubDomains, preload), and a full `Content-Security-Policy`.
- **CSP meta tag** — `index.html` now includes a `Content-Security-Policy` meta tag for the dev environment (where nginx doesn't run).

### Frontend (mobile)

- **In-memory token** — `apps/soulstep-customer-mobile/src/lib/api/client.ts` switched from `AsyncStorage` to a module-level `_inMemoryToken` variable. `authHeaders()` changed from async to sync (no more `await AsyncStorage.getItem()`).
- **Cookie-based session restore** — `AuthProvider` checks `AsyncStorage` for `USER_KEY` as a hint, then calls `api.refreshToken()` on startup. No token is written to `AsyncStorage`.

### Frontend (admin)

- **In-memory token** — `apps/soulstep-admin-web/src/lib/api/client.ts` switched from `localStorage.getItem/setItem/removeItem` to a module-level `_inMemoryToken` variable.
- **Cookie-based session restore** — `AuthProvider` removed the localStorage token check; session is restored via the existing `getMe()` call, which uses the httpOnly cookie through `withCredentials: true`.

### CI / DevOps

- **Trivy container scanning** — `.github/workflows/deploy.yml` scans every Docker image for CRITICAL/HIGH CVEs after each build (report-only, exit-code 0 for now).
- **pip-audit** — `.github/workflows/tests.yml` runs `pip-audit` on both `soulstep-catalog-api` and `soulstep-scraper-api` Python dependencies.
- **npm audit** — `.github/workflows/tests.yml` runs `npm audit --audit-level=high` on both web and mobile Node dependencies.

### Tests

- **Frontend test updates** — `apps/soulstep-customer-web/src/__tests__/client.test.ts` and `apps/soulstep-customer-mobile/src/__tests__/client.test.ts` updated to use `setClientToken()` / `setClientToken(null)` instead of `localStorage` / `AsyncStorage` mocks.
- **Translation service test fix** — `tests/test_translation_service.py` updated to mock `_make_client()` (Google Cloud SDK) instead of `requests.post` (old HTTP implementation).
- **Admin users test fix** — `tests/test_admin_users.py` updated default `page_size` assertion from `20` → `50` to match the pagination standardization.

---

## Admin Pagination Standardization (2026-02-24)

### Backend
- Raised `page_size` max from `le=100` to `le=2000` and default from `20` to `50` across all admin list endpoints: `GET /admin/users`, `/admin/places`, `/admin/reviews`, `/admin/groups`, `/admin/check-ins`, `/admin/audit-log`, `/admin/content-translations`, `/admin/notifications/history`, and scraper `GET /runs`

### Frontend (admin)
- Updated `Pagination` component default `pageSizeOptions` to `[50, 100, 200, 500, 1000, 2000]`
- Updated `usePagination` hook default page size from `20` to `50`
- Updated all paginated list pages (Users, Places, Reviews, Groups, Check-ins, Scraper Runs) to use `usePagination(50)`
- Refactored `ContentTranslationsPage` to use `usePagination(50)` instead of a hardcoded `PAGE_SIZE` constant; page size selector now works on that page

### Docs
- Added **Rule 16** to `CLAUDE.md` documenting the admin pagination standard: default 50/page, options 50/100/200/500/1000/2000

---

## Review Content Translation Support (2026-02-24)

### Backend
- **`GET /api/v1/places/{placeCode}/reviews`** now accepts a `lang` query param (BCP-47 code, e.g. `ar`, `hi`). When provided and non-English, translated `title` and `body` are returned from `ContentTranslation` rows; missing translations fall back to the original English text.
- **`scripts/backfill_translations.py`** extended with `_backfill_reviews()` — mirrors `_backfill_places()` to auto-translate review `title` and `body` fields via Google Translate and persist results with `entity_type="review"`.
- Added `TestGetPlaceReviewsLang` test class covering: no lang (English), `lang=en` fast path, stored Arabic translation, fallback to English, partial translation (only body), and null title handling.
- Added `test_review_entity_type_works` to `test_content_translations.py` confirming `bulk_get_translations` works with `entity_type="review"`.

---

## Unified Roadmap Consolidation (2026-02-23)

### Docs
- **Replaced `ROADMAP.md`** with a comprehensive unified document merging `ROADMAP.md` and `ADMIN_ROADMAP.md` into a single source of truth
- Preserved all 29 completed `[x]` items from the previous roadmap (P0–P3) in a dedicated "Completed Items" section
- Merged all 20 remaining unchecked items from old ROADMAP.md into the appropriate new priority tiers
- Pulled in Admin Phase 6 features (bulk ops, data export, audit log, notifications) from `ADMIN_ROADMAP.md`
- Added ~30 new items from a full-system audit (security, reliability, CI/CD, accessibility, testing, infrastructure, monitoring) across all 5 systems (backend, scraper, web, mobile, admin + infra)
- Added 4 new user feature ideas from audit: deep linking, offline mode with sync queue, optimistic UI updates, image lazy loading
- Added 8 monetization strategies: premium subscriptions (SoulStep Pro), B2B partnerships, local experiences marketplace, API access, sponsored places, donation integration, premium group features, analytics-as-a-service
- Reorganized into 4 priority tiers: P0 (Critical / Pre-Production — 10 items), P1 (High Priority — 16 items), P2 (Feature Enhancements — 25 items), P3 (Scalability & DevOps — 25 items)
- Total: 76 open items + 30 completed items = 106 tracked items

---

## Monorepo Folder Rename (2026-02-22)

### Docs
- Renamed all service root folders to use explicit service names:
  - `server/` → `soulstep-catalog-api/`
  - `data_scraper/` → `soulstep-scraper-api/`
  - `apps/web/` → `apps/soulstep-customer-web/`
  - `apps/mobile/` → `apps/soulstep-customer-mobile/`
  - `apps/admin/` → `apps/soulstep-admin-web/`
- Updated all path references across `README.md`, `CLAUDE.md`, `ARCHITECTURE.md`, `PRODUCTION.md`, `CHANGELOG.md`, `docker-compose.yml`, `.pre-commit-config.yaml`, `scripts/gen-api-types.mjs`, and all service `README.md` files
- Updated GitHub Actions workflows (`deploy.yml`, `tests.yml`) with new working directories and cache paths

---

## Admin Panel — Phase 4: Content & Configuration (2026-02-23)

### Backend (`soulstep-catalog-api`)
- **`UITranslation` model** (`app/db/models.py`): new table `ui_translation` — stores per-(key, lang) runtime overrides for UI translation strings; unique constraint on `(key, lang)`
- **Migration `0010_ui_translation.py`**: creates `ui_translation` table with index on `key`
- **`GET /api/v1/translations`** updated: now merges `UITranslation` DB rows on top of seed data for the requested language, giving admin-set overrides immediate effect for mobile/web clients
- **Admin translations** (`app/api/v1/admin/translations.py`):
  - `GET /admin/translations` — lists all keys (seed ∪ DB-only), with per-lang values and `overridden_langs` flag; supports `?search=` filter
  - `GET /admin/translations/{key}` — single key detail
  - `PUT /admin/translations/{key}` — upserts DB overrides for one or more languages
  - `DELETE /admin/translations/{key}` — reverts all DB overrides (returns to seed values)
  - `POST /admin/translations` — creates a brand-new key (must not exist in seed)
- **Admin app-versions** (`app/api/v1/admin/app_versions.py`):
  - `GET /admin/app-versions` — lists all `AppVersionConfig` rows
  - `PUT /admin/app-versions/{platform}` — upserts config for `ios` or `android`
- **Admin content-translations** (`app/api/v1/admin/content_translations.py`):
  - `GET /admin/content-translations` — paginated list; filterable by `entity_type`, `entity_code`, `lang`, `field`; enriches place rows with `place_name`
  - `POST /admin/content-translations` — creates a new `ContentTranslation` row (409 on duplicate)
  - `PUT /admin/content-translations/{id}` — updates `translated_text` / `source`
  - `DELETE /admin/content-translations/{id}` — hard-delete
- **Admin place-attributes** (`app/api/v1/admin/place_attributes.py`):
  - `GET /admin/place-attributes` — lists all `PlaceAttributeDefinition` rows with live usage counts
  - `GET /admin/place-attributes/{place_code}` — lists attributes for a specific place with definition metadata
  - `PUT /admin/place-attributes/{place_code}` — bulk-upserts attributes for a place
- **Admin router** (`app/api/v1/admin/__init__.py`): registered all four new routers
- **Tests** (42 new tests, 689 passing total):
  - `test_admin_translations.py` — 14 tests: CRUD, seed merge, search, i18n endpoint override
  - `test_admin_app_versions.py` — 7 tests: list, create, update, partial update, platform validation
  - `test_admin_content_translations.py` — 12 tests: CRUD, duplicate 409, filter by lang, place name enrichment
  - `test_admin_place_attributes.py` — 9 tests: list definitions with usage counts, list/bulk-update per place, 404s

### Frontend (`apps/soulstep-admin-web`)
- **Types** (`lib/api/types.ts`): added `TranslationEntry`, `UpsertTranslationBody`, `CreateTranslationBody`, `AppVersionConfig`, `UpdateAppVersionBody`, `AdminContentTranslation`, `ContentTranslationListResponse`, `CreateContentTranslationBody`, `UpdateContentTranslationBody`, `PlaceAttributeDefinition`, `PlaceAttributeItem`, `BulkAttributeEntry`, `BulkUpdateAttributesBody`
- **API client** (`lib/api/admin.ts`): added `listTranslations`, `getTranslation`, `upsertTranslation`, `deleteTranslationOverrides`, `createTranslation`, `listAppVersions`, `updateAppVersion`, `listContentTranslations`, `createContentTranslation`, `updateContentTranslation`, `deleteContentTranslation`, `listPlaceAttributeDefinitions`, `listPlaceAttributesByPlace`, `bulkUpdatePlaceAttributes`
- **`TranslationsPage`** (`pages/content/TranslationsPage.tsx`): key/EN/AR/HI table with inline cell editing, "overridden" badge, missing-value highlight, revert-to-seed action, add-new-key form
- **`AppVersionsPage`** (`pages/content/AppVersionsPage.tsx`): iOS and Android cards with in-place edit for `latest_version`, `min_version_soft`, `min_version_hard`, `store_url`
- **`ContentTranslationsPage`** (`pages/content/ContentTranslationsPage.tsx`): paginated DataTable with entity type/lang filters, inline text editing, create form, delete with confirmation
- **`PlaceAttributesPage`** (`pages/content/PlaceAttributesPage.tsx`): attribute definition table with usage counts, category/religion filters
- **Router** (`app/router.tsx`): registered `/translations`, `/app-versions`, `/content-translations`, `/place-attributes`

---

## Admin Panel — Phase 3: Data Scraper Management (2026-02-23)

### Backend (`soulstep-catalog-api`)
- **Scraper proxy**: added `GET /api/v1/admin/scraper/stats` endpoint that forwards to the scraper service and returns aggregate counts
- **`test_scraper_proxy.py`**: comprehensive integration tests covering auth guards (401/403), 503/504 error propagation, and all proxy endpoints for data locations, runs, stats, collectors, and place type mappings

### Backend (`soulstep-scraper-api`)
- **`GET /api/v1/scraper/runs`**: new paginated list endpoint — filterable by `status` and `location_code`
- **`DELETE /api/v1/scraper/data-locations/{code}`**: deletes a location and cascades to runs, scraped places, and raw collector data
- **`DELETE /api/v1/scraper/runs/{run_code}`**: deletes a run and its associated scraped places and raw collector data
- **`GET /api/v1/scraper/stats`**: returns `total_locations`, `total_runs`, `total_places_scraped`, `last_run_at`, `last_run_status`
- **`ScraperStatsResponse`**: new Pydantic schema in `schemas.py`
- **`test_list_runs.py`**: tests pagination, status/location filters, and response shape
- **`test_delete_location.py`**: tests 404 handling and full cascade deletion
- **`test_delete_run.py`**: tests 404 handling, cascade deletion, and sibling run preservation

### Frontend (`apps/soulstep-admin-web`)
- **Scraper API client** (`lib/api/scraper.ts`): full client for data locations, runs, stats, collectors, and place type mappings
- **Scraper types** (`lib/api/types.ts`): added `DataLocation`, `ScraperRun`, `ScraperStats`, `CollectorStatus`, `PlaceTypeMapping`, `ScrapedPlaceData`, `RawCollectorEntry`, and related request/patch bodies
- **`usePolling` hook** (`lib/hooks/usePolling.ts`): polls a callback on a configurable interval while `active` is true; stops automatically when inactive
- **`ScraperOverviewPage`** (`/scraper`): summary stat cards + links to sub-sections
- **`DataLocationsPage`** (`/scraper/data-locations`): DataTable with create form (city/country/max_results) and delete with cascade confirmation
- **`ScraperRunsPage`** (`/scraper/runs`): paginated DataTable with status filter, start-run form, progress bars, and per-row actions (cancel, sync, re-enrich, delete)
- **`RunDetailPage`** (`/scraper/runs/:runCode`): run info card with progress bar + 3-second polling for active runs; tabbed view (Scraped Places DataTable, Raw Data JSON viewer grouped by place)
- **`CollectorsPage`** (`/scraper/collectors`): card grid showing each collector's availability and API key env var
- **`PlaceTypeMappingsPage`** (`/scraper/place-type-mappings`): DataTable with inline row editing, active toggle, and create/delete with confirmation
- **Router**: scraper routes registered under `RequireAdmin` guard
- **`usePolling.test.ts`**: 6 Vitest tests covering inactive no-call, interval cadence, activation/deactivation toggling, callback reference updates, and custom intervals

---

## Admin Panel — Phase 1: Foundation (2026-02-22)

### Backend
- **User model**: added `is_admin: bool` column (`BOOLEAN NOT NULL DEFAULT FALSE`) to the `user` table
- **Migration `0008_add_is_admin.py`**: adds `is_admin` column to `user` table
- **`AdminDep`**: new FastAPI dependency in `server/app/api/deps.py` — raises HTTP 403 for non-admins
- **Admin router**: `server/app/api/v1/admin/` package with scraper proxy stub registered at `/api/v1/admin/`
- **Scraper proxy**: `scraper_proxy.py` forwards all scraper management requests to `DATA_SCRAPER_URL` (new env var added to `config.py`)
- **`GET /api/v1/users/me`**: response now includes `is_admin` field via updated `UserResponse` schema
- **`scripts/create_admin.py`**: CLI to create a new admin user or promote an existing user
- **Tests**: `tests/test_admin_dep.py` — 8 tests covering auth guard, is_admin in response, and create_admin script logic (all 508 server tests pass)

### Frontend (Admin)
- **`apps/admin/`**: new Vite + React + TypeScript + Tailwind CSS admin app (port 5174)
- Same design tokens as `apps/web` (`dark-bg`, `dark-surface`, `dark-border`, `dark-text-secondary`, `primary`, Inter font)
- **Auth flow**: `AuthProvider` (JWT stored in localStorage), `ThemeProvider` (dark/light with persistence), `RequireAuth`, `RequireAdmin` route guards
- **Layout**: collapsible sidebar with nav links (Dashboard, Users, Places, Reviews, Check-ins, Groups, Scraper, Content, Audit Log), sticky topbar with breadcrumb, theme toggle, user avatar, logout
- **Pages**: `LoginPage`, `AccessDeniedPage`, `DashboardPage` (placeholder for Phase 5)
- **API layer**: `apiClient` (Axios with Bearer token interceptor + auto-redirect on 401), `admin.ts`, `types.ts`
- Mobile-responsive: sidebar becomes slide-out drawer (hamburger trigger) on `< 768 px`

### Docs
- `ADMIN_ROADMAP.md`: Phase 1 implementation complete

---

## i18n: Add Malayalam Language Support (2026-02-22)

### Backend
- Added `ml` (Malayalam / മലയാളം) to the `languages` list in `server/app/db/seed_data.json`
- Provided full Malayalam translations for all 490 keys across all namespaces (`auth`, `nav`, `settings`, `common`, `home`, `profile`, `places`, `placeDetail`, `groups`, `notifications`, `journey`, `search`, `writeReview`, `reviews`, `feedback`, `map`, `update`, `splash`, `selectPath`, `checkins`, `visitor`, `register`)
- Malayalam is a non-RTL language; no layout direction changes required

---

## Map View: Place List Panel / Bottom Sheet (2026-02-22)

### Frontend (web)
- **`PlacesMap`** — new `onBoundsChange` callback (fires on `moveend`/`zoomend` and after initial `fitBounds`); new `className` prop to override container styles
- **`PlaceMapView`** fully rewritten:
  - Desktop (≥ md): left side panel (`w-80`) showing scrollable `PlaceCardUnified` list of places visible in the current map viewport
  - Mobile (< md): bottom sheet (52% screen height, rounded top, backdrop blur) showing the same list
  - Both panels refresh automatically as the user pans or zooms the map (client-side bounds filter, zero extra API calls)
  - Old single selected-place card removed; navigation goes directly to PlaceDetail via card links
- **`map.placesInView`** translation key added for all 4 languages (en, ar, hi, te)

### Frontend (mobile)
- **`HomeScreen`** map view fully rewritten:
  - Horizontal carousel + custom selected-place card removed
  - New fixed-height bottom sheet (45% of screen height, rounded top) above the tab bar with a vertical `FlatList` of `PlaceCard` (compact variant)
  - List shows only places visible in the current map viewport via WebView `boundsChanged` messages
  - `mapContainer` now uses `flexDirection: column`: map fills `flex: 1`, sheet has a fixed height; `tabBarHeight` as `paddingBottom` keeps content above the nav bar
  - Removed `selectedPlace`, `addToGroupSheetPlace`, `panelAnim`, and `Animated`

---

## Fix: Map Place Card Sheet Overlapping Bottom Nav Bar (2026-02-22)

### Frontend (mobile)
- **`HomeScreen`**: imported `useBottomTabBarHeight` from `@react-navigation/bottom-tabs`; map bottom panel now sets `bottom: tabBarHeight` so the place card sheet and horizontal scroller always sit flush against the top edge of the tab bar instead of sliding underneath it
- Removed over-compensating `insets.bottom + 90` / `insets.bottom + 12` padding from the scroller and place card — no longer needed since the panel is already elevated above the tab bar

---

## Content Localization for Places (2026-02-22)

### Backend
- **New `ContentTranslation` model** (`server/app/db/models.py`) — `TIMESTAMPTZ`-aware entity/field/lang keyed table for storing scraped/system-generated translations separate from UI string translations
- **New `server/app/db/content_translations.py`** — CRUD helpers: `upsert_translation`, `get_translation`, `get_translations_for_entity`, and `bulk_get_translations` (single SQL query for list endpoints)
- **`GET /api/v1/places` + `GET /api/v1/places/{place_code}`** — new `lang` query param; when non-English, overlays translated `name`, `address`, and `description` fields; English fast-path (zero overhead)
- **`build_specifications()`** in `place_specifications.py` — accepts `lang` and applies translations to specification labels/values
- **Migration `0007_content_translation.py`** — adds `content_translation` table with composite `UNIQUE(entity_type, entity_code, field, lang)` and index on `(entity_type, lang, entity_code)` for bulk queries
- **`server/scripts/backfill_translations.py`** — one-off script to backfill translations from existing wikidata/scraper data
- **`TranslationService`** extended to support entity-content translation sourcing
- **Data scraper**: `wikidata.py` and `merger.py` updated to collect and store multilingual place content

### Frontend (web)
- **API client** (`apps/web/src/lib/api/client.ts`) — module-level `_currentLocale` + `setApiLocale()`; `getPlaces()` and `getPlace()` append `lang=` param automatically for non-English locales
- **`I18nProvider`** (`providers.tsx`) — calls `setApiLocale()` on initial locale resolution and on every locale switch

### Frontend (mobile)
- **API client** (`apps/mobile/src/lib/api/client.ts`) — same `_currentLocale` + `setApiLocale()` pattern; `getPlaces()` and `getPlace()` inject `lang=` param
- **`I18nProvider`** (`providers.tsx`) — calls `setApiLocale()` on initial locale resolution and on every locale switch

### Tests
- **Backend**: `test_content_translations.py` — CRUD helpers (upsert, get, bulk-get, missing fallback); `test_places_localization.py` — list and detail endpoints with `lang=` param, English fast-path, missing-translation fallback (all pass; 500 total)
- **Web**: `apiLocale.test.ts` — `setApiLocale` + `lang` param injection (6 cases)
- **Mobile**: `apiLocale.test.ts` — equivalent 6 cases (parity with web)

---

## API Response Compression (2026-02-21)

### Backend
- **`GZipMiddleware`** added to `server/app/main.py` — compresses all responses ≥ 1 KB with gzip. Expected 60–80% transfer size reduction for large JSON payloads (place lists, translations).

---

## Search Feature — Google Places Autocomplete + Search History (2026-02-21)

### Backend
- **New `server/app/api/v1/search.py`** — two server-side proxy endpoints:
  - `GET /api/v1/search/autocomplete?q=&lat=&lng=` — calls Google Places API (New) autocomplete, returns `{ suggestions: [{place_id, main_text, secondary_text}] }`. API key stays server-side; graceful empty response when key missing or Google errors.
  - `GET /api/v1/search/place-details?place_id=` — fetches lat/lng and display name for a given Google place ID.
- **`GOOGLE_MAPS_API_KEY`** added to `server/app/core/config.py`
- **Router registered** in `server/app/api/v1/__init__.py` with prefix `/search`
- **9 new backend tests** (`server/tests/test_search.py`): short-query rejection, no-API-key, valid autocomplete, lat/lng bias, Google error fallback, no results, place-details happy path, invalid place, error fallback

### Frontend (web)
- **`SearchOverlay`** full-screen overlay (non-route, rendered from Home.tsx): auto-focused input, debounced (300ms) autocomplete, recent searches section (localStorage, max 10, deduplicated by placeId), clear history, no-results and error states
- **`searchHistory.ts`** utility: `getSearchHistory`, `addSearchHistory`, `clearSearchHistory` (localStorage-backed)
- **`HomeHeader`**: search bar is now a read-only pressable button; shows active search location name + clear (×) button; clicking opens SearchOverlay
- **`Home.tsx`**: new `searchLocation` state; when set, `buildParams` uses search lat/lng + `radius: 10` instead of user coords; renders `<SearchOverlay>` when `showSearch` is true
- **`PlaceMapView` / `PlacesMap`**: new `searchLocation` prop; renders a distinct orange search pin at the search coordinates; map zooms to the search area on selection
- **API client**: `searchAutocomplete()`, `getSearchPlaceDetails()` added

### Frontend (mobile)
- **`SearchScreen`** (new): back arrow + auto-focused TextInput + clear button; recent searches (AsyncStorage); autocomplete (400ms debounce); dark mode compliant (`makeStyles(isDark)` + design tokens)
- **`searchHistory.ts`** utility (AsyncStorage-backed, same API as web)
- **`navigation.tsx`**: `Search` screen added to root stack; `Main` params accept `searchLocation`; `SearchLocation` type exported
- **`HomeScreen`**: search bar replaced with pressable button; navigates to `SearchScreen`; reads `searchLocation` from route params (set by `SearchScreen` via `navigate('Main', { screen: 'Home', params: { searchLocation } })`); `buildParams` uses search lat/lng + `radius: 10` when active; clear (×) button resets to user location; map center follows search location
- **API client**: `searchAutocomplete()`, `getSearchPlaceDetails()` added

### i18n
- 8 new translation keys (en/ar/hi): `search.recentSearches`, `search.clearHistory`, `search.noResults`, `search.noPlacesNearby`, `search.tryDifferent`, `search.recentEmpty`, `search.searchPlaces`, `search.error`

### Tests
- **Backend**: 9 new `test_search.py` tests (all pass)
- **Web**: `searchHistory.test.ts` — 7 cases covering get, add (prepend, dedup, max-10), clear (all pass; 109 total)
- **Mobile**: `searchHistory.test.ts` — 7 equivalent cases with AsyncStorage mock (all pass; 109 total)
- **TypeScript**: `apps/web` passes `tsc --noEmit` with no errors

---

## Add-to-Itinerary Flow + Map View Improvements (2026-02-21)

### Backend
- **New endpoint `POST /groups/{group_code}/places/{place_code}`** — lets any group member atomically append a place to the group's itinerary; returns `{ok, already_exists}`
- **`add_place_to_itinerary()` DB helper** — deduplicating append with `updated_at` bump
- **5 new backend tests** covering member add, duplicate, non-member 403, invalid group/place 404

### Frontend (web)
- **PlaceMapView**: fixed bottom card spacing; replaced bare share icon with `SharePlaceButton`; replaced single "Detail" link with two CTAs: **"View Details"** (always) + **"Add to Itinerary"** (logged-in only)
- **New `AddToGroupSheet`** bottom overlay: multi-select group list, already-in badges, create-group empty state, calls `addPlaceToGroup()` on submit
- **PlaceDetail**: added **Groups section** between Specifications and Reviews (visible when logged in): shows matching groups as cards, "Add to More Groups" button, empty state
- **`addPlaceToGroup()` API client function** added

### Frontend (mobile)
- **HomeScreen**: fixed image bug (was using raw URL, now uses `getFullImageUrl`); replaced "Directions" CTA with **"View Details"** (primary) + **"Add to Itinerary"** (secondary, logged-in only); fixed carousel bottom padding to clear tab bar
- **PlaceDetailScreen**: added same **Groups section** adapted for React Native with `makeStyles(isDark)` tokens
- **New `AddToGroupSheet`** mobile component: slide-up Modal animation pattern from AuthBottomSheet, same logic as web

### i18n
- Added 9 new translation keys (en/ar/hi): `map.viewDetails`, `map.addToItinerary`, `groups.selectGroups`, `groups.addPlace`, `groups.placeAdded`, `groups.placeAlreadyAdded`, `groups.noGroupsYetShort`, `groups.groupsWithPlace`, `groups.addToMoreGroups`

### Tests
- **Backend**: 63 tests pass (`TestAddPlaceToItinerary` class with 5 cases)
- **Web**: 102 Vitest tests pass (new `addToGroup.test.ts` with 4 cases)
- **Mobile**: 4 Jest tests pass (new `addToGroup.test.ts`)
- Web TypeScript typecheck: clean

---

## Data Scraper: Wikipedia Search Relevance Validation (2026-02-21)

### Backend (data_scraper)
- **Fix: irrelevant Wikipedia search results no longer used** — When no OSM `wikipedia` tag is available, the collector falls back to a Wikipedia keyword search. This search can return unrelated articles (e.g. "Al Futtaim Masjid" → "Dubai Marina"). `WikipediaCollector` now calls `_is_article_relevant()` on every search-based result before accepting it.
- **Two-layer relevance check:**
  1. **Token overlap (Jaccard ≥ 0.3)** — normalises both the article title and the place name to token sets, applies synonym mapping (`masjid` → `mosque`, `mandir` → `temple`, etc.) and drops noise words (`al`, `the`, `of`, …). If 30 % or more tokens overlap, the article is accepted.
  2. **Wikidata short description contradiction** — if the place name implies a religious site (mosque, temple, shrine, …) but the article's Wikidata one-liner says "district", "mall", "waterfront", "road", etc., the result is rejected outright.
- **OSM-tag path unaffected** — articles resolved via `tags["wikipedia"]` bypass validation because OSM tags are human-curated and already precise.
- **10 new pytest tests** covering normalisation, synonym mapping, the two validation layers, and the collect()-level skip/accept behaviour.

---

## Data Scraper: Add Alembic Migrations (2026-02-21)

### Backend (data_scraper)
- **Added Alembic migration support** — Mirrors the `server/` pattern: `alembic.ini`, `migrations/env.py`, `run_migrations()` in `session.py`
- **Initial migration `0001_initial`** — Creates all 6 tables (`datalocation`, `scraperrun`, `scrapedplace`, `rawcollectordata`, `geoboundary`, `placetypemapping`) including the new enrichment columns
- **Bootstrap stamp logic** — Existing DBs created via `create_all()` are auto-stamped to head so Alembic doesn't try to re-create tables
- **Startup uses `run_migrations()`** — Replaces `create_db_and_tables()` in `on_startup()`, ensuring schema changes are applied automatically

---

## Data Scraper Restructuring: Multi-Source Enrichment Architecture (2026-02-21)

### Backend (data_scraper)
- **Removed gsheet strategy** — Deleted `scrapers/gsheet.py` and all gsheet references from API, schemas, and dispatcher. The scraper is now gmaps-only for discovery.
- **Collectors package** — New `app/collectors/` with 8 collectors implementing `BaseCollector` ABC:
  - **GmapsCollector** — Enhanced field mask (generativeSummary, phone, parking, payment, accessibility, dogs, children, groups, restroom, outdoor seating, Google Maps URI)
  - **OsmCollector** — Overpass API: amenities, contact, wikipedia/wikidata tags, multilingual names
  - **WikipediaCollector** — REST API: descriptions in en/ar/hi, images, search fallback
  - **WikidataCollector** — Structured data: founding date, heritage status, social media, multilingual labels
  - **KnowledgeGraphCollector** — Google KG Search (free, 100k/day): entity descriptions, schema.org types, images
  - **BestTimeCollector** — Busyness forecasts and peak hours (optional, paid)
  - **FoursquareCollector** — Tips and popularity (optional, paid)
  - **OutscraperCollector** — Extended Google reviews beyond the 5 limit (optional, paid)
- **Pipeline package** — New `app/pipeline/` with enrichment orchestrator, quality assessment, and merger:
  - **quality.py** — Heuristic scoring (source reliability, length, specificity) with optional LLM tie-breaking via Claude Haiku
  - **merger.py** — Priority-based conflict resolution for contact, attributes (boolean True wins), reviews (deduplicated), images (deduplicated)
  - **enrichment.py** — Runs collectors in dependency order (OSM first for tags, then Wikipedia/Wikidata which use those tags)
- **New DB model** — `RawCollectorData` preserves verbatim JSON from each source per place for re-assessment without re-fetching
- **ScrapedPlace enhanced** — Added `enrichment_status`, `description_source`, `description_score` fields
- **Collector registry** — Auto-discovers and orders collectors, env-based availability detection
- **New API endpoints** — `GET /collectors`, `GET /runs/{run_code}/raw-data`, `POST /runs/{run_code}/re-enrich`
- **New dependency** — `anthropic` (optional, for LLM-based description tie-breaking)

### Backend (server)
- **22 new attribute definitions** in `seed_data.json`: contact category (phone, email, socials, google_maps_url), facility category (restroom, drinking water, toilets, internet, outdoor seating, children, groups, parking details, payment options, accessibility details), info category (busyness forecast, peak hours, heritage status, name_ar, name_hi)
- **69 new translation keys** (23 per language: en, ar, hi) for all new attribute labels

### Docs
- Updated `data_scraper/README.md` with new architecture diagram, collector table, and API reference
- Updated `ARCHITECTURE.md` section 8 with collectors, pipeline, and quality assessment documentation

---

## Bug Fixes — Share Link, Place Images, Edit Group Cover (2026-02-21)

### Backend
- **Invalid Date fix** — Replaced `.isoformat() + "Z"` with `.isoformat().replace("+00:00", "Z")` across `groups.py`, `auth.py`, `users.py`, `visitors.py`, and `db/groups.py`. UTC-aware datetimes already emit `+00:00`; appending `Z` produced an invalid ISO string that `new Date()` in the browser could not parse.

### Frontend (web)
- **Place images in itinerary selector** — Wrapped `place.images[0].url` with `getFullImageUrl()` in `PlaceSelector.tsx` so backend-hosted relative URLs resolve correctly.

### Frontend (mobile)
- **Share link crash** — `Share.share({ url: "..." })` on iOS throws when the value is not a valid `http(s)://` URL. Now the `url` field is only included in the share payload when the value is a proper URL; the invite code is still passed as `message` so sharing still works.
- **Place images in itinerary selector** — Same `getFullImageUrl()` fix applied to `PlaceSelector.tsx` on mobile.
- **Edit group cover image** — `coverImageUrl` from the API is a relative URL; it was passed raw into React Native `Image source`. Now wrapped with `getFullImageUrl()` so the existing cover loads correctly on the edit screen.

---

## Group Card UI Enhancement (2026-02-21)

### Frontend (web)
- **Card redesign** — Group list items are now elevated `rounded-2xl` cards with border, shadow on hover, and `opacity-60` dimming for completed groups.
- **2-column desktop grid** — Cards render in a 2-col grid at `md` breakpoint.
- **Cover thumbnail** — Displays 48×48 rounded thumbnail from `cover_image_url`; falls back to a tinted icon circle.
- **Activity dot** — Small green dot with glow shadow appears next to the group name when `last_activity` is within 24 hours.
- **Description line** — Single-line truncated `description` shown below the group name.
- **Level badge borders** — Added colored border to level badges (`border-blue-500/20`, `border-green-500/20`, `border-indigo-500/20`).
- **Progress bar dark glow** — Fill bar gets a dark-mode box-shadow glow (blue or green depending on completion).

### Frontend (mobile)
- **Card redesign** — Group rows are now proper cards: `borderRadius`, `padding`, `borderWidth`, `backgroundColor`, and `tokens.shadow.card` elevation.
- **Cover thumbnail** — Displays 48×48 `ExpoImage` from `cover_image_url`; falls back to a tinted icon circle.
- **Activity dot** — Small green dot with iOS shadow glow appears when `last_activity` is within 24 hours.
- **Description line** — Single-line truncated `description` shown below the group name.
- **Completed card opacity** — Groups at 100% progress get `opacity: 0.6`.
- **Level badge borders** — Added `borderWidth: 1` and color-coded `borderColor` to level badges.
- **New color tokens** — Added `activityGreen` and `activityGreenGlow` to `tokens.colors` in `theme.ts`.

---

## Remove Featured Group Card (2026-02-21)

### Frontend (web)
- Removed featured hero card from `Groups.tsx`; all groups now render as a flat list.

### Frontend (mobile)
- Removed featured hero card from `GroupsScreen.tsx`; all groups now render as a flat list. Deleted all associated `featured*` styles.

---

## Group Detail UI Parity & Image Fixes (2026-02-21)

### Frontend (web)
- **Image fix** — Applied `getFullImageUrl()` to group cover image and place thumbnails in `GroupDetail.tsx` so backend-hosted relative URLs resolve correctly.

### Frontend (mobile)
- **Image fix** — Replaced React Native `Image` with `expo-image` (`ExpoImage`) and wrapped all image URIs with `getFullImageUrl()` in `GroupDetailScreen` (cover image and place thumbnails).
- **Dark mode token compliance** — Added `primaryAlpha`, `primaryAlphaDark`, `goldRank*`, `bronzeRank*`, `silverLight` tokens to `theme.ts`; replaced all hardcoded hex values introduced in `GroupDetailScreen` with token references.
- **Place item redesign** — Added numbered + check-circle indicator per place row (green when self checked in, blue-tinted when others have, grey when none), matching the web layout.
- **Inline avatar chips** — Stacked member initials with check-in count now appear in collapsed place rows (same as web).
- **View Details button** — Expanded place section now shows a "Details" button alongside "Check In", navigating to `PlaceDetailScreen`.
- **Invite link sharing** — Added invite URL row with share button to the Members tab (was missing entirely).
- **Leaderboard colors** — Fixed podium avatar and bar colors: rank 1 = amber/gold, rank 2 = silver/neutral, rank 3 = orange/bronze, matching the web design.
- **Pull-to-refresh** — Added `RefreshControl` to `GroupsScreen` (group list) and `GroupDetailScreen` (group info + checklist); full-screen spinner suppressed during refresh.

---

## Structured Logging, Monitoring & API Versioning (2026-02-21)

### Backend
- **Structured JSON logging** — `server/app/core/logging_config.py` added using `python-json-logger`. Set `LOG_FORMAT=text` for human-readable dev output; defaults to JSON in production. Controlled by `LOG_LEVEL` and `LOG_FORMAT` env vars (added to `config.py`).
- **Per-request UUID tracing** — `server/app/core/request_context.py` stores a UUID4 per request via ContextVar. `X-Request-ID` header is returned on every response; the ID is included in all log entries via `request_id_middleware`.
- **Request timing logging** — `request_timing_middleware` logs `method`, `path`, `status_code`, `duration_ms`, and `request_id` as a structured `request_complete` event for every response.
- **Enhanced `/health` endpoint** — Now checks DB connectivity and returns `{"status": "ok"|"degraded", "db": "ok"|"error"}`.
- **Prometheus metrics** — `GET /metrics` endpoint exposed via `prometheus-fastapi-instrumentator` (excluded from OpenAPI schema). Protect via nginx/firewall in production; scrape with Prometheus, visualise with Grafana.
- **`X-API-Version: 1` response header** — `api_version_header_middleware` appends this header to all responses.
- **`server/app/api/v2/__init__.py`** — Skeleton `api_router_v2` for future v2 routes, with versioning policy documented inline.
- **New packages** — `python-json-logger>=2.0.7`, `prometheus-fastapi-instrumentator>=6.1.0` added to `requirements.txt`.
- **Tests** — `tests/test_request_id.py` (3 tests: header present, valid UUID, distinct across requests); `tests/test_health.py` updated (2 tests: status+db fields).

---

## Code Quality: StrEnums + cn() Migration (2026-02-21)

### Backend
- **`server/app/db/enums.py`** — New centralized module with Python `StrEnum` types: `ReviewSource`, `ImageType`, `GroupRole`, `Theme`, `Units`, `Language`, `Religion`, `AttributeDataType`, `AttributeCategory`, `AppPlatform`, `NotificationType`, `OpenStatus`.
- **`models.py`** — Updated field defaults to use enum values (`GroupRole.MEMBER`, `ImageType.URL`, `ReviewSource.USER`, `Theme.LIGHT/SYSTEM`, `Units.KM`, `Language.EN`).
- **`reviews.py`** — Replaced `"external"` string literals with `ReviewSource.EXTERNAL`.
- **`place_images.py`** — Replaced `"url"` / `"blob"` with `ImageType.URL` / `ImageType.BLOB`.
- **`groups.py`** — Replaced `"admin"` / `"member"` with `GroupRole.ADMIN` / `GroupRole.MEMBER`; `"check_in"` with `NotificationType.CHECK_IN`.
- **`store.py`** — Removed local `Religion = Literal[...]`; imported from enums; replaced theme/language/units string literals with enum values.
- **`places.py`** — Removed local `Religion = Literal[...]`; imported from enums; replaced `"islam"` / `"all"` literals.
- **`i18n.py`** — Replaced `"en"` fallback literals with `Language.EN`.
- **`api/v1/places.py`** — Removed local `Religion`; replaced `OpenStatus` literals, `ReviewSource` literals, `NotificationType.GROUP_CHECK_IN`, and `ImageType.BLOB` check.
- **`api/v1/groups.py`** — Replaced all `"admin"` / `"member"` literals with `GroupRole` values; `"group_joined"` with `NotificationType.GROUP_JOINED`.

### Frontend (web)
- **cn() migration** — Replaced template literal `className` patterns with `cn()` utility calls across 21 files: `Profile.tsx`, `PlaceDetail.tsx`, `FilterSheet.tsx`, `TimingCircle.tsx`, `WriteReview.tsx`, `Layout.tsx`, `AuthModal.tsx`, `PlaceOpeningHours.tsx`, `CheckInsList.tsx`, `Groups.tsx`, `PlaceSpecificationsGrid.tsx`, `Register.tsx`, `Notifications.tsx`, `FilterChip.tsx`, `HomeHeader.tsx`, `PrimaryButton.tsx`, `SearchBar.tsx`, `CreateGroup.tsx`, `EditGroup.tsx`, `GroupDetail.tsx`, `PlaceSelector.tsx`. Added `import { cn } from '@/lib/utils/cn'` to each file.

---

## Success Feedback Popup (2026-02-21)

### Backend
- **Translation keys** — Added 19 `feedback.*` keys (en, ar, hi) in `server/app/db/seed_data.json`: `checkedIn`, `favoriteAdded`, `favoriteRemoved`, `reviewSubmitted`, `reviewUpdated`, `reviewDeleted`, `groupCreated`, `groupJoined`, `groupLeft`, `groupDeleted`, `profileUpdated`, `groupCheckedIn`, `memberRemoved`, `roleUpdated`, `noteSaved`, `noteDeleted`, `groupUpdated`, `coverUpdated`, `error`.

### Frontend (web)
- **`FeedbackPopup` component** (`apps/web/src/components/common/FeedbackPopup.tsx`) — Centered overlay using framer-motion `AnimatePresence`. SVG path-draw animation (checkmark / X), dark-mode aware card, `z-[3001]` above modals.
- **`FeedbackProvider` + `useFeedback`** (`apps/web/src/app/providers.tsx`) — Context providing `showSuccess(msg)` and `showError(msg)`. Auto-dismisses after 2.5 s; calling again replaces the current popup.
- **`App.tsx`** — `FeedbackProvider` inserted inside `I18nReadyGate`, wrapping `LocationProvider`.
- **Screen integration** — `useFeedback` wired into: `PlaceDetail` (check-in, favorite toggle, delete review), `Favorites` (remove favorite), `WriteReview` (submit/update), `EditProfile`, `CreateGroup` (errors), `JoinGroup`, `GroupDetail` (leave, delete, remove member, role update, add/delete note), `EditGroup`, `GroupCheckInModal`. Replaced all `alert()` calls.
- **Pure logic utility** (`apps/web/src/lib/utils/feedbackLogic.ts`) — `createFeedbackStateLogic()` for testing without React.
- **Tests** — 6 new Vitest tests in `feedbackPopup.test.ts` covering success state, error state, auto-dismiss timing, replacement behavior, and initial state.

### Frontend (mobile)
- **`FeedbackPopup` component** (`apps/mobile/src/components/common/FeedbackPopup.tsx`) — `Modal` with `transparent`, `Animated` spring scale + opacity for backdrop and card, `MaterialIcons` icon with scale animation, haptic feedback via `expo-haptics`.
- **`FeedbackProvider` + `useFeedback`** (`apps/mobile/src/app/providers.tsx`) — Same API as web: `showSuccess(msg)` / `showError(msg)`, 2.5 s auto-dismiss.
- **`App.tsx`** — `FeedbackProvider` inserted inside `AuthBottomSheetProvider`, wrapping `AuthGate`.
- **Screen integration** — `useFeedback` wired into: `PlaceDetailScreen` (check-in, favorite toggle), `PlaceReviewsList` (delete review), `FavoritesScreen` (remove), `WriteReviewScreen` (submit/update), `EditProfileScreen`, `CreateGroupScreen` (errors), `JoinGroupScreen`, `GroupDetailScreen` (leave, delete, remove member, role toggle, add/delete note), `EditGroupScreen`, `GroupCheckInSheet`. Removed `Alert.alert()` error calls where replaced.
- **Pure logic utility** (`apps/mobile/src/lib/utils/feedbackLogic.ts`) — `createFeedbackStateLogic()` for testing without native dependencies.
- **Tests** — 6 new Jest tests in `feedbackPopup.test.ts` mirroring web coverage.

---

## Force Update System (2026-02-21)

### Backend
- **Client context middleware** — New `client_context_middleware` extracts `X-Content-Type`, `X-App-Type`, `X-Platform`, `X-App-Version` headers on every request and stores them in a `ContextVar` (`server/app/core/client_context.py`).
- **Hard-update middleware** — `hard_update_middleware` returns HTTP 426 Upgrade Required for mobile app clients (`X-App-Type: app`) running below `MIN_APP_VERSION_HARD`. Response includes `detail`, `min_version`, and `store_url`.
- **`GET /api/v1/app-version`** — New unauthenticated endpoint returning `min_version_soft`, `min_version_hard`, `latest_version`, and `store_url` per platform. Reads from `AppVersionConfig` DB table with env-var fallback.
- **`AppVersionConfig` model** — New SQLModel table for per-platform (`ios`, `android`) version requirements. Editable at runtime without redeployment.
- **Migration 0006** — Adds `appversionconfig` table.
- **Translation keys** — Added `update.softBannerTitle`, `update.softBannerMessage`, `update.softBannerButton`, `update.hardTitle`, `update.hardMessage`, `update.hardButton` in all three languages (en, ar, hi).
- **Tests** — 17 new backend tests covering semver parsing, middleware context, hard-update block/pass conditions, and app-version endpoint (env fallback + DB row).

### Frontend (mobile)
- **Client headers** — All API calls now include `X-Content-Type: mobile`, `X-App-Type: app`, `X-Platform: ios|android`, `X-App-Version: <version>`.
- **426 handling** — `authFetch` detects HTTP 426 and calls a registered `triggerForceUpdate` callback.
- **`UpdateProvider`** (`apps/mobile/src/lib/updateContext.tsx`) — React context holding `forceUpdate`/`softUpdate` state with `triggerForceUpdate`, `triggerSoftUpdate`, and `dismissSoftUpdate` actions.
- **`ForceUpdateModal`** — Full-screen blocking modal rendered above the navigation container; links to App Store / Play Store via `Linking.openURL`. No dismiss option.
- **`UpdateBanner`** — Dismissable banner shown at the top of HomeScreen when soft update is available.
- **Startup version check** — On mount, `UpdateSetup` (in `App.tsx`) calls `GET /api/v1/app-version` and triggers the soft-update banner if current version < `min_version_soft`.
- **Tests** — 14 new mobile tests for `parseSemver`, `versionMeetsMinimum`, `shouldSoftUpdate`, `shouldHardUpdate`.

### Frontend (web)
- **Client headers** — `clientHeaders()` added to web API client. Every request includes `X-Content-Type: mobile|desktop` (UA-detected), `X-App-Type: web`, `X-Platform: web`. No force-update UI — web always serves the latest bundle.
- **Tests** — 8 new web tests for `clientHeaders()` covering desktop UA, mobile UA, and Android UA detection.

### Docs
- **ARCHITECTURE.md** — New section 9 documenting client headers and force update mechanism.
- **PRODUCTION.md** — Added `MIN_APP_VERSION_SOFT`, `MIN_APP_VERSION_HARD`, `LATEST_APP_VERSION`, `APP_STORE_URL_IOS`, `APP_STORE_URL_ANDROID` env vars.

---

## Mobile Group Creation UX Fixes (2026-02-20)

### Backend
- **`include_checkins` param** — `GET /api/v1/places` now accepts `include_checkins=true` to return `total_checkins_count` per place via bulk query.

### Frontend (mobile)
- **DatePicker Cancel/Done** — iOS date pickers now show Cancel/Done toolbar buttons. Cancel reverts to previous value. Opening one picker auto-dismisses the other. Applied to both CreateGroup and EditGroup screens.
- **Step indicator centered** — Removed `flex: 1` from step wrappers; dots are now properly centered with fixed-width connecting lines.
- **Sticky footer buttons** — Back/Next/Submit buttons moved outside `ScrollView` into a fixed footer bar with top border, so they stay visible when content scrolls.
- **Place pagination** — PlaceSelector loads 10 places at a time with infinite scroll (`onEndReached`). Search resets cursor and re-fetches. Places step uses PlaceSelector's FlatList directly (no outer ScrollView nesting).
- **Distance + check-in count** — Uses `expo-location` for user position; passes `lat`, `lng`, `sort: proximity`, `include_checkins: true` to API. Place cards show distance and check-in count below address.

### Frontend (web)
- **Types parity** — Added `include_checkins` to `GetPlacesParams` and `total_checkins_count` to `Place` interface.

### Tests
- 3 new backend tests for `include_checkins` param (default false, true returns field, actual check-in count).

---

## Group UX Overhaul (2026-02-20)

### Backend
- **Cover image upload** — New `POST /api/v1/groups/upload-cover` endpoint accepts JPEG/PNG/WebP (max 5 MB), resizes to 1200 px width, compresses to 85 % JPEG, stores blob in new `GroupCoverImage` model. Served via `GET /api/v1/groups/cover/{image_code}` with 1-year cache header.
- **Migration** — `0005_group_cover_image.py` creates `groupcoverimage` table.
- **Translations** — Added 10 new i18n keys (`groups.optional`, `groups.nameRequired`, `groups.addCoverPhoto`, `groups.changeCoverPhoto`, `groups.removeCoverPhoto`, `groups.manageItinerary`, `groups.writeNote`, `groups.chooseFromLibrary`, `groups.takePhoto`, `groups.saveItinerary`) in en/ar/hi. Updated `groups.coverImage` label from "Cover Image URL" to "Cover Photo".

### Frontend (web)
- **Create Group** — Replaced cover image URL text field with hero image picker (dashed placeholder → file picker → preview with edit/remove overlay). Replaced raw date inputs with styled fields with calendar icons. Added form validation (name required, red border + error message). Optional field labels show "(Optional)" suffix.
- **Place selector** — Removed religion filter pills. Replaced checkbox list with place cards (image + name + address) with selected state (blue border, checkmark badge, `active:scale-[0.98]` press feedback). Selected places shown as reorderable chips.
- **Group Detail** — Tab bar now uses Material Icons per tab with animated sliding indicator via `framer-motion` `layoutId`. Notes input redesigned as WhatsApp-style rounded input with circular send button.
- **Edit Group** — Replaced inline PlaceSelector with cover image picker, native date pickers, and "Manage Itinerary" button linking to new `/groups/:groupCode/edit-places` page.
- **Edit Group Places** — New full-screen page (`EditGroupPlaces.tsx`) for managing group itinerary with PlaceSelector, save button in header.

### Frontend (mobile)
- **Create Group** — Cover image picker using `expo-image-picker` (choose from library / take photo). Native date pickers via `@react-native-community/datetimepicker`. Form validation with error state. Optional field labels.
- **Place selector** — Removed religion filter pills. Place cards with image, name, address, and checkmark badge. Selected places as reorderable chips with up/down/remove buttons.
- **Group Detail** — Tab bar with Material Icons and rounded pill-style active indicator. Notes input as WhatsApp-style rounded field with circular send button using send icon. Fixed "Invalid Date" in member list by guarding against null/invalid `joined_at`.
- **Edit Group** — Replaced inline PlaceSelector and URL text field with cover image picker, native date pickers, and "Manage Itinerary" button. New `EditGroupPlacesScreen` for full-screen itinerary editing.
- **Navigation** — Added `EditGroupPlaces` route to `RootStackParamList` and stack navigator.

### Tests
- `server/tests/test_group_cover_upload.py` — Upload endpoint tests (valid images, invalid types, oversized files, auth required, image serving).
- `apps/web/src/__tests__/createGroup.test.ts` — Group name validation tests.
- `apps/mobile/src/__tests__/createGroup.test.ts` — Group name validation tests.

---

## UI Fixes & Polish (2026-02-20)

### Frontend (web)
- **Carousel fix** — Corrected `translateX` formula in `PlaceCard` and `PlaceDetail` hero: was `-${idx * 100}%` (relative to strip width = N × container), now `-${idx * (100/N)}%` so each step moves exactly one container width. Auto-swipe and drag-to-swipe now work correctly on desktop and mobile web.
- **Groups page** — Removed duplicate "Create group" button from the empty state; the floating `+` FAB is the sole entry point. Replaced colored shadow utilities (`shadow-blue-100/200`) on the featured group card, FAB, and visitor register button with clean neutral shadows (`shadow-md`, `shadow-lg`) to eliminate the blue glow artifact in light and dark mode.

### Frontend (mobile)
- **Carousel fix** — Replaced `FlatList` (with `width: '100%'` items that collapsed to 0 px in horizontal mode) with `ScrollView` + `onLayout` in both `PlaceCard` and `PlaceDetailScreen` hero. Images now render correctly at the measured container width; `scrollTo({ x: idx * width })` drives auto-swipe. The FlatList scroll-position indicator is also gone.
- **Carousel dot indicators removed** — Removed the dot/dash position overlay from `PlaceCard` and `PlaceDetailScreen` hero on both mobile app and mobile web.
- **Groups screen** — Removed duplicate "Create group" button from the empty state; the floating `+` FAB is the sole entry point.

---

## P2 Features: Photo Gallery, Distance Units & Social Sharing (2026-02-20)

### Backend
- **OG share endpoint** — New `GET /share/places/{place_code}` route (no auth required) returns an HTML page with Open Graph meta tags (`og:title`, `og:description`, `og:image`, `og:url`, `twitter:card`) and a JS redirect to the SPA. Registered at `/share` prefix outside `/api/v1/`.
- **Config** — Added `FRONTEND_URL` env var (default `http://localhost:5173`) to `config.py` for OG redirect target.
- **Tests** — Added `server/tests/test_share.py` (2 tests: 200 HTML with `og:title`, 404 for bad code).

### Frontend (web)
- **Place photo gallery** — `PlaceCard.tsx` (regular variant): `IntersectionObserver` gates auto-swipe (3 s interval); `onMouseEnter/Leave` also activates on desktop; CSS flex strip with `translateX` animation; drag-to-swipe (≥40 px threshold) with `didDragRef` preventing spurious `<Link>` navigation; dot indicators.
- **Place photo gallery** — `PlaceDetail.tsx` hero: horizontal flex strip auto-swipes every 3 s; drag handlers (`onMouseDown/Move/Up`); dot indicators overlay at bottom.
- **Distance units** — Added `formatDistance(km, units)` to `place-utils.ts` (km/m or mi/ft); `ThemeProvider` extended with `units` + `setUnits` (persisted to `localStorage`); Profile page gains km/mi toggle row using `settings.distanceUnits` i18n key; `PlaceCard` and `PlaceDetail` now pass `units` to `formatDistance`.
- **Social sharing** — `SharePlaceButton.tsx` now builds the share URL from `${API_BASE}/share/places/${placeCode}` for rich OG preview.
- **Group sharing** — Removed redundant header share icon from `GroupDetail.tsx`; replaced invite "Copy" button with native "Share" button using `shareUrl(group.name, inviteUrl)`.
- **Tests** — Extended `apps/web/src/__tests__/utils.test.ts` with 5 `formatDistance` cases (km/m/mi/ft).

### Frontend (mobile)
- **Place photo gallery** — `PlaceCard.tsx` (regular variant): `ScrollView` + `onLayout` carousel; accepts `isActive` prop; auto-swipe timer (`setInterval` every 3 s) calls `scrollTo`; `onMomentumScrollEnd` syncs index state.
- **Place photo gallery** — `PlaceDetailScreen.tsx` hero: `ScrollView` + `onLayout` carousel auto-swipes when multiple images; parallax `Animated.Value` still drives container.
- **Active card detection** — `HomeScreen.tsx` and `FavoritesScreen.tsx` use `viewabilityConfig` + `onViewableItemsChanged` to track visible index and pass `isActive={index === activeIndex}` to `PlaceCard`.
- **Distance units** — New `apps/mobile/src/lib/utils/place-utils.ts` with `formatDistance`; `ThemeProvider` extended with `units` + `setUnits` (persisted to `AsyncStorage`); Profile screen gains km/mi toggle pills; `PlaceCard` and `PlaceDetailScreen` use unit-aware distance.
- **Social sharing** — `PlaceDetailScreen.tsx` share now uses `${API_BASE}/share/places/${placeCode}` URL with rating in the title.
- **Group sharing** — Removed header share icon from `GroupDetailScreen.tsx`.
- **Tests** — Extended `apps/mobile/src/__tests__/utils.test.ts` with 5 `formatDistance` cases (km/m/mi/ft).

### Docs
- Added `settings.distanceUnits`, `settings.km`, `settings.miles` translation keys to `seed_data.json` (en/ar/hi).

---

## P1 Roadmap Tasks: Quality, Accessibility & Monitoring (2026-02-20)

### Backend
- **Structured logging** — Replaced all `print()` calls with Python `logging` module across `main.py`, `auth.py`, `places.py`, `seed.py`, `backfill_timezones.py`, and `cleanup_orphaned_images.py`. Configured `logging.basicConfig` in `main.py`. Password reset links now log at `DEBUG` level.
- **Bare except clauses** — Fixed two silent `except Exception: pass` blocks in `auth.py` visitor-merge flows; now log with `logger.warning(..., exc_info=True)`.
- **Alembic downgrade** — Confirmed `downgrade()` implemented in `0001_initial.py` and `0002_add_visitor.py`.

### Frontend (web)
- **i18n** — Removed all hardcoded UI strings: rating labels in `WriteReview.tsx`, notification type labels in `Notifications.tsx`, error boundary strings in `ErrorBoundary.tsx`, weekday labels in `CheckInsList.tsx` (now `Intl.DateTimeFormat` locale-aware), progress level in `Groups.tsx`, share message in `CreateGroup.tsx`. Added 15 new translation keys to `seed_data.json` (en/ar/hi).
- **Dark mode** — Fixed `dark:bg-gray-800` → `dark:bg-dark-surface` in `PlacesMap.tsx`; fixed button class in `ErrorBoundary.tsx` to use `bg-soft-blue/hover:bg-input-border`.
- **Tests** — Added `apps/web/src/__tests__/share.test.ts` (6 tests covering `shareUrl()`: navigator.share, relative URLs, AbortError, clipboard fallback).
- **Accessibility** — `Modal.tsx`: `role="dialog"`, `aria-modal`, `aria-labelledby/useId`, Escape key handler. `Layout.tsx`: skip-to-content link (`sr-only` / focusable) and `id="main-content"` on main element. `ErrorBoundary.tsx`: `role="alert"` and `aria-live="assertive"`.
- **Error tracking** — Installed `@sentry/react`; initialized in `main.tsx` with `VITE_GLITCHTIP_DSN` env var (disabled when unset); `ErrorBoundary.componentDidCatch` calls `Sentry.captureException`. Documented `VITE_GLITCHTIP_DSN` in `.env.example` and `README.md`.

### Frontend (mobile)
- **i18n** — Removed hardcoded relative-time and progress-level strings from `GroupsScreen.tsx`; removed "Something went wrong"/"Try again" from `ErrorBoundary.tsx`. All now use `t()` with existing translation keys + `.replace('{count}', n)` interpolation.
- **Dark mode** — `PlaceCard.tsx` now uses `useTheme()` / dynamic colors for card background, borders, text, rating chip bg, and image fallback.
- **Tests** — Added `apps/mobile/src/__tests__/share.test.ts` (8 tests covering `shareUrl()` and `openDirections()` for iOS/Android).
- **Accessibility** — `PlaceCard.tsx`: added `accessibilityRole="button"` and `accessibilityLabel` to all `TouchableOpacity` elements.
- **Error tracking** — Added GlitchTip/Sentry placeholder comment in `ErrorBoundary.componentDidCatch`; documented native setup in `apps/mobile/README.md`.
- **Offline banner** — Installed `@react-native-community/netinfo`; created `OfflineBanner.tsx` using `useNetInfo()` with dark mode support; wired into `App.tsx`; uses `t('common.noInternet')`.

### Docs
- Added `common.skipToContent` translation key (en/ar/hi) to `seed_data.json`.
- Updated `ROADMAP.md` to mark all completed P1 tasks as `[x]`.

---

## Dark Mode Compliance & UI Polish (2026-02-20)

Full dark mode compliance sweep across all mobile screens and components, plus targeted web UI polish fixes.

### Frontend (web)
- **`Splash.tsx`** — Added `dark:bg-dark-bg`, `dark:text-white`, `dark:text-dark-text-secondary` to content panel and headings.
- **`FilterSheet.tsx`** — Added dark variants to inactive filter option buttons (`dark:border-dark-border dark:bg-dark-surface`), icon containers (`dark:bg-dark-bg dark:text-dark-text-secondary`), radio circles (`dark:border-dark-border`), and clear button (`dark:border-dark-border dark:text-white dark:hover:bg-dark-bg`).
- **`PlaceCard.tsx`** — Added dark variants to rating badge (`dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800/30`) and distance badge border (`dark:border-dark-border`).
- **`Layout.tsx`** — Bottom nav conditionally hidden on non-main pages (`/home`, `/groups`, `/profile`) so it no longer overlaps action buttons on `/places/:code` and similar detail pages.
- **`Favorites.tsx`** — Added back button (`navigate(-1)`); removed redundant "Saved" section label.

### Frontend (mobile)
- **`FilterChip`** — Converted static `StyleSheet` to `makeStyles(isDark)`; chip background/border/label colors now dark-aware.
- **`FilterChipsList`** — Forwards `isDark` prop to `FilterChip` child.
- **`TimingCircle`** — Added `isDark` prop; non-current circle background and border colors are now dark-aware; subtitle uses dark text token.
- **`DeityCircle`** — Added `isDark` prop; circle background, name, and subtitle text all dark-aware.
- **`PlaceTimingsCarousel`** — Added `isDark` prop; dark `sectionTitle` color; forwards `isDark` to `TimingCircle` and `DeityCircle`.
- **`PlaceSpecificationsGrid`** — Converted to `makeStyles(isDark)`; spec card bg/border, label, and value text all dark-aware.
- **`PlaceReviewsList`** — Added `isDark` prop + `makeStyles(isDark)`; review card bg/border, all text colors dark-aware.
- **`ErrorBoundary`** — Class component (can't use hooks); uses `Appearance.getColorScheme()` for runtime dark bg, title/message text, and error icon tint.
- **`SplashScreen`** — Converted to `makeStyles(isDark)` via `useTheme()`; spinner background now uses `darkBg` in dark mode.
- **`EditProfileScreen`** — Converted static `StyleSheet` to `makeStyles(isDark)`; container, inputs, religion row tiles, and all text dark-aware.
- **`ForgotPasswordScreen`** — Converted to `makeStyles(isDark)`; back button, success icon container, input, container background dark-aware.
- **`JoinGroupScreen`** — Converted to `makeStyles(isDark)`; container (was `surfaceTint`), input, preview box, and text dark-aware.
- **`ResetPasswordScreen`** — Converted to `makeStyles(isDark)`; container, inputs, and text colors dark-aware.
- **`PlaceDetailScreen`** — Converted large static `StyleSheet` to `makeStyles(isDark)` so loading/error states render correctly in dark mode; passes `isDark` to `PlaceTimingsCarousel`, `PlaceSpecificationsGrid`, and `PlaceReviewsList`; fixed missing `PlaceTiming`/`PlaceSpecification` type imports.
- **`PlaceCard`** — "Visited" badge and "Check In" button text use `t()` translation keys instead of hardcoded English.
- **`PlaceScorecardRow`** — Rewritten with `isDark` prop and inline dynamic styles for full dark mode support.
- **`FavoritesScreen`** — Removed "Saved" section label; back button restyled to match `PlaceDetailScreen` circle button.

---

## Groups Revamp — Social Itinerary Planner & Tracker (2026-02-19)

Full groups revamp transforming the groups feature into a pilgrimage itinerary planner and tracker with shared checklists, member management, collaborative notes, and progress tracking.

### Backend
- **Schema (migration `0004_groups_revamp`)** — Added `group_code` (nullable FK) to `CheckIn`; added `cover_image_url`, `start_date`, `end_date`, `updated_at` to `Group`; new `GroupPlaceNote` model for per-place collaborative notes.
- **New endpoints** — `DELETE /groups/:code` (admin), `POST /groups/:code/leave`, `DELETE /groups/:code/members/:userCode` (admin), `PATCH /groups/:code/members/:userCode` (role change), `GET/POST /groups/:code/places/:placeCode/notes`, `DELETE /groups/:code/notes/:noteCode`, `GET /groups/:code/checklist`.
- **Checklist endpoint** — Returns ordered itinerary places with per-place check-in status, member avatars, collaborative notes, and aggregate group + personal progress percentages.
- **Group check-in** — `POST /places/:placeCode/check-in` accepts optional `group_code`; validates membership and itinerary inclusion; creates `group_check_in` notifications for other members.
- **New DB modules** — `server/app/db/group_place_notes.py` (CRUD for place notes); `get_check_ins_for_users_at_places()` batch query in `check_ins.py`.
- **Tests** — Added `TestDeleteGroup`, `TestLeaveGroup`, `TestRemoveMember`, `TestUpdateMemberRole`, `TestGroupChecklist`, `TestGroupCheckIn`, `TestUpdateGroupPath`, `TestPlaceNotes` (22 new tests, 58 total in test_groups.py).

### Frontend (web)
- **Types** — Updated `Group` (cover_image_url, start_date, end_date, path_place_codes, updated_at), `GroupMember` (is_creator), `ActivityItem` (note, photo_url, group_code); new `PlaceNote`, `ChecklistCheckIn`, `ChecklistPlace`, `ChecklistResponse`.
- **API client** — Added `deleteGroup`, `leaveGroup`, `removeGroupMember`, `updateMemberRole`, `getGroupChecklist`, `getPlaceNotes`, `addPlaceNote`, `deletePlaceNote`; updated `checkIn` / `createGroup` / `updateGroup` with new fields.
- **`PlaceSelector` component** — Multi-select place picker with search, religion filter chips, ordered selected-places list with reorder (↑↓) and remove buttons.
- **`GroupCheckInModal` component** — Modal for checking in at a specific place within a group's itinerary.
- **`CreateGroup` page** — Rewritten as multi-step wizard: Details → Places (PlaceSelector) → Review, with preserved invite-link success state.
- **`GroupDetail` page** — Rewritten as 4-tab layout (Itinerary, Activity, Leaderboard, Members); itinerary tab shows progress bars, ordered place checklist with expand/collapse, check-in modal, and per-place notes; members tab includes role badges and admin actions.
- **`EditGroup` page** — New admin-only page with PlaceSelector for managing itinerary; routed at `/groups/:groupCode/edit`.
- **Tests** — `groupUtils.ts` utility (getProgressLevel, formatRelativeTime); `groups.test.ts` (11 unit tests).

### Frontend (mobile)
- **Types & API client** — Full parity with web: same type additions and 8 new API functions.
- **`PlaceSelector` component** — FlatList-based place picker with TextInput search, religion filter chips, reorder with ↑↓ buttons.
- **`GroupCheckInSheet` component** — Bottom-sheet modal for group check-in.
- **`CreateGroupScreen`** — Multi-step wizard matching web feature parity.
- **`EditGroupScreen`** — New admin-only screen registered in navigation.
- **`GroupDetailScreen`** — Rewritten with 4-tab layout (Itinerary, Activity, Leaderboard, Members); itinerary tab with progress bars, checklist, GroupCheckInSheet, per-place notes; members tab with role management and leave/delete.
- **Tests** — `groupUtils.ts` utility; `groups.test.ts` (11 unit tests).

### i18n
- Added 36 new translation keys for en/ar/hi covering itinerary, progress, member management, notes, trip dates, and check-in flows.

---

## API Audit — Unused Endpoint Remediation (2026-02-19)

### Frontend (web)
- **`apps/web/src/lib/api/client.ts`** — Already had `refreshToken`, `logoutServer`, `authFetch` interceptor, and `updateGroup`; confirmed complete.
- **`apps/web/src/__tests__/client.test.ts`** — New: tests for `refreshToken` (happy path + error), `logoutServer` (happy path + network failure + server error), `updateGroup` (method, return value, Authorization header, error detail, fallback error).

### Frontend (mobile)
- **`apps/mobile/src/lib/api/client.ts`** — Added `refreshToken()`, `logoutServer()`, and `authFetch()` 401-retry interceptor (mirrors web). Migrated all authenticated `fetch()` calls to `authFetch()`. Added `updateGroup()` for `PATCH /api/v1/groups/{group_code}`.
- **`apps/mobile/src/app/providers.tsx`** — `logout()` now calls `api.logoutServer()` before clearing AsyncStorage, ensuring the refresh token is revoked server-side on sign-out.
- **`apps/mobile/src/__tests__/client.test.ts`** — New: tests for `refreshToken`, `logoutServer`, and `updateGroup` (same coverage as web).

## Timezone-aware datetime columns (2026-02-19)

### Backend
- **`server/app/db/models.py`** — Added `_UTCAwareDateTime` SQLAlchemy `TypeDecorator`. It wraps `DateTime(timezone=True)` (→ `TIMESTAMPTZ` in PostgreSQL) and re-attaches `UTC` on read for SQLite, so every datetime value loaded from the DB is timezone-aware. All 17 datetime columns across 10 models migrated to use the new `_TSTZ()` helper.
- **`server/app/db/store.py`** — Removed `.replace(tzinfo=None)` workarounds from `consume_password_reset` and `consume_refresh_token`; comparisons now work correctly as `aware < aware`.
- **`server/migrations/versions/0003_timestamptz_datetimes.py`** — New Alembic migration: alters all 19 datetime columns from `TIMESTAMP` to `TIMESTAMPTZ` in PostgreSQL using `AT TIME ZONE 'UTC'` CAST; skipped for SQLite (no-op dialect guard).

### Docs
- **`CLAUDE.md`** — Added rule §8 "Datetime Columns" specifying that every new or modified datetime column must use `sa_column=_TSTZ(...)`, with rationale and examples.

---

## P0 Critical Fixes (2026-02-19)

### Backend
- **`server/app/core/security.py`** — Replaced deprecated `datetime.utcnow()` with `datetime.now(UTC)` in JWT expiry computation. Added `UTC` to import.
- **`server/app/db/store.py`** — Replaced all `datetime.utcnow()` with `datetime.now(UTC)`. Added `UTC` import. For comparisons against DB-stored naive datetimes (SQLite compatibility), used `.replace(tzinfo=None)` to produce a naive UTC timestamp.
- **`server/app/db/check_ins.py`** — Replaced `datetime.utcnow()` with `datetime.now(UTC)`. Added `get_check_ins_for_users(user_codes, session)` batch query to eliminate N+1 in group listing.
- **`server/app/db/notifications.py`** — Replaced `datetime.utcnow()` with `datetime.now(UTC)`.
- **`server/app/db/models.py`** — Replaced `default_factory=datetime.utcnow` with `default_factory=lambda: datetime.now(UTC)` on all model timestamp fields.
- **`server/app/db/review_images.py`** — Replaced `datetime.utcnow()` with `datetime.now(UTC)`. Added `get_review_images_bulk(review_codes, session)` to batch-fetch review images in a single query.
- **`server/app/api/v1/auth.py`** — Replaced `datetime.utcnow()` with `datetime.now(UTC)` for password-reset expiry timestamp.
- **`server/app/main.py`** — Replaced `datetime.utcnow()` with `datetime.now(UTC)` in error-logging timestamp.
- **`server/app/db/groups.py`** — Added `get_members_bulk(group_codes, session)` to batch-fetch group members across all groups in a single query, eliminating N+1 in group listing.
- **`server/app/db/places.py`** — Added `get_places_by_codes(place_codes, session)` to batch-fetch multiple places in a single query.
- **`server/app/api/v1/groups.py`** — Refactored `list_groups` to use batch queries: fetches all members, all check-ins, and all path places in 3 queries total instead of 3+ queries per group, eliminating the N+1 pattern.
- **`server/app/api/v1/users.py`** — Refactored `get_my_favorites` to use `get_places_by_codes` + `get_images_bulk`, eliminating per-place individual queries.
- **`server/app/api/v1/places.py`** — Refactored `get_place_reviews` to use `get_review_images_bulk`, fetching all review images in one query instead of one per review. Removed the stub `DELETE /{place_code}` endpoint (was returning 501 Not Implemented and had no usages).
- **`server/tests/test_store.py`**, **`server/tests/test_auth_extended.py`**, **`server/tests/test_review_images.py`** — Updated to use `datetime.now(UTC)` instead of `datetime.utcnow()`.

---

## P4 Coverage 85% (2026-02-18)

### Backend
- **`server/.coveragerc`** — Raised `fail_under` 60 → 85.
- **`data_scraper/.coveragerc`** — Raised `fail_under` 60 → 85; added `omit` section to exclude untestable external-API scraper files.
- **`.github/workflows/tests.yml`** — Added `--cov=app --cov-report=term-missing` to both pytest CI steps; added `test-web` (Vitest) and `test-mobile` (Jest) jobs.
- **`server/tests/test_groups.py`** — New: full CRUD + social flow (create, list, get, update, join, invite, members, leaderboard, activity) covering `app/api/v1/groups.py` and `app/db/groups.py`.
- **`server/tests/test_groups_db_extra.py`** — New: DB-layer tests for `add_member`, `get_members`, `get_leaderboard`, `get_group_progress`, `get_activity`.
- **`server/tests/test_place_timings.py`** — New: `build_timings()` tested for Islam (prayer times), Christianity (service times), Hinduism (deities), and UTC fallback.
- **`server/tests/test_place_specifications.py`** — New: `build_specifications()` with mocked attribute definitions.
- **`server/tests/test_place_images.py`** — New: `add_image_url`, `set_images_from_urls`, `get_images`, `get_images_bulk`, `get_image_by_id`.
- **`server/tests/test_review_images.py`** — New: attach images to review, get review images, orphan cleanup (old/recent/attached).
- **`server/tests/test_reviews_api_extra.py`** — New: upload-photo endpoint (PIL JPEG/PNG), get-image endpoint, invalid type/size/dimension cases.
- **`server/tests/test_reviews_db_extra.py`** — New: external reviews, upsert, source filter, bulk aggregate ratings.
- **`data_scraper/tests/conftest.py`** — New: in-memory SQLite `test_engine`, `db_session`, `client`, and `error_client` fixtures.
- **`data_scraper/tests/test_scraper_api.py`** — New: full API coverage — data-locations (gsheet/gmaps), scraper runs (create/get/view/sync/cancel), place-type-mappings (CRUD + filters), health endpoint, exception handlers.
- **`data_scraper/tests/test_normalize_extended.py`** — New: extended pure-function tests for `normalize_to_24h`, `clean_address`, `process_weekly_hours`.

### Frontend (web)
- **`apps/web/vitest.config.ts`** — Raised all four coverage thresholds 60 → 85.
- **`apps/web/src/__tests__/imageUpload.test.ts`** — New: `validateImageFile` (type/size checks) + `compressImage` (canvas mocks — normal size, resize, ctx-null, toBlob-null, img-error, custom maxWidth).
- **`apps/web/src/__tests__/theme.test.ts`** — New: `applyTheme` (dark/light/system + localStorage), `getStoredTheme` (valid/invalid/missing), `initTheme` (applies stored theme, registers matchMedia listener). Uses in-memory localStorage mock to work with jsdom 28.

### Frontend (mobile)
- **`apps/mobile/jest.config.js`** — Raised all four coverage thresholds 60 → 85.
- **`apps/mobile/src/__tests__/imageUpload.test.ts`** — New: `validateImage` (size/dimension bounds) + `pickImages` (permission denied, cancel, assets mapped, selectionLimit) + `compressImage` (no resize, resize, quality param). Uses `jest.mock` with inline `jest.fn()` for hoisting-safe Expo mocks.
- **`apps/mobile/src/__tests__/mapBuilder.test.ts`** — New: `formatDistance` (m/km formatting, rounding) + `buildMapHtml` (center coords, Leaflet CDN, markers JSON, place name, open status).

---

## P3 Code Quality (2026-02-18)

### Backend
- **`server/app/api/deps.py`** — Added return type annotations to `get_current_user` (→ `User`) and `get_optional_user` (→ `User | None`). Added `UserDep` and `OptionalUserDep` type aliases.
- **`server/app/api/v1/users.py`, `reviews.py`, `notifications.py`, `groups.py`, `places.py`** — Replaced all 28 `Annotated[Any, Depends(get_current_user)]` occurrences with `UserDep`/`OptionalUserDep`. Removed unused `Any` and `Depends` imports.
- **`server/app/main.py`** — Added `openapi_tags` metadata for all 8 tag groups (auth, users, places, reviews, groups, notifications, i18n, visitors) and an expanded API description with auth/rate-limiting/identifier docs.
- **`server/app/api/v1/auth.py`** — Added `summary`, response error schemas (400/401/422/429), and docstrings to `/register`, `/login`, `/forgot-password`, `/reset-password`.
- **`server/app/models/schemas.py`** — Added `Field(description=...)` and `model_config json_schema_extra` examples to `RegisterBody`, `LoginBody`, `AuthResponse`, and `UserResponse`. Imported `ConfigDict` and `Field` from pydantic.
- **`server/requirements.txt`** — Added `pytest-cov>=5.0.0` and `ruff>=0.3.0`.
- **`server/pytest.ini`** — Added `--tb=short` to `addopts` and coverage usage comment.
- **`server/.coveragerc`** — New file: coverage config with `fail_under = 60`, HTML+XML reporters, source=`app`.
- **`server/pyproject.toml`** — New file: Ruff configuration (E, W, F, I, B, C4, UP rules; line-length 100).
- **`data_scraper/requirements.txt`** — Added `pytest-cov>=5.0.0` and `ruff>=0.3.0`.
- **`data_scraper/pytest.ini`** — Added `--tb=short` and coverage usage comment.
- **`data_scraper/.coveragerc`** — New file: coverage config with `fail_under = 60`.
- **`data_scraper/pyproject.toml`** — New file: Ruff configuration.

### Frontend (web)
- **`apps/web/src/__tests__/utils.test.ts`** — New: 13 tests for `cn()` utility (all input types, nesting, falsy values) and `crowdColorClass()`.
- **`apps/web/src/__tests__/imageUtils.test.ts`** — New: 3 tests for `getFullImageUrl()` (undefined, external URL, relative path).
- **`apps/web/vitest.config.ts`** — New: Vitest config with jsdom environment, `@/` path alias, v8 coverage provider, 60% threshold.
- **`apps/web/src/test/setup.ts`** — New: imports `@testing-library/jest-dom` for Vitest.
- **`apps/web/eslint.config.js`** — New: ESLint flat config with TypeScript, React, React Hooks, React Refresh, and Prettier rules.
- **`apps/web/src/lib/api/client.ts`** — Fixed `r: any` type in place list map to `Place | [Place, number]`.
- **`apps/web/package.json`** — Added `test`, `test:watch`, `test:coverage`, `lint`, `lint:fix`, `format`, `format:check` scripts. Added `vitest`, `@vitest/coverage-v8`, testing libraries, ESLint, Prettier dev dependencies.

### Frontend (mobile)
- **`apps/mobile/src/__tests__/utils.test.ts`** — New: 10 tests for `crowdColor()`, `getFullImageUrl()`, `ROUTES` constants, and storage keys.
- **`apps/mobile/jest.config.js`** — New: Jest config with jest-expo preset, AsyncStorage mock, expo winter runtime mock (`^expo/src/winter$`), 60% coverage threshold.
- **`apps/mobile/src/test/setup.ts`** — New: mocks for expo-constants and expo-haptics.
- **`apps/mobile/src/test/__mocks__/expo-winter.js`** — New: empty mock preventing expo winter runtime from loading in Jest (avoids import.meta incompatibility).
- **`apps/mobile/eslint.config.js`** — New: ESLint flat config with TypeScript, React, React Hooks, and Prettier rules.
- **`apps/mobile/src/components/places/FilterChipsList.tsx`** — Fixed `value?: any` callback param to `value?: string | boolean`.
- **`apps/mobile/package.json`** — Added test/lint/format scripts. Added jest, jest-expo, ESLint, Prettier dev dependencies.

### Docs
- **`ROADMAP.md`** — Marked 7 Code Quality tasks as complete.
- **`.prettierrc`** — New: shared Prettier config (singleQuote, trailingComma all, printWidth 100, LF).
- **`.pre-commit-config.yaml`** — New: pre-commit hooks for trailing-whitespace, end-of-file-fixer, merge-conflict detection, YAML/JSON validation, Ruff, ESLint, Prettier.
- **`scripts/gen-api-types.mjs`** — New: script to generate `api-generated.d.ts` in both apps from the running server's OpenAPI spec.
- **`package.json`** (root) — Added `gen:types` script and `openapi-typescript` dev dependency.

---

## Mobile UI Fixes + Dynamic Password Validation (2026-02-18)

### Backend
- **`server/app/api/v1/auth.py`** — Added `GET /api/v1/auth/field-rules` endpoint returning structured registration validation rules (min_length 8, require_uppercase, require_lowercase, require_digit) without authentication.
- **`server/app/db/seed_data.json`** — Fixed `auth.passwordMinLength` (was "6 characters", now "8 characters") across en/ar/hi. Added `auth.passwordRuleMinLength`, `auth.passwordRuleUppercase`, `auth.passwordRuleLowercase`, `auth.passwordRuleDigit` translation keys for all three languages.
- **`server/tests/test_auth.py`** — Added `TestFieldRules` class with 5 tests covering the new endpoint.

### Frontend (web)
- **`apps/web/src/lib/api/client.ts`** — Added `getFieldRules()` function + `PasswordRule`, `FieldRule`, `FieldRulesResponse` types.
- **`apps/web/src/app/pages/Register.tsx`** — Fetches field rules on mount; shows per-rule real-time hints below the password field (visible on focus, green tick when each rule is satisfied). Fixed client-side minLength guard from 6 → 8. Falls back to hardcoded defaults if API unavailable.

### Frontend (mobile)
- **`apps/mobile/src/lib/api/client.ts`** — Added `getFieldRules()` + `PasswordRule`/`FieldRule`/`FieldRulesResponse` types.
- **`apps/mobile/src/app/screens/GroupsScreen.tsx`** — Removed notification bell icon and `navToNotifications`; added full dark mode via `makeStyles(isDark)`.
- **`apps/mobile/src/app/screens/CreateGroupScreen.tsx`** — Replaced text back button with circular `MaterialIcons arrow-back` button matching the NotificationsScreen style; added full dark mode.
- **`apps/mobile/src/app/screens/CheckInsListScreen.tsx`** — Same circular back button upgrade; added full dark mode throughout all cards and calendar.
- **`apps/mobile/src/app/screens/FavoritesScreen.tsx`** — Added conditional circular back button in the FlatList header (visible only when `stackNav.canGoBack()`).
- **`apps/mobile/src/app/screens/PlaceDetailScreen.tsx`** — Added `useTheme`; applied dark-mode colours to card background, footer, story/description text, opening-hours card.
- **`apps/mobile/src/app/screens/WriteReviewScreen.tsx`** — Full dark mode via `makeStyles(isDark)` for container, header, text, toggle, photo controls, and success modal.
- **`apps/mobile/src/app/screens/RegisterScreen.tsx`** — Fetches field rules on mount; shows per-rule real-time hints on password field focus; fixed minLength guard from 6 → 8.

---

## Visitor Identity, Auth-Gating & Profile Redesign (2026-02-18)

### Backend

- **`server/app/db/models.py`** — Added `Visitor` and `VisitorSettings` SQLModel tables (visitor_code PK, theme/units/language/religions fields with defaults).
- **`server/app/db/store.py`** — Added `create_visitor`, `get_visitor`, `get_visitor_settings`, `update_visitor_settings`, `touch_visitor`, and `merge_visitor_into_user` store functions.
- **`server/app/models/schemas.py`** — Added `VisitorResponse`, `VisitorSettingsResponse`, `VisitorSettingsBody`. Updated `LoginBody` and `RegisterBody` to accept optional `visitor_code` for settings merge on auth upgrade.
- **`server/app/api/v1/visitors.py`** — New router: `POST /api/v1/visitors` (create), `GET /api/v1/visitors/{code}/settings`, `PATCH /api/v1/visitors/{code}/settings`.
- **`server/app/api/v1/auth.py`** — On login and register, if `visitor_code` is present, merges visitor settings into the new/existing user's settings then deletes the visitor record.
- **`server/app/db/seed_data.json`** — Added 7 translation keys across en/ar/hi: `visitor.loginRequired`, `visitor.loginRequiredDesc`, `visitor.createAccount`, `profile.logIn`, `groups.loginRequired`, `groups.loginRequiredDesc`, `auth.orContinueAsVisitor`.
- **`server/tests/test_visitors.py`** — New test file: create visitor, get/update settings, 404 for unknown, settings merge on register/login.

### Frontend (web)

- **`apps/web/src/lib/types/users.ts`** — Added `Visitor` interface.
- **`apps/web/src/lib/api/client.ts`** — Added `createVisitor`, `getVisitorSettings`, `updateVisitorSettings` (unauthenticated). Updated `LoginBody`/`RegisterBody` to accept `visitor_code`.
- **`apps/web/src/components/auth/AuthModal.tsx`** — New compact login/register modal with tab switcher; dark mode compliant.
- **`apps/web/src/components/auth/AuthGateProvider.tsx`** — New global context provider: `openAuthGate(callback, promptKey?)` — stores pending callback, opens `AuthModal`, calls callback after successful auth.
- **`apps/web/src/lib/hooks/useAuthRequired.ts`** — New hook: `requireAuth(callback, promptKey?)` wraps actions with auth-gate.
- **`apps/web/src/app/providers.tsx`** — `AuthProvider` now inits/clears visitor code via `POST /api/v1/visitors`, passes `visitor_code` on login/register, re-inits on logout. `I18nProvider` syncs language to visitor settings.
- **`apps/web/src/app/pages/Profile.tsx`** — Removed `LoginLanding` splash. Visitors see greeting card + preferences + login/create-account buttons; authenticated users see stats, account section, and logout.
- **`apps/web/src/app/pages/Register.tsx`** — Removed religion chip selector and post-registration `updateSettings` call.
- **`apps/web/src/app/pages/Login.tsx`** — Added back/close button.
- **`apps/web/src/app/pages/Groups.tsx`** — Visitors see a login CTA empty state instead of the groups list.
- **`apps/web/src/app/pages/PlaceDetail.tsx`** — Check-in and favorite actions now wrapped with `requireAuth()`; visitors are prompted to log in before the action fires.
- **`apps/web/src/app/routes.tsx`** — Removed `ProtectedRoute` from `/groups` route.

### Frontend (mobile)

- **`apps/mobile/src/lib/types/users.ts`** — Added `Visitor` interface.
- **`apps/mobile/src/lib/api/client.ts`** — Added `createVisitor`, `getVisitorSettings`, `updateVisitorSettings`.
- **`apps/mobile/src/lib/hooks/useAuthRequired.ts`** — New hook: `requireAuth(callback, promptKey?)`.
- **`apps/mobile/src/components/auth/AuthBottomSheet.tsx`** — New `AuthBottomSheetProvider` + `useAuthGate` hook using `@gorhom/bottom-sheet`. Compact login/register tab switcher; pending callback fired after successful auth.
- **`apps/mobile/src/app/providers.tsx`** — `AuthProvider` inits visitor code via AsyncStorage + `POST /api/v1/visitors`, passes `visitor_code` on login/register, re-inits on logout. `I18nProvider` syncs language to visitor settings via `VISITOR_KEY`.
- **`apps/mobile/src/app/screens/ProfileScreen.tsx`** — Removed `LoginLanding` component. Visitor greeting card + preferences section for all users; account section + logout only for authenticated users; visitor gets login/create-account buttons.
- **`apps/mobile/src/app/screens/RegisterScreen.tsx`** — Removed religion chip selector and post-registration `updateSettings` call. Fixed back navigation to use `canGoBack()`.
- **`apps/mobile/src/app/screens/LoginScreen.tsx`** — Fixed back button to use `canGoBack() ? goBack() : navigate('Main')`.
- **`apps/mobile/src/app/screens/PlaceDetailScreen.tsx`** — Check-in and favorite actions now wrapped with `requireAuth()`.
- **`apps/mobile/src/app/screens/GroupsScreen.tsx`** — Visitors see a login CTA empty state; authenticated users see full groups list.
- **`apps/mobile/src/app/App.tsx`** — Added `GestureHandlerRootView`, `BottomSheetModalProvider`, and `AuthBottomSheetProvider` to root.
- **`apps/mobile/babel.config.js`** — Added `react-native-reanimated/plugin` (required by `@gorhom/bottom-sheet`).

---

## Place Card Redesign & Status Pill Unification (2026-02-18)

### Frontend (web)

- **`PlaceCardUnified.tsx`** — Full rewrite: full-bleed 280px image, glass panel overlay at the bottom with name/address/distance/rating/check-in button. Removed separate card body (name, type footer, arrow button). Status pill now renders all three states (open/closed/unknown) using `badge-*-glass` CSS classes with coloured dots.
- **`index.css`** — Reduced `badge-open-glass`, `badge-closed-glass`, `badge-unknown-glass` opacity from 0.85 → 0.3 and updated border colours to match mobile detail screen style. Improves `PlaceDetail.tsx` hero badges as a side-effect.

### Frontend (mobile)

- **`PlaceCard.tsx`** — List-view card badges updated to semi-transparent glass style matching `PlaceDetailScreen` hero. Open dot changed from white to `#4ade80`; closed badge gains a `#f87171` dot. Removed `overlayTop`/`overlayBottom` dark overlays — glass panel reads cleanly over images without them.

---

## GCP Auto-Deploy Workflow (2026-02-18)

### Infrastructure

- **`.github/workflows/deploy.yml`** — New GitHub Actions workflow that runs on every push to `main`:
  1. Runs server `pytest` and web `tsc + vite build` in parallel as a gate.
  2. On success, deploys API to Cloud Run (build → push to Artifact Registry → `gcloud run deploy`).
  3. On success, deploys web to Firebase Hosting (`npm run build` → `firebase-tools deploy`).
  - Uses `concurrency` group to cancel stale in-flight deploys on rapid pushes.
  - Required GitHub secrets: `GCP_SA_KEY` (service account JSON), `VITE_API_URL`, `FIREBASE_TOKEN`.

### Docs

- **`PRODUCTION.md` Plan 3, Step 6a** — Updated Firebase init note: "Set up automatic builds with GitHub: No" now references `deploy.yml` for clarity.

---

## Seed Split: System vs Demo Data + Reset CLI (2026-02-17)

### Backend

- **`server/app/db/seed.py`** — Split `run_seed()` into two focused functions:
  - `run_seed_system()` — seeds only reference/system data (languages, translations, attribute definitions). Idempotent, safe on every startup.
  - `run_seed_demo()` — seeds demo records (places, place images, users, user settings, groups, group members, notifications, password resets). Must be called explicitly.
  - `_clear_stores()` and `__main__` block retained for direct dev use (`python -m app.db.seed` still does a full reset + seed).
- **`server/app/main.py`** — Startup now calls `run_seed_system()` only. Demo data (places, users, etc.) is never loaded automatically.
- **`server/scripts/reset_db.py`** — New CLI tool for resetting the DB:
  - `python scripts/reset_db.py` → drop all tables → run migrations → seed reference data only.
  - `python scripts/reset_db.py --with-demo-data` → same + seed demo data (places, users, groups, etc.).
- **`data_scraper/app/main.py`** — No change; geo boundaries and place-type mappings continue to seed automatically on startup.

---

## Scraper DB Persistence — All Plans (2026-02-17)

### Backend

- **`data_scraper/app/db/session.py`** — Added `SCRAPER_DB_PATH` env var support (defaults to `scraper.db` in cwd; set to `/data/scraper.db` in production with a volume mounted at `/data`).
- **`data_scraper/Dockerfile`** — Added `RUN mkdir -p /data` so the mount point exists before the volume is attached.

### Infrastructure

- **`docker-compose.yml`** — Scraper service: added `SCRAPER_DB_PATH=/data/scraper.db`, `volumes: scraper_data:/data`, and `scraper_data` named volume declaration.

### Docs

- **`PRODUCTION.md`** — Added scraper DB sections to all 3 plans: Docker (named volume), Render (Persistent Disk vs ephemeral options), GCP (Cloud Run Job recommendation + Cloud SQL path for persistent service). Added `SCRAPER_DB_PATH` to env vars reference table.

---

## GCP Deployment Guide — Step-by-Step (2026-02-17)

### Docs

- **`PRODUCTION.md` Plan 3** — Full step-by-step rewrite covering: Prerequisites (gcloud CLI, project creation, billing, API enablement), Artifact Registry setup, Cloud SQL instance + database + user creation, Secret Manager (storing + mounting JWT_SECRET / DATABASE_URL / RESEND_API_KEY), building and pushing Docker images via Cloud Build, Cloud Run deploy with Unix socket Cloud SQL connection, Firebase Hosting init + build + deploy, Cloud Run Jobs for scheduled tasks (cleanup + backfill), Cloud Scheduler wiring, GitHub Actions CI/CD with a dedicated service account, and a cost breakdown table per service.

---

## CI/CD Pipeline + Render/Vercel Deployment Guide (2026-02-17)

### Infrastructure

- **`.github/workflows/deploy.yml`** — New GitHub Actions deploy workflow: runs server tests + web typecheck/build in parallel, then on success triggers Render deploy hook (API) and Vercel CLI deploy (web). Optional scraper deploy behind `DEPLOY_SCRAPER=true` variable. Uses `concurrency` group to cancel stale deploys on rapid pushes.

### Docs

- **`PRODUCTION.md` Plan 2** — Full rewrite with step-by-step instructions: Neon DB creation, Render Web Service setup, env var tables with exact keys, Vercel project config, deploy hook retrieval, GitHub Actions secrets/variables setup, pipeline diagram, scheduled job options (Render Cron vs GitHub Actions).

---

## Production Deployment Setup (2026-02-17)

### Docs

- **`PRODUCTION.md`** — Full rewrite: corrected CORS format (space-separated), added all missing env vars (`JWT_EXPIRE`, `REFRESH_EXPIRE`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESET_URL_BASE`, `SCRAPER_TIMEZONE`), documented `backfill_timezones` job, added mobile production checklist (bundle IDs, EAS submit), updated Python base image to `python:3.12-slim`, added Docker quick-start guide, added complete env var reference table.
- **`.env.example`** — New root-level env file for use with `docker-compose.yml`.

### Backend

- **`server/Dockerfile`** — New: `python:3.12-slim`, installs `requirements.txt`, runs uvicorn on `${PORT:-3000}`.
- **`data_scraper/Dockerfile`** — New: `python:3.12-slim`, runs uvicorn on `${PORT:-8001}`.

### Frontend (web)

- **`apps/web/Dockerfile`** — New: multi-stage (Node 20 build → nginx 1.27 serve); `VITE_API_URL` passed as build arg.
- **`apps/web/nginx.conf`** — New: SPA routing (`try_files … /index.html`), aggressive static asset caching.

### Infrastructure

- **`docker-compose.yml`** — New: wires `db` (Postgres 15), `api`, `web`, and optional `scraper` (behind `--profile scraper`); includes health-check dependency ordering.

---

## P4 Screen-by-Screen Design Parity: Final Items (2026-02-17)

### Frontend (web)

- **`apps/web/src/app/pages/Register.tsx`** — Added `arrow_back` back-link to `/login` at top-left; added password hint text (`auth.passwordMinLength`) below password field.
- **`apps/web/src/app/pages/CheckInsList.tsx`** — `CheckInCard`: container height fixed at `h-32`, thumbnail enlarged to `w-24 h-24`, rating badge overlay added inside thumbnail (conditional on `place.average_rating`).
- **`apps/web/src/lib/types/places.ts`** — Added `average_rating?: number` to the embedded `place` shape on `CheckIn`.

### Frontend (mobile)

- **`apps/mobile/src/app/screens/LoginScreen.tsx`** — Replaced `‹` text char with `MaterialIcons` `arrow-back` (20 px) in back button; replaced `✦` text char with `MaterialIcons` `auto-awesome` (24 px) as logo icon.
- **`apps/mobile/src/app/screens/RegisterScreen.tsx`** — Same icon fixes as Login; added password hint text (`auth.passwordMinLength`) below password field.
- **`apps/mobile/src/app/screens/CheckInsListScreen.tsx`** — Visit card height fixed at 128, thumbnail enlarged to 96×96, rating badge overlay (text `★ N.N`) added inside thumbnail for all three card lists.
- **`apps/mobile/src/lib/types/places.ts`** — Added `average_rating?: number` to the embedded `place` shape on `CheckIn`.

### Docs

- **`ROADMAP.md`** — Checked off all three remaining P4 screen items: Place Detail, Sign In/Sign Up, Check-ins History.

---

## P4 Web/Mobile Parity: Dark Mode & i18n Audit (2026-02-17)

### Backend

- **`server/app/db/seed_data.json`** — Added ~51 new translation keys across EN, AR, and HI:
  - `reviews.*`: confirmDelete, selectRating, maxPhotos, invalidImage, photoPermissionDenied, uploadFailed, starsAccessibility
  - `places.*`: missingCode, notFound, checkedInDate, checkInFailed, tryAgain
  - `common.*`: backToHome, home, visitor, share, copy, copied, unexpectedError, timeJustNow/minutesAgo/hoursAgo/daysAgo, distanceMeters/Km, monday–sunday (7 day names)
  - `groups.*`: groupCreated, shareInviteLink, goToGroup, nameLabel, descriptionLabel, privateGroup, invite, places, viewFullLeaderboard, noLeaderboardData, recentlyVisited, noRecentActivity, checkedInAt, created, level, missingGroup, groupNamePlaceholder, descriptionPlaceholder

### Frontend (web)

- **`apps/web/src/app/pages/ResetPassword.tsx`** — Fixed wrong dark tokens: `dark:bg-gray-900` → `dark:bg-dark-bg`, `dark:bg-gray-800` → `dark:bg-dark-surface`, `dark:text-gray-400` → `dark:text-dark-text-secondary`.
- **`apps/web/src/app/pages/SelectPath.tsx`** — Added full dark mode (previously none); replaced inline gradient `style={}` with Tailwind `bg-gradient-to-b` + `dark:bg-dark-bg` classes.
- **`apps/web/src/app/pages/PlaceDetail.tsx`** — Fixed 6 hardcoded English strings via `t()`: confirmDelete, visitor, checkedInDate, missingCode, backToHome (×2), notFound.
- **`apps/web/src/app/pages/WriteReview.tsx`** — Full dark mode; fixed 8 hardcoded strings (maxPhotos, invalidImage, uploadFailed, selectRating, missingCode, backToHome, starsAccessibility); fixed icon classes (`material-icons-outlined`/`material-icons-round` → `material-symbols-outlined`).
- **`apps/web/src/app/pages/EditProfile.tsx`** — Added missing dark mode: `dark:bg-dark-bg` on container, `dark:bg-dark-surface dark:border-dark-border` on inputs, `dark:hover:bg-dark-surface` on checkbox labels.
- **`apps/web/src/app/pages/Favorites.tsx`** — Added `dark:bg-dark-bg` and `dark:text-white` to container and heading.
- **`apps/web/src/app/pages/Notifications.tsx`** — Fixed `'Updates'` → `t('notifications.updatesLabel')` and hardcoded empty description → `t('notifications.emptyDesc')`; added dark mode to container and notification items.
- **`apps/web/src/app/pages/Groups.tsx`** — Full dark mode; refactored `formatRelative()` and `progressLevel()` to accept `t` as a parameter, replacing hardcoded time/level strings with translation keys; fixed `'Notifications'` aria-label and `'Created'` prefix; fixed icon classes.
- **`apps/web/src/app/pages/CreateGroup.tsx`** — Full dark mode; fixed 8 hardcoded strings: groupCreated, shareInviteLink, share, copy, goToGroup, nameLabel, descriptionLabel, privateGroup.
- **`apps/web/src/app/pages/GroupDetail.tsx`** — Full dark mode; fixed ~15 hardcoded strings: back, share, invite/copied, places (×4), showLess/viewFullLeaderboard, noLeaderboardData, recentlyVisited, noRecentActivity, checkedInAt.
- **`apps/web/src/app/pages/JoinGroup.tsx`** — Added full dark mode to all render paths.
- **`apps/web/src/components/common/ErrorBoundary.tsx`** — Fixed wrong dark tokens (`dark:bg-gray-*` → `dark:bg-dark-*`).
- **`apps/web/src/components/common/EmptyState.tsx`** — Fixed `dark:bg-gray-800/50` → `dark:bg-dark-surface`; added `dark:border-dark-border dark:text-white dark:text-dark-text-secondary`.
- **`apps/web/src/components/places/PlaceCard.tsx`** — Replaced all `dark:bg-slate-700` → `dark:bg-dark-surface`; `dark:text-slate-400` → `dark:text-dark-text-secondary`.
- **`apps/web/src/components/places/PlaceOpeningHours.tsx`** — Replaced hardcoded `DAYS` English array with `DAY_KEYS`/`DAY_EN` pattern for i18n day name display; added dark mode to desktop view container.
- **`apps/web/src/components/layout/ProtectedRoute.tsx`** — Replaced hardcoded `'Loading...'` with `t('common.loading')`; added `dark:text-dark-text-secondary`.

### Frontend (mobile)

- **`apps/mobile/src/app/screens/PlaceDetailScreen.tsx`** — Fixed hardcoded strings: missingCode, home (×2), notFound, checkInFailed, tryAgain; refactored distance formatting to use `t('common.distanceMeters')`/`t('common.distanceKm')` with `.replace()`; refactored day names array to `DAY_KEYS`/`DAY_EN` pattern using `t(\`common.${key}\`)`.
- **`apps/mobile/src/app/screens/WriteReviewScreen.tsx`** — Fixed 8 hardcoded strings: maxPhotos, invalidImage, photoPermissionDenied, uploadFailed, selectRating, missingCode, home, starsAccessibility.
- **`apps/mobile/src/app/screens/CreateGroupScreen.tsx`** — Fixed 5 hardcoded strings: goToGroup, nameLabel, groupNamePlaceholder, descriptionLabel, descriptionPlaceholder.
- **`apps/mobile/src/app/screens/GroupDetailScreen.tsx`** — Fixed hardcoded strings: missingGroup, share, places (×4 occurrences).
- **`apps/mobile/src/app/screens/NotificationsScreen.tsx`** — Removed hardcoded English fallback for emptyDesc; now exclusively uses `t('notifications.emptyDesc')`.

### Docs

- **`CLAUDE.md`** — Added Rule 12 (Dark Mode Compliance) and Rule 13 (Translation Key Parity) to prevent future disparity.
- **`ROADMAP.md`** — Replaced P4 "Design Alignment" section with completed task checklist for this parity pass.

---

## P4 Design Alignment: Web/Mobile Parity (2026-02-17)

### Frontend (web)

- **`apps/web/src/components/layout/Layout.tsx`** — Reduced bottom nav from 4 tabs to 3 (removed Map tab). Map is accessed via the Home screen toggle, matching mobile's 3-tab structure (Explore, Groups, Profile). Desktop header also removes the standalone Map link.

- **`apps/web/src/app/pages/Profile.tsx`** — Major overhaul to match mobile `ProfileScreen`: (1) added `LoginLanding` component for unauthenticated users (Hero image + Get Started/Sign In buttons); (2) stats grid changed from 3 columns (visits, reviews, badges) to 2 columns (check-ins, reviews) matching mobile; (3) added **Preferences section** with My Path, Language picker (modal bottom sheet), Notifications, and Dark Mode toggle; (4) added **Logout button** in red at the bottom; (5) full dark mode support via `dark:` Tailwind classes throughout; (6) language selection now opens an animated modal sheet instead of linking to Settings.

- **`apps/web/src/app/routes.tsx`** — Removed `ProtectedRoute` wrapper from `/profile` route; unauthenticated state is now handled within the component (shows `LoginLanding`), matching mobile behavior.

- **`apps/web/src/app/pages/Settings.tsx`** — Fixed all hardcoded English strings: "Preferences", "Support", "Account", "Delete account" and its confirmation text now use `t()` calls. Added icons to theme buttons, full dark mode `dark:` classes, back button linking to Profile, and improved visual consistency with mobile's settings UI.

### Backend

- **`server/app/db/seed_data.json`** — Added 3 new translation keys (`settings.support`, `settings.deleteAccount`, `settings.deleteAccountConfirm`) in English, Arabic, and Hindi.

---

## P2 Features: Timezone, Cursor Pagination, Map Clustering (2026-02-17)

### Backend

- **`data_scraper/app/scrapers/gmaps.py`** — Added `SCRAPER_TIMEZONE` fallback: when Google Maps doesn't return `utcOffsetMinutes` for a place, the scraper now reads the `SCRAPER_TIMEZONE` env var (IANA name, e.g. `Asia/Dubai`) and uses `zoneinfo.ZoneInfo` to compute the UTC offset in minutes. No external dependencies — uses stdlib `zoneinfo` (Python 3.9+).

- **`data_scraper/.env.example`** — Documented new `SCRAPER_TIMEZONE` env var with example value `Asia/Dubai`.

- **`server/app/db/places.py`** — Added cursor-based pagination to `list_places()`: new optional `cursor` parameter (a `place_code`). When provided, the page starts after that item in the sorted/filtered result set; otherwise `offset` is used as before. Returns `next_cursor` (last item's `place_code` when more results exist, `None` otherwise).

- **`server/app/api/v1/places.py`** — Exposed `cursor` query param on `GET /api/v1/places` and included `next_cursor` in the response body.

### Frontend (web)

- **`apps/web/src/components/places/PlacesMap.tsx`** — Added `react-leaflet-cluster` (`MarkerClusterGroup`) to cluster overlapping map markers. Green cluster icons show item count and expand on click; spiderfies at max zoom. `react-leaflet-cluster` + `@types/leaflet.markercluster` added to `package.json`.

- **`apps/web/src/lib/types/places.ts`** — Added `next_cursor?: string | null` to `PlacesResponse`.

### Frontend (mobile)

- **`apps/mobile/src/lib/utils/mapBuilder.ts`** — Embedded `leaflet.markercluster@1.5.3` via CDN in the WebView HTML. All markers now added to `L.markerClusterGroup()` with matching green cluster icons; click and postMessage behavior preserved.

- **`apps/mobile/src/lib/types/places.ts`** — Added `next_cursor?: string | null` to `PlacesResponse`.

---

## Pytest Test Suite + AM/PM Parsing Fix (2026-02-17)

### Backend

- **`server/app/db/places.py`** — Fixed AM/PM inheritance in `_parse_slot()`: when open time has no AM/PM marker (e.g. `"6:30 – 7:15 AM"`), the period is now inherited from the close time, resolving `open_status: "unknown"` for Google Maps-style partial 12h slots.

- **`server/tests/`** — Expanded pytest test suite (260 tests total):
  - `test_health.py` — health endpoint
  - `test_hours_parsing.py` — 23 unit tests for `_parse_time`, `_parse_time_12h`, `_parse_slot`, `_is_open_now_from_hours`
  - `test_auth.py` — register, login, refresh, logout flows
  - `test_auth_extended.py` — forgot-password, reset-password flows (valid token, one-time use, expired, weak password)
  - `test_places.py` — list, get, create/upsert, search, filters, reviews, check-ins, favorites
  - `test_places_db.py` — haversine, `_check_attr_bool`, `_place_has_*` helpers, place code generation, CRUD, list_places filtering
  - `test_place_attributes.py` — upsert/get/bulk attributes, attribute definitions filtering and ordering
  - `test_check_ins_db.py` — count queries, bulk counts, has_checked_in, this-month, on-this-day
  - `test_users.py` — GET/PATCH /users/me, settings, stats, check-ins, favorites HTTP integration tests
  - `test_reviews_extended.py` — PATCH/DELETE reviews, 403 guards, list with average_rating, anonymous flag
  - `test_i18n.py` — GET /languages, GET /translations (fallback, all three languages, place keys)
  - `test_notifications.py` — DB layer create/read/paginate + HTTP API endpoints
  - `test_security.py` — hash_password, verify_password, JWT encode/decode/tamper, refresh token generation
  - `test_store.py` — create/get/update user, settings update, password reset, refresh token lifecycle
  - `test_timezone_utils.py` — get_local_now, get_today_name, format_utc_offset (DST offsets, half-hour zones)
  - `tests/conftest.py` — session-scoped i18n seeding from `seed_data.json`; per-test DB isolation

- **`data_scraper/tests/`** — Expanded pytest test suite (40 tests total):
  - `test_normalize.py` — `normalize_to_24h`, `clean_address`, `process_weekly_hours` covering 12h→24h, multi-slot, special keywords, unicode whitespace
  - `test_gmaps_helpers.py` — `calculate_search_radius`, `detect_religion_from_types` (mocked session), `get_default_place_type`, `get_gmaps_type_to_our_type`, `MIN_RADIUS` constant

- **`server/requirements.txt`** — Added `pytest`, `pytest-asyncio`, `httpx`.
- **`data_scraper/requirements.txt`** — Added `pytest`.
- **`server/pytest.ini`**, **`data_scraper/pytest.ini`** — pytest configuration files.

### Docs

- **`CLAUDE.md`** — Added Rule 11: backend changes must include or update pytest tests; includes commands, test infrastructure notes.
- **`ROADMAP.md`** — Marked "Add backend tests with pytest" as complete.

---

## Opening Hours Overhaul (2026-02-17)

### Backend

- **`server/app/db/places.py`** — Fixed `_is_open_now_from_hours()`:
  - Bug fix: `"hours not available"` now returns `None` (unknown) instead of `False` (closed).
  - Multi-slot support: handles comma-separated time ranges (e.g. `"05:00-12:00, 14:00-22:00"`); returns `True` if current time falls in ANY slot.
  - Handles `list` type for `today_hours` by joining to comma-separated string.

- **`server/app/api/v1/places.py`** — Added `open_status` field (`"open"` | `"closed"` | `"unknown"`) to all place API responses; normalized `"00:00-23:59"` → `"OPEN_24_HOURS"` marker in `opening_hours_today` and `opening_hours` dict.

- **`server/app/db/seed_data.json`** — Added `places.open` and `places.unknown` translation keys for English, Arabic, and Hindi.

- **`data_scraper/app/scrapers/gmaps.py`** — Updated `normalize_to_24h()` to handle comma-separated multi-slot hours from Google Maps (e.g. `"9:00 AM - 12:00 PM, 2:00 PM - 6:00 PM"` → `"09:00-12:00, 14:00-18:00"`).

### Frontend (web)

- **`apps/web/src/lib/types/places.ts`** — Added `open_status?: 'open' | 'closed' | 'unknown'`; changed `is_open_now` to `boolean | null`.

- **`apps/web/src/index.css`** — Changed `.badge-open` from blue to green (`bg-emerald-600`); added `.badge-unknown` (grey); added glass variants (`.badge-open-glass`, `.badge-closed-glass`, `.badge-unknown-glass`) for hero overlay use.

- **`apps/web/src/components/places/PlaceCard.tsx`** — Three-state open/closed/unknown pill; uses `t('places.open')` instead of `t('places.openNow')`.

- **`apps/web/src/app/pages/PlaceDetail.tsx`** — Hero pill uses glass badge CSS classes with three-state logic.

- **`apps/web/src/components/places/PlaceOpeningHours.tsx`** — `formatHours()` handles `OPEN_24_HOURS` marker and case-insensitive `"hours not available"`; applied to collapsed view; added `truncate`/`min-w-0` overflow protection.

- **`apps/web/src/components/places/PlacesMap.tsx`** — Map pins now use open-status colors (green/red/grey) instead of religion-based colors.

### Frontend (mobile)

- **`apps/mobile/src/lib/types/places.ts`** — Same type changes as web.

- **`apps/mobile/src/lib/theme.ts`** — `openNow` changed from blue to green (`#16a34a`); added `unknownStatus: '#94a3b8'` and `unknownStatusBg`.

- **`apps/mobile/src/components/places/PlaceCard.tsx`** — Three-state pill with `useI18n` translations; added `chipUnknown`/`badgeUnknown` grey styles; updated border color for open badge.

- **`apps/mobile/src/app/screens/PlaceDetailScreen.tsx`** — Hero pill three-state with `heroBadgeUnknown` style; added `formatHoursDisplay()` helper; applied to collapsed/expanded views; added `numberOfLines={1}` and `flexShrink: 1` overflow fixes.

- **`apps/mobile/src/lib/utils/mapBuilder.ts`** — Map pins use open-status colors via per-marker `openStatus` field; replaces single blue icon.

---

## P1 Performance Improvements (2026-02-17)

### Backend

- **Batch place sync endpoint** (`server/app/api/v1/places.py`, `server/app/models/schemas.py`)
  - Added `PlaceBatch` Pydantic model wrapping `List[PlaceCreate]`.
  - New `POST /api/v1/places/batch` endpoint (declared before single-place route to avoid path conflict) that iterates the list, upserts each place with images/attributes/reviews, and returns `{total, synced, failed, results[]}`.
  - Reduces N HTTP requests to `ceil(N/25)` requests during sync.

- **Rating sort for places** — already implemented; verified in `server/app/db/places.py` (sort applied after filters with `_get_avg` per place). Marked done in ROADMAP.

- **Scraper batch sync** (`data_scraper/app/db/scraper.py`)
  - Added `BATCH_SIZE = 25` constant.
  - `sync_run_to_server` builds all payloads up front, POSTs in batches of 25 to `/api/v1/places/batch`.
  - Falls back to individual `POST /api/v1/places` calls if batch endpoint returns non-200.
  - Maintains per-place `[OK]` / `[FAIL]` logging and final summary.

### Frontend (web)

- **React.memo for PlaceCardUnified and FilterChip** (`apps/web/src/components/places/`)
  - Wrapped `PlaceCardUnified` and `FilterChip` in `React.memo()` to prevent unnecessary re-renders on parent state changes.

- **Lazy-loaded routes** (`apps/web/src/app/routes.tsx`)
  - Converted all 18 page imports to `React.lazy()` with dynamic `import()`.
  - Wrapped `<Routes>` in `<Suspense fallback={<PageLoader />}>` (spinner). Enables per-route code splitting; first load no longer downloads all page bundles.

- **Extracted PlaceDetail sub-components** (`apps/web/src/components/places/`)
  - `PlaceOpeningHours` — collapsible opening hours section with `compact` prop for mobile/desktop variants; eliminates duplicated JSX between layouts.
  - `PlaceTimingsCarousel` — horizontal carousel of `TimingCircle`/`DeityCircle` items with `compact` prop.
  - `PlaceSpecificationsGrid` — 2/3-column specifications grid with `compact` prop.
  - `PlaceDetail.tsx` reduced from 840 → ~550 lines; `hoursExpanded` state and `renderTimingItem` helper removed from page component.

### Frontend (mobile)

- **Image caching** — already implemented via `expo-image` with `cachePolicy="memory-disk"` in `PlaceCard.tsx`. Marked done in ROADMAP.

- **React.memo for PlaceCard and FilterChip** — already applied in mobile components. Marked done in ROADMAP.

- **Extracted PlaceDetailScreen sub-components** (`apps/mobile/src/components/places/`)
  - `PlaceScorecardRow` — tappable distance/crowd/visits scorecard row.
  - `PlaceTimingsCarousel` — horizontal ScrollView of religion-specific timing circles.
  - `PlaceSpecificationsGrid` — wrapped specs grid with icon, label, value.
  - `PlaceReviewsList` — full reviews section with write/edit/delete actions, owns `deletingCode` state and uses `useNavigation` internally.
  - `PlaceDetailScreen.tsx` reduced from 1129 → ~600 lines; removed `handleDeleteReview`, `deletingCode`, `userReview`, and related style blocks from screen.

---

## P1 Reliability Improvements (2026-02-17)

### Backend

- **Alembic database migrations** (`server/alembic.ini`, `server/migrations/`)
  - Initialized Alembic with full `env.py` wired to SQLModel metadata and `DATABASE_URL` env override.
  - Wrote initial migration `0001_initial.py` with `op.create_table()` for all 15 tables (correct `downgrade()` included).
  - `server/app/db/session.py`: added `run_migrations()` — programmatic `alembic upgrade head` using the correct `alembic.ini` path.
  - `server/app/main.py`: lifespan now calls `run_migrations()` before `run_seed()`, ensuring schema is always at head on startup.
  - `server/app/db/seed.py`: `_clear_stores()` replaced `create_db_and_tables()` with `run_migrations()` so the dev seed rebuilds via tracked migrations.
  - `server/requirements.txt`: added `alembic>=1.13.0`.
  - `server/README.md`: documented all Alembic commands and the "adding a new model" workflow.

- **Scraper sync summary** (`data_scraper/app/db/scraper.py`)
  - `sync_run_to_server` now tracks `synced_count` and `failure_details` per place.
  - Prints `[OK]` / `[FAIL]` per place and a final summary line: `"Sync complete: 47/50 places synced. 3 failure(s)."` with a list of failed place codes and reasons.

- **Unsafe session handling** (`server/app/db/place_images.py`)
  - Already uses proper `Session` injection — no `next(get_session())` present. Verified and marked done.

- **Scraper health check** (`data_scraper/app/main.py`)
  - Already implements `GET /health` returning `{"status": "ok"}`. Verified and marked done.

### Frontend (web)

- **Route-level error boundaries** (`apps/web/src/app/routes.tsx`)
  - Added `RouteErrorBoundary` functional component using `key={location.pathname}`. React mounts a fresh `ErrorBoundary` on every navigation, so a crash on one route doesn't block access to other routes.
  - Wraps the entire `<Routes>` block in `AppRoutes`.

### Frontend (mobile)

- **Screen-level error boundaries** (`apps/mobile/src/app/navigation.tsx`)
  - Added `withScreenBoundary` HOC that wraps any screen component in `<ErrorBoundary>`.
  - Applied to all 15 non-trivial `Stack.Screen` components so a crash on one screen shows the "Try again" fallback without affecting the rest of the navigator.

---

## Mobile UX Improvements – Pull-to-Refresh, Infinite Scroll, Haptics, Swipe, Skeletons (2026-02-17)

### Frontend (mobile)

- **Skeleton loading screens** (`apps/mobile/src/components/common/SkeletonCard.tsx`)
  - New `SkeletonCard` component with animated opacity pulse (0.4 → 0.85 at 750ms) matching PlaceCard shape.
  - Used on HomeScreen (5 skeletons on initial load) and FavoritesScreen (4 skeletons on initial load).

- **SwipeableRow component** (`apps/mobile/src/components/common/SwipeableRow.tsx`)
  - PanResponder-based swipe-to-reveal-action component; no external gesture library required.
  - Configurable delete button (label, color, icon); snaps open/closed past 50% threshold.

- **Haptic feedback** (`apps/mobile/src/app/screens/PlaceDetailScreen.tsx`)
  - `expo-haptics` added to `package.json`.
  - `notificationAsync(Success)` on successful check-in; `impactAsync(Light)` on favorite toggle.

- **Pull-to-refresh** (`apps/mobile/src/app/screens/CheckInsListScreen.tsx`)
  - Added `RefreshControl` to the check-ins `ScrollView`.
  - `HomeScreen` and `FavoritesScreen` already support pull-to-refresh via `FlatList` + `RefreshControl`.

- **Infinite scroll** (`apps/mobile/src/app/screens/HomeScreen.tsx`)
  - `FlatList` now uses `onEndReached` / `onEndReachedThreshold={0.4}` to load the next page (PAGE_SIZE = 20).
  - `ListFooterComponent` shows a spinner while `loadingMore` is true.

- **Favorites: FlatList + swipe-to-remove + haptics** (`apps/mobile/src/app/screens/FavoritesScreen.tsx`)
  - Converted from `ScrollView` to `FlatList` with `RefreshControl`.
  - Each favorite wrapped in `SwipeableRow`; swipe left to reveal remove button.
  - `Haptics.impactAsync(Medium)` fires before remove action.

### Frontend (web)

- **Infinite scroll** (`apps/web/src/app/pages/Home.tsx`, `apps/web/src/components/places/PlaceListView.tsx`)
  - `Home.tsx`: added `PAGE_SIZE = 20`, `loadMore` callback, `offsetRef` for stable offset tracking, passes `loadingMore`/`hasMore`/`onLoadMore` to `PlaceListView`.
  - `PlaceListView.tsx`: `IntersectionObserver` on a sentinel `<div>` at list bottom triggers `onLoadMore`; spinner shown while `loadingMore` is true.

---

## P4 Design Alignment – Component-Level (2026-02-17)

### Frontend (web)

- **Design tokens: border radius alignment** (`apps/web/tailwind.config.js`)
  - Aligned border radius values with design reference: `2xl` = 16px (cards), `3xl` = 24px (large panels), `4xl` = 32px (hero sections), `xl` = 12px (inputs, inner elements).

- **Animation & motion utilities** (`apps/web/tailwind.config.js`, `apps/web/src/index.css`)
  - Added `shimmer` (1.5s skeleton), `checkInSpring` (spring physics scale), `heartPop` (favorite toggle), `slideUp`, and `fadeIn` keyframe animations.
  - Added `.skeleton-shimmer`, `.animate-check-in`, `.animate-heart-pop`, `.animate-slide-up` CSS utility classes.

- **Glass morphism** (`apps/web/src/index.css`)
  - Updated `.glass-card` to `rgba(255,255,255,0.70)` + `blur(12px)` + `border-white/20` (light mode).
  - Updated `.glass-card-dark` to `rgba(18,18,18,0.70)` + `blur(12px)` + `border-white/10` (dark mode).
  - Added `.glass-btn` for hero image overlay controls.

- **Badge system** (`apps/web/src/index.css`)
  - `.badge-open`: primary blue pill with pulse dot (matches design reference).
  - `.badge-closed`: red pill, white text.
  - `.badge-visited`: glass morphism pill with backdrop-blur.
  - `.badge-rating`: dark glass pill with star + rating number.

- **Overlay gradients** (`apps/web/src/index.css`)
  - `.hero-gradient`: `from-black/40 → transparent → to-black/80` (matches design reference three-stop gradient).
  - `.hero-gradient-bottom`: `transparent 40% → black/80 100%` for card images.

- **Button variants** (`apps/web/src/components/common/PrimaryButton.tsx`)
  - Added `outline` variant: transparent fill, 1px primary border, primary text.
  - Added `glass` variant: backdrop-blur semi-transparent, white text.
  - Updated `secondary` variant: `primary/10` opacity fill, primary text (was outline-ish border).

- **PlaceCard** (`apps/web/src/components/places/PlaceCard.tsx`)
  - Hero image gradient updated to three-stop `.hero-gradient`.
  - Open badge uses `.badge-open` (primary blue pill with pulse dot).
  - Closed badge uses `.badge-closed` (red pill).
  - Visited badge uses `.badge-visited` (glass morphism).
  - Card border radius: `rounded-2xl` (16px). Inner image: `rounded-xl` (12px). Consistent 16px padding.
  - Shadow: `shadow-card` on rest, `shadow-card-md` on hover.

- **Bottom navigation** (`apps/web/src/components/layout/Layout.tsx`)
  - Switched to layered glass: `bg-white/80` + `backdrop-blur-lg` background layer + `border-white/30` separator.
  - Active icon: filled + bold weight (`wght 600`). Inactive icon: lighter weight (`wght 300`).
  - Active indicator: small primary dot above icon. Inactive label: smaller and 50% opacity.
  - Safe area inset handled via `env(safe-area-inset-bottom)`.

- **Skeleton shimmer** (`apps/web/src/components/common/SkeletonCard.tsx`)
  - Replaced `animate-pulse` with `.skeleton-shimmer` left-to-right gradient at 1.5s interval.

### Frontend (mobile)

- **Design tokens: border radius alignment** (`apps/mobile/src/lib/theme.ts`)
  - Aligned `borderRadius` with design reference: `2xl` = 16px, `3xl` = 24px, `4xl` = 32px.
  - Added `closedNow` / `closedNowBg` color tokens (red).
  - Changed `openNow` from green `#059669` to primary blue `#007AFF` (matches design reference badge).
  - Added `cardMd` shadow token.

- **PlaceCard badges & gradients** (`apps/mobile/src/components/places/PlaceCard.tsx`)
  - Open badge: solid primary blue with white text (matches design reference).
  - Closed badge: solid red with white text.
  - Visited badge: glass morphism (unchanged, correct).
  - Hero gradient: `overlayTop` (rgba 0,0,0,0.40) + `overlayBottom` (rgba 0,0,0,0.50), matching design reference three-stop pattern.
  - Compact card inner image radius: `tokens.borderRadius.xl` (12px). Card radius: `tokens.borderRadius['2xl']` (16px).
  - Rating pill updated to rounded-full glass style.

- **Bottom navigation** (`apps/mobile/src/components/layout/Layout.tsx`)
  - Inactive tab labels hidden; only active tab shows its label (cleaner per design spec).
  - Active indicator pill widened to 28px, shadow intensity increased.

---

## Security Hardening – P0 Critical Fixes + P1 Security (2026-02-17)

### Backend

- **Fix: JWT expiration format parsing** (`server/app/core/config.py`)
  - `JWT_EXPIRE` / `REFRESH_EXPIRE` env vars now accept `"7d"`, `"24h"`, `"30m"`, or integer minutes via `_parse_jwt_expire()`. Previously `int()` would crash on the `"7d"` format shown in `.env.example`.

- **Fix: `delete_review` crash** – already resolved (proper `session.delete()` in `reviews_db.delete_review`); confirmed and marked done in ROADMAP.

- **Fix: `image_urls` AttributeError on Place model** – already resolved (uses `place_images.get_images()`); confirmed and marked done in ROADMAP.

- **Fix: `get_current_user` missing session argument** (`server/app/api/deps.py`)
  - `get_current_user` and `get_optional_user` now inject `SessionDep` and pass it to `store.get_user_by_code()`, preventing a `TypeError` on every authenticated request.

- **Security: Password strength enforcement** (`server/app/models/schemas.py`)
  - `RegisterBody` and `ResetPasswordBody` now validate passwords server-side: minimum 8 characters, at least one uppercase letter, one lowercase letter, and one digit. Returns a 422 with a clear message on failure.

- **Security: Input validation** (`server/app/models/schemas.py`)
  - Added `ExternalReviewInput` Pydantic model with explicit typed fields (`author_name`, `rating` 1–5, `text`, `time`, `language`). `PlaceCreate.external_reviews` now uses `List[ExternalReviewInput]` instead of `List[dict]`.
  - `PlaceAttributeInput.value` constrained to `str | int | float | bool | list[str]`; arbitrary `dict` payloads are rejected.

- **Security: Rate limiting on auth endpoints** (`server/app/main.py`, `server/app/api/v1/auth.py`)
  - Added `slowapi` (in-memory, per-IP). Limits: `POST /auth/login` → 5/min, `POST /auth/register` → 3/min, `POST /auth/forgot-password` → 2/min.

- **Security: Password reset emails via Resend.com** (`server/app/api/v1/auth.py`, `server/app/core/config.py`)
  - `POST /auth/forgot-password` now sends a reset link via the Resend.com API. Falls back to console logging when `RESEND_API_KEY` is unset (dev). Added `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and `RESET_URL_BASE` env vars.

- **Security: Refresh token rotation** (`server/app/db/models.py`, `server/app/db/store.py`, `server/app/core/security.py`, `server/app/api/v1/auth.py`)
  - Access tokens are now short-lived (default 30 min, configurable via `JWT_EXPIRE`).
  - Opaque refresh tokens (96-char hex, stored in `RefreshToken` DB table) are issued on login/register, set as HTTP-only `SameSite=Strict` cookies (30 days, configurable via `REFRESH_EXPIRE`).
  - `POST /api/v1/auth/refresh` – validates and rotates the refresh token, issues a new access token.
  - `POST /api/v1/auth/logout` – revokes the refresh token and clears the cookie.
  - Old refresh token is revoked on every use (rotation); stolen tokens cannot be reused.

- **CORS** – already environment-aware (`CORS_ORIGINS` env var, no wildcard `*`); confirmed and marked done in ROADMAP.

- **Dependencies**: added `slowapi>=0.1.9` and `resend>=2.0.0` to `server/requirements.txt`.

- **Docs**: updated `server/.env.example` with `JWT_EXPIRE`, `REFRESH_EXPIRE`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESET_URL_BASE`.

---

## Fix Google Maps Scraper API Errors and Invalid Place Types (2026-02-17)

### Data Scraper

- **Performance: max_results Early Exit**
  - Moved max_results check inside recursive search_area() function
  - Stops API calls immediately when limit is reached instead of searching entire area
  - Checks limit at 3 points: before area search, after finding places, before each quadrant
  - Dramatically reduces API calls for testing: max_results=100 uses ~20-30 calls instead of ~350-500
  - Slight overshoot acceptable (e.g., 100 limit might return 118 places)
  - Added running total to search logging

- **Bug Fix: 404 Error in get_place_details**
  - Fixed searchNearby to request "places.name" (resource name) instead of "places.id" (legacy Place ID)
  - Resource names have format "places/ChIJ..." which is required by GET place details endpoint
  - Updated place_id extraction logic to handle resource names correctly
  - Fixed deduplication cache to extract place ID from resource name before building place_code
  - Added import for `desc()` function from sqlmodel for proper order_by usage

- **Bug Fix: API Error Handling**
  - Added HTTP status code checking to `get_places_in_circle()` in `data_scraper/app/scrapers/gmaps.py:152-158`
  - Added HTTP status code checking to `get_place_details()` in `data_scraper/app/scrapers/gmaps.py:192-198`
  - API errors (400, 404, etc.) now properly raise exceptions with error messages instead of silently failing
  - Fixes issue where 400 errors from invalid place types were not logged

- **Bug Fix: Invalid Place Types**
  - Removed unsupported place types `cathedral` and `chapel` from `data_scraper/app/db/seed_place_types.py`
  - New Places API only supports: `buddhist_temple`, `church`, `hindu_temple`, `mosque`, `shinto_shrine`, `synagogue`
  - Now using only valid types: `church` (Christianity), `mosque` (Islam), `hindu_temple` (Hinduism)
  - Added documentation comments with API reference link
  - Created `data_scraper/app/db/update_place_types.py` migration script to update existing databases:
    - Deactivates `cathedral` and `chapel` entries (sets `is_active=False`)
    - Ensures valid types are active and properly configured
    - Safe to run multiple times (idempotent)

- **Migration Instructions**
  - For existing databases, run: `cd data_scraper && python -m app.db.update_place_types`
  - For new databases, the seed script already uses only valid types

---

## Google Maps Scraper API Cost Optimization (2026-02-16)

### Data Scraper

- **Phase 1: Migrate to Places API (New) - Multi-Type Search + Field Masks**
  - Replaced legacy Google Places API with new Places API (v1) in `data_scraper/app/scrapers/gmaps.py`
  - Replaced `get_places_in_circle()` with `get_places_in_circle()` using `POST /v1/places:searchNearby` endpoint
  - Multi-type search: Now sends all place types (mosque, church, cathedral, chapel, hindu_temple) in a single API request instead of 5 separate requests per grid point
  - Replaced `get_place_details()` with `get_place_details()` using `GET /v1/places/{id}` with field masks
  - Field-masked details fetch: Uses Basic (free) + Contact ($0.003) + Atmosphere ($0.005) tiers = $0.008 per call (down from $0.017 legacy)
  - Updated photo URL construction to use new API format: `places/{placeId}/photos/{photoId}/media`
  - Updated response field mappings: `displayName`, `formattedAddress`, `regularOpeningHours`, `userRatingCount`, `accessibilityOptions`, `editorialSummary`, etc.
  - Removed all legacy API code and references

- **Phase 2: Recursive Quadtree Grid Search**
  - Replaced fixed-step grid loop with recursive quadtree subdivision in new `search_area()` function
  - Adaptive search: Automatically splits saturated areas (20 results) into 4 quadrants and recurses, leaving sparse areas as single large searches
  - Added `calculate_search_radius()` helper to compute bounding box center and diagonal radius
  - Stops recursion at `MIN_RADIUS = 2000` meters to prevent infinite subdivision in dense areas
  - Removed `STEP = 0.1` constant (no longer needed)
  - Logs recursion depth and saturation status for debugging

- **Phase 3: Cross-Run Deduplication**
  - Added deduplication check in `run_gmaps_scraper()` before fetching place details
  - Queries `ScrapedPlace` table for existing places within `STALE_THRESHOLD_DAYS = 90` days
  - Reuses cached place data instead of re-fetching from Google Maps API when available
  - Added `force_refresh` config option to override cache and force fresh fetch
  - Added `stale_threshold_days` config option to customize cache freshness window
  - Updated `DataLocationCreate` schema to include `force_refresh: Optional[bool]` and `stale_threshold_days: Optional[int]`
  - Logs cache hits vs fresh fetches in final summary

- **Cost Impact Estimates (UAE benchmark, ~1,750 grid points)**
  - **Current (legacy):** ~8,750 Nearby Search + ~5,000 Details = ~$484
  - **Phase 1 (multi-type + field masks):** ~1,750 Nearby Search + ~5,000 Details = ~$199 (59% reduction)
  - **Phase 2 (+quadtree):** ~200-500 Nearby Search + ~5,000 Details = ~$50-100 (79-90% reduction)
  - **Phase 3 (+dedup re-run):** ~200-500 Nearby Search + ~2,500 Details = ~$35-75 (85-93% reduction)

---

## Fix Missing Images in Places List API (2026-02-16)

### Backend

- **Critical Bug Fix:** Fixed missing images in `GET /api/v1/places` endpoint - images were returning as empty arrays because no database session was passed to `_place_to_item()`
- **Performance Optimization:** Added `get_images_bulk()` function in `server/app/db/place_images.py` to fetch images for multiple places in one query, eliminating N+1 query problem
- **API Changes:**
  - Updated `list_places()` in `server/app/api/v1/places.py` to create database session and bulk-fetch images
  - Modified `_place_to_item()` to accept optional pre-fetched `images` parameter for performance
  - Both URL-based and blob-based images now correctly returned in list responses
- **Schema Cleanup:** Removed unused `PlaceListItem` schema from `server/app/models/schemas.py` (had incorrect field names and wasn't being enforced)
- **Seed Data:** Added place and place_image seeding support in `server/app/db/seed.py` with test data including both URL and blob image types

### Data Scraper

- **Bug Fix:** Added missing `utc_offset_minutes` field to place sync payload in `data_scraper/app/db/scraper.py`

### Frontend (Web)

- **Image URL Utility:** Created `apps/web/src/lib/utils/imageUtils.ts` with `getFullImageUrl()` helper to convert relative blob image URLs to absolute URLs
- **Updated Components:** Applied image URL fix to all components rendering place images:
  - `PlaceCard.tsx` - place card images
  - `PlaceDetail.tsx` - hero image
  - `WriteReview.tsx` - place thumbnail
  - `CheckInsList.tsx` - check-in thumbnails
  - `PlaceCardUnified.tsx` - unified card images
- Fixes blob images not rendering because `<img>` requires full URLs

### Frontend (Mobile)

- **Image URL Utility:** Created `apps/mobile/src/lib/utils/imageUtils.ts` with `getFullImageUrl()` helper to convert relative blob image URLs to absolute URLs
- **Updated Components:** Applied image URL fix to all components rendering place images:
  - `PlaceCard.tsx` - place card images
  - `PlaceDetailScreen.tsx` - hero image
  - `WriteReviewScreen.tsx` - place thumbnail
  - `CheckInsListScreen.tsx` - check-in thumbnails (3 instances)
- Fixes blob images not rendering in `expo-image` component

### Performance Impact
- **Before:** 50 places = 51 queries (1 place query + 50 individual image queries)
- **After:** 50 places = 2 queries (1 place query + 1 bulk image query)

---

## Timezone-Aware Opening Hours & Timings (2026-02-16)

### Backend

- **Timezone Utilities:** Created `server/app/services/timezone_utils.py` with offset-based time utilities (`get_local_now()`, `get_today_name()`, `format_utc_offset()`) using Python stdlib only
- **Place Model:** Added `utc_offset_minutes` field (integer) to `Place` model to store UTC offset in minutes (e.g., 240 for UTC+4, 330 for UTC+5:30)
- **Opening Hours Storage:** Changed to store **local times** (not UTC) in 24-hour format (e.g., "09:00-17:00") to preserve place's local timezone
- **Scraper Updates:**
  - Added `utc_offset` field to Google Maps API request to extract UTC offset from API response
  - Renamed `convert_to_utc_24h()` to `normalize_to_24h()` and removed UTC conversion logic
  - Updated `process_weekly_hours()` to return local times instead of UTC times
  - Modified `get_place_details()` to extract and include `utc_offset_minutes` in place data
- **is_open_now Calculation:** Rewrote `_is_open_now_from_hours()` to accept `utc_offset_minutes` parameter and compute using place's local time
- **Timings Calculation:** Updated `build_timings()` to use place's UTC offset for prayer/service time status (past/current/upcoming)
- **API Response Changes:**
  - Added `utc_offset_minutes` field to place responses
  - Added `opening_hours_today` computed field showing today's hours in local time
  - `opening_hours` now contains local times instead of UTC times
  - Updated `_place_to_item()` to compute today's day name based on place's local time
- **Place Creation:** Updated `create_place()` and `update_place()` functions to accept and store `utc_offset_minutes`
- **Schemas:** Added `utc_offset_minutes` and `opening_hours_today` fields to `PlaceListItem` and `PlaceCreate` schemas
- **Backfill Script:** Created `server/app/jobs/backfill_timezones.py` to migrate existing places (set offset=240 for UAE, convert UTC hours to local time)

### Data Scraper

- **Google Maps Integration:** Now extracts `utc_offset` field from Google Maps Places API (no additional API calls needed)
- **Local Time Storage:** Opening hours stored in local time as provided by Google Maps, no UTC conversion
- **Place Data:** Scraper includes `utc_offset_minutes` when creating/updating places via ingestion API

### Frontend (web)

- **TypeScript Types:** Added `utc_offset_minutes?: number` and `opening_hours_today?: string` fields to `Place` interface
- **Opening Hours Display:** Added collapsible "Opening Hours" section to PlaceDetail page:
  - Collapsed state: Shows today's hours inline ("Today: 08:00 - 00:00")
  - Expanded state: Shows full weekly schedule with today highlighted
  - Handles special cases: "Closed", "Open 24 Hours", missing hours
- **UI Components:** Uses Material Icons for schedule icon and expand/collapse controls

### Frontend (mobile)

- **TypeScript Types:** Added `utc_offset_minutes?: number` and `opening_hours_today?: string` fields to `Place` interface
- **Opening Hours Display:** Added collapsible "Opening Hours" section to PlaceDetailScreen:
  - Collapsed state: Shows today's hours inline with schedule icon
  - Expanded state: Shows full weekly schedule with today highlighted
  - Matches web design with React Native primitives (View, Text, TouchableOpacity)
- **Styling:** Added comprehensive styles for opening hours card, rows, and collapse button

### Translations

- **i18n Keys Added:**
  - `places.openingHours` — "Opening Hours" / "ساعات العمل" / "खुलने का समय"
  - `places.today` — "Today" / "اليوم" / "आज"
  - `places.open24Hours` — "Open 24 Hours" / "مفتوح 24 ساعة" / "24 घंटे खुला"
  - `places.hoursNotAvailable` — "Hours not available" / "الساعات غير متوفرة" / "समय उपलब्ध नहीं"
  - `common.showLess` — "Show less" / "إظهار أقل" / "कम दिखाएं"

### Docs

- **ARCHITECTURE.md:** Added section 8.6 "Timezone Handling" documenting design decision, API response changes, DST limitations, and upgrade path
- **Place Model Documentation:** Updated to include `utc_offset_minutes` field description

---

## Place Image Caching Optimization - Mobile (2026-02-16)

### Frontend (mobile)

- **ExpoImage Migration:** Replaced React Native's basic `Image` component with `ExpoImage` for all place-related images
- **Aggressive Caching:** Added `cachePolicy="memory-disk"` to place images (PlaceCard, PlaceDetailScreen hero, DeityCircle)
- **Smooth Transitions:** Added 200ms fade-in transitions for better UX
- **Components Updated:**
  - PlaceCard: Both compact (96x96) and regular (full-card background) image variants
  - PlaceDetailScreen: Hero image (300px height)
  - DeityCircle: Deity/timing carousel images (76x76 circular)
- **Performance Impact:** Significant reduction in network usage and improved scroll performance, especially for place lists and map scrollers

---

## Review Photo Upload & Image Caching (2026-02-16)

### Backend

- **ReviewImage Model:** Added `ReviewImage` table for storing review photos as database blobs with metadata (dimensions, file size, MIME type)
- **Photo Upload Endpoint:** Implemented `POST /api/v1/reviews/upload-photo` that validates, compresses (max 1200px width, 85% JPEG quality), and stores images
- **Image Serving Endpoint:** Added `GET /api/v1/reviews/images/{id}` with 1-year cache headers (`Cache-Control: public, max-age=31536000, immutable`)
- **Review Creation:** Updated review creation to parse internal image URLs (`/api/v1/reviews/images/{id}`), attach uploaded images to reviews, and validate ownership
- **Review Fetching:** Modified review fetching to merge attached images with external URLs in `photo_urls` field
- **Orphan Cleanup Job:** Created `cleanup_orphaned_images.py` to delete unattached images older than 24 hours (prevents database bloat)
- **Dependencies:** Added Pillow 10.0+ for server-side image processing

### Frontend (web)

- **Image Upload Utility:** Created `imageUpload.ts` with client-side image validation and Canvas API compression
- **API Client:** Added `uploadReviewPhoto()` function for multipart photo uploads
- **Write Review UI:** Implemented photo picker with thumbnail previews, remove buttons, and 5-photo limit
- **Photo Display:** Added photo galleries to review cards in PlaceDetail page
- **Caching:** Browser HTTP cache automatically handles 1-year cache headers

### Frontend (mobile)

- **Dependencies:** Added `expo-image-picker` (16.0.6), `expo-image-manipulator` (14.0.3), and `expo-image` (2.1.0)
- **Image Upload Utility:** Created `imageUpload.ts` with permission handling, expo-image-picker integration, and compression
- **API Client:** Added `uploadReviewPhoto()` function with FormData support for React Native
- **Write Review UI:** Implemented photo picker with horizontal scroll, thumbnail previews, remove buttons, and 5-photo limit
- **Photo Display:** Added photo galleries to review cards in PlaceDetailScreen
- **Caching:** Replaced `<Image>` with `<ExpoImage>` component with `cachePolicy="memory-disk"` for automatic disk caching

### Documentation

- Updated ARCHITECTURE.md with ReviewImage model
- Updated PRODUCTION.md with Pillow dependency and cleanup job setup for all deployment plans

---

## User Avatar Removal (2026-02-16)

### Backend

- **Breaking Change:** Removed `avatar_url` field from User model and all API endpoints
- Removed `POST /api/v1/users/me/avatar` stub endpoint
- Updated seed data to remove avatar URLs

### Frontend (web)

- Removed avatar URL input from Edit Profile page
- Profile now always displays initial-based avatar (first letter of display name)

### Frontend (mobile)

- Removed `avatar_url` from User type (mobile already displayed initials only)

---

## Bulk Query Optimization for Places List (2026-02-16)

### Backend

- **Connection Pool Fix:** Resolved SQLAlchemy connection pool exhaustion on `GET /api/v1/places` endpoint caused by N+1 query pattern when fetching place attributes.
- **Bulk Attribute Fetching:** Added `bulk_get_attributes_for_places()` function in `place_attributes.py` that fetches all attributes for multiple places in a single query using `WHERE place_code IN [...]`.
- **Session Management:** Made session parameters REQUIRED (no longer optional) in attribute helper functions to enforce proper session reuse. Removed backward compatibility code.
- **`list_places()` Optimization:** Refactored to use bulk fetching:
  - Fetches all place attributes in ONE query after retrieving places
  - Fetches filterable attribute definitions ONCE before building filters
  - Builds filter counts in Python using pre-fetched data (no DB calls in loops)
  - Returns `all_attrs` dict in response for API layer to reuse
- **Helper Function Refactor:** Updated `_place_has_jummah`, `_place_has_events`, `_place_has_parking`, `_place_has_womens_area` to accept pre-fetched attributes dict instead of making individual DB queries.
- **API Layer Updates:** Modified `_place_to_item()`, `_build_timings()`, `_build_specifications()`, and `_place_detail()` in `places.py` API to accept optional pre-fetched attributes and session, falling back to creating sessions only when needed.
- **Performance Impact:** Reduced query count from 200+ to ~3 queries for a 50-place list with filters, eliminating connection pool timeouts.

---

## Dynamic Place Attributes + Google Maps Scraper Generalization (2026-02-16)

### Backend

- **Dynamic Attribute System (EAV):** Introduced `PlaceAttributeDefinition` and `PlaceAttribute` tables for flexible, religion-agnostic attribute storage. Adding new scraped fields or attributes now requires only a DB row—not code changes.
  - `PlaceAttributeDefinition`: Defines available attributes (`has_parking`, `capacity`, `denomination`, etc.) with metadata: data type, icon, i18n label key, filterable/specification flags, religion constraint, display order.
  - `PlaceAttribute`: Stores actual values per place in `value_text` (booleans/strings/numbers) or `value_json` (complex data like prayer times, service schedules, deities).
- **Seed Data:** Added 15 attribute definitions to `seed_data.json` (parking, wheelchair, wudu area, women's area, capacity, denomination, founded year, architecture, dress code, prayer times, service times, deities, Google rating/reviews).
- **Seed Migration:** Existing `religion_specific` data is automatically migrated to `PlaceAttribute` rows on seed for all 10 places.
- **Dynamic `_build_specifications()`:** Replaced hardcoded per-religion logic with dynamic attribute lookups from `PlaceAttributeDefinition` (spec_only=true). Specifications are now auto-generated and ordered by `display_order`.
- **Dynamic Filters:** Filter chips in `GET /api/v1/places` are now dynamically generated from `PlaceAttributeDefinition` (filterable=true) + two special cases (`open_now`, `top_rated`).
- **API Schema:** Added `PlaceAttributeInput` model and optional `attributes` field to `PlaceCreate`. The `POST /api/v1/places` endpoint now accepts and upserts attributes.
- **Place Detail Response:** Added `attributes` dict (flat key-value) to place detail responses for client consumption.
- **Backward Compatibility:** Kept `religion_specific` JSON column; new code reads from `PlaceAttribute` first, falls back to `religion_specific`.

### Data Scraper (`data_scraper/`)

- **Google Maps Scraper Generalization:**
  - **Environment Key:** Moved API key from hardcoded value to `GOOGLE_MAPS_API_KEY` env var. Added `data_scraper/.env.example`.
  - **Multi-Type/Country:** Renamed functions to be generic (`get_places_in_circle`, `get_place_details`). Added CLI args: `--country` (UAE, India, USA), `--type` (mosque, hindu_temple, church), `--mode` (csv, api).
  - **Attribute Mapping:** Scraper now maps Google fields to attribute codes (`wheelchair_accessible`, `google_rating`, `google_reviews_count`) and outputs `attributes` array in place payload.
  - **API Mode:** `--mode api` POSTs scraped places directly to `POST /api/v1/places` with `attributes` for auto-ingestion (no manual CSV import).
  - **CSV Mode:** Legacy `--mode csv` still works for exporting to CSV with weekly hours, images, reviews.
  - **Usage Example:** `python data_scraper/gmaps.py --country UAE --type mosque --mode api --api-url http://localhost:8000/api/v1/places`

### Frontend (Web + Mobile)

- **Types:** Added `attributes?: Record<string, unknown>` field to `Place` interface in `apps/web/src/lib/types/index.ts` and `apps/mobile/src/lib/types/index.ts`.

### Docs

- **ARCHITECTURE.md:**
  - Updated data model section (§4) to include `PlaceAttributeDefinition` and `PlaceAttribute`.
  - Added "Dynamic Attribute System (EAV Pattern)" subsection explaining benefits and backward compatibility.
  - Updated "Data Enrichment" section (§8) to document generalized Google Maps scraper with CLI args, env key, and API mode.
- **PRODUCTION.md:** Added `GOOGLE_MAPS_API_KEY` environment variable to all three deployment plans (Docker, Free services, GCP).
- **server/README.md:** (Pending update to env vars section.)

---

## Data Enrichment Scraper API (2026-02-15)

### Scraper Service (`data_scraper/`)
- **FastAPI Migration:** Refactored the standalone scraper script into a full **FastAPI service**.
- **Directory Refactor:** Restructured `data_scraper/app/` to match the main server's `server/app/` layout (subdirectories for `api/v1`, `db`, and `models`).
- **Database:** Integrated **SQLModel** and **SQLite** to manage data locations and scraper runs.
- **Smart Sheet Handling:** Updated to store the unique **Google Sheet ID** (code) instead of full URLs, ensuring robust construction of export links.
- **Run Management:** 
    - Added `POST /api/v1/scraper/runs` to initiate background scraping.
    - Added `POST /api/v1/scraper/runs/{run_code}/cancel` to safely abort active runs.
    - **Partial Persistence:** Implemented row-level commits so data extracted before cancellation is preserved.
- **Sync Mechanism:** Added background sync to push enriched data directly to the Main Server via the new `POST /api/v1/places` endpoint.

### Main Server (`server/`)
- **Database Migration:** Migrated from in-memory stores to a permanent **SQLite database** (`soulstep.db`) using **SQLModel**.
- **Data Integrity:** Added primary keys, unique constraints, and foreign keys across all models (Users, Places, Reviews, Groups, etc.).
- **Automatic Refresh:** Maintained the "refresh from seed" policy on startup, now clearing the persistent database and re-populating it from `seed_data.json`.
- **New Sync Endpoint:** Added `POST /api/v1/places` to accept `PlaceCreate` schema data from the scraper service.
- **Schema Update:** Added `PlaceCreate` and updated existing schemas for SQLModel compatibility.

---

## PlaceDetail UX + Real Sites + Glass Nav (2026-02-15)

### Frontend (mobile)

- **PlaceDetailScreen — Fixed hero scroll:** Hero image now stays fixed behind content. Card with content slides smoothly over the hero as user scrolls (parallax effect preserved).
- **Layout — Apple glass tab bar:** Custom tab bar using `expo-blur` BlurView with frosted glass effect, pill-shaped active indicator with primary color glow.

### Frontend (web)

- **PlaceDetail — Fixed hero scroll:** Hero section now uses `position: fixed` with a spacer div, allowing content card to slide over it naturally.
- **Layout — Enhanced glass nav:** Mobile bottom nav updated with `backdrop-blur-2xl backdrop-saturate-150`, subtle shadow, and pill indicator with glow effect.

### Backend

- **Seed data — 10 real pilgrimage sites:** Replaced placeholder places with actual world-famous sites:
  - **Islamic (4):** Al-Masjid al-Haram (Mecca), Al-Masjid an-Nabawi (Medina), Al-Aqsa Mosque (Jerusalem), Sultan Ahmed Mosque (Istanbul)
  - **Hindu (3):** Kashi Vishwanath Temple (Varanasi), Tirumala Venkateswara Temple (Tirupati), Kedarnath Temple (Uttarakhand)
  - **Christian (3):** St. Peter's Basilica (Vatican), Church of the Holy Sepulchre (Jerusalem), Sanctuary of Our Lady of Lourdes (France)
- **Seed data — New translations:** Added `common.readLess`, `notifications.emptyDesc`, `places.closed`, `places.places`, `placeDetail.visits` to all 3 languages (en/ar/hi).
- **Fixed Material Icons:** Replaced invalid icons (`water_drop` → `opacity`, `access_time` → `schedule`, `escalator_warning` → `wc`) in places API.

---

## PlaceDetail: Unified Layout (Mobile + Web)

### Frontend (mobile)

- **PlaceDetailScreen — Single unified layout:** Replaced the four religion-specific layout variants (Mosque, Temple, Church, Generic) with a single unified screen for all place types. The layout is driven by the backend-supplied `timings` and `specifications` arrays, so the same component handles all religions without branching.
- **PlaceDetailScreen — Parallax hero:** Full-bleed hero image (300px) with `Animated.Image` parallax (30% translation on scroll). Sticky header with place name fades in as the user scrolls past the hero.
- **PlaceDetailScreen — Card overlap:** White card with rounded top corners (borderRadius 28) slides up 32px over the hero via negative margin.
- **PlaceDetailScreen — Scorecards:** Three scorecards in a bordered row below the hero: Distance (tappable, opens Google Maps), Crowd Level (colour-coded green/amber/red), Check-in count.
- **PlaceDetailScreen — The Story:** Description section with 5-line clamp and Read more / Read less toggle.
- **PlaceDetailScreen — Religion carousel:** Horizontal scrollable carousel renders `TimingCircle` (prayers / service times with past / current / upcoming state styling) or `DeityCircle` (deity image or 🛕 placeholder) sub-components from the `place.timings` array. Carousel title adapts to religion.
- **PlaceDetailScreen — Facilities grid:** 2-column grid of `specCard` tiles, each with a Material Icon, translated label, and value from the `place.specifications` array.
- **PlaceDetailScreen — Sticky footer:** Two-button footer: outlined Directions button (opens maps) + Check In widget (spinner → scale-bounce → Checked-in badge).

### Frontend (web)

- **PlaceDetail — Single unified layout:** Replaced four religion-specific return branches with one unified layout. Timings and specifications are rendered from backend-supplied arrays.
- **PlaceDetail — Hero:** Full-bleed hero (300px mobile / 380px desktop) with gradient overlays, glass Open/Closed and rating badges, place name, and address. Back, Share, and Favourite buttons in top bar.
- **PlaceDetail — Card overlap:** Content card with rounded top corners (`rounded-t-[2rem]`) slides 32px over the hero via `-mt-8`.
- **PlaceDetail — Scorecards:** Distance (links to Google Maps), Crowd Level (emerald/amber/red colour classes), Check-in count in a divided row.
- **PlaceDetail — The Story:** Description with `line-clamp-5` and Read more / Read less toggle.
- **PlaceDetail — Religion carousel:** Horizontal scrollable row of `TimingCircle` or `DeityCircle` components from `place.timings`. Carousel title adapts to religion.
- **PlaceDetail — Specifications grid:** 2-column grid on mobile, 2–3 columns on desktop, using `place.specifications` array.
- **PlaceDetail — Desktop 2-column layout:** `lg:grid lg:grid-cols-[1fr_360px]` with main content on the left and a sticky sidebar containing scorecards + action buttons on the right.
- **PlaceDetail — Mobile sticky footer:** Directions + Check-in buttons pinned to the bottom.

### Backend

- **`_build_timings()` — Unified timings format:** Returns a typed array (`type`, `name`, `time`, `status`, `subtitle`, `image_url`) for all religions:
  - **Islam:** Prayer circles with `past` / `current` / `upcoming` status computed from current UTC time.
  - **Hinduism:** Deity circles with `type: "deity"`, `name`, `subtitle`, `image_url`.
  - **Christianity:** Service time circles from `service_times_array` (preferred) or `service_times` dict, with today's status logic.
- **`_build_specifications()` — Unified specifications format:** Returns icon + i18n label + value for all religion-specific metadata (Islam: capacity, wudu_area, parking, womens_area; Hinduism: architecture, dress_code, next_festival, festival_dates; Christianity: denomination, founded_year, style, notable_features).
- **Seed data:** Added `crowd_level: "Low"` to all 6 places; `wudu_area`, `womens_area` fields to Islam places; `service_times_array` to Christianity places; `description` text to all places.

### Types (mobile + web)

- **`PlaceTiming`:** Extended with `status?: 'past' | 'current' | 'upcoming'`, `type?: 'prayer' | 'service' | 'deity'`, `subtitle?: string`, `image_url?: string`.

---

## Inline Check-In: PlaceDetail (Mobile + Web)

### Frontend (mobile)

- **PlaceDetailScreen — Inline check-in widget:** Removed navigation to the empty `CheckInScreen`. The Check In button is now an inline widget in the PlaceDetail footer that calls the API directly. While the request is in flight, the button shows a spinner. On success, a spring scale animation plays, then the button transitions to a non-interactive "Checked in {date}" badge (green, with check-circle icon). If the user already visited the place, the badge renders immediately on load.
- **PlaceDetailScreen — All religion layouts updated:** The inline widget is used in all four layout variants (Mosque, Temple, Church CTA, and the generic default footer).
- **CheckInScreen removed:** `CheckInScreen.tsx` deleted; `CheckIn` removed from `RootStackParamList` and the stack navigator.

### Frontend (web)

- **PlaceDetail — Inline check-in widget:** Removed the `Link` to `/places/:placeCode/check-in`. All layout variants (Mosque inline card, Temple bottom bar, Church CTA, generic footer) now use an inline `checkInWidget()` that calls the API directly. Loading state shows a spinning icon. The success state transitions to an emerald-green "Checked in {date}" display. On initial load, already-visited places show the badge immediately.
- **CheckIn page removed:** `CheckIn.tsx` deleted; `/places/:placeCode/check-in` route removed from the router.

---

## Mobile: PlaceCard Full-Image Redesign

### Frontend (mobile)

- **PlaceCard — Full-image layout:** Regular list-view cards now use the image as a full-bleed background (280 px tall, `rounded-3xl`) matching the design system. Removed the separate white body section below the image.
- **PlaceCard — Gradient overlay:** Two layered semi-transparent `View`s simulate the design's top-to-bottom dark gradient, ensuring badge and text legibility over any photo.
- **PlaceCard — Glass badge system:** Open/Closed status and Visited badges are now frosted-glass pills (semi-transparent white background, white border) anchored to the top-left and top-right of the card respectively. Closed badge uses a darker background for contrast. Open badge includes a `#34d399` green dot.
- **PlaceCard — Bottom glass info panel:** Place name, address with `location_on` pin icon, a hairline divider, and a meta row (distance + star-rating pill) are now inside an absolute-positioned glass-morphism panel at the card bottom.
- **PlaceCard — Check In button:** A white pill button labeled "CHECK IN" appears in the meta row for places not yet visited. Tapping it navigates to the PlaceDetail screen.
- **PlaceCard — Review count formatting:** Added `formatCount` helper to display review counts as `"2.4k"` / `"12k"` instead of raw integers.

---

## Mobile: Profile Fixes, Home Map UX, Filter System

### Frontend (mobile)

- **ProfileScreen — My Wishlist removed:** Removed duplicate "My Wishlist" row from Preferences section; "Favorites" row in the Account section now uses translation key `profile.favorites`.
- **ProfileScreen — Language bottom sheet:** Tapping the Language row now opens an inline bottom-sheet modal with all supported languages; selecting a language switches the app locale in-place without navigating to a separate settings page. Language row subtitle now shows the currently selected language name (e.g. "English") instead of a generic description.
- **ProfileScreen — Dynamic version:** App version now reads from `expo-constants` (`Constants.expoConfig?.version`) with fallback to `1.0.0`.
- **Settings screen removed:** `SettingsScreen.tsx` deleted and `Settings` removed from `RootStackParamList` and the stack navigator.
- **NotificationsScreen — Dark-mode theming:** Replaced static `StyleSheet.create()` with `makeStyles(isDark)` factory. All colors (backgrounds, card surfaces, text, borders) now adapt to dark mode using the same token mapping as other screens. Back button replaced with a 40×40 circular icon button (`arrow-back`) matching the design system.
- **HomeScreen — Header cleanup:** Removed redundant "EXPLORE" label above the greeting. Greeting changed to "Hello," (updated translation key `home.greeting`).
- **HomeScreen — Map horizontal scroller:** Removed the place-count badge from map view. Added a horizontal `FlatList` scroller at the bottom of the map showing places visible in the current map bounds. Bounds are tracked via Leaflet `moveend` events posted through `ReactNativeWebView.postMessage`. Scroller updates automatically as the user pans/zooms the map.
- **HomeScreen — Animated place card panel:** Tapping a map pin now dismisses the horizontal scroller and reveals an inline place detail card using a spring animation (`Animated.spring`, `bounciness: 4`). Tapping the × on the card reverses the animation. Both panels share a single `Animated.Value` interpolated for `opacity` and `translateY`.
- **HomeScreen — Filter system:** Removed filter pills below the search bar. Added a `tune` icon button on the right of the search bar with an active-state dot badge. Tapping it opens a filter bottom-sheet with:
  - Place type chips (Mosque / Shrine / Temple)
  - Feature filter chips sourced from the backend response (Open Now, Has Parking, Women's Area, Has Events, Top Rated) with live counts
  - "Apply Filters" button re-fetches places with selected filters

### Backend

- **`/api/v1/places` — New filter params:** Added `open_now`, `has_parking`, `womens_area`, `top_rated` query parameters (all `Optional[bool]`). Each applies a filter to the result set in `db/places.py`.
- **`/api/v1/places` — FiltersMetadata in response:** Response envelope changed from a plain places array to `{"places": [...], "filters": {"options": [...]}}`. Filter option counts are computed on a snapshot of the base result set (before boolean filters), so counts accurately reflect the available pool regardless of which filters are active.
- **`schemas.py`:** Added `FilterOption`, `FiltersMetadata`, and `PlacesListResponse` Pydantic models.

### Mobile API client + types

- **`types/index.ts`:** Added `FilterOption` and `PlacesListResponse` interfaces.
- **`api/client.ts`:** Updated `GetPlacesParams` with new filter fields; `getPlaces()` now returns `Promise<PlacesListResponse>`.

### i18n

- **`seed_data.json`:** Updated `home.greeting` (en: "Hello,", ar: "مرحبا،", hi: "नमस्ते,"). Added `profile.favorites`, `home.noPlacesVisible`, `home.filters`, `home.clearAll`, `home.filterType`, `home.filterFeatures`, `home.applyFilters`, `home.filter_mosque/shrine/temple`, `notifications.updatesLabel` for all three supported languages.

### Docs

- Updated `CHANGELOG.md`.

---

## Mobile: Profile Redesign, Home Map Toggle, Dark Mode Fix

### Frontend (mobile)

- **Dark mode fix:** Replaced static `StyleSheet.create()` in `ProfileScreen` and `HomeScreen` with `makeStyles(isDark: boolean)` factory functions called inside each component, so all styles (colors, borders, backgrounds) recompute immediately when `isDark` changes in `ThemeProvider`. Tab bar in `Layout.tsx` also respects dark mode (background and border color).
- **ProfileScreen rebuild:** Complete rewrite matching `FRONTEND_REWAMP_DARK/LIGHT` design. Header now shows bold display name + calendar icon + join date (no avatar circle). Stats replaced with a 2-column grid (Check-Ins, Reviews). Faith selector pills removed. New PREFERENCES card with My Path, Language, Notifications, My Wishlist (chevrons) and Dark Mode (Switch toggle, no chevron) as the last row. ACCOUNT section simplified to My Check-Ins and Favorites. Logout button added (red text, centered). Version string at bottom.
- **HomeScreen map embed:** Map view is now embedded directly in `HomeScreen` with a list/map toggle (two icon buttons in the header — list icon and map icon). The same search bar and filter chips apply to both views. Switching to map mode renders the Leaflet WebView with place markers; tapping a marker shows the existing bottom-sheet place detail modal. The separate Map bottom tab is removed.
- **Layout.tsx — 3 tabs:** Map tab removed. Bottom nav is now Explore, Groups, Profile (3 tabs). Tab bar background and border colors update correctly in dark mode.

### Backend / i18n

- **seed_data.json:** Added missing translation keys `settings.darkMode` ("Dark Mode" / "الوضع المظلم" / "डार्क मोड") and `profile.preferences` ("Preferences" / "التفضيلات" / "प्राथमिकताएं") for all three supported languages (en, ar, hi).

### Docs

- Updated `CHANGELOG.md`.

---

## Mobile UI & Feature Overhaul

### Frontend (mobile)

- **Navigation:** App now opens directly on the Home tab (Explore) on launch. The SplashScreen shows a loading spinner and immediately redirects to `Main` without showing auth buttons, removing the blocking onboarding gate.
- **Profile — Unauthenticated state:** When the user is not logged in, the Profile tab shows a full login landing page (hero image, app title, tagline, "Get Started" → Register, "Sign In" → Login) instead of a bare sign-in prompt.
- **Profile — Authenticated state:** Redesigned with proper MaterialIcons (settings, edit, assignment, favorite, group, chevron-right, dark-mode). Removed unicode symbol placeholders.
- **Profile — Dark mode toggle:** Added a `Switch` row directly in the Profile screen account section to toggle between light and dark mode, using the existing `ThemeProvider` context.
- **Places list cleanup:** Removed the inline `PlaceCardFull` component from `HomeScreen.tsx` (~100 lines of duplicated card code). The `FlatList` now uses the shared `PlaceCard` component, eliminating the duplicate card implementation. Updated search, filter, and map button icons with `MaterialIcons`.
- **Place detail:** Updated all icon buttons (back, share, favorite) across mosque, temple, church, and generic variants to use `MaterialIcons` (arrow-back, share, favorite, favorite-border, location-city, account-balance). Mosque footer reordered to match design: Directions (outline) | Check-in Here (primary blue). Generic footer also updated with proper icons.
- **Map page fix:** Root cause was that no map library was installed and `MapScreen` rendered a `ScrollView` list. Fixed by installing `react-native-webview` and embedding a Leaflet.js + OpenStreetMap map in a `WebView`. Place markers are rendered on the map; tapping a marker opens the existing bottom sheet. Map centers on user location, falling back to Mecca coordinates. Search bar overlays the map.
- **Icons — App-wide:** Replaced all unicode approximations (⊙, ◻, ◇, ○, ⌕, ›, ⚙, ⎘, ←, ♥, ♡, ⊕, ⊞) with `@expo/vector-icons` `MaterialIcons` across `Layout.tsx` (tab bar), `PlaceCard.tsx` (location-on, check-circle), `HomeScreen.tsx` (search, map, tune, location-off), `MapScreen.tsx` (search, close, directions, share, location-on, chevron-right), and `PlaceDetailScreen.tsx`.

### Docs

- Updated `CHANGELOG.md` with all mobile changes.

---

## D-1: Desktop layout and navigation

- **Layout:** Top bar on md+ with logo (app name), Explore, Map, Groups, Profile, Notifications, Profile/Login. Main content max-w-6xl xl:max-w-7xl. Mobile: bottom nav (Explore, Map, Groups, Profile). All main routes reachable from nav.

---

## D-2: Desktop – Explore and Map

- **Home:** Place cards grid uses md:grid-cols-2 lg:grid-cols-3 for 2–3 column layout on desktop.
- **Map:** On md+, right side panel (w-96) with selected place card and place list; map fills remaining area. Mobile: unchanged (bottom sheet).

---

## D-3 / D-4: Desktop – Place Detail, Profile, Groups, Write Review, Check-in History

- Place Detail, Profile, Groups, Write Review, and Check-in History use the same content and components as mobile within Layout’s max-width content area; no separate desktop layouts added.

---

## X-1: API contracts and data flow

- **GET /places** and **GET /places/:code**: Return religion_specific, is_open_now, average_rating, review_count (when include_rating=true), website_url, has_events. Place detail includes user_has_checked_in, is_favorite when authenticated.
- **GET /users/me/check-ins**: Returns place name, place_image_url, date, time, location (address) per check-in; frontend types extended accordingly.
- **GET /users/me/stats**: Returns visits, reviews, badges_count; frontend uses these for Profile.
- **GET /groups**: Returns last_activity, sites_visited, total_sites, next_place_name, featured; frontend types and Groups UI use these.
- No backend changes required for current UI; any gaps documented above.

---

## Frontend Revamp — Phase 3 & 4 (2026-02-14)

### Frontend — Web
- **Home:** Uniform h-72 rounded-3xl glass cards for all places; filter chips updated to `all/mosque/shrine/temple` passing `place_type` query param; tune icon in search bar; map icon navigates to `/map`.
- **CheckInsList:** Added "On This Day" section (uses new `GET /me/check-ins/on-this-day` endpoint) and "This Month" section (uses `GET /me/check-ins/this-month`); dark mode support; `CheckInCard` extracted as reusable component.

### Frontend — Mobile
- **HomeScreen:** Uniform `h-288` glass cards for all places (matching web); filter chips updated to `all/mosque/shrine/temple` with `place_type` mapping; inline `PlaceCardFull` component; map button navigates to Map tab.
- **CheckInsListScreen:** Added "On This Day" section and "This Month" section using new API endpoints matching web.

### Backend
- Two new endpoints: `GET /users/me/check-ins/this-month`, `GET /users/me/check-ins/on-this-day`.

---

## M-10: Check-in History / My Journey (mobile + mobile web)

**Done when:** Check-in History matches DESIGN_FILE_V2 “Journey Log”: title, total visits + This month, calendar with month nav and check-in indicators, Recent Visits list.

### Frontend — Web

- **CheckInsList:** “Journey Log” title, stats card (Total Visits count + “sacred places”, This Month). Calendar: month label, prev/next nav, 7×6 grid with check-in days highlighted (blue dot; today filled primary). Recent Visits: cards with place image, name, date/time, location, link to place detail. Uses GET /me/check-ins; calendar derived from checked_in_at on client. Light variant (gradient background, white cards).

### Frontend — Mobile

- **CheckInsListScreen:** Same structure with tokens: stats card, calendar with month nav and day grid (check-in dots, today primary), Recent Visits list with thumb, name, date, location. Uses theme tokens.

### Backend

- **CheckIn type:** Extended with date, time, place_name, place_image_url, location (API already returns these).
- **i18n:** journey.myJourney, journey.journeyLog, journey.subtitle, journey.totalCheckIns, journey.totalVisits, journey.thisMonth, journey.sacredPlaces, journey.recentActivity, journey.recentVisits, journey.viewAll (en, ar, hi).

---

## M-9: Write a Review (mobile + mobile web)

**Done when:** Write Review matches DESIGN_FILE_V2: header (Cancel, Write Review, Save), place name/location/thumb, stars, text area, photo strip, Post Anonymously, Submit, success overlay.

### Frontend — Web

- **WriteReview:** Header with Cancel, “Write Review” title, Save (edit only). Place name, address, thumb image. Star rating (1–5) with label. Textarea “Share your experience…”. Photo add button (placeholder). Post Anonymously toggle. Submit button (floating for create). Success overlay “Review Posted” / “Your voice has been heard.” / Return. createReview sends is_anonymous; API client accepts is_anonymous and photo_urls.

### Frontend — Mobile

- **WriteReviewScreen:** Same layout with tokens: header, place row with thumb, stars, textarea, add photo button, Post Anonymously toggle, floating Submit (or bottom Save for edit). Success modal with Return. Passes is_anonymous to createReview.

### Backend

- **i18n:** writeReview.title, shareExperience, postAnonymously, submit, reviewPosted, yourVoiceHeard, return, addPhoto (en, ar, hi).

---

## M-8: My Pilgrimage Groups (mobile + mobile web)

**Done when:** Groups list matches DESIGN_FILE_V2 “My Pilgrimage Groups”: My Groups header, notifications icon, featured card, list with progress, FAB.

### Frontend — Web

- **Groups:** Header “My Groups” + notifications link. Featured group card (first/featured): gradient (blue), “Featured” badge, name, “Next: {next_place_name}”, progress bar with %, member placeholder avatars + “+N”, arrow CTA; links to group detail. List: each group has name, last active (relative time), “X/Y Sites”, level badge (New, Lvl 1–5, Done), progress bar; member avatars row. FAB “+” to create group. Uses GET /groups (last_activity, sites_visited, total_sites, next_place_name, featured).

### Frontend — Mobile

- **GroupsScreen:** Same structure with tokens: header with title and notifications button, featured card (gradient, progress, next, avatars, arrow), list rows with last active, sites count, level badge, progress bar, overlapping avatar circles; FAB + for Create Group.

### Backend

- **Group type:** Extended with last_activity, sites_visited, total_sites, next_place_code, next_place_name, featured (API already returns these).
- **i18n:** groups.myGroups, groups.featured, groups.next, groups.currentProgress, groups.sitesCount, groups.lastActive, groups.noGroupsYet, groups.noGroupsDescription (en, ar, hi).

---

## M-7: User Profile & Stats (mobile + mobile web)

**Done when:** Profile matches DESIGN_FILE_V2 “User Profile & Stats”: avatar, name, Joined date, stats (Visits, Reviews, Badges), faith toggle, Edit Profile, Account (My Check-ins, Favorite Places, Group Activity), app version.

### Frontend — Web

- **Profile:** Gradient header, “Profile” title and settings icon; avatar (144px), name, “Joined {date}” from user.created_at; stats row (Visits, Reviews, Badges from GET /me/stats: visits, reviews, badges_count); faith pill (Islam / Christianity / Hinduism) linking to /select-path; Edit Profile button; Account section with My Check-ins, Favorite Places, Group Activity (icons and labels); version at bottom. Uses design tokens.

### Frontend — Mobile

- **ProfileScreen:** Same structure with theme tokens: header (centered “Profile”, settings button), avatar 144px, name, Joined date, three-column stats, faith pill (Islam/Christianity/Hinduism) to SelectPath, Edit Profile button, Account card with three rows, version. GET /me/stats for visits, reviews, badges_count.

### Backend

- **UserStats:** API already returns visits, reviews, badges_count; frontend types extended with optional visits, reviews, badges_count.
- **i18n:** profile.visits, profile.reviews, profile.badges, profile.joined, profile.account, profile.myCheckIns, profile.favoritePlaces, profile.groupActivity, profile.selectPilgrimagePath, profile.version (en, ar, hi).

---

## M-6: Map Discovery tab and screen (mobile + mobile web)

**Done when:** Map tab in bottom nav; Map screen matches DESIGN_FILE_V2 “Map Discovery View”: search, map/list, bottom sheet with selected place, Get Directions.

### Frontend — Web

- **Map page:** Full-height map (PlacesMap) with search bar at top, layers + my location buttons on the right. Markers call `onPlaceSelect(place)`; bottom sheet shows selected place (image, name, address, rating, distance, Open Now), Get Directions (opens maps URL), Share. Search triggers GET /places with 300ms debounce.

### Frontend — Mobile

- **MapScreen:** Search bar, list of places (thumb from `image_urls[0]`, name, address, rating/distance/Open Now). Tap opens modal bottom sheet with selected place card, Get Directions, Share, and link to PlaceDetail. No native map yet (list + sheet only); uses theme tokens.

### Backend

- No backend changes; uses existing GET /places with lat/lng and optional search.

---

## M-5: Place Detail – Hindu temple and Christian church variants (mobile + mobile web)

**Done when:** Place Detail branches on religion to show mosque (M-4), Hindu temple, or Christian church variant; temple and church match DESIGN_FILE_V2.

### Frontend — Web

- **PlaceDetail:** When `place.religion === 'hinduism'`: temple variant — hero (55vh), back/share/favorite, “Hindu Temple” badge + rating, name + address; row Opens At / Distance / Crowd from opening_hours, distance, religion_specific.crowd_level; Sanctum Story (description + Read more); Divine Presence (deities carousel from religion_specific.deities); Essential Information (Architecture, Next Festival, Dress Code + notes); Pilgrim Voices (ReviewsPreview); footer Directions + Check-in. When `place.religion === 'christianity'`: church variant — hero 420px, back/bookmark/share, place_type + Open badges, name + address; stats row rating, Founded (founded_year), Style (style); Get Directions + Visit Website (website_url); The Sanctuary (description); Service Times table from religion_specific.service_times; Pilgrim Voices; floating CTA “Start Pilgrimage” (check-in).

### Frontend — Mobile

- **PlaceDetailScreen:** Temple variant: hero with type badge + rating, Opens At / Distance / Crowd row, Sanctum Story, Divine Presence (horizontal deities), Essential Information grid, Pilgrim Voices; footer Directions + Check-in. Church variant: hero with type + Open badges, stats row (rating, Founded, Style), Directions + Visit Website, The Sanctuary, Service Times list, Pilgrim Voices; bottom CTA “Start Pilgrimage”. Shared variantStyles for temple/church.

### Backend

- **i18n:** placeDetail.opensAt, distance, crowd, sanctumStory, divinePresence, principalDeities, viewAll, essentialInfo, architecture, nextFestival, dressCode, dressCodeNotes, pilgrimVoices, founded, style, theSanctuary, serviceTimes, fullSchedule, visitWebsite, startPilgrimage, hinduTemple, reviewsCount; common.readMore (en, ar, hi).

---

## M-4: Place Detail – mosque variant (mobile + mobile web)

**Done when:** Place Detail for mosque matches DESIGN_FILE_V2 “Place Details - Mosque”: hero, back/share/favorite, Open Now & distance, name & address, Prayer Times, About, Details & Facilities, Check-in & Directions, Recent Reviews.

### Frontend — Web

- **PlaceDetail:** When `place.religion === 'islam'`, render mosque variant: hero 420px, rounded-b-2.5rem, back + share (glass) + favorite on hero; Open Now and distance badges; name (text-3xl white) and address. Sections: Prayer Times (horizontal scroll, Fajr–Isha + date badge from `religion_specific.prayer_times`), About (description + Read Full Story), Details & Facilities (2×2 grid: Capacity, Wudu Area, Parking, Women’s Area from `religion_specific`), Check-in + Directions buttons, Recent Reviews (rating badge + ReviewsPreview with hideTitle). SharePlaceButton supports `variant="glass"` for hero. ReviewsPreview supports `hideTitle`.

### Frontend — Mobile

- **PlaceDetailScreen:** When `place.religion === 'islam'`, render mosque variant: hero 420px with overlay, back/share/favorite circle buttons, Open Now & distance badges, name & address. ScrollView: Prayer Times (horizontal), About, Details & Facilities (2-col grid), Recent Reviews; footer Check-in + Directions. Uses `tokens` and new i18n keys.

### Backend

- **i18n:** Added `placeDetail.prayerTimes`, `placeDetail.about`, `placeDetail.readFullStory`, `placeDetail.detailsAndFacilities`, `placeDetail.capacity`, `placeDetail.wuduArea`, `placeDetail.parking`, `placeDetail.womensArea`, `placeDetail.directions`, `placeDetail.recentReviews`, `placeDetail.whatPeopleSay`, `placeDetail.readAllReviews`, `placeDetail.fajr/dhuhr/asr/maghrib/isha` (en, ar, hi).

---

## M-3: Explore Sacred Places – Home (mobile + mobile web)

**Done when:** Home/Explore matches DESIGN_FILE_V2 “Explore Sacred Places”: greeting, search, filter chips, hero card, place list, bottom nav.

### Frontend — Web

- **Home:** Gradient background (F0F7FF → FFFFFF). Header: “Explore” label, greeting “Assalamu Alaikum,” + name (text-2xl extralight / text-3xl normal). List/Map toggle (pill, primary when active). Search bar (border-b, search icon). Filter chips: Nearby (default), Historical, Jummah, Events (single-select; Jummah/Events UI only until backend). Hero: first place as large card (rounded-2rem, ~28rem height), image, overlay, glass-style bottom with name, address, rating, distance, “Details” link. Remaining places as PlaceCard grid. GET /places with lat/lng, sort distance; place_type=temple for Historical.

### Frontend — Mobile

- **HomeScreen:** Same structure: surfaceTint background, “Explore” label, greeting + name, search (underline), horizontal chips (Nearby, Historical, Jummah, Events). Hero card: first place 320px height, image, dark overlay, glass bottom card (name, address, rating, distance, “Details”). FlatList of remaining PlaceCards. Theme tokens throughout.

### Backend

- **i18n:** `home.greeting` (Assalamu Alaikum / السلام عليكم / नमस्ते), `home.historical`, `home.jummah`, `home.events`, `home.details`; `home.findPlace` updated to “Search for places…” (en).

---

## M-2: Select Your Path (mobile + mobile web)

**Done when:** Select Path screen matches DESIGN_FILE_V2.html “Select Your Path”: faith cards, View More Faiths, Skip for now; settings API saves religion preference.

### Frontend — Web

- **SelectPath:** Full-viewport layout with gradient background (F0F5FA → E6EEF5). Header: title “Select Your Path” (32px semibold), subtitle “Begin your spiritual journey.” Three faith cards: large circular buttons (144px) with Material Symbol icons (mosque, temple_hindu, church), label below; toggle selection; faith-specific hover (emerald/orange/blue). Footer: Continue (when any selected), “View More Faiths”, “Skip for now”. Saves selection via `updateSettings({ religions })` and navigates to /home.

### Frontend — Mobile

- **SelectPathScreen:** Same layout and copy: gradient-style background, back button, centered header (title 32px, subtitle), three faith cards with 144px circle, emoji icons (🕌 🛕 ⛪), selection ring per faith accent (emerald/orange/blue). Footer: Continue when selected, “View More Faiths”, “Skip for now”. Uses `updateSettings({ religions })` and navigates to Main.

### Backend

- **i18n:** `selectPath.subtitle` set to “Begin your spiritual journey.” (en, ar, hi); added `selectPath.viewMoreFaiths` (en, ar, hi).

---

## M-1: Design tokens and shared components (DESIGN_FILE_V2)

**Done when:** Tokens and reusable components from DESIGN_FILE_V2.html for web and mobile; PlaceCard with rating and Open Now; BottomNav Explore, Map, Groups, Profile.

### Design tokens

- **Web:** `tailwind.config.js` extended with DESIGN_FILE_V2 tokens: primary, primary-dark, primary-hover, accent, background-light, surface, soft-blue, surface-tint, text-main, text-dark, text-secondary, text-muted, blue-tint, icon-grey; fontFamily Inter (replacing Lexend); borderRadius lg/xl/2xl/3xl/full; boxShadow soft, card, elevated, floating, nav, subtle. `index.html` font switched to Inter.
- **Mobile:** `apps/mobile/src/lib/theme.ts` with same tokens (colors, borderRadius, shadow, typography) for use in StyleSheet and components.

### Reusable components

- **PlaceCard (web + mobile):** Image, name, address, distance, rating (average_rating + review_count), “Open Now” badge when `is_open_now`, “Visited” badge; uses design tokens. Place type extended with optional `average_rating`, `review_count`, `is_open_now`.
- **BottomNav:** Matches design labels and tabs: **Explore** (Home), **Map**, **Groups**, **Profile**. Web: `Layout` nav items and route `/map`; Map page full-height PlacesMap. Mobile: tab order Home, Map, Groups, Profile; MapScreen lists places (native map can be added later); Favorites removed from tab bar (still reachable via Profile/stack). Icons: Material-style labels; mobile uses symbol text (⊕, ◉, ◆, ○) until vector icons added.
- **Buttons & chips:** Web: `PrimaryButton` (primary/secondary), `FilterChip`, `SearchBar`. Mobile: `PrimaryButton`, `FilterChip`, `SearchBar` using theme tokens.

### Backend

- **i18n:** Seed translations for `places.openNow`, `places.visited`, `nav.map` (en, ar, hi).

---

## Web I18n: align with mobile (ready, gate until loaded)

**Done when:** Web I18n context uses `ready` like mobile; web app waits for initial translations before rendering routes so no raw keys flash.

### Frontend — Web

- **I18nProvider:** Replaced `loading` with `ready` in context so web and mobile share the same shape (`useI18n().ready`). `ready` is set only after initial locale and translations have loaded (single bootstrap effect: loadLanguages → resolveInitialLocale → setLocaleState → loadTranslations(initial) → setReady(true)); user-settings locale override still loads translations after setting locale.
- **App:** Added `I18nReadyGate` inside `I18nProvider`: shows a minimal splash (logo, “Pilgrimage”, spinner) until `ready` is true, then renders `LocationProvider` and `AppRoutes`. Prevents untranslated strings (translation keys) from appearing on first paint.

---

## Redesign: BE-3 groups (progress, next place, featured), location, auth flow, i18n

**Done when:** Groups list API returns progress and next place; optional group path; single root stack and location provider; i18n device locale and settings sync.

### Backend

- **Groups list (`GET /api/v1/groups`):** Each group now includes `last_activity` (latest check-in among members), `sites_visited`, `total_sites`, `next_place_code`, `next_place_name` (first unvisited site in path when applicable), and `featured` (true for first group). New helpers: `get_last_activity(group_code, check_ins_db)`, `get_group_progress(group_code, check_ins_db, places_db)` in `app/db/groups.py`.
- **Group path:** Optional `path_place_codes` (ordered list of place_codes) on Group; `create_group` and `GroupCreateBody` accept `path_place_codes`; seed supports `path_place_codes` in group JSON. Progress “X/Y sites” and “next place” are derived from path and member check-ins when path is set.
- **Places, reviews, users, check-ins:** (From earlier BE-1/BE-2 work) Places: `is_open_now`, `website_url`, `has_events`, `jummah`/`has_events` filters; reviews: `is_anonymous`, `photo_urls`; user stats and check-ins list shape as documented.

### Frontend — Web

- **Location:** `LocationProvider` in `app/contexts/LocationContext.tsx`; coords from geolocation used for `getPlaces` (lat/lng). Home uses `useLocation().coords`.
- **Auth/routes:** Root redirects to `/home`; Home and PlaceDetail no longer behind ProtectedRoute (signed-out can browse); Register redirects to `/home` after signup.
- **I18n:** Initial locale from API language list + device locale or stored locale; `updateSettings({ language })` called when user changes language.

### Frontend — Mobile

- **Location:** `expo-location` plugin; `LocationContext` provides coords (default 0,0 when denied); Home passes lat/lng to `getPlaces`.
- **Navigation:** Single root stack (Splash → Main, Login, Register, etc.); Splash shows spinner then replaces to Main when i18n ready; Login/Register replace to Main on success.
- **Auth:** Favorites and Profile show “Sign in to view” + Login when not signed in; no SelectPath redirect after register.
- **I18n:** Device locale via NativeModules; `resolveInitialLocale` from API list; language change calls `updateSettings({ language })`.
- **UI:** Back buttons and safe area on CheckIn, CreateGroup, JoinGroup, Notifications, SelectPath, Settings; CheckIn receives `placeCode` from route params.

### Docs

- **ARCHITECTURE.md:** Data model §4 updated for Group `path_place_codes`; API §5 updated for groups list response fields and create body `path_place_codes`.

---

## Web app migration to TypeScript architecture (apps/web)

**Done when:** Web app uses `app/`, `components/`, and `lib/` layout; docs and Cursor globs updated; flows verified.

### Structure (apps/web/src/)

- **app/** – `App.tsx`, `providers.tsx` (Auth + I18n), `routes.tsx`, and all pages under `app/pages/` (Splash, Login, Register, Home, PlaceDetail, Profile, Favorites, Groups, Notifications, Settings, Write review, Check-in, CreateGroup, GroupDetail, JoinGroup, EditProfile, CheckInsList, ForgotPassword, ResetPassword, SelectPath).
- **components/** – Layout, ProtectedRoute, PlaceCard, PlacesMap, EmptyState, ErrorState.
- **lib/** – `lib/api/client.ts` (all API calls), `lib/types/index.ts` (Place, User, Group, etc.), `lib/theme.ts`, `lib/constants.ts`, `lib/share.ts`. Entry remains `main.tsx` → App → providers → routes.

### Features (unchanged behavior)

- All routes and flows preserved: Splash → Register/Login → Select Path → Home (list + map) → Place detail → Check-in, Profile, Favorites, Groups, Settings, Notifications, Write review. Map view (Leaflet) with pins, search/filters shared by list and map. Empty and error states with Retry; responsive desktop; accessibility (focus, aria-labels); PWA manifest and service worker (vite-plugin-pwa).

### Docs and rules

- **ARCHITECTURE.md** – Section 6 updated: web app layout documented (`app/`, `components/`, `lib/`); state in providers; no shared `packages`.
- **apps/web/README.md** – Structure section updated to describe `app/`, `components/`, `lib/`.
- **.cursor/rules/schema-api-codes.mdc** – Globs updated to `apps/web/src/lib/types/**/*` and `apps/web/src/lib/api/**/*` (types and API live under `lib/`).

---

## Multi-language support (en / ar / hi) and central seed

**Done when:** Backend serves languages and translations; user language in settings; one seed file populates all in-memory data; web and mobile use `t(key)` with RTL for Arabic.

### Backend

- **i18n:** `GET /api/v1/languages` and `GET /api/v1/translations?lang=` (no auth). In-memory store in `app/db/i18n.py`; fallback to English for missing keys.
- **User settings:** Optional `language` (en, ar, hi) on `GET/PATCH /api/v1/users/me/settings`.
- **Central seed:** Single `app/db/seed_data.json` with languages, translations (en, ar, hi), users, places, groups, reviews, check_ins, notifications, favorites. `app/db/seed.py` runs on app startup and populates all stores; inline seed removed from `places.py`. Seed can be re-run by restarting the server or `python -m app.db.seed`.

### Frontend — Web

- **API:** `getLanguages()`, `getTranslations(lang)` in `api/client.ts`.
- **I18nContext:** Fetches languages and translations; locale from user settings (when logged in), else `pilgrimage-locale` in localStorage, else browser language; exposes `locale`, `setLocale`, `t(key)`. RTL: `document.documentElement.dir = 'rtl'` and `lang` when locale is `ar`.
- **Settings:** Language dropdown (from API); saving updates settings and refetches translations.
- **Copy:** Customer-facing strings in pages and Layout replaced with `t('key')`; keys added to seed for en, ar, hi.

### Frontend — Mobile

- **API:** `api/client.js` with `getLanguages()` and `getTranslations(lang)` (uses `EXPO_PUBLIC_API_URL`).
- **I18nContext:** Locale in AsyncStorage; loads languages/translations; `I18nManager.forceRTL(true)` when locale is `ar`; exposes `locale`, `setLocale`, `t`, `languages`, `ready`.
- **Example screen:** Settings screen with language picker and `t()` for title and labels; same translation keys as web.

### Docs

- **.cursor/rules/i18n-translations.mdc:** Updated for English, Arabic, Hindi; backend as source; fallback to English; RTL for Arabic.
- **server/README.md:** Seed data section (file location, runner, reset); i18n endpoints listed.

---

## Switch mobile app from Capacitor to Expo

**Done when:** Mobile app uses Expo (React Native) for iOS/Android; all Capacitor references removed.

### Removed

- **Capacitor:** No Capacitor packages were in use; all references to Capacitor removed from docs, `.gitignore`, and Cursor rules.
- **apps/mobile (Vite + React):** Replaced with a new Expo (React Native) app. The previous Vite-based mobile app was removed; it had been intended for Capacitor wrapping.

### Added

- **Expo app** in `apps/mobile`: Created with `create-expo-app@latest --template blank`. Package name `@soulstep/mobile`; scripts include `dev` and `start` (both run `expo start`), plus `ios`, `android`, `web`.
- **.gitignore:** Capacitor section replaced with Expo section (`.expo/`, `web-build/`, common Expo artifacts).

### Updated

- **README.md (root):** Mobile described as Expo; run instructions and env (`EXPO_PUBLIC_API_URL`) for Expo.
- **apps/mobile/README.md:** Rewritten for Expo (run, build for iOS/Android, EAS, env).
- **ARCHITECTURE.md:** Mobile stack is Expo (React Native); diagrams and tables updated.
- **PRODUCTION.md:** Plan 1–3 mobile build steps use Expo (EAS or `expo run:ios`/`android`); env `EXPO_PUBLIC_API_URL`.
- **IMPLEMENTATION_PROMPTS.md:** Stack recap and prompts refer to Expo instead of Capacitor.
- **.cursor/rules/frontend-replication.mdc:** Web is Vite+React; mobile is Expo/React Native; feature parity and API sync described.
- **.cursor/rules/readme-maintenance.mdc:** Mobile README described as Expo.

### Note

The new `apps/mobile` is a blank Expo template. Screens, API client, and navigation (e.g. Expo Router or React Navigation) need to be implemented to match the web app’s flows and API usage.

---

## Python 3.14 (latest) as standard

**Done when:** Docs and requirements reference Python 3.14 (or 3.11+); local and production paths use latest Python where available.

### Backend / Docs

- **server/requirements.txt** – Comment added: Python 3.14+ (or 3.11+); venv creation command.
- **README.md (root)** – Prerequisites: Python 3.14 (or 3.11+), Homebrew note for macOS. Setup uses `python3 -m venv .venv`.
- **server/README.md** – States Python 3.14 (or 3.11+) required; Homebrew hint; `python3 -m venv .venv` in Run.
- **ARCHITECTURE.md** – Backend runtime: Python 3.14 (or 3.11+).
- **PRODUCTION.md** – Plan 1 Docker: base image `python:3.14-slim` (fallback `python:3.12-slim` if needed).
- **IMPLEMENTATION_PROMPTS.md** – Stack recap: Python 3.14 (or 3.11+).

To use Python 3.14 for the server venv: `cd server && rm -rf .venv && /opt/homebrew/bin/python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`.

---

## Implemented features (Python + FastAPI backend, web and mobile frontends)

**Done when:** Full stack is implemented: backend API (auth, places, reviews, check-ins, groups, notifications, user management) and replicated UIs in web and mobile.

### Backend (server/app/ — Python + FastAPI)

- **Auth:** `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `POST /api/v1/auth/forgot-password`, `POST /api/v1/auth/reset-password`. JWT (python-jose), password hashing (passlib/bcrypt). In-memory user store with `user_code`, religion enum, reset tokens.
- **Users:** `GET/PATCH /api/v1/users/me`, `PATCH /api/v1/users/me/religion`, `GET /api/v1/users/me/check-ins`, `GET /api/v1/users/me/stats`, `GET /api/v1/users/me/favorites`, `GET/PATCH /api/v1/users/me/settings`.
- **Places:** `GET /api/v1/places` (religion, lat, lng, radius, place_type, search, sort, limit, offset; distance when lat/lng given). `GET /api/v1/places/{place_code}` (detail with religion-specific fields). Seed places (Islam, Hinduism, Christianity).
- **Reviews:** `GET /api/v1/places/{place_code}/reviews`, `POST /api/v1/places/{place_code}/reviews`. `PATCH/DELETE /api/v1/reviews/{review_code}` (author only). Aggregate rating/count on place.
- **Check-ins:** `POST /api/v1/places/{place_code}/check-in` (optional note/photo). Place detail and list can include “user has checked in” for current user.
- **Favorites:** `POST/DELETE /api/v1/places/{place_code}/favorite`, `GET /api/v1/users/me/favorites`.
- **Groups:** `GET/POST /api/v1/groups`, `GET /api/v1/groups/by-invite/{invite_code}`, `POST /api/v1/groups/join-by-code`, `GET/PATCH /api/v1/groups/{group_code}`, `POST /api/v1/groups/{group_code}/join`, `GET /api/v1/groups/{group_code}/members`, `GET .../leaderboard`, `GET .../activity`, `POST .../invite`. Notifications created on join.
- **Notifications:** `GET /api/v1/notifications` (paginated), `PATCH /api/v1/notifications/{notification_code}/read`. In-memory store.
- **Settings:** `GET/PATCH /api/v1/users/me/settings` (e.g. notifications_on, theme, units). In-memory per-user settings.

### Frontend — Web (apps/web)

- **Auth:** Splash, Register, Login, Forgot/Reset password, Select Path (religion). AuthContext, ProtectedRoute, JWT in localStorage.
- **Home:** List/map view, debounced search, filter chips (Nearby, Mosque, Temple, Church), place cards with distance; SimpleMap with pins and selected place preview; empty/error + Retry.
- **Place detail:** Full place info, religion-specific sections, check-in (modal), favorite toggle, reviews list, link to write review.
- **Write review:** Form (rating, title, body); submit to `POST .../reviews`; redirect to place detail.
- **Profile:** User card, stats (places visited, check-ins this year), visited places list, Favorites/Settings links, Edit profile.
- **Favorites:** List of saved places (card style); empty state; error + Retry.
- **Groups:** List, Create Group, Group Detail (members, leaderboard, activity), Join by invite code. API: getGroups, createGroup, getGroup, getGroupByInviteCode, joinGroupByCode, **joinGroup**, getGroupLeaderboard, getGroupActivity.
- **Notifications:** List (paginated), mark read.
- **Settings:** Theme (localStorage + PATCH), notifications toggle, units. Layout: notifications link (desktop) and floating icon (mobile).
- **Layout:** Bottom nav (Explore, Saved, Pilgrimage, Profile); top nav on desktop; Pilgrimage → `/groups`; active state for `/groups` and sub-routes.

### Frontend — Mobile (apps/mobile)

- **Replicated:** Same screens and flows as web (Splash, Auth, Home with search/filters/map, Place detail, Write review, Profile, Favorites, Groups, Create/Join/Group detail, Notifications, Settings). Same API client surface including **joinGroup** (join by group code) for parity with web.
- **Layout:** Same nav; floating notifications icon; Settings link on Profile; routes for `/groups`, `/groups/new`, `/groups/:groupCode`, `/join`, `/settings`, `/notifications`.

### Bug fix (frontend replication)

- **Mobile API client:** Added missing `joinGroup(groupCode)` calling `POST /api/v1/groups/{group_code}/join` so web and mobile clients stay in sync.

---

## Remove Node.js/TypeScript from server

**Done when:** All legacy Node.js/Express/TypeScript code is removed from `server/`; backend is Python + FastAPI only.

### Backend

- **Removed:** `server/package.json`, `server/tsconfig.json`, and entire `server/src/` tree (Node/Express/TS): `src/index.ts`, `src/auth.ts`, `src/db/store.ts`, `src/db/places.ts`. Empty `server/src` and `server/src/db` directories removed.
- **Unchanged:** `server/app/` (Python FastAPI) and `server/requirements.txt` remain the only backend implementation.

---

## Cursor rules and production/docs (process)

**Done when:** Cursor rules for design, architecture, changelog, production, readme, i18n, and git are in place; PRODUCTION.md and READMEs are created/updated.

### Cursor rules (`.cursor/rules/`)

- **design-file-inspiration.mdc** – Frontend UI/UX changes must use [DESIGN_FILE.html](DESIGN_FILE.html) as inspiration; applies to `apps/web` and `apps/mobile`.
- **architecture-review.mdc** – Review [ARCHITECTURE.md](ARCHITECTURE.md) when functionality changes system architecture; update ARCHITECTURE.md if needed (always apply).
- **changelog-updates.mdc** – Any changes must be added to [CHANGELOG.md](CHANGELOG.md) (always apply).
- **production-plan.mdc** – Maintain [PRODUCTION.md](PRODUCTION.md) with three deployment plans; update when deployment-relevant changes occur (always apply).
- **readme-maintenance.mdc** – Maintain README at root and in each service (backend, web, mobile) for understanding and local run (always apply).
- **i18n-translations.mdc** – Customer-facing strings from backend; support English and Arabic with fallback to English; applies to frontends and server.
- **git-commit-after-feature.mdc** – After feature changes, commit on git (always apply).

### Docs

- **PRODUCTION.md** – New go-to-production file with three plans: Plan 1 (Docker), Plan 2 (free online e.g. Render + Vercel), Plan 3 (GCP: Cloud Run, Cloud SQL, Firebase Hosting, etc.). Each plan updated when system/deployment changes.
- **README.md (root)** – Updated to link to PRODUCTION.md and to service READMEs (server, apps/web, apps/mobile).
- **server/README.md** – Added `DATABASE_URL` and link to PRODUCTION.md.
- **apps/web/README.md** – New: how to run and build web app, env, structure.
- **apps/mobile/README.md** – New: how to run and build mobile app (Expo), env, structure.

---

## Prompt 1: Project setup and shell

**Done when:** Monorepo runs, API returns mock places with `place_code`, both web and mobile have routing and layout; Cursor rule file exists.

### Backend

- **`server/`** – New Express + TypeScript API.
  - `GET /health` → `{ status: "ok" }`.
  - `GET /api/v1/places` → array of mock places with `place_code` (e.g. `plc_abc1`, `plc_xyz2`).
  - CORS enabled, JSON body parsing.
- **Root `package.json`** – Workspaces: `apps/*`, `server`. Scripts: `dev:server`, `dev:web`, `dev:mobile`, `build:*`.

### Frontend (apps/web and apps/mobile)

- **Monorepo layout** – No `packages/` folder. `apps/web` and `apps/mobile` each have their own codebase.
- **Cursor rule** – `.cursor/rules/frontend-replication.mdc` already existed; requires replicating UI and features between web and mobile.
- **Types** – In both apps, `src/types/index.ts`: `User` (with `user_code`), `Place` (with `place_code`), `Religion` enum.
- **API client** – In both apps, `src/api/client.ts`: `getPlaces()` calling `/api/v1/places` (uses `VITE_API_URL` when set).
- **Tailwind** – In both apps: theme aligned with DESIGN_FILE (primary `#3B82F6`, Lexend, `background-light`, `text-main`, `text-muted`, `input-border`, border radius tokens).
- **Layout** – In both apps, `src/components/Layout.tsx`: responsive shell; bottom nav (Explore, Saved, Pilgrimage, Profile) on viewport &lt; 768px; top nav on larger; safe-area padding classes.
- **Routes** – In both apps: `/` (Splash), `/login`, `/register`, `/select-path`, `/home`. Placeholder pages with headings and links.
- **Icons/fonts** – Lexend and Material Icons/Symbols linked in `index.html` for both apps.

### Docs

- **README.md** – How to run server, web, and mobile; both apps use same API base for `/api/v1`; env vars.

---

## Prompt 2: Authentication (register, login, religion selection)

**Done when:** User can register, select religion, log in, and be sent to home; `GET /api/v1/users/me` returns the user (with `user_code`); forgot/reset password works in dev. Same flows in both web and mobile.

### Backend

- **In-memory store** (`server/src/db/store.ts`) – Users and password-reset tokens. `user_code` (e.g. `usr_` + hex), email, password_hash, display_name, religion (nullable enum), avatar_url, timestamps. Replace with SQLite/Postgres later.
- **Auth module** (`server/src/auth.ts`) – bcrypt password hash/compare; JWT sign/verify; `register`, `login`, `getMe`, `setReligion`, `updateMe`, `forgotPassword`, `resetPassword`; `authMiddleware` and `requireAuth`; `toPublicUser` (strip password_hash).
- **Routes** – `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `POST /api/v1/auth/forgot-password`, `POST /api/v1/auth/reset-password`, `GET /api/v1/users/me`, `PATCH /api/v1/users/me`, `PATCH /api/v1/users/me/religion`. Protected routes use Bearer JWT.
- **Dependencies** – bcryptjs, jsonwebtoken (and @types).

### Frontend (apps/web and apps/mobile)

- **API client** – register, login, getMe, updateMe, updateReligion, forgotPassword, resetPassword; auth headers with Bearer token from localStorage.
- **AuthContext** – user, token, loading; login, register, logout, setReligion, refreshUser; persist token and user in localStorage; refresh user on mount when token exists.
- **ProtectedRoute** – redirect to `/login` when not authenticated; show loading while checking auth.
- **Splash** – unchanged (Get Started → register, Sign In → login).
- **Register** – form (full name, email, password, confirm); validation; on submit call register, then navigate to `/select-path`.
- **Login** – form (email, password); “Forgot password?” → `/forgot-password`; on submit call login, then navigate to `/home`.
- **Forgot password** – email input; call forgotPassword; success message (dev: link in server console).
- **Reset password** – route `/reset-password?token=...`; form (new password, confirm); call resetPassword; success → link to login.
- **Select Path** – cards for Islam, Hinduism, Christianity; Skip for now. On select or skip call PATCH `/api/v1/users/me/religion`, then navigate to `/home`. If user already has religion, redirect to `/home`.
- **Home** – greeting by religion (e.g. Assalamu Alaikum for Islam), display name; log out button.
- **App routes** – `/forgot-password`, `/reset-password`; `/select-path` and `/home` wrapped in ProtectedRoute; AuthProvider wraps app.

---

## Prompt 3: Home and discovery (list view, place cards)

**Done when:** Home shows places for the user's religion sorted by distance; cards match design; clicking a card goes to place detail route (placeholder).

### Backend

- **Places store** (`server/src/db/places.ts`) – In-memory places with `place_code` (e.g. `plc_` + hex), name, religion, place_type, lat, lng, address, opening_hours, image_urls, description. Seed data for Islam, Hinduism, Christianity. `listPlaces(options)` filters by religion, sorts by distance (haversine) when lat/lng provided, supports limit/offset.
- **GET /api/v1/places** – Query params: religion, lat, lng, limit, offset. Returns array of places with computed distance when lat/lng given.

### Frontend (apps/web and apps/mobile)

- **API client** – `getPlaces(params)` with religion, lat, lng, limit, offset; returns `Place[]`.
- **Home** – If user has no religion, redirect to `/select-path`. Fetch places with user's religion and default lat/lng (40.71, -74.01). Header with greeting (e.g. Assalamu Alaikum for Islam) and display name. List/Map toggle (list only; map shows placeholder). Search bar and filter chips (Nearby, Historical, Jummah Prayer, Women's Section) – UI only. Place cards: image (placeholder icon if no image_urls), name, address, distance (km), mock rating, “View Details” link to `/places/:placeCode`. Responsive grid on desktop.
- **Place detail** – New route `/places/:placeCode`; placeholder page (Prompt 4 will fill in).
- **App** – Route added for `/places/:placeCode` (protected).

---
