# SoulStep Catalog API

Python + FastAPI backend for SoulStep. Versioned REST API at `/api/v1`. SQLite (dev) / PostgreSQL (prod).

## Quick Start

```bash
cd soulstep-catalog-api
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 3000
```

API runs at **http://127.0.0.1:3000**. Interactive docs at `/docs`.

If port 3000 is occupied: `lsof -ti :3000 | xargs kill -9`

## Environment Variables

Copy `.env.example` to `.env` and fill in values. Key variables:

| Variable | Required | Default | Description |
|---|---|---|---|
| `JWT_SECRET` | **Yes (prod)** | `dev-secret-change-in-production` | JWT signing secret |
| `JWT_EXPIRE` | No | `30m` | Access token lifetime (`30m`, `1h`, `7d`, or integer minutes) |
| `REFRESH_EXPIRE` | No | `30d` | Refresh token lifetime |
| `DATABASE_URL` | **Yes (prod)** | SQLite `soulstep.db` | PostgreSQL connection string |
| `PORT` | No | `3000` | Server listen port |
| `CORS_ORIGINS` | No | localhost dev origins | Space-separated allowed origins |
| `FRONTEND_URL` | **Yes (prod)** | `http://localhost:5173` | Public web frontend URL — sitemap, JSON-LD, email links |
| `API_BASE_URL` | No | `http://localhost:3000` | Public API URL — RSS/Atom feed self links |
| `RESEND_API_KEY` | No | — | Resend.com key for password-reset emails |
| `RESEND_FROM_EMAIL` | No | `noreply@soul-step.org` | Sender address for emails |
| `RESET_URL_BASE` | No | `http://localhost:5173` | Frontend base URL for reset links |
| `GOOGLE_MAPS_API_KEY` | No | — | Required for place search autocomplete |
| `GOOGLE_CLOUD_PROJECT` | No | — | GCP project ID — required for GCS image backend and Cloud Translation |
| `TRANSLATION_BACKEND` | No | `api` | `api` or `browser` |
| `BROWSER_POOL_SIZE` | No | `2` | Concurrent browser contexts (browser translation only) |
| `BROWSER_MAX_TRANSLATIONS` | No | `50` | Translations per context before recycling |
| `BROWSER_TRANSLATE_MULTI_SIZE` | No | `5` | Batch size per multi-translate request |
| `BROWSER_HEADLESS` | No | `true` | Browser headless mode |
| `IMAGE_STORAGE` | No | `blob` | `blob` (DB) or `gcs` (Google Cloud Storage) |
| `GCS_BUCKET_NAME` | No | — | GCS bucket name (required when `IMAGE_STORAGE=gcs`) |
| `GOOGLE_APPLICATION_CREDENTIALS` | No | — | Service account JSON path — not needed on Cloud Run (uses ADC) |
| `ADS_ENABLED` | No | `false` | Master ads switch |
| `ADSENSE_PUBLISHER_ID` | No | — | Google AdSense publisher ID |
| `ADMOB_APP_ID_IOS` | No | — | AdMob App ID for iOS |
| `ADMOB_APP_ID_ANDROID` | No | — | AdMob App ID for Android |
| `MIN_APP_VERSION_SOFT` | No | — | Soft-update version threshold (banner shown below this) |
| `MIN_APP_VERSION_HARD` | No | — | Hard-update version threshold (HTTP 426 below this) |
| `LATEST_APP_VERSION` | No | — | Current latest release |
| `DATA_SCRAPER_URL` | No | — | Scraper API URL for admin proxy endpoints |
| `SCRAPER_DATABASE_URL` | No | — | Scraper's PostgreSQL URL — used by the sync-places job |
| `GLITCHTIP_DSN` | No | — | Sentry-compatible DSN for server-side error tracking |
| `LOG_LEVEL` | No | `INFO` | Log level: `DEBUG`, `INFO`, `WARNING`, `ERROR` |
| `LOG_FORMAT` | No | `json` | `json` (production) or `text` (local dev) |

## API Endpoints

### Core
- `GET /health` — health check
- `GET /api/v1/app-version` — min/latest app version config

### Auth (`/api/v1/auth`)
- `POST /api/v1/auth/register` — register (email, password, display_name)
- `POST /api/v1/auth/login` — login, returns JWT
- `POST /api/v1/auth/forgot-password` — request password-reset email
- `POST /api/v1/auth/reset-password` — reset password with token

### Users (`/api/v1/users`)
- `GET /api/v1/users/me` — current user profile
- `PATCH /api/v1/users/me` — update profile (display_name)
- `GET /api/v1/users/me/settings` — user settings
- `PATCH /api/v1/users/me/settings` — update settings (theme, language, religions, etc.)
- `GET /api/v1/users/me/check-ins` — all check-ins for current user
- `GET /api/v1/users/me/stats` — places visited, check-ins this year
- `GET /api/v1/users/me/favorites` — favorited places

### Places (`/api/v1/places`)
- `GET /api/v1/places` — list places (filters: religion, lat/lng/radius, open_now, parking, top_rated, cursor pagination, lang)
- `GET /api/v1/places/{placeCode}` — place detail
- `GET /api/v1/places/{placeCode}/reviews` — reviews for a place
- `POST /api/v1/places/{placeCode}/check-in` — check in
- `POST /api/v1/places/{placeCode}/favorite` — add to favorites
- `DELETE /api/v1/places/{placeCode}/favorite` — remove from favorites
- `POST /api/v1/places/{placeCode}/reviews` — create review
- `POST /api/v1/places` — create place (scraper sync)
- `POST /api/v1/places/batch` — batch create places (scraper sync)
- `GET /api/v1/places/{placeCode}/image/{imageCode}` — serve place image

### Cities (`/api/v1/cities`)
- `GET /api/v1/cities` — all cities with place counts (query: limit, offset)
- `GET /api/v1/cities/{city_slug}` — places in a city (query: page, page_size≤200)
- `GET /api/v1/cities/{city_slug}/{religion}` — city places filtered by religion

### Reviews (`/api/v1/reviews`)
- `PATCH /api/v1/reviews/{reviewCode}` — update review
- `DELETE /api/v1/reviews/{reviewCode}` — delete review

### Groups (`/api/v1/groups`)
- `GET /api/v1/groups` — list user's groups
- `POST /api/v1/groups` — create group
- `GET /api/v1/groups/{groupCode}` — group detail
- `PATCH /api/v1/groups/{groupCode}` — update group
- `DELETE /api/v1/groups/{groupCode}` — delete group
- `POST /api/v1/groups/{groupCode}/join` — join group
- `DELETE /api/v1/groups/{groupCode}/leave` — leave group
- `GET /api/v1/groups/{groupCode}/members` — list members
- `DELETE /api/v1/groups/{groupCode}/members/{userCode}` — remove member
- `PATCH /api/v1/groups/{groupCode}/members/{userCode}/role` — update member role
- `GET /api/v1/groups/{groupCode}/leaderboard` — check-in leaderboard
- `GET /api/v1/groups/{groupCode}/activity` — activity feed
- `GET /api/v1/groups/{groupCode}/checklist` — place checklist
- `POST /api/v1/groups/{groupCode}/places/{placeCode}` — add place to itinerary
- `GET /api/v1/groups/{groupCode}/places/{placeCode}/notes` — place notes
- `POST /api/v1/groups/{groupCode}/places/{placeCode}/notes` — add note
- `DELETE /api/v1/groups/{groupCode}/notes/{noteCode}` — delete note
- `POST /api/v1/groups/{groupCode}/invite` — create invite link
- `GET /api/v1/groups/by-invite/{inviteCode}` — look up group by invite code
- `POST /api/v1/groups/join-by-invite` — join via invite code
- `POST /api/v1/groups/{groupCode}/cover` — upload cover image
- `GET /api/v1/groups/cover-image/{imageCode}` — serve cover image

### Notifications (`/api/v1/notifications`)
- `GET /api/v1/notifications` — list notifications
- `PATCH /api/v1/notifications/{notificationCode}/read` — mark as read

### Search (`/api/v1/search`)
- `GET /api/v1/search/autocomplete` — place name autocomplete (Google Places proxy; cached 10 min)
- `GET /api/v1/search/place-details` — place details by place ID

### Visitors (`/api/v1/visitors`)
- `POST /api/v1/visitors` — create anonymous visitor session
- `GET /api/v1/visitors/{visitorCode}/settings` — visitor settings
- `PATCH /api/v1/visitors/{visitorCode}/settings` — update visitor settings

### Ads & Consent
- `GET /api/v1/ads/config?platform=web|ios|android` — ad config; no auth
- `POST /api/v1/consent` — record consent (auth optional, supports visitor_code)
- `GET /api/v1/consent` — current consent status

### Analytics (`/api/v1/analytics`)
- `POST /api/v1/analytics/events` — batch ingest events (max 50/req, 10 req/min)

### i18n
- `GET /api/v1/languages` — supported languages; no auth
- `GET /api/v1/translations?lang=en` — translation key→value for locale; no auth

### Share & SEO
- `GET /share/{shareCode}` — resolve share link
- `GET /share/about`, `/share/how-it-works`, `/share/coverage` — static info pages
- `GET /sitemap.xml`, `/sitemap-images.xml` — sitemaps
- `GET /robots.txt`, `/llms.txt`, `/ai-plugin.json` — AI/search crawler files
- `GET /feed.xml`, `/feed.atom` — RSS and Atom feeds

### Admin (`/api/v1/admin`) — requires admin role

| Group | Endpoints |
|---|---|
| Users | List, get, update, delete, export |
| Places | List, get, create, update, delete (single/batch/all), bulk SEO |
| Groups | List, get, update, delete |
| Reviews | List, get, update, delete |
| Check-ins | List, delete |
| Notifications | List, create, delete |
| Translations | List, get, update all languages |
| Content translations | Manage place description translations |
| Place attributes | CRUD for attribute definitions and values |
| App versions | Manage version enforcement config |
| SEO | Generate/status, AI citations (`GET /admin/seo/ai-citations`) |
| Scraper proxy | List runs, delete run (with optional catalog cleanup) |
| Analytics | Overview, top-places, trends, event log |
| Audit log | Paginated admin action log |

**Key admin endpoints:**
- `DELETE /api/v1/admin/places/{place_code}` — delete place and all related records
- `DELETE /api/v1/admin/places/batch` — batch delete (`{ "place_codes": [...] }`)
- `DELETE /api/v1/admin/places/all` — delete all places
- `DELETE /api/v1/admin/scraper/runs/{run_code}?delete_catalog_places=true` — delete scraper run

## Database Migrations

Schema is managed with **Alembic**. Migrations run automatically on startup.

```bash
# Apply pending migrations (done automatically on startup)
alembic upgrade head

# Roll back one migration
alembic downgrade -1

# Generate migration after changing models
alembic revision --autogenerate -m "describe change"

# Show current state
alembic current
alembic history
```

**Adding a model or column:**
1. Edit `app/db/models.py`
2. Run `alembic revision --autogenerate -m "add <thing>"`
3. Review the generated file in `migrations/versions/`
4. Apply: `alembic upgrade head` (or restart the server)

## Seed Data

On startup in dev, if `app/db/seed_data.json` is present, the server drops all tables and reseeds from that file. Production schema updates use Alembic only — never run seed against production.

To reset and reseed manually:

```bash
cd soulstep-catalog-api && source .venv/bin/activate
python -m app.db.seed
```

## Tests

```bash
cd soulstep-catalog-api
source .venv/bin/activate
python -m pytest tests/ -v
```

Tests use in-memory SQLite (`StaticPool`) with migrations and seed patched out. Each test gets a fresh database.

## Scripts

### Reset place data

Delete all Place records and dependents (images, SEO, reviews, check-ins, favorites, translations, attributes, crawler logs):

```bash
cd soulstep-catalog-api && source .venv/bin/activate
python scripts/reset_place_data.py
```

### Generate SEO

```bash
python scripts/generate_seo.py --generate            # generate slugs + meta
python scripts/generate_seo.py --translate           # translate to all 5 languages (requires GOOGLE_CLOUD_PROJECT)
```

## Directory Structure

```
soulstep-catalog-api/
  app/
    main.py              # FastAPI app, middleware, lifespan
    api/v1/              # Route handlers (auth, users, places, groups, …)
    api/v1/admin/        # Admin-only routes
    db/
      models.py          # SQLModel ORM models
      seed.py            # Seed runner
      seed_data.json     # Seed data (translations, sample places, etc.)
    services/            # Business logic (seo_generator, meta_tags, structured_data, …)
    jobs/                # Scheduled job entrypoints
  migrations/versions/   # Alembic migration files
  scripts/               # One-off scripts (reset_place_data, generate_seo, …)
  tests/                 # pytest integration + unit tests
```
