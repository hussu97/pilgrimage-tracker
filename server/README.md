# SoulStep API (Python + FastAPI)

Backend for SoulStep. Versioned API at `/api/v1`. **Python 3.11+** required. On macOS, use `brew install python@3.12` (or latest) then create the venv with `python3 -m venv .venv`.

## Run

From this directory (`server/`):

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

Schema is managed with **Alembic**. Migrations live in `server/migrations/versions/`. The server runs `alembic upgrade head` automatically on startup so the schema is always up to date.

### Common commands (run from `server/` with venv active)

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

- **File:** `app/db/seed_data.json` (relative to `server/`). It contains `languages`, `translations` (en, ar, hi), and sample data for all stores.
- **Runner:** `app/db/seed.py` — `run_seed(seed_path)` drops all tables, rebuilds schema via `alembic upgrade head`, then populates the database from the JSON. It is invoked automatically on app startup when `seed_data.json` is present (dev only — no-op in production).
- **Reset:** Restart the server to clear and re-run the seed from scratch. Or run it directly: `cd server && source .venv/bin/activate && python -m app.db.seed`.

> **Note:** `run_seed()` drops all tables — never run it against a production database. Production schema updates are handled solely by `alembic upgrade head`.

### Why SQLModel?
By using SQLModel, we maintain Pydantic-like schemas for the API while gaining full SQL persistence, foreign key constraints, and performance-optimized queries.

## Endpoints (v1)

- `GET /health` — health check
- `POST /api/v1/auth/register` — register (email, password, display_name)
- `POST /api/v1/auth/login` — login
- `POST /api/v1/auth/forgot-password` — request reset link
- `POST /api/v1/auth/reset-password` — reset with token
- `GET /api/v1/users/me` — current user (Bearer token)
- `PATCH /api/v1/users/me` — update profile (display_name)
- `GET /api/v1/users/me/settings` — get settings (theme, language, units, religions, etc.)
- `PATCH /api/v1/users/me/settings` — update settings
- `GET /api/v1/users/me/check-ins` — current user's check-ins
- `GET /api/v1/users/me/stats` — places visited, check-ins this year
- `GET /api/v1/users/me/favorites` — favorited places
- `GET /api/v1/places` — list places (query: religion, lat, lng, limit, offset)
- `POST /api/v1/places` — create a new place (used for syncing scraper data)
- `GET /api/v1/languages` — list supported languages (code, name); no auth
- `GET /api/v1/translations?lang=en` — translation key→value for locale; fallback to English for missing keys; no auth

## Environment

- `JWT_SECRET` — secret for JWT (default: dev secret)
- `PORT` — port (default: 3000)
- `DATABASE_URL` — (optional for production) PostgreSQL connection string; when unset, SQLite (`soulstep.db`) is used for dev.
- `GOOGLE_MAPS_API_KEY` — (optional, for scraper) Google Maps API key for `data_scraper/gmaps.py`. Not required for server operation, only for running the scraper to discover new places.

For production deployment options, see [PRODUCTION.md](../PRODUCTION.md) at repo root.
