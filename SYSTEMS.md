# SYSTEMS.md — SoulStep

Complete reference for all systems, services, features, and components.

---

## 1. Overview

```
+------------------------+
|   Scraper API          |
|  soulstep-scraper-api/ |
|  FastAPI + SQLite/PG   |
+----------+-------------+
           |
    POST /places/batch
     (sync scraped data)
           |
           v
+------------------+     +--------------------+     +------------------+
|   Web App        |     |   Catalog API      |     |   Mobile App     |
| apps/soulstep-   +---->| soulstep-catalog-  |<----+ apps/soulstep-   |
| customer-web/    |     | api/               |     | customer-mobile/ |
| React + Vite     |     | FastAPI + SQLModel  |     | Expo + React Nav |
| Tailwind CSS     |     | SQLite (dev) /     |     |                  |
+------------------+     | PostgreSQL (prod)  |     +------------------+
                         +--------------------+
                                  |
                         +------------------+
                         |   Admin Web      |
                         | apps/soulstep-   |
                         | admin-web/       |
                         | React + Vite     |
                         +------------------+
```

**Services:**
- **Catalog API** (`soulstep-catalog-api/`) — core REST API serving all clients
- **Scraper API** (`soulstep-scraper-api/`) — discovers, enriches, and syncs sacred places
- **Web App** (`apps/soulstep-customer-web/`) — Vite + React SPA (desktop + mobile browser)
- **Mobile App** (`apps/soulstep-customer-mobile/`) — Expo + React Native (iOS + Android)
- **Admin Dashboard** (`apps/soulstep-admin-web/`) — Vite + React admin panel

All entities use stable `*_code` string identifiers (never numeric IDs) across DB, API, and frontends.

---

## 2. Catalog API (`soulstep-catalog-api/`)

### Tech Stack

| Component | Technology |
|---|---|
| Language | Python 3.11+ |
| Framework | FastAPI |
| ORM | SQLModel (SQLAlchemy + Pydantic) |
| Database (dev) | SQLite (`soulstep.db`) |
| Database (prod) | PostgreSQL 15 |
| Auth | JWT Bearer tokens + bcrypt password hashing |
| Migrations | Alembic (auto-run on startup) |

### Database Models

**Core:**

| Model | PK | Description |
|---|---|---|
| `User` | `user_code` | email, password_hash, display_name, avatar_url |
| `UserSettings` | FK → user_code | theme, language, units, religions (JSON array) |
| `Visitor` | `visitor_code` | anonymous identity (`vis_` + 16 hex chars) |
| `VisitorSettings` | FK → visitor_code | same fields as UserSettings |
| `Place` | `place_code` | name, religion, place_type, lat/lng, address, opening_hours (JSON), utc_offset_minutes, description, website_url, source |
| `PlaceImage` | FK → place_code | image_type (url/blob), url, blob_data, mime_type, display_order |
| `PlaceSEO` | FK → place_code | seo_slug, meta_title, meta_description, structured_data, alt_text, FAQ |
| `Review` | `review_code` | user_code FK, place_code FK, rating (1–5), title, body, photo_urls (JSON), source (user/google) |
| `ReviewImage` | FK → review_code | blob image storage for review photos |
| `CheckIn` | `check_in_code` | user_code FK, place_code FK, group_code FK (nullable), checked_in_at, note |
| `Favorite` | composite PK: user_code + place_code | simple join table |

**Groups:**

| Model | PK | Description |
|---|---|---|
| `Group` | `group_code` | name, description, created_by, invite_code, is_private, path_place_codes (JSON), cover_image_url, start_date, end_date |
| `GroupMember` | composite: group_code + user_code | role (admin/member), joined_at |
| `GroupPlaceNote` | `note_code` | group_code FK, place_code FK, user_code FK, text — collaborative notes on itinerary places |
| `Notification` | `notification_code` | user_code FK, type, payload (JSON), read_at |

**Auth:**

| Model | PK | Description |
|---|---|---|
| `PasswordReset` | token | user_code FK, expires_at, used_at |

**Dynamic Attributes (EAV):**

| Model | PK | Description |
|---|---|---|
| `PlaceAttributeDefinition` | `attribute_code` | name, data_type, icon, label_key, is_filterable, religion, display_order |
| `PlaceAttribute` | unique: place_code + attribute_code | value_text, value_json |

The EAV pattern allows religion-specific metadata (prayer times for Islam, service times for Christianity, deities for Hinduism) without schema changes.

**Analytics & Ads:**

| Model | PK | Description |
|---|---|---|
| `AnalyticsEvent` | `event_code` | user_code/visitor_code FK, event_type, platform, properties (JSON) |
| `ConsentRecord` | `consent_code` | user/visitor consent for ads + analytics |
| `AdConfig` | `config_code` | platform-specific ad config (enabled, publisher/slot IDs) |
| `AICrawlerLog` | `log_code` | AI crawler visit log (bot name, path, user-agent) |

**Cities:**

| Model | PK | Description |
|---|---|---|
| `City` | auto from Places | aggregated from place addresses; city_slug for URLs |

### API Endpoints

See `soulstep-catalog-api/README.md` for the full endpoint list.

**Key groups:**
- `GET /health` — health check
- `/api/v1/auth/*` — register, login, password reset
- `/api/v1/users/me*` — profile, settings, check-ins, stats, favorites
- `/api/v1/places*` — list, detail, reviews, check-in, favorite
- `/api/v1/cities*` — city browse + religion filter
- `/api/v1/groups*` — CRUD, join, invite, leaderboard, activity, checklist, notes
- `/api/v1/notifications*` — list, mark read
- `/api/v1/search*` — autocomplete, place details (Google Places proxy)
- `/api/v1/visitors*` — anonymous visitor sessions
- `/api/v1/ads*`, `/api/v1/consent*` — ads config + consent
- `/api/v1/analytics/events` — batch event ingestion
- `/api/v1/languages`, `/api/v1/translations` — i18n (no auth)
- `/share/*`, `/sitemap.xml`, `/robots.txt`, `/feed.xml` — SEO + sharing
- `/api/v1/admin/*` — full admin CRUD (requires admin role)

---

## 3. Scraper API (`soulstep-scraper-api/`)

### Tech Stack

| Component | Technology |
|---|---|
| Language | Python 3.11+ |
| Framework | FastAPI |
| ORM | SQLModel |
| Database (dev) | SQLite (`scraper.db`) |
| Database (prod) | PostgreSQL (optional — for persistent run history) |
| Browser automation | Playwright + Chromium (optional) |

### Database Models

| Model | PK | Description |
|---|---|---|
| `DataLocation` | `location_code` | name, source_type (gmaps), city/state/country, max_results |
| `ScraperRun` | `run_code` | location_code FK, status, stage, progress counters, error_message |
| `ScrapedPlace` | run_code + place_code | name, raw_data (JSON), enrichment_status, quality_score, description_source |
| `RawCollectorData` | auto | place_code, collector_name, run_code, raw_response (JSON), status |
| `DiscoveryCell` | auto | quadtree cell bounds, depth, result_count, run_code |
| `GlobalDiscoveryCell` | auto | cross-run deduplication cells |
| `GlobalGmapsCache` | auto | cached place detail responses |
| `GeoBoundary` | name | boundary_type, country, state, lat/lng bounding box, radius_km |
| `PlaceTypeMapping` | religion + source_type + gmaps_type | our_place_type, is_active, display_order |

### Pipeline

```
Discovery (quadtree searchNearby)
    ↓
Detail Fetch (getPlace full field mask)
    ↓
Image Download (Google Photo CDN)
    ↓ [GATE_IMAGE_DOWNLOAD = 0.75]
Enrichment:
    Phase 0: OSM/Overpass  — amenities, contact, multilingual names
    Phase 1: Wikipedia     — descriptions (en/ar/hi), images
              Wikidata     — founding date, heritage, socials
    Phase 2: KnowledgeGraph, BestTime, Foursquare, Outscraper
    ↓ [GATE_ENRICHMENT = 0.75]
Quality Assessment (heuristic + optional Gemini LLM)
    ↓ [GATE_SYNC = 0.75]
Sync → POST /api/v1/places/batch on Catalog API
```

See `soulstep-scraper-api/README.md` for the full API reference and collector details.

---

## 4. Web App (`apps/soulstep-customer-web/`)

### Tech Stack

| Component | Technology |
|---|---|
| Framework | React 19 |
| Build tool | Vite 7 |
| Language | TypeScript |
| Styling | Tailwind CSS 3 |
| Routing | React Router 6 |
| Maps | Leaflet (react-leaflet) |
| Icons | Material Symbols Outlined |
| Font | Lexend |

### Pages / Routes

| Route | Page |
|---|---|
| `/home` | Journey Dashboard (Home.tsx) |
| `/onboarding` | 3-card onboarding flow |
| `/map` | Full-screen MapDiscovery (Leaflet + filters) |
| `/places` | All sacred sites list |
| `/places/:placeCode` | PlaceDetail (JSON-LD, FAQ, nearby places) |
| `/journeys/new` | CreateGroup (4-step flow) |
| `/journeys/:groupCode` | GroupDetail (hero, timeline, tabs, glass bar) |
| `/journeys/:groupCode/edit` | EditGroup |
| `/journeys/:groupCode/edit-places` | EditGroupPlaces |
| `/explore` | ExploreCities |
| `/explore/:city` | ExploreCity |
| `/profile` | Profile |
| `/login`, `/register` | Auth |
| `/developers` | API docs |

### Providers / State

| Provider | State |
|---|---|
| `AuthProvider` | user, token, login(), register(), logout() |
| `I18nProvider` | locale, translations, t() helper, RTL flag |
| `ThemeProvider` | light/dark mode (Tailwind `class` strategy) |

---

## 5. Mobile App (`apps/soulstep-customer-mobile/`)

### Tech Stack

| Component | Technology |
|---|---|
| Framework | React Native 0.81 |
| Platform | Expo 54 |
| Language | TypeScript |
| Navigation | React Navigation 7 |
| Maps | Leaflet via react-native-webview |
| Location | expo-location |
| Storage | @react-native-async-storage |
| Icons | MaterialIcons from @expo/vector-icons |
| Blur effects | expo-blur (glass tab bar) |

### Key Screens

Same screen inventory as the web app. See `apps/soulstep-customer-mobile/README.md` for the full list.

Feature parity with web is enforced by convention — same API calls, same translation keys, same navigation structure.

---

## 6. Admin Dashboard (`apps/soulstep-admin-web/`)

### Tech Stack

Same as web app (Vite + React + TypeScript + Tailwind). Uses Radix UI primitives for accessible components.

### Pages

Covers users, places, groups, reviews, check-ins, notifications, scraper runs, quality metrics, translations, content translations, place attributes, app versions, audit log, and analytics.

See `apps/soulstep-admin-web/README.md` for the full page list.

---

## 7. Shared Conventions

### Code-Based Identifiers

All entities use stable `*_code` string identifiers — never numeric IDs:
- `user_code`, `place_code`, `group_code`, `review_code`, `check_in_code`, `notification_code`, `attribute_code`, `note_code`
- Used in DB primary/foreign keys, API paths, request/response bodies, frontend types
- May include a readable prefix (e.g. `plc_abc12`) — treated as opaque strings in business logic

### Internationalization (i18n)

- **Languages**: English (default), Arabic, Hindi, Telugu, Malayalam (5 total)
- **RTL**: Enabled automatically when locale is Arabic (`ar`)
- **API**: All UI strings from `GET /api/v1/translations?lang=` — never hardcoded in frontends
- **Fallback**: English when a key is missing for the requested language
- **Keys**: Same keys used in both web and mobile (no platform-specific keys)

### Authentication

- **JWT Bearer tokens** — issued on login/register, sent in `Authorization` header
- **bcrypt** password hashing
- **Token-based password reset** (email via Resend.com in production)
- **Visitor sessions** — anonymous users get a `visitor_code` before signing up

### Dark Mode

- **Web**: Tailwind `class` strategy — `dark` class on `<html>` toggles all `dark:` variants
- **Mobile**: React Native `Appearance` API with user override in AsyncStorage
- **Design tokens**: `dark:bg-dark-bg`, `dark:bg-dark-surface`, `dark:text-white`, `dark:border-dark-border` — never use `dark:bg-gray-*`

### Feature Parity (Web ↔ Mobile)

Both frontends maintain the same:
- Screen/route inventory
- API client methods (identical endpoint coverage)
- Translation keys (no platform-specific keys)
- User flows (auth, browsing, check-in, reviews, groups, notifications)

Implementation differs only in platform primitives (React DOM + Tailwind vs React Native + Expo). No shared packages — replicate code in both apps.

### Datetime Handling

All datetime columns use `_UTCAwareDateTime` TypeDecorator (`_TSTZ()` helper):
- PostgreSQL: `TIMESTAMPTZ` — stores and returns aware datetimes
- SQLite: re-attaches UTC on read
- Runtime: always use `datetime.now(UTC)`, never `datetime.utcnow()`

### Opening Hours + Timezone

- Opening hours stored in **local time** (24-hour, as received from Google Maps)
- `utc_offset_minutes` stored per place (e.g. 240 for UTC+4)
- `is_open_now` computed on the server: current UTC → local time → compare against opening hours
- Browser mode uses `timezonefinder` to compute UTC offset from lat/lng

---

## 8. Data Flow

### User Registration

```
Client → POST /api/v1/auth/register { email, password, display_name }
       → server hashes password (bcrypt), generates user_code
       → returns JWT + user object
       → client stores token, sets Authorization header
```

### Place Discovery

```
Client → GET /api/v1/places?religion=islam&lat=21.4&lng=39.8
       → server queries Place table, joins PlaceAttribute
       → calculates Haversine distance (if coordinates provided)
       → returns paginated list with images, attributes, open/closed status
```

### Scraper Sync

```
Operator → POST /api/v1/scraper/data-locations (configure region)
         → POST /api/v1/scraper/runs (start background scrape)
         → scraper runs quadtree discovery + enrichment pipeline
         → POST /api/v1/scraper/runs/{code}/sync
             → POST /api/v1/places/batch on catalog API
             → catalog deduplicates by place_code, upserts
```

### Check-In Flow

```
Client → POST /api/v1/places/{placeCode}/check-in { note, group_code }
       → server creates CheckIn record
       → if group_code: validates membership, notifies group members
       → client refreshes stats + group leaderboard
```

### Group Invite Flow

```
Creator → POST /api/v1/groups { name, path_place_codes, is_private }
        → server generates invite_code → creator shares link

Invitee → POST /api/v1/groups/join-by-invite { invite_code }
        → server creates GroupMember, notifies group members
```

---

## 9. Religion Support

| Religion | Place Types | Key Attributes |
|---|---|---|
| Islam | Mosques, shrines | Prayer times, Jummah times |
| Christianity | Churches, cathedrals, shrines | Service times, denomination |
| Hinduism | Temples, shrines | Deities, festivals |

Users select preferred religions in `UserSettings.religions`. Empty list = show all.

---

## 10. Security

- **HTTPS only** in production (Cloud Run enforces TLS)
- **Rate limiting** on auth and write endpoints
- **CORS** configured for web origins (space-separated `CORS_ORIGINS` env var)
- **Secrets** in GCP Secret Manager — never in plain env vars for production
- **Admin role** required for all `/api/v1/admin/*` endpoints
- **Internal-only** scraper service (`--no-allow-unauthenticated` on Cloud Run)
