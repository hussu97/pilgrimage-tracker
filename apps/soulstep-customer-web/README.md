# SoulStep – Web App

Vite + React + TypeScript + Tailwind frontend. Runs in desktop and mobile browsers. Feature parity with `apps/soulstep-customer-mobile`.

Design reference: `FRONTEND_V3_LIGHT.html` (light mode) / `FRONTEND_V3_DARK.html` (dark mode) at repo root.

## Quick Start

1. Start the backend:

   ```bash
   cd soulstep-catalog-api
   source .venv/bin/activate
   uvicorn app.main:app --reload --port 3000
   ```

2. Start the web app (from repo root):

   ```bash
   npm install
   npm run dev:web
   ```

   Or from this directory:

   ```bash
   npm install
   npm run dev
   ```

3. Open **http://127.0.0.1:5173** (use `127.0.0.1`, not `localhost`, on macOS to avoid IPv6 issues).

The dev server proxies `/api` requests to `http://127.0.0.1:3000` automatically.

## Build

```bash
npm run build
```

Output in `dist/`. Set `VITE_API_URL` to the production API URL at build time.

## Environment Variables

Copy `.env.example` to `.env` and set values as needed.

| Variable | Required | Default | Description |
|---|---|---|---|
| `VITE_API_URL` | Yes (prod) | — (relative `/api`) | Production API base URL — baked in at build time. Unset in dev to use the Vite proxy. |
| `VITE_API_BASE_URL` | No | `https://api.soul-step.org` | Public API URL shown on the Developers page |
| `VITE_PROXY_TARGET` | No | `http://127.0.0.1:3000` | Dev server proxy target for `/api`. No effect in production builds. |
| `VITE_ADSENSE_PUBLISHER_ID` | No | — | Google AdSense publisher ID. When unset, ads use backend config only. |
| `VITE_GLITCHTIP_DSN` | No | — | GlitchTip (Sentry-compatible) DSN for client-side error tracking. |
| `VITE_UMAMI_WEBSITE_ID` | No | — | Umami Cloud website ID for privacy-friendly analytics. Script proxied via `/umami/script.js`. |

## Tests

```bash
npm test                   # Vitest unit tests
npx tsc --noEmit           # TypeScript type check (Vitest does not type-check)
```

Tests live in `src/__tests__/`. Covers pure logic (utilities, hooks, transformers) — not component rendering.

## Directory Structure

```
src/
  app/
    App.tsx                # Root component
    providers.tsx          # Auth + i18n providers
    routes.tsx             # Route definitions
    pages/                 # All page components
  components/
    Layout.tsx             # Responsive nav shell
    PlaceCard.tsx          # Place list card
    PlacesMap.tsx          # Leaflet map with place markers
    ProtectedRoute.tsx     # Auth guard
    ads/                   # AdProvider, AdBanner, useAdConsent
    consent/               # ConsentBanner
    analytics/             # AnalyticsProviderConnected
  lib/
    api/client.ts          # API client (all endpoints)
    types/index.ts         # TypeScript types (uses *_code identifiers)
    hooks/                 # useAnalytics, useAuthRequired, useDocumentTitle, useHead
    theme.ts               # Design tokens
    constants.ts
    share.ts
  main.tsx
  index.css
```

## Routes

| Route | Page | Description |
|---|---|---|
| `/` | → `/home` | Redirect |
| `/home` | Home | Journey Dashboard — active journey, quick actions, carousels |
| `/onboarding` | Onboarding | 3-card first-visit onboarding flow |
| `/map` | MapDiscovery | Full-screen Leaflet map + search/filter overlay |
| `/places` | Places | All sacred sites list |
| `/places/:placeCode` | PlaceDetail | Place detail with JSON-LD, FAQ, nearby places |
| `/journeys/new` | CreateGroup | 4-step journey creation flow |
| `/journeys/:groupCode` | GroupDetail | Hero, timeline, tabs, glass bar |
| `/journeys/:groupCode/edit` | EditGroup | Edit journey settings |
| `/journeys/:groupCode/edit-places` | EditGroupPlaces | Edit journey place list |
| `/explore` | ExploreCities | City browse page |
| `/explore/:city` | ExploreCity | Places in a city |
| `/profile` | Profile | User stats and settings |
| `/login` | Login | Email + password sign-in |
| `/register` | Register | Account creation |
| `/developers` | Developers | API documentation page |

## API Surface

The API client (`lib/api/client.ts`) covers:

- **Auth**: login, register, forgot-password, reset-password
- **Users**: getMe, updateMe, getSettings, updateSettings, check-ins, stats, favorites
- **Places**: getPlaces, getPlace, reviews, checkIn, favorite, createReview, getRecommended
- **Reviews**: updateReview, deleteReview
- **Groups**: list, create, get, update, delete, by-invite, join-by-code, join, leave, members, invite, leaderboard, activity, checklist, addPlace, notes, getFeatured, optimizeRoute
- **Notifications**: get, markRead
- **Cities**: getCities, getCityPlaces, getCityReligionPlaces
- **i18n**: getLanguages, getTranslations

All types use `*_code` string identifiers (e.g. `place_code`, `user_code`). See `lib/types/index.ts`.
