# SoulStep – Admin Web

Vite + React + TypeScript + Tailwind admin dashboard for SoulStep. All admin functionality lives in this folder (`apps/soulstep-admin-web`): pages, API client, and components. Requires an admin-role user account on the backend.

## Prerequisites

- **Backend must be running** for any API calls to work. From `soulstep-catalog-api/`: `uvicorn app.main:app --reload --port 3000`.
- An account with `role = admin` in the database.

## Run locally

1. Start the **backend** first:

   ```bash
   cd soulstep-catalog-api
   source .venv/bin/activate
   uvicorn app.main:app --reload --port 3000
   ```

2. Start the admin app:

   **Option 1 – from this directory:**

   ```bash
   npm install
   npm run dev
   ```

   **Option 2 – from repo root (if a monorepo script is configured):**

   ```bash
   npm run dev:admin
   ```

3. Open **http://127.0.0.1:5174** in your browser (use `127.0.0.1`—not `localhost`—on macOS to avoid IPv6 issues).

The dev server **proxies** `/api` requests to `http://127.0.0.1:3000` by default. API requests use relative URLs (`/api/v1/...`) so no env var is needed in dev.

## Build

```bash
npm run build
```

Output: `dist/`.

## Environment

- **`API_PROXY_TARGET`** – Optional. Catalog API URL the Vite dev server proxies `/api` calls to (default `http://127.0.0.1:3000`). Not `VITE_`-prefixed — never sent to the browser. Set to the prod catalog API URL for local-dev hybrid mode.
- **`VITE_SCRAPER_API_URL`** – Optional. When set, scraper API calls go directly to this URL (e.g. `http://127.0.0.1:8001`) instead of through the catalog proxy. Use for local-dev hybrid mode (local scraper + prod catalog).
- **`VITE_FRONTEND_URL`** – Optional. Customer web URL for SEO place preview links (default `https://soul-step.org`).

## Structure

Under `src/`:

- **`app/`** – App shell and pages: `App.tsx`, `router.tsx`, `providers/` (auth, theme), and all admin pages under `app/pages/`.
- **`app/pages/`** – One subdirectory per domain:
  - `DashboardPage.tsx`, `LoginPage.tsx`, `AccessDeniedPage.tsx`
  - `users/` – `UsersListPage.tsx`, `UserDetailPage.tsx`
  - `places/` – `PlacesListPage.tsx` (name search + city/country address filter), `PlaceDetailPage.tsx`, `CreatePlacePage.tsx`
  - `reviews/` – `ReviewsListPage.tsx`, `ReviewDetailPage.tsx`
  - `groups/` – `GroupsListPage.tsx`, `GroupDetailPage.tsx`
  - `check-ins/` – `CheckInsListPage.tsx`
  - `notifications/` – `NotificationManagementPage.tsx`
  - `scraper/` – `ScraperOverviewPage.tsx`, `ScraperRunsPage.tsx`, `RunDetailPage.tsx`, `DataLocationsPage.tsx`, `CollectorsPage.tsx`, `PlaceTypeMappingsPage.tsx`, `QualityMetricsPage.tsx` (score distribution, gate funnel, pie charts, near-threshold table, per-run summary). Runs list shows current pipeline stage and a Resume button for `interrupted`/`failed` runs. Run detail shows a 3-step stage indicator (Discovery → Detail Fetch → Enrichment), error message alerts, and a Resume button. Scraped Places table has clickable rows: clicking any row expands an inline quality-score breakdown panel showing all 8 scoring factors with progress bars and weighted contribution values.
  - `content/` – `TranslationsPage.tsx`, `ContentTranslationsPage.tsx`, `PlaceAttributesPage.tsx`, `AppVersionsPage.tsx`
  - `audit-log/` – `AuditLogPage.tsx`
  - `analytics/` – `AnalyticsDashboardPage.tsx` — overview stat cards, event trends line chart, event type & platform pie charts, top-places bar chart, paginated raw event log with filters
- **`components/`** – Shared UI: layout shell, shared widgets, Radix UI primitives.
- **`lib/`** – API clients (`lib/api/client.ts`, `lib/api/admin.ts`, `lib/api/scraper.ts`, `lib/api/stats.ts`, `lib/api/analytics.ts`), shared types (`lib/api/types.ts`), hooks, utils.
- **`main.tsx`**, **`index.css`** – Entry and global styles.

## API surface

The admin app calls `/api/v1/admin/*` routes (requires Bearer token with admin role). Key modules:

- **`lib/api/admin.ts`** – Users, places, groups, reviews, check-ins, notifications, translations, content translations, place attributes, bulk operations, data export, audit log, app versions.
- **`lib/api/scraper.ts`** – Data locations, scraper runs, collectors, place type mappings (proxied via catalog API).
- **`lib/api/stats.ts`** – Dashboard stats.
- **`lib/api/analytics.ts`** – Analytics overview, top places, trends, event log (`GET /admin/analytics/*`).

## Tests

```bash
npm test
```

Tests live in `src/__tests__/`. Uses Vitest. Covers pure logic (utilities, hooks).
