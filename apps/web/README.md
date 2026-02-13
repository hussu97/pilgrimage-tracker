# Pilgrimage Tracker – Web app

Vite + React + TypeScript + Tailwind frontend for Pilgrimage Tracker. **All functionality lives in this folder** (`apps/web`): pages, API client, types, and context. It runs in desktop and mobile browsers and talks to the backend API (same contract as the Expo mobile app; see repo root for architecture).

## Prerequisites

- **Backend must be running** for any API calls to work. From `server/`: `uvicorn app.main:app --reload --port 3000`. If the backend is not on port 3000, see Environment below.

## Run locally

1. Start the **backend** first (from repo root or `server/`):

   ```bash
   cd server
   source .venv/bin/activate   # or .venv\Scripts\activate on Windows
   uvicorn app.main:app --reload --port 3000
   ```

2. Start the app:

   **Option 1 – from repo root (monorepo script):**

   ```bash
   npm install
   npm run dev:web
   ```

   **Option 2 – from this directory:**

   ```bash
   npm install
   npm run dev
   ```

3. Open **http://127.0.0.1:5173** in your browser (use `127.0.0.1`—not `localhost`—on macOS to avoid IPv6 and pending API requests). If the terminal shows "Network: use --host to expose", that's normal for local dev; the app is still available at 127.0.0.1:5173.

The dev server **proxies** requests to the backend: any request to `/api` is forwarded to `http://127.0.0.1:3000`. The app uses relative URLs (`/api/v1/...`) when `VITE_API_URL` is unset.

**If the app does not call the backend or requests stay "pending":**

1. Ensure the backend is running (see step 1 above).
2. Open the app at **http://127.0.0.1:5173** (not localhost).
3. Use the dev server; do not open the built `dist/` files directly (no proxy there).
4. If the backend runs on another port, set `VITE_PROXY_TARGET=http://127.0.0.1:PORT` before starting the dev server, or set `VITE_API_URL=http://127.0.0.1:PORT` for a direct API URL.

## Build

```bash
npm run build
```

Output: `dist/`. For production, set `VITE_API_URL` to the production API base URL at build time (e.g. `https://api.example.com`).

## Environment

- **`VITE_API_URL`** – Optional. When **unset**, the app uses relative URLs (`/api/v1/...`), so in dev the Vite proxy sends them to the backend. When **set** (e.g. for production or a different backend port), all API requests use this base URL. **Use `127.0.0.1` only—not `localhost`** (localhost can resolve to IPv6 on macOS). Restart the dev server after changing env.
- **`VITE_PROXY_TARGET`** – Optional. Proxy target for `/api` in dev (default `http://127.0.0.1:3000`). Use `127.0.0.1` only—not `localhost`. Restart the dev server after changing.

## Structure

- `src/` – React app: pages, components, API client (`src/api/client.ts`), types, context. All code is under `apps/web`.
- The API client calls `/api/v1/*` (relative when `VITE_API_URL` is unset).
- Design reference: `DESIGN_FILE.html` at repo root.
