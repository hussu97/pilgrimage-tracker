# SoulStep – Web App

Next.js 15 + React + TypeScript + Tailwind frontend. Server-side renders all pages for AdSense and search-engine crawlability. Feature parity with `apps/soulstep-customer-mobile`.

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
npm run build   # Next.js production build → .next/
npm run start   # Start production server
```

Output in `.next/`. Set `NEXT_PUBLIC_*` env vars at build time.

## Type Check

```bash
npx tsc --noEmit
```

## Environment Variables

Copy `.env.example` to `.env.local` and set values as needed.

| Variable | Required | Default | Description |
|---|---|---|---|
| `NEXT_PUBLIC_PROXY_TARGET` | No | `http://127.0.0.1:3000` | Dev-server proxy target for `/api`. No effect in production. |
| `NEXT_PUBLIC_API_BASE_URL` | No | `https://api.soul-step.org` | Public API URL shown on the Developers page |
| `INTERNAL_API_URL` | No | — | **Server-only** — Cloud Run internal URL for SSR metadata fetching. Falls back to `NEXT_PUBLIC_API_BASE_URL`. Never use `NEXT_PUBLIC_` prefix. |
| `NEXT_PUBLIC_ADSENSE_PUBLISHER_ID` | No | — | Google AdSense publisher ID. When unset, ads use backend config only. |
| `NEXT_PUBLIC_GLITCHTIP_DSN` | No | — | GlitchTip (Sentry-compatible) DSN for client-side error tracking. |
| `NEXT_PUBLIC_UMAMI_WEBSITE_ID` | No | — | Umami Cloud website ID for privacy-friendly analytics. |

## Tests

```bash
npm test                   # Vitest unit tests
npx tsc --noEmit           # TypeScript type check (Vitest does not type-check)
```

Tests live in `src/__tests__/`. Covers pure logic (utilities, hooks, transformers) — not component rendering.

## Directory Structure

```
app/                       # Next.js App Router (file-based routing)
  layout.tsx               # Root HTML layout, fonts, AdSense, providers
  page.tsx                 # Redirects / → /home
  not-found.tsx            # 404 page
  AppClientShell.tsx       # Client-side provider wrapper
  globals.css              # Entry CSS (imports src/index.css)
  (main)/                  # Route group — all layout-wrapped pages
    layout.tsx             # Applies <Layout> (nav shell)
    home/page.tsx
    places/[placeCode]/page.tsx
    …                      # One page.tsx per route
  login/page.tsx
  register/page.tsx
  …                        # Public (non-layout) pages

src/
  app/
    App.tsx                # Root component (providers + I18nReadyGate)
    providers.tsx          # Auth + Theme + I18n + Feedback providers
    pages/                 # All page components (imported by app/ wrappers)
    contexts/              # LocationContext
  components/
    layout/                # Layout, ProtectedRoute
    places/                # PlaceCardUnified, PlaceListRow
    ads/                   # AdProvider, AdBanner, useAdConsent
    consent/               # ConsentBanner
    analytics/             # AnalyticsProviderConnected
    common/                # Modal, ErrorBoundary, FeedbackPopup, …
  lib/
    navigation.tsx         # React Router compat shim (Next.js wrappers)
    api/client.ts          # API client (all endpoints, client-side)
    server/
      api.ts               # Server-only fetch functions for SSR metadata (absolute URLs, ISR)
      metadata.ts          # generateMetadata() builders (blog, place, city, static pages)
    types/index.ts         # TypeScript types (uses *_code identifiers)
    hooks/                 # useAnalytics, useAuthRequired, useDocumentTitle, useHead
    theme.ts               # Design tokens
    constants.ts
    share.ts
  components/
    server/
      JsonLd.tsx           # Server Component — renders <script type="application/ld+json">
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
| `/places/:placeCode/review` | WriteReview | Submit or edit a review |
| `/journeys/new` | CreateGroup | 4-step journey creation flow |
| `/journeys/:groupCode` | GroupDetail | Hero, timeline, tabs, glass bar |
| `/journeys/:groupCode/edit` | EditGroup | Edit journey settings |
| `/journeys/:groupCode/edit-places` | EditGroupPlaces | Edit journey place list |
| `/explore` | ExploreCities | City browse page |
| `/explore/:city` | ExploreCity | Places in a city |
| `/profile` | Profile | User stats and settings |
| `/profile/check-ins` | CheckInsList | Full check-in history |
| `/favorites` | Favorites | Saved places |
| `/notifications` | Notifications | In-app notifications |
| `/join` | JoinGroup | Join journey by invite code |
| `/login` | Login | Email + password sign-in |
| `/register` | Register | Account creation |
| `/privacy` | PrivacyPolicy | Privacy policy |
| `/terms` | TermsOfService | Terms of service |
| `/about` | About | Mission, features, religions covered |
| `/contact` | Contact | Contact methods |
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
