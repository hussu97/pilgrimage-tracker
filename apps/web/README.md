# Pilgrimage Tracker – Web app

Vite + React + TypeScript + Tailwind frontend for Pilgrimage Tracker. Runs in desktop and mobile browsers. Uses the same API as the mobile app; UI and features are kept in sync with `apps/mobile` (see repo root and `.cursor/rules/frontend-replication.mdc`).

## Run locally

From **repo root** (recommended, so API proxy works):

```bash
npm install
npm run dev:web
```

Runs at `http://localhost:5173`. API requests to `/api` are proxied to the backend (default `http://localhost:3000`).

From this directory only:

```bash
npm install
npm run dev
```

If the backend is not on port 3000, set **`VITE_API_URL`** (e.g. `VITE_API_URL=http://localhost:3000`) or configure the proxy in `vite.config.ts`.

## Build

```bash
npm run build
```

Output: `dist/`. For production, set `VITE_API_URL` to the production API URL at build time.

## Environment

- **`VITE_API_URL`** – Base URL of the API (e.g. `http://localhost:3000`). Optional when using Vite proxy to the same host.

## Structure

- `src/` – React app: pages, components, API client, types, context.
- API client in `src/api/client.ts` calls versioned `/api/v1/*` endpoints.
- Design reference: `DESIGN_FILE.html` at repo root.
