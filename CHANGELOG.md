# Changelog

All notable changes from implementing [IMPLEMENTATION_PROMPTS.md](IMPLEMENTATION_PROMPTS.md) and project process are documented here.

---

## D-1: Desktop layout and navigation

- **Layout:** Top bar on md+ with logo (app name), Explore, Map, Groups, Profile, Notifications, Profile/Login. Main content max-w-6xl xl:max-w-7xl. Mobile: bottom nav (Explore, Map, Groups, Profile). All main routes reachable from nav.

---

## D-2: Desktop – Explore and Map

- **Home:** Place cards grid uses md:grid-cols-2 lg:grid-cols-3 for 2–3 column layout on desktop.
- **Map:** On md+, right side panel (w-96) with selected place card and place list; map fills remaining area. Mobile: unchanged (bottom sheet).

---

## D-3 / D-4: Desktop – Place Detail, Profile, Groups, Write Review, Check-in History

- Place Detail, Profile, Groups, Write Review, and Check-in History use the same content and components as mobile within Layout’s max-width content area; no separate desktop layouts added.

---

## X-1: API contracts and data flow

- **GET /places** and **GET /places/:code**: Return religion_specific, is_open_now, average_rating, review_count (when include_rating=true), website_url, has_events. Place detail includes user_has_checked_in, is_favorite when authenticated.
- **GET /users/me/check-ins**: Returns place name, place_image_url, date, time, location (address) per check-in; frontend types extended accordingly.
- **GET /users/me/stats**: Returns visits, reviews, badges_count; frontend uses these for Profile.
- **GET /groups**: Returns last_activity, sites_visited, total_sites, next_place_name, featured; frontend types and Groups UI use these.
- No backend changes required for current UI; any gaps documented above.

---

## Frontend Revamp — Phase 3 & 4 (2026-02-14)

### Frontend — Web
- **Home:** Uniform h-72 rounded-3xl glass cards for all places; filter chips updated to `all/mosque/shrine/temple` passing `place_type` query param; tune icon in search bar; map icon navigates to `/map`.
- **CheckInsList:** Added "On This Day" section (uses new `GET /me/check-ins/on-this-day` endpoint) and "This Month" section (uses `GET /me/check-ins/this-month`); dark mode support; `CheckInCard` extracted as reusable component.

### Frontend — Mobile
- **HomeScreen:** Uniform `h-288` glass cards for all places (matching web); filter chips updated to `all/mosque/shrine/temple` with `place_type` mapping; inline `PlaceCardFull` component; map button navigates to Map tab.
- **CheckInsListScreen:** Added "On This Day" section and "This Month" section using new API endpoints matching web.

### Backend
- Two new endpoints: `GET /users/me/check-ins/this-month`, `GET /users/me/check-ins/on-this-day`.

---

## M-10: Check-in History / My Journey (mobile + mobile web)

**Done when:** Check-in History matches DESIGN_FILE_V2 “Journey Log”: title, total visits + This month, calendar with month nav and check-in indicators, Recent Visits list.

### Frontend — Web

- **CheckInsList:** “Journey Log” title, stats card (Total Visits count + “sacred places”, This Month). Calendar: month label, prev/next nav, 7×6 grid with check-in days highlighted (blue dot; today filled primary). Recent Visits: cards with place image, name, date/time, location, link to place detail. Uses GET /me/check-ins; calendar derived from checked_in_at on client. Light variant (gradient background, white cards).

### Frontend — Mobile

- **CheckInsListScreen:** Same structure with tokens: stats card, calendar with month nav and day grid (check-in dots, today primary), Recent Visits list with thumb, name, date, location. Uses theme tokens.

### Backend

- **CheckIn type:** Extended with date, time, place_name, place_image_url, location (API already returns these).
- **i18n:** journey.myJourney, journey.journeyLog, journey.subtitle, journey.totalCheckIns, journey.totalVisits, journey.thisMonth, journey.sacredPlaces, journey.recentActivity, journey.recentVisits, journey.viewAll (en, ar, hi).

---

## M-9: Write a Review (mobile + mobile web)

**Done when:** Write Review matches DESIGN_FILE_V2: header (Cancel, Write Review, Save), place name/location/thumb, stars, text area, photo strip, Post Anonymously, Submit, success overlay.

### Frontend — Web

- **WriteReview:** Header with Cancel, “Write Review” title, Save (edit only). Place name, address, thumb image. Star rating (1–5) with label. Textarea “Share your experience…”. Photo add button (placeholder). Post Anonymously toggle. Submit button (floating for create). Success overlay “Review Posted” / “Your voice has been heard.” / Return. createReview sends is_anonymous; API client accepts is_anonymous and photo_urls.

### Frontend — Mobile

- **WriteReviewScreen:** Same layout with tokens: header, place row with thumb, stars, textarea, add photo button, Post Anonymously toggle, floating Submit (or bottom Save for edit). Success modal with Return. Passes is_anonymous to createReview.

### Backend

- **i18n:** writeReview.title, shareExperience, postAnonymously, submit, reviewPosted, yourVoiceHeard, return, addPhoto (en, ar, hi).

---

## M-8: My Pilgrimage Groups (mobile + mobile web)

**Done when:** Groups list matches DESIGN_FILE_V2 “My Pilgrimage Groups”: My Groups header, notifications icon, featured card, list with progress, FAB.

### Frontend — Web

- **Groups:** Header “My Groups” + notifications link. Featured group card (first/featured): gradient (blue), “Featured” badge, name, “Next: {next_place_name}”, progress bar with %, member placeholder avatars + “+N”, arrow CTA; links to group detail. List: each group has name, last active (relative time), “X/Y Sites”, level badge (New, Lvl 1–5, Done), progress bar; member avatars row. FAB “+” to create group. Uses GET /groups (last_activity, sites_visited, total_sites, next_place_name, featured).

### Frontend — Mobile

- **GroupsScreen:** Same structure with tokens: header with title and notifications button, featured card (gradient, progress, next, avatars, arrow), list rows with last active, sites count, level badge, progress bar, overlapping avatar circles; FAB + for Create Group.

### Backend

- **Group type:** Extended with last_activity, sites_visited, total_sites, next_place_code, next_place_name, featured (API already returns these).
- **i18n:** groups.myGroups, groups.featured, groups.next, groups.currentProgress, groups.sitesCount, groups.lastActive, groups.noGroupsYet, groups.noGroupsDescription (en, ar, hi).

---

## M-7: User Profile & Stats (mobile + mobile web)

**Done when:** Profile matches DESIGN_FILE_V2 “User Profile & Stats”: avatar, name, Joined date, stats (Visits, Reviews, Badges), faith toggle, Edit Profile, Account (My Check-ins, Favorite Places, Group Activity), app version.

### Frontend — Web

- **Profile:** Gradient header, “Profile” title and settings icon; avatar (144px), name, “Joined {date}” from user.created_at; stats row (Visits, Reviews, Badges from GET /me/stats: visits, reviews, badges_count); faith pill (Islam / Christianity / Hinduism) linking to /select-path; Edit Profile button; Account section with My Check-ins, Favorite Places, Group Activity (icons and labels); version at bottom. Uses design tokens.

### Frontend — Mobile

- **ProfileScreen:** Same structure with theme tokens: header (centered “Profile”, settings button), avatar 144px, name, Joined date, three-column stats, faith pill (Islam/Christianity/Hinduism) to SelectPath, Edit Profile button, Account card with three rows, version. GET /me/stats for visits, reviews, badges_count.

### Backend

- **UserStats:** API already returns visits, reviews, badges_count; frontend types extended with optional visits, reviews, badges_count.
- **i18n:** profile.visits, profile.reviews, profile.badges, profile.joined, profile.account, profile.myCheckIns, profile.favoritePlaces, profile.groupActivity, profile.selectPilgrimagePath, profile.version (en, ar, hi).

---

## M-6: Map Discovery tab and screen (mobile + mobile web)

**Done when:** Map tab in bottom nav; Map screen matches DESIGN_FILE_V2 “Map Discovery View”: search, map/list, bottom sheet with selected place, Get Directions.

### Frontend — Web

- **Map page:** Full-height map (PlacesMap) with search bar at top, layers + my location buttons on the right. Markers call `onPlaceSelect(place)`; bottom sheet shows selected place (image, name, address, rating, distance, Open Now), Get Directions (opens maps URL), Share. Search triggers GET /places with 300ms debounce.

### Frontend — Mobile

- **MapScreen:** Search bar, list of places (thumb from `image_urls[0]`, name, address, rating/distance/Open Now). Tap opens modal bottom sheet with selected place card, Get Directions, Share, and link to PlaceDetail. No native map yet (list + sheet only); uses theme tokens.

### Backend

- No backend changes; uses existing GET /places with lat/lng and optional search.

---

## M-5: Place Detail – Hindu temple and Christian church variants (mobile + mobile web)

**Done when:** Place Detail branches on religion to show mosque (M-4), Hindu temple, or Christian church variant; temple and church match DESIGN_FILE_V2.

### Frontend — Web

- **PlaceDetail:** When `place.religion === 'hinduism'`: temple variant — hero (55vh), back/share/favorite, “Hindu Temple” badge + rating, name + address; row Opens At / Distance / Crowd from opening_hours, distance, religion_specific.crowd_level; Sanctum Story (description + Read more); Divine Presence (deities carousel from religion_specific.deities); Essential Information (Architecture, Next Festival, Dress Code + notes); Pilgrim Voices (ReviewsPreview); footer Directions + Check-in. When `place.religion === 'christianity'`: church variant — hero 420px, back/bookmark/share, place_type + Open badges, name + address; stats row rating, Founded (founded_year), Style (style); Get Directions + Visit Website (website_url); The Sanctuary (description); Service Times table from religion_specific.service_times; Pilgrim Voices; floating CTA “Start Pilgrimage” (check-in).

### Frontend — Mobile

- **PlaceDetailScreen:** Temple variant: hero with type badge + rating, Opens At / Distance / Crowd row, Sanctum Story, Divine Presence (horizontal deities), Essential Information grid, Pilgrim Voices; footer Directions + Check-in. Church variant: hero with type + Open badges, stats row (rating, Founded, Style), Directions + Visit Website, The Sanctuary, Service Times list, Pilgrim Voices; bottom CTA “Start Pilgrimage”. Shared variantStyles for temple/church.

### Backend

- **i18n:** placeDetail.opensAt, distance, crowd, sanctumStory, divinePresence, principalDeities, viewAll, essentialInfo, architecture, nextFestival, dressCode, dressCodeNotes, pilgrimVoices, founded, style, theSanctuary, serviceTimes, fullSchedule, visitWebsite, startPilgrimage, hinduTemple, reviewsCount; common.readMore (en, ar, hi).

---

## M-4: Place Detail – mosque variant (mobile + mobile web)

**Done when:** Place Detail for mosque matches DESIGN_FILE_V2 “Place Details - Mosque”: hero, back/share/favorite, Open Now & distance, name & address, Prayer Times, About, Details & Facilities, Check-in & Directions, Recent Reviews.

### Frontend — Web

- **PlaceDetail:** When `place.religion === 'islam'`, render mosque variant: hero 420px, rounded-b-2.5rem, back + share (glass) + favorite on hero; Open Now and distance badges; name (text-3xl white) and address. Sections: Prayer Times (horizontal scroll, Fajr–Isha + date badge from `religion_specific.prayer_times`), About (description + Read Full Story), Details & Facilities (2×2 grid: Capacity, Wudu Area, Parking, Women’s Area from `religion_specific`), Check-in + Directions buttons, Recent Reviews (rating badge + ReviewsPreview with hideTitle). SharePlaceButton supports `variant="glass"` for hero. ReviewsPreview supports `hideTitle`.

### Frontend — Mobile

- **PlaceDetailScreen:** When `place.religion === 'islam'`, render mosque variant: hero 420px with overlay, back/share/favorite circle buttons, Open Now & distance badges, name & address. ScrollView: Prayer Times (horizontal), About, Details & Facilities (2-col grid), Recent Reviews; footer Check-in + Directions. Uses `tokens` and new i18n keys.

### Backend

- **i18n:** Added `placeDetail.prayerTimes`, `placeDetail.about`, `placeDetail.readFullStory`, `placeDetail.detailsAndFacilities`, `placeDetail.capacity`, `placeDetail.wuduArea`, `placeDetail.parking`, `placeDetail.womensArea`, `placeDetail.directions`, `placeDetail.recentReviews`, `placeDetail.whatPeopleSay`, `placeDetail.readAllReviews`, `placeDetail.fajr/dhuhr/asr/maghrib/isha` (en, ar, hi).

---

## M-3: Explore Sacred Places – Home (mobile + mobile web)

**Done when:** Home/Explore matches DESIGN_FILE_V2 “Explore Sacred Places”: greeting, search, filter chips, hero card, place list, bottom nav.

### Frontend — Web

- **Home:** Gradient background (F0F7FF → FFFFFF). Header: “Explore” label, greeting “Assalamu Alaikum,” + name (text-2xl extralight / text-3xl normal). List/Map toggle (pill, primary when active). Search bar (border-b, search icon). Filter chips: Nearby (default), Historical, Jummah, Events (single-select; Jummah/Events UI only until backend). Hero: first place as large card (rounded-2rem, ~28rem height), image, overlay, glass-style bottom with name, address, rating, distance, “Details” link. Remaining places as PlaceCard grid. GET /places with lat/lng, sort distance; place_type=temple for Historical.

### Frontend — Mobile

- **HomeScreen:** Same structure: surfaceTint background, “Explore” label, greeting + name, search (underline), horizontal chips (Nearby, Historical, Jummah, Events). Hero card: first place 320px height, image, dark overlay, glass bottom card (name, address, rating, distance, “Details”). FlatList of remaining PlaceCards. Theme tokens throughout.

### Backend

- **i18n:** `home.greeting` (Assalamu Alaikum / السلام عليكم / नमस्ते), `home.historical`, `home.jummah`, `home.events`, `home.details`; `home.findPlace` updated to “Search for places…” (en).

---

## M-2: Select Your Path (mobile + mobile web)

**Done when:** Select Path screen matches DESIGN_FILE_V2.html “Select Your Path”: faith cards, View More Faiths, Skip for now; settings API saves religion preference.

### Frontend — Web

- **SelectPath:** Full-viewport layout with gradient background (F0F5FA → E6EEF5). Header: title “Select Your Path” (32px semibold), subtitle “Begin your spiritual journey.” Three faith cards: large circular buttons (144px) with Material Symbol icons (mosque, temple_hindu, church), label below; toggle selection; faith-specific hover (emerald/orange/blue). Footer: Continue (when any selected), “View More Faiths”, “Skip for now”. Saves selection via `updateSettings({ religions })` and navigates to /home.

### Frontend — Mobile

- **SelectPathScreen:** Same layout and copy: gradient-style background, back button, centered header (title 32px, subtitle), three faith cards with 144px circle, emoji icons (🕌 🛕 ⛪), selection ring per faith accent (emerald/orange/blue). Footer: Continue when selected, “View More Faiths”, “Skip for now”. Uses `updateSettings({ religions })` and navigates to Main.

### Backend

- **i18n:** `selectPath.subtitle` set to “Begin your spiritual journey.” (en, ar, hi); added `selectPath.viewMoreFaiths` (en, ar, hi).

---

## M-1: Design tokens and shared components (DESIGN_FILE_V2)

**Done when:** Tokens and reusable components from DESIGN_FILE_V2.html for web and mobile; PlaceCard with rating and Open Now; BottomNav Explore, Map, Groups, Profile.

### Design tokens

- **Web:** `tailwind.config.js` extended with DESIGN_FILE_V2 tokens: primary, primary-dark, primary-hover, accent, background-light, surface, soft-blue, surface-tint, text-main, text-dark, text-secondary, text-muted, blue-tint, icon-grey; fontFamily Inter (replacing Lexend); borderRadius lg/xl/2xl/3xl/full; boxShadow soft, card, elevated, floating, nav, subtle. `index.html` font switched to Inter.
- **Mobile:** `apps/mobile/src/lib/theme.ts` with same tokens (colors, borderRadius, shadow, typography) for use in StyleSheet and components.

### Reusable components

- **PlaceCard (web + mobile):** Image, name, address, distance, rating (average_rating + review_count), “Open Now” badge when `is_open_now`, “Visited” badge; uses design tokens. Place type extended with optional `average_rating`, `review_count`, `is_open_now`.
- **BottomNav:** Matches design labels and tabs: **Explore** (Home), **Map**, **Groups**, **Profile**. Web: `Layout` nav items and route `/map`; Map page full-height PlacesMap. Mobile: tab order Home, Map, Groups, Profile; MapScreen lists places (native map can be added later); Favorites removed from tab bar (still reachable via Profile/stack). Icons: Material-style labels; mobile uses symbol text (⊕, ◉, ◆, ○) until vector icons added.
- **Buttons & chips:** Web: `PrimaryButton` (primary/secondary), `FilterChip`, `SearchBar`. Mobile: `PrimaryButton`, `FilterChip`, `SearchBar` using theme tokens.

### Backend

- **i18n:** Seed translations for `places.openNow`, `places.visited`, `nav.map` (en, ar, hi).

---

## Web I18n: align with mobile (ready, gate until loaded)

**Done when:** Web I18n context uses `ready` like mobile; web app waits for initial translations before rendering routes so no raw keys flash.

### Frontend — Web

- **I18nProvider:** Replaced `loading` with `ready` in context so web and mobile share the same shape (`useI18n().ready`). `ready` is set only after initial locale and translations have loaded (single bootstrap effect: loadLanguages → resolveInitialLocale → setLocaleState → loadTranslations(initial) → setReady(true)); user-settings locale override still loads translations after setting locale.
- **App:** Added `I18nReadyGate` inside `I18nProvider`: shows a minimal splash (logo, “Pilgrimage”, spinner) until `ready` is true, then renders `LocationProvider` and `AppRoutes`. Prevents untranslated strings (translation keys) from appearing on first paint.

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
