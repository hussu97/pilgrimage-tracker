# Pilgrimage Tracker API (Python + FastAPI)

Backend for Pilgrimage Tracker. Versioned API at `/api/v1`.

## Run

From this directory (`server/`):

```bash
python -m venv .venv
source .venv/bin/activate   # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 3000
```

The API will be at `http://localhost:3000`. The web and mobile apps proxy `/api` to this port when running in dev.

## Endpoints (v1)

- `GET /health` — health check
- `POST /api/v1/auth/register` — register (email, password, display_name)
- `POST /api/v1/auth/login` — login
- `POST /api/v1/auth/forgot-password` — request reset link
- `POST /api/v1/auth/reset-password` — reset with token
- `GET /api/v1/users/me` — current user (Bearer token)
- `PATCH /api/v1/users/me` — update profile
- `PATCH /api/v1/users/me/religion` — set religion
- `GET /api/v1/places` — list places (query: religion, lat, lng, limit, offset)

## Environment

- `JWT_SECRET` — secret for JWT (default: dev secret)
- `PORT` — port (default: 3000)
- `DATABASE_URL` — (optional for production) PostgreSQL connection string; when unset, in-memory stores are used for dev.

For production deployment options, see [PRODUCTION.md](../PRODUCTION.md) at repo root.
