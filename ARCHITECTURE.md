# SoulStep – System Architecture

Multi-platform application for discovering, visiting, and tracking sacred sites. Platforms: desktop web, mobile web, iOS, Android.

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Clients                                                 │
│  apps/soulstep-customer-web  (Vite + React)              │
│  apps/soulstep-customer-mobile  (Expo / React Native)    │
│  apps/soulstep-admin-web  (Vite + React, admin only)     │
└──────────────────────────┬──────────────────────────────┘
                           │  REST API  /api/v1
                           ▼
┌─────────────────────────────────────────────────────────┐
│  Catalog API  (soulstep-catalog-api/)                    │
│  Python + FastAPI + SQLModel                             │
│  SQLite (dev) / PostgreSQL 15 (prod)                     │
│  GCS for image storage (prod)                            │
└──────────────────────────┬──────────────────────────────┘
                           │  POST /api/v1/places/batch
                           │  (scraper sync)
                           ▼
┌─────────────────────────────────────────────────────────┐
│  Scraper API  (soulstep-scraper-api/)                    │
│  Python + FastAPI + SQLModel                             │
│  SQLite (dev) / PostgreSQL (prod, optional)              │
│  Playwright + Chromium (browser mode)                    │
└─────────────────────────────────────────────────────────┘
```

**Production hosting:** Cloud Run (API + Scraper) · Cloud SQL (PostgreSQL) · Firebase Hosting (Web + Admin) · GCS (Images)

---

## 2. Monorepo Layout

```
soulstep/
├── soulstep-catalog-api/        # Python + FastAPI backend
│   ├── app/
│   │   ├── main.py              # FastAPI app, middleware, lifespan
│   │   ├── api/v1/              # Route handlers (auth, users, places, groups, …)
│   │   ├── api/v1/admin/        # Admin-only routes
│   │   ├── db/
│   │   │   ├── models.py        # SQLModel ORM models + _TSTZ() helper
│   │   │   ├── seed.py          # Seed runner (dev only)
│   │   │   └── seed_data.json   # Translations + sample data
│   │   ├── services/            # Business logic (seo, image_storage, translation, …)
│   │   └── jobs/                # Cloud Run Job entrypoints (sync_places, translate_content, cleanup)
│   ├── migrations/versions/     # Alembic migration files
│   ├── scripts/                 # One-off scripts (generate_seo, reset_place_data)
│   ├── tests/                   # pytest integration + unit tests
│   ├── Dockerfile               # API service image
│   ├── Dockerfile.sync          # sync-places job image (no Playwright)
│   └── Dockerfile.translate     # translate-content job image (with Playwright)
├── soulstep-scraper-api/        # Python + FastAPI scraper
│   ├── app/
│   │   ├── scrapers/            # Discovery + detail fetching (API + browser)
│   │   ├── collectors/          # Per-source enrichment collectors
│   │   ├── pipeline/            # Orchestration, quality, merging
│   │   ├── services/            # Browser pool, stealth, query logging
│   │   └── jobs/                # Cloud Run Job dispatcher + entrypoint
│   ├── tests/
│   ├── Dockerfile               # API service image (~200 MB, no Playwright)
│   └── Dockerfile.job           # Job image (~900 MB, with Playwright + Chromium)
├── apps/
│   ├── soulstep-customer-web/   # Vite + React + Tailwind
│   ├── soulstep-customer-mobile/ # Expo / React Native
│   └── soulstep-admin-web/      # Vite + React + Tailwind (admin)
├── ARCHITECTURE.md
├── SYSTEMS.md
├── PRODUCTION.md
├── CHANGELOG.md
└── ROADMAP.md
```

No shared `packages/` folder — web and mobile each have their own API client and types, kept in parity by convention (CLAUDE.md Rule 10).

---

## 3. Tech Stack

### Catalog API

| Concern | Choice |
|---|---|
| Language | Python 3.11+ |
| Framework | FastAPI |
| ORM | SQLModel (SQLAlchemy + Pydantic) |
| Database | SQLite (dev) / PostgreSQL 15 (prod) |
| Auth | JWT Bearer tokens; bcrypt password hashing |
| Migrations | Alembic (auto-run on startup) |
| Image storage | Database blobs (dev) / Google Cloud Storage (prod) |
| Email | Resend.com (password reset) |
| Serving | Uvicorn (ASGI) |

### Frontend (Web + Admin)

| Concern | Choice |
|---|---|
| Framework | React 19 |
| Build tool | Vite 7 |
| Language | TypeScript |
| Styling | Tailwind CSS 3 |
| Routing | React Router 6 |
| Maps | Leaflet (react-leaflet) |
| Icons | Material Symbols Outlined |
| Font | Lexend |

### Mobile

| Concern | Choice |
|---|---|
| Framework | React Native 0.81 |
| Platform | Expo 54 |
| Language | TypeScript |
| Navigation | React Navigation 7 |
| Maps | Leaflet via react-native-webview |
| Icons | MaterialIcons from @expo/vector-icons |

---

## 4. Data Model

All entities use stable `*_code` string identifiers — never numeric IDs. Codes are used as primary and foreign keys in the DB, in API paths and bodies, and in frontend types. Codes may have a readable prefix (e.g. `plc_abc12`) but are treated as opaque strings in business logic.

### Core Entities

| Entity | PK | Key Fields |
|---|---|---|
| `User` | `user_code` | email, password_hash, display_name, avatar_url |
| `UserSettings` | FK → user_code | theme, language, units, religions (JSON) |
| `Visitor` | `visitor_code` | anonymous identity; merged into UserSettings on signup |
| `VisitorSettings` | FK → visitor_code | same fields as UserSettings |
| `Place` | `place_code` | name, religion, place_type, lat/lng, address, opening_hours (JSON local time), utc_offset_minutes, description, website_url, source |
| `PlaceImage` | FK → place_code | image_type (url/blob), url, blob_data, mime_type, display_order |
| `PlaceSEO` | FK → place_code | seo_slug, meta_title, meta_description, structured_data (JSON-LD), alt_text, FAQ |
| `Review` | `review_code` | user_code FK, place_code FK, rating (1–5), title, body, source (user/google) |
| `ReviewImage` | FK → review_code | blob storage for review photos |
| `CheckIn` | `check_in_code` | user_code FK, place_code FK, group_code FK (nullable), checked_in_at, note |
| `Favorite` | composite: user_code + place_code | join table |

### Groups and Social

| Entity | PK | Key Fields |
|---|---|---|
| `Group` | `group_code` | name, description, created_by, invite_code, is_private, path_place_codes (JSON ordered list), cover_image_url, start_date, end_date |
| `GroupMember` | composite: group_code + user_code | role (admin/member), joined_at |
| `GroupPlaceNote` | `note_code` | group_code FK, place_code FK, user_code FK, text — collaborative itinerary notes |
| `Notification` | `notification_code` | user_code FK, type, payload (JSON), read_at |
| `PasswordReset` | token | user_code FK, expires_at, used_at |

### Dynamic Attributes (EAV)

| Entity | PK | Key Fields |
|---|---|---|
| `PlaceAttributeDefinition` | `attribute_code` | name, data_type, icon, label_key, is_filterable, religion, display_order |
| `PlaceAttribute` | unique: place_code + attribute_code | value_text, value_json |

EAV allows religion-specific metadata (prayer times for Islam, service times for Christianity, deities for Hinduism) without schema changes.

### Analytics and Ads

| Entity | Key Fields |
|---|---|
| `AnalyticsEvent` | event_code, event_type, user/visitor_code, session_id, properties (JSON), platform |
| `ConsentRecord` | user/visitor consent for ads + analytics |
| `AdConfig` | platform-specific ad config (enabled flag, publisher/slot IDs) |
| `AICrawlerLog` | AI crawler visit log (bot name, path, user-agent) |

---

## 5. API Design

All routes are versioned under `/api/v1`. Paths and request/response bodies use `*_code` identifiers, never numeric IDs.

**Authentication:** JWT Bearer token in `Authorization` header. Issued on login/register, validated per-request.

**Client headers** (sent by web and mobile):

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
- `/api/v1/groups*` — CRUD, join, invite, leaderboard, activity, checklist, notes
- `/api/v1/notifications*` — list, mark read
- `/api/v1/search*` — autocomplete, place details (Google Places proxy)
- `/api/v1/visitors*` — anonymous visitor sessions
- `/api/v1/ads*`, `/api/v1/consent*` — ads config + consent
- `/api/v1/analytics/events` — batch event ingestion (50 max, rate-limited)
- `/api/v1/languages`, `/api/v1/translations` — i18n, no auth
- `/share/*`, `/sitemap.xml`, `/robots.txt`, `/feed.xml` — SEO + sharing
- `/api/v1/admin/*` — full admin CRUD (requires admin role)
- `/api/v1/app-version` — mobile version enforcement config

See `soulstep-catalog-api/README.md` for the complete endpoint list.

---

## 6. Key Architectural Decisions

### Datetime Storage

All datetime columns use the `_UTCAwareDateTime` TypeDecorator (`_TSTZ()` helper in `models.py`):
- **PostgreSQL**: mapped to `TIMESTAMPTZ` — stores and returns tz-aware datetimes
- **SQLite**: re-attaches `UTC` timezone on read from string storage
- **Rule**: always use `datetime.now(UTC)`, never `datetime.utcnow()`

### Opening Hours + Timezone

Opening hours are stored in **local time** (24-hour, as received from Google Maps), not UTC.

- `utc_offset_minutes` stored per place (e.g. 240 for UTC+4)
- `is_open_now` computed on server: current UTC → place local time → compare opening hours
- Browser scraper mode: `timezonefinder` computes UTC offset from lat/lng
- No DST handling — acceptable for target regions (UAE, India, Saudi Arabia, South Asia)

### Image Storage

Two backends controlled by `IMAGE_STORAGE` env var:

| Backend | Behavior |
|---|---|
| `blob` (default) | Binary data in DB `LargeBinary` column; served via `/api/v1/places/{code}/image/{imageCode}` |
| `gcs` | Uploaded to GCS bucket; `blob_data` left NULL; served via public GCS URL |

Service abstraction in `app/services/image_storage.py`. On Cloud Run, workload identity (ADC) handles GCS auth automatically.

### Translation Backend

Two translation backends controlled by `TRANSLATION_BACKEND`:

| Backend | How it works |
|---|---|
| `api` (default) | Google Cloud Translation API via `google-cloud-translate` SDK |
| `browser` | Playwright drives `translate.google.com` headlessly — no GCP credentials needed |

The browser backend uses `BrowserSessionPool` (reusable contexts), stealth patches, and a circuit breaker.

### Feature Parity (Web ↔ Mobile)

Both frontends maintain the same screen inventory, API calls, and translation keys. No shared packages — replicate code in both apps. Enforced by convention (CLAUDE.md Rule 10).

### Scraper Backends

Two discovery backends for `soulstep-scraper-api/`:

| `SCRAPER_BACKEND` | Method | API key | Cost | Speed |
|---|---|---|---|---|
| `api` (default) | Google Places API HTTP calls | Required | ~$0.008/place | ~3h per 10K |
| `browser` | Playwright/Chromium | Not required | $0 | ~24–48h per 10K |

**API mode discovery** uses a recursive quadtree (`search_area()` in `scrapers/gmaps.py`).
**Browser mode discovery** uses a fixed 3 km × 3 km grid (`search_grid_browser()` in `scrapers/gmaps_browser.py`), replacing the old quadtree approach.  The grid is generated by `scrapers/grid.py` and supports multi-box country borders via `GeoBoundaryBox` rows seeded in `seeds/geo.py`.

Both modes support multi-box country borders: `scrapers/geo_utils.get_boundary_boxes()` returns seeded `GeoBoundaryBox` rows for a country, falling back to the single `GeoBoundary` bbox for cities/states.  India (18 boxes), USA (16 boxes), Pakistan (6 boxes), and UAE (4 boxes) are pre-seeded.

**Grid scrolling**: each browser cell scrolls the Maps sidebar until no new place links appear for 3 consecutive scrolls (`_scroll_until_stable()`), replacing the old fixed 3-scroll loop.

`BROWSER_GRID_CELL_SIZE_KM` (default `3.0`) controls cell side length.

All downstream phases (enrichment, quality, merging, sync) are identical regardless of backend.

### Job Dispatcher

Controls how scraper runs execute:

| `SCRAPER_DISPATCH` | Behavior |
|---|---|
| `local` (default) | In-process FastAPI BackgroundTasks; no GCP needed |
| `cloud_run` | Dispatches a Cloud Run Job via GCP Jobs API; API service stays at 512 MB |

---

## 7. Mobile App Update Enforcement

**Soft update (banner):**
- Mobile calls `GET /api/v1/app-version?platform=ios|android` on startup
- If current version < `min_version_soft`, shows an `UpdateBanner` (dismissible)

**Hard update (full block):**
- `hard_update_middleware` intercepts every `/api/v1/*` request from `X-App-Type: app`
- If `X-App-Version` < `MIN_APP_VERSION_HARD`, returns **HTTP 426** — mobile shows `ForceUpdateModal` with no dismiss option

**Configuration priority:** `AppVersionConfig` DB table (per-platform, editable at runtime) overrides env vars.

Web clients are never blocked — always receive the latest bundle.

---

## 8. Analytics

Privacy-first analytics pipeline:
- `POST /api/v1/analytics/events` — batch ingest (up to 50 events/request, 10 req/min rate limit)
- Events buffered client-side (30s or 10 events), sent as batches
- Auth optional (supports both authenticated users and anonymous visitors)
- Admin queries: overview, top-places, trends, raw event log

---

## 9. SEO / GEO Architecture

The catalog API serves all SEO content:

- **Static SEO**: `PlaceSEO` model with `seo_slug`, `meta_title`, `meta_description`, `structured_data` (JSON-LD TouristAttraction), `alt_text`, FAQ
- **Sitemaps**: `/sitemap.xml` (places + hreflang + images), `/sitemap-images.xml`
- **AI discoverability**: `/robots.txt` (allows major AI bots), `/llms.txt`, `/ai-plugin.json`
- **Feeds**: `/feed.xml` (RSS 2.0), `/feed.atom` (Atom 1.0)
- **AI citation monitoring**: `AICrawlerLog` + `GET /admin/seo/ai-citations`

SEO generation: `scripts/generate_seo.py --generate --translate` (run post-sync or auto-triggered by scraper).

---

## 10. API Versioning Policy

- Current stable: `/api/v1` — maintained 12 months after `/api/v2` GA
- **Breaking changes** (removed fields, renamed endpoints, changed auth): require new version
- **Non-breaking additions** (new optional fields, new endpoints): added to existing version
- All responses include `X-API-Version: 1`
- Hard-blocking (HTTP 426) reserved for security-critical or data-integrity breaking changes

---

## 11. Scheduled Jobs (Cloud Run Jobs)

All jobs use the catalog API package (`soulstep-catalog-api/app/`) with separate Docker images:

| Job | Image | Schedule | Purpose |
|---|---|---|---|
| `cleanup-job` | `Dockerfile` | Daily 02:00 UTC | Remove orphaned review images |
| `backfill-timezones` | `Dockerfile` | One-off | Populate timezone data for places |
| `sync-places` | `Dockerfile.sync` | Daily 02:00 UTC | Upsert enriched scraper places into catalog |
| `translate-content` | `Dockerfile.translate` | Daily 04:00 UTC | Translate place/review/city content (ar, hi, te, ml) |

All jobs are created/updated automatically by `.github/workflows/deploy.yml` on pushes to `main` that touch `soulstep-catalog-api/`.
