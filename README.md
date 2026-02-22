# SoulStep

Discover, visit, and track religious places. Multi-platform: desktop web, mobile web, and (via Expo) iOS/Android.

## Structure

- **`server/`** – Backend API (**Python + FastAPI**). Versioned at `/api/v1`. See [server/README.md](server/README.md).
- **`apps/web/`** – Web app (Vite + React + Tailwind). Desktop and mobile browser.
- **`apps/mobile/`** – Mobile app (Expo / React Native). iOS and Android builds via Expo; same API as web.

Both frontend apps use the **same API base URL** for `/api/v1`. No shared `packages/` folder; each app has its own types and API client. See [ARCHITECTURE.md](ARCHITECTURE.md) and [.cursor/rules/frontend-replication.mdc](.cursor/rules/frontend-replication.mdc).

## Prerequisites

- **Backend:** Python 3.14 (or 3.11+). On macOS with Homebrew: `brew install python` for the latest; use `python3 -m venv .venv` in `server/` to create the virtual environment. Pillow (image processing library) is required and will be installed via `requirements.txt`.
- **Frontend:** Node.js 18+, npm (or pnpm/yarn)

## Setup

**Backend (from `server/`):**

```bash
cd server
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
cd server && source .venv/bin/activate && uvicorn app.main:app --reload --port 3000
```

Runs at `http://127.0.0.1:3000`. Health: `GET /health`. API: `/api/v1/places`, `/api/v1/auth/*`, `/api/v1/users/me`, etc.

**Web app:**

```bash
npm run dev:web
```

Runs at **http://127.0.0.1:5173**. Open that URL (use `127.0.0.1`—not `localhost`—on macOS to avoid IPv6 and pending API requests). Proxies `/api` to the server when the server is on port 3000. The **Home** page at `/home` (after login) fetches places from the API; if nothing appears, ensure the backend is running and the proxy target matches (default `http://127.0.0.1:3000`). If the server runs on another port (e.g. 8000), set `VITE_PROXY_TARGET=http://127.0.0.1:8000` before starting the web app, or see [apps/web/README.md](apps/web/README.md).

**Mobile app (Expo):**

```bash
npm run dev:mobile
```

Starts the Expo dev server. Run on iOS simulator, Android emulator, or device via Expo Go; or use `npx expo run:ios` / `npx expo run:android` from `apps/mobile`. Set `EXPO_PUBLIC_API_URL` to the API base URL (e.g. `http://127.0.0.1:3000`) when needed. Use `127.0.0.1`—not `localhost`—on macOS to avoid IPv6 issues. See [apps/mobile/README.md](apps/mobile/README.md).

## Environment

- **Server:** `JWT_SECRET`, `PORT` (default 3000). See `server/README.md`.
- **Web:** `VITE_API_URL` – API base URL. Leave unset when using Vite proxy to `http://localhost:3000`.
- **Mobile:** `EXPO_PUBLIC_API_URL` – API base URL for the Expo app (e.g. `http://localhost:3000`).

## Docs

- [ARCHITECTURE.md](ARCHITECTURE.md) – System design, data model, API outline.
- [IMPLEMENTATION_PROMPTS.md](IMPLEMENTATION_PROMPTS.md) – Step-by-step implementation prompts.
- [CHANGELOG.md](CHANGELOG.md) – Implemented changes over time.
- [PRODUCTION.md](PRODUCTION.md) – Go-to-production plans (Docker, free tier e.g. Render/Vercel, GCP).
- **Service READMEs:** [server/README.md](server/README.md), [apps/web/README.md](apps/web/README.md), [apps/mobile/README.md](apps/mobile/README.md).
