# Roadmap

This document is the **single unified roadmap** for the entire SoulStep monorepo. It contains only **uncompleted** items, organized by priority tier (P0 through P3). Items are removed when done — check git history for completed work.

> **Last updated:** 2026-03-16

---

## P0 — Critical / Pre-Production

Security and stability items that **must** be resolved before any public production deployment.

### Security

- [ ] **Add rate limiting to token refresh endpoint**
  - The `/auth/refresh` endpoint is currently unprotected. An attacker with a valid refresh token can generate unlimited access tokens.
  - Apply `slowapi` rate limit of 10/min per IP. Add to the same rate-limiter setup already in `auth.py`.
  - Files: `soulstep-catalog-api/app/api/v1/auth.py`

- [ ] **Implement account lockout after failed login attempts**
  - No lockout exists. Brute-force attacks against known usernames are unrestricted beyond the general login rate limit.
  - Lock account for 15 minutes after 10 failed attempts. Track failed attempts in DB or Redis. Return `423 Locked` with `Retry-After` header.
  - Files: `soulstep-catalog-api/app/api/v1/auth.py`, `soulstep-catalog-api/app/db/models.py`

- [ ] **Add rate limiting on admin API endpoints**
  - Admin endpoints have no rate limits. A compromised admin token can exfiltrate all data or trigger bulk operations without throttling.
  - Apply 60/min per token to all `/api/v1/admin/*` routes. Add stricter limits (10/min) on bulk-write operations.
  - Files: `soulstep-catalog-api/app/main.py`, `soulstep-catalog-api/app/api/v1/admin/*.py`

- [ ] **Enforce HTTPS redirect in production**
  - No middleware forces HTTPS. HTTP requests to the production API are not redirected.
  - Add `HTTPSRedirectMiddleware` behind an env flag (`ENFORCE_HTTPS=true`) so it only activates in production.
  - Files: `soulstep-catalog-api/app/main.py`

### Data Protection

- [ ] **Implement user self-service account deletion (GDPR/CCPA)**
  - No endpoint allows users to delete their own accounts. Violates GDPR Article 17 (right to erasure).
  - Add `DELETE /api/v1/users/me` endpoint. Soft-delete the user, anonymize PII fields (email → `deleted_<code>@deleted`, display_name → `Deleted User`), cascade soft-delete to check-ins and reviews.
  - Files: `soulstep-catalog-api/app/api/v1/users.py`, `soulstep-catalog-api/app/db/models.py`

- [ ] **Add email verification on registration**
  - Users can register with any email address (including fake ones) without verification. No email ownership proof.
  - Send verification email via Resend on registration. Add `email_verified_at` field to User. Block login until verified (or allow with limited access). Add `POST /api/v1/auth/verify-email` endpoint.
  - Files: `soulstep-catalog-api/app/api/v1/auth.py`, `soulstep-catalog-api/app/db/models.py`, new migration

- [ ] **Add soft-delete timestamps to CheckIn/Review models**
  - `CheckIn` and `Review` models have no `deleted_at` column. Hard deletes make audit trails impossible and complicate GDPR compliance.
  - Add `deleted_at: datetime | None = Field(default=None, sa_column=_TSTZ(nullable=True))` to both models. Update query filters to exclude soft-deleted rows.
  - Files: `soulstep-catalog-api/app/db/models.py`, new migration

### Data Safety

- [ ] **Implement automated database backups with restore procedure**
  - No backup strategy exists. A database failure loses all data permanently.
  - For production PostgreSQL: configure daily automated backups with 30-day retention. Document restore procedure in `PRODUCTION.md`. Add monitoring for backup failures. Define RTO (< 1 hour) and RPO (< 24 hours).
  - Files: `PRODUCTION.md`, GCP Cloud SQL backup config or backup scripts

---

## P1 — High Priority

Significant quality, UX, compliance, and admin completeness items. Address in early production iterations.

### CI/CD Hardening

- [ ] **Block deployments on test failure**
  - `deploy.yml` does not gate on the test workflow result. Broken code can be deployed.
  - Add `needs: [test]` to the deploy job and require all test steps to pass before any deploy step runs.
  - Files: `.github/workflows/deploy.yml`

- [ ] **Add frontend test coverage thresholds**
  - Backend has `--cov-fail-under=80`. Web and mobile have no coverage floor — coverage can silently drop to 0%.
  - Add `coverageThreshold: { global: { lines: 80 } }` to `vitest.config.ts` and `jest.config.js`.
  - Files: `apps/soulstep-customer-web/vitest.config.ts`, `apps/soulstep-customer-mobile/jest.config.js`

- [ ] **Add Docker health checks to background job images**
  - The `sync` and `translate` job containers have no health checks. Unhealthy containers go undetected.
  - Add `HEALTHCHECK` instructions to those Dockerfiles. Add health check entries in `docker-compose.yml`.
  - Files: `docker-compose.yml`, relevant Dockerfiles

- [ ] **Add resource limits to docker-compose.yml**
  - No memory or CPU limits on any service. A runaway process can starve other containers.
  - Add `deploy.resources.limits` for each service (e.g., `memory: 512m`, `cpus: '0.5'`).
  - Files: `docker-compose.yml`

### Accessibility & UX

- [ ] **Fix dark mode color contrast to meet WCAG AA**
  - `dark-text-secondary` (#A39C94) on `dark-surface` (#242424) gives ~3.2:1 contrast. WCAG AA requires 4.5:1 for normal text.
  - Lighten `dark-text-secondary` to ~#C4BDB5 (4.8:1+). Audit all components that use this token.
  - Files: `apps/soulstep-customer-web/tailwind.config.js`, `apps/soulstep-customer-mobile/src/lib/tokens.ts`

- [ ] **Add modal focus traps and form label accessibility**
  - Modals lack focus trapping (Tab can escape). Form inputs use `placeholder` instead of `<label>`. Some icon-only buttons lack `aria-label`.
  - Implement focus trap in Modal component. Add hidden `<label htmlFor>` for form inputs. Audit all icon buttons for `aria-label`.
  - Files: `apps/soulstep-customer-web/src/components/common/Modal.tsx`, `apps/soulstep-customer-web/src/components/auth/AuthModal.tsx`

- [ ] **Add carousel keyboard navigation and ARIA labels**
  - Horizontal carousels have no keyboard navigation. Screen reader users cannot access carousel items.
  - Add `role="region"`, `aria-label`, and keyboard arrow-key navigation to all carousels. Add `aria-label` to scroll buttons.
  - Files: `apps/soulstep-customer-web/src/components/`

- [ ] **Add loading skeleton UI for all pages**
  - Loading states show generic spinners instead of content-shaped skeletons. Poor perceived performance.
  - Create `SkeletonCard`, `SkeletonList`, `SkeletonDetail` components. Apply to Favorites, Profile, PlaceDetail, and all list pages.
  - Files: `apps/soulstep-customer-web/src/components/`, `apps/soulstep-customer-mobile/src/components/`

- [ ] **Add 404 Not Found page (web)**
  - Unknown routes silently redirect without showing a user-visible error page.
  - Add a `NotFoundPage` component and a catch-all route. Show a helpful message with links to Home and Places.
  - Files: `apps/soulstep-customer-web/src/app/routes.tsx`, new `apps/soulstep-customer-web/src/app/pages/NotFoundPage.tsx`

- [ ] **Add error boundary with user-visible feedback on API failures**
  - Unhandled Promise rejections and render errors show a blank screen with no user feedback.
  - Add a React `ErrorBoundary` at the app root and per-route level. Show a friendly error message with a retry button.
  - Files: `apps/soulstep-customer-web/src/app/App.tsx`, `apps/soulstep-customer-mobile/src/app/App.tsx`

### Performance

- [ ] **Eliminate N+1 queries in admin endpoints**
  - Admin list endpoints for users, check-ins, and reviews issue one query per row for related data (e.g., per-user check-in count). Degrades under load.
  - Rewrite with `selectinload` or subquery aggregation. Add test to assert query count stays constant as rows increase.
  - Files: `soulstep-catalog-api/app/api/v1/admin/users.py`, `soulstep-catalog-api/app/api/v1/admin/checkins.py`, `soulstep-catalog-api/app/api/v1/admin/reviews.py`

- [ ] **Add request caching layer (React Query / SWR) for web and mobile**
  - Every navigation re-fetches all data. No deduplication of concurrent identical requests. High API load for common screens.
  - Integrate React Query (web) and a compatible cache (mobile). Cache place lists for 5 min, translations for session, user profile for 1 min.
  - Files: `apps/soulstep-customer-web/src/lib/api/`, `apps/soulstep-customer-mobile/src/lib/api/`

- [ ] **Add abort controllers for stale map/search requests**
  - Typing quickly in search or panning the map fires multiple concurrent requests. Responses arrive out of order, causing incorrect results.
  - Use `AbortController` to cancel in-flight requests when a new one is issued for the same resource.
  - Files: `apps/soulstep-customer-web/src/app/pages/MapPage.tsx`, `apps/soulstep-customer-web/src/app/pages/PlacesPage.tsx`

### Infrastructure

- [ ] **Add SIGTERM/graceful shutdown handling for FastAPI services**
  - No graceful shutdown logic. In-flight requests are dropped when the container is terminated (e.g., on Cloud Run scale-down).
  - Use FastAPI's `lifespan` context to drain in-flight requests before shutdown. Add a configurable drain timeout.
  - Files: `soulstep-catalog-api/app/main.py`, `soulstep-scraper-api/app/main.py`

- [ ] **Document deployment rollback procedure**
  - No documented rollback steps. A bad deploy has no defined recovery path.
  - Add a "Rollback" section to `PRODUCTION.md` covering Cloud Run traffic reversion, database migration rollback (`alembic downgrade -1`), and Firebase Hosting rollback.
  - Files: `PRODUCTION.md`

### Backend

- [ ] **Track user last login timestamp**
  - No `last_login_at` field exists on the User model. Impossible to detect inactive accounts or suspicious login patterns.
  - Add `last_login_at: datetime | None = Field(default=None, sa_column=_TSTZ(nullable=True))` to User. Update on every successful login.
  - Files: `soulstep-catalog-api/app/db/models.py`, `soulstep-catalog-api/app/api/v1/auth.py`, new migration

- [ ] **Add absolute expiry enforcement on refresh tokens**
  - Refresh tokens only expire by TTL from last use (sliding window). A token used daily never expires, creating a persistent session risk.
  - Add `absolute_expires_at` field to the refresh token table. Set to `issued_at + 90 days`. Reject tokens past this regardless of TTL.
  - Files: `soulstep-catalog-api/app/db/models.py`, `soulstep-catalog-api/app/api/v1/auth.py`

- [ ] **Add token blocklist for session invalidation on logout**
  - Logout does not invalidate the access token (JWTs are stateless). A stolen token remains valid until expiry.
  - On logout, add the JTI (JWT ID) to a blocklist (Redis or DB table) with TTL matching token expiry. Check blocklist on every authenticated request.
  - Files: `soulstep-catalog-api/app/core/security.py`, `soulstep-catalog-api/app/api/v1/auth.py`

- [ ] **Add JSON schema validation for opening_hours**
  - `opening_hours` is stored as free-form JSON with no validation. Malformed data causes runtime errors when rendering.
  - Define a Pydantic schema for the opening hours structure. Validate on write (scraper sync + admin PATCH). Reject invalid shapes with 422.
  - Files: `soulstep-catalog-api/app/api/v1/admin/places.py`, `soulstep-catalog-api/app/api/v1/places.py`

- [ ] **Validate place codes in group itineraries**
  - When adding a place to a group itinerary, place existence is not validated against the DB. Orphaned place codes can be stored.
  - Add a DB lookup to verify each `place_code` exists before inserting. Return 422 with descriptive error for unknown codes.
  - Files: `soulstep-catalog-api/app/api/v1/groups.py`

- [ ] **Add cascade delete logic for Place and User deletion**
  - Deleting a Place or User in admin does not cascade to dependent records (check-ins, reviews, favorites, group memberships), causing orphaned data.
  - Add `cascade="all, delete-orphan"` to SQLModel relationships or manually delete dependents before deleting the parent entity.
  - Files: `soulstep-catalog-api/app/db/models.py`, `soulstep-catalog-api/app/api/v1/admin/places.py`, `soulstep-catalog-api/app/api/v1/admin/users.py`

- [ ] **Add request timeouts to Resend email and translation API calls**
  - Calls to Resend (email) and Google Cloud Translation have no explicit timeouts. A slow external service stalls the request thread indefinitely.
  - Add `timeout=10` to all Resend SDK calls and `timeout=(5, 30)` to Cloud Translation HTTP calls.
  - Files: `soulstep-catalog-api/app/services/`, `soulstep-catalog-api/scripts/generate_seo.py`

### Frontend Parity

- [ ] **EditProfile screen for mobile**
  - The web app has a profile editing flow but no equivalent screen exists in the mobile app.
  - Add `EditProfileScreen` to the mobile app. Match fields and validation with the web version. Wire to `PATCH /api/v1/users/me`.
  - Files: new `apps/soulstep-customer-mobile/src/app/screens/EditProfileScreen.tsx`, `apps/soulstep-customer-mobile/src/app/navigation.tsx`

- [ ] **Consent gating for analytics (wire up useUmamiTracking TODO)**
  - `useUmamiTracking.ts` has a `TODO: wire consent check` comment. Analytics fire regardless of user consent, violating GDPR.
  - Gate all `umami.track()` calls behind the existing consent state. Only track when consent is granted.
  - Files: `apps/soulstep-customer-web/src/lib/hooks/useUmamiTracking.ts`

- [ ] **Wire up AdMob stubs in mobile app**
  - AdMob stubs exist in the mobile app but are not connected to actual ad units. No ad revenue from mobile.
  - Complete AdMob integration: configure real ad unit IDs, implement consent flow (UMP SDK), add banner and interstitial placements matching web ad positions.
  - Files: `apps/soulstep-customer-mobile/src/components/ads/`

- [ ] **Error tracking for mobile (Sentry or GlitchTip)**
  - Web has error tracking configured. Mobile has no crash or error reporting.
  - Add Sentry SDK (`@sentry/react-native`). Initialize with DSN from env. Capture unhandled exceptions and Promise rejections.
  - Files: `apps/soulstep-customer-mobile/src/app/App.tsx`, `apps/soulstep-customer-mobile/app.json`

---

## P2 — Feature Enhancements

New user-facing features, UX improvements, admin completeness, and monetization.

### User Features

- [ ] **Badges and achievements system**
  - The profile API returns a hardcoded `0` for badges (a TODO comment exists in the code).
  - Design badge criteria (e.g., "First Check-in", "10 Reviews", "Visited 5 Countries"). Create a `badges` table, badge-evaluation service, and `GET /api/v1/users/me/badges` endpoint. Show earned badges on the profile screen.
  - Files: `soulstep-catalog-api/app/api/v1/users.py`, new models and migration

- [ ] **Push notifications**
  - The `Notification` model exists but no push delivery mechanism is implemented.
  - Integrate Expo Push Notifications (mobile) and Web Push API (web). Send notifications for: new review on a favorited place, badge earned, check-in streak reminder.
  - Files: new `soulstep-catalog-api/app/services/push.py`, `apps/soulstep-customer-mobile/src/`

- [ ] **Directions integration**
  - No way to get directions to a place from within the app.
  - Add a "Directions" button on place detail. On mobile, deep link to Google Maps / Apple Maps with coordinates. On web, open Google Maps in a new tab.
  - Files: `apps/soulstep-customer-web/src/app/pages/PlaceDetail.tsx`, `apps/soulstep-customer-mobile/src/app/screens/PlaceDetailScreen.tsx`

- [ ] **Recently viewed places**
  - No record of which places a user has viewed.
  - Track the last 20 viewed places in local storage. Display a "Recently Viewed" section on the home screen. Optionally persist server-side for cross-device sync.
  - Files: `apps/soulstep-customer-web/src/app/pages/HomePage.tsx`, `apps/soulstep-customer-mobile/src/app/screens/HomeScreen.tsx`

- [ ] **Religion expansion**
  - The "View More Faiths" button is non-functional. Only Islam, Christianity, and Hinduism are supported.
  - Add Buddhism, Sikhism, Judaism, Baha'i, and Zoroastrianism. Seed places for each. Update filter chips, scraper religion configs, and translation keys for all five languages.
  - Files: `soulstep-catalog-api/app/db/seed_data.json`, `soulstep-scraper-api/app/`

- [ ] **Check-in streaks with gamification**
  - No gamification around consecutive daily check-ins.
  - Track current and longest streak on user profile. Display a flame icon with the streak count. Send push notification if the streak is about to break. Award badges at 7, 30, and 100-day streaks.
  - Files: `soulstep-catalog-api/app/api/v1/users.py`, `soulstep-catalog-api/app/db/models.py`

- [ ] **Onboarding tour for new users**
  - First-time users see the app with no guidance on how to use it.
  - Show a brief guided tour on first login: highlight search, explain filter chips, show how to check in, point to favorites. Use tooltip overlay. Store `has_seen_onboarding` flag locally.
  - Files: `apps/soulstep-customer-web/src/`, `apps/soulstep-customer-mobile/src/`

- [ ] **Deep linking (iOS Universal Links + Android App Links)**
  - No deep link support. Shared place URLs do not open the mobile app.
  - Configure iOS Universal Links and Android App Links. Register URL scheme `soulstep://`. Map `/places/:code` to the mobile place detail screen.
  - Files: `apps/soulstep-customer-mobile/app.json`, new `apple-app-site-association`, new `assetlinks.json`

- [ ] **Offline mode with sync queue**
  - App is unusable without a network connection. No cached data, no offline check-ins.
  - Web: add service worker with cache-first strategy for static assets and API responses. Mobile: cache place list and favorites in AsyncStorage. Queue check-ins and reviews for sync when online.
  - Files: new `apps/soulstep-customer-web/public/sw.js`, `apps/soulstep-customer-mobile/src/lib/`

- [ ] **Optimistic UI updates for favorites and check-ins**
  - Favorite toggles and check-ins show loading state, then reload data. Feels slow.
  - Update UI state immediately on user action. Revert on API failure. Eliminates perceived latency for common interactions.
  - Files: `apps/soulstep-customer-web/src/app/pages/PlaceDetail.tsx`, `apps/soulstep-customer-mobile/src/app/screens/PlaceDetailScreen.tsx`

- [ ] **Image lazy loading and CLS prevention**
  - Place card images lack `loading="lazy"` and explicit dimensions. Causes Cumulative Layout Shift and slower LCP.
  - Add `loading="lazy"`, `width`, `height` to all `<img>` elements. Use aspect-ratio containers for image placeholders.
  - Files: `apps/soulstep-customer-web/src/components/places/PlaceCardUnified.tsx`

- [ ] **PWA offline fallback page and update notification**
  - Web app has no service worker. No offline fallback page. No "new version available" prompt.
  - Register a service worker. Add offline fallback HTML. Show a toast when a new version is cached, prompting a reload.
  - Files: `apps/soulstep-customer-web/public/`, `apps/soulstep-customer-web/src/`

- [ ] **Haptic feedback on mobile interactions**
  - No haptic feedback on check-in, favorite, or other key interactions. Per Rule 23, haptics are required on check-in success.
  - Fire `Haptics.impactAsync(ImpactFeedbackStyle.Medium)` on check-in success. Use `ImpactFeedbackStyle.Light` for favorite toggles.
  - Files: `apps/soulstep-customer-mobile/src/app/screens/PlaceDetailScreen.tsx`

- [ ] **Pull-to-refresh on all mobile list screens**
  - List screens have no pull-to-refresh gesture. Users must navigate away and back to reload.
  - Add `refreshControl` prop with `RefreshControl` to all FlatList/ScrollView components on main screens.
  - Files: `apps/soulstep-customer-mobile/src/app/screens/`

### Backend Features

- [ ] **Webhook and event system**
  - No mechanism for real-time notifications or external integrations when key actions occur.
  - Implement an internal event bus. Publish events on: new review, check-in, badge earned. Consumers send push notifications, update caches, or call external webhooks.
  - Files: new `soulstep-catalog-api/app/services/events.py`

- [ ] **Geographic boundary management API**
  - Geographic boundaries (cities, regions) are seed-only. No CRUD API exists.
  - Add `GET/POST/PUT/DELETE /api/v1/admin/geo-boundaries` endpoints. Wire to admin dashboard for expanding coverage to new regions.
  - Files: `soulstep-catalog-api/app/api/v1/admin/`, new model and migration

- [ ] **Standardize pagination API across all endpoints**
  - Pagination varies across endpoints: some use `page`/`page_size`, others use `offset`/`limit`. Inconsistent for API consumers.
  - Adopt a single pattern (`page` + `page_size`) with a shared `PaginatedResponse[T]` generic. Migrate all endpoints to use it.
  - Files: `soulstep-catalog-api/app/api/v1/`

- [ ] **Bulk delete endpoints for admin operations**
  - Admin can only delete records one at a time. Cleaning up data (e.g., spam reviews, test accounts) requires many individual requests.
  - Add `DELETE /api/v1/admin/reviews/bulk`, `/users/bulk`, `/checkins/bulk` accepting a list of codes. Limit to 100 per request.
  - Files: `soulstep-catalog-api/app/api/v1/admin/`

- [ ] **Admin password reset for users**
  - Admins cannot reset a user's password. Users locked out due to forgotten passwords must contact support with no tooling.
  - Add `POST /api/v1/admin/users/{code}/reset-password` that sends a reset email via Resend.
  - Files: `soulstep-catalog-api/app/api/v1/admin/users.py`

- [ ] **User ban/suspension system with reasons**
  - No mechanism to ban abusive users. Removing their account is the only option, which loses audit history.
  - Add `is_banned`, `banned_at`, `ban_reason` fields to User model. Banned users receive `403` on all authenticated endpoints. Admin UI for banning/unbanning with reason logging.
  - Files: `soulstep-catalog-api/app/db/models.py`, `soulstep-catalog-api/app/api/v1/admin/users.py`, new migration

- [ ] **Review moderation workflow with rejection reasons**
  - Reviews are published immediately on submission with no moderation step. No way to reject a review with a reason.
  - Add `moderation_status` (`pending`/`approved`/`rejected`) and `rejection_reason` fields to Review. Newly submitted reviews enter `pending` state. Add admin moderation queue endpoint.
  - Files: `soulstep-catalog-api/app/db/models.py`, `soulstep-catalog-api/app/api/v1/admin/reviews.py`, new migration

- [ ] **Bulk place image management in admin**
  - Admin can only manage images one place at a time. No bulk upload, no bulk alt-text generation trigger, no way to view all images missing alt text.
  - Add a "Place Images" admin page: filterable by missing alt text, bulk alt-text generation trigger, bulk delete of orphaned images.
  - Files: `apps/soulstep-admin-web/src/app/pages/`, `soulstep-catalog-api/app/api/v1/admin/`

- [ ] **Advanced export formats (JSON, Excel, filtered)**
  - Admin CSV export is basic. No JSON export, no Excel (`.xlsx`) format, no filtered exports.
  - Add `format=json|csv|xlsx` query param to export endpoints. Apply the same filters used in the list view to the export.
  - Files: `soulstep-catalog-api/app/api/v1/admin/`

- [ ] **Enhanced analytics dashboard (retention, funnels, cost analysis)**
  - Current admin analytics shows basic counts. No retention curves, no funnel analysis, no scraper cost tracking.
  - Add retention cohort query, check-in funnel (view → favorite → check-in), scraper API call cost estimates per run.
  - Files: `apps/soulstep-admin-web/src/app/pages/analytics/`, `soulstep-catalog-api/app/api/v1/admin/`

- [ ] **Add concurrency to scraper enrichment pipeline**
  - Enrichment processes places sequentially. 1000 places × 8 collectors × ~2s each ≈ 4–5 hours per run.
  - Migrate to `asyncio` + `aiohttp`. Use `asyncio.gather()` with semaphore for concurrent enrichment (5–10 places in parallel). Add `ENRICHMENT_CONCURRENCY` env var.
  - Files: `soulstep-scraper-api/app/pipeline/enrichment.py`, `soulstep-scraper-api/app/collectors/*.py`

- [ ] **Add client-side rate limiting for external APIs in scraper**
  - No proactive throttling. Quadtree search can make hundreds of API calls without throttling, relying solely on reactive 429 backoff.
  - Implement token bucket rate limiters per API. Respect `X-RateLimit-Remaining` and `Retry-After` headers.
  - Files: `soulstep-scraper-api/app/scrapers/base.py`, `soulstep-scraper-api/app/collectors/*.py`

### Monetization

- [ ] **Premium subscription tier (SoulStep Pro)**
  - Free tier covers all functionality. No revenue stream from power users.
  - Implement via Stripe (web) and RevenueCat (mobile). Add `subscription_tier` field to User. Gate premium features: unlimited favorites, advanced filters, offline mode, ad-free, priority support.
  - Files: `soulstep-catalog-api/app/db/models.py`, new migration, `apps/soulstep-customer-web/src/`, `apps/soulstep-customer-mobile/src/`

- [ ] **B2B partnerships — place claiming and sponsorships**
  - Religious organizations cannot claim or manage their own place listings.
  - Add `claimed_by` field to Place model. Build a claiming flow with verification. Sponsored places get "Verified" badge, enhanced profiles (event schedules, donation links), and priority placement.
  - Files: `soulstep-catalog-api/app/db/models.py`, new claiming endpoints

- [ ] **Local experiences marketplace**
  - No way to monetize local expertise around sacred sites.
  - New `experiences` table. Booking flow, payment via Stripe Connect, guide rating/review system. SoulStep takes a commission.
  - Files: new `soulstep-catalog-api/app/api/v1/experiences.py`, new models

- [ ] **API access for third-party developers**
  - No public API offering. No revenue from third-party integrations.
  - Add API key management, usage tracking, rate limiting per key, and developer portal docs. Free tier (100 req/day), paid tiers for higher limits.
  - Files: new `soulstep-catalog-api/app/api/v1/developer.py`

- [ ] **Donation platform integration**
  - No way for users to donate to religious sites through the app.
  - Partner with payment providers for cross-border donations. SoulStep facilitates but does not process. Add donation button on place detail.
  - Files: `apps/soulstep-customer-web/src/app/pages/PlaceDetail.tsx`, `apps/soulstep-customer-mobile/src/app/screens/PlaceDetailScreen.tsx`

- [ ] **Premium group features**
  - Free groups limited to 10 members and 5 places. No upsell path for power users.
  - Premium groups: unlimited members, custom itineraries, group analytics, shared photo albums, group challenges. Gate by group creator's subscription tier.
  - Files: `soulstep-catalog-api/app/api/v1/groups.py`, `soulstep-catalog-api/app/db/models.py`

- [ ] **Analytics-as-a-Service for religious organizations**
  - No B2B data product. Religious organizations and tourism boards have no access to aggregated insights.
  - Build data pipeline to aggregate anonymized check-in and review data. Partner dashboard with foot traffic, visitor trends, and demographic insights (no PII).
  - Files: new `soulstep-catalog-api/app/api/v1/partner_analytics.py`

---

## P3 — Scalability & DevOps

Infrastructure, optimization, monitoring, code quality, and documentation for production at scale.

### Infrastructure

- [ ] **CDN for images**
  - Place and review images are stored as database blobs (`LargeBinary`). Causes DB bloat and poor performance at scale.
  - Upload images to GCS / S3 / Cloudflare R2 and serve via CDN. Update image URLs in DB. Add cache-control headers. Remove blob columns after migration.
  - Files: `soulstep-catalog-api/app/db/models.py`, `soulstep-catalog-api/app/api/v1/admin/places.py`

- [ ] **Background job queue (Celery or arq)**
  - FastAPI `BackgroundTasks` runs in-process with no retry, persistence, or monitoring.
  - Set up Celery with Redis or `arq`. Move email sending, image processing, badge evaluation, and analytics aggregation to background jobs.
  - Files: new `soulstep-catalog-api/app/workers/`

- [ ] **Mobile CI/CD pipeline (EAS Build)**
  - GitHub Actions deploys only API and web. No mobile build or delivery automation.
  - Add EAS Build workflow for iOS and Android. Trigger on tagged releases. Upload to TestFlight / Google Play internal track.
  - Files: new `.github/workflows/mobile.yml`

- [ ] **Load testing**
  - No performance benchmarks. Unknown behavior under concurrent load.
  - Write Locust or k6 scripts for critical paths: place listing, place detail, search, check-in, review submission. Run against staging and document results.
  - Files: new `load-tests/`

- [ ] **Set up staging environment**
  - No pre-production validation environment. All testing happens in development or directly in production.
  - Create a separate Cloud Run service for staging. Deploy from the `staging` branch. Use a separate database instance.
  - Files: `.github/workflows/deploy.yml`, `PRODUCTION.md`

- [ ] **Blue-green / canary deployments**
  - Cloud Run restarts all instances on deploy. No gradual rollout. No zero-downtime strategy.
  - Configure Cloud Run traffic splitting for canary releases (10% → 50% → 100%). Add rollback automation.
  - Files: `.github/workflows/deploy.yml`, `PRODUCTION.md`

- [ ] **Dependabot or Renovate for dependency updates**
  - No automated dependency update mechanism. Vulnerabilities in outdated packages go undetected.
  - Configure Dependabot for npm (web, mobile, admin) and pip (backend, scraper). Auto-create PRs for security updates.
  - Files: new `.github/dependabot.yml`

- [ ] **Feature flags system**
  - Cannot enable/disable features without a deploy. No gradual feature rollout.
  - Add a lightweight feature flags table or integrate with Unleash / Flagsmith. Gate new features behind flags. Extend beyond the existing ad kill-switch.
  - Files: `soulstep-catalog-api/app/db/models.py`, new migration

- [ ] **Multi-stage Docker builds for image size optimization**
  - Current Dockerfiles use single-stage builds. Images include build tools and dev dependencies in production.
  - Use multi-stage builds: `builder` stage installs deps, `runtime` stage copies only the app and installed packages.
  - Files: `soulstep-catalog-api/Dockerfile`, `apps/soulstep-customer-web/Dockerfile`

### Monitoring & Observability

- [ ] **Monitoring dashboards and alerting (Prometheus + Grafana)**
  - Prometheus endpoint exists at `/metrics` but no dashboards or alerts are configured. Issues go undetected.
  - Deploy Prometheus + Grafana (or managed equivalent). Create dashboards for API health, DB performance, error rates, and latency. Alert on high error rate, slow queries, and deploy failures.

- [ ] **Distributed tracing (OpenTelemetry)**
  - No trace collection across services. Cross-service debugging requires manual log correlation.
  - Instrument FastAPI with `opentelemetry-instrumentation-fastapi`. Add trace context propagation between catalog API and scraper. Export to Jaeger or a managed backend.

- [ ] **Uptime monitoring**
  - No synthetic probes to detect outages. SLO violations go undetected.
  - Set up UptimeRobot / Pingdom / GCP Cloud Monitoring uptime checks for API health endpoint and web frontend. Alert on downtime.

- [ ] **Real User Monitoring (Web Vitals)**
  - No visibility into actual user-experience metrics (LCP, FID, CLS, TTFB).
  - Configure Sentry Performance or Web Vitals API reporting. Track metrics per route. Alert on regressions.

### Optimization

- [ ] **Response caching (Redis / in-memory with TTL)**
  - Every request hits the database, even for data that changes infrequently (translations, religion list, city list).
  - Cache translations for the session, place lists for 5 min (invalidate on write), religion/category metadata for 1 hour. Use Redis or in-memory caching with TTL.
  - Files: `soulstep-catalog-api/app/api/v1/`

- [ ] **Image optimization pipeline**
  - Images are stored and served at original size and format. No WebP conversion. No multiple sizes.
  - Resize to standard dimensions (thumbnail: 200px, card: 600px, full: 1200px) on upload. Convert to WebP. Store multiple sizes and serve based on context.
  - Files: `soulstep-catalog-api/app/api/v1/admin/places.py`

- [ ] **Frontend bundle optimization**
  - Routes are lazy-loaded but no further code splitting is configured.
  - Configure Vite's `manualChunks` to separate vendor code (React, Leaflet, etc.). Analyze with `rollup-plugin-visualizer`. Remove large unused dependencies.
  - Files: `apps/soulstep-customer-web/vite.config.ts`

- [ ] **Reduce scraper image blob storage**
  - Scraper base64-encodes up to 3 images per place into JSON columns. 1000 places × 1.5MB = 1.5GB in JSON. Can cause OOM and DB lock contention.
  - Store image URLs only (not blobs). If blobs are required, limit to 1 image per place at max 300KB. Move long-term storage to object storage.
  - Files: `soulstep-scraper-api/app/collectors/gmaps.py`, `soulstep-scraper-api/app/db/models.py`

### Scraper Reliability

- [ ] **Per-collector retry logic with partial result acceptance**
  - A single collector failure aborts enrichment for the entire place. One bad API key or timeout loses all data for that run.
  - Wrap each collector call in try/except. Accept partial results from whichever collectors succeeded. Log failures per collector without raising.
  - Files: `soulstep-scraper-api/app/pipeline/enrichment.py`

- [ ] **Google Maps API exponential backoff on 429**
  - Backoff on 429 is a fixed sleep. Repeated 429s with fixed sleep waste time and may still be rejected.
  - Implement exponential backoff with jitter (`min(cap, base * 2^attempt) + random(0, 1)`). Respect `Retry-After` header if present.
  - Files: `soulstep-scraper-api/app/collectors/gmaps.py`, `soulstep-scraper-api/app/scrapers/base.py`

- [ ] **Request deduplication across scraper runs**
  - The same place can be scraped multiple times in a single run if it appears in overlapping grid cells. Wastes API quota.
  - Track visited place IDs in a set per run. Skip cells already processed. Deduplicate on external ID before enrichment.
  - Files: `soulstep-scraper-api/app/scrapers/gmaps.py`

- [ ] **Image validation and deduplication**
  - No validation of scraped image URLs. Duplicate images from different collectors are stored as separate records.
  - Validate that image URLs return a 200 with an image content-type before storing. Hash image content to deduplicate across collectors.
  - Files: `soulstep-scraper-api/app/pipeline/`

- [ ] **QueryLog auto-pruning**
  - `QueryLog` table grows without bound. Old query logs are never deleted. Can fill up DB storage over months.
  - Add a scheduled job to prune `QueryLog` rows older than 90 days. Run weekly.
  - Files: `soulstep-scraper-api/app/db/`, `soulstep-scraper-api/app/main.py`

- [ ] **Adaptive browser grid cell sizing per region**
  - Grid cell size is fixed regardless of place density. Sparse regions waste many empty cells; dense regions miss places.
  - Implement adaptive cell sizing: start with a large cell, subdivide if result count hits the API cap.
  - Files: `soulstep-scraper-api/app/scrapers/gmaps.py`

- [ ] **Input validation for collector outputs**
  - Collector outputs are merged into the place record without validating types or required fields. Malformed data silently corrupts records.
  - Add Pydantic models for all collector output shapes. Validate before merging. Log and skip invalid fields rather than failing the whole place.
  - Files: `soulstep-scraper-api/app/collectors/*.py`, `soulstep-scraper-api/app/pipeline/`

- [ ] **Browser crash recovery / fallback to API mode**
  - If the Playwright browser crashes mid-run, the entire scrape job fails with no recovery.
  - Add try/except around browser operations. On crash, attempt to restart the browser once. If restart fails, fall back to API-only mode for the remaining places.
  - Files: `soulstep-scraper-api/app/scrapers/`

### Documentation & Compliance

- [ ] **Security model and threat analysis (SECURITY.md)**
  - No documented threat model, attack surface analysis, or security architecture.
  - Create `SECURITY.md` covering: auth flow, data encryption, API security, known risks, and incident response contacts.
  - Files: new `SECURITY.md`

- [ ] **Data retention and privacy policies**
  - No retention policy. Old data accumulates forever. No anonymization for deleted users. No documented GDPR compliance.
  - Define retention periods (analytics: 1 year, logs: 90 days, deleted user PII: 30 days then purge). Document in `SECURITY.md` or a new `PRIVACY.md`.

- [ ] **Incident response runbooks**
  - No documented procedures for common incidents (API down, DB corruption, deployment failure, security breach).
  - Create runbooks in `PRODUCTION.md` for: rollback, DB restore, scaling under load, security incident response.
  - Files: `PRODUCTION.md`

- [ ] **Pin scraper dependency versions for production**
  - All scraper deps use unpinned latest. Unexpected upgrades can break production.
  - Generate `requirements.lock` with pinned versions. Pin major versions at minimum (`requests>=2.28,<3`, `fastapi>=0.95,<1`).
  - Files: `soulstep-scraper-api/requirements.txt`

- [ ] **Troubleshooting guide (TROUBLESHOOTING.md)**
  - Common setup and runtime issues are undocumented. New contributors spend hours debugging known problems.
  - Document: DB migration failures, environment variable issues, Playwright browser install steps, common Docker pitfalls, and test setup issues.
  - Files: new `TROUBLESHOOTING.md`

- [ ] **Document API rate limits in ARCHITECTURE.md**
  - Rate limits are configured in code but not documented for API consumers or frontend developers.
  - Add a "Rate Limits" section to `ARCHITECTURE.md` listing each endpoint category, limit, and the `X-RateLimit-*` headers returned.
  - Files: `ARCHITECTURE.md`

---

## How to Use This File

1. Pick items from the highest uncompleted priority tier first (P0 before P1, etc.).
2. When an item is completed, **remove it** from this file. Do not mark it `[x]` — completed work lives in git history.
3. When committing a completed item, reference the roadmap section in the commit message.
4. Review this file during sprint planning to select work items.
5. Add new items to the appropriate tier as they are discovered.
