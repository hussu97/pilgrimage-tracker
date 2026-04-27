# SoulStep Catalog API

FastAPI backend for the SoulStep sacred-sites discovery platform. Handles auth, places, groups, check-ins, reviews, translations, and SEO.

## Quick Start

```bash
cd soulstep-catalog-api
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env          # edit values
uvicorn app.main:app --port 3000 --reload
```

Health check: `curl http://127.0.0.1:3000/health`

## Environment Variables

Copy the root `.env.example` to `.env`. Key variables:

| Variable | Description |
|---|---|
| `JWT_SECRET` | Secret for signing JWT tokens |
| `CATALOG_API_KEY` | Internal API key used by other services |
| `DATABASE_URL` | Postgres DSN (e.g. `postgresql+psycopg2://...`) |
| `SCRAPER_DATABASE_URL` | Read DSN for direct DB sync from scraper runs |
| `PORT` | Port to listen on (default `3000`) |
| `CORS_ORIGINS` | Comma-separated allowed origins |
| `FRONTEND_URL` | Customer web URL (for email links) |
| `GOOGLE_MAPS_API_KEY` | Maps API key for place enrichment |
| `IMAGE_STORAGE` | `gcs` or `local` |
| `GCS_BUCKET_NAME` | GCS bucket for place images |
| `DATA_SCRAPER_URL` | URL of the scraper-api service |
| `SENTRY_DSN` | Sentry/GlitchTip error tracking DSN |

## API Endpoints

### Auth
| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/auth/register` | Register new user |
| POST | `/api/v1/auth/login` | Login, receive JWT |
| POST | `/api/v1/auth/logout` | Invalidate token |
| POST | `/api/v1/auth/refresh` | Refresh JWT |
| POST | `/api/v1/auth/forgot-password` | Send reset email |
| POST | `/api/v1/auth/reset-password` | Reset password with token |

### Users
| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/users/me` | Current user profile |
| PATCH | `/api/v1/users/me` | Update profile |
| DELETE | `/api/v1/users/me` | Delete account |

### Places
| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/places` | List places (filterable) |
| GET | `/api/v1/places/:placeCode` | Place detail |
| GET | `/api/v1/places/:placeCode/nearby` | Nearby places |
| GET | `/api/v1/places/:placeCode/similar` | Similar places |
| GET | `/api/v1/cities` | List cities with place counts |
| GET | `/api/v1/cities/:citySlug/places` | Places in a city |

### Groups / Journeys
| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/groups` | List user's groups |
| POST | `/api/v1/groups` | Create group |
| GET | `/api/v1/groups/:groupCode` | Group detail |
| PATCH | `/api/v1/groups/:groupCode` | Update group |
| DELETE | `/api/v1/groups/:groupCode` | Delete group |
| POST | `/api/v1/groups/:groupCode/join` | Join by invite code |
| POST | `/api/v1/groups/:groupCode/places` | Add place to journey |
| DELETE | `/api/v1/groups/:groupCode/places/:placeCode` | Remove place |

### Check-ins
| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/checkins` | Check in to a place |
| GET | `/api/v1/checkins` | List user's check-ins |

### Reviews
| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/places/:placeCode/reviews` | Submit review |
| GET | `/api/v1/places/:placeCode/reviews` | List reviews |

### Translations / i18n
| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/languages` | Supported languages |
| GET | `/api/v1/translations` | All strings for `?lang=en\|ar\|hi\|te\|ml` |

### SEO Content Pages
| Method | Path | Description |
|---|---|---|
| GET | `/share/places/:placeCode` | Public place page |
| GET | `/share/about` | About page |
| GET | `/share/how-it-works` | How it works page |
| GET | `/share/coverage` | Coverage page |
| GET | `/sitemap.xml` | XML sitemap |
| GET | `/feed.xml` | RSS feed |
| GET | `/feed.atom` | Atom feed |
| GET | `/robots.txt` | Robots rules |
| GET | `/llms.txt` | AI crawler guidance |

### Admin
| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/admin/places` | List/search places |
| POST | `/api/v1/admin/places` | Create place |
| PATCH | `/api/v1/admin/places/:placeCode` | Update place |
| DELETE | `/api/v1/admin/places/:placeCode` | Delete place |
| GET | `/api/v1/admin/users` | List users |
| GET | `/api/v1/admin/seo` | SEO dashboard stats |
| GET | `/api/v1/admin/seo/ai-citations` | AI crawler log |
| POST | `/api/v1/admin/sync-places/direct` | Start a run-scoped direct DB sync from scraper DB to catalog DB |

## Direct Scraper Sync Job

Large handoff finalizations should not send places through `/api/v1/places/batch`.
Instead, catalog-api can read completed scraper rows directly from
`SCRAPER_DATABASE_URL`, run them through the same place-ingest service used by
the API path, and update scraper sync counters during and after the job:

```bash
source .venv/bin/activate
SCRAPER_DATABASE_URL=postgresql://... python -m app.jobs.sync_places --run-code run_xxx
SCRAPER_DATABASE_URL=postgresql://... python -m app.jobs.sync_places --run-code run_xxx --failed-only
SCRAPER_DATABASE_URL=postgresql://... python -m app.jobs.sync_places --run-code run_xxx --dry-run
```

`POST /api/v1/admin/sync-places/direct` starts that same CLI in a detached
process instead of FastAPI `BackgroundTasks`, so large run syncs are not tied to
the request worker lifetime. Logs are written under `CATALOG_SYNC_LOG_DIR`
(default `/tmp/soulstep-catalog-sync`) and the scraper DB receives running,
failed, or completed `rate_limit_events.direct_catalog_sync` telemetry.

The direct job preserves existing catalog images when incoming scraper image
count is lower, and replaces scraper-owned `PlaceImage` rows when incoming count
is equal or higher.

## Migrations

```bash
alembic upgrade head                              # apply all migrations
alembic revision --autogenerate -m "description" # generate new migration
```

## Tests

```bash
source .venv/bin/activate
python -m pytest tests/ -v
```
