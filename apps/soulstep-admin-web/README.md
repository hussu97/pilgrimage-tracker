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

Output: `dist/`. For production, the `VITE_API_URL` env var sets the proxy target (defaults to `http://127.0.0.1:3000` in dev).

## Environment

- **`VITE_API_URL`** – Optional. Proxy target for `/api` in dev (default `http://127.0.0.1:3000`). Use `127.0.0.1`—not `localhost`. Restart the dev server after changing.

## Structure

Under `src/`:

- **`app/`** – App shell and pages: `App.tsx`, `router.tsx`, `providers/` (auth, theme), and all admin pages under `app/pages/`.
- **`app/pages/`** – One subdirectory per domain:
  - `DashboardPage.tsx`, `LoginPage.tsx`, `AccessDeniedPage.tsx`
  - `users/` – `UsersListPage.tsx`, `UserDetailPage.tsx`
  - `places/` – `PlacesListPage.tsx`, `PlaceDetailPage.tsx`, `CreatePlacePage.tsx`
  - `reviews/` – `ReviewsListPage.tsx`, `ReviewDetailPage.tsx`
  - `groups/` – `GroupsListPage.tsx`, `GroupDetailPage.tsx`
  - `check-ins/` – `CheckInsListPage.tsx`
  - `notifications/` – `NotificationManagementPage.tsx`
  - `scraper/` – `ScraperOverviewPage.tsx`, `ScraperRunsPage.tsx`, `RunDetailPage.tsx`, `DataLocationsPage.tsx`, `CollectorsPage.tsx`, `PlaceTypeMappingsPage.tsx`
  - `content/` – `TranslationsPage.tsx`, `ContentTranslationsPage.tsx`, `PlaceAttributesPage.tsx`, `AppVersionsPage.tsx`
  - `audit-log/` – `AuditLogPage.tsx`
- **`components/`** – Shared UI: layout shell, shared widgets, Radix UI primitives.
- **`lib/`** – API clients (`lib/api/client.ts`, `lib/api/admin.ts`, `lib/api/scraper.ts`, `lib/api/stats.ts`), shared types (`lib/api/types.ts`), hooks, utils.
- **`main.tsx`**, **`index.css`** – Entry and global styles.

## API surface

The admin app calls `/api/v1/admin/*` routes (requires Bearer token with admin role). Key modules:

- **`lib/api/admin.ts`** – Users, places, groups, reviews, check-ins, notifications, translations, content translations, place attributes, bulk operations, data export, audit log, app versions.
- **`lib/api/scraper.ts`** – Data locations, scraper runs, collectors, place type mappings (proxied via catalog API).
- **`lib/api/stats.ts`** – Dashboard stats.

## Tests

```bash
npm test
```

Tests live in `src/__tests__/`. Uses Vitest. Covers pure logic (utilities, hooks).
