# Web app migration to TypeScript architecture

This file contains **copy-paste-ready prompts** to migrate the Pilgrimage Tracker web app (`apps/web`) from its current structure to a TypeScript architecture with five folders: **stores**, **assets**, **components**, **lib**, **app**. Run the prompts **in order** (Phase 1 first, then Phase 2). The backend and API stay unchanged.

**Sources of truth:** [ARCHITECTURE.md](ARCHITECTURE.md), [DESIGN_FILE.html](DESIGN_FILE.html), [IMPLEMENTATION_PROMPTS.md](IMPLEMENTATION_PROMPTS.md).

**New layout under `apps/web/src/`:**
- **stores/** – Global state (auth, i18n). Use React context or Zustand.
- **assets/** – Static files (images, fonts, icons).
- **components/** – Reusable UI only (Layout, ProtectedRoute, PlaceCard, etc.).
- **lib/** – API client, types, constants, helpers (`lib/api/client.ts`, `lib/types/index.ts`).
- **app/** – App shell: App.tsx, providers, routes, and all pages under `app/pages/`.

Path alias: `@` → `./src`. Imports: `@/stores/...`, `@/lib/api/...`, `@/components/...`, `@/app/...`, `@/assets/...`.

---

## Phase 1: Remove old structure and scaffold new architecture

### Prompt 1 – Remove old architecture and create new TS scaffold

Copy-paste the following into your executor (e.g. Cursor).

---

**Task:** Remove all existing code under `apps/web/src/` except `vite-env.d.ts` and `index.css`. Do not delete `index.html`, `vite.config.ts`, or `package.json`. Then create the new TypeScript architecture and wire the app so it runs with placeholder pages.

**Steps:**

1. **Delete** everything under `apps/web/src/` except:
   - `vite-env.d.ts`
   - `index.css` (keep or recreate minimal global CSS with Tailwind; ensure design tokens from DESIGN_FILE – primary, background-light, text-main, font-display Lexend, safe-area utilities).

2. **Create** these folders under `apps/web/src/`:
   - `stores/`
   - `assets/`
   - `components/`
   - `lib/`
   - `app/`
   - `app/pages/`

3. **lib/** – Move and adapt existing logic into TypeScript:
   - `lib/api/client.ts`: Move/rewrite the current `src/api/client.ts` so all API functions (auth, places, users, groups, reviews, check-ins, favorites, notifications, languages, translations, settings) live here. Use `lib/types` for types. Base URL from `import.meta.env.VITE_API_URL ?? ''`. Attach JWT from localStorage to authenticated requests. All code in TypeScript.
   - `lib/types/index.ts`: Move/rewrite the current `src/types/index.ts` so all shared types (User, Place, PlaceDetail, Religion, Review, CheckIn, Group, LeaderboardEntry, ActivityItem, Notification, UserSettings, API params/responses) live here. Use entity codes (user_code, place_code, etc.) per ARCHITECTURE.
   - `lib/constants.ts`: Export constants such as route path strings (e.g. `/home`, `/places/:placeCode`) if useful, and any other app-wide constants.

4. **app/** – App shell and routing:
   - `app/providers.tsx`: Compose and export AuthProvider and I18nProvider. AuthProvider: store user and token (e.g. in React context); expose login, register, logout, loadUser (from JWT); read token from localStorage on init and optionally fetch GET /api/v1/users/me. I18nProvider: fetch languages and translations from backend; store locale (from user settings or localStorage key `pilgrimage-locale`); expose locale, setLocale, t(key), languages, ready; when locale is `ar`, set `document.documentElement.dir = 'rtl'` and `lang="ar"`.
   - `app/routes.tsx`: Define all Routes. Public routes (no Layout): `/` (Splash), `/login`, `/register`, `/forgot-password`, `/reset-password`, `/select-path` (wrap in ProtectedRoute). Authenticated routes (wrap in Layout then ProtectedRoute): `/home`, `/places/:placeCode`, `/places/:placeCode/review`, `/profile`, `/profile/edit`, `/favorites`, `/groups`, `/groups/new`, `/groups/:groupCode`, `/join`, `/settings`, `/notifications`. Catch-all `*` → Navigate to `/`. Use React Router v6. Import Layout and ProtectedRoute from `@/components`, page components from `app/pages/`.
   - `app/App.tsx`: Render AuthProvider and I18nProvider (from `app/providers.tsx`), then a Router (BrowserRouter) with Routes from `app/routes.tsx`. No other UI.
   - `app/pages/`: Create one placeholder page component per route (e.g. Splash, Login, Register, ForgotPassword, ResetPassword, SelectPath, Home, PlaceDetail, WriteReview, Profile, EditProfile, Favorites, Groups, CreateGroup, GroupDetail, JoinGroup, Settings, Notifications). Each placeholder renders a simple heading with the page name (e.g. "Splash", "Home") so every route resolves. Export them from `app/pages/index.ts` or import directly in routes.

5. **components/** – Shell UI:
   - `components/Layout.tsx`: Responsive layout: desktop header (logo, nav links to Home, Favorites, Groups, Notifications, Profile) and mobile bottom nav (Explore, Saved, Pilgrimage/Groups, Profile). Use `useLocation()` for active state. Main content area with safe-area padding and bottom padding for mobile nav. Use Tailwind and design tokens; Material Icons/Symbols; i18n via context for labels.
   - `components/ProtectedRoute.tsx`: If user is not loaded (loading), show a loading state. If no user, redirect to `/login` with `state={{ from: location }}`. Otherwise render children.

6. **stores/** (optional if using context in providers): If you prefer a dedicated store layer, add `stores/authStore.ts` and/or `stores/i18nStore.ts` and use them from providers. Otherwise keep auth and i18n inside `app/providers.tsx` as context. Either way, auth and i18n must be available to the app.

7. **Entry:** Update `main.tsx` so it renders the root from `@/app/App` (e.g. `createRoot(...).render(<App />)` with StrictMode if desired). Ensure `index.css` is imported in `main.tsx`.

8. **Vite:** Keep `vite.config.ts` with alias `@` → `./src`. No path changes needed for build.

**Done when:** Running `npm run dev` (or equivalent) from `apps/web` starts the app; every route renders a placeholder (no 404); API client and types are under `lib/`; auth and i18n state work via providers (or stores); Layout and ProtectedRoute are used correctly; the app builds without TypeScript errors.

---

## Phase 2: Recreate all screens and flows

Run these prompts after Phase 1 is complete. Each prompt assumes the new folder structure and that `lib/api`, `lib/types`, `app/providers`, `app/routes`, and `components/Layout` and `components/ProtectedRoute` exist.

---

### Prompt 2 – Public and onboarding pages

**Task:** Implement all public and onboarding pages in `app/pages/` so users can land on Splash, register or log in, complete or skip Select Path, and reach Home. Use DESIGN_FILE for layout and copy.

**Steps:**

1. **Splash** (`app/pages/Splash.tsx`): Match DESIGN_FILE “Splash & Welcome Screen”. Logo, tagline “Discover, Visit, and Track Sacred Spaces”, “Get Started” (Link to `/register`), “Have an account? Sign In” (Link to `/login`). If the user is already logged in (from auth context), redirect to `/home` with `<Navigate to="/home" replace />`. Do not render inside Layout (route is already public).

2. **Login** (`app/pages/Login.tsx`): Email and password form; “Forgot password?” link to `/forgot-password`; submit calls auth `login()`, then navigate to `/home` (or to `location.state?.from?.pathname` if present). If user is already logged in, redirect to `/home` or from state. Use i18n `t()` for labels. Match DESIGN_FILE for layout.

3. **Register** (`app/pages/Register.tsx`): Full name, email, password, confirm password; validation (match passwords, min length); submit calls auth `register()`, then navigate to `/select-path`. Link to Login. Optional: “Or continue with” Apple/Google (buttons only). Use i18n and DESIGN_FILE.

4. **ForgotPassword** (`app/pages/ForgotPassword.tsx`): Email input, “Send reset link” button; call API forgotPassword; show success or error message. Link back to Login.

5. **ResetPassword** (`app/pages/ResetPassword.tsx`): Read token from query (e.g. `?token=...`). New password + confirm; submit call API resetPassword; on success redirect to `/login`.

6. **SelectPath** (`app/pages/SelectPath.tsx`): Protected route. Match DESIGN_FILE “Select Your Path”. Cards for Islam, Hinduism, Christianity; “Skip for now” and “Continue”. On Continue (or skip), call API to update user preferred religions (or skip without saving), then navigate to `/home`. Use i18n and DESIGN_FILE.

Use Tailwind design tokens (primary, background-light, text-main, Lexend), Material Icons/Symbols, and safe-area where needed. All copy via `t('key')` with keys that exist in backend translations.

**Done when:** User can open `/`, see Splash; click Get Started → Register → submit → Select Path → Continue → Home; or Sign In → Login → Home. Logged-in user visiting `/` or `/login` is redirected to Home. Forgot and reset password flows work.

---

### Prompt 3 – Home (list view and place cards)

**Task:** Implement the Home page in `app/pages/Home.tsx` with list view, place cards, and basic search/filter UI. Map view is not required in this prompt.

**Steps:**

1. Fetch places using `lib/api` (e.g. `getPlaces`) with user’s preferred religions from auth/settings and optional lat/lng (from browser geolocation or default). Use React Query or similar for loading/error state.

2. Layout: Match DESIGN_FILE “Explore Sacred Places”. Header with greeting (e.g. “Welcome, [name]” or religion-specific greeting), List/Map toggle (list only for now; map in a later prompt). Search bar and filter chips (e.g. Nearby, Historical, place type). Wire search and filters to query params and refetch.

3. List: Render place cards (image, name, location, distance, rating if available, “Visited” badge if user has checked in). Each card links to `/places/:placeCode`. Extract a reusable `PlaceCard` in `components/PlaceCard.tsx` if useful.

4. Use design tokens, Lexend, Material Icons. Responsive: cards stack on mobile, grid on desktop. Bottom nav is already in Layout.

**Done when:** Home shows places for the user; cards link to place detail; search and filter chips are present and update the list (or query params).

---

### Prompt 4 – Place detail (religion-specific)

**Task:** Implement `app/pages/PlaceDetail.tsx` with hero, opening times, religion-specific content, and reviews preview. Match DESIGN_FILE for Place Details (Mosque, Hindu Temple, Christian Church).

**Steps:**

1. Fetch place by `placeCode` and reviews for the place via `lib/api`. Handle 404 and loading state.

2. Common UI: Hero image and name; back button; opening times (today + weekly if available); distance; “About” description; sticky bottom bar: “Get Directions” (link or external map), “Check-in Here” (button; check-in flow in next prompt), “Add to favorites” (toggle). Use i18n and DESIGN_FILE styling.

3. Religion-specific sections (branch on `place.religion`):
   - **Hinduism:** Main Deities (e.g. deity cards), Temple Info (architecture, next festival, dress code).
   - **Islam:** Prayer times, capacity, facilities (e.g. ablution).
   - **Christianity:** Denomination, service times, notable features.

4. “Visitor Reviews”: Show average rating and a few recent reviews (avatar, name, date, rating, text). “View all” link to full reviews on same page or a dedicated route if you have one. “Write a review” link to `/places/:placeCode/review`.

5. Support dark mode if DESIGN_FILE specifies it for this screen.

**Done when:** Place detail loads for a given placeCode; opening times and religion-specific content render correctly; reviews preview and “Write a review” link work.

---

### Prompt 5 – Check-in and profile

**Task:** Implement check-in from place detail, and implement Profile and Edit Profile pages.

**Steps:**

1. **Check-in:** From place detail, “Check-in Here” opens a modal or a small screen: optional note, optional photo (stub if needed). Submit calls `POST /api/v1/places/:placeCode/check-in` via `lib/api`. On success show “You’ve checked in at [name]” and close or go back. Ensure home list shows “Visited” badge for places the user has checked in (use user check-ins or place response if backend includes it).

2. **Profile** (`app/pages/Profile.tsx`): Match DESIGN_FILE “User Profile & Stats”. Avatar, display name. Stats: e.g. places visited, check-ins this year (from GET users/me/stats). Sections: My Check-ins (list or link), Favorite Places (link to `/favorites`), Group Activity (link to `/groups`). Edit profile link to `/profile/edit`. Use Layout.

3. **Edit Profile** (`app/pages/EditProfile.tsx`): Form for avatar (upload stub or URL), display name, religion (dropdown), optional bio. Save calls PATCH users/me (and religion if separate). Cancel navigates back to profile.

**Done when:** User can check in from place detail; home cards show “Visited” where applicable; Profile shows stats and links; Edit Profile updates name and religion.

---

### Prompt 6 – Groups

**Task:** Implement Groups list, Create group, Group detail (leaderboard and activity), and Join group. Use `lib/api` for all group endpoints.

**Steps:**

1. **Groups list** (`app/pages/Groups.tsx`): Match DESIGN_FILE “My Pilgrimage Groups”. “My Groups” header; list of groups with name, member count, progress (e.g. X places visited); “Last active”. FAB or button “Create group” → `/groups/new`. Tapping a group navigates to `/groups/:groupCode`.

2. **Create group** (`app/pages/CreateGroup.tsx`): Form: name, description, optional is_private. Submit POST /api/v1/groups; on success redirect to group detail. Show “Invite” (copy link or share) using invite_code.

3. **Group detail** (`app/pages/GroupDetail.tsx`): Match “Group Leaderboard & Activity”. Header with group name and member count; “Invite” button. Top 3 leaderboard (podium style); full list with “View Full Leaderboard”. “Recently Visited” / activity feed (e.g. “Amira K. checked in at Golden Temple”). Use GET leaderboard and GET activity from `lib/api`.

4. **Join group** (`app/pages/JoinGroup.tsx`): From invite link (e.g. `/join?code=xxx` or path with code), call POST join; redirect to group detail on success.

**Done when:** User can create a group, see list, open detail with leaderboard and activity, and join via invite link.

---

### Prompt 7 – Favorites, Settings, Notifications

**Task:** Implement Favorites page, Settings page, and Notifications page. Wire place detail “Add to favorites” and Settings to API and i18n.

**Steps:**

1. **Favorites** (`app/pages/Favorites.tsx`): List of saved places (same card style as home). Fetch GET users/me/favorites. Remove from favorites (DELETE). On place detail, “Add to favorites” toggles saved state (POST/DELETE place favorite) and updates UI.

2. **Settings** (`app/pages/Settings.tsx`): Match DESIGN_FILE “Settings screen”. Language (dropdown from API languages; save to user settings and refetch translations / set locale). Theme (light/dark/system); persist in localStorage and apply to document (e.g. class or data attribute). Notifications (check-in reminders, group updates) if in API. About and Terms links; Delete account (confirmation; call backend if implemented).

3. **Notifications** (`app/pages/Notifications.tsx`): List from GET notifications; each item: icon, title, body, time. Mark as read (PATCH) on open or via button. Empty state when none.

4. Ensure bottom nav “Saved” goes to `/favorites`; settings linked from profile; notifications icon in header (optional unread badge).

**Done when:** User can add/remove favorites and see them on Favorites; Settings saves language and theme; Notifications list loads and items can be marked read.

---

### Prompt 8 – Write review and share

**Task:** Implement Write Review page and share flows for place and group invite.

**Steps:**

1. **Write review** (`app/pages/WriteReview.tsx`): Match DESIGN_FILE “Write a Review”. Form: star rating, optional title, body, optional photos (stub if needed). Submit POST /api/v1/places/:placeCode/reviews; on success redirect to place detail. Show validation errors. If backend supports PATCH/DELETE for own review, add Edit/Delete on place detail for the current user’s review.

2. **Place detail:** “Visitor Reviews” section: “View all” links to full list (same page or route). “Write a review” for users who haven’t reviewed (or “Edit” if they have). Show aggregate rating and recent reviews.

3. **Share:** “Share” on place detail, check-in success, or group invite: use Web Share API when available (`navigator.share`) with title and URL; fallback copy link to clipboard. URLs: place `/places/:placeCode`, group invite `/join?code=xxx` (or equivalent).

**Done when:** User can submit (and edit/delete if supported) a review; place detail shows reviews and aggregate; share uses Web Share or copy link.

---

### Prompt 9 – Map view and search/filters

**Task:** Add map view on Home; ensure search and filters apply to both list and map.

**Steps:**

1. **Map view:** On Home, when “Map” is selected in the List/Map toggle, show a map (Mapbox GL JS or Leaflet) with pins for the same places returned by the list. Center on user location if allowed; otherwise default center. Pins styled by place_type or religion if desired. Click pin: show small preview (name, distance); “View details” or click preview navigates to `/places/:placeCode`.

2. **Search and filters:** Ensure the search bar and filter chips (from Prompt 3) apply to the same query used for both list and map. Refetch when params change; list and map show the same data.

3. Match DESIGN_FILE “Map Discovery View” for map styling and faith-specific pins if specified.

**Done when:** List and map show the same filtered places; search and filters update both views; map pins open preview then place detail.

---

### Prompt 10 – Polish

**Task:** Add empty and error states, improve responsive desktop layout, and accessibility. Optional: PWA.

**Steps:**

1. **Empty states:** For each main screen (Home, Favorites, Groups, Notifications, Profile sections), add a clear empty state with message and CTA (e.g. “No places nearby”, “Explore places”; “No groups”, “Create a group”).

2. **Error states:** For failed fetches (no network, API error), show a message and “Retry” where appropriate. Use React Query or similar for retry and error UI.

3. **Responsive desktop:** On large viewports, use multi-column grids for lists, optional sidebar for nav, max-width content area. Ensure place detail and profile look good on desktop.

4. **Accessibility:** Focus order, aria-labels for icon-only buttons, contrast. Bottom nav and key actions keyboard and screen-reader friendly.

5. **Optional:** PWA manifest and service worker (e.g. Vite PWA plugin) for “Add to home screen” and offline shell.

**Done when:** All main screens have appropriate empty and error UIs; desktop layout is polished; accessibility basics in place.

---

## After running the prompts

1. **Docs:** Update [ARCHITECTURE.md](ARCHITECTURE.md) Section 6 to document the app’s new layout (`stores/`, `assets/`, `components/`, `lib/`, `app/`). Update [apps/web/README.md](apps/web/README.md) Structure section. Add an entry to [CHANGELOG.md](CHANGELOG.md) for the migration. Update [.cursor/rules/schema-api-codes.mdc](.cursor/rules/schema-api-codes.mdc) globs to `apps/web/src/lib/types/**/*` and `apps/web/src/lib/api/**/*` if those paths are used.
2. **Verify:** Run the app and backend; walk through Splash → Register → Select Path → Home → Place detail → Check-in → Profile → Favorites → Groups → Settings → Notifications and Write review. Ensure all routes and features work.
