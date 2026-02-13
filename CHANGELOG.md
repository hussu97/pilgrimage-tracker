# Changelog

All notable changes from implementing [IMPLEMENTATION_PROMPTS.md](IMPLEMENTATION_PROMPTS.md) and project process are documented here.

---

## Redesign: BE-3 groups (progress, next place, featured), location, auth flow, i18n

**Done when:** Groups list API returns progress and next place; optional group path; single root stack and location provider; i18n device locale and settings sync.

### Backend

- **Groups list (`GET /api/v1/groups`):** Each group now includes `last_activity` (latest check-in among members), `sites_visited`, `total_sites`, `next_place_code`, `next_place_name` (first unvisited site in path when applicable), and `featured` (true for first group). New helpers: `get_last_activity(group_code, check_ins_db)`, `get_group_progress(group_code, check_ins_db, places_db)` in `app/db/groups.py`.
- **Group path:** Optional `path_place_codes` (ordered list of place_codes) on Group; `create_group` and `GroupCreateBody` accept `path_place_codes`; seed supports `path_place_codes` in group JSON. Progress “X/Y sites” and “next place” are derived from path and member check-ins when path is set.
- **Places, reviews, users, check-ins:** (From earlier BE-1/BE-2 work) Places: `is_open_now`, `website_url`, `has_events`, `jummah`/`has_events` filters; reviews: `is_anonymous`, `photo_urls`; user stats and check-ins list shape as documented.

### Frontend — Web

- **Location:** `LocationProvider` in `app/contexts/LocationContext.tsx`; coords from geolocation used for `getPlaces` (lat/lng). Home uses `useLocation().coords`.
- **Auth/routes:** Root redirects to `/home`; Home and PlaceDetail no longer behind ProtectedRoute (signed-out can browse); Register redirects to `/home` after signup.
- **I18n:** Initial locale from API language list + device locale or stored locale; `updateSettings({ language })` called when user changes language.

### Frontend — Mobile

- **Location:** `expo-location` plugin; `LocationContext` provides coords (default 0,0 when denied); Home passes lat/lng to `getPlaces`.
- **Navigation:** Single root stack (Splash → Main, Login, Register, etc.); Splash shows spinner then replaces to Main when i18n ready; Login/Register replace to Main on success.
- **Auth:** Favorites and Profile show “Sign in to view” + Login when not signed in; no SelectPath redirect after register.
- **I18n:** Device locale via NativeModules; `resolveInitialLocale` from API list; language change calls `updateSettings({ language })`.
- **UI:** Back buttons and safe area on CheckIn, CreateGroup, JoinGroup, Notifications, SelectPath, Settings; CheckIn receives `placeCode` from route params.

### Docs

- **ARCHITECTURE.md:** Data model §4 updated for Group `path_place_codes`; API §5 updated for groups list response fields and create body `path_place_codes`.

---

## Web app migration to TypeScript architecture (apps/web)

**Done when:** Web app uses `app/`, `components/`, and `lib/` layout; docs and Cursor globs updated; flows verified.

### Structure (apps/web/src/)

- **app/** – `App.tsx`, `providers.tsx` (Auth + I18n), `routes.tsx`, and all pages under `app/pages/` (Splash, Login, Register, Home, PlaceDetail, Profile, Favorites, Groups, Notifications, Settings, Write review, Check-in, CreateGroup, GroupDetail, JoinGroup, EditProfile, CheckInsList, ForgotPassword, ResetPassword, SelectPath).
- **components/** – Layout, ProtectedRoute, PlaceCard, PlacesMap, EmptyState, ErrorState.
- **lib/** – `lib/api/client.ts` (all API calls), `lib/types/index.ts` (Place, User, Group, etc.), `lib/theme.ts`, `lib/constants.ts`, `lib/share.ts`. Entry remains `main.tsx` → App → providers → routes.

### Features (unchanged behavior)

- All routes and flows preserved: Splash → Register/Login → Select Path → Home (list + map) → Place detail → Check-in, Profile, Favorites, Groups, Settings, Notifications, Write review. Map view (Leaflet) with pins, search/filters shared by list and map. Empty and error states with Retry; responsive desktop; accessibility (focus, aria-labels); PWA manifest and service worker (vite-plugin-pwa).

### Docs and rules

- **ARCHITECTURE.md** – Section 6 updated: web app layout documented (`app/`, `components/`, `lib/`); state in providers; no shared `packages`.
- **apps/web/README.md** – Structure section updated to describe `app/`, `components/`, `lib/`.
- **.cursor/rules/schema-api-codes.mdc** – Globs updated to `apps/web/src/lib/types/**/*` and `apps/web/src/lib/api/**/*` (types and API live under `lib/`).

---

## Multi-language support (en / ar / hi) and central seed

**Done when:** Backend serves languages and translations; user language in settings; one seed file populates all in-memory data; web and mobile use `t(key)` with RTL for Arabic.

### Backend

- **i18n:** `GET /api/v1/languages` and `GET /api/v1/translations?lang=` (no auth). In-memory store in `app/db/i18n.py`; fallback to English for missing keys.
- **User settings:** Optional `language` (en, ar, hi) on `GET/PATCH /api/v1/users/me/settings`.
- **Central seed:** Single `app/db/seed_data.json` with languages, translations (en, ar, hi), users, places, groups, reviews, check_ins, notifications, favorites. `app/db/seed.py` runs on app startup and populates all stores; inline seed removed from `places.py`. Seed can be re-run by restarting the server or `python -m app.db.seed`.

### Frontend — Web

- **API:** `getLanguages()`, `getTranslations(lang)` in `api/client.ts`.
- **I18nContext:** Fetches languages and translations; locale from user settings (when logged in), else `pilgrimage-locale` in localStorage, else browser language; exposes `locale`, `setLocale`, `t(key)`. RTL: `document.documentElement.dir = 'rtl'` and `lang` when locale is `ar`.
- **Settings:** Language dropdown (from API); saving updates settings and refetches translations.
- **Copy:** Customer-facing strings in pages and Layout replaced with `t('key')`; keys added to seed for en, ar, hi.

### Frontend — Mobile

- **API:** `api/client.js` with `getLanguages()` and `getTranslations(lang)` (uses `EXPO_PUBLIC_API_URL`).
- **I18nContext:** Locale in AsyncStorage; loads languages/translations; `I18nManager.forceRTL(true)` when locale is `ar`; exposes `locale`, `setLocale`, `t`, `languages`, `ready`.
- **Example screen:** Settings screen with language picker and `t()` for title and labels; same translation keys as web.

### Docs

- **.cursor/rules/i18n-translations.mdc:** Updated for English, Arabic, Hindi; backend as source; fallback to English; RTL for Arabic.
- **server/README.md:** Seed data section (file location, runner, reset); i18n endpoints listed.

---

## Switch mobile app from Capacitor to Expo

**Done when:** Mobile app uses Expo (React Native) for iOS/Android; all Capacitor references removed.

### Removed

- **Capacitor:** No Capacitor packages were in use; all references to Capacitor removed from docs, `.gitignore`, and Cursor rules.
- **apps/mobile (Vite + React):** Replaced with a new Expo (React Native) app. The previous Vite-based mobile app was removed; it had been intended for Capacitor wrapping.

### Added

- **Expo app** in `apps/mobile`: Created with `create-expo-app@latest --template blank`. Package name `@pilgrimage-tracker/mobile`; scripts include `dev` and `start` (both run `expo start`), plus `ios`, `android`, `web`.
- **.gitignore:** Capacitor section replaced with Expo section (`.expo/`, `web-build/`, common Expo artifacts).

### Updated

- **README.md (root):** Mobile described as Expo; run instructions and env (`EXPO_PUBLIC_API_URL`) for Expo.
- **apps/mobile/README.md:** Rewritten for Expo (run, build for iOS/Android, EAS, env).
- **ARCHITECTURE.md:** Mobile stack is Expo (React Native); diagrams and tables updated.
- **PRODUCTION.md:** Plan 1–3 mobile build steps use Expo (EAS or `expo run:ios`/`android`); env `EXPO_PUBLIC_API_URL`.
- **IMPLEMENTATION_PROMPTS.md:** Stack recap and prompts refer to Expo instead of Capacitor.
- **.cursor/rules/frontend-replication.mdc:** Web is Vite+React; mobile is Expo/React Native; feature parity and API sync described.
- **.cursor/rules/readme-maintenance.mdc:** Mobile README described as Expo.

### Note

The new `apps/mobile` is a blank Expo template. Screens, API client, and navigation (e.g. Expo Router or React Navigation) need to be implemented to match the web app’s flows and API usage.

---

## Python 3.14 (latest) as standard

**Done when:** Docs and requirements reference Python 3.14 (or 3.11+); local and production paths use latest Python where available.

### Backend / Docs

- **server/requirements.txt** – Comment added: Python 3.14+ (or 3.11+); venv creation command.
- **README.md (root)** – Prerequisites: Python 3.14 (or 3.11+), Homebrew note for macOS. Setup uses `python3 -m venv .venv`.
- **server/README.md** – States Python 3.14 (or 3.11+) required; Homebrew hint; `python3 -m venv .venv` in Run.
- **ARCHITECTURE.md** – Backend runtime: Python 3.14 (or 3.11+).
- **PRODUCTION.md** – Plan 1 Docker: base image `python:3.14-slim` (fallback `python:3.12-slim` if needed).
- **IMPLEMENTATION_PROMPTS.md** – Stack recap: Python 3.14 (or 3.11+).

To use Python 3.14 for the server venv: `cd server && rm -rf .venv && /opt/homebrew/bin/python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`.

---

## Implemented features (Python + FastAPI backend, web and mobile frontends)

**Done when:** Full stack is implemented: backend API (auth, places, reviews, check-ins, groups, notifications, user management) and replicated UIs in web and mobile.

### Backend (server/app/ — Python + FastAPI)

- **Auth:** `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `POST /api/v1/auth/forgot-password`, `POST /api/v1/auth/reset-password`. JWT (python-jose), password hashing (passlib/bcrypt). In-memory user store with `user_code`, religion enum, reset tokens.
- **Users:** `GET/PATCH /api/v1/users/me`, `PATCH /api/v1/users/me/religion`, `GET /api/v1/users/me/check-ins`, `GET /api/v1/users/me/stats`, `GET /api/v1/users/me/favorites`, `GET/PATCH /api/v1/users/me/settings`.
- **Places:** `GET /api/v1/places` (religion, lat, lng, radius, place_type, search, sort, limit, offset; distance when lat/lng given). `GET /api/v1/places/{place_code}` (detail with religion-specific fields). Seed places (Islam, Hinduism, Christianity).
- **Reviews:** `GET /api/v1/places/{place_code}/reviews`, `POST /api/v1/places/{place_code}/reviews`. `PATCH/DELETE /api/v1/reviews/{review_code}` (author only). Aggregate rating/count on place.
- **Check-ins:** `POST /api/v1/places/{place_code}/check-in` (optional note/photo). Place detail and list can include “user has checked in” for current user.
- **Favorites:** `POST/DELETE /api/v1/places/{place_code}/favorite`, `GET /api/v1/users/me/favorites`.
- **Groups:** `GET/POST /api/v1/groups`, `GET /api/v1/groups/by-invite/{invite_code}`, `POST /api/v1/groups/join-by-code`, `GET/PATCH /api/v1/groups/{group_code}`, `POST /api/v1/groups/{group_code}/join`, `GET /api/v1/groups/{group_code}/members`, `GET .../leaderboard`, `GET .../activity`, `POST .../invite`. Notifications created on join.
- **Notifications:** `GET /api/v1/notifications` (paginated), `PATCH /api/v1/notifications/{notification_code}/read`. In-memory store.
- **Settings:** `GET/PATCH /api/v1/users/me/settings` (e.g. notifications_on, theme, units). In-memory per-user settings.

### Frontend — Web (apps/web)

- **Auth:** Splash, Register, Login, Forgot/Reset password, Select Path (religion). AuthContext, ProtectedRoute, JWT in localStorage.
- **Home:** List/map view, debounced search, filter chips (Nearby, Mosque, Temple, Church), place cards with distance; SimpleMap with pins and selected place preview; empty/error + Retry.
- **Place detail:** Full place info, religion-specific sections, check-in (modal), favorite toggle, reviews list, link to write review.
- **Write review:** Form (rating, title, body); submit to `POST .../reviews`; redirect to place detail.
- **Profile:** User card, stats (places visited, check-ins this year), visited places list, Favorites/Settings links, Edit profile.
- **Favorites:** List of saved places (card style); empty state; error + Retry.
- **Groups:** List, Create Group, Group Detail (members, leaderboard, activity), Join by invite code. API: getGroups, createGroup, getGroup, getGroupByInviteCode, joinGroupByCode, **joinGroup**, getGroupLeaderboard, getGroupActivity.
- **Notifications:** List (paginated), mark read.
- **Settings:** Theme (localStorage + PATCH), notifications toggle, units. Layout: notifications link (desktop) and floating icon (mobile).
- **Layout:** Bottom nav (Explore, Saved, Pilgrimage, Profile); top nav on desktop; Pilgrimage → `/groups`; active state for `/groups` and sub-routes.

### Frontend — Mobile (apps/mobile)

- **Replicated:** Same screens and flows as web (Splash, Auth, Home with search/filters/map, Place detail, Write review, Profile, Favorites, Groups, Create/Join/Group detail, Notifications, Settings). Same API client surface including **joinGroup** (join by group code) for parity with web.
- **Layout:** Same nav; floating notifications icon; Settings link on Profile; routes for `/groups`, `/groups/new`, `/groups/:groupCode`, `/join`, `/settings`, `/notifications`.

### Bug fix (frontend replication)

- **Mobile API client:** Added missing `joinGroup(groupCode)` calling `POST /api/v1/groups/{group_code}/join` so web and mobile clients stay in sync.

---

## Remove Node.js/TypeScript from server

**Done when:** All legacy Node.js/Express/TypeScript code is removed from `server/`; backend is Python + FastAPI only.

### Backend

- **Removed:** `server/package.json`, `server/tsconfig.json`, and entire `server/src/` tree (Node/Express/TS): `src/index.ts`, `src/auth.ts`, `src/db/store.ts`, `src/db/places.ts`. Empty `server/src` and `server/src/db` directories removed.
- **Unchanged:** `server/app/` (Python FastAPI) and `server/requirements.txt` remain the only backend implementation.

---

## Cursor rules and production/docs (process)

**Done when:** Cursor rules for design, architecture, changelog, production, readme, i18n, and git are in place; PRODUCTION.md and READMEs are created/updated.

### Cursor rules (`.cursor/rules/`)

- **design-file-inspiration.mdc** – Frontend UI/UX changes must use [DESIGN_FILE.html](DESIGN_FILE.html) as inspiration; applies to `apps/web` and `apps/mobile`.
- **architecture-review.mdc** – Review [ARCHITECTURE.md](ARCHITECTURE.md) when functionality changes system architecture; update ARCHITECTURE.md if needed (always apply).
- **changelog-updates.mdc** – Any changes must be added to [CHANGELOG.md](CHANGELOG.md) (always apply).
- **production-plan.mdc** – Maintain [PRODUCTION.md](PRODUCTION.md) with three deployment plans; update when deployment-relevant changes occur (always apply).
- **readme-maintenance.mdc** – Maintain README at root and in each service (backend, web, mobile) for understanding and local run (always apply).
- **i18n-translations.mdc** – Customer-facing strings from backend; support English and Arabic with fallback to English; applies to frontends and server.
- **git-commit-after-feature.mdc** – After feature changes, commit on git (always apply).

### Docs

- **PRODUCTION.md** – New go-to-production file with three plans: Plan 1 (Docker), Plan 2 (free online e.g. Render + Vercel), Plan 3 (GCP: Cloud Run, Cloud SQL, Firebase Hosting, etc.). Each plan updated when system/deployment changes.
- **README.md (root)** – Updated to link to PRODUCTION.md and to service READMEs (server, apps/web, apps/mobile).
- **server/README.md** – Added `DATABASE_URL` and link to PRODUCTION.md.
- **apps/web/README.md** – New: how to run and build web app, env, structure.
- **apps/mobile/README.md** – New: how to run and build mobile app (Expo), env, structure.

---

## Prompt 1: Project setup and shell

**Done when:** Monorepo runs, API returns mock places with `place_code`, both web and mobile have routing and layout; Cursor rule file exists.

### Backend

- **`server/`** – New Express + TypeScript API.
  - `GET /health` → `{ status: "ok" }`.
  - `GET /api/v1/places` → array of mock places with `place_code` (e.g. `plc_abc1`, `plc_xyz2`).
  - CORS enabled, JSON body parsing.
- **Root `package.json`** – Workspaces: `apps/*`, `server`. Scripts: `dev:server`, `dev:web`, `dev:mobile`, `build:*`.

### Frontend (apps/web and apps/mobile)

- **Monorepo layout** – No `packages/` folder. `apps/web` and `apps/mobile` each have their own codebase.
- **Cursor rule** – `.cursor/rules/frontend-replication.mdc` already existed; requires replicating UI and features between web and mobile.
- **Types** – In both apps, `src/types/index.ts`: `User` (with `user_code`), `Place` (with `place_code`), `Religion` enum.
- **API client** – In both apps, `src/api/client.ts`: `getPlaces()` calling `/api/v1/places` (uses `VITE_API_URL` when set).
- **Tailwind** – In both apps: theme aligned with DESIGN_FILE (primary `#3B82F6`, Lexend, `background-light`, `text-main`, `text-muted`, `input-border`, border radius tokens).
- **Layout** – In both apps, `src/components/Layout.tsx`: responsive shell; bottom nav (Explore, Saved, Pilgrimage, Profile) on viewport &lt; 768px; top nav on larger; safe-area padding classes.
- **Routes** – In both apps: `/` (Splash), `/login`, `/register`, `/select-path`, `/home`. Placeholder pages with headings and links.
- **Icons/fonts** – Lexend and Material Icons/Symbols linked in `index.html` for both apps.

### Docs

- **README.md** – How to run server, web, and mobile; both apps use same API base for `/api/v1`; env vars.

---

## Prompt 2: Authentication (register, login, religion selection)

**Done when:** User can register, select religion, log in, and be sent to home; `GET /api/v1/users/me` returns the user (with `user_code`); forgot/reset password works in dev. Same flows in both web and mobile.

### Backend

- **In-memory store** (`server/src/db/store.ts`) – Users and password-reset tokens. `user_code` (e.g. `usr_` + hex), email, password_hash, display_name, religion (nullable enum), avatar_url, timestamps. Replace with SQLite/Postgres later.
- **Auth module** (`server/src/auth.ts`) – bcrypt password hash/compare; JWT sign/verify; `register`, `login`, `getMe`, `setReligion`, `updateMe`, `forgotPassword`, `resetPassword`; `authMiddleware` and `requireAuth`; `toPublicUser` (strip password_hash).
- **Routes** – `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `POST /api/v1/auth/forgot-password`, `POST /api/v1/auth/reset-password`, `GET /api/v1/users/me`, `PATCH /api/v1/users/me`, `PATCH /api/v1/users/me/religion`. Protected routes use Bearer JWT.
- **Dependencies** – bcryptjs, jsonwebtoken (and @types).

### Frontend (apps/web and apps/mobile)

- **API client** – register, login, getMe, updateMe, updateReligion, forgotPassword, resetPassword; auth headers with Bearer token from localStorage.
- **AuthContext** – user, token, loading; login, register, logout, setReligion, refreshUser; persist token and user in localStorage; refresh user on mount when token exists.
- **ProtectedRoute** – redirect to `/login` when not authenticated; show loading while checking auth.
- **Splash** – unchanged (Get Started → register, Sign In → login).
- **Register** – form (full name, email, password, confirm); validation; on submit call register, then navigate to `/select-path`.
- **Login** – form (email, password); “Forgot password?” → `/forgot-password`; on submit call login, then navigate to `/home`.
- **Forgot password** – email input; call forgotPassword; success message (dev: link in server console).
- **Reset password** – route `/reset-password?token=...`; form (new password, confirm); call resetPassword; success → link to login.
- **Select Path** – cards for Islam, Hinduism, Christianity; Skip for now. On select or skip call PATCH `/api/v1/users/me/religion`, then navigate to `/home`. If user already has religion, redirect to `/home`.
- **Home** – greeting by religion (e.g. Assalamu Alaikum for Islam), display name; log out button.
- **App routes** – `/forgot-password`, `/reset-password`; `/select-path` and `/home` wrapped in ProtectedRoute; AuthProvider wraps app.

---

## Prompt 3: Home and discovery (list view, place cards)

**Done when:** Home shows places for the user's religion sorted by distance; cards match design; clicking a card goes to place detail route (placeholder).

### Backend

- **Places store** (`server/src/db/places.ts`) – In-memory places with `place_code` (e.g. `plc_` + hex), name, religion, place_type, lat, lng, address, opening_hours, image_urls, description. Seed data for Islam, Hinduism, Christianity. `listPlaces(options)` filters by religion, sorts by distance (haversine) when lat/lng provided, supports limit/offset.
- **GET /api/v1/places** – Query params: religion, lat, lng, limit, offset. Returns array of places with computed distance when lat/lng given.

### Frontend (apps/web and apps/mobile)

- **API client** – `getPlaces(params)` with religion, lat, lng, limit, offset; returns `Place[]`.
- **Home** – If user has no religion, redirect to `/select-path`. Fetch places with user's religion and default lat/lng (40.71, -74.01). Header with greeting (e.g. Assalamu Alaikum for Islam) and display name. List/Map toggle (list only; map shows placeholder). Search bar and filter chips (Nearby, Historical, Jummah Prayer, Women's Section) – UI only. Place cards: image (placeholder icon if no image_urls), name, address, distance (km), mock rating, “View Details” link to `/places/:placeCode`. Responsive grid on desktop.
- **Place detail** – New route `/places/:placeCode`; placeholder page (Prompt 4 will fill in).
- **App** – Route added for `/places/:placeCode` (protected).

---
