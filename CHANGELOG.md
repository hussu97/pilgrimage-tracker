# Changelog

All notable changes from implementing [IMPLEMENTATION_PROMPTS.md](IMPLEMENTATION_PROMPTS.md) and project process are documented here.

---

## UI Fixes & Polish (2026-02-20)

### Frontend (web)
- **Carousel fix** — Corrected `translateX` formula in `PlaceCard` and `PlaceDetail` hero: was `-${idx * 100}%` (relative to strip width = N × container), now `-${idx * (100/N)}%` so each step moves exactly one container width. Auto-swipe and drag-to-swipe now work correctly on desktop and mobile web.
- **Groups page** — Removed duplicate "Create group" button from the empty state; the floating `+` FAB is the sole entry point. Replaced colored shadow utilities (`shadow-blue-100/200`) on the featured group card, FAB, and visitor register button with clean neutral shadows (`shadow-md`, `shadow-lg`) to eliminate the blue glow artifact in light and dark mode.

### Frontend (mobile)
- **Carousel fix** — Replaced `FlatList` (with `width: '100%'` items that collapsed to 0 px in horizontal mode) with `ScrollView` + `onLayout` in both `PlaceCard` and `PlaceDetailScreen` hero. Images now render correctly at the measured container width; `scrollTo({ x: idx * width })` drives auto-swipe. The FlatList scroll-position indicator is also gone.
- **Carousel dot indicators removed** — Removed the dot/dash position overlay from `PlaceCard` and `PlaceDetailScreen` hero on both mobile app and mobile web.
- **Groups screen** — Removed duplicate "Create group" button from the empty state; the floating `+` FAB is the sole entry point.

---

## P2 Features: Photo Gallery, Distance Units & Social Sharing (2026-02-20)

### Backend
- **OG share endpoint** — New `GET /share/places/{place_code}` route (no auth required) returns an HTML page with Open Graph meta tags (`og:title`, `og:description`, `og:image`, `og:url`, `twitter:card`) and a JS redirect to the SPA. Registered at `/share` prefix outside `/api/v1/`.
- **Config** — Added `FRONTEND_URL` env var (default `http://localhost:5173`) to `config.py` for OG redirect target.
- **Tests** — Added `server/tests/test_share.py` (2 tests: 200 HTML with `og:title`, 404 for bad code).

### Frontend (web)
- **Place photo gallery** — `PlaceCard.tsx` (regular variant): `IntersectionObserver` gates auto-swipe (3 s interval); `onMouseEnter/Leave` also activates on desktop; CSS flex strip with `translateX` animation; drag-to-swipe (≥40 px threshold) with `didDragRef` preventing spurious `<Link>` navigation; dot indicators.
- **Place photo gallery** — `PlaceDetail.tsx` hero: horizontal flex strip auto-swipes every 3 s; drag handlers (`onMouseDown/Move/Up`); dot indicators overlay at bottom.
- **Distance units** — Added `formatDistance(km, units)` to `place-utils.ts` (km/m or mi/ft); `ThemeProvider` extended with `units` + `setUnits` (persisted to `localStorage`); Profile page gains km/mi toggle row using `settings.distanceUnits` i18n key; `PlaceCard` and `PlaceDetail` now pass `units` to `formatDistance`.
- **Social sharing** — `SharePlaceButton.tsx` now builds the share URL from `${API_BASE}/share/places/${placeCode}` for rich OG preview.
- **Group sharing** — Removed redundant header share icon from `GroupDetail.tsx`; replaced invite "Copy" button with native "Share" button using `shareUrl(group.name, inviteUrl)`.
- **Tests** — Extended `apps/web/src/__tests__/utils.test.ts` with 5 `formatDistance` cases (km/m/mi/ft).

### Frontend (mobile)
- **Place photo gallery** — `PlaceCard.tsx` (regular variant): `ScrollView` + `onLayout` carousel; accepts `isActive` prop; auto-swipe timer (`setInterval` every 3 s) calls `scrollTo`; `onMomentumScrollEnd` syncs index state.
- **Place photo gallery** — `PlaceDetailScreen.tsx` hero: `ScrollView` + `onLayout` carousel auto-swipes when multiple images; parallax `Animated.Value` still drives container.
- **Active card detection** — `HomeScreen.tsx` and `FavoritesScreen.tsx` use `viewabilityConfig` + `onViewableItemsChanged` to track visible index and pass `isActive={index === activeIndex}` to `PlaceCard`.
- **Distance units** — New `apps/mobile/src/lib/utils/place-utils.ts` with `formatDistance`; `ThemeProvider` extended with `units` + `setUnits` (persisted to `AsyncStorage`); Profile screen gains km/mi toggle pills; `PlaceCard` and `PlaceDetailScreen` use unit-aware distance.
- **Social sharing** — `PlaceDetailScreen.tsx` share now uses `${API_BASE}/share/places/${placeCode}` URL with rating in the title.
- **Group sharing** — Removed header share icon from `GroupDetailScreen.tsx`.
- **Tests** — Extended `apps/mobile/src/__tests__/utils.test.ts` with 5 `formatDistance` cases (km/m/mi/ft).

### Docs
- Added `settings.distanceUnits`, `settings.km`, `settings.miles` translation keys to `seed_data.json` (en/ar/hi).

---

## P1 Roadmap Tasks: Quality, Accessibility & Monitoring (2026-02-20)

### Backend
- **Structured logging** — Replaced all `print()` calls with Python `logging` module across `main.py`, `auth.py`, `places.py`, `seed.py`, `backfill_timezones.py`, and `cleanup_orphaned_images.py`. Configured `logging.basicConfig` in `main.py`. Password reset links now log at `DEBUG` level.
- **Bare except clauses** — Fixed two silent `except Exception: pass` blocks in `auth.py` visitor-merge flows; now log with `logger.warning(..., exc_info=True)`.
- **Alembic downgrade** — Confirmed `downgrade()` implemented in `0001_initial.py` and `0002_add_visitor.py`.

### Frontend (web)
- **i18n** — Removed all hardcoded UI strings: rating labels in `WriteReview.tsx`, notification type labels in `Notifications.tsx`, error boundary strings in `ErrorBoundary.tsx`, weekday labels in `CheckInsList.tsx` (now `Intl.DateTimeFormat` locale-aware), progress level in `Groups.tsx`, share message in `CreateGroup.tsx`. Added 15 new translation keys to `seed_data.json` (en/ar/hi).
- **Dark mode** — Fixed `dark:bg-gray-800` → `dark:bg-dark-surface` in `PlacesMap.tsx`; fixed button class in `ErrorBoundary.tsx` to use `bg-soft-blue/hover:bg-input-border`.
- **Tests** — Added `apps/web/src/__tests__/share.test.ts` (6 tests covering `shareUrl()`: navigator.share, relative URLs, AbortError, clipboard fallback).
- **Accessibility** — `Modal.tsx`: `role="dialog"`, `aria-modal`, `aria-labelledby/useId`, Escape key handler. `Layout.tsx`: skip-to-content link (`sr-only` / focusable) and `id="main-content"` on main element. `ErrorBoundary.tsx`: `role="alert"` and `aria-live="assertive"`.
- **Error tracking** — Installed `@sentry/react`; initialized in `main.tsx` with `VITE_GLITCHTIP_DSN` env var (disabled when unset); `ErrorBoundary.componentDidCatch` calls `Sentry.captureException`. Documented `VITE_GLITCHTIP_DSN` in `.env.example` and `README.md`.

### Frontend (mobile)
- **i18n** — Removed hardcoded relative-time and progress-level strings from `GroupsScreen.tsx`; removed "Something went wrong"/"Try again" from `ErrorBoundary.tsx`. All now use `t()` with existing translation keys + `.replace('{count}', n)` interpolation.
- **Dark mode** — `PlaceCard.tsx` now uses `useTheme()` / dynamic colors for card background, borders, text, rating chip bg, and image fallback.
- **Tests** — Added `apps/mobile/src/__tests__/share.test.ts` (8 tests covering `shareUrl()` and `openDirections()` for iOS/Android).
- **Accessibility** — `PlaceCard.tsx`: added `accessibilityRole="button"` and `accessibilityLabel` to all `TouchableOpacity` elements.
- **Error tracking** — Added GlitchTip/Sentry placeholder comment in `ErrorBoundary.componentDidCatch`; documented native setup in `apps/mobile/README.md`.
- **Offline banner** — Installed `@react-native-community/netinfo`; created `OfflineBanner.tsx` using `useNetInfo()` with dark mode support; wired into `App.tsx`; uses `t('common.noInternet')`.

### Docs
- Added `common.skipToContent` translation key (en/ar/hi) to `seed_data.json`.
- Updated `ROADMAP.md` to mark all completed P1 tasks as `[x]`.

---

## Dark Mode Compliance & UI Polish (2026-02-20)

Full dark mode compliance sweep across all mobile screens and components, plus targeted web UI polish fixes.

### Frontend (web)
- **`Splash.tsx`** — Added `dark:bg-dark-bg`, `dark:text-white`, `dark:text-dark-text-secondary` to content panel and headings.
- **`FilterSheet.tsx`** — Added dark variants to inactive filter option buttons (`dark:border-dark-border dark:bg-dark-surface`), icon containers (`dark:bg-dark-bg dark:text-dark-text-secondary`), radio circles (`dark:border-dark-border`), and clear button (`dark:border-dark-border dark:text-white dark:hover:bg-dark-bg`).
- **`PlaceCard.tsx`** — Added dark variants to rating badge (`dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800/30`) and distance badge border (`dark:border-dark-border`).
- **`Layout.tsx`** — Bottom nav conditionally hidden on non-main pages (`/home`, `/groups`, `/profile`) so it no longer overlaps action buttons on `/places/:code` and similar detail pages.
- **`Favorites.tsx`** — Added back button (`navigate(-1)`); removed redundant "Saved" section label.

### Frontend (mobile)
- **`FilterChip`** — Converted static `StyleSheet` to `makeStyles(isDark)`; chip background/border/label colors now dark-aware.
- **`FilterChipsList`** — Forwards `isDark` prop to `FilterChip` child.
- **`TimingCircle`** — Added `isDark` prop; non-current circle background and border colors are now dark-aware; subtitle uses dark text token.
- **`DeityCircle`** — Added `isDark` prop; circle background, name, and subtitle text all dark-aware.
- **`PlaceTimingsCarousel`** — Added `isDark` prop; dark `sectionTitle` color; forwards `isDark` to `TimingCircle` and `DeityCircle`.
- **`PlaceSpecificationsGrid`** — Converted to `makeStyles(isDark)`; spec card bg/border, label, and value text all dark-aware.
- **`PlaceReviewsList`** — Added `isDark` prop + `makeStyles(isDark)`; review card bg/border, all text colors dark-aware.
- **`ErrorBoundary`** — Class component (can't use hooks); uses `Appearance.getColorScheme()` for runtime dark bg, title/message text, and error icon tint.
- **`SplashScreen`** — Converted to `makeStyles(isDark)` via `useTheme()`; spinner background now uses `darkBg` in dark mode.
- **`EditProfileScreen`** — Converted static `StyleSheet` to `makeStyles(isDark)`; container, inputs, religion row tiles, and all text dark-aware.
- **`ForgotPasswordScreen`** — Converted to `makeStyles(isDark)`; back button, success icon container, input, container background dark-aware.
- **`JoinGroupScreen`** — Converted to `makeStyles(isDark)`; container (was `surfaceTint`), input, preview box, and text dark-aware.
- **`ResetPasswordScreen`** — Converted to `makeStyles(isDark)`; container, inputs, and text colors dark-aware.
- **`PlaceDetailScreen`** — Converted large static `StyleSheet` to `makeStyles(isDark)` so loading/error states render correctly in dark mode; passes `isDark` to `PlaceTimingsCarousel`, `PlaceSpecificationsGrid`, and `PlaceReviewsList`; fixed missing `PlaceTiming`/`PlaceSpecification` type imports.
- **`PlaceCard`** — "Visited" badge and "Check In" button text use `t()` translation keys instead of hardcoded English.
- **`PlaceScorecardRow`** — Rewritten with `isDark` prop and inline dynamic styles for full dark mode support.
- **`FavoritesScreen`** — Removed "Saved" section label; back button restyled to match `PlaceDetailScreen` circle button.

---

## Groups Revamp — Social Itinerary Planner & Tracker (2026-02-19)

Full groups revamp transforming the groups feature into a pilgrimage itinerary planner and tracker with shared checklists, member management, collaborative notes, and progress tracking.

### Backend
- **Schema (migration `0004_groups_revamp`)** — Added `group_code` (nullable FK) to `CheckIn`; added `cover_image_url`, `start_date`, `end_date`, `updated_at` to `Group`; new `GroupPlaceNote` model for per-place collaborative notes.
- **New endpoints** — `DELETE /groups/:code` (admin), `POST /groups/:code/leave`, `DELETE /groups/:code/members/:userCode` (admin), `PATCH /groups/:code/members/:userCode` (role change), `GET/POST /groups/:code/places/:placeCode/notes`, `DELETE /groups/:code/notes/:noteCode`, `GET /groups/:code/checklist`.
- **Checklist endpoint** — Returns ordered itinerary places with per-place check-in status, member avatars, collaborative notes, and aggregate group + personal progress percentages.
- **Group check-in** — `POST /places/:placeCode/check-in` accepts optional `group_code`; validates membership and itinerary inclusion; creates `group_check_in` notifications for other members.
- **New DB modules** — `server/app/db/group_place_notes.py` (CRUD for place notes); `get_check_ins_for_users_at_places()` batch query in `check_ins.py`.
- **Tests** — Added `TestDeleteGroup`, `TestLeaveGroup`, `TestRemoveMember`, `TestUpdateMemberRole`, `TestGroupChecklist`, `TestGroupCheckIn`, `TestUpdateGroupPath`, `TestPlaceNotes` (22 new tests, 58 total in test_groups.py).

### Frontend (web)
- **Types** — Updated `Group` (cover_image_url, start_date, end_date, path_place_codes, updated_at), `GroupMember` (is_creator), `ActivityItem` (note, photo_url, group_code); new `PlaceNote`, `ChecklistCheckIn`, `ChecklistPlace`, `ChecklistResponse`.
- **API client** — Added `deleteGroup`, `leaveGroup`, `removeGroupMember`, `updateMemberRole`, `getGroupChecklist`, `getPlaceNotes`, `addPlaceNote`, `deletePlaceNote`; updated `checkIn` / `createGroup` / `updateGroup` with new fields.
- **`PlaceSelector` component** — Multi-select place picker with search, religion filter chips, ordered selected-places list with reorder (↑↓) and remove buttons.
- **`GroupCheckInModal` component** — Modal for checking in at a specific place within a group's itinerary.
- **`CreateGroup` page** — Rewritten as multi-step wizard: Details → Places (PlaceSelector) → Review, with preserved invite-link success state.
- **`GroupDetail` page** — Rewritten as 4-tab layout (Itinerary, Activity, Leaderboard, Members); itinerary tab shows progress bars, ordered place checklist with expand/collapse, check-in modal, and per-place notes; members tab includes role badges and admin actions.
- **`EditGroup` page** — New admin-only page with PlaceSelector for managing itinerary; routed at `/groups/:groupCode/edit`.
- **Tests** — `groupUtils.ts` utility (getProgressLevel, formatRelativeTime); `groups.test.ts` (11 unit tests).

### Frontend (mobile)
- **Types & API client** — Full parity with web: same type additions and 8 new API functions.
- **`PlaceSelector` component** — FlatList-based place picker with TextInput search, religion filter chips, reorder with ↑↓ buttons.
- **`GroupCheckInSheet` component** — Bottom-sheet modal for group check-in.
- **`CreateGroupScreen`** — Multi-step wizard matching web feature parity.
- **`EditGroupScreen`** — New admin-only screen registered in navigation.
- **`GroupDetailScreen`** — Rewritten with 4-tab layout (Itinerary, Activity, Leaderboard, Members); itinerary tab with progress bars, checklist, GroupCheckInSheet, per-place notes; members tab with role management and leave/delete.
- **Tests** — `groupUtils.ts` utility; `groups.test.ts` (11 unit tests).

### i18n
- Added 36 new translation keys for en/ar/hi covering itinerary, progress, member management, notes, trip dates, and check-in flows.

---

## API Audit — Unused Endpoint Remediation (2026-02-19)

### Frontend (web)
- **`apps/web/src/lib/api/client.ts`** — Already had `refreshToken`, `logoutServer`, `authFetch` interceptor, and `updateGroup`; confirmed complete.
- **`apps/web/src/__tests__/client.test.ts`** — New: tests for `refreshToken` (happy path + error), `logoutServer` (happy path + network failure + server error), `updateGroup` (method, return value, Authorization header, error detail, fallback error).

### Frontend (mobile)
- **`apps/mobile/src/lib/api/client.ts`** — Added `refreshToken()`, `logoutServer()`, and `authFetch()` 401-retry interceptor (mirrors web). Migrated all authenticated `fetch()` calls to `authFetch()`. Added `updateGroup()` for `PATCH /api/v1/groups/{group_code}`.
- **`apps/mobile/src/app/providers.tsx`** — `logout()` now calls `api.logoutServer()` before clearing AsyncStorage, ensuring the refresh token is revoked server-side on sign-out.
- **`apps/mobile/src/__tests__/client.test.ts`** — New: tests for `refreshToken`, `logoutServer`, and `updateGroup` (same coverage as web).

## Timezone-aware datetime columns (2026-02-19)

### Backend
- **`server/app/db/models.py`** — Added `_UTCAwareDateTime` SQLAlchemy `TypeDecorator`. It wraps `DateTime(timezone=True)` (→ `TIMESTAMPTZ` in PostgreSQL) and re-attaches `UTC` on read for SQLite, so every datetime value loaded from the DB is timezone-aware. All 17 datetime columns across 10 models migrated to use the new `_TSTZ()` helper.
- **`server/app/db/store.py`** — Removed `.replace(tzinfo=None)` workarounds from `consume_password_reset` and `consume_refresh_token`; comparisons now work correctly as `aware < aware`.
- **`server/migrations/versions/0003_timestamptz_datetimes.py`** — New Alembic migration: alters all 19 datetime columns from `TIMESTAMP` to `TIMESTAMPTZ` in PostgreSQL using `AT TIME ZONE 'UTC'` CAST; skipped for SQLite (no-op dialect guard).

### Docs
- **`CLAUDE.md`** — Added rule §8 "Datetime Columns" specifying that every new or modified datetime column must use `sa_column=_TSTZ(...)`, with rationale and examples.

---

## P0 Critical Fixes (2026-02-19)

### Backend
- **`server/app/core/security.py`** — Replaced deprecated `datetime.utcnow()` with `datetime.now(UTC)` in JWT expiry computation. Added `UTC` to import.
- **`server/app/db/store.py`** — Replaced all `datetime.utcnow()` with `datetime.now(UTC)`. Added `UTC` import. For comparisons against DB-stored naive datetimes (SQLite compatibility), used `.replace(tzinfo=None)` to produce a naive UTC timestamp.
- **`server/app/db/check_ins.py`** — Replaced `datetime.utcnow()` with `datetime.now(UTC)`. Added `get_check_ins_for_users(user_codes, session)` batch query to eliminate N+1 in group listing.
- **`server/app/db/notifications.py`** — Replaced `datetime.utcnow()` with `datetime.now(UTC)`.
- **`server/app/db/models.py`** — Replaced `default_factory=datetime.utcnow` with `default_factory=lambda: datetime.now(UTC)` on all model timestamp fields.
- **`server/app/db/review_images.py`** — Replaced `datetime.utcnow()` with `datetime.now(UTC)`. Added `get_review_images_bulk(review_codes, session)` to batch-fetch review images in a single query.
- **`server/app/api/v1/auth.py`** — Replaced `datetime.utcnow()` with `datetime.now(UTC)` for password-reset expiry timestamp.
- **`server/app/main.py`** — Replaced `datetime.utcnow()` with `datetime.now(UTC)` in error-logging timestamp.
- **`server/app/db/groups.py`** — Added `get_members_bulk(group_codes, session)` to batch-fetch group members across all groups in a single query, eliminating N+1 in group listing.
- **`server/app/db/places.py`** — Added `get_places_by_codes(place_codes, session)` to batch-fetch multiple places in a single query.
- **`server/app/api/v1/groups.py`** — Refactored `list_groups` to use batch queries: fetches all members, all check-ins, and all path places in 3 queries total instead of 3+ queries per group, eliminating the N+1 pattern.
- **`server/app/api/v1/users.py`** — Refactored `get_my_favorites` to use `get_places_by_codes` + `get_images_bulk`, eliminating per-place individual queries.
- **`server/app/api/v1/places.py`** — Refactored `get_place_reviews` to use `get_review_images_bulk`, fetching all review images in one query instead of one per review. Removed the stub `DELETE /{place_code}` endpoint (was returning 501 Not Implemented and had no usages).
- **`server/tests/test_store.py`**, **`server/tests/test_auth_extended.py`**, **`server/tests/test_review_images.py`** — Updated to use `datetime.now(UTC)` instead of `datetime.utcnow()`.

---

## P4 Coverage 85% (2026-02-18)

### Backend
- **`server/.coveragerc`** — Raised `fail_under` 60 → 85.
- **`data_scraper/.coveragerc`** — Raised `fail_under` 60 → 85; added `omit` section to exclude untestable external-API scraper files.
- **`.github/workflows/tests.yml`** — Added `--cov=app --cov-report=term-missing` to both pytest CI steps; added `test-web` (Vitest) and `test-mobile` (Jest) jobs.
- **`server/tests/test_groups.py`** — New: full CRUD + social flow (create, list, get, update, join, invite, members, leaderboard, activity) covering `app/api/v1/groups.py` and `app/db/groups.py`.
- **`server/tests/test_groups_db_extra.py`** — New: DB-layer tests for `add_member`, `get_members`, `get_leaderboard`, `get_group_progress`, `get_activity`.
- **`server/tests/test_place_timings.py`** — New: `build_timings()` tested for Islam (prayer times), Christianity (service times), Hinduism (deities), and UTC fallback.
- **`server/tests/test_place_specifications.py`** — New: `build_specifications()` with mocked attribute definitions.
- **`server/tests/test_place_images.py`** — New: `add_image_url`, `set_images_from_urls`, `get_images`, `get_images_bulk`, `get_image_by_id`.
- **`server/tests/test_review_images.py`** — New: attach images to review, get review images, orphan cleanup (old/recent/attached).
- **`server/tests/test_reviews_api_extra.py`** — New: upload-photo endpoint (PIL JPEG/PNG), get-image endpoint, invalid type/size/dimension cases.
- **`server/tests/test_reviews_db_extra.py`** — New: external reviews, upsert, source filter, bulk aggregate ratings.
- **`data_scraper/tests/conftest.py`** — New: in-memory SQLite `test_engine`, `db_session`, `client`, and `error_client` fixtures.
- **`data_scraper/tests/test_scraper_api.py`** — New: full API coverage — data-locations (gsheet/gmaps), scraper runs (create/get/view/sync/cancel), place-type-mappings (CRUD + filters), health endpoint, exception handlers.
- **`data_scraper/tests/test_normalize_extended.py`** — New: extended pure-function tests for `normalize_to_24h`, `clean_address`, `process_weekly_hours`.

### Frontend (web)
- **`apps/web/vitest.config.ts`** — Raised all four coverage thresholds 60 → 85.
- **`apps/web/src/__tests__/imageUpload.test.ts`** — New: `validateImageFile` (type/size checks) + `compressImage` (canvas mocks — normal size, resize, ctx-null, toBlob-null, img-error, custom maxWidth).
- **`apps/web/src/__tests__/theme.test.ts`** — New: `applyTheme` (dark/light/system + localStorage), `getStoredTheme` (valid/invalid/missing), `initTheme` (applies stored theme, registers matchMedia listener). Uses in-memory localStorage mock to work with jsdom 28.

### Frontend (mobile)
- **`apps/mobile/jest.config.js`** — Raised all four coverage thresholds 60 → 85.
- **`apps/mobile/src/__tests__/imageUpload.test.ts`** — New: `validateImage` (size/dimension bounds) + `pickImages` (permission denied, cancel, assets mapped, selectionLimit) + `compressImage` (no resize, resize, quality param). Uses `jest.mock` with inline `jest.fn()` for hoisting-safe Expo mocks.
- **`apps/mobile/src/__tests__/mapBuilder.test.ts`** — New: `formatDistance` (m/km formatting, rounding) + `buildMapHtml` (center coords, Leaflet CDN, markers JSON, place name, open status).

---

## P3 Code Quality (2026-02-18)

### Backend
- **`server/app/api/deps.py`** — Added return type annotations to `get_current_user` (→ `User`) and `get_optional_user` (→ `User | None`). Added `UserDep` and `OptionalUserDep` type aliases.
- **`server/app/api/v1/users.py`, `reviews.py`, `notifications.py`, `groups.py`, `places.py`** — Replaced all 28 `Annotated[Any, Depends(get_current_user)]` occurrences with `UserDep`/`OptionalUserDep`. Removed unused `Any` and `Depends` imports.
- **`server/app/main.py`** — Added `openapi_tags` metadata for all 8 tag groups (auth, users, places, reviews, groups, notifications, i18n, visitors) and an expanded API description with auth/rate-limiting/identifier docs.
- **`server/app/api/v1/auth.py`** — Added `summary`, response error schemas (400/401/422/429), and docstrings to `/register`, `/login`, `/forgot-password`, `/reset-password`.
- **`server/app/models/schemas.py`** — Added `Field(description=...)` and `model_config json_schema_extra` examples to `RegisterBody`, `LoginBody`, `AuthResponse`, and `UserResponse`. Imported `ConfigDict` and `Field` from pydantic.
- **`server/requirements.txt`** — Added `pytest-cov>=5.0.0` and `ruff>=0.3.0`.
- **`server/pytest.ini`** — Added `--tb=short` to `addopts` and coverage usage comment.
- **`server/.coveragerc`** — New file: coverage config with `fail_under = 60`, HTML+XML reporters, source=`app`.
- **`server/pyproject.toml`** — New file: Ruff configuration (E, W, F, I, B, C4, UP rules; line-length 100).
- **`data_scraper/requirements.txt`** — Added `pytest-cov>=5.0.0` and `ruff>=0.3.0`.
- **`data_scraper/pytest.ini`** — Added `--tb=short` and coverage usage comment.
- **`data_scraper/.coveragerc`** — New file: coverage config with `fail_under = 60`.
- **`data_scraper/pyproject.toml`** — New file: Ruff configuration.

### Frontend (web)
- **`apps/web/src/__tests__/utils.test.ts`** — New: 13 tests for `cn()` utility (all input types, nesting, falsy values) and `crowdColorClass()`.
- **`apps/web/src/__tests__/imageUtils.test.ts`** — New: 3 tests for `getFullImageUrl()` (undefined, external URL, relative path).
- **`apps/web/vitest.config.ts`** — New: Vitest config with jsdom environment, `@/` path alias, v8 coverage provider, 60% threshold.
- **`apps/web/src/test/setup.ts`** — New: imports `@testing-library/jest-dom` for Vitest.
- **`apps/web/eslint.config.js`** — New: ESLint flat config with TypeScript, React, React Hooks, React Refresh, and Prettier rules.
- **`apps/web/src/lib/api/client.ts`** — Fixed `r: any` type in place list map to `Place | [Place, number]`.
- **`apps/web/package.json`** — Added `test`, `test:watch`, `test:coverage`, `lint`, `lint:fix`, `format`, `format:check` scripts. Added `vitest`, `@vitest/coverage-v8`, testing libraries, ESLint, Prettier dev dependencies.

### Frontend (mobile)
- **`apps/mobile/src/__tests__/utils.test.ts`** — New: 10 tests for `crowdColor()`, `getFullImageUrl()`, `ROUTES` constants, and storage keys.
- **`apps/mobile/jest.config.js`** — New: Jest config with jest-expo preset, AsyncStorage mock, expo winter runtime mock (`^expo/src/winter$`), 60% coverage threshold.
- **`apps/mobile/src/test/setup.ts`** — New: mocks for expo-constants and expo-haptics.
- **`apps/mobile/src/test/__mocks__/expo-winter.js`** — New: empty mock preventing expo winter runtime from loading in Jest (avoids import.meta incompatibility).
- **`apps/mobile/eslint.config.js`** — New: ESLint flat config with TypeScript, React, React Hooks, and Prettier rules.
- **`apps/mobile/src/components/places/FilterChipsList.tsx`** — Fixed `value?: any` callback param to `value?: string | boolean`.
- **`apps/mobile/package.json`** — Added test/lint/format scripts. Added jest, jest-expo, ESLint, Prettier dev dependencies.

### Docs
- **`ROADMAP.md`** — Marked 7 Code Quality tasks as complete.
- **`.prettierrc`** — New: shared Prettier config (singleQuote, trailingComma all, printWidth 100, LF).
- **`.pre-commit-config.yaml`** — New: pre-commit hooks for trailing-whitespace, end-of-file-fixer, merge-conflict detection, YAML/JSON validation, Ruff, ESLint, Prettier.
- **`scripts/gen-api-types.mjs`** — New: script to generate `api-generated.d.ts` in both apps from the running server's OpenAPI spec.
- **`package.json`** (root) — Added `gen:types` script and `openapi-typescript` dev dependency.

---

## Mobile UI Fixes + Dynamic Password Validation (2026-02-18)

### Backend
- **`server/app/api/v1/auth.py`** — Added `GET /api/v1/auth/field-rules` endpoint returning structured registration validation rules (min_length 8, require_uppercase, require_lowercase, require_digit) without authentication.
- **`server/app/db/seed_data.json`** — Fixed `auth.passwordMinLength` (was "6 characters", now "8 characters") across en/ar/hi. Added `auth.passwordRuleMinLength`, `auth.passwordRuleUppercase`, `auth.passwordRuleLowercase`, `auth.passwordRuleDigit` translation keys for all three languages.
- **`server/tests/test_auth.py`** — Added `TestFieldRules` class with 5 tests covering the new endpoint.

### Frontend (web)
- **`apps/web/src/lib/api/client.ts`** — Added `getFieldRules()` function + `PasswordRule`, `FieldRule`, `FieldRulesResponse` types.
- **`apps/web/src/app/pages/Register.tsx`** — Fetches field rules on mount; shows per-rule real-time hints below the password field (visible on focus, green tick when each rule is satisfied). Fixed client-side minLength guard from 6 → 8. Falls back to hardcoded defaults if API unavailable.

### Frontend (mobile)
- **`apps/mobile/src/lib/api/client.ts`** — Added `getFieldRules()` + `PasswordRule`/`FieldRule`/`FieldRulesResponse` types.
- **`apps/mobile/src/app/screens/GroupsScreen.tsx`** — Removed notification bell icon and `navToNotifications`; added full dark mode via `makeStyles(isDark)`.
- **`apps/mobile/src/app/screens/CreateGroupScreen.tsx`** — Replaced text back button with circular `MaterialIcons arrow-back` button matching the NotificationsScreen style; added full dark mode.
- **`apps/mobile/src/app/screens/CheckInsListScreen.tsx`** — Same circular back button upgrade; added full dark mode throughout all cards and calendar.
- **`apps/mobile/src/app/screens/FavoritesScreen.tsx`** — Added conditional circular back button in the FlatList header (visible only when `stackNav.canGoBack()`).
- **`apps/mobile/src/app/screens/PlaceDetailScreen.tsx`** — Added `useTheme`; applied dark-mode colours to card background, footer, story/description text, opening-hours card.
- **`apps/mobile/src/app/screens/WriteReviewScreen.tsx`** — Full dark mode via `makeStyles(isDark)` for container, header, text, toggle, photo controls, and success modal.
- **`apps/mobile/src/app/screens/RegisterScreen.tsx`** — Fetches field rules on mount; shows per-rule real-time hints on password field focus; fixed minLength guard from 6 → 8.

---

## Visitor Identity, Auth-Gating & Profile Redesign (2026-02-18)

### Backend

- **`server/app/db/models.py`** — Added `Visitor` and `VisitorSettings` SQLModel tables (visitor_code PK, theme/units/language/religions fields with defaults).
- **`server/app/db/store.py`** — Added `create_visitor`, `get_visitor`, `get_visitor_settings`, `update_visitor_settings`, `touch_visitor`, and `merge_visitor_into_user` store functions.
- **`server/app/models/schemas.py`** — Added `VisitorResponse`, `VisitorSettingsResponse`, `VisitorSettingsBody`. Updated `LoginBody` and `RegisterBody` to accept optional `visitor_code` for settings merge on auth upgrade.
- **`server/app/api/v1/visitors.py`** — New router: `POST /api/v1/visitors` (create), `GET /api/v1/visitors/{code}/settings`, `PATCH /api/v1/visitors/{code}/settings`.
- **`server/app/api/v1/auth.py`** — On login and register, if `visitor_code` is present, merges visitor settings into the new/existing user's settings then deletes the visitor record.
- **`server/app/db/seed_data.json`** — Added 7 translation keys across en/ar/hi: `visitor.loginRequired`, `visitor.loginRequiredDesc`, `visitor.createAccount`, `profile.logIn`, `groups.loginRequired`, `groups.loginRequiredDesc`, `auth.orContinueAsVisitor`.
- **`server/tests/test_visitors.py`** — New test file: create visitor, get/update settings, 404 for unknown, settings merge on register/login.

### Frontend (web)

- **`apps/web/src/lib/types/users.ts`** — Added `Visitor` interface.
- **`apps/web/src/lib/api/client.ts`** — Added `createVisitor`, `getVisitorSettings`, `updateVisitorSettings` (unauthenticated). Updated `LoginBody`/`RegisterBody` to accept `visitor_code`.
- **`apps/web/src/components/auth/AuthModal.tsx`** — New compact login/register modal with tab switcher; dark mode compliant.
- **`apps/web/src/components/auth/AuthGateProvider.tsx`** — New global context provider: `openAuthGate(callback, promptKey?)` — stores pending callback, opens `AuthModal`, calls callback after successful auth.
- **`apps/web/src/lib/hooks/useAuthRequired.ts`** — New hook: `requireAuth(callback, promptKey?)` wraps actions with auth-gate.
- **`apps/web/src/app/providers.tsx`** — `AuthProvider` now inits/clears visitor code via `POST /api/v1/visitors`, passes `visitor_code` on login/register, re-inits on logout. `I18nProvider` syncs language to visitor settings.
- **`apps/web/src/app/pages/Profile.tsx`** — Removed `LoginLanding` splash. Visitors see greeting card + preferences + login/create-account buttons; authenticated users see stats, account section, and logout.
- **`apps/web/src/app/pages/Register.tsx`** — Removed religion chip selector and post-registration `updateSettings` call.
- **`apps/web/src/app/pages/Login.tsx`** — Added back/close button.
- **`apps/web/src/app/pages/Groups.tsx`** — Visitors see a login CTA empty state instead of the groups list.
- **`apps/web/src/app/pages/PlaceDetail.tsx`** — Check-in and favorite actions now wrapped with `requireAuth()`; visitors are prompted to log in before the action fires.
- **`apps/web/src/app/routes.tsx`** — Removed `ProtectedRoute` from `/groups` route.

### Frontend (mobile)

- **`apps/mobile/src/lib/types/users.ts`** — Added `Visitor` interface.
- **`apps/mobile/src/lib/api/client.ts`** — Added `createVisitor`, `getVisitorSettings`, `updateVisitorSettings`.
- **`apps/mobile/src/lib/hooks/useAuthRequired.ts`** — New hook: `requireAuth(callback, promptKey?)`.
- **`apps/mobile/src/components/auth/AuthBottomSheet.tsx`** — New `AuthBottomSheetProvider` + `useAuthGate` hook using `@gorhom/bottom-sheet`. Compact login/register tab switcher; pending callback fired after successful auth.
- **`apps/mobile/src/app/providers.tsx`** — `AuthProvider` inits visitor code via AsyncStorage + `POST /api/v1/visitors`, passes `visitor_code` on login/register, re-inits on logout. `I18nProvider` syncs language to visitor settings via `VISITOR_KEY`.
- **`apps/mobile/src/app/screens/ProfileScreen.tsx`** — Removed `LoginLanding` component. Visitor greeting card + preferences section for all users; account section + logout only for authenticated users; visitor gets login/create-account buttons.
- **`apps/mobile/src/app/screens/RegisterScreen.tsx`** — Removed religion chip selector and post-registration `updateSettings` call. Fixed back navigation to use `canGoBack()`.
- **`apps/mobile/src/app/screens/LoginScreen.tsx`** — Fixed back button to use `canGoBack() ? goBack() : navigate('Main')`.
- **`apps/mobile/src/app/screens/PlaceDetailScreen.tsx`** — Check-in and favorite actions now wrapped with `requireAuth()`.
- **`apps/mobile/src/app/screens/GroupsScreen.tsx`** — Visitors see a login CTA empty state; authenticated users see full groups list.
- **`apps/mobile/src/app/App.tsx`** — Added `GestureHandlerRootView`, `BottomSheetModalProvider`, and `AuthBottomSheetProvider` to root.
- **`apps/mobile/babel.config.js`** — Added `react-native-reanimated/plugin` (required by `@gorhom/bottom-sheet`).

---

## Place Card Redesign & Status Pill Unification (2026-02-18)

### Frontend (web)

- **`PlaceCardUnified.tsx`** — Full rewrite: full-bleed 280px image, glass panel overlay at the bottom with name/address/distance/rating/check-in button. Removed separate card body (name, type footer, arrow button). Status pill now renders all three states (open/closed/unknown) using `badge-*-glass` CSS classes with coloured dots.
- **`index.css`** — Reduced `badge-open-glass`, `badge-closed-glass`, `badge-unknown-glass` opacity from 0.85 → 0.3 and updated border colours to match mobile detail screen style. Improves `PlaceDetail.tsx` hero badges as a side-effect.

### Frontend (mobile)

- **`PlaceCard.tsx`** — List-view card badges updated to semi-transparent glass style matching `PlaceDetailScreen` hero. Open dot changed from white to `#4ade80`; closed badge gains a `#f87171` dot. Removed `overlayTop`/`overlayBottom` dark overlays — glass panel reads cleanly over images without them.

---

## GCP Auto-Deploy Workflow (2026-02-18)

### Infrastructure

- **`.github/workflows/deploy.yml`** — New GitHub Actions workflow that runs on every push to `main`:
  1. Runs server `pytest` and web `tsc + vite build` in parallel as a gate.
  2. On success, deploys API to Cloud Run (build → push to Artifact Registry → `gcloud run deploy`).
  3. On success, deploys web to Firebase Hosting (`npm run build` → `firebase-tools deploy`).
  - Uses `concurrency` group to cancel stale in-flight deploys on rapid pushes.
  - Required GitHub secrets: `GCP_SA_KEY` (service account JSON), `VITE_API_URL`, `FIREBASE_TOKEN`.

### Docs

- **`PRODUCTION.md` Plan 3, Step 6a** — Updated Firebase init note: "Set up automatic builds with GitHub: No" now references `deploy.yml` for clarity.

---

## Seed Split: System vs Demo Data + Reset CLI (2026-02-17)

### Backend

- **`server/app/db/seed.py`** — Split `run_seed()` into two focused functions:
  - `run_seed_system()` — seeds only reference/system data (languages, translations, attribute definitions). Idempotent, safe on every startup.
  - `run_seed_demo()` — seeds demo records (places, place images, users, user settings, groups, group members, notifications, password resets). Must be called explicitly.
  - `_clear_stores()` and `__main__` block retained for direct dev use (`python -m app.db.seed` still does a full reset + seed).
- **`server/app/main.py`** — Startup now calls `run_seed_system()` only. Demo data (places, users, etc.) is never loaded automatically.
- **`server/scripts/reset_db.py`** — New CLI tool for resetting the DB:
  - `python scripts/reset_db.py` → drop all tables → run migrations → seed reference data only.
  - `python scripts/reset_db.py --with-demo-data` → same + seed demo data (places, users, groups, etc.).
- **`data_scraper/app/main.py`** — No change; geo boundaries and place-type mappings continue to seed automatically on startup.

---

## Scraper DB Persistence — All Plans (2026-02-17)

### Backend

- **`data_scraper/app/db/session.py`** — Added `SCRAPER_DB_PATH` env var support (defaults to `scraper.db` in cwd; set to `/data/scraper.db` in production with a volume mounted at `/data`).
- **`data_scraper/Dockerfile`** — Added `RUN mkdir -p /data` so the mount point exists before the volume is attached.

### Infrastructure

- **`docker-compose.yml`** — Scraper service: added `SCRAPER_DB_PATH=/data/scraper.db`, `volumes: scraper_data:/data`, and `scraper_data` named volume declaration.

### Docs

- **`PRODUCTION.md`** — Added scraper DB sections to all 3 plans: Docker (named volume), Render (Persistent Disk vs ephemeral options), GCP (Cloud Run Job recommendation + Cloud SQL path for persistent service). Added `SCRAPER_DB_PATH` to env vars reference table.

---

## GCP Deployment Guide — Step-by-Step (2026-02-17)

### Docs

- **`PRODUCTION.md` Plan 3** — Full step-by-step rewrite covering: Prerequisites (gcloud CLI, project creation, billing, API enablement), Artifact Registry setup, Cloud SQL instance + database + user creation, Secret Manager (storing + mounting JWT_SECRET / DATABASE_URL / RESEND_API_KEY), building and pushing Docker images via Cloud Build, Cloud Run deploy with Unix socket Cloud SQL connection, Firebase Hosting init + build + deploy, Cloud Run Jobs for scheduled tasks (cleanup + backfill), Cloud Scheduler wiring, GitHub Actions CI/CD with a dedicated service account, and a cost breakdown table per service.

---

## CI/CD Pipeline + Render/Vercel Deployment Guide (2026-02-17)

### Infrastructure

- **`.github/workflows/deploy.yml`** — New GitHub Actions deploy workflow: runs server tests + web typecheck/build in parallel, then on success triggers Render deploy hook (API) and Vercel CLI deploy (web). Optional scraper deploy behind `DEPLOY_SCRAPER=true` variable. Uses `concurrency` group to cancel stale deploys on rapid pushes.

### Docs

- **`PRODUCTION.md` Plan 2** — Full rewrite with step-by-step instructions: Neon DB creation, Render Web Service setup, env var tables with exact keys, Vercel project config, deploy hook retrieval, GitHub Actions secrets/variables setup, pipeline diagram, scheduled job options (Render Cron vs GitHub Actions).

---

## Production Deployment Setup (2026-02-17)

### Docs

- **`PRODUCTION.md`** — Full rewrite: corrected CORS format (space-separated), added all missing env vars (`JWT_EXPIRE`, `REFRESH_EXPIRE`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESET_URL_BASE`, `SCRAPER_TIMEZONE`), documented `backfill_timezones` job, added mobile production checklist (bundle IDs, EAS submit), updated Python base image to `python:3.12-slim`, added Docker quick-start guide, added complete env var reference table.
- **`.env.example`** — New root-level env file for use with `docker-compose.yml`.

### Backend

- **`server/Dockerfile`** — New: `python:3.12-slim`, installs `requirements.txt`, runs uvicorn on `${PORT:-3000}`.
- **`data_scraper/Dockerfile`** — New: `python:3.12-slim`, runs uvicorn on `${PORT:-8001}`.

### Frontend (web)

- **`apps/web/Dockerfile`** — New: multi-stage (Node 20 build → nginx 1.27 serve); `VITE_API_URL` passed as build arg.
- **`apps/web/nginx.conf`** — New: SPA routing (`try_files … /index.html`), aggressive static asset caching.

### Infrastructure

- **`docker-compose.yml`** — New: wires `db` (Postgres 15), `api`, `web`, and optional `scraper` (behind `--profile scraper`); includes health-check dependency ordering.

---

## P4 Screen-by-Screen Design Parity: Final Items (2026-02-17)

### Frontend (web)

- **`apps/web/src/app/pages/Register.tsx`** — Added `arrow_back` back-link to `/login` at top-left; added password hint text (`auth.passwordMinLength`) below password field.
- **`apps/web/src/app/pages/CheckInsList.tsx`** — `CheckInCard`: container height fixed at `h-32`, thumbnail enlarged to `w-24 h-24`, rating badge overlay added inside thumbnail (conditional on `place.average_rating`).
- **`apps/web/src/lib/types/places.ts`** — Added `average_rating?: number` to the embedded `place` shape on `CheckIn`.

### Frontend (mobile)

- **`apps/mobile/src/app/screens/LoginScreen.tsx`** — Replaced `‹` text char with `MaterialIcons` `arrow-back` (20 px) in back button; replaced `✦` text char with `MaterialIcons` `auto-awesome` (24 px) as logo icon.
- **`apps/mobile/src/app/screens/RegisterScreen.tsx`** — Same icon fixes as Login; added password hint text (`auth.passwordMinLength`) below password field.
- **`apps/mobile/src/app/screens/CheckInsListScreen.tsx`** — Visit card height fixed at 128, thumbnail enlarged to 96×96, rating badge overlay (text `★ N.N`) added inside thumbnail for all three card lists.
- **`apps/mobile/src/lib/types/places.ts`** — Added `average_rating?: number` to the embedded `place` shape on `CheckIn`.

### Docs

- **`ROADMAP.md`** — Checked off all three remaining P4 screen items: Place Detail, Sign In/Sign Up, Check-ins History.

---

## P4 Web/Mobile Parity: Dark Mode & i18n Audit (2026-02-17)

### Backend

- **`server/app/db/seed_data.json`** — Added ~51 new translation keys across EN, AR, and HI:
  - `reviews.*`: confirmDelete, selectRating, maxPhotos, invalidImage, photoPermissionDenied, uploadFailed, starsAccessibility
  - `places.*`: missingCode, notFound, checkedInDate, checkInFailed, tryAgain
  - `common.*`: backToHome, home, visitor, share, copy, copied, unexpectedError, timeJustNow/minutesAgo/hoursAgo/daysAgo, distanceMeters/Km, monday–sunday (7 day names)
  - `groups.*`: groupCreated, shareInviteLink, goToGroup, nameLabel, descriptionLabel, privateGroup, invite, places, viewFullLeaderboard, noLeaderboardData, recentlyVisited, noRecentActivity, checkedInAt, created, level, missingGroup, groupNamePlaceholder, descriptionPlaceholder

### Frontend (web)

- **`apps/web/src/app/pages/ResetPassword.tsx`** — Fixed wrong dark tokens: `dark:bg-gray-900` → `dark:bg-dark-bg`, `dark:bg-gray-800` → `dark:bg-dark-surface`, `dark:text-gray-400` → `dark:text-dark-text-secondary`.
- **`apps/web/src/app/pages/SelectPath.tsx`** — Added full dark mode (previously none); replaced inline gradient `style={}` with Tailwind `bg-gradient-to-b` + `dark:bg-dark-bg` classes.
- **`apps/web/src/app/pages/PlaceDetail.tsx`** — Fixed 6 hardcoded English strings via `t()`: confirmDelete, visitor, checkedInDate, missingCode, backToHome (×2), notFound.
- **`apps/web/src/app/pages/WriteReview.tsx`** — Full dark mode; fixed 8 hardcoded strings (maxPhotos, invalidImage, uploadFailed, selectRating, missingCode, backToHome, starsAccessibility); fixed icon classes (`material-icons-outlined`/`material-icons-round` → `material-symbols-outlined`).
- **`apps/web/src/app/pages/EditProfile.tsx`** — Added missing dark mode: `dark:bg-dark-bg` on container, `dark:bg-dark-surface dark:border-dark-border` on inputs, `dark:hover:bg-dark-surface` on checkbox labels.
- **`apps/web/src/app/pages/Favorites.tsx`** — Added `dark:bg-dark-bg` and `dark:text-white` to container and heading.
- **`apps/web/src/app/pages/Notifications.tsx`** — Fixed `'Updates'` → `t('notifications.updatesLabel')` and hardcoded empty description → `t('notifications.emptyDesc')`; added dark mode to container and notification items.
- **`apps/web/src/app/pages/Groups.tsx`** — Full dark mode; refactored `formatRelative()` and `progressLevel()` to accept `t` as a parameter, replacing hardcoded time/level strings with translation keys; fixed `'Notifications'` aria-label and `'Created'` prefix; fixed icon classes.
- **`apps/web/src/app/pages/CreateGroup.tsx`** — Full dark mode; fixed 8 hardcoded strings: groupCreated, shareInviteLink, share, copy, goToGroup, nameLabel, descriptionLabel, privateGroup.
- **`apps/web/src/app/pages/GroupDetail.tsx`** — Full dark mode; fixed ~15 hardcoded strings: back, share, invite/copied, places (×4), showLess/viewFullLeaderboard, noLeaderboardData, recentlyVisited, noRecentActivity, checkedInAt.
- **`apps/web/src/app/pages/JoinGroup.tsx`** — Added full dark mode to all render paths.
- **`apps/web/src/components/common/ErrorBoundary.tsx`** — Fixed wrong dark tokens (`dark:bg-gray-*` → `dark:bg-dark-*`).
- **`apps/web/src/components/common/EmptyState.tsx`** — Fixed `dark:bg-gray-800/50` → `dark:bg-dark-surface`; added `dark:border-dark-border dark:text-white dark:text-dark-text-secondary`.
- **`apps/web/src/components/places/PlaceCard.tsx`** — Replaced all `dark:bg-slate-700` → `dark:bg-dark-surface`; `dark:text-slate-400` → `dark:text-dark-text-secondary`.
- **`apps/web/src/components/places/PlaceOpeningHours.tsx`** — Replaced hardcoded `DAYS` English array with `DAY_KEYS`/`DAY_EN` pattern for i18n day name display; added dark mode to desktop view container.
- **`apps/web/src/components/layout/ProtectedRoute.tsx`** — Replaced hardcoded `'Loading...'` with `t('common.loading')`; added `dark:text-dark-text-secondary`.

### Frontend (mobile)

- **`apps/mobile/src/app/screens/PlaceDetailScreen.tsx`** — Fixed hardcoded strings: missingCode, home (×2), notFound, checkInFailed, tryAgain; refactored distance formatting to use `t('common.distanceMeters')`/`t('common.distanceKm')` with `.replace()`; refactored day names array to `DAY_KEYS`/`DAY_EN` pattern using `t(\`common.${key}\`)`.
- **`apps/mobile/src/app/screens/WriteReviewScreen.tsx`** — Fixed 8 hardcoded strings: maxPhotos, invalidImage, photoPermissionDenied, uploadFailed, selectRating, missingCode, home, starsAccessibility.
- **`apps/mobile/src/app/screens/CreateGroupScreen.tsx`** — Fixed 5 hardcoded strings: goToGroup, nameLabel, groupNamePlaceholder, descriptionLabel, descriptionPlaceholder.
- **`apps/mobile/src/app/screens/GroupDetailScreen.tsx`** — Fixed hardcoded strings: missingGroup, share, places (×4 occurrences).
- **`apps/mobile/src/app/screens/NotificationsScreen.tsx`** — Removed hardcoded English fallback for emptyDesc; now exclusively uses `t('notifications.emptyDesc')`.

### Docs

- **`CLAUDE.md`** — Added Rule 12 (Dark Mode Compliance) and Rule 13 (Translation Key Parity) to prevent future disparity.
- **`ROADMAP.md`** — Replaced P4 "Design Alignment" section with completed task checklist for this parity pass.

---

## P4 Design Alignment: Web/Mobile Parity (2026-02-17)

### Frontend (web)

- **`apps/web/src/components/layout/Layout.tsx`** — Reduced bottom nav from 4 tabs to 3 (removed Map tab). Map is accessed via the Home screen toggle, matching mobile's 3-tab structure (Explore, Groups, Profile). Desktop header also removes the standalone Map link.

- **`apps/web/src/app/pages/Profile.tsx`** — Major overhaul to match mobile `ProfileScreen`: (1) added `LoginLanding` component for unauthenticated users (Hero image + Get Started/Sign In buttons); (2) stats grid changed from 3 columns (visits, reviews, badges) to 2 columns (check-ins, reviews) matching mobile; (3) added **Preferences section** with My Path, Language picker (modal bottom sheet), Notifications, and Dark Mode toggle; (4) added **Logout button** in red at the bottom; (5) full dark mode support via `dark:` Tailwind classes throughout; (6) language selection now opens an animated modal sheet instead of linking to Settings.

- **`apps/web/src/app/routes.tsx`** — Removed `ProtectedRoute` wrapper from `/profile` route; unauthenticated state is now handled within the component (shows `LoginLanding`), matching mobile behavior.

- **`apps/web/src/app/pages/Settings.tsx`** — Fixed all hardcoded English strings: "Preferences", "Support", "Account", "Delete account" and its confirmation text now use `t()` calls. Added icons to theme buttons, full dark mode `dark:` classes, back button linking to Profile, and improved visual consistency with mobile's settings UI.

### Backend

- **`server/app/db/seed_data.json`** — Added 3 new translation keys (`settings.support`, `settings.deleteAccount`, `settings.deleteAccountConfirm`) in English, Arabic, and Hindi.

---

## P2 Features: Timezone, Cursor Pagination, Map Clustering (2026-02-17)

### Backend

- **`data_scraper/app/scrapers/gmaps.py`** — Added `SCRAPER_TIMEZONE` fallback: when Google Maps doesn't return `utcOffsetMinutes` for a place, the scraper now reads the `SCRAPER_TIMEZONE` env var (IANA name, e.g. `Asia/Dubai`) and uses `zoneinfo.ZoneInfo` to compute the UTC offset in minutes. No external dependencies — uses stdlib `zoneinfo` (Python 3.9+).

- **`data_scraper/.env.example`** — Documented new `SCRAPER_TIMEZONE` env var with example value `Asia/Dubai`.

- **`server/app/db/places.py`** — Added cursor-based pagination to `list_places()`: new optional `cursor` parameter (a `place_code`). When provided, the page starts after that item in the sorted/filtered result set; otherwise `offset` is used as before. Returns `next_cursor` (last item's `place_code` when more results exist, `None` otherwise).

- **`server/app/api/v1/places.py`** — Exposed `cursor` query param on `GET /api/v1/places` and included `next_cursor` in the response body.

### Frontend (web)

- **`apps/web/src/components/places/PlacesMap.tsx`** — Added `react-leaflet-cluster` (`MarkerClusterGroup`) to cluster overlapping map markers. Green cluster icons show item count and expand on click; spiderfies at max zoom. `react-leaflet-cluster` + `@types/leaflet.markercluster` added to `package.json`.

- **`apps/web/src/lib/types/places.ts`** — Added `next_cursor?: string | null` to `PlacesResponse`.

### Frontend (mobile)

- **`apps/mobile/src/lib/utils/mapBuilder.ts`** — Embedded `leaflet.markercluster@1.5.3` via CDN in the WebView HTML. All markers now added to `L.markerClusterGroup()` with matching green cluster icons; click and postMessage behavior preserved.

- **`apps/mobile/src/lib/types/places.ts`** — Added `next_cursor?: string | null` to `PlacesResponse`.

---

## Pytest Test Suite + AM/PM Parsing Fix (2026-02-17)

### Backend

- **`server/app/db/places.py`** — Fixed AM/PM inheritance in `_parse_slot()`: when open time has no AM/PM marker (e.g. `"6:30 – 7:15 AM"`), the period is now inherited from the close time, resolving `open_status: "unknown"` for Google Maps-style partial 12h slots.

- **`server/tests/`** — Expanded pytest test suite (260 tests total):
  - `test_health.py` — health endpoint
  - `test_hours_parsing.py` — 23 unit tests for `_parse_time`, `_parse_time_12h`, `_parse_slot`, `_is_open_now_from_hours`
  - `test_auth.py` — register, login, refresh, logout flows
  - `test_auth_extended.py` — forgot-password, reset-password flows (valid token, one-time use, expired, weak password)
  - `test_places.py` — list, get, create/upsert, search, filters, reviews, check-ins, favorites
  - `test_places_db.py` — haversine, `_check_attr_bool`, `_place_has_*` helpers, place code generation, CRUD, list_places filtering
  - `test_place_attributes.py` — upsert/get/bulk attributes, attribute definitions filtering and ordering
  - `test_check_ins_db.py` — count queries, bulk counts, has_checked_in, this-month, on-this-day
  - `test_users.py` — GET/PATCH /users/me, settings, stats, check-ins, favorites HTTP integration tests
  - `test_reviews_extended.py` — PATCH/DELETE reviews, 403 guards, list with average_rating, anonymous flag
  - `test_i18n.py` — GET /languages, GET /translations (fallback, all three languages, place keys)
  - `test_notifications.py` — DB layer create/read/paginate + HTTP API endpoints
  - `test_security.py` — hash_password, verify_password, JWT encode/decode/tamper, refresh token generation
  - `test_store.py` — create/get/update user, settings update, password reset, refresh token lifecycle
  - `test_timezone_utils.py` — get_local_now, get_today_name, format_utc_offset (DST offsets, half-hour zones)
  - `tests/conftest.py` — session-scoped i18n seeding from `seed_data.json`; per-test DB isolation

- **`data_scraper/tests/`** — Expanded pytest test suite (40 tests total):
  - `test_normalize.py` — `normalize_to_24h`, `clean_address`, `process_weekly_hours` covering 12h→24h, multi-slot, special keywords, unicode whitespace
  - `test_gmaps_helpers.py` — `calculate_search_radius`, `detect_religion_from_types` (mocked session), `get_default_place_type`, `get_gmaps_type_to_our_type`, `MIN_RADIUS` constant

- **`server/requirements.txt`** — Added `pytest`, `pytest-asyncio`, `httpx`.
- **`data_scraper/requirements.txt`** — Added `pytest`.
- **`server/pytest.ini`**, **`data_scraper/pytest.ini`** — pytest configuration files.

### Docs

- **`CLAUDE.md`** — Added Rule 11: backend changes must include or update pytest tests; includes commands, test infrastructure notes.
- **`ROADMAP.md`** — Marked "Add backend tests with pytest" as complete.

---

## Opening Hours Overhaul (2026-02-17)

### Backend

- **`server/app/db/places.py`** — Fixed `_is_open_now_from_hours()`:
  - Bug fix: `"hours not available"` now returns `None` (unknown) instead of `False` (closed).
  - Multi-slot support: handles comma-separated time ranges (e.g. `"05:00-12:00, 14:00-22:00"`); returns `True` if current time falls in ANY slot.
  - Handles `list` type for `today_hours` by joining to comma-separated string.

- **`server/app/api/v1/places.py`** — Added `open_status` field (`"open"` | `"closed"` | `"unknown"`) to all place API responses; normalized `"00:00-23:59"` → `"OPEN_24_HOURS"` marker in `opening_hours_today` and `opening_hours` dict.

- **`server/app/db/seed_data.json`** — Added `places.open` and `places.unknown` translation keys for English, Arabic, and Hindi.

- **`data_scraper/app/scrapers/gmaps.py`** — Updated `normalize_to_24h()` to handle comma-separated multi-slot hours from Google Maps (e.g. `"9:00 AM - 12:00 PM, 2:00 PM - 6:00 PM"` → `"09:00-12:00, 14:00-18:00"`).

### Frontend (web)

- **`apps/web/src/lib/types/places.ts`** — Added `open_status?: 'open' | 'closed' | 'unknown'`; changed `is_open_now` to `boolean | null`.

- **`apps/web/src/index.css`** — Changed `.badge-open` from blue to green (`bg-emerald-600`); added `.badge-unknown` (grey); added glass variants (`.badge-open-glass`, `.badge-closed-glass`, `.badge-unknown-glass`) for hero overlay use.

- **`apps/web/src/components/places/PlaceCard.tsx`** — Three-state open/closed/unknown pill; uses `t('places.open')` instead of `t('places.openNow')`.

- **`apps/web/src/app/pages/PlaceDetail.tsx`** — Hero pill uses glass badge CSS classes with three-state logic.

- **`apps/web/src/components/places/PlaceOpeningHours.tsx`** — `formatHours()` handles `OPEN_24_HOURS` marker and case-insensitive `"hours not available"`; applied to collapsed view; added `truncate`/`min-w-0` overflow protection.

- **`apps/web/src/components/places/PlacesMap.tsx`** — Map pins now use open-status colors (green/red/grey) instead of religion-based colors.

### Frontend (mobile)

- **`apps/mobile/src/lib/types/places.ts`** — Same type changes as web.

- **`apps/mobile/src/lib/theme.ts`** — `openNow` changed from blue to green (`#16a34a`); added `unknownStatus: '#94a3b8'` and `unknownStatusBg`.

- **`apps/mobile/src/components/places/PlaceCard.tsx`** — Three-state pill with `useI18n` translations; added `chipUnknown`/`badgeUnknown` grey styles; updated border color for open badge.

- **`apps/mobile/src/app/screens/PlaceDetailScreen.tsx`** — Hero pill three-state with `heroBadgeUnknown` style; added `formatHoursDisplay()` helper; applied to collapsed/expanded views; added `numberOfLines={1}` and `flexShrink: 1` overflow fixes.

- **`apps/mobile/src/lib/utils/mapBuilder.ts`** — Map pins use open-status colors via per-marker `openStatus` field; replaces single blue icon.

---

## P1 Performance Improvements (2026-02-17)

### Backend

- **Batch place sync endpoint** (`server/app/api/v1/places.py`, `server/app/models/schemas.py`)
  - Added `PlaceBatch` Pydantic model wrapping `List[PlaceCreate]`.
  - New `POST /api/v1/places/batch` endpoint (declared before single-place route to avoid path conflict) that iterates the list, upserts each place with images/attributes/reviews, and returns `{total, synced, failed, results[]}`.
  - Reduces N HTTP requests to `ceil(N/25)` requests during sync.

- **Rating sort for places** — already implemented; verified in `server/app/db/places.py` (sort applied after filters with `_get_avg` per place). Marked done in ROADMAP.

- **Scraper batch sync** (`data_scraper/app/db/scraper.py`)
  - Added `BATCH_SIZE = 25` constant.
  - `sync_run_to_server` builds all payloads up front, POSTs in batches of 25 to `/api/v1/places/batch`.
  - Falls back to individual `POST /api/v1/places` calls if batch endpoint returns non-200.
  - Maintains per-place `[OK]` / `[FAIL]` logging and final summary.

### Frontend (web)

- **React.memo for PlaceCardUnified and FilterChip** (`apps/web/src/components/places/`)
  - Wrapped `PlaceCardUnified` and `FilterChip` in `React.memo()` to prevent unnecessary re-renders on parent state changes.

- **Lazy-loaded routes** (`apps/web/src/app/routes.tsx`)
  - Converted all 18 page imports to `React.lazy()` with dynamic `import()`.
  - Wrapped `<Routes>` in `<Suspense fallback={<PageLoader />}>` (spinner). Enables per-route code splitting; first load no longer downloads all page bundles.

- **Extracted PlaceDetail sub-components** (`apps/web/src/components/places/`)
  - `PlaceOpeningHours` — collapsible opening hours section with `compact` prop for mobile/desktop variants; eliminates duplicated JSX between layouts.
  - `PlaceTimingsCarousel` — horizontal carousel of `TimingCircle`/`DeityCircle` items with `compact` prop.
  - `PlaceSpecificationsGrid` — 2/3-column specifications grid with `compact` prop.
  - `PlaceDetail.tsx` reduced from 840 → ~550 lines; `hoursExpanded` state and `renderTimingItem` helper removed from page component.

### Frontend (mobile)

- **Image caching** — already implemented via `expo-image` with `cachePolicy="memory-disk"` in `PlaceCard.tsx`. Marked done in ROADMAP.

- **React.memo for PlaceCard and FilterChip** — already applied in mobile components. Marked done in ROADMAP.

- **Extracted PlaceDetailScreen sub-components** (`apps/mobile/src/components/places/`)
  - `PlaceScorecardRow` — tappable distance/crowd/visits scorecard row.
  - `PlaceTimingsCarousel` — horizontal ScrollView of religion-specific timing circles.
  - `PlaceSpecificationsGrid` — wrapped specs grid with icon, label, value.
  - `PlaceReviewsList` — full reviews section with write/edit/delete actions, owns `deletingCode` state and uses `useNavigation` internally.
  - `PlaceDetailScreen.tsx` reduced from 1129 → ~600 lines; removed `handleDeleteReview`, `deletingCode`, `userReview`, and related style blocks from screen.

---

## P1 Reliability Improvements (2026-02-17)

### Backend

- **Alembic database migrations** (`server/alembic.ini`, `server/migrations/`)
  - Initialized Alembic with full `env.py` wired to SQLModel metadata and `DATABASE_URL` env override.
  - Wrote initial migration `0001_initial.py` with `op.create_table()` for all 15 tables (correct `downgrade()` included).
  - `server/app/db/session.py`: added `run_migrations()` — programmatic `alembic upgrade head` using the correct `alembic.ini` path.
  - `server/app/main.py`: lifespan now calls `run_migrations()` before `run_seed()`, ensuring schema is always at head on startup.
  - `server/app/db/seed.py`: `_clear_stores()` replaced `create_db_and_tables()` with `run_migrations()` so the dev seed rebuilds via tracked migrations.
  - `server/requirements.txt`: added `alembic>=1.13.0`.
  - `server/README.md`: documented all Alembic commands and the "adding a new model" workflow.

- **Scraper sync summary** (`data_scraper/app/db/scraper.py`)
  - `sync_run_to_server` now tracks `synced_count` and `failure_details` per place.
  - Prints `[OK]` / `[FAIL]` per place and a final summary line: `"Sync complete: 47/50 places synced. 3 failure(s)."` with a list of failed place codes and reasons.

- **Unsafe session handling** (`server/app/db/place_images.py`)
  - Already uses proper `Session` injection — no `next(get_session())` present. Verified and marked done.

- **Scraper health check** (`data_scraper/app/main.py`)
  - Already implements `GET /health` returning `{"status": "ok"}`. Verified and marked done.

### Frontend (web)

- **Route-level error boundaries** (`apps/web/src/app/routes.tsx`)
  - Added `RouteErrorBoundary` functional component using `key={location.pathname}`. React mounts a fresh `ErrorBoundary` on every navigation, so a crash on one route doesn't block access to other routes.
  - Wraps the entire `<Routes>` block in `AppRoutes`.

### Frontend (mobile)

- **Screen-level error boundaries** (`apps/mobile/src/app/navigation.tsx`)
  - Added `withScreenBoundary` HOC that wraps any screen component in `<ErrorBoundary>`.
  - Applied to all 15 non-trivial `Stack.Screen` components so a crash on one screen shows the "Try again" fallback without affecting the rest of the navigator.

---

## Mobile UX Improvements – Pull-to-Refresh, Infinite Scroll, Haptics, Swipe, Skeletons (2026-02-17)

### Frontend (mobile)

- **Skeleton loading screens** (`apps/mobile/src/components/common/SkeletonCard.tsx`)
  - New `SkeletonCard` component with animated opacity pulse (0.4 → 0.85 at 750ms) matching PlaceCard shape.
  - Used on HomeScreen (5 skeletons on initial load) and FavoritesScreen (4 skeletons on initial load).

- **SwipeableRow component** (`apps/mobile/src/components/common/SwipeableRow.tsx`)
  - PanResponder-based swipe-to-reveal-action component; no external gesture library required.
  - Configurable delete button (label, color, icon); snaps open/closed past 50% threshold.

- **Haptic feedback** (`apps/mobile/src/app/screens/PlaceDetailScreen.tsx`)
  - `expo-haptics` added to `package.json`.
  - `notificationAsync(Success)` on successful check-in; `impactAsync(Light)` on favorite toggle.

- **Pull-to-refresh** (`apps/mobile/src/app/screens/CheckInsListScreen.tsx`)
  - Added `RefreshControl` to the check-ins `ScrollView`.
  - `HomeScreen` and `FavoritesScreen` already support pull-to-refresh via `FlatList` + `RefreshControl`.

- **Infinite scroll** (`apps/mobile/src/app/screens/HomeScreen.tsx`)
  - `FlatList` now uses `onEndReached` / `onEndReachedThreshold={0.4}` to load the next page (PAGE_SIZE = 20).
  - `ListFooterComponent` shows a spinner while `loadingMore` is true.

- **Favorites: FlatList + swipe-to-remove + haptics** (`apps/mobile/src/app/screens/FavoritesScreen.tsx`)
  - Converted from `ScrollView` to `FlatList` with `RefreshControl`.
  - Each favorite wrapped in `SwipeableRow`; swipe left to reveal remove button.
  - `Haptics.impactAsync(Medium)` fires before remove action.

### Frontend (web)

- **Infinite scroll** (`apps/web/src/app/pages/Home.tsx`, `apps/web/src/components/places/PlaceListView.tsx`)
  - `Home.tsx`: added `PAGE_SIZE = 20`, `loadMore` callback, `offsetRef` for stable offset tracking, passes `loadingMore`/`hasMore`/`onLoadMore` to `PlaceListView`.
  - `PlaceListView.tsx`: `IntersectionObserver` on a sentinel `<div>` at list bottom triggers `onLoadMore`; spinner shown while `loadingMore` is true.

---

## P4 Design Alignment – Component-Level (2026-02-17)

### Frontend (web)

- **Design tokens: border radius alignment** (`apps/web/tailwind.config.js`)
  - Aligned border radius values with design reference: `2xl` = 16px (cards), `3xl` = 24px (large panels), `4xl` = 32px (hero sections), `xl` = 12px (inputs, inner elements).

- **Animation & motion utilities** (`apps/web/tailwind.config.js`, `apps/web/src/index.css`)
  - Added `shimmer` (1.5s skeleton), `checkInSpring` (spring physics scale), `heartPop` (favorite toggle), `slideUp`, and `fadeIn` keyframe animations.
  - Added `.skeleton-shimmer`, `.animate-check-in`, `.animate-heart-pop`, `.animate-slide-up` CSS utility classes.

- **Glass morphism** (`apps/web/src/index.css`)
  - Updated `.glass-card` to `rgba(255,255,255,0.70)` + `blur(12px)` + `border-white/20` (light mode).
  - Updated `.glass-card-dark` to `rgba(18,18,18,0.70)` + `blur(12px)` + `border-white/10` (dark mode).
  - Added `.glass-btn` for hero image overlay controls.

- **Badge system** (`apps/web/src/index.css`)
  - `.badge-open`: primary blue pill with pulse dot (matches design reference).
  - `.badge-closed`: red pill, white text.
  - `.badge-visited`: glass morphism pill with backdrop-blur.
  - `.badge-rating`: dark glass pill with star + rating number.

- **Overlay gradients** (`apps/web/src/index.css`)
  - `.hero-gradient`: `from-black/40 → transparent → to-black/80` (matches design reference three-stop gradient).
  - `.hero-gradient-bottom`: `transparent 40% → black/80 100%` for card images.

- **Button variants** (`apps/web/src/components/common/PrimaryButton.tsx`)
  - Added `outline` variant: transparent fill, 1px primary border, primary text.
  - Added `glass` variant: backdrop-blur semi-transparent, white text.
  - Updated `secondary` variant: `primary/10` opacity fill, primary text (was outline-ish border).

- **PlaceCard** (`apps/web/src/components/places/PlaceCard.tsx`)
  - Hero image gradient updated to three-stop `.hero-gradient`.
  - Open badge uses `.badge-open` (primary blue pill with pulse dot).
  - Closed badge uses `.badge-closed` (red pill).
  - Visited badge uses `.badge-visited` (glass morphism).
  - Card border radius: `rounded-2xl` (16px). Inner image: `rounded-xl` (12px). Consistent 16px padding.
  - Shadow: `shadow-card` on rest, `shadow-card-md` on hover.

- **Bottom navigation** (`apps/web/src/components/layout/Layout.tsx`)
  - Switched to layered glass: `bg-white/80` + `backdrop-blur-lg` background layer + `border-white/30` separator.
  - Active icon: filled + bold weight (`wght 600`). Inactive icon: lighter weight (`wght 300`).
  - Active indicator: small primary dot above icon. Inactive label: smaller and 50% opacity.
  - Safe area inset handled via `env(safe-area-inset-bottom)`.

- **Skeleton shimmer** (`apps/web/src/components/common/SkeletonCard.tsx`)
  - Replaced `animate-pulse` with `.skeleton-shimmer` left-to-right gradient at 1.5s interval.

### Frontend (mobile)

- **Design tokens: border radius alignment** (`apps/mobile/src/lib/theme.ts`)
  - Aligned `borderRadius` with design reference: `2xl` = 16px, `3xl` = 24px, `4xl` = 32px.
  - Added `closedNow` / `closedNowBg` color tokens (red).
  - Changed `openNow` from green `#059669` to primary blue `#007AFF` (matches design reference badge).
  - Added `cardMd` shadow token.

- **PlaceCard badges & gradients** (`apps/mobile/src/components/places/PlaceCard.tsx`)
  - Open badge: solid primary blue with white text (matches design reference).
  - Closed badge: solid red with white text.
  - Visited badge: glass morphism (unchanged, correct).
  - Hero gradient: `overlayTop` (rgba 0,0,0,0.40) + `overlayBottom` (rgba 0,0,0,0.50), matching design reference three-stop pattern.
  - Compact card inner image radius: `tokens.borderRadius.xl` (12px). Card radius: `tokens.borderRadius['2xl']` (16px).
  - Rating pill updated to rounded-full glass style.

- **Bottom navigation** (`apps/mobile/src/components/layout/Layout.tsx`)
  - Inactive tab labels hidden; only active tab shows its label (cleaner per design spec).
  - Active indicator pill widened to 28px, shadow intensity increased.

---

## Security Hardening – P0 Critical Fixes + P1 Security (2026-02-17)

### Backend

- **Fix: JWT expiration format parsing** (`server/app/core/config.py`)
  - `JWT_EXPIRE` / `REFRESH_EXPIRE` env vars now accept `"7d"`, `"24h"`, `"30m"`, or integer minutes via `_parse_jwt_expire()`. Previously `int()` would crash on the `"7d"` format shown in `.env.example`.

- **Fix: `delete_review` crash** – already resolved (proper `session.delete()` in `reviews_db.delete_review`); confirmed and marked done in ROADMAP.

- **Fix: `image_urls` AttributeError on Place model** – already resolved (uses `place_images.get_images()`); confirmed and marked done in ROADMAP.

- **Fix: `get_current_user` missing session argument** (`server/app/api/deps.py`)
  - `get_current_user` and `get_optional_user` now inject `SessionDep` and pass it to `store.get_user_by_code()`, preventing a `TypeError` on every authenticated request.

- **Security: Password strength enforcement** (`server/app/models/schemas.py`)
  - `RegisterBody` and `ResetPasswordBody` now validate passwords server-side: minimum 8 characters, at least one uppercase letter, one lowercase letter, and one digit. Returns a 422 with a clear message on failure.

- **Security: Input validation** (`server/app/models/schemas.py`)
  - Added `ExternalReviewInput` Pydantic model with explicit typed fields (`author_name`, `rating` 1–5, `text`, `time`, `language`). `PlaceCreate.external_reviews` now uses `List[ExternalReviewInput]` instead of `List[dict]`.
  - `PlaceAttributeInput.value` constrained to `str | int | float | bool | list[str]`; arbitrary `dict` payloads are rejected.

- **Security: Rate limiting on auth endpoints** (`server/app/main.py`, `server/app/api/v1/auth.py`)
  - Added `slowapi` (in-memory, per-IP). Limits: `POST /auth/login` → 5/min, `POST /auth/register` → 3/min, `POST /auth/forgot-password` → 2/min.

- **Security: Password reset emails via Resend.com** (`server/app/api/v1/auth.py`, `server/app/core/config.py`)
  - `POST /auth/forgot-password` now sends a reset link via the Resend.com API. Falls back to console logging when `RESEND_API_KEY` is unset (dev). Added `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and `RESET_URL_BASE` env vars.

- **Security: Refresh token rotation** (`server/app/db/models.py`, `server/app/db/store.py`, `server/app/core/security.py`, `server/app/api/v1/auth.py`)
  - Access tokens are now short-lived (default 30 min, configurable via `JWT_EXPIRE`).
  - Opaque refresh tokens (96-char hex, stored in `RefreshToken` DB table) are issued on login/register, set as HTTP-only `SameSite=Strict` cookies (30 days, configurable via `REFRESH_EXPIRE`).
  - `POST /api/v1/auth/refresh` – validates and rotates the refresh token, issues a new access token.
  - `POST /api/v1/auth/logout` – revokes the refresh token and clears the cookie.
  - Old refresh token is revoked on every use (rotation); stolen tokens cannot be reused.

- **CORS** – already environment-aware (`CORS_ORIGINS` env var, no wildcard `*`); confirmed and marked done in ROADMAP.

- **Dependencies**: added `slowapi>=0.1.9` and `resend>=2.0.0` to `server/requirements.txt`.

- **Docs**: updated `server/.env.example` with `JWT_EXPIRE`, `REFRESH_EXPIRE`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESET_URL_BASE`.

---

## Fix Google Maps Scraper API Errors and Invalid Place Types (2026-02-17)

### Data Scraper

- **Performance: max_results Early Exit**
  - Moved max_results check inside recursive search_area() function
  - Stops API calls immediately when limit is reached instead of searching entire area
  - Checks limit at 3 points: before area search, after finding places, before each quadrant
  - Dramatically reduces API calls for testing: max_results=100 uses ~20-30 calls instead of ~350-500
  - Slight overshoot acceptable (e.g., 100 limit might return 118 places)
  - Added running total to search logging

- **Bug Fix: 404 Error in get_place_details**
  - Fixed searchNearby to request "places.name" (resource name) instead of "places.id" (legacy Place ID)
  - Resource names have format "places/ChIJ..." which is required by GET place details endpoint
  - Updated place_id extraction logic to handle resource names correctly
  - Fixed deduplication cache to extract place ID from resource name before building place_code
  - Added import for `desc()` function from sqlmodel for proper order_by usage

- **Bug Fix: API Error Handling**
  - Added HTTP status code checking to `get_places_in_circle()` in `data_scraper/app/scrapers/gmaps.py:152-158`
  - Added HTTP status code checking to `get_place_details()` in `data_scraper/app/scrapers/gmaps.py:192-198`
  - API errors (400, 404, etc.) now properly raise exceptions with error messages instead of silently failing
  - Fixes issue where 400 errors from invalid place types were not logged

- **Bug Fix: Invalid Place Types**
  - Removed unsupported place types `cathedral` and `chapel` from `data_scraper/app/db/seed_place_types.py`
  - New Places API only supports: `buddhist_temple`, `church`, `hindu_temple`, `mosque`, `shinto_shrine`, `synagogue`
  - Now using only valid types: `church` (Christianity), `mosque` (Islam), `hindu_temple` (Hinduism)
  - Added documentation comments with API reference link
  - Created `data_scraper/app/db/update_place_types.py` migration script to update existing databases:
    - Deactivates `cathedral` and `chapel` entries (sets `is_active=False`)
    - Ensures valid types are active and properly configured
    - Safe to run multiple times (idempotent)

- **Migration Instructions**
  - For existing databases, run: `cd data_scraper && python -m app.db.update_place_types`
  - For new databases, the seed script already uses only valid types

---

## Google Maps Scraper API Cost Optimization (2026-02-16)

### Data Scraper

- **Phase 1: Migrate to Places API (New) - Multi-Type Search + Field Masks**
  - Replaced legacy Google Places API with new Places API (v1) in `data_scraper/app/scrapers/gmaps.py`
  - Replaced `get_places_in_circle()` with `get_places_in_circle()` using `POST /v1/places:searchNearby` endpoint
  - Multi-type search: Now sends all place types (mosque, church, cathedral, chapel, hindu_temple) in a single API request instead of 5 separate requests per grid point
  - Replaced `get_place_details()` with `get_place_details()` using `GET /v1/places/{id}` with field masks
  - Field-masked details fetch: Uses Basic (free) + Contact ($0.003) + Atmosphere ($0.005) tiers = $0.008 per call (down from $0.017 legacy)
  - Updated photo URL construction to use new API format: `places/{placeId}/photos/{photoId}/media`
  - Updated response field mappings: `displayName`, `formattedAddress`, `regularOpeningHours`, `userRatingCount`, `accessibilityOptions`, `editorialSummary`, etc.
  - Removed all legacy API code and references

- **Phase 2: Recursive Quadtree Grid Search**
  - Replaced fixed-step grid loop with recursive quadtree subdivision in new `search_area()` function
  - Adaptive search: Automatically splits saturated areas (20 results) into 4 quadrants and recurses, leaving sparse areas as single large searches
  - Added `calculate_search_radius()` helper to compute bounding box center and diagonal radius
  - Stops recursion at `MIN_RADIUS = 2000` meters to prevent infinite subdivision in dense areas
  - Removed `STEP = 0.1` constant (no longer needed)
  - Logs recursion depth and saturation status for debugging

- **Phase 3: Cross-Run Deduplication**
  - Added deduplication check in `run_gmaps_scraper()` before fetching place details
  - Queries `ScrapedPlace` table for existing places within `STALE_THRESHOLD_DAYS = 90` days
  - Reuses cached place data instead of re-fetching from Google Maps API when available
  - Added `force_refresh` config option to override cache and force fresh fetch
  - Added `stale_threshold_days` config option to customize cache freshness window
  - Updated `DataLocationCreate` schema to include `force_refresh: Optional[bool]` and `stale_threshold_days: Optional[int]`
  - Logs cache hits vs fresh fetches in final summary

- **Cost Impact Estimates (UAE benchmark, ~1,750 grid points)**
  - **Current (legacy):** ~8,750 Nearby Search + ~5,000 Details = ~$484
  - **Phase 1 (multi-type + field masks):** ~1,750 Nearby Search + ~5,000 Details = ~$199 (59% reduction)
  - **Phase 2 (+quadtree):** ~200-500 Nearby Search + ~5,000 Details = ~$50-100 (79-90% reduction)
  - **Phase 3 (+dedup re-run):** ~200-500 Nearby Search + ~2,500 Details = ~$35-75 (85-93% reduction)

---

## Fix Missing Images in Places List API (2026-02-16)

### Backend

- **Critical Bug Fix:** Fixed missing images in `GET /api/v1/places` endpoint - images were returning as empty arrays because no database session was passed to `_place_to_item()`
- **Performance Optimization:** Added `get_images_bulk()` function in `server/app/db/place_images.py` to fetch images for multiple places in one query, eliminating N+1 query problem
- **API Changes:**
  - Updated `list_places()` in `server/app/api/v1/places.py` to create database session and bulk-fetch images
  - Modified `_place_to_item()` to accept optional pre-fetched `images` parameter for performance
  - Both URL-based and blob-based images now correctly returned in list responses
- **Schema Cleanup:** Removed unused `PlaceListItem` schema from `server/app/models/schemas.py` (had incorrect field names and wasn't being enforced)
- **Seed Data:** Added place and place_image seeding support in `server/app/db/seed.py` with test data including both URL and blob image types

### Data Scraper

- **Bug Fix:** Added missing `utc_offset_minutes` field to place sync payload in `data_scraper/app/db/scraper.py`

### Frontend (Web)

- **Image URL Utility:** Created `apps/web/src/lib/utils/imageUtils.ts` with `getFullImageUrl()` helper to convert relative blob image URLs to absolute URLs
- **Updated Components:** Applied image URL fix to all components rendering place images:
  - `PlaceCard.tsx` - place card images
  - `PlaceDetail.tsx` - hero image
  - `WriteReview.tsx` - place thumbnail
  - `CheckInsList.tsx` - check-in thumbnails
  - `PlaceCardUnified.tsx` - unified card images
- Fixes blob images not rendering because `<img>` requires full URLs

### Frontend (Mobile)

- **Image URL Utility:** Created `apps/mobile/src/lib/utils/imageUtils.ts` with `getFullImageUrl()` helper to convert relative blob image URLs to absolute URLs
- **Updated Components:** Applied image URL fix to all components rendering place images:
  - `PlaceCard.tsx` - place card images
  - `PlaceDetailScreen.tsx` - hero image
  - `WriteReviewScreen.tsx` - place thumbnail
  - `CheckInsListScreen.tsx` - check-in thumbnails (3 instances)
- Fixes blob images not rendering in `expo-image` component

### Performance Impact
- **Before:** 50 places = 51 queries (1 place query + 50 individual image queries)
- **After:** 50 places = 2 queries (1 place query + 1 bulk image query)

---

## Timezone-Aware Opening Hours & Timings (2026-02-16)

### Backend

- **Timezone Utilities:** Created `server/app/services/timezone_utils.py` with offset-based time utilities (`get_local_now()`, `get_today_name()`, `format_utc_offset()`) using Python stdlib only
- **Place Model:** Added `utc_offset_minutes` field (integer) to `Place` model to store UTC offset in minutes (e.g., 240 for UTC+4, 330 for UTC+5:30)
- **Opening Hours Storage:** Changed to store **local times** (not UTC) in 24-hour format (e.g., "09:00-17:00") to preserve place's local timezone
- **Scraper Updates:**
  - Added `utc_offset` field to Google Maps API request to extract UTC offset from API response
  - Renamed `convert_to_utc_24h()` to `normalize_to_24h()` and removed UTC conversion logic
  - Updated `process_weekly_hours()` to return local times instead of UTC times
  - Modified `get_place_details()` to extract and include `utc_offset_minutes` in place data
- **is_open_now Calculation:** Rewrote `_is_open_now_from_hours()` to accept `utc_offset_minutes` parameter and compute using place's local time
- **Timings Calculation:** Updated `build_timings()` to use place's UTC offset for prayer/service time status (past/current/upcoming)
- **API Response Changes:**
  - Added `utc_offset_minutes` field to place responses
  - Added `opening_hours_today` computed field showing today's hours in local time
  - `opening_hours` now contains local times instead of UTC times
  - Updated `_place_to_item()` to compute today's day name based on place's local time
- **Place Creation:** Updated `create_place()` and `update_place()` functions to accept and store `utc_offset_minutes`
- **Schemas:** Added `utc_offset_minutes` and `opening_hours_today` fields to `PlaceListItem` and `PlaceCreate` schemas
- **Backfill Script:** Created `server/app/jobs/backfill_timezones.py` to migrate existing places (set offset=240 for UAE, convert UTC hours to local time)

### Data Scraper

- **Google Maps Integration:** Now extracts `utc_offset` field from Google Maps Places API (no additional API calls needed)
- **Local Time Storage:** Opening hours stored in local time as provided by Google Maps, no UTC conversion
- **Place Data:** Scraper includes `utc_offset_minutes` when creating/updating places via ingestion API

### Frontend (web)

- **TypeScript Types:** Added `utc_offset_minutes?: number` and `opening_hours_today?: string` fields to `Place` interface
- **Opening Hours Display:** Added collapsible "Opening Hours" section to PlaceDetail page:
  - Collapsed state: Shows today's hours inline ("Today: 08:00 - 00:00")
  - Expanded state: Shows full weekly schedule with today highlighted
  - Handles special cases: "Closed", "Open 24 Hours", missing hours
- **UI Components:** Uses Material Icons for schedule icon and expand/collapse controls

### Frontend (mobile)

- **TypeScript Types:** Added `utc_offset_minutes?: number` and `opening_hours_today?: string` fields to `Place` interface
- **Opening Hours Display:** Added collapsible "Opening Hours" section to PlaceDetailScreen:
  - Collapsed state: Shows today's hours inline with schedule icon
  - Expanded state: Shows full weekly schedule with today highlighted
  - Matches web design with React Native primitives (View, Text, TouchableOpacity)
- **Styling:** Added comprehensive styles for opening hours card, rows, and collapse button

### Translations

- **i18n Keys Added:**
  - `places.openingHours` — "Opening Hours" / "ساعات العمل" / "खुलने का समय"
  - `places.today` — "Today" / "اليوم" / "आज"
  - `places.open24Hours` — "Open 24 Hours" / "مفتوح 24 ساعة" / "24 घंटे खुला"
  - `places.hoursNotAvailable` — "Hours not available" / "الساعات غير متوفرة" / "समय उपलब्ध नहीं"
  - `common.showLess` — "Show less" / "إظهار أقل" / "कम दिखाएं"

### Docs

- **ARCHITECTURE.md:** Added section 8.6 "Timezone Handling" documenting design decision, API response changes, DST limitations, and upgrade path
- **Place Model Documentation:** Updated to include `utc_offset_minutes` field description

---

## Place Image Caching Optimization - Mobile (2026-02-16)

### Frontend (mobile)

- **ExpoImage Migration:** Replaced React Native's basic `Image` component with `ExpoImage` for all place-related images
- **Aggressive Caching:** Added `cachePolicy="memory-disk"` to place images (PlaceCard, PlaceDetailScreen hero, DeityCircle)
- **Smooth Transitions:** Added 200ms fade-in transitions for better UX
- **Components Updated:**
  - PlaceCard: Both compact (96x96) and regular (full-card background) image variants
  - PlaceDetailScreen: Hero image (300px height)
  - DeityCircle: Deity/timing carousel images (76x76 circular)
- **Performance Impact:** Significant reduction in network usage and improved scroll performance, especially for place lists and map scrollers

---

## Review Photo Upload & Image Caching (2026-02-16)

### Backend

- **ReviewImage Model:** Added `ReviewImage` table for storing review photos as database blobs with metadata (dimensions, file size, MIME type)
- **Photo Upload Endpoint:** Implemented `POST /api/v1/reviews/upload-photo` that validates, compresses (max 1200px width, 85% JPEG quality), and stores images
- **Image Serving Endpoint:** Added `GET /api/v1/reviews/images/{id}` with 1-year cache headers (`Cache-Control: public, max-age=31536000, immutable`)
- **Review Creation:** Updated review creation to parse internal image URLs (`/api/v1/reviews/images/{id}`), attach uploaded images to reviews, and validate ownership
- **Review Fetching:** Modified review fetching to merge attached images with external URLs in `photo_urls` field
- **Orphan Cleanup Job:** Created `cleanup_orphaned_images.py` to delete unattached images older than 24 hours (prevents database bloat)
- **Dependencies:** Added Pillow 10.0+ for server-side image processing

### Frontend (web)

- **Image Upload Utility:** Created `imageUpload.ts` with client-side image validation and Canvas API compression
- **API Client:** Added `uploadReviewPhoto()` function for multipart photo uploads
- **Write Review UI:** Implemented photo picker with thumbnail previews, remove buttons, and 5-photo limit
- **Photo Display:** Added photo galleries to review cards in PlaceDetail page
- **Caching:** Browser HTTP cache automatically handles 1-year cache headers

### Frontend (mobile)

- **Dependencies:** Added `expo-image-picker` (16.0.6), `expo-image-manipulator` (14.0.3), and `expo-image` (2.1.0)
- **Image Upload Utility:** Created `imageUpload.ts` with permission handling, expo-image-picker integration, and compression
- **API Client:** Added `uploadReviewPhoto()` function with FormData support for React Native
- **Write Review UI:** Implemented photo picker with horizontal scroll, thumbnail previews, remove buttons, and 5-photo limit
- **Photo Display:** Added photo galleries to review cards in PlaceDetailScreen
- **Caching:** Replaced `<Image>` with `<ExpoImage>` component with `cachePolicy="memory-disk"` for automatic disk caching

### Documentation

- Updated ARCHITECTURE.md with ReviewImage model
- Updated PRODUCTION.md with Pillow dependency and cleanup job setup for all deployment plans

---

## User Avatar Removal (2026-02-16)

### Backend

- **Breaking Change:** Removed `avatar_url` field from User model and all API endpoints
- Removed `POST /api/v1/users/me/avatar` stub endpoint
- Updated seed data to remove avatar URLs

### Frontend (web)

- Removed avatar URL input from Edit Profile page
- Profile now always displays initial-based avatar (first letter of display name)

### Frontend (mobile)

- Removed `avatar_url` from User type (mobile already displayed initials only)

---

## Bulk Query Optimization for Places List (2026-02-16)

### Backend

- **Connection Pool Fix:** Resolved SQLAlchemy connection pool exhaustion on `GET /api/v1/places` endpoint caused by N+1 query pattern when fetching place attributes.
- **Bulk Attribute Fetching:** Added `bulk_get_attributes_for_places()` function in `place_attributes.py` that fetches all attributes for multiple places in a single query using `WHERE place_code IN [...]`.
- **Session Management:** Made session parameters REQUIRED (no longer optional) in attribute helper functions to enforce proper session reuse. Removed backward compatibility code.
- **`list_places()` Optimization:** Refactored to use bulk fetching:
  - Fetches all place attributes in ONE query after retrieving places
  - Fetches filterable attribute definitions ONCE before building filters
  - Builds filter counts in Python using pre-fetched data (no DB calls in loops)
  - Returns `all_attrs` dict in response for API layer to reuse
- **Helper Function Refactor:** Updated `_place_has_jummah`, `_place_has_events`, `_place_has_parking`, `_place_has_womens_area` to accept pre-fetched attributes dict instead of making individual DB queries.
- **API Layer Updates:** Modified `_place_to_item()`, `_build_timings()`, `_build_specifications()`, and `_place_detail()` in `places.py` API to accept optional pre-fetched attributes and session, falling back to creating sessions only when needed.
- **Performance Impact:** Reduced query count from 200+ to ~3 queries for a 50-place list with filters, eliminating connection pool timeouts.

---

## Dynamic Place Attributes + Google Maps Scraper Generalization (2026-02-16)

### Backend

- **Dynamic Attribute System (EAV):** Introduced `PlaceAttributeDefinition` and `PlaceAttribute` tables for flexible, religion-agnostic attribute storage. Adding new scraped fields or attributes now requires only a DB row—not code changes.
  - `PlaceAttributeDefinition`: Defines available attributes (`has_parking`, `capacity`, `denomination`, etc.) with metadata: data type, icon, i18n label key, filterable/specification flags, religion constraint, display order.
  - `PlaceAttribute`: Stores actual values per place in `value_text` (booleans/strings/numbers) or `value_json` (complex data like prayer times, service schedules, deities).
- **Seed Data:** Added 15 attribute definitions to `seed_data.json` (parking, wheelchair, wudu area, women's area, capacity, denomination, founded year, architecture, dress code, prayer times, service times, deities, Google rating/reviews).
- **Seed Migration:** Existing `religion_specific` data is automatically migrated to `PlaceAttribute` rows on seed for all 10 places.
- **Dynamic `_build_specifications()`:** Replaced hardcoded per-religion logic with dynamic attribute lookups from `PlaceAttributeDefinition` (spec_only=true). Specifications are now auto-generated and ordered by `display_order`.
- **Dynamic Filters:** Filter chips in `GET /api/v1/places` are now dynamically generated from `PlaceAttributeDefinition` (filterable=true) + two special cases (`open_now`, `top_rated`).
- **API Schema:** Added `PlaceAttributeInput` model and optional `attributes` field to `PlaceCreate`. The `POST /api/v1/places` endpoint now accepts and upserts attributes.
- **Place Detail Response:** Added `attributes` dict (flat key-value) to place detail responses for client consumption.
- **Backward Compatibility:** Kept `religion_specific` JSON column; new code reads from `PlaceAttribute` first, falls back to `religion_specific`.

### Data Scraper (`data_scraper/`)

- **Google Maps Scraper Generalization:**
  - **Environment Key:** Moved API key from hardcoded value to `GOOGLE_MAPS_API_KEY` env var. Added `data_scraper/.env.example`.
  - **Multi-Type/Country:** Renamed functions to be generic (`get_places_in_circle`, `get_place_details`). Added CLI args: `--country` (UAE, India, USA), `--type` (mosque, hindu_temple, church), `--mode` (csv, api).
  - **Attribute Mapping:** Scraper now maps Google fields to attribute codes (`wheelchair_accessible`, `google_rating`, `google_reviews_count`) and outputs `attributes` array in place payload.
  - **API Mode:** `--mode api` POSTs scraped places directly to `POST /api/v1/places` with `attributes` for auto-ingestion (no manual CSV import).
  - **CSV Mode:** Legacy `--mode csv` still works for exporting to CSV with weekly hours, images, reviews.
  - **Usage Example:** `python data_scraper/gmaps.py --country UAE --type mosque --mode api --api-url http://localhost:8000/api/v1/places`

### Frontend (Web + Mobile)

- **Types:** Added `attributes?: Record<string, unknown>` field to `Place` interface in `apps/web/src/lib/types/index.ts` and `apps/mobile/src/lib/types/index.ts`.

### Docs

- **ARCHITECTURE.md:**
  - Updated data model section (§4) to include `PlaceAttributeDefinition` and `PlaceAttribute`.
  - Added "Dynamic Attribute System (EAV Pattern)" subsection explaining benefits and backward compatibility.
  - Updated "Data Enrichment" section (§8) to document generalized Google Maps scraper with CLI args, env key, and API mode.
- **PRODUCTION.md:** Added `GOOGLE_MAPS_API_KEY` environment variable to all three deployment plans (Docker, Free services, GCP).
- **server/README.md:** (Pending update to env vars section.)

---

## Data Enrichment Scraper API (2026-02-15)

### Scraper Service (`data_scraper/`)
- **FastAPI Migration:** Refactored the standalone scraper script into a full **FastAPI service**.
- **Directory Refactor:** Restructured `data_scraper/app/` to match the main server's `server/app/` layout (subdirectories for `api/v1`, `db`, and `models`).
- **Database:** Integrated **SQLModel** and **SQLite** to manage data locations and scraper runs.
- **Smart Sheet Handling:** Updated to store the unique **Google Sheet ID** (code) instead of full URLs, ensuring robust construction of export links.
- **Run Management:** 
    - Added `POST /api/v1/scraper/runs` to initiate background scraping.
    - Added `POST /api/v1/scraper/runs/{run_code}/cancel` to safely abort active runs.
    - **Partial Persistence:** Implemented row-level commits so data extracted before cancellation is preserved.
- **Sync Mechanism:** Added background sync to push enriched data directly to the Main Server via the new `POST /api/v1/places` endpoint.

### Main Server (`server/`)
- **Database Migration:** Migrated from in-memory stores to a permanent **SQLite database** (`pilgrimage.db`) using **SQLModel**.
- **Data Integrity:** Added primary keys, unique constraints, and foreign keys across all models (Users, Places, Reviews, Groups, etc.).
- **Automatic Refresh:** Maintained the "refresh from seed" policy on startup, now clearing the persistent database and re-populating it from `seed_data.json`.
- **New Sync Endpoint:** Added `POST /api/v1/places` to accept `PlaceCreate` schema data from the scraper service.
- **Schema Update:** Added `PlaceCreate` and updated existing schemas for SQLModel compatibility.

---

## PlaceDetail UX + Real Sites + Glass Nav (2026-02-15)

### Frontend (mobile)

- **PlaceDetailScreen — Fixed hero scroll:** Hero image now stays fixed behind content. Card with content slides smoothly over the hero as user scrolls (parallax effect preserved).
- **Layout — Apple glass tab bar:** Custom tab bar using `expo-blur` BlurView with frosted glass effect, pill-shaped active indicator with primary color glow.

### Frontend (web)

- **PlaceDetail — Fixed hero scroll:** Hero section now uses `position: fixed` with a spacer div, allowing content card to slide over it naturally.
- **Layout — Enhanced glass nav:** Mobile bottom nav updated with `backdrop-blur-2xl backdrop-saturate-150`, subtle shadow, and pill indicator with glow effect.

### Backend

- **Seed data — 10 real pilgrimage sites:** Replaced placeholder places with actual world-famous sites:
  - **Islamic (4):** Al-Masjid al-Haram (Mecca), Al-Masjid an-Nabawi (Medina), Al-Aqsa Mosque (Jerusalem), Sultan Ahmed Mosque (Istanbul)
  - **Hindu (3):** Kashi Vishwanath Temple (Varanasi), Tirumala Venkateswara Temple (Tirupati), Kedarnath Temple (Uttarakhand)
  - **Christian (3):** St. Peter's Basilica (Vatican), Church of the Holy Sepulchre (Jerusalem), Sanctuary of Our Lady of Lourdes (France)
- **Seed data — New translations:** Added `common.readLess`, `notifications.emptyDesc`, `places.closed`, `places.places`, `placeDetail.visits` to all 3 languages (en/ar/hi).
- **Fixed Material Icons:** Replaced invalid icons (`water_drop` → `opacity`, `access_time` → `schedule`, `escalator_warning` → `wc`) in places API.

---

## PlaceDetail: Unified Layout (Mobile + Web)

### Frontend (mobile)

- **PlaceDetailScreen — Single unified layout:** Replaced the four religion-specific layout variants (Mosque, Temple, Church, Generic) with a single unified screen for all place types. The layout is driven by the backend-supplied `timings` and `specifications` arrays, so the same component handles all religions without branching.
- **PlaceDetailScreen — Parallax hero:** Full-bleed hero image (300px) with `Animated.Image` parallax (30% translation on scroll). Sticky header with place name fades in as the user scrolls past the hero.
- **PlaceDetailScreen — Card overlap:** White card with rounded top corners (borderRadius 28) slides up 32px over the hero via negative margin.
- **PlaceDetailScreen — Scorecards:** Three scorecards in a bordered row below the hero: Distance (tappable, opens Google Maps), Crowd Level (colour-coded green/amber/red), Check-in count.
- **PlaceDetailScreen — The Story:** Description section with 5-line clamp and Read more / Read less toggle.
- **PlaceDetailScreen — Religion carousel:** Horizontal scrollable carousel renders `TimingCircle` (prayers / service times with past / current / upcoming state styling) or `DeityCircle` (deity image or 🛕 placeholder) sub-components from the `place.timings` array. Carousel title adapts to religion.
- **PlaceDetailScreen — Facilities grid:** 2-column grid of `specCard` tiles, each with a Material Icon, translated label, and value from the `place.specifications` array.
- **PlaceDetailScreen — Sticky footer:** Two-button footer: outlined Directions button (opens maps) + Check In widget (spinner → scale-bounce → Checked-in badge).

### Frontend (web)

- **PlaceDetail — Single unified layout:** Replaced four religion-specific return branches with one unified layout. Timings and specifications are rendered from backend-supplied arrays.
- **PlaceDetail — Hero:** Full-bleed hero (300px mobile / 380px desktop) with gradient overlays, glass Open/Closed and rating badges, place name, and address. Back, Share, and Favourite buttons in top bar.
- **PlaceDetail — Card overlap:** Content card with rounded top corners (`rounded-t-[2rem]`) slides 32px over the hero via `-mt-8`.
- **PlaceDetail — Scorecards:** Distance (links to Google Maps), Crowd Level (emerald/amber/red colour classes), Check-in count in a divided row.
- **PlaceDetail — The Story:** Description with `line-clamp-5` and Read more / Read less toggle.
- **PlaceDetail — Religion carousel:** Horizontal scrollable row of `TimingCircle` or `DeityCircle` components from `place.timings`. Carousel title adapts to religion.
- **PlaceDetail — Specifications grid:** 2-column grid on mobile, 2–3 columns on desktop, using `place.specifications` array.
- **PlaceDetail — Desktop 2-column layout:** `lg:grid lg:grid-cols-[1fr_360px]` with main content on the left and a sticky sidebar containing scorecards + action buttons on the right.
- **PlaceDetail — Mobile sticky footer:** Directions + Check-in buttons pinned to the bottom.

### Backend

- **`_build_timings()` — Unified timings format:** Returns a typed array (`type`, `name`, `time`, `status`, `subtitle`, `image_url`) for all religions:
  - **Islam:** Prayer circles with `past` / `current` / `upcoming` status computed from current UTC time.
  - **Hinduism:** Deity circles with `type: "deity"`, `name`, `subtitle`, `image_url`.
  - **Christianity:** Service time circles from `service_times_array` (preferred) or `service_times` dict, with today's status logic.
- **`_build_specifications()` — Unified specifications format:** Returns icon + i18n label + value for all religion-specific metadata (Islam: capacity, wudu_area, parking, womens_area; Hinduism: architecture, dress_code, next_festival, festival_dates; Christianity: denomination, founded_year, style, notable_features).
- **Seed data:** Added `crowd_level: "Low"` to all 6 places; `wudu_area`, `womens_area` fields to Islam places; `service_times_array` to Christianity places; `description` text to all places.

### Types (mobile + web)

- **`PlaceTiming`:** Extended with `status?: 'past' | 'current' | 'upcoming'`, `type?: 'prayer' | 'service' | 'deity'`, `subtitle?: string`, `image_url?: string`.

---

## Inline Check-In: PlaceDetail (Mobile + Web)

### Frontend (mobile)

- **PlaceDetailScreen — Inline check-in widget:** Removed navigation to the empty `CheckInScreen`. The Check In button is now an inline widget in the PlaceDetail footer that calls the API directly. While the request is in flight, the button shows a spinner. On success, a spring scale animation plays, then the button transitions to a non-interactive "Checked in {date}" badge (green, with check-circle icon). If the user already visited the place, the badge renders immediately on load.
- **PlaceDetailScreen — All religion layouts updated:** The inline widget is used in all four layout variants (Mosque, Temple, Church CTA, and the generic default footer).
- **CheckInScreen removed:** `CheckInScreen.tsx` deleted; `CheckIn` removed from `RootStackParamList` and the stack navigator.

### Frontend (web)

- **PlaceDetail — Inline check-in widget:** Removed the `Link` to `/places/:placeCode/check-in`. All layout variants (Mosque inline card, Temple bottom bar, Church CTA, generic footer) now use an inline `checkInWidget()` that calls the API directly. Loading state shows a spinning icon. The success state transitions to an emerald-green "Checked in {date}" display. On initial load, already-visited places show the badge immediately.
- **CheckIn page removed:** `CheckIn.tsx` deleted; `/places/:placeCode/check-in` route removed from the router.

---

## Mobile: PlaceCard Full-Image Redesign

### Frontend (mobile)

- **PlaceCard — Full-image layout:** Regular list-view cards now use the image as a full-bleed background (280 px tall, `rounded-3xl`) matching the design system. Removed the separate white body section below the image.
- **PlaceCard — Gradient overlay:** Two layered semi-transparent `View`s simulate the design's top-to-bottom dark gradient, ensuring badge and text legibility over any photo.
- **PlaceCard — Glass badge system:** Open/Closed status and Visited badges are now frosted-glass pills (semi-transparent white background, white border) anchored to the top-left and top-right of the card respectively. Closed badge uses a darker background for contrast. Open badge includes a `#34d399` green dot.
- **PlaceCard — Bottom glass info panel:** Place name, address with `location_on` pin icon, a hairline divider, and a meta row (distance + star-rating pill) are now inside an absolute-positioned glass-morphism panel at the card bottom.
- **PlaceCard — Check In button:** A white pill button labeled "CHECK IN" appears in the meta row for places not yet visited. Tapping it navigates to the PlaceDetail screen.
- **PlaceCard — Review count formatting:** Added `formatCount` helper to display review counts as `"2.4k"` / `"12k"` instead of raw integers.

---

## Mobile: Profile Fixes, Home Map UX, Filter System

### Frontend (mobile)

- **ProfileScreen — My Wishlist removed:** Removed duplicate "My Wishlist" row from Preferences section; "Favorites" row in the Account section now uses translation key `profile.favorites`.
- **ProfileScreen — Language bottom sheet:** Tapping the Language row now opens an inline bottom-sheet modal with all supported languages; selecting a language switches the app locale in-place without navigating to a separate settings page. Language row subtitle now shows the currently selected language name (e.g. "English") instead of a generic description.
- **ProfileScreen — Dynamic version:** App version now reads from `expo-constants` (`Constants.expoConfig?.version`) with fallback to `1.0.0`.
- **Settings screen removed:** `SettingsScreen.tsx` deleted and `Settings` removed from `RootStackParamList` and the stack navigator.
- **NotificationsScreen — Dark-mode theming:** Replaced static `StyleSheet.create()` with `makeStyles(isDark)` factory. All colors (backgrounds, card surfaces, text, borders) now adapt to dark mode using the same token mapping as other screens. Back button replaced with a 40×40 circular icon button (`arrow-back`) matching the design system.
- **HomeScreen — Header cleanup:** Removed redundant "EXPLORE" label above the greeting. Greeting changed to "Hello," (updated translation key `home.greeting`).
- **HomeScreen — Map horizontal scroller:** Removed the place-count badge from map view. Added a horizontal `FlatList` scroller at the bottom of the map showing places visible in the current map bounds. Bounds are tracked via Leaflet `moveend` events posted through `ReactNativeWebView.postMessage`. Scroller updates automatically as the user pans/zooms the map.
- **HomeScreen — Animated place card panel:** Tapping a map pin now dismisses the horizontal scroller and reveals an inline place detail card using a spring animation (`Animated.spring`, `bounciness: 4`). Tapping the × on the card reverses the animation. Both panels share a single `Animated.Value` interpolated for `opacity` and `translateY`.
- **HomeScreen — Filter system:** Removed filter pills below the search bar. Added a `tune` icon button on the right of the search bar with an active-state dot badge. Tapping it opens a filter bottom-sheet with:
  - Place type chips (Mosque / Shrine / Temple)
  - Feature filter chips sourced from the backend response (Open Now, Has Parking, Women's Area, Has Events, Top Rated) with live counts
  - "Apply Filters" button re-fetches places with selected filters

### Backend

- **`/api/v1/places` — New filter params:** Added `open_now`, `has_parking`, `womens_area`, `top_rated` query parameters (all `Optional[bool]`). Each applies a filter to the result set in `db/places.py`.
- **`/api/v1/places` — FiltersMetadata in response:** Response envelope changed from a plain places array to `{"places": [...], "filters": {"options": [...]}}`. Filter option counts are computed on a snapshot of the base result set (before boolean filters), so counts accurately reflect the available pool regardless of which filters are active.
- **`schemas.py`:** Added `FilterOption`, `FiltersMetadata`, and `PlacesListResponse` Pydantic models.

### Mobile API client + types

- **`types/index.ts`:** Added `FilterOption` and `PlacesListResponse` interfaces.
- **`api/client.ts`:** Updated `GetPlacesParams` with new filter fields; `getPlaces()` now returns `Promise<PlacesListResponse>`.

### i18n

- **`seed_data.json`:** Updated `home.greeting` (en: "Hello,", ar: "مرحبا،", hi: "नमस्ते,"). Added `profile.favorites`, `home.noPlacesVisible`, `home.filters`, `home.clearAll`, `home.filterType`, `home.filterFeatures`, `home.applyFilters`, `home.filter_mosque/shrine/temple`, `notifications.updatesLabel` for all three supported languages.

### Docs

- Updated `CHANGELOG.md`.

---

## Mobile: Profile Redesign, Home Map Toggle, Dark Mode Fix

### Frontend (mobile)

- **Dark mode fix:** Replaced static `StyleSheet.create()` in `ProfileScreen` and `HomeScreen` with `makeStyles(isDark: boolean)` factory functions called inside each component, so all styles (colors, borders, backgrounds) recompute immediately when `isDark` changes in `ThemeProvider`. Tab bar in `Layout.tsx` also respects dark mode (background and border color).
- **ProfileScreen rebuild:** Complete rewrite matching `FRONTEND_REWAMP_DARK/LIGHT` design. Header now shows bold display name + calendar icon + join date (no avatar circle). Stats replaced with a 2-column grid (Check-Ins, Reviews). Faith selector pills removed. New PREFERENCES card with My Path, Language, Notifications, My Wishlist (chevrons) and Dark Mode (Switch toggle, no chevron) as the last row. ACCOUNT section simplified to My Check-Ins and Favorites. Logout button added (red text, centered). Version string at bottom.
- **HomeScreen map embed:** Map view is now embedded directly in `HomeScreen` with a list/map toggle (two icon buttons in the header — list icon and map icon). The same search bar and filter chips apply to both views. Switching to map mode renders the Leaflet WebView with place markers; tapping a marker shows the existing bottom-sheet place detail modal. The separate Map bottom tab is removed.
- **Layout.tsx — 3 tabs:** Map tab removed. Bottom nav is now Explore, Groups, Profile (3 tabs). Tab bar background and border colors update correctly in dark mode.

### Backend / i18n

- **seed_data.json:** Added missing translation keys `settings.darkMode` ("Dark Mode" / "الوضع المظلم" / "डार्क मोड") and `profile.preferences` ("Preferences" / "التفضيلات" / "प्राथमिकताएं") for all three supported languages (en, ar, hi).

### Docs

- Updated `CHANGELOG.md`.

---

## Mobile UI & Feature Overhaul

### Frontend (mobile)

- **Navigation:** App now opens directly on the Home tab (Explore) on launch. The SplashScreen shows a loading spinner and immediately redirects to `Main` without showing auth buttons, removing the blocking onboarding gate.
- **Profile — Unauthenticated state:** When the user is not logged in, the Profile tab shows a full login landing page (hero image, app title, tagline, "Get Started" → Register, "Sign In" → Login) instead of a bare sign-in prompt.
- **Profile — Authenticated state:** Redesigned with proper MaterialIcons (settings, edit, assignment, favorite, group, chevron-right, dark-mode). Removed unicode symbol placeholders.
- **Profile — Dark mode toggle:** Added a `Switch` row directly in the Profile screen account section to toggle between light and dark mode, using the existing `ThemeProvider` context.
- **Places list cleanup:** Removed the inline `PlaceCardFull` component from `HomeScreen.tsx` (~100 lines of duplicated card code). The `FlatList` now uses the shared `PlaceCard` component, eliminating the duplicate card implementation. Updated search, filter, and map button icons with `MaterialIcons`.
- **Place detail:** Updated all icon buttons (back, share, favorite) across mosque, temple, church, and generic variants to use `MaterialIcons` (arrow-back, share, favorite, favorite-border, location-city, account-balance). Mosque footer reordered to match design: Directions (outline) | Check-in Here (primary blue). Generic footer also updated with proper icons.
- **Map page fix:** Root cause was that no map library was installed and `MapScreen` rendered a `ScrollView` list. Fixed by installing `react-native-webview` and embedding a Leaflet.js + OpenStreetMap map in a `WebView`. Place markers are rendered on the map; tapping a marker opens the existing bottom sheet. Map centers on user location, falling back to Mecca coordinates. Search bar overlays the map.
- **Icons — App-wide:** Replaced all unicode approximations (⊙, ◻, ◇, ○, ⌕, ›, ⚙, ⎘, ←, ♥, ♡, ⊕, ⊞) with `@expo/vector-icons` `MaterialIcons` across `Layout.tsx` (tab bar), `PlaceCard.tsx` (location-on, check-circle), `HomeScreen.tsx` (search, map, tune, location-off), `MapScreen.tsx` (search, close, directions, share, location-on, chevron-right), and `PlaceDetailScreen.tsx`.

### Docs

- Updated `CHANGELOG.md` with all mobile changes.

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
