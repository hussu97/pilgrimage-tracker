# Roadmap

This document is the **single unified roadmap** for the entire SoulStep monorepo. It merges the previous `ROADMAP.md` and `ADMIN_ROADMAP.md`, adds findings from a full system audit (backend, scraper, web, mobile, admin, infra), introduces new user features, and outlines monetization strategies. Items are organized by priority tier (P0 through P3).

> **Last updated:** 2026-02-23

---

## P0 — Critical / Pre-Production

Security vulnerabilities, data-loss risks, and compliance gaps that **must** be resolved before any public production deployment.

### Security

- [ ] **Add audit logging for all admin write operations**
  - No accountability for admin actions — the `AuditLog` model, migration, and endpoints from Admin Phase 6 are not yet implemented.
  - Create `AuditLog` table (`log_code`, `admin_user_code`, `action`, `entity_type`, `entity_code`, `changes` JSON, `created_at`). Wrap every admin write endpoint with an `audit_log()` helper. Add `GET /api/v1/admin/audit-log` with filtering by admin, entity type, action, and date range. Build the `AuditLogPage` in the admin frontend.
  - Files: `soulstep-catalog-api/app/db/models.py`, new `app/api/v1/admin/audit_log.py`, new migration, `apps/soulstep-admin-web/src/app/pages/audit-log/AuditLogPage.tsx`

- [ ] **Move auth tokens from localStorage to httpOnly cookies**
  - Both web and mobile store JWT in `localStorage` / `AsyncStorage`, which is vulnerable to XSS. The admin app has the same issue.
  - Update backend to set `httpOnly`, `Secure`, `SameSite=Strict` cookies on login/refresh. Update frontend API clients to send credentials via cookies instead of `Authorization` header.
  - Files: `soulstep-catalog-api/app/core/security.py`, `apps/soulstep-customer-web/src/lib/api/client.ts`, `apps/soulstep-customer-mobile/src/lib/api/client.ts`, `apps/soulstep-admin-web/src/lib/api/client.ts`

- [ ] **Add OWASP security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options)**
  - No Content Security Policy or clickjacking protection. `index.html` has no CSP meta tag. Nginx config lacks security headers.
  - Add headers in nginx config for production. Add CSP meta tags for development. Configure `Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`.
  - Files: `apps/soulstep-customer-web/nginx.conf`, `apps/soulstep-customer-web/index.html`

- [ ] **Add security scanning to CI pipeline**
  - No vulnerability scanning for Docker images, npm packages, or Python dependencies. Vulnerabilities could ship to production undetected.
  - Add Snyk or Trivy for container scanning, `pip-audit` for Python, `npm audit` for Node. Block deploys on critical/high vulnerabilities.
  - Files: `.github/workflows/deploy.yml`, `.github/workflows/tests.yml`

- [ ] **Enforce rate limiting on auth and public endpoints**
  - `slowapi` is installed but not applied to login, register, search, or other public endpoints. Brute-force attacks and scraping are unmitigated.
  - Apply rate limits: login (5/min per IP), register (3/min per IP), search (30/min per user), password reset (3/min per IP).
  - Files: `soulstep-catalog-api/app/main.py`, `soulstep-catalog-api/app/api/v1/auth.py`

- [ ] **Add request timeouts to all scraper HTTP calls**
  - 5 of 8 external API collectors (`gmaps`, `foursquare`, `knowledge_graph`, `outscraper`, `besttime`) lack explicit timeouts. Requests can hang indefinitely.
  - Add `timeout=(5, 30)` to all `requests.get()`/`requests.post()` calls. Use `timeout=(5, 60)` for photo downloads.
  - Files: `soulstep-scraper-api/app/collectors/*.py`, `soulstep-scraper-api/app/scrapers/base.py`

### Data Protection

- [ ] **Implement automated database backups with restore procedure**
  - No backup strategy exists. A database failure loses all data. No RTO/RPO targets documented.
  - For production PostgreSQL: configure daily automated backups with 30-day retention. Document restore procedure. Add monitoring for backup failures. Define RTO (< 1 hour) and RPO (< 24 hours).
  - Files: `PRODUCTION.md`, new backup scripts or GCP Cloud SQL config

- [ ] **Validate pagination bounds on all list endpoints**
  - No upper-bound validation on `page_size` / `limit` parameters. A client can request `?page_size=999999` and exhaust server memory.
  - Add `max_page_size=100` validation on all paginated endpoints (admin and public). Return 400 for out-of-range values.
  - Files: `soulstep-catalog-api/app/api/v1/admin/*.py`, `soulstep-catalog-api/app/api/v1/places.py`, `soulstep-catalog-api/app/api/v1/users.py`

### Scraper Reliability

- [ ] **Replace `print()` with structured logging across scraper service**
  - 77 `print()` statements scattered throughout the scraper. No structured logging. API keys can leak in stack traces. Errors are invisible in production.
  - Replace all `print()` with Python `logging` module. Add automatic key masking. Use JSON format in production (`LOG_FORMAT=json`).
  - Files: `soulstep-scraper-api/app/collectors/*.py`, `soulstep-scraper-api/app/scrapers/*.py`, `soulstep-scraper-api/app/pipeline/*.py`, `soulstep-scraper-api/app/main.py`

- [ ] **Validate required environment variables at scraper startup**
  - Missing API keys (e.g., `GOOGLE_MAPS_API_KEY`) only fail at runtime when a scrape runs, not at startup. No validation of database writability.
  - Add config validation in `lifespan()`. Check required env vars, log all config (with secrets masked), test DB writability. Consider migrating to `pydantic-settings`.
  - Files: `soulstep-scraper-api/app/main.py`

---

## P1 — High Priority

Significant quality, UX, compliance, and admin completeness items. Should be addressed in early production iterations.

### Admin Phase 6 — Advanced Features

- [ ] **Implement bulk operations for all admin entities**
  - No multi-select or batch actions in admin DataTables. Admins must act on records one at a time.
  - Add multi-select checkboxes and floating action bar. Endpoints: `POST /api/v1/admin/bulk/{entity}/{action}` for users (activate/deactivate), reviews (flag/unflag/delete), places (delete), check-ins (delete), groups (delete).
  - Files: new `soulstep-catalog-api/app/api/v1/admin/bulk.py`, `apps/soulstep-admin-web/src/components/shared/BulkActionBar.tsx`

- [ ] **Implement data export (CSV/JSON) for admin entities**
  - Admins cannot bulk-extract data. No export capability for users, places, reviews, check-ins, or groups.
  - Add `GET /api/v1/admin/export/{entity}?format=csv|json` endpoints using `StreamingResponse` with generators to avoid loading entire tables into memory.
  - Files: new `soulstep-catalog-api/app/api/v1/admin/export.py`

- [ ] **Implement admin notification management**
  - Admins cannot send broadcast or targeted notifications to users.
  - Add `POST /api/v1/admin/notifications/broadcast`, `POST /api/v1/admin/notifications/send`, `GET /api/v1/admin/notifications/history`. Build `NotificationManagementPage` with compose form, recipient picker, and history table.
  - Files: new `soulstep-catalog-api/app/api/v1/admin/notifications.py`, `apps/soulstep-admin-web/src/app/pages/notifications/NotificationManagementPage.tsx`

### Testing

- [ ] **Add E2E tests for critical user journeys (web)**
  - No end-to-end tests exist for the web frontend. Component interactions and full user flows are untested.
  - Use Cypress or Playwright. Cover: login → place search → favorite → check-in, create group → add place, write review → see on place detail.
  - Files: new `apps/soulstep-customer-web/e2e/`

- [ ] **Add admin frontend test coverage (Vitest)**
  - Admin app has 0 Vitest tests for utility functions, hooks, data transformations, or pagination helpers.
  - Add tests for: pagination logic, data table filtering/sorting, polling hook, stat data transformations, date interval helpers, bulk selection logic.
  - Files: `apps/soulstep-admin-web/src/__tests__/`

- [ ] **Add scraper integration and sync tests**
  - No tests for `sync_run_to_server()` error scenarios, full enrichment pipeline orchestration, timeout scenarios, or backoff/retry logic.
  - Add `test_sync.py` for sync failure/retry, `test_backoff.py` for 429 handling, integration test for complete scrape → enrich → sync flow.
  - Files: `soulstep-scraper-api/tests/`

### CI/CD Hardening

- [ ] **Add linting checks to CI deploy workflow**
  - No ESLint or Ruff checks in the deploy pipeline. Improperly formatted or linted code can ship.
  - Add `ruff check` for Python, `npm run lint` for web/mobile/admin before deploy. Block on errors.
  - Files: `.github/workflows/deploy.yml`

- [ ] **Add admin app tests and build to CI**
  - Admin app is not tested or built in any CI workflow. Broken admin code can ship without detection.
  - Add admin Vitest run and `tsc --noEmit` + `vite build` to the test and deploy workflows.
  - Files: `.github/workflows/tests.yml`, `.github/workflows/deploy.yml`

- [ ] **Add coverage thresholds to CI**
  - No coverage enforcement in CI. Coverage can silently drop without detection.
  - Configure pytest `--cov-fail-under=80`, Vitest `coverageThreshold: { global: { lines: 80 } }`, Jest similarly. Block PRs below threshold.
  - Files: `.github/workflows/tests.yml`, `apps/soulstep-customer-web/vitest.config.ts`, `apps/soulstep-customer-mobile/jest.config.js`

### Accessibility & UX

- [ ] **Fix dark mode color contrast to meet WCAG AA**
  - `dark-text-secondary` (#A39C94) on `dark-surface` (#242424) gives ~3.2:1 contrast ratio. WCAG AA requires 4.5:1 for normal text.
  - Lighten `dark-text-secondary` to ~#C4BDB5 or similar to achieve 4.8:1+ ratio. Audit all affected components.
  - Files: `apps/soulstep-customer-web/tailwind.config.js`, `apps/soulstep-customer-mobile/src/lib/tokens.ts`

- [ ] **Add modal focus traps and form label accessibility**
  - Modals lack focus trapping (Tab can escape modal). Form inputs use `placeholder` instead of `<label>`. Some icon-only buttons lack `aria-label`.
  - Implement focus trap in Modal component. Add hidden `<label htmlFor>` for form inputs. Audit all icon buttons for `aria-label`.
  - Files: `apps/soulstep-customer-web/src/components/common/Modal.tsx`, `apps/soulstep-customer-web/src/components/auth/AuthModal.tsx`

- [ ] **Add loading skeleton UI for all pages**
  - Loading states show generic text ("Loading...") or spinners instead of content-shaped skeletons. Poor perceived performance.
  - Create `SkeletonCard`, `SkeletonList`, `SkeletonDetail` components. Use route-specific skeletons instead of generic loaders. Apply to Favorites, Profile, PlaceDetail, and all list pages.
  - Files: `apps/soulstep-customer-web/src/components/`, `apps/soulstep-customer-mobile/src/components/`

- [ ] **Match client-side password validation with backend rules**
  - Web validates only `password.length < 6` but backend requires 8+ chars, one uppercase, one lowercase, one digit. Causes UX confusion.
  - Fetch `getFieldRules()` or hardcode matching regex. Show real-time validation feedback during registration.
  - Files: `apps/soulstep-customer-web/src/components/auth/AuthModal.tsx`, `apps/soulstep-customer-mobile/src/app/screens/RegisterScreen.tsx`

### Infrastructure

- [ ] **Add Docker health checks and security hardening**
  - Only `db` service has a health check. API and web containers lack health checks. No non-root user, no resource limits, no `.dockerignore` files.
  - Add `HEALTHCHECK` to API and web Dockerfiles. Add `.dockerignore` files. Run as non-root user. Add memory/CPU limits in docker-compose.
  - Files: `soulstep-catalog-api/Dockerfile`, `apps/soulstep-customer-web/Dockerfile`, `docker-compose.yml`

- [ ] **Add gzip compression and security headers to nginx**
  - Nginx config has no compression and no security headers. Large responses sent uncompressed. No XSS/clickjacking protection at the edge.
  - Enable gzip for text/html, application/json, text/css, application/javascript. Add security headers (X-Frame-Options, X-Content-Type-Options, HSTS, CSP).
  - Files: `apps/soulstep-customer-web/nginx.conf`

### Documentation

- [ ] **Create admin app README**
  - No README for the admin app. Onboarding requires reading source code.
  - Document: folder structure, development setup, deployment, shadcn/ui component patterns, environment variables.
  - Files: new `apps/soulstep-admin-web/README.md`

---

## P2 — Feature Enhancements

New user-facing features, UX improvements, and monetization strategies.

### User Features

- [ ] **Badges and achievements system**
  - The profile API returns a hardcoded `0` for badges (`soulstep-catalog-api/app/api/v1/users.py` has a TODO).
  - Design badge criteria (e.g., "First Check-in", "10 Reviews", "Visited 5 Countries", "Early Adopter") with icons and descriptions. Create a `badges` table, a badge-evaluation service, and a `GET /api/v1/users/me/badges` endpoint. Show earned badges on the profile screen.

- [ ] **Push notifications**
  - The `Notification` model exists in the database but no push delivery mechanism is implemented.
  - Integrate Expo Push Notifications (mobile) and Web Push API (web). Send notifications for: new review on a favorited place, badge earned, check-in streak reminder.

- [ ] **Directions integration**
  - Add a "Directions" button on the place detail page. On mobile, deep link to Google Maps or Apple Maps with the place coordinates. On web, open Google Maps in a new tab.

- [ ] **Recently viewed places**
  - Track the last 20 viewed places in local storage. Display a "Recently Viewed" section on the home screen. Optionally persist server-side for cross-device sync.

- [ ] **Religion expansion**
  - The "View More Faiths" button in the UI is non-functional. Only Islam, Christianity, and Hinduism are supported.
  - Add Buddhism, Sikhism, Judaism, Baha'i, and Zoroastrianism. Seed places for each. Update filter chips, scraper religion configs, and translation keys for all three languages.

- [ ] **Check-in streaks**
  - No gamification around consecutive daily check-ins.
  - Track current and longest streak on the user profile. Display a flame icon with the streak count. Send a push notification reminder if the streak is about to break. Award badges at 7, 30, and 100 day streaks.

- [ ] **Desktop layout optimization**
  - The web app uses a single-column layout on all screen sizes. Wide screens waste space.
  - Add a 2-column layout for the place detail page on screens wider than 1024px: left column for images and map, right column for details and reviews.

- [ ] **Onboarding tour for new users**
  - First-time users see the app with no guidance.
  - Show a brief guided tour on first login: highlight the search bar, explain filter chips, show how to check in, and point to the profile/favorites. Use a tooltip-based overlay. Store a `has_seen_onboarding` flag.

- [ ] **Deep linking (mobile to web and vice versa)**
  - No deep link support. Shared place URLs don't open the mobile app. No universal link / app link configuration.
  - Configure iOS Universal Links and Android App Links. Register URL scheme `soulstep://`. Map `/places/:code` to the mobile place detail screen.
  - Files: `apps/soulstep-customer-mobile/app.json`, new `apple-app-site-association`, new `assetlinks.json`

- [ ] **Offline mode with sync queue**
  - App is unusable without network. No cached data, no offline check-ins, no queued actions.
  - Web: add service worker with cache-first strategy for static assets and API responses. Mobile: cache place list and favorites in AsyncStorage. Queue check-ins and reviews for sync when online.

- [ ] **Optimistic UI updates for favorites and check-ins**
  - Favorite toggles and check-ins show loading state, then reload data. Perceived as slow.
  - Update UI state immediately on user action. Revert on API failure. Eliminates perceived latency for common actions.
  - Files: `apps/soulstep-customer-web/src/app/pages/PlaceDetail.tsx`, `apps/soulstep-customer-mobile/src/app/screens/PlaceDetailScreen.tsx`

- [ ] **Image lazy loading and CLS prevention**
  - Place card images lack `loading="lazy"` and explicit width/height hints. Causes Cumulative Layout Shift and slower LCP.
  - Add `loading="lazy"`, `width`, `height` to all `<img>` elements. Use aspect-ratio containers for image placeholders.
  - Files: `apps/soulstep-customer-web/src/components/places/PlaceCardUnified.tsx`

### Backend Features

- [ ] **Analytics and tracking endpoint**
  - No visibility into user behavior (popular places, search patterns, drop-off points).
  - Add a `POST /api/v1/analytics/events` endpoint that accepts batched events. Store in a separate `analytics_events` table. Build a simple dashboard query for top places, active users, and check-in trends.

- [ ] **Webhook and event system**
  - No mechanism for real-time notifications or external integrations.
  - Implement an internal event bus. When key actions occur (new review, check-in, badge earned), publish events. Consumers can send push notifications, update caches, or call external webhooks.

- [ ] **Geographic boundary management API**
  - Geographic boundaries (cities, regions) are seed-only. There is no CRUD API.
  - Add `GET/POST/PUT/DELETE /api/v1/geo-boundaries` endpoints for the admin panel and for expanding coverage to new regions.

- [ ] **Add concurrency to scraper enrichment pipeline**
  - Enrichment processes places sequentially. 1000 places x 8 collectors x ~2s each = ~4-5 hours per run.
  - Migrate to `asyncio` + `aiohttp`. Use `asyncio.gather()` with semaphore for concurrent enrichment (5-10 places in parallel). Add `ENRICHMENT_CONCURRENCY` env var.
  - Files: `soulstep-scraper-api/app/pipeline/enrichment.py`, `soulstep-scraper-api/app/collectors/*.py`

- [ ] **Add client-side rate limiting for external APIs in scraper**
  - No proactive rate limiting. Relies on reactive backoff after 429 responses. Quadtree search can make hundreds of calls without throttling.
  - Implement token bucket rate limiters per API. Respect `X-RateLimit-Remaining` and `Retry-After` headers. Add per-location scrape quotas.
  - Files: `soulstep-scraper-api/app/scrapers/base.py`, `soulstep-scraper-api/app/collectors/*.py`

### Monetization

- [ ] **Premium subscription tier (SoulStep Pro)**
  - Free tier covers basic functionality. Premium unlocks: unlimited favorites, advanced search filters, offline mode, ad-free experience, priority support, detailed visit statistics, and custom group features.
  - Implement via Stripe (web) and RevenueCat (mobile) for subscription management. Add `subscription_tier` field to User model. Gate premium features with middleware.

- [ ] **B2B partnerships — mosque/temple/church sponsorships**
  - Religious organizations can claim and manage their place listings. Sponsored places appear with a "Verified" badge, enhanced profiles (event schedules, donation links, live streams), and priority placement in search results.
  - Add `claimed_by` field to Place model. Build a separate claiming flow with verification.

- [ ] **Local experiences marketplace**
  - Enable local guides to offer paid experiences (guided tours of religious sites, cultural walks, meditation sessions). SoulStep takes a commission.
  - New `experiences` table, booking flow, payment processing via Stripe Connect, rating/review system for guides.

- [ ] **API access for third-party developers**
  - Offer a public read-only API for religious place data. Free tier (100 requests/day), paid tiers for higher limits.
  - Add API key management, usage tracking, rate limiting per key, and developer portal documentation.

- [ ] **Sponsored places and contextual ads**
  - Non-intrusive sponsored listings in search results and nearby places. Clearly marked as "Sponsored". Relevant to religious tourism and cultural experiences.
  - Add `is_sponsored` flag, sponsor management in admin, impression/click tracking.

- [ ] **Donation platform integration**
  - Enable users to donate to religious sites directly through the app. Partner with payment providers for cross-border donations. SoulStep facilitates but does not process payments.

- [ ] **Premium group features**
  - Free groups limited to 10 members and 5 places. Premium groups unlock: unlimited members, custom itineraries, group analytics, shared photo albums, group challenges.
  - Gate by group creator's subscription tier or per-group upgrade purchase.

- [ ] **Analytics-as-a-Service for religious organizations**
  - Offer aggregated foot traffic, visitor demographics, and trend data to religious organizations and tourism boards. Privacy-preserving (no PII shared).
  - Build data pipeline to aggregate anonymized check-in and review data. Dashboard for organization partners.

---

## P3 — Scalability & DevOps

Infrastructure, optimization, monitoring, code quality, and documentation work for production readiness at scale.

### Infrastructure

- [ ] **CDN for images**
  - Place and review images are stored as database blobs (`LargeBinary`). This causes database bloat and poor performance at scale.
  - Upload images to cloud storage (GCS, S3, or Cloudflare R2) and serve via CDN. Update image URLs in the database to point to the CDN. Add cache-control headers.

- [ ] **Background job queue**
  - FastAPI `BackgroundTasks` runs in the same process and provides no retry, persistence, or monitoring.
  - Set up Celery with Redis (or a lighter alternative like `arq`). Move email sending, image processing, badge evaluation, and analytics aggregation to background jobs.

- [ ] **Mobile CI/CD pipeline**
  - GitHub Actions deploys only the API (Cloud Run) and web (Firebase Hosting). No mobile build/deploy.
  - Add EAS Build workflow for iOS and Android. Trigger on tagged releases or manual dispatch. Upload to TestFlight / Google Play internal track.

- [ ] **Load testing**
  - No performance benchmarks exist. Unknown how the API behaves under concurrent load.
  - Write Locust or k6 scripts for critical paths: place listing, place detail, search, check-in, and review submission. Run against a staging environment and document results.

- [ ] **Set up staging environment**
  - No pre-production validation environment. All testing happens in development or directly in production.
  - Create separate Cloud Run service for staging. Deploy from a `staging` branch. Separate database instance.
  - Files: `.github/workflows/deploy.yml`, `PRODUCTION.md`

- [ ] **Implement blue-green or canary deployments**
  - Cloud Run restarts all instances on deploy. No gradual rollout. No zero-downtime deploy strategy.
  - Configure Cloud Run traffic splitting for canary releases (10% → 50% → 100%). Add rollback automation.

- [ ] **Add Dependabot or Renovate for dependency updates**
  - No automated dependency update mechanism. Vulnerabilities in outdated packages go undetected.
  - Configure Dependabot for npm (web, mobile, admin) and pip (backend, scraper). Auto-create PRs for security updates.
  - Files: new `.github/dependabot.yml`

- [ ] **Implement feature flags system**
  - Cannot enable/disable features without a deploy. No gradual feature rollout capability.
  - Add a lightweight feature flags table or integrate with an open-source solution (Unleash, Flagsmith). Gate new features behind flags.

### Monitoring & Observability

- [ ] **Set up monitoring dashboards and alerting**
  - Prometheus endpoint exposed at `/metrics` but no dashboards or alerts configured. Issues go undetected.
  - Deploy Prometheus + Grafana (or use managed). Create dashboards for API health, DB performance, error rates, request latency. Set up alerts for high error rate, slow queries, and deploy failures.

- [ ] **Add distributed tracing (OpenTelemetry)**
  - No trace collection across services. Debugging cross-service issues requires log correlation.
  - Instrument FastAPI with `opentelemetry-instrumentation-fastapi`. Add trace context propagation between catalog API and scraper. Export to Jaeger or a managed tracing backend.

- [ ] **Implement uptime monitoring**
  - No synthetic probes to detect outages. SLO violations go undetected.
  - Set up UptimeRobot, Pingdom, or GCP Cloud Monitoring uptime checks for API health endpoint and web frontend. Alert on downtime.

- [ ] **Add Real User Monitoring (RUM) to frontends**
  - No visibility into actual user experience metrics (LCP, FID, CLS, TTFB).
  - Configure Sentry Performance or Web Vitals reporting. Track key metrics per route. Alert on regressions.

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

- [ ] **Reduce scraper image blob storage**
  - Scraper base64-encodes up to 3 images per place into JSON columns. 1000 places x 1.5MB = 1.5GB in JSON. Can cause OOM and DB lock contention.
  - Store image URLs only (not blobs). If blobs are needed, limit to 1 image per place, max 300KB. Move to object storage.
  - Files: `soulstep-scraper-api/app/collectors/gmaps.py`, `soulstep-scraper-api/app/db/models.py`

### Code Quality

- [ ] **Reduce code duplication in scraper collectors**
  - Review extraction, contact mapping, and description appending patterns are duplicated across gmaps, outscraper, foursquare, osm, and wikidata collectors (~150 lines of duplication).
  - Create shared `ReviewExtractor`, `ContactExtractor` utilities in `app/utils/extractors.py`.
  - Files: `soulstep-scraper-api/app/collectors/*.py`

- [ ] **Break down monolithic scraper functions**
  - `run_gmaps_scraper()` (~170 lines) and `sync_run_to_server()` (~110 lines) combine business logic, DB access, HTTP, and error handling. Hard to test and maintain.
  - Decompose into: `discover_places()`, `fetch_place_details()`, `store_discovered_places()`, `build_sync_payloads()`, `post_batch()`, `handle_sync_failures()`.
  - Files: `soulstep-scraper-api/app/scrapers/gmaps.py`, `soulstep-scraper-api/app/db/scraper.py`

- [ ] **Add type hints and response schema validation to scraper**
  - Many scraper functions lack type hints. Collector responses use `dict[str, Any]` everywhere. No validation that external API responses match expected schemas.
  - Add type hints to all functions. Create `TypedDict` for `CollectorResult`, `PlaceData`, etc. Add Pydantic response models for external APIs.
  - Files: `soulstep-scraper-api/app/collectors/*.py`, `soulstep-scraper-api/app/pipeline/*.py`

- [ ] **Set up monorepo tooling (Turborepo or npm workspaces)**
  - No shared scripts, no monorepo-wide linting/testing commands. Each app has independent config.
  - Add `turbo.json` or npm workspaces config. Create shared ESLint config package. Add `build:all`, `test:all`, `lint:all` root scripts.
  - Files: `package.json`, new `turbo.json`

- [ ] **Remove unused scraper dependencies**
  - `tqdm` and `httpx` are in `requirements.txt` but not used anywhere in the codebase.
  - Remove `tqdm` and `httpx` (or document `httpx` as reserved for future async migration).
  - Files: `soulstep-scraper-api/requirements.txt`

### Documentation & Compliance

- [ ] **Document security model and threat analysis**
  - No documented threat model, attack surface analysis, or security architecture.
  - Create `SECURITY.md` covering: auth flow, data encryption, API security, known risks, incident response.

- [ ] **Document data retention and privacy policies**
  - No data retention policy. Old data accumulates forever. No anonymization for deleted users. No documented GDPR/privacy compliance.
  - Define retention periods (analytics: 1 year, logs: 90 days, deleted user data: 30 days then purge). Implement user data export and deletion endpoints.

- [ ] **Create incident response runbooks**
  - No documented procedures for common incidents (API down, DB corruption, deployment failure, security breach).
  - Create runbooks for: rollback procedures, database restore, scaling under load, security incident response.

- [ ] **Pin scraper dependency versions for production**
  - All scraper deps use latest (no version constraints). Can pull incompatible versions.
  - Generate `requirements.lock` with pinned versions. Pin major versions at minimum: `requests>=2.28,<3`, `fastapi>=0.95,<1`.
  - Files: `soulstep-scraper-api/requirements.txt`

---

## How to Use This File

1. Pick items from the highest uncompleted priority tier first (P0 before P1, etc.).
2. Check off items as they are completed by replacing `[ ]` with `[x]`.
3. When committing a completed item, reference the roadmap entry in the commit message.
4. Review this file during sprint planning to select work items.
5. Add new items to the appropriate tier as they are discovered.
6. This file replaces both the previous `ROADMAP.md` and `ADMIN_ROADMAP.md`.
