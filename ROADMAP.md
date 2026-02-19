# Roadmap

This document tracks all planned features, improvements, and fixes across the pilgrimage-tracker monorepo. Items are organized by priority tier (P0 through P3) and category. Check off items as they are completed.

---

## P0 - Critical Fixes

Issues that will cause failures, deprecation breakage, or significant performance degradation. Must be resolved before production deployment.

### Deprecated Code

- [x] **Replace all `datetime.utcnow()` calls with `datetime.now(UTC)`**
  - `datetime.utcnow()` is deprecated in Python 3.12 and removed in Python 3.14. The codebase uses it in 10 files:
    - `server/app/core/security.py` (JWT expiration)
    - `server/app/db/store.py` (user updates, visitor timestamps, password resets)
    - `server/app/db/check_ins.py` (year counts, monthly/daily queries)
    - `server/app/db/notifications.py` (marking read)
    - `server/app/db/models.py` (default timestamps)
    - `server/app/db/review_images.py` (upload timestamps)
    - `server/app/api/v1/auth.py` (token creation)
    - `server/app/main.py` (error logging timestamps)
  - Fix: Import `from datetime import UTC` and replace `datetime.utcnow()` with `datetime.now(UTC)`. Update corresponding test files (`test_store.py`, `test_auth_extended.py`).

### Performance

- [x] **Fix N+1 query patterns in group listing**
  - File: `server/app/api/v1/groups.py` (lines 15-41)
  - `list_groups` makes 3 separate DB calls per group (members, last activity, progress). With 100 groups this becomes 300+ queries.
  - Fix: Batch-fetch members, activity, and progress in single queries, then map results in Python.

- [x] **Fix N+1 query pattern in favorites endpoint**
  - File: `server/app/api/v1/users.py` (lines 150-167)
  - `get_my_favorites` fetches each place and its images individually in a loop.
  - Fix: Use a single query with an `IN` clause for all favorite place codes, then batch-fetch images.

- [x] **Fix N+1 query pattern in place reviews**
  - File: `server/app/api/v1/places.py` (line 231)
  - `get_place_reviews` calls `get_review_images` per review in a loop.
  - Fix: Batch-fetch all review images for the place's reviews in one query.

### Incomplete Endpoints

- [x] **Implement place delete endpoint**
  - File: `server/app/api/v1/places.py` (lines 558-578)
  - Was returning 501 Not Implemented with no callers anywhere in the codebase.
  - Decision: Removed the endpoint entirely rather than implementing it, as it was unused and unimplemented.

---

## P1 - High Priority Improvements

Issues that significantly affect code quality, maintainability, user experience, or compliance with project rules.

### Backend Quality

- [ ] **Replace `print()` with structured logging**
  - Multiple files use `print()` for error output and debugging (e.g., `auth.py:66` logs password reset tokens to console, `places.py:455` prints image storage failures).
  - Fix: Use Python's `logging` module (or `structlog` for JSON output). Configure log levels per environment. Never log sensitive tokens in production.

- [ ] **Fix bare `except` clauses**
  - Files: `server/app/api/v1/auth.py` (lines 127-128, 163-164) — catches `Exception` with `pass` during visitor merge.
  - Fix: Catch specific exceptions (`ValueError`, `HTTPException`) instead of silencing all errors.

- [ ] **Add Alembic downgrade functions**
  - Migration files `0001_initial.py` and `0002_add_visitor.py` have `upgrade()` but empty `downgrade()`.
  - Fix: Implement `downgrade()` with `op.drop_table()` calls for safe rollbacks.

### Internationalization (i18n)

- [ ] **Fix remaining hardcoded UI strings on web**
  - `apps/web/src/app/pages/WriteReview.tsx:20-26` — Rating labels ("Poor", "Fair", "Good", "Very Good", "Excellent")
  - `apps/web/src/app/pages/Notifications.tsx:19-21` — Notification type labels ("Check-in", "Group update", "Notification")
  - `apps/web/src/components/common/ErrorBoundary.tsx:58,68,74` — "Something went wrong", "Try again", "Go home"
  - `apps/web/src/app/pages/CheckInsList.tsx:8` — Weekday labels `['S','M','T','W','T','F','S']`
  - `apps/web/src/app/pages/Groups.tsx:37` — Progress level "New"
  - `apps/web/src/app/pages/CreateGroup.tsx:63` — Share message "Join our group"
  - Fix: Add translation keys to `seed_data.json` for all three languages. Replace hardcoded strings with `t()` calls.

- [ ] **Fix remaining hardcoded UI strings on mobile**
  - `apps/mobile/src/components/places/PlaceCard.tsx:150` — "Visited" badge text
  - `apps/mobile/src/components/places/PlaceCard.tsx:188` — "Check In" button text
  - `apps/mobile/src/components/common/ErrorBoundary.tsx:56` — "Something went wrong"
  - `apps/mobile/src/app/screens/GroupsScreen.tsx:34-42` — Relative time strings ("just now", "m ago", "h ago", "d ago")
  - `apps/mobile/src/app/screens/GroupsScreen.tsx:48` — Progress level labels ("Done", "Lvl 1-5", "New")
  - Fix: Add corresponding translation keys and use `t()`. Ensure parity with web keys per Rule 14.

### Dark Mode Compliance

- [ ] **Fix dark mode token violations on web**
  - `apps/web/src/components/places/PlacesMap.tsx:186` — uses `dark:bg-gray-800` instead of `dark:bg-dark-surface`
  - `apps/web/src/components/common/ErrorBoundary.tsx:72` — uses `bg-gray-200 hover:bg-gray-300` instead of design tokens
  - Fix: Replace all `dark:bg-gray-*` / `dark:text-gray-*` with `dark:bg-dark-*` / `dark:text-dark-*` tokens per Rule 13.

- [ ] **Fix dark mode compliance on mobile**
  - `apps/mobile/src/components/common/ErrorBoundary.tsx` — Hardcoded light colors (#fee2e2, #ef4444), no `isDark` support
  - `apps/mobile/src/components/places/PlaceCard.tsx` — Hardcoded colors (#1e293b, rgba overlays) without dark mode adaptation
  - `apps/mobile/src/app/screens/LoginScreen.tsx` — Static styles, no `makeStyles(isDark)` pattern
  - `apps/mobile/src/app/screens/RegisterScreen.tsx` — Same as LoginScreen
  - Fix: Convert to `makeStyles(isDark)` pattern using `tokens.colors.dark*` values per Rule 13.

### Testing

- [ ] **Expand web frontend test coverage**
  - Currently only 2 test files (96 lines) covering `cn()`, `crowdColorClass()`, and `getFullImageUrl()`.
  - Add tests for: API client methods, auth context provider, i18n context, theme context, `useAuthRequired` hook, `imageUpload` utility, `share` utility, place-utils transformers.
  - Target: Match the 85% coverage threshold configured in `vitest.config.ts`.

- [ ] **Expand mobile frontend test coverage**
  - Currently only 1 test file (87 lines) covering `crowdColor()`, `getFullImageUrl()`, and constants.
  - Add tests for: API client methods, auth provider, i18n provider, theme provider, `useAuthRequired` hook, `imageUpload` utility (compression, validation), `mapBuilder`, `share` utility.
  - Target: Match the 85% coverage threshold configured in `jest.config.js`.

### Accessibility

- [ ] **Add accessibility attributes on mobile**
  - Most `TouchableOpacity` buttons lack `accessibilityLabel` and `accessibilityRole`.
  - Check-in buttons, favorite toggles, filter chips, map controls, and list items need labels.
  - Modal overlays need `accessibilityRole="dialog"`.
  - Loading and error states should use live regions for screen reader announcements.

- [ ] **Improve web accessibility**
  - Add `role="dialog"` and `aria-modal="true"` to modal components.
  - Add `aria-live="assertive"` to ErrorBoundary fallback for screen reader announcements.
  - Audit all interactive elements for keyboard navigation (tab order, Enter/Space activation).
  - Add skip-to-content link for keyboard users.

### Error Handling

- [ ] **Integrate error tracking service**
  - Both web and mobile ErrorBoundary components have TODO comments for Sentry/LogRocket integration.
  - Fix: Add `@sentry/react` (web) and `@sentry/react-native` (mobile). Configure DSN via environment variables. Send caught errors from ErrorBoundary `componentDidCatch`.

- [ ] **Add network error feedback on mobile**
  - API call failures show no user-facing feedback — loading states persist indefinitely on network errors.
  - Fix: Add network status detection (`@react-native-community/netinfo`). Show toast or banner when offline. Retry failed requests with exponential backoff.

---

## P2 - Feature Enhancements

New capabilities and meaningful UX improvements.

### User Features

- [ ] **Badges and achievements system**
  - The profile API returns a hardcoded `0` for badges (`server/app/api/v1/users.py:137` has a TODO).
  - Design badge criteria (e.g., "First Check-in", "10 Reviews", "Visited 5 Countries", "Early Adopter") with icons and descriptions. Create a `badges` table, a badge-evaluation service, and a `GET /api/v1/users/me/badges` endpoint. Show earned badges on the profile screen.

- [ ] **Push notifications**
  - The `Notification` model exists in the database but no push delivery mechanism is implemented.
  - Integrate Expo Push Notifications (mobile) and Web Push API (web). Send notifications for: new review on a favorited place, badge earned, check-in streak reminder.

- [ ] **Directions integration**
  - Add a "Directions" button on the place detail page. On mobile, deep link to Google Maps or Apple Maps with the place coordinates. On web, open Google Maps in a new tab.

- [ ] **Place photo gallery**
  - The detail page shows a single hero image. Many places have multiple photos in `place_images`.
  - Display a horizontal scrollable gallery at the top of the detail page. Tapping an image opens a full-screen viewer with swipe navigation.

- [ ] **Search history and suggestions**
  - The search bar has no memory. Users re-type the same queries repeatedly.
  - Store the last 10 search queries locally (AsyncStorage on mobile, localStorage on web). Display them as suggestions when the search bar is focused. Add a "Clear history" option.

- [ ] **Recently viewed places**
  - Track the last 20 viewed places in local storage. Display a "Recently Viewed" section on the home screen. Optionally persist server-side for cross-device sync.

- [ ] **Religion expansion**
  - The "View More Faiths" button in the UI is non-functional. Only Islam, Christianity, and Hinduism are supported.
  - Add Buddhism, Sikhism, Judaism, Baha'i, and Zoroastrianism. Seed places for each. Update filter chips, scraper religion configs, and translation keys for all three languages.

- [ ] **Multi-unit distance display**
  - The user settings model has a `units` field but the app always displays kilometers.
  - Read the user's unit preference and convert distances accordingly (km or mi). Update both frontends and the distance calculation utility.

- [ ] **Check-in streaks**
  - No gamification around consecutive daily check-ins.
  - Track current and longest streak on the user profile. Display a flame icon with the streak count. Send a push notification reminder if the streak is about to break. Award badges at 7, 30, and 100 day streaks.

- [ ] **Social sharing with rich previews**
  - Share buttons exist but produce plain text links with no preview metadata.
  - Generate Open Graph meta tags for place pages (title, description, image). On mobile, use the Share API with a pre-formatted message including the place name, rating, and a deep link.

### Backend Features

- [ ] **Place search autocomplete**
  - Current search uses a basic `LIKE` query which is slow and produces poor results.
  - Implement trigram-based search (`pg_trgm` extension) or a prefix index. Return results as the user types with debounced requests (300ms). Rank by relevance and popularity.

- [ ] **Analytics and tracking endpoint**
  - No visibility into user behavior (popular places, search patterns, drop-off points).
  - Add a `POST /api/v1/analytics/events` endpoint that accepts batched events. Store in a separate `analytics_events` table. Build a simple dashboard query for top places, active users, and check-in trends.

- [ ] **Admin panel and dashboard**
  - There is no admin interface. All data management requires direct database queries.
  - Build a minimal admin UI (can be a separate route group in the web app). Include: place CRUD, user management, review moderation queue, scraper status, and basic analytics.

- [ ] **Webhook and event system**
  - No mechanism for real-time notifications or external integrations.
  - Implement an internal event bus. When key actions occur (new review, check-in, badge earned), publish events. Consumers can send push notifications, update caches, or call external webhooks.

- [ ] **Geographic boundary management API**
  - Geographic boundaries (cities, regions) are seed-only. There is no CRUD API.
  - Add `GET/POST/PUT/DELETE /api/v1/geo-boundaries` endpoints for the admin panel and for expanding coverage to new regions.

### Frontend Features

- [ ] **Desktop layout optimization**
  - The web app uses a single-column layout on all screen sizes. Wide screens waste space.
  - Add a 2-column layout for the place detail page on screens wider than 1024px: left column for images and map, right column for details and reviews.

- [ ] **Onboarding tour for new users**
  - First-time users see the app with no guidance.
  - Show a brief guided tour on first login: highlight the search bar, explain filter chips, show how to check in, and point to the profile/favorites. Use a tooltip-based overlay. Store a `has_seen_onboarding` flag.

- [ ] **Success feedback for user actions**
  - Add/remove favorite, group join, check-in — none show a toast or confirmation on web.
  - Add a lightweight toast notification component. Show brief success messages for key user actions.

---

## P3 - Scalability and DevOps

Infrastructure, code quality, and optimization work to prepare for production scale.

### Infrastructure

- [ ] **Monitoring and structured logging**
  - No structured logging. Errors are printed to stdout and lost.
  - Add structured JSON logging with `structlog` or `python-json-logger`. Integrate Sentry for error tracking. Add request ID tracing across services. Set up basic dashboards for request latency, error rate, and database query time.

- [ ] **CDN for images**
  - Place and review images are stored as database blobs (`LargeBinary` in models.py). This causes database bloat and poor performance at scale.
  - Upload images to cloud storage (GCS, S3, or Cloudflare R2) and serve via CDN. Update image URLs in the database to point to the CDN. Add cache-control headers.

- [ ] **Background job queue**
  - FastAPI `BackgroundTasks` runs in the same process and provides no retry, persistence, or monitoring.
  - Set up Celery with Redis (or a lighter alternative like `arq`). Move email sending, image processing, badge evaluation, and analytics aggregation to background jobs.

- [ ] **API response compression**
  - Large JSON responses (place lists with images) are sent uncompressed.
  - Enable gzip or Brotli compression via FastAPI's `GZipMiddleware`. Expected 60-80% reduction in transfer size for JSON payloads.

- [ ] **Mobile CI/CD pipeline**
  - GitHub Actions deploys only the API (Cloud Run) and web (Firebase Hosting). No mobile build/deploy.
  - Add EAS Build workflow for iOS and Android. Trigger on tagged releases or manual dispatch. Upload to TestFlight / Google Play internal track.

- [ ] **Automated database backups**
  - No backup strategy. A database failure loses all data.
  - For production PostgreSQL: configure daily automated backups with 30-day retention. Document the restore procedure in PRODUCTION.md.

- [ ] **Load testing**
  - No performance benchmarks exist. Unknown how the API behaves under concurrent load.
  - Write Locust or k6 scripts for critical paths: place listing, place detail, search, check-in, and review submission. Run against a staging environment and document results.

- [ ] **API versioning strategy**
  - All endpoints are under `/api/v1/`. There is no plan for breaking changes.
  - Document the versioning policy: v1 is supported for 12 months after v2 launch. Breaking changes require a new version. Use URL-based versioning (`/api/v2/`).

### Optimization

- [ ] **Response caching**
  - Every request hits the database, even for data that changes infrequently.
  - Cache translations (changes only on deploy), place lists (cache for 5 minutes with invalidation on write), and religion/category metadata (cache for 1 hour). Use Redis or in-memory caching with TTL.

- [ ] **Image optimization pipeline**
  - Images are stored and served at their original size and format.
  - Resize images to standard dimensions (thumbnail: 200px, card: 600px, full: 1200px) on upload. Convert to WebP format. Store multiple sizes and serve the appropriate one based on context.

- [ ] **Frontend bundle optimization**
  - Routes are lazy-loaded but no further code splitting is configured.
  - Configure Vite's `manualChunks` to separate vendor code (React, Leaflet, etc.). Analyze the bundle with `rollup-plugin-visualizer` and eliminate large unused dependencies.

### Code Quality

- [ ] **Use enums for magic string literals**
  - Status strings ("open", "closed", "unknown"), review sources ("user", "external", "google"), and other magic literals are scattered across backend code.
  - Define Python `StrEnum` types and use them in models and endpoint logic for type safety and autocomplete.

- [ ] **Migrate web class names to `cn()` utility**
  - `apps/web/src/lib/utils/cn.ts` has a TODO noting ~40 components use template literal className patterns.
  - Gradually migrate to the `cn()` utility for cleaner conditional class handling. Low priority but improves maintainability.

---

## How to Use This File

1. Pick items from the highest uncompleted priority tier first (P0 before P1, etc.).
2. Check off items as they are completed by replacing `[ ]` with `[x]`.
3. When committing a completed item, reference the roadmap entry in the commit message (e.g., "Fix N+1 in group listing (ROADMAP P0)").
4. Review this file during sprint planning to select work items.
5. Add new items to the appropriate tier as they are discovered.
