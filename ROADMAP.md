# Roadmap

This document tracks all planned features, improvements, and fixes across the pilgrimage-tracker monorepo. Items are organized by priority tier (P0 through P4) and category. Check off items as they are completed.

---

## P0 - Critical Fixes

Bugs that crash or break core functionality. These must be resolved before any other work.

### Server Crashes and Data Corruption

- [x] **Fix `delete_review` crash in reviews endpoint**
  - File: `server/app/api/v1/reviews.py` (lines 44-49)
  - The delete handler references in-memory caches (`reviews_by_code`, `reviews_by_place`, `reviews_by_user`) that do not exist. The function will raise a `NameError` on every call.
  - Fix: Replace the in-memory cache logic with a proper SQLModel `session.delete()` call followed by `session.commit()`, consistent with how other delete operations work in the codebase.

- [x] **Fix `image_urls` attribute access on Place model**
  - File: `server/app/api/v1/users.py` (lines 70-71, 78, 144)
  - Code accesses `.image_urls` on the `Place` model, but that attribute does not exist on the SQLModel schema. This will raise an `AttributeError` whenever user profile data includes visited places.
  - Fix: Use `place_images.get_images(place_code)` to retrieve image URLs, or add image data through the proper PlaceImage relationship.

- [x] **Fix JWT expiration ignoring configuration**
  - File: `server/app/core/security.py` (line 18)
  - Token expiration is hardcoded to 7 days regardless of what `JWT_EXPIRE` is set to in the environment or settings.
  - Fix: Parse the `JWT_EXPIRE` setting (support formats like `"7d"`, `"24h"`, or integer minutes) and use the parsed value when computing the `exp` claim.

---

## P1 - High Priority Improvements

Issues that do not crash the app but significantly affect security, reliability, or performance.

### Security

- [x] **Implement actual email sending for password reset**
  - File: `server/app/api/v1/auth.py`
  - The forgot-password endpoint generates a reset token but only prints it to the console. No email is ever sent.
  - Integrated Resend.com (`resend` library). Sends a password-reset link via `RESEND_API_KEY` / `RESEND_FROM_EMAIL`. Falls back to console log when `RESEND_API_KEY` is unset (dev). Added `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and `RESET_URL_BASE` to config and `.env.example`.

- [x] **Add rate limiting to auth endpoints**
  - Endpoints: `/api/v1/auth/login`, `/api/v1/auth/register`, `/api/v1/auth/forgot-password`
  - There is no rate limiting, making brute-force and credential-stuffing attacks trivial.
  - Added `slowapi` (in-memory, per-IP): 5 req/min on login, 3 req/min on register, 2 req/min on forgot-password.

- [x] **Validate untyped input fields**
  - `PlaceAttributeInput.value` accepts `Any` with no validation. Malicious payloads could be stored directly.
  - `PlaceCreate.google_reviews` accepts `List[dict]` with no schema enforcement.
  - Added `ExternalReviewInput` Pydantic model with explicit typed fields (`author_name`, `rating`, `text`, `time`, `language`). Constrained `PlaceAttributeInput.value` to `str | int | float | bool | list[str]` (dict rejected).

- [x] **Review and tighten CORS configuration**
  - The server currently allows all origins (`*`) in development mode. This is acceptable for local dev but must not reach production.
  - Already environment-aware: `CORS_ORIGINS` env var restricts origins; defaults to localhost only. Documented in `.env.example`.

- [x] **Add refresh token rotation**
  - Current JWT tokens last 7 days with no refresh mechanism. If a token is stolen, it is valid for the entire duration.
  - Implemented: short-lived access tokens (30 min, configurable via `JWT_EXPIRE`), long-lived refresh tokens (30 days, configurable via `REFRESH_EXPIRE`) stored in HTTP-only `SameSite=Strict` cookies. Added `RefreshToken` DB model, `POST /auth/refresh` (rotates on use), and `POST /auth/logout` (revokes token + clears cookie).

- [x] **Enforce password strength on the backend**
  - The web frontend enforces a minimum of 6 characters, but the backend has no validation at all. A single-character password is accepted.
  - Added server-side validation to `RegisterBody` and `ResetPasswordBody`: minimum 8 characters, at least one uppercase letter, one lowercase letter, and one digit. Returns 422 with clear message.

### Reliability

- [x] **Add React Error Boundaries to both frontends**
  - Neither `apps/web` nor `apps/mobile` has error boundaries. A single component crash takes down the entire app.
  - Wrap major route-level components in an `ErrorBoundary` that shows a fallback UI ("Something went wrong") and logs the error. On mobile, add a "Retry" button that resets the boundary.

- [x] **Handle individual place failures in scraper sync**
  - File: `data_scraper/sync.py`
  - When the scraper POSTs places to the server, a failure on one place silently stops or skips without logging. The operator has no visibility into what failed.
  - Wrap each POST in a try/except, log the place code and error, continue with the remaining places, and print a summary at the end (e.g., "Synced 47/50 places. 3 failures logged.").

- [x] **Fix unsafe session handling in place_images.py**
  - File: `server/app/services/place_images.py`
  - Uses `next(get_session())` which manually advances a generator without proper cleanup. This can leak database connections under load.
  - Refactor to accept a `Session` parameter via dependency injection, or use a context manager (`with get_session() as session:`).

- [x] **Add health check endpoint to the scraper service**
  - The server exposes `/health` but the scraper has no equivalent. Deployment orchestrators (Docker, Cloud Run) need a health probe.
  - Add a `/health` endpoint to the scraper that returns `{"status": "ok"}` and checks database connectivity.

- [x] **Implement database migrations with Alembic**
  - The current seed script drops and recreates all tables, destroying existing data. This is not viable for any environment beyond local dev.
  - Initialize Alembic, generate an initial migration from the current SQLModel metadata, and replace the drop-and-recreate logic with `alembic upgrade head`. Document the migration workflow in `server/README.md`.

### Performance

- [x] **Implement rating sort for places**
  - File: `server/app/api/v1/places.py` (lines 278-280)
  - The `sort=rating` query parameter is accepted but the implementation body is empty. Results are returned unsorted.
  - Already implemented in `server/app/db/places.py`: `pass` at sort decision point skips proximity sort; rating sort applied after all filters via `result.sort(key=lambda x: (_get_avg(x[0].place_code), -(x[1] or 0)), reverse=True)`.

- [x] **Batch sync for scraper**
  - The scraper currently POSTs one place at a time, resulting in N HTTP requests for N places. This is slow and generates excessive overhead.
  - Added `POST /api/v1/places/batch` endpoint (`server/app/api/v1/places.py`) accepting `PlaceBatch` (list of `PlaceCreate`). Returns `{total, synced, failed, results}`. Updated `sync_run_to_server` in `data_scraper/app/db/scraper.py` to send in batches of 25 (`BATCH_SIZE=25`) with fallback to individual POSTs.

- [x] **Add image caching on mobile**
  - Every scroll of a list reloads images from the network. This wastes bandwidth and causes visible flicker.
  - Already implemented: `apps/mobile/src/components/places/PlaceCard.tsx` uses `expo-image` with `cachePolicy="memory-disk"` and `transition={200}`.

- [x] **Memoize expensive React components**
  - `PlaceCard` and `FilterChip` re-render on every parent state change even when their props have not changed.
  - Mobile: `PlaceCard` and `FilterChip` already export `React.memo()`. Web: wrapped `PlaceCardUnified` and `FilterChip` in `React.memo()`.

- [x] **Break up oversized screen components**
  - `HomeScreen.tsx` (mobile, 925 lines), `PlaceDetailScreen.tsx` (mobile, 1070 lines), and `PlaceDetail.tsx` (web, 750 lines) are too large to maintain or test.
  - Mobile: extracted `PlaceScorecardRow`, `PlaceTimingsCarousel`, `PlaceSpecificationsGrid`, `PlaceReviewsList` into `apps/mobile/src/components/places/`. Web: extracted `PlaceOpeningHours`, `PlaceTimingsCarousel`, `PlaceSpecificationsGrid` into `apps/web/src/components/places/`. Eliminated code duplication between mobile/desktop layouts in `PlaceDetail.tsx`.

- [x] **Lazy load web routes**
  - The web app bundles all page components into a single chunk. First load downloads code for every route.
  - Converted all 18 page imports in `apps/web/src/app/routes.tsx` to `React.lazy()`. Wrapped `<Routes>` in `<Suspense fallback={<PageLoader />}>` with a spinner fallback.

---

## P2 - Feature Enhancements

New capabilities and meaningful UX improvements.

### User Features

- [ ] **Badges and achievements system**
  - The profile API returns a hardcoded `0` for badges. No badge logic exists.
  - Design badge criteria (e.g., "First Check-in", "10 Reviews", "Visited 5 Countries", "Early Adopter") with icons and descriptions. Create a `badges` table, a badge-evaluation service, and a `GET /api/v1/users/me/badges` endpoint. Show earned badges on the profile screen.

- [ ] **Place deletion endpoint**
  - There is no way to remove a place from the system. Incorrect or duplicate entries persist forever.
  - Add `DELETE /api/v1/places/:placeCode` (admin-only). Cascade-delete related reviews, images, check-ins, and favorites. Return 204 on success.

- [ ] **Push notifications**
  - The `Notification` model exists in the database but no push delivery mechanism is implemented.
  - Integrate Expo Push Notifications (mobile) and Web Push API (web). Send notifications for: new review on a favorited place, badge earned, check-in streak reminder.

- [ ] **Social sharing with rich previews**
  - Share buttons exist but produce plain text links with no preview metadata.
  - Generate Open Graph meta tags for place pages (title, description, image). On mobile, use the Share API with a pre-formatted message including the place name, rating, and a deep link.

- [ ] **Edit profile photo**
  - There is currently no UI flow to change the user avatar after account creation.
  - Add an edit icon overlay on the profile photo. Tapping it opens the image picker, uploads the new photo, and refreshes the profile display.

- [ ] **Search history and suggestions**
  - The search bar has no memory. Users re-type the same queries repeatedly.
  - Store the last 10 search queries locally (AsyncStorage on mobile, localStorage on web). Display them as suggestions below the search bar when it is focused. Add a "Clear history" option.

- [ ] **Recently viewed places**
  - There is no record of which places a user has viewed.
  - Track the last 20 viewed places in local storage. Display a "Recently Viewed" section on the home screen below the main content. Optionally persist server-side for cross-device sync.

- [ ] **Place photo gallery**
  - The detail page shows a single hero image. Many places have multiple photos available.
  - Display a horizontal scrollable gallery at the top of the detail page. Tapping an image opens a full-screen viewer with swipe navigation. Pull images from `place_images`.

- [ ] **Religion expansion**
  - The "View More Faiths" button in the UI is non-functional. Only Islam, Christianity, and Hinduism are supported.
  - Add Buddhism, Sikhism, Judaism, Baha'i, and Zoroastrianism. Seed places for each. Update filter chips, scraper religion configs, and translation keys for all three languages.

- [ ] **Multi-unit distance display**
  - The user settings model has a `units` field but the app always displays kilometers.
  - Read the user's unit preference and convert distances accordingly (km or mi). Update both frontends and the distance calculation utility.

- [ ] **Check-in streaks**
  - No gamification around consecutive daily check-ins.
  - Track the current streak and longest streak on the user profile. Display a flame icon with the streak count. Send a push notification reminder if the streak is about to break. Award a badge at 7, 30, and 100 day streaks.

- [ ] **Place suggestions and corrections**
  - Users cannot report inaccurate information about a place.
  - Add a "Suggest an edit" button on the detail page. Create a `place_suggestions` table and `POST /api/v1/places/:placeCode/suggestions` endpoint. Build an admin review queue for suggestions.

### Backend Features

- [ ] **Configurable timezone for scrapers**
  - The scraper hardcodes a UTC+4 offset (UAE timezone). Running it from another region produces incorrect timestamps.
  - Add a `SCRAPER_TIMEZONE` environment variable (e.g., `Asia/Dubai`). Use `pytz` or `zoneinfo` to localize timestamps.

- [ ] **Batch place creation endpoint**
  - For efficient scraper sync (see P1 batch sync item).
  - `POST /api/v1/places/batch` accepts `{"places": [...]}`, validates each, inserts in a single transaction, and returns a result summary with successes and failures.

- [ ] **Place search autocomplete**
  - Current search uses a basic `LIKE` query which is slow and produces poor results.
  - Implement trigram-based search (`pg_trgm` extension) or a prefix index. Return results as the user types with debounced requests (300ms). Rank by relevance and popularity.

- [ ] **Analytics and tracking endpoint**
  - No visibility into user behavior (popular places, search patterns, drop-off points).
  - Add a `POST /api/v1/analytics/events` endpoint that accepts batched events. Store in a separate `analytics_events` table. Build a simple dashboard query for top places, active users, and check-in trends.

- [ ] **Admin panel and dashboard**
  - There is no admin interface. All data management requires direct database queries.
  - Build a minimal admin UI (can be a separate route group in the web app or a standalone tool). Include: place CRUD, user management, review moderation queue, scraper status, and basic analytics.

- [ ] **Webhook and event system**
  - No mechanism for real-time notifications or external integrations.
  - Implement an internal event bus. When key actions occur (new review, check-in, badge earned), publish events. Consumers can send push notifications, update caches, or call external webhooks.

- [ ] **Place verification system**
  - No way to distinguish verified places from user-submitted or scraped data.
  - Add a `verified` boolean and `verified_by` field to the Place model. Allow trusted users or admins to mark places as verified. Display a verification badge on the detail page.

- [ ] **Review moderation**
  - All reviews are published immediately with no oversight.
  - Add a `status` field to reviews (`pending`, `approved`, `rejected`). New reviews from users below a trust threshold start as `pending`. Build a moderation queue in the admin panel.

- [ ] **API pagination improvements**
  - Some list endpoints use simple limit/offset which performs poorly on large datasets.
  - Implement cursor-based pagination using the `place_code` or `created_at` as the cursor. Return `next_cursor` in the response. Update the frontend to pass the cursor on subsequent requests.

- [ ] **Geographic boundary management API**
  - Geographic boundaries (cities, regions) are seed-only. There is no CRUD API for managing them at runtime.
  - Add `GET/POST/PUT/DELETE /api/v1/geo-boundaries` endpoints. Useful for admin panel and for expanding coverage to new regions.

### Frontend Features

- [x] **Loading skeleton screens**
  - All loading states display plain "Loading..." text, which feels unpolished.
  - Create skeleton components that match the shape of the content they replace (card skeletons, detail page skeletons, list item skeletons). Use CSS animation for the shimmer effect.

- [x] **Pull-to-refresh on mobile**
  - List screens do not support pull-to-refresh. Users must navigate away and back to refresh.
  - Wrap `FlatList` and `ScrollView` components with `RefreshControl`. Trigger the appropriate data fetch on pull.

- [x] **Infinite scroll for lists**
  - Place lists use a fixed page size with no mechanism to load more.
  - Implement `onEndReached` on mobile `FlatList` and an `IntersectionObserver` on web to trigger loading the next page. Show a spinner at the bottom while loading.

- [x] **Swipe gestures on mobile**
  - No swipe interactions exist. Common mobile patterns are missing.
  - Add swipe-to-delete on favorites list, swipe between images in the gallery, and swipe to dismiss the detail page back to the list.

- [x] **Haptic feedback on mobile**
  - Check-in and favorite toggle have no tactile feedback.
  - Use `expo-haptics` to trigger a light impact on favorite toggle, a medium impact on check-in, and a success notification on badge earned.

- [ ] **Map marker clustering**
  - When zoomed out, overlapping markers create an unreadable mess.
  - Use `react-native-map-clustering` on mobile and a clustering library (e.g., Supercluster) on web. Show cluster count badges that expand on tap.

- [ ] **Directions integration**
  - Users cannot get navigation directions to a place from within the app.
  - Add a "Directions" button on the detail page. On mobile, deep link to Google Maps or Apple Maps with the place coordinates. On web, open Google Maps in a new tab.

- [ ] **Accessibility improvements**
  - No ARIA labels, poor screen reader support, incomplete keyboard navigation.
  - Audit all interactive elements. Add `aria-label`, `role`, and `tabIndex` attributes on web. Add `accessibilityLabel` and `accessibilityRole` on mobile. Ensure all actions are reachable via keyboard.

- [ ] **Desktop layout optimization**
  - The web app uses a single-column layout on all screen sizes. Wide screens waste space.
  - Add a 2-column layout for the place detail page on screens wider than 1024px: left column for images and map, right column for details and reviews.

- [ ] **Onboarding tour for new users**
  - First-time users see the app with no guidance.
  - Show a brief guided tour on first login: highlight the search bar, explain filter chips, show how to check in, and point to the profile/favorites. Use a tooltip-based overlay. Store a `has_seen_onboarding` flag.

---

## P3 - Scalability and DevOps

Infrastructure, code quality, and optimization work to prepare for production and growth.

### Infrastructure

- [ ] **Database migrations with Alembic** (see also P1 reliability)
  - Initialize Alembic in the `server/` directory. Generate the initial migration. Replace all `SQLModel.metadata.create_all()` calls in seed scripts with migration-based schema management. Document the migration commands in the README.

- [ ] **CI/CD pipeline with GitHub Actions**
  - No automated checks run on pull requests or merges.
  - Create workflows for: Python linting and tests (server, scraper), TypeScript linting and build (web, mobile), Docker image build verification. Deploy to staging on merge to `main`. Deploy to production on tagged releases.

- [ ] **Docker Compose for local development**
  - Starting the full stack requires manually running three services in separate terminals.
  - Create a `docker-compose.yml` that starts the server, scraper, PostgreSQL, and optionally the web frontend. Map volumes for hot reload. Document the single-command startup in the root README.

- [ ] **Monitoring and logging**
  - No structured logging. Errors are printed to stdout and lost.
  - Add structured JSON logging with `structlog` or `python-json-logger`. Integrate Sentry for error tracking. Add request ID tracing across services. Set up basic dashboards for request latency, error rate, and database query time.

- [ ] **CDN for images**
  - Place images are served through the API server, adding load and latency.
  - Upload images to cloud storage (GCS, S3, or Cloudflare R2) and serve via CDN. Update image URLs in the database to point to the CDN. Add cache-control headers.

- [ ] **Background job queue**
  - FastAPI `BackgroundTasks` runs in the same process and provides no retry, persistence, or monitoring.
  - Set up Celery with Redis (or a lighter alternative like `arq`). Move email sending, image processing, badge evaluation, and analytics aggregation to background jobs.

- [ ] **API versioning strategy**
  - All endpoints are under `/api/v1/`. There is no plan for breaking changes.
  - Document the versioning policy: v1 is supported for 12 months after v2 launch. New features go into the latest version. Breaking changes require a new version. Use URL-based versioning (`/api/v2/`).

- [ ] **Load testing**
  - No performance benchmarks exist. Unknown how the API behaves under concurrent load.
  - Write Locust or k6 scripts for the critical paths: place listing, place detail, search, check-in, and review submission. Run against a staging environment and document the results.

- [ ] **Automated database backups**
  - No backup strategy. A database failure loses all data.
  - For production PostgreSQL: configure daily automated backups with 30-day retention. For SQLite (dev): add a cron job or script that copies the database file. Document the restore procedure.

- [ ] **Proper staging environment**
  - There is no staging environment. Changes are tested locally and deployed directly to production.
  - Set up a staging deployment that mirrors production (same services, same database engine, same env vars with different values). Gate production deploys behind staging verification.

### Code Quality

- [ ] **Add backend tests with pytest**
  - No test files exist anywhere in the server or scraper directories.
  - Set up pytest with fixtures for database sessions, authenticated clients, and seeded data. Write tests for: auth flow, place CRUD, review CRUD, check-in, favorites, search, and the scraper sync. Target 80% coverage for critical paths.

- [ ] **Add frontend tests**
  - No test files exist in either frontend app.
  - Set up Vitest for `apps/web` and Jest for `apps/mobile`. Write tests for: API client functions, utility functions, and critical user flows (login, search, check-in). Add React Testing Library for component tests.

- [ ] **Linting configuration**
  - No linters are configured for any part of the codebase.
  - Add ESLint and Prettier for both frontend apps (shared config in the monorepo root). Add Ruff for the Python backend and scraper. Add configs to enforce consistent style.

- [ ] **Type safety improvements**
  - Several Python functions use `Any` type hints. TypeScript code has areas with implicit `any`.
  - Audit and replace `Any` with specific types in Python. Enable `strict` mode in TypeScript configs. Fix all resulting type errors.

- [ ] **API documentation refinement**
  - FastAPI auto-generates OpenAPI docs but the schemas lack descriptions and examples.
  - Add `description`, `example`, and `summary` to all Pydantic models and endpoint functions. Group endpoints with tags. Add response examples for common error cases.

- [ ] **Generate TypeScript types from FastAPI schemas**
  - Frontend type definitions are manually maintained and can drift from the backend.
  - Use `openapi-typescript` or a similar tool to generate TypeScript interfaces from the OpenAPI spec. Add a script to regenerate on schema changes. Replace manually-defined API types.

- [ ] **Git hooks with pre-commit**
  - No automated checks run before commits. Unformatted or broken code can be committed.
  - Install `pre-commit` and configure hooks for: Ruff (Python), ESLint (TypeScript), Prettier (TypeScript/JSON/YAML), trailing whitespace, and merge conflict markers.

- [ ] **Code coverage tracking**
  - No coverage data is collected.
  - Configure pytest-cov for the backend and c8/istanbul for the frontends. Add coverage reports to CI. Set a minimum threshold (e.g., 60%) that fails the build if not met. Track trends over time.

### Optimization

- [ ] **Database indexing**
  - No explicit indexes beyond primary keys. Common queries scan full tables.
  - Add indexes for: `places.religion`, `places.city`, `reviews.place_code`, `reviews.user_code`, `check_ins.user_code`, `check_ins.place_code`, `favorites.user_code`. Measure query performance before and after.

- [ ] **Response caching**
  - Every request hits the database, even for data that changes infrequently.
  - Cache translations (changes only on deploy), place lists (cache for 5 minutes with invalidation on write), and religion/category metadata (cache for 1 hour). Use Redis or in-memory caching with TTL.

- [ ] **Connection pooling optimization**
  - Default SQLAlchemy pool settings may not be optimal for production PostgreSQL.
  - Configure `pool_size`, `max_overflow`, `pool_timeout`, and `pool_recycle` based on expected concurrency. Use `pool_pre_ping` to handle stale connections. Document the recommended settings for different deployment sizes.

- [ ] **Frontend bundle optimization**
  - No code splitting configured. The entire app is in one bundle.
  - Enable code splitting via dynamic imports (see P1 lazy loading). Configure Vite's `manualChunks` to separate vendor code. Analyze the bundle with `rollup-plugin-visualizer` and eliminate large unused dependencies.

- [ ] **Image optimization pipeline**
  - Images are stored and served at their original size and format.
  - Resize images to standard dimensions (thumbnail: 200px, card: 600px, full: 1200px) on upload. Convert to WebP format. Store multiple sizes and serve the appropriate one based on context.

- [ ] **API response compression**
  - Large JSON responses (place lists with images) are sent uncompressed.
  - Enable gzip or Brotli compression in the FastAPI middleware. Verify that the frontend correctly handles compressed responses. Expected 60-80% reduction in transfer size for JSON payloads.

---

## P4 - Design Alignment

Bring both frontends into visual parity with the design references (`FRONTEND_REWAMP_LIGHT.html` and `FRONTEND_REWAMP_DARK.html`).

### Screen-by-Screen Design Parity

For each screen, compare the current implementation against both the light and dark design files. Fix discrepancies in layout, spacing, color, typography, and iconography.

- [ ] **Place Detail screen**
  - Hero image with bottom gradient overlay (linear-gradient from transparent to background color)
  - Scorecard layout: rating, reviews count, check-ins count in a horizontal row with dividers
  - Timings carousel: horizontally scrollable day cards with current day highlighted
  - Specifications grid: 2-column grid of place attributes with icons
  - Review cards: avatar, name, date, star rating, review text with consistent padding
  - Sticky footer: check-in button and favorite toggle always visible at bottom

- [ ] **Sign In screen**
  - Centered logo at top with correct size and spacing
  - Input fields: rounded corners (12px), border color matching design tokens, proper focus ring
  - Primary CTA button: full-width, correct background color, font weight, and border radius
  - "Forgot password" and "Sign up" links positioned and styled per design

- [ ] **Sign Up screen**
  - Back button: arrow icon in top-left, correct size and tap target
  - Religion selection: horizontal scrollable pill buttons with selected state (filled vs outlined)
  - Input fields: same styling as sign-in, consistent vertical spacing
  - Password requirements hint text below password field

- [ ] **Home / Explore screen**
  - Greeting: "Salam, {name}" with correct font size and weight (Lexend)
  - Search bar: glass morphism effect, search icon, placeholder text
  - Filter chips: horizontal scroll, selected chip uses primary color fill, unselected uses outline
  - Map view: map fills available space, glass panel overlays bottom portion with place cards
  - Bottom navigation: glass effect background, active tab indicator, correct icon set (Material Symbols)

- [ ] **Check-ins History screen**
  - Stats card: total check-ins, current streak, longest streak in a glass card
  - Calendar grid: month view with dots on days with check-ins, current day highlighted
  - Recent visits list: place card with thumbnail, name, date, and time
  - "On this Day" section: historical check-ins from the same date in previous years

### Component-Level Design Tasks

- [x] **Glass morphism panels**
  - Ensure all glass panels use `backdrop-blur-md` (or equivalent), correct background opacity (`bg-white/70` light, `bg-gray-900/70` dark), and a subtle border (`border-white/20`).

- [x] **Badge system styling**
  - Status badges (Open/Closed): pill shape, green for open, red for closed, white text
  - Rating pills: star icon + number, yellow background
  - Visited indicators: checkmark overlay on place cards the user has visited

- [x] **Card styling**
  - Shadow: `shadow-md` or equivalent elevation
  - Border radius: 16px for cards, 12px for inner elements
  - Padding: 16px internal padding, 12px gap between cards in lists

- [x] **Button variants**
  - Primary: solid fill with primary color, white text, 12px border radius
  - Secondary: lighter fill with primary color at 10% opacity, primary color text
  - Outline: transparent fill, 1px border in primary color, primary color text
  - Glass: backdrop-blur with semi-transparent background, white text

- [x] **Input field styling**
  - Border radius: 12px
  - Border: 1px solid with muted color, transitions to primary color on focus
  - Placeholder: muted text color, correct font size
  - Focus state: primary color border with subtle glow/ring

- [x] **Bottom navigation bar**
  - Glass effect: `backdrop-blur-lg`, semi-transparent background
  - Active tab: primary color icon, label visible
  - Inactive tab: muted color icon, no label (or smaller label)
  - Safe area spacing on devices with home indicators

- [x] **Overlay gradients**
  - Hero image gradient: `linear-gradient(to bottom, transparent 40%, background-color 100%)`
  - Match gradient stops and colors exactly between light and dark modes
  - Gradient should be strong enough to ensure text readability over any image

- [x] **Animation and motion**
  - Check-in: spring physics animation (scale up then settle) with haptic feedback
  - Favorite toggle: heart icon scale animation on press
  - Parallax scroll: hero image moves at 0.5x scroll speed on detail pages
  - Screen transitions: smooth slide animations between routes
  - Skeleton shimmer: left-to-right gradient animation at 1.5s interval

---

## How to Use This File

1. Pick items from the highest uncompleted priority tier first (P0 before P1, etc.).
2. Check off items as they are completed by replacing `[ ]` with `[x]`.
3. When committing a completed item, reference the roadmap entry in the commit message (e.g., "Fix delete_review crash (ROADMAP P0)").
4. Review this file during sprint planning to select work items.
5. Add new items to the appropriate tier as they are discovered.
