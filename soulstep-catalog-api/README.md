# SoulStep API (Python + FastAPI)

Backend for SoulStep. Versioned API at `/api/v1`. **Python 3.11+** required. On macOS, use `brew install python@3.12` (or latest) then create the venv with `python3 -m venv .venv`.

## Run

From this directory (`soulstep-catalog-api/`):

```bash
python3 -m venv .venv
source .venv/bin/activate   # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 3000
```

The API will be at `http://localhost:3000`. The web and mobile apps proxy `/api` to this port when running in dev.

## Troubleshooting

### Port 3000 Already in Use

If you get an "Address already in use" error, the port is still occupied by a previous process. Kill it with:

```bash
# Find and kill the process on port 3000
lsof -ti :3000 | xargs kill -9
```

Or find the process ID first, then kill it:

```bash
# Find the process
lsof -i :3000

# Kill it (replace PID with the actual process ID)
kill -9 PID
```

## Database Migrations (Alembic)

Schema is managed with **Alembic**. Migrations live in `soulstep-catalog-api/migrations/versions/`. The server runs `alembic upgrade head` automatically on startup so the schema is always up to date.

### Common commands (run from `soulstep-catalog-api/` with venv active)

```bash
# Apply all pending migrations (done automatically on startup)
alembic upgrade head

# Roll back one migration
alembic downgrade -1

# Generate a new migration after changing SQLModel models
alembic revision --autogenerate -m "describe your change"

# Show current migration state
alembic current

# Show migration history
alembic history
```

### Adding a new model / column

1. Edit `app/db/models.py` with your new model or field.
2. Run `alembic revision --autogenerate -m "add <thing>"` — Alembic compares your SQLModel metadata against the live schema and writes the migration file.
3. Review the generated file in `migrations/versions/`.
4. Apply it: `alembic upgrade head` (or just restart the server).

## Seed data

The server uses **SQLModel** with a persistent **SQLite database** (`soulstep.db`). Data is loaded from a **central seed file** on startup:

- **File:** `app/db/seed_data.json` (relative to `soulstep-catalog-api/`). It contains `languages`, `translations` (en, ar, hi), and sample data for all stores.
- **Runner:** `app/db/seed.py` — `run_seed(seed_path)` drops all tables, rebuilds schema via `alembic upgrade head`, then populates the database from the JSON. It is invoked automatically on app startup when `seed_data.json` is present (dev only — no-op in production).
- **Reset:** Restart the server to clear and re-run the seed from scratch. Or run it directly: `cd soulstep-catalog-api && source .venv/bin/activate && python -m app.db.seed`.

> **Note:** `run_seed()` drops all tables — never run it against a production database. Production schema updates are handled solely by `alembic upgrade head`.

### Why SQLModel?
By using SQLModel, we maintain Pydantic-like schemas for the API while gaining full SQL persistence, foreign key constraints, and performance-optimized queries.

## Endpoints (v1)

### Core
- `GET /health` — health check
- `GET /api/v1/app-version` — current min/recommended app version; no auth

### Auth (`/api/v1/auth`)
- `POST /api/v1/auth/register` — register (email, password, display_name)
- `POST /api/v1/auth/login` — login
- `POST /api/v1/auth/forgot-password` — request password reset link
- `POST /api/v1/auth/reset-password` — reset password with token

### Users (`/api/v1/users`)
- `GET /api/v1/users/me` — current user (Bearer token)
- `PATCH /api/v1/users/me` — update profile (display_name)
- `GET /api/v1/users/me/settings` — get user settings (theme, language, units, religions, etc.)
- `PATCH /api/v1/users/me/settings` — update user settings
- `GET /api/v1/users/me/check-ins` — current user's check-ins
- `GET /api/v1/users/me/stats` — places visited, check-ins this year
- `GET /api/v1/users/me/favorites` — favorited places

### Places (`/api/v1/places`)
- `GET /api/v1/places` — list places (query: religion, lat, lng, radius, limit≤500, cursor, open_now, has_parking, womens_area, has_events, top_rated, min_lat, max_lat, min_lng, max_lng, lang)
- `GET /api/v1/places/{placeCode}` — get place detail
- `GET /api/v1/places/{placeCode}/reviews` — reviews for a place (query: limit, offset, lang — BCP-47 code for translated title/body)
- `POST /api/v1/places/{placeCode}/check-in` — check in to a place
- `POST /api/v1/places/{placeCode}/favorite` — add to favorites
- `DELETE /api/v1/places/{placeCode}/favorite` — remove from favorites
- `POST /api/v1/places/{placeCode}/reviews` — create a review
- `POST /api/v1/places` — create a place (scraper sync)
- `POST /api/v1/places/batch` — batch create places (scraper sync)
- `GET /api/v1/places/{placeCode}/image/{imageCode}` — serve place image

### Cities (`/api/v1/cities`)
- `GET /api/v1/cities` — list all cities with place counts, sorted by count desc (query: limit≤500, offset)
- `GET /api/v1/cities/{city_slug}` — places in a city matched by slug (query: page, page_size≤200)
- `GET /api/v1/cities/{city_slug}/{religion}` — places in a city filtered by religion

### Reviews (`/api/v1/reviews`)
- `PATCH /api/v1/reviews/{reviewCode}` — update a review
- `DELETE /api/v1/reviews/{reviewCode}` — delete a review

### Groups (`/api/v1/groups`)
- `GET /api/v1/groups` — list user's groups
- `POST /api/v1/groups` — create a group
- `GET /api/v1/groups/{groupCode}` — get group detail
- `PATCH /api/v1/groups/{groupCode}` — update group
- `DELETE /api/v1/groups/{groupCode}` — delete group
- `POST /api/v1/groups/{groupCode}/join` — join a group
- `DELETE /api/v1/groups/{groupCode}/leave` — leave a group
- `GET /api/v1/groups/{groupCode}/members` — list group members
- `DELETE /api/v1/groups/{groupCode}/members/{userCode}` — remove a member
- `PATCH /api/v1/groups/{groupCode}/members/{userCode}/role` — update member role
- `GET /api/v1/groups/{groupCode}/leaderboard` — group leaderboard
- `GET /api/v1/groups/{groupCode}/activity` — group activity feed
- `GET /api/v1/groups/{groupCode}/checklist` — group place checklist
- `POST /api/v1/groups/{groupCode}/places/{placeCode}` — add place to group itinerary
- `GET /api/v1/groups/{groupCode}/places/{placeCode}/notes` — get place notes
- `POST /api/v1/groups/{groupCode}/places/{placeCode}/notes` — add place note
- `DELETE /api/v1/groups/{groupCode}/notes/{noteCode}` — delete place note
- `POST /api/v1/groups/{groupCode}/invite` — create invite link
- `GET /api/v1/groups/by-invite/{inviteCode}` — look up group by invite code
- `POST /api/v1/groups/join-by-invite` — join group via invite code
- `POST /api/v1/groups/{groupCode}/cover` — upload group cover image
- `GET /api/v1/groups/cover-image/{imageCode}` — serve group cover image

### Notifications (`/api/v1/notifications`)
- `GET /api/v1/notifications` — list notifications
- `PATCH /api/v1/notifications/{notificationCode}/read` — mark notification as read

### Search (`/api/v1/search`)
- `GET /api/v1/search/autocomplete` — place name autocomplete
- `GET /api/v1/search/place-details` — fetch place details by place ID

### Visitors (`/api/v1/visitors`)
- `POST /api/v1/visitors` — create an anonymous visitor session
- `GET /api/v1/visitors/{visitorCode}/settings` — get visitor settings
- `PATCH /api/v1/visitors/{visitorCode}/settings` — update visitor settings

### Ads & Consent (`/api/v1/ads`, `/api/v1/consent`)
- `GET /api/v1/ads/config?platform=web|ios|android` — ad config (enabled flag, publisher ID, slot IDs); no auth
- `POST /api/v1/consent` — record ad/analytics consent; auth optional (supports visitor_code)
- `GET /api/v1/consent` — current consent status for caller

### Analytics (`/api/v1/analytics`)
- `POST /api/v1/analytics/events` — batch ingest analytics events (max 50/req, 10 req/min rate limit); auth optional (requires visitor_code if anonymous)

### Admin Analytics (`/api/v1/admin/analytics`) — requires admin role
- `GET /admin/analytics/overview` — total events, unique users/visitors/sessions, top event types, platform breakdown
- `GET /admin/analytics/top-places?period=7d&limit=20` — top places by analytics event frequency
- `GET /admin/analytics/trends?interval=day&period=30d&event_type=` — event count trends over time
- `GET /admin/analytics/events?page=1&page_size=50&event_type=&platform=` — paginated raw event log with filters

### i18n (`/api/v1`)
- `GET /api/v1/languages` — list supported languages (code, name); no auth
- `GET /api/v1/translations?lang=en` — translation key→value for locale; fallback to English for missing keys; no auth

### Share
- `GET /share/{shareCode}` — resolve a share link (redirect to web app or return place info)

### Admin (`/api/v1/admin`) — requires admin role
Full CRUD for users, places, groups, reviews, check-ins, notifications, translations, content translations, place attributes, bulk operations, data export, audit log, app version management, scraper proxy, ad config management, and analytics queries.

## Tests

```bash
cd soulstep-catalog-api
source .venv/bin/activate
python -m pytest tests/ -v
```

Tests use in-memory SQLite (`StaticPool`) with migrations and seed patched out. Each test gets a fresh database.

## Environment

- `JWT_SECRET` — secret for JWT (default: dev secret)
- `PORT` — port (default: 3000)
- `DATABASE_URL` — (optional for production) PostgreSQL connection string; when unset, SQLite (`soulstep.db`) is used for dev.
- `GOOGLE_MAPS_API_KEY` — (optional, for scraper) Google Maps API key for `soulstep-scraper-api/gmaps.py`. Not required for server operation, only for running the scraper to discover new places.
- `GOOGLE_TRANSLATE_API_KEY` — (optional) Google Cloud Translation API key. Required only for running `scripts/backfill_translations.py`. Enable "Cloud Translation API" at console.cloud.google.com.
- `GOOGLE_CLOUD_PROJECT` — (optional) GCP project ID. Required alongside `GOOGLE_TRANSLATE_API_KEY` for the v3 translation endpoint.
- `IMAGE_STORAGE` — (optional) `blob` (default, stores images in DB) or `gcs` (upload to Google Cloud Storage).
- `GCS_BUCKET_NAME` — (optional) GCS bucket name. Required when `IMAGE_STORAGE=gcs`. Bucket objects must be publicly readable.
- `GOOGLE_APPLICATION_CREDENTIALS` — (optional) Path to a GCP service account JSON key. Required on non-GCP hosts when using `IMAGE_STORAGE=gcs` or the translation backfill script. Not needed on Cloud Run (uses workload identity).

For production deployment options, see [PRODUCTION.md](../PRODUCTION.md) at repo root.

## Scripts

### Translation Backfill (`scripts/backfill_translations.py`)

Backfills `ContentTranslation` rows for existing Place and Review records.

**Fields translated:** `name`, `description` for places; `title`, `body` for reviews. `address` is intentionally excluded — location identifiers are understood universally without translation.

**Prerequisites:**
1. `gcloud auth application-default login`
2. Set `GOOGLE_CLOUD_PROJECT` in `.env`

**Usage:**
```bash
# Dry run — show what would be translated without writing
python -m scripts.backfill_translations --dry-run

# Estimate cost before running (no API calls made)
python -m scripts.backfill_translations --estimate

# Skip short reviews (e.g. < 20 chars like "Great!")
python -m scripts.backfill_translations --min-review-length 20

# Target specific languages only
python -m scripts.backfill_translations --langs ar hi

# Full run with rate limiting
python -m scripts.backfill_translations --batch-size 50 --rate-limit-delay 0.5
```

**Flags:**
| Flag | Default | Description |
|------|---------|-------------|
| `--langs` | all non-English | Languages to backfill (from `seed_data.json`) |
| `--dry-run` | off | Print actions without writing to DB |
| `--estimate` | off | Show char count + estimated cost ($20/M chars) — no API calls |
| `--batch-size` | 50 | Translation batch size |
| `--rate-limit-delay` | 0.5 | Seconds to sleep between API batches |
| `--min-review-length` | 0 | Skip review fields shorter than N chars (0 = translate all) |
