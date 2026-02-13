# Pilgrimage Tracker – System Architecture

This document describes the end-to-end architecture for Pilgrimage Tracker: a multi-platform application (desktop web, mobile web, iOS, Android) for discovering, visiting, and tracking religious places. It aligns with the designs in [app-design-prompt-google-stitch.md](app-design-prompt-google-stitch.md) and [DESIGN_FILE.html](DESIGN_FILE.html).

---

## 1. Goals and Constraints

- **Platforms:** Desktop web, mobile web, iOS app, Android app.
- **Frontend:** Single, shared UI codebase where possible so behavior and layout are consistent across all platforms.
- **Design reference:** DESIGN_FILE.html (Tailwind, Lexend, Material Icons, safe areas, list/map views, religion-specific place details, groups, profile, check-ins).

---

## 2. High-Level Architecture

```mermaid
flowchart TB
    subgraph clients [Clients - Web and Mobile Replicated]
        Web[Web App - apps/web]
        iOS[iOS App - apps/mobile Capacitor]
        Android[Android App - apps/mobile Capacitor]
    end

    subgraph api [Backend API - versioned /api/v1]
        Gateway[API Gateway / REST]
        Auth[Auth Service]
        Places[Places Service]
        Users[Users and Profile]
        CheckIns[Check-ins and Reviews]
        Groups[Groups Service]
        Notifications[Notifications]
    end

    subgraph data [Data]
        DB[(PostgreSQL)]
        Geo[Geo Index for proximity]
        Storage[File Storage - Avatars and Photos]
    end

    Web --> Gateway
    iOS --> Gateway
    Android --> Gateway
    Gateway --> Auth
    Gateway --> Places
    Gateway --> Users
    Gateway --> CheckIns
    Gateway --> Groups
    Gateway --> Notifications
    Auth --> DB
    Places --> DB
    Places --> Geo
    Users --> DB
    Users --> Storage
    CheckIns --> DB
    Groups --> DB
    Notifications --> DB
```

- **Clients:** Two frontend codebases kept in sync by convention and tooling:
  - **Web:** `apps/web` — React SPA (desktop + mobile web).
  - **Mobile:** `apps/mobile` — Same UI and features replicated in a separate folder, wrapped with **Capacitor** for iOS/Android. A Cursor rules file enforces that UI and features are replicated in both web and mobile so they stay consistent; no shared `packages` folder (see repo layout below).
- **Backend:** Single **versioned** API (e.g. `/api/v1/...`) talking to PostgreSQL, optional geo index, and file storage.

---

## 3. Recommended Tech Stack

### 3.1 Frontend (shared codebase)

| Concern | Choice | Rationale |
|--------|--------|-----------|
| Framework | React 18+ | Matches design system (components, state), large ecosystem, works with Capacitor. |
| Build | Vite | Fast dev and build for web. |
| Styling | Tailwind CSS | Matches DESIGN_FILE.html (Tailwind, design tokens). |
| Routing | React Router | SPA routing for web; same routes in Capacitor. |
| State | React Query + Context or Zustand | Server state (places, user, groups) + minimal client state. |
| Forms/validation | React Hook Form + Zod | Registration, login, reviews, group creation. |
| Maps | Mapbox GL JS or Leaflet | List + map view; same lib works on web and in Capacitor. |
| Icons/fonts | Material Icons + Lexend | Per DESIGN_FILE. |
| Native shell | Capacitor | One codebase → iOS/Android apps; access to camera, geolocation, push. |

**Responsive strategy:** One layout with breakpoints (e.g. sm/md/lg) so the same components work on desktop and mobile web; bottom nav on mobile, optional sidebar/top nav on desktop.

### 3.2 Backend

| Concern | Choice | Rationale |
|--------|--------|-----------|
| Runtime | Node.js (Express or Fastify) or similar | Simple REST API, good fit for JS/TS monorepo. |
| Language | TypeScript | Shared types with frontend, type safety. |
| Database | PostgreSQL | Relational data (users, places, check-ins, groups, reviews). |
| Geo | PostGIS or lat/lng + distance in DB | Proximity sort “nearest first”. |
| Auth | JWT (access + refresh) + optional OAuth (Google, Apple) | Matches “Continue with Google/Apple” in designs. |
| File storage | S3-compatible (e.g. AWS S3, MinIO) | Avatars, place photos, review photos. |
| Email | SendGrid or similar | Password reset, optional group invites. |

### 3.3 Monorepo Layout (recommended)

```
pilgrimage-tracker/
├── apps/
│   ├── web/                 # Vite React app (desktop + mobile web). Own api client, types, constants.
│   └── mobile/              # Capacitor-wrapped React app. Replicated UI and features from web (no shared packages).
├── server/                  # Backend API (Express/Fastify), versioned at /api/v1
│   ├── src/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── middleware/
│   │   └── db/
│   └── package.json
├── .cursor/
│   └── rules/               # Cursor rules: e.g. replicate frontend UI/features in both web and mobile
├── DESIGN_FILE.html
├── app-design-prompt-google-stitch.md
├── ARCHITECTURE.md
└── IMPLEMENTATION_PROMPTS.md
```

**Why no shared `packages`:** Shared packages can be hard to maintain in production (e.g. build/deploy and import paths differ for web vs mobile). Instead, **replicate** frontend code in both `apps/web` and `apps/mobile`. Use a **Cursor rules file** (e.g. in `.cursor/rules/`) that states: *when adding or changing UI or features in one app (web or mobile), replicate the same UI and behavior in the other app so both stay in sync.* Business logic, screens, and design should be identical; only app-specific config (e.g. Capacitor plugins, env vars) may differ.

**Capacitor:** `apps/mobile` is a full copy of the frontend (or mirrors web’s structure) and is built separately for iOS/Android. Both web and mobile call the same versioned API.

---

## 4. Data Model (core entities) — code-based references

All entities are identified by a **stable, autogenerated code** (e.g. `user_code`, `place_code`), not by numeric/serial IDs. Codes are unique per table and used in APIs and foreign keys. They may include a **prefix or suffix** (e.g. `usr_abc12`, `plc_xyz99`) to make them easy to distinguish in logs and URLs; this prefix/suffix is **not** used in business logic — treat the code as an opaque string everywhere in application code.

- **User:** user_code (PK, autogenerated), email, password_hash, display_name, religion (enum: islam, hinduism, christianity), avatar_url, created_at, updated_at.
- **Place:** place_code (PK, autogenerated), name, religion, place_type (e.g. mosque, temple, church), lat, lng, address, opening_hours (JSON or table), image_urls[], description. Religion-specific fields (JSON or columns): e.g. deities[], festival_dates, denomination, prayer_times.
- **CheckIn:** check_in_code (PK, autogenerated), user_code (FK), place_code (FK), checked_in_at, note, photo_url (optional).
- **Review:** review_code (PK, autogenerated), user_code (FK), place_code (FK), rating (1–5), title, body, photo_urls[], created_at.
- **Favorite:** user_code (FK), place_code (FK) — composite PK.
- **Group:** group_code (PK, autogenerated), name, description, created_by_user_code (FK), invite_code (for joining), is_private, created_at.
- **GroupMember:** group_code (FK), user_code (FK), role (admin/member), joined_at — composite PK.
- **GroupInvite:** invite_code or id (as needed), group_code (FK), email or link, expires_at, used_at.
- **Notification:** notification_code (PK, autogenerated), user_code (FK), type (e.g. group_invite, check_in_activity), payload (JSON), read_at, created_at.

**Proximity:** Places sorted by distance using user’s lat/lng (from browser/device) and stored place coordinates (PostGIS or `ORDER BY distance` formula).

---

## 5. API Outline (REST) — versioned and code-based

All API routes are **versioned** under `/api/v1` (e.g. `/api/v1/places`). Paths and bodies use **entity codes** (e.g. `place_code`, `user_code`), not numeric IDs.

- **Auth:** `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `POST /api/v1/auth/forgot-password`, `POST /api/v1/auth/reset-password`, `POST /api/v1/auth/refresh`, optional `GET/POST /api/v1/auth/oauth/google|apple`.
- **Users:** `GET/PATCH /api/v1/users/me`, `GET /api/v1/users/me/check-ins`, `GET /api/v1/users/me/favorites`, `GET /api/v1/users/me/stats` (responses use `user_code`, `place_code`, etc.).
- **Religion:** `PATCH /api/v1/users/me/religion` (onboarding or later).
- **Places:** `GET /api/v1/places?religion=&lat=&lng=&radius=&type=&open_now=&sort=proximity` (each item includes `place_code`), `GET /api/v1/places/:placeCode`.
- **Check-ins:** `POST /api/v1/places/:placeCode/check-in`, `GET /api/v1/users/me/check-ins` (each item references `place_code`, `user_code`).
- **Reviews:** `GET /api/v1/places/:placeCode/reviews`, `POST /api/v1/places/:placeCode/reviews`, `PATCH/DELETE /api/v1/reviews/:reviewCode`.
- **Favorites:** `POST/DELETE /api/v1/places/:placeCode/favorite`, `GET /api/v1/users/me/favorites`.
- **Groups:** `GET /api/v1/groups`, `POST /api/v1/groups`, `GET /api/v1/groups/:groupCode`, `PATCH /api/v1/groups/:groupCode`, `POST /api/v1/groups/:groupCode/join`, `POST /api/v1/groups/:groupCode/invite`, `GET /api/v1/groups/:groupCode/members`, `GET /api/v1/groups/:groupCode/leaderboard`, `GET /api/v1/groups/:groupCode/activity`. Request/response bodies use `group_code`, `user_code`.
- **Notifications:** `GET /api/v1/notifications`, `PATCH /api/v1/notifications/:notificationCode/read`.

All authenticated routes use JWT in `Authorization: Bearer <token>`.

---

## 6. Frontend Structure (web and mobile replicated)

- **Routes:** Splash → Login/Register → Religion selection (if new) → Home. Home (list/map), Place detail (by `placeCode`), Profile, Groups list, Group detail (by `groupCode`), Favorites, Settings, Notifications, Write review. Use the same route names and **codes** in both `apps/web` and `apps/mobile` (e.g. `/places/:placeCode`).
- **Layout:** Responsive shell with bottom nav on small screens and optional top/side nav on large screens; safe-area padding for notched devices (as in DESIGN_FILE). Implement in both web and mobile.
- **State:** Current user (and religion) in context/store; places, place detail, groups, and notifications via React Query (or similar) against a **local** API client in each app. Each app (`web`, `mobile`) has its own `api-client` and types; no shared packages.
- **Design tokens:** Centralize Tailwind theme (primary, background-light, fonts, radii) to match DESIGN_FILE.html in **both** apps.
- **Cursor rule:** A rule in `.cursor/rules/` must require that when adding or changing UI or features in `apps/web`, the same changes are replicated in `apps/mobile`, and vice versa, so the two codebases stay in sync.

---

## 7. Security and Deployment (summary)

- **HTTPS only;** secure cookies or httpOnly refresh token if using cookie-based refresh.
- **Rate limiting and validation** on auth and write endpoints.
- **CORS** configured for web origin(s); Capacitor apps use same API origin.
- **Deployment:** Backend on a VPS or PaaS (e.g. Railway, Render); DB managed (e.g. Supabase, Neon). Web app on Vercel/Netlify or same host as API. iOS/Android built via Capacitor and submitted to App Store / Play Store.

---

## 8. Design Alignment

- **Screens to implement** (from DESIGN_FILE.html and app-design-prompt): Splash, Create Account, Login, Forgot Password, Religion selection, Home (list + map), Place detail (Islam/Hinduism/Christianity variants), Check-in flow, Profile and stats, Groups list, Group detail and leaderboard, Favorites, Settings, Notifications, Write review. Empty and error states as specified in the design prompt.
- **Design system:** Lexend, Material Icons/Symbols, Tailwind with tokens from DESIGN_FILE (primary, borders, radii, safe areas). Support light/dark where designs specify (e.g. Place detail Hindu temple).

This architecture keeps one frontend codebase for desktop, mobile web, and native iOS/Android while supporting a scalable backend and clear separation of concerns. Implementation is split into phased prompts in [IMPLEMENTATION_PROMPTS.md](IMPLEMENTATION_PROMPTS.md).
