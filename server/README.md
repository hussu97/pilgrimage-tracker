# Pilgrimage Tracker API (Python + FastAPI)

Backend for Pilgrimage Tracker. Versioned API at `/api/v1`. **Python 3.11+** required. On macOS, use `brew install python@3.12` (or latest) then create the venv with `python3 -m venv .venv`.

## Run

From this directory (`server/`):

```bash
python3 -m venv .venv
source .venv/bin/activate   # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 3000
```

The API will be at `http://localhost:3000`. The web and mobile apps proxy `/api` to this port when running in dev.

## Seed data

In-memory data (users, places, groups, reviews, check-ins, notifications, favorites, and i18n languages/translations) is loaded from a **central seed file** on startup:

- **File:** `app/db/seed_data.json` (relative to `server/`). It contains `languages`, `translations` (en, ar, hi), and sample data for all stores.
- **Runner:** `app/db/seed.py` — `run_seed(seed_path)` loads the JSON and populates all in-memory stores. It is invoked automatically on app startup (see `app/main.py` lifespan).
- **Reset:** Restart the server to clear and re-run the seed. Optionally run from the repo: `cd server && source .venv/bin/activate && python -m app.db.seed` to run the seed script once (e.g. in a fresh shell without starting the API).

## Endpoints (v1)

- `GET /health` — health check
- `POST /api/v1/auth/register` — register (email, password, display_name)
- `POST /api/v1/auth/login` — login
- `POST /api/v1/auth/forgot-password` — request reset link
- `POST /api/v1/auth/reset-password` — reset with token
- `GET /api/v1/users/me` — current user (Bearer token)
- `PATCH /api/v1/users/me` — update profile (display_name, avatar_url)
- `GET /api/v1/users/me/settings` — get settings (theme, language, units, religions, etc.)
- `PATCH /api/v1/users/me/settings` — update settings
- `GET /api/v1/users/me/check-ins` — current user's check-ins
- `GET /api/v1/users/me/stats` — places visited, check-ins this year
- `GET /api/v1/users/me/favorites` — favorited places
- `GET /api/v1/places` — list places (query: religion, lat, lng, limit, offset)
- `GET /api/v1/languages` — list supported languages (code, name); no auth
- `GET /api/v1/translations?lang=en` — translation key→value for locale; fallback to English for missing keys; no auth

## Environment

- `JWT_SECRET` — secret for JWT (default: dev secret)
- `PORT` — port (default: 3000)
- `DATABASE_URL` — (optional for production) PostgreSQL connection string; when unset, in-memory stores are used for dev.

For production deployment options, see [PRODUCTION.md](../PRODUCTION.md) at repo root.
