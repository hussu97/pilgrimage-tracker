# SoulStep – Admin Dashboard

Vite + React + TypeScript + Tailwind admin dashboard. Manages all SoulStep data: users, places, groups, reviews, scraper runs, translations, analytics, and more.

## Prerequisites

- **Backend must be running**: `cd soulstep-catalog-api && uvicorn app.main:app --reload --port 3000`
- **Admin account**: a user with `role = admin` in the database. On first startup, create one via `POST /api/v1/auth/register`, then update the role directly in the database or via a seed script.

## Quick Start

1. Start the backend (see Prerequisites).

2. Start the admin app:

   ```bash
   cd apps/soulstep-admin-web
   npm install
   npm run dev
   ```

   Or from repo root (if monorepo script is configured):

   ```bash
   npm run dev:admin
   ```

3. Open **http://127.0.0.1:5174** (use `127.0.0.1`, not `localhost`, on macOS).

The dev server proxies `/api` requests to `http://127.0.0.1:3000` by default — no env var needed in dev.

## Build

```bash
npm run build
```

Output in `dist/`. In production, the build is deployed to Firebase Hosting (see PRODUCTION.md).

## Environment Variables

Copy `.env.example` to `.env.local` and set values.

| Variable | Required | Default | Description |
|---|---|---|---|
| `API_PROXY_TARGET` | No | `http://127.0.0.1:3000` | Catalog API URL for the Vite dev server proxy. **Not `VITE_`-prefixed** — never sent to the browser. Set to the prod catalog URL for local-dev hybrid mode (local admin + prod catalog). |
| `VITE_SCRAPER_API_URL` | No | — | When set, scraper API calls go directly to this URL (e.g. `http://127.0.0.1:8001`) instead of through the catalog proxy. Use for local-dev hybrid mode (local scraper + prod catalog). |
| `VITE_FRONTEND_URL` | No | `https://soul-step.org` | Customer web frontend URL — used to generate place preview links in the SEO detail view. |

## Tests

```bash
npm test
```

Tests live in `src/__tests__/`. Uses Vitest. Covers pure logic (utilities, hooks).

## Directory Structure

```
src/
  app/
    App.tsx
    router.tsx
    providers/           # Auth, theme
    pages/               # One subdirectory per domain (see Pages below)
  components/
    layout/              # Sidebar, header, nav shell
    shared/              # Pagination, tables, form primitives, Radix UI wrappers
  lib/
    api/
      client.ts          # Base HTTP client
      admin.ts           # Admin CRUD endpoints (users, places, groups, reviews, …)
      scraper.ts         # Scraper proxy endpoints (locations, runs, collectors, map)
      stats.ts           # Dashboard stats
      analytics.ts       # Analytics endpoints
    types.ts             # Shared TypeScript types
    hooks/               # usePagination, useDebounce, …
    utils/
  main.tsx
  index.css
```

## Pages

| Path | Page | Description |
|---|---|---|
| `/` | Dashboard | Overview stats, quick links |
| `/login` | Login | Admin sign-in |
| `/users` | UsersList | Paginated user table with search |
| `/users/:userCode` | UserDetail | User profile, check-ins, groups |
| `/places` | PlacesList | Name search + city/country filter |
| `/places/new` | CreatePlace | Manual place creation |
| `/places/:placeCode` | PlaceDetail | Place detail + SEO status + inline edit |
| `/reviews` | ReviewsList | All reviews with filters |
| `/reviews/:reviewCode` | ReviewDetail | Review moderation |
| `/groups` | GroupsList | All groups |
| `/groups/:groupCode` | GroupDetail | Group detail + members |
| `/check-ins` | CheckInsList | All check-ins |
| `/notifications` | NotificationManagement | Create/delete notifications |
| `/scraper` | ScraperOverview | Scraper status overview |
| `/scraper/runs` | ScraperRuns | Paginated run list with stage + resume button |
| `/scraper/runs/:runCode` | RunDetail | 4 tabs: Places, Cells, Raw Data, Map |
| `/scraper/locations` | DataLocations | Geographic scraping locations |
| `/scraper/collectors` | Collectors | Available collector list |
| `/scraper/place-types` | PlaceTypeMappings | Google type → internal type mappings |
| `/quality` | QualityMetrics | Score distribution, gate breakdown, per-run summary |
| `/content/translations` | Translations | All translation keys across 5 languages |
| `/content/content-translations` | ContentTranslations | Place description translations |
| `/content/attributes` | PlaceAttributes | Attribute definitions and values |
| `/content/app-versions` | AppVersions | Mobile version enforcement config |
| `/audit-log` | AuditLog | Paginated admin action log |
| `/analytics` | AnalyticsDashboard | Event trends, top places, platform breakdown, raw event log |

## API Surface

The admin app calls `/api/v1/admin/*` (Bearer token, admin role required).

| Module | Covers |
|---|---|
| `lib/api/admin.ts` | Users, places, groups, reviews, check-ins, notifications, translations, content translations, place attributes, bulk operations, data export, audit log, app versions, SEO |
| `lib/api/scraper.ts` | Data locations, scraper runs, collectors, place type mappings, quality metrics, map cells, map places (all proxied via catalog API) |
| `lib/api/stats.ts` | Dashboard stats (total users, places, check-ins, groups) |
| `lib/api/analytics.ts` | Overview cards, top-places chart, event trends, paginated raw event log |

## Scraper Map View

The **Map** tab in `RunDetail` renders an OpenStreetMap view with:
- **Colored rectangles** — discovery cells (quadtree regions searched during discovery)
- **Dot markers** — scraped places with lat/lng (zero-coord places excluded)

Clicking a scraped place row in the **Places** tab expands an inline quality-score breakdown panel.

## Pagination Standard

All paginated tables use the shared `Pagination` component with page size options: **50** (default), 100, 200, 500, 1000, 2000. Use `usePagination(50)` for all new tables.
