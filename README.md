# SoulStep

Discover, visit, and track religious places. Multi-platform: desktop web, mobile web, and (via Expo) iOS/Android.

## Structure

- **`soulstep-catalog-api/`** – Backend API (**Python + FastAPI**). Versioned at `/api/v1`. See [soulstep-catalog-api/README.md](soulstep-catalog-api/README.md).
- **`soulstep-scraper-api/`** – Scraper service (**Python + FastAPI**). Discovers and enriches sacred places from Google Maps and other sources. See [soulstep-scraper-api/README.md](soulstep-scraper-api/README.md).
- **`apps/soulstep-customer-web/`** – Web app (Vite + React + Tailwind). Desktop and mobile browser.
- **`apps/soulstep-customer-mobile/`** – Mobile app (Expo / React Native). iOS and Android builds via Expo; same API as web.
- **`apps/soulstep-admin-web/`** – Admin dashboard (Vite + React + Tailwind). Manages users, places, groups, reviews, scraper, content, and more. See [apps/soulstep-admin-web/README.md](apps/soulstep-admin-web/README.md).

Both frontend apps use the **same API base URL** for `/api/v1`. No shared `packages/` folder; each app has its own types and API client. See [ARCHITECTURE.md](ARCHITECTURE.md) and [.cursor/rules/frontend-replication.mdc](.cursor/rules/frontend-replication.mdc).

## Prerequisites

- **Backend:** Python 3.14 (or 3.11+). On macOS with Homebrew: `brew install python` for the latest; use `python3 -m venv .venv` in `soulstep-catalog-api/` to create the virtual environment. Pillow (image processing library) is required and will be installed via `requirements.txt`.
- **Frontend:** Node.js 18+, npm (or pnpm/yarn)

## Setup

**Backend (from `soulstep-catalog-api/`):**

```bash
cd soulstep-catalog-api
python3 -m venv .venv
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
cd soulstep-catalog-api && source .venv/bin/activate && uvicorn app.main:app --reload --port 3000
```

Runs at `http://127.0.0.1:3000`. Health: `GET /health`. API: `/api/v1/places`, `/api/v1/auth/*`, `/api/v1/users/me`, etc.

**Web app:**

```bash
npm run dev:web
```

Runs at **http://127.0.0.1:5173**. Open that URL (use `127.0.0.1`—not `localhost`—on macOS to avoid IPv6 and pending API requests). Proxies `/api` to the server when the server is on port 3000. The **Home** page at `/home` (after login) fetches places from the API; if nothing appears, ensure the backend is running and the proxy target matches (default `http://127.0.0.1:3000`). If the server runs on another port (e.g. 8000), set `VITE_PROXY_TARGET=http://127.0.0.1:8000` before starting the web app, or see [apps/soulstep-customer-web/README.md](apps/soulstep-customer-web/README.md).

**Mobile app (Expo):**

```bash
npm run dev:mobile
```

Starts the Expo dev server. Run on iOS simulator, Android emulator, or device via Expo Go; or use `npx expo run:ios` / `npx expo run:android` from `apps/soulstep-customer-mobile`. Set `EXPO_PUBLIC_API_URL` to the API base URL (e.g. `http://127.0.0.1:3000`) when needed. Use `127.0.0.1`—not `localhost`—on macOS to avoid IPv6 issues. See [apps/soulstep-customer-mobile/README.md](apps/soulstep-customer-mobile/README.md).

## Environment

- **Server:** `JWT_SECRET`, `PORT` (default 3000). See `soulstep-catalog-api/README.md`.
- **Web:** `VITE_API_URL` – API base URL. Leave unset when using Vite proxy to `http://localhost:3000`.
- **Mobile:** `EXPO_PUBLIC_API_URL` – API base URL for the Expo app (e.g. `http://localhost:3000`).
- **Image storage (optional):** `IMAGE_STORAGE=gcs` + `GCS_BUCKET_NAME` to use Google Cloud Storage instead of database blobs. `GOOGLE_APPLICATION_CREDENTIALS` needed on non-GCP hosts. See `soulstep-catalog-api/README.md` and [PRODUCTION.md](PRODUCTION.md).

## Docs

- [ARCHITECTURE.md](ARCHITECTURE.md) – System design, data model, API outline.
- [CHANGELOG.md](CHANGELOG.md) – Implemented changes over time.
- [PRODUCTION.md](PRODUCTION.md) – Go-to-production plans (Docker, free tier e.g. Render/Firebase, GCP).
- [ROADMAP.md](ROADMAP.md) – Planned features and milestones.
- **Service READMEs:** [soulstep-catalog-api/README.md](soulstep-catalog-api/README.md), [soulstep-scraper-api/README.md](soulstep-scraper-api/README.md), [apps/soulstep-customer-web/README.md](apps/soulstep-customer-web/README.md), [apps/soulstep-customer-mobile/README.md](apps/soulstep-customer-mobile/README.md), [apps/soulstep-admin-web/README.md](apps/soulstep-admin-web/README.md).
