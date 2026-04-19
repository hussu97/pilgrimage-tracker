# SoulStep

Discover, visit, and track sacred sites. Multi-platform: web (desktop + mobile browser), iOS, and Android.

## Structure

| Directory | Service | Description |
|---|---|---|
| `soulstep-catalog-api/` | **Catalog API** | Python + FastAPI backend. Versioned REST API at `/api/v1`. SQLite (dev) / PostgreSQL (prod). |
| `soulstep-scraper-api/` | **Scraper API** | Python + FastAPI scraper. Discovers and enriches sacred places from Google Maps and other sources, then syncs to the catalog. |
| `apps/soulstep-customer-web/` | **Web App** | Vite + React + Tailwind. Desktop and mobile browsers. |
| `apps/soulstep-customer-mobile/` | **Mobile App** | Expo / React Native. iOS and Android. Same API and feature set as web. |
| `apps/soulstep-admin-web/` | **Admin Dashboard** | Vite + React + Tailwind. Manages users, places, groups, scraper runs, translations, analytics, and more. |

No shared `packages/` folder — each app maintains its own types and API client, kept in parity by convention.

## Quick Start

### Prerequisites

- **Python 3.11+** — use `brew install python` (macOS) or pyenv
- **Node.js 18+**

### 1. Backend

```bash
cd soulstep-catalog-api
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 3000
```

Runs at **http://127.0.0.1:3000**. Health check: `GET /health`.

### 2. Web App

```bash
npm install          # from repo root
npm run dev:web
```

Open **http://127.0.0.1:5173** (use `127.0.0.1`, not `localhost`, on macOS). The dev server proxies `/api` to `http://127.0.0.1:3000`.

### 3. Mobile App

```bash
npm run dev:mobile   # from repo root
```

Press `i` for iOS simulator, `a` for Android emulator, or scan the QR code with Expo Go.

### 4. Scraper (optional)

```bash
cd soulstep-scraper-api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

Runs at **http://127.0.0.1:8001**. Requires `GOOGLE_MAPS_API_KEY` set in `.env`.

### 5. Admin Dashboard

```bash
cd apps/soulstep-admin-web
npm install
npm run dev
```

Open **http://127.0.0.1:5174**. Requires a user with `role = admin` in the database.

## Environment Variables

Each service has its own `.env.example`. Key variables:

| Service | Variable | Description |
|---|---|---|
| Catalog API | `JWT_SECRET` | JWT signing secret — always set in production |
| Catalog API | `DATABASE_URL` | PostgreSQL URL (dev uses SQLite by default) |
| Catalog API | `FRONTEND_URL` | Public web frontend URL (sitemap, JSON-LD, emails) |
| Web app | `VITE_API_URL` | API base URL — baked in at build time |
| Web app | `VITE_PROXY_TARGET` | Dev proxy target (default `http://127.0.0.1:3000`) |
| Mobile | `EXPO_PUBLIC_API_URL` | API base URL for device / Expo Go |
| Scraper | `GOOGLE_MAPS_API_KEY` | Google Maps API key |
| Scraper | `MAIN_SERVER_URL` | Catalog API URL for syncing scraped places |

See each service's `.env.example` for the full variable list.

## Docs

| File | Contents |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | System design, data model, API outline |
| [PRODUCTION.md](PRODUCTION.md) | GCP + Firebase deployment guide |
| [SYSTEMS.md](SYSTEMS.md) | Complete system reference |
| [CHANGELOG.md](CHANGELOG.md) | Implemented changes |
| [ROADMAP.md](ROADMAP.md) | Planned features and milestones |
| [soulstep-catalog-api/README.md](soulstep-catalog-api/README.md) | Catalog API: setup, endpoints, migrations, env vars |
| [soulstep-scraper-api/README.md](soulstep-scraper-api/README.md) | Scraper API: setup, usage, architecture, collectors |
| [apps/soulstep-customer-web/README.md](apps/soulstep-customer-web/README.md) | Web app: setup, routes, env vars, tests |
| [apps/soulstep-customer-mobile/README.md](apps/soulstep-customer-mobile/README.md) | Mobile app: setup, builds, env vars, tests |
| [apps/soulstep-admin-web/README.md](apps/soulstep-admin-web/README.md) | Admin dashboard: setup,  pages, API surface, env vars |
