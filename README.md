# Pilgrimage Tracker

Discover, visit, and track religious places. Multi-platform: desktop web, mobile web, and (via Capacitor) iOS/Android.

## Structure

- **`server/`** – Backend API (**Python + FastAPI**). Versioned at `/api/v1`. See [server/README.md](server/README.md).
- **`apps/web/`** – Web app (Vite + React + Tailwind). Desktop and mobile browser.
- **`apps/mobile/`** – Mobile app (same stack). Replicated UI; add Capacitor for iOS/Android builds.

Both frontend apps use the **same API base URL** for `/api/v1`. No shared `packages/` folder; each app has its own types and API client. See [ARCHITECTURE.md](ARCHITECTURE.md) and [.cursor/rules/frontend-replication.mdc](.cursor/rules/frontend-replication.mdc).

## Prerequisites

- **Backend:** Python 3.9+ (3.11+ recommended)
- **Frontend:** Node.js 18+, npm (or pnpm/yarn)

## Setup

**Backend (from `server/`):**

```bash
cd server
python -m venv .venv
source .venv/bin/activate   # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
```

**Frontend (from repo root):**

```bash
npm install
```

## Run

**Backend (required for places and auth):**

```bash
cd server && source .venv/bin/activate && uvicorn app.main:app --reload --port 3000
```

Runs at `http://localhost:3000`. Health: `GET /health`. API: `/api/v1/places`, `/api/v1/auth/*`, `/api/v1/users/me`, etc.

**Web app:**

```bash
npm run dev:web
```

Runs at `http://localhost:5173`. Proxies `/api` to the server when server is on port 3000.

**Mobile app (same UI, different port):**

```bash
npm run dev:mobile
```

Runs at `http://localhost:5174`. Set `VITE_API_URL=http://localhost:3000` if not using proxy, or configure proxy in `apps/mobile/vite.config.ts`.

## Environment

- **Server:** `JWT_SECRET`, `PORT` (default 3000). See `server/README.md`.
- **Web/Mobile:** `VITE_API_URL` – API base URL. Leave unset when using Vite proxy to `http://localhost:3000`.

## Docs

- [ARCHITECTURE.md](ARCHITECTURE.md) – System design, data model, API outline.
- [IMPLEMENTATION_PROMPTS.md](IMPLEMENTATION_PROMPTS.md) – Step-by-step implementation prompts.
- [CHANGELOG.md](CHANGELOG.md) – Implemented changes over time.
- [PRODUCTION.md](PRODUCTION.md) – Go-to-production plans (Docker, free tier e.g. Render/Vercel, GCP).
- **Service READMEs:** [server/README.md](server/README.md), [apps/web/README.md](apps/web/README.md), [apps/mobile/README.md](apps/mobile/README.md).
