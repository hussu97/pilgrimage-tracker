# SoulStep – Web app

Vite + React + TypeScript + Tailwind frontend for SoulStep. **All functionality lives in this folder** (`apps/soulstep-customer-web`): pages, API client, types, and context. It runs in desktop and mobile browsers and talks to the backend API (same contract as the Expo mobile app; see repo root for architecture).

## Prerequisites

- **Backend must be running** for any API calls to work. From `soulstep-catalog-api/`: `uvicorn app.main:app --reload --port 3000`. If the backend is not on port 3000, see Environment below.

## Run locally

1. Start the **backend** first (from repo root or `soulstep-catalog-api/`):

   ```bash
   cd soulstep-catalog-api
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
- **`VITE_GLITCHTIP_DSN`** – Optional. GlitchTip (Sentry-compatible) DSN for error tracking. When unset, error tracking is disabled. Obtain from your GlitchTip project settings (e.g. `https://<key>@app.glitchtip.com/<project>`).
- **`VITE_ADSENSE_PUBLISHER_ID`** – Optional. Google AdSense publisher ID (e.g. `ca-pub-xxxxxxxxxxxxxxxx`). When unset, ad provider uses backend config only.
- **`VITE_UMAMI_WEBSITE_ID`** – Optional. Umami Cloud website ID for privacy-friendly analytics. The script is proxied via `/umami/script.js` to bypass adblockers (same-origin). Sign up at https://umami.is → free plan → Add website → copy Website ID. When unset, Umami is disabled.

## Structure

Under `src/`:

- **`app/`** – App shell and pages: `App.tsx`, `providers.tsx` (auth + i18n), `routes.tsx`, and all screens under `app/pages/` (Splash, Login, Register, Home, PlaceDetail, Profile, Favorites, Groups, Notifications, Settings, etc.).
- **`components/`** – Shared UI: Layout, ProtectedRoute, PlaceCard, PlacesMap, EmptyState, ErrorState, `ads/` (AdProvider, AdBanner, useAdConsent, ad-constants), `consent/` (ConsentBanner), `analytics/` (AnalyticsProviderConnected).
- **`lib/`** – API client (`lib/api/client.ts`), shared types (`lib/types/index.ts`), theme, constants, share helpers. The API client calls `/api/v1/*` (relative when `VITE_API_URL` is unset). Hooks: `useAnalytics` (batched event ingestion, consent gating, auto page-view tracking), `useAuthRequired`, `useDocumentTitle`.
- **`main.tsx`**, **`index.css`** – Entry and global styles.

Design reference: `FRONTEND_V3_LIGHT.html` / `FRONTEND_V3_DARK.html` at repo root.

## Tests

```bash
npm test
```

Also run the TypeScript check (Vitest does not type-check):

```bash
npx tsc --noEmit
```

Tests live in `src/__tests__/`. Uses Vitest. Covers pure logic (utilities, hooks, transformers) — not component rendering.

## Parity reference (for mobile)

Canonical **screens** (see `app/routes.tsx` and `app/pages/`): Splash, Login, Register, ForgotPassword, ResetPassword, Home, PlaceDetail, WriteReview, Profile, EditProfile, CheckInsList, Favorites, Groups, CreateGroup, EditGroup, EditGroupPlaces, GroupDetail, JoinGroup, Notifications.

**API surface** (see `lib/api/client.ts`): auth (login, register, forgot/reset, me), users (getMe, updateMe, check-ins, stats, favorites, settings), places (getPlaces, getPlace, reviews, checkIn, favorite, createReview), reviews (updateReview, deleteReview), groups (list, create, get, by-invite, join-by-code, join, members, invite, leaderboard, activity, checklist, addPlace, notes), notifications (get, markRead), i18n (getLanguages, getTranslations). Types in `lib/types/index.ts` use `user_code`, `place_code`, `religions` array.
