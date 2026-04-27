# SoulStep – Architecture

Multi-platform app for discovering, visiting, and tracking sacred sites.
Platforms: desktop web, mobile web, iOS, Android.

---

## 1. High-Level Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Clients                                                      │
│  customer-web  (Next.js 15 SSR · Vercel)                     │
│  admin-web     (Vite + React · Vercel)                       │
│  mobile        (Expo / React Native · iOS + Android)         │
└────────────────────────┬─────────────────────────────────────┘
                         │  REST  /api/v1
                         ▼
┌──────────────────────────────────────────────────────────────┐
│  GCP e2-micro VM  (Docker Compose, europe-west1)             │
│  ┌─────────────────────────┐  ┌──────────────────────────┐  │
│  │  catalog-api            │  │  scraper-api             │  │
│  │  FastAPI + SQLModel     │  │  FastAPI + SQLModel      │  │
│  │  PostgreSQL 15 (shared) │  │  PostgreSQL 15 (shared)  │  │
│  │  GCS image storage      │  │  queue processor         │  │
│  └─────────────────────────┘  └────────────┬─────────────┘  │
│                                             │ dispatch       │
└─────────────────────────────────────────────│────────────────┘
                                              ▼
                              ┌───────────────────────────────┐
                              │  Cloud Run Job                │
                              │  soulstep-scraper-api-job     │
                              │  Playwright + Chromium        │
                              │  6 GB / 4 vCPU · ephemeral   │
                              │  multi-region: europe-west*   │
                              └───────────────────────────────┘
                                              │
                              ┌───────────────▼───────────────┐
                              │  GCS Buckets                  │
                              │  soulstep-images (prod imgs)  │
                              │  soulstep-db-backups          │
                              └───────────────────────────────┘
```

**Production stack:** GCP e2-micro VM (Docker Compose) · GHCR (VM service images) · Artifact Registry (Cloud Run Job image) · Vercel (customer-web + admin-web) · GCS (images + backups) · Cloud Run Job (Playwright scraper, ephemeral, on-demand)

**Project-bound backend infra:** GitHub Actions now reads GCP deploy metadata (project ID, WIF provider, Artifact Registry host/repo, Cloud Run job name, extra regions) from GitHub environment variables instead of hardcoding one project into the workflow. That lets the same repo deploy into a replacement GCP account/project during credit migration.

---

## 2. Monorepo Layout

```
soulstep/
├── soulstep-catalog-api/        # Python + FastAPI core backend
│   ├── app/
│   │   ├── main.py              # FastAPI app, middleware, lifespan
│   │   ├── api/v1/              # Route handlers (auth, users, places, groups, …)
│   │   ├── api/v1/admin/        # Admin-only routes
│   │   ├── db/
│   │   │   ├── models.py        # SQLModel ORM models + _TSTZ() helper
│   │   │   ├── seed.py          # Seed runner (dev only)
│   │   │   └── seed_data.json   # Translations + sample data
│   │   ├── services/            # Business logic (seo, image_storage, translation, …)
│   │   └── jobs/                # VM cron entrypoints (sync_places, cleanup, …)
│   ├── migrations/versions/     # Alembic migration files
│   ├── scripts/                 # One-off scripts (generate_seo, translate_bulktranslator)
│   ├── tests/                   # pytest integration + unit tests
│   └── Dockerfile               # catalog-api container image
├── soulstep-scraper-api/        # Python + FastAPI scraper service
│   ├── app/
│   │   ├── scrapers/            # Discovery + detail fetching (API + browser)
│   │   ├── collectors/          # Per-source enrichment collectors
│   │   ├── pipeline/            # Orchestration, quality, merging
│   │   ├── services/            # Browser pool, stealth, query logging
│   │   └── jobs/                # Cloud Run Job dispatcher + entrypoint
│   ├── tests/
│   ├── Dockerfile               # scraper-api image (~200 MB, no Playwright)
│   └── Dockerfile.job           # Job image (~900 MB, Playwright + Chromium)
├── apps/
│   ├── soulstep-customer-web/   # Next.js 15 + React + Tailwind (customer)
│   ├── soulstep-customer-mobile/ # Expo / React Native (iOS + Android)
│   └── soulstep-admin-web/      # Vite + React + Tailwind (admin dashboard)
├── docker-compose.prod.yml      # VM production orchestration
├── docker-compose.yml           # Local dev orchestration
├── nginx/                       # Reverse proxy config + TLS
│   ├── Dockerfile
│   ├── nginx.conf
│   └── conf.d/                  # http.conf + ssl.conf templates
├── scripts/
│   ├── vm-bootstrap.sh          # One-shot VM provisioning
│   ├── backup-db.sh             # Daily dual-DB backup bundle → GCS
│   ├── restore-db.sh            # Restore dual-DB backup bundles
│   ├── gcp-bootstrap-backend-project.sh
│   ├── gcs-rsync-buckets.sh
│   ├── rewrite-gcs-urls.sh
│   └── cron/soulstep-cron       # VM crontab entries
├── .env.example                 # Single backend env template (filled by CI for VM)
├── ARCHITECTURE.md
├── PRODUCTION.md
├── CHANGELOG.md
└── ROADMAP.md
```

No shared `packages/` folder — customer-web and customer-mobile each maintain their own API client and types, kept in parity by convention (CLAUDE.md Rule 10).

---

## 3. Tech Stack

### catalog-api

| Concern | Choice |
|---|---|
| Language | Python 3.11+ |
| Framework | FastAPI |
| ORM | SQLModel (SQLAlchemy + Pydantic) |
| Database | SQLite (dev) / PostgreSQL 15 (prod) |
| Auth | JWT Bearer tokens; bcrypt password hashing |
| Migrations | Alembic (auto-run on startup) |
| Image storage | DB blobs (dev) / GCS bucket `soulstep-images` (prod) |
| Email | Resend.com (password reset) |
| Serving | Uvicorn (ASGI) |

### scraper-api

| Concern | Choice |
|---|---|
| Language | Python 3.11+ |
| Framework | FastAPI |
| Database | SQLite (dev) / PostgreSQL 15 (prod) |
| Browser automation | Playwright + Chromium (Cloud Run Job only) |
| Discovery | Google Maps API (api mode) or Playwright browser (browser mode) |

### customer-web

| Concern | Choice |
|---|---|
| Framework | Next.js 15 + React 19 (SSR) |
| Language | TypeScript |
| Styling | Tailwind CSS 3 |
| Routing | Next.js App Router |
| Maps | Leaflet (react-leaflet) |
| Hosting | Vercel |

### admin-web

| Concern | Choice |
|---|---|
| Framework | React 19 + Vite 7 |
| Language | TypeScript |
| Styling | Tailwind CSS 3 |
| Components | Radix UI primitives |
| Hosting | Vercel |

### mobile

| Concern | Choice |
|---|---|
| Framework | React Native 0.81 + Expo 54 |
| Language | TypeScript |
| Navigation | React Navigation 7 |
| Maps | Leaflet via react-native-webview |
| Icons | MaterialIcons from @expo/vector-icons |

---

## 4. Key Design Decisions

### `_TSTZ()` datetime columns

All datetime model fields use the `_UTCAwareDateTime` TypeDecorator via `_TSTZ()` in `models.py`. Maps to `TIMESTAMPTZ` in PostgreSQL (tz-aware round-trip) and re-attaches UTC on read from SQLite string storage. Always write `datetime.now(UTC)`, never `datetime.utcnow()`.

### `*_code` opaque string IDs

Every entity uses a stable, autogenerated `*_code` string as its primary and foreign key — never a numeric ID. Codes appear in DB schema, API paths, request/response bodies, and frontend types. Codes may include a readable prefix (e.g. `plc_abc12`) but are treated as opaque strings in business logic.

### i18n via backend translations API

All customer-facing UI strings come from `GET /api/v1/translations?lang=`. Supported languages: English (default), Arabic, Hindi, Telugu, Malayalam. RTL layout enabled automatically when locale is `ar`. Never hardcode copy in frontend files. Same translation keys used in both customer-web and customer-mobile.

### Image storage: GCS in production

Controlled by `IMAGE_STORAGE` env var. `blob` (dev default) stores binary data in the DB; `gcs` (production) uploads to `gs://soulstep-images` and stores the public URL. The scraper always writes GCS URLs. Both services share the same bucket and `images/places/` prefix.

### No shared packages between web and mobile

customer-web and customer-mobile each own their API client, types, and components. Parity is maintained by convention: same routes, same API calls, same translation keys. No `packages/` workspace — replicate rather than share.

---

## 5. Scraper Pipeline

```
POST /api/v1/scraper/runs
        │
        ▼
Queue processor (polls every 15 s, capacity-aware per region)
        │
        │  SCRAPER_DISPATCH=cloud_run
        ▼
Cloud Run Job (soulstep-scraper-api-job)
Playwright + Chromium, 6 GB / 4 vCPU, ephemeral
        │
        ▼
Discovery  →  Detail fetch + asset enqueue  →  Image barrier drain
        │
        ▼
Enrichment: OSM → Wikipedia/Wikidata → KnowledgeGraph/BestTime/Foursquare
        │
        ▼
Quality assessment  →  GATE_SYNC (0.75 threshold)
        │
        ▼
catalog sync
  ├─ direct DB job (prod handoff/default): catalog-api reads scraper DB by run_code
  └─ /api/v1/places/batch (legacy/local fallback)
        │
        ▼
catalog-api shared place-ingest service  →  catalog DB upserts places
```

**Queue processor** (inside scraper-api):
- Status flow: `queued` → `pending` → `running` → `completed` / `failed`
- Polls every 15 s; also triggered immediately on run create or resume
- Tracks active jobs per region; dispatches only when quota allows
- On dispatch failure: reverts run to `queued` for next poll

**Multi-region dispatch:**

| Env var | Example |
|---|---|
| `CLOUD_RUN_REGIONS` | `europe-west1:3,europe-west4:5,europe-west2:5` |

Each region gets an independent quota. The queue processor distributes jobs across regions based on available capacity. Only jobs are spread across regions — catalog-api and scraper-api stay on the primary VM.

**Scraper backend:** Playwright grid search (3 km × 3 km cells), no API cost. Detail fetch now persists place/review asset work into a durable `ScrapedAsset` queue, preserves `source_image_urls` / `source_photo_urls`, and uploads to the production GCS bucket in parallel while detail fetch is still running. The `image_download` stage is now a bounded drain/barrier over leftover queued assets rather than the primary image path.

**Portable run handoff:** runs can now be leased into a `RunHandoff`, exported into a portable bundle, resumed locally against a snapshot DB, and finalized back into production as the same `run_code`. While a handoff is active, mutating run actions are blocked until the handoff is finalized or aborted.

**Direct catalog sync:** production finalize/sync keeps scraper DB authoritative first, then triggers catalog-api with a small control request. Catalog-api starts the run-scoped `app.jobs.sync_places` CLI as a detached process, reads `scrapedplace` rows from the scraper DB by `run_code`, converts them through the shared place-ingest service used by `/api/v1/places/batch`, upserts catalog place core data/attributes/reviews/translations/images directly, and writes running/completed/failed scraper sync counters/status back to the scraper DB. Catalog images are replaced only when the incoming scraper image count is equal or higher; otherwise existing catalog images are preserved.

---

## 6. Scheduled Jobs

All jobs run as VM cron tasks and execute inside the `catalog-api` container via `docker compose exec`. Installed by `scripts/vm-bootstrap.sh`. Logs at `/var/log/soulstep-*.log`.

| Schedule | Job | Description |
|---|---|---|
| Daily 02:00 UTC | `backup-db.sh` | bundle both Postgres DBs → GCS (`soulstep-db-backups`), 7-day retention |
| Daily 03:00 UTC | `app.jobs.sync_places` | Upsert enriched scraper places into catalog |
| Monday 05:00 UTC | `app.jobs.cleanup_orphaned_images` | Remove orphaned review images |
| Sunday 04:00 UTC | `app.jobs.backfill_timezones` | Populate timezone data for places |

The Playwright scraper (`soulstep-scraper-api-job`) runs as a **Cloud Run Job** — it is heavy (6 GB / 4 vCPU), ephemeral, and triggered on demand from the admin UI. It is not a VM cron job.

---

## 7. API Design

All routes versioned at `/api/v1`. Paths and bodies use `*_code` identifiers, never numeric IDs.

**Auth:** JWT Bearer token in `Authorization` header. Issued on login/register.

**Client headers:**

| Header | Values |
|---|---|
| `X-Content-Type` | `mobile` or `desktop` |
| `X-App-Type` | `app` (mobile) or `web` |
| `X-Platform` | `ios`, `android`, or `web` |
| `X-App-Version` | e.g. `1.2.3` (mobile only) |

**Key endpoint groups:**
- `/api/v1/auth/*` — register, login, password reset
- `/api/v1/users/me*` — profile, settings, check-ins, stats, favorites
- `/api/v1/places*` — list, detail, reviews, check-in, favorite, batch sync
- `/api/v1/cities*` — city browse + religion filter
- `/api/v1/groups*` — CRUD, join, invite, leaderboard, activity, notes
- `/api/v1/notifications*` — list, mark read
- `/api/v1/search*` — autocomplete + place details (Google Places proxy)
- `/api/v1/visitors*` — anonymous visitor sessions
- `/api/v1/analytics/events` — batch event ingestion (50 max, rate-limited)
- `/api/v1/languages`, `/api/v1/translations` — i18n, no auth
- `/share/*`, `/sitemap.xml`, `/robots.txt`, `/feed.xml` — SEO + sharing
- `/api/v1/admin/*` — full admin CRUD (admin role required)
- `/api/v1/app-version` — mobile version enforcement config

See `soulstep-catalog-api/README.md` for the complete endpoint list.

---

## 8. SEO Architecture

catalog-api serves all SEO content:

- **`PlaceSEO` model** — `seo_slug`, `meta_title`, `meta_description`, `structured_data` (JSON-LD TouristAttraction), `alt_text`, FAQ
- **Multi-language SEO** — `SEOContentTemplate` + `PlaceSEOTranslation` per language; `generate_all_langs()` renders all five languages in one pass
- **Sitemaps** — `/sitemap.xml` (places + hreflang + image entries), `/sitemap-images.xml`
- **AI discoverability** — `/robots.txt` (allows major AI bots), `/llms.txt`, `/ai-plugin.json`
- **Feeds** — `/feed.xml` (RSS 2.0), `/feed.atom` (Atom 1.0)
- **AI citation monitoring** — `AICrawlerLog` model + middleware + `GET /admin/seo/ai-citations`
- **SEO generation** — `scripts/generate_seo.py --generate` (post-sync or admin-triggered)
- **Template versioning** — `PlaceSEO.template_version` tracks generation version; `GET /admin/seo/stale` returns places needing regeneration after template edits
