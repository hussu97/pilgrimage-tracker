# Roadmap

Single unified roadmap for the SoulStep monorepo. Only **uncompleted** items. Check git history or CHANGELOG.md for completed work.

> **Last updated:** 2026-04-29

---

## P0 — Critical / Pre-Production

All P0 items completed. See CHANGELOG.md.

---

## P1 — High Priority

### Infrastructure

- [ ] **Add SIGTERM/graceful shutdown handling for FastAPI services**
  - No graceful shutdown logic. In-flight requests are dropped when the container is terminated.
  - Use FastAPI's `lifespan` context to drain in-flight requests before shutdown. Add a configurable drain timeout.
  - Files: `soulstep-catalog-api/app/main.py`, `soulstep-scraper-api/app/main.py`

### Backend

- [ ] **Track user last login timestamp**
  - No `last_login_at` field exists on the User model. Impossible to detect inactive accounts or suspicious login patterns.
  - Add `last_login_at: datetime | None = Field(default=None, sa_column=_TSTZ(nullable=True))` to User. Update on every successful login.
  - Files: `soulstep-catalog-api/app/db/models.py`, `soulstep-catalog-api/app/api/v1/auth.py`, new migration

- [ ] **Add absolute expiry enforcement on refresh tokens**
  - Refresh tokens only expire by TTL from last use (sliding window). A token used daily never expires.
  - Add `absolute_expires_at` field to the refresh token table. Set to `issued_at + 90 days`. Reject tokens past this regardless of TTL.
  - Files: `soulstep-catalog-api/app/db/models.py`, `soulstep-catalog-api/app/api/v1/auth.py`

- [ ] **Add token blocklist for session invalidation on logout**
  - Logout does not invalidate the access token (JWTs are stateless). A stolen token remains valid until expiry.
  - On logout, add the JTI to a blocklist (Redis or DB table) with TTL matching token expiry. Check blocklist on every authenticated request.
  - Files: `soulstep-catalog-api/app/core/security.py`, `soulstep-catalog-api/app/api/v1/auth.py`

- [ ] **Add JSON schema validation for opening_hours**
  - `opening_hours` is stored as free-form JSON. Malformed data causes runtime errors when rendering.
  - Define a Pydantic schema. Validate on write (scraper sync + admin PATCH). Reject invalid shapes with 422.
  - Files: `soulstep-catalog-api/app/api/v1/admin/places.py`, `soulstep-catalog-api/app/api/v1/places.py`

- [ ] **Validate place codes in group itineraries**
  - Place existence is not validated when adding to a group itinerary. Orphaned place codes can be stored.
  - Add a DB lookup to verify each `place_code` exists before inserting. Return 422 for unknown codes.
  - Files: `soulstep-catalog-api/app/api/v1/groups.py`

- [ ] **Add cascade delete logic for Place and User deletion**
  - Deleting a Place or User does not cascade to dependent records (check-ins, reviews, favorites, group memberships).
  - Add `cascade="all, delete-orphan"` to SQLModel relationships or manually delete dependents before the parent.
  - Files: `soulstep-catalog-api/app/db/models.py`, `soulstep-catalog-api/app/api/v1/admin/places.py`, `soulstep-catalog-api/app/api/v1/admin/users.py`

- [ ] **Add request timeouts to Resend email and translation API calls**
  - No explicit timeouts. A slow external service stalls the request thread indefinitely.
  - Add `timeout=10` to Resend SDK calls and `timeout=(5, 30)` to Cloud Translation HTTP calls.
  - Files: `soulstep-catalog-api/app/services/`, `soulstep-catalog-api/scripts/generate_seo.py`

### UX Completeness

- [ ] **Consent gating for analytics (wire up useUmamiTracking TODO)**
  - `useUmamiTracking.ts` has a `TODO: wire consent check` comment. Analytics fire regardless of consent, violating GDPR.
  - Gate all `umami.track()` calls behind the existing consent state.
  - Files: `apps/soulstep-customer-web/src/lib/hooks/useUmamiTracking.ts`

---

## P2 — Feature Enhancements

### User Features

- [ ] **Badges and achievements system**
  - Profile API returns hardcoded `0` for badges (TODO in code).
  - Design badge criteria, create `badges` table and evaluation service, add `GET /api/v1/users/me/badges`. Show on profile.
  - Files: `soulstep-catalog-api/app/api/v1/users.py`, new models and migration

- [ ] **Push notifications**
  - `Notification` model exists but no push delivery is implemented.
  - Integrate Web Push API. Send on: new review on favorited place, badge earned, streak reminder.
  - Files: new `soulstep-catalog-api/app/services/push.py`, `apps/soulstep-customer-web/src/`

- [ ] **Directions integration**
  - No way to get directions to a place from within the app.
  - Add "Directions" button on place detail that opens Google Maps in a new tab.
  - Files: `apps/soulstep-customer-web/src/app/pages/PlaceDetail.tsx`

- [ ] **Recently viewed places**
  - No record of viewed places.
  - Track last 20 viewed places in local storage. Show "Recently Viewed" on home screen.
  - Files: `apps/soulstep-customer-web/src/app/pages/Home.tsx`

- [ ] **Religion expansion**
  - "View More Faiths" button is non-functional. Only Islam, Christianity, and Hinduism are supported.
  - Add Buddhism, Sikhism, Judaism, Baha'i, Zoroastrianism. Seed places, update filter chips, and add translation keys for all 5 languages.
  - Files: `soulstep-catalog-api/app/db/seed_data.json`, `soulstep-scraper-api/app/`

- [ ] **Check-in streaks with gamification**
  - No gamification around consecutive daily check-ins.
  - Track current and longest streak. Show flame icon + count. Send push notification before streak breaks. Award badges at 7, 30, 100 days.
  - Files: `soulstep-catalog-api/app/api/v1/users.py`, `soulstep-catalog-api/app/db/models.py`

- [ ] **Onboarding tour for new users**
  - No guidance for first-time users.
  - Show guided tooltip overlay on first login. Store `has_seen_onboarding` flag locally.
  - Files: `apps/soulstep-customer-web/src/`

- [ ] **Offline mode with sync queue**
  - App is unusable without a network connection. No cached data, no offline check-ins.
  - Design a deliberate web-only offline strategy with explicit cache versioning, update prompts, and service-worker tombstones before registering a new worker.
  - Files: `apps/soulstep-customer-web/public/`, `apps/soulstep-customer-web/src/`

- [ ] **Optimistic UI updates for favorites and check-ins**
  - Favorite toggles and check-ins show a loading state, then reload data.
  - Update UI immediately. Revert on API failure.
  - Files: `apps/soulstep-customer-web/src/app/pages/PlaceDetail.tsx`

- [ ] **Image lazy loading and CLS prevention**
  - Place card images lack `loading="lazy"` and explicit dimensions, causing layout shift.
  - Add `loading="lazy"`, `width`, `height` to all `<img>` elements. Use aspect-ratio containers.
  - Files: `apps/soulstep-customer-web/src/components/places/PlaceCardUnified.tsx`

### Backend Features

- [ ] **Webhook and event system**
  - No real-time notifications or external integrations when key actions occur.
  - Implement internal event bus. Publish on: new review, check-in, badge earned. Consumers send push notifications or call external webhooks.
  - Files: new `soulstep-catalog-api/app/services/events.py`

- [ ] **Geographic boundary management API**
  - Boundaries (cities, regions) are seed-only. No CRUD API.
  - Add `GET/POST/PUT/DELETE /api/v1/admin/geo-boundaries`. Wire to admin dashboard.
  - Files: `soulstep-catalog-api/app/api/v1/admin/`, new model and migration

- [ ] **Bulk delete endpoints for admin operations**
  - Admin can only delete records one at a time.
  - Add `DELETE /api/v1/admin/reviews/bulk`, `/users/bulk`, `/checkins/bulk` accepting a list of codes (max 100).
  - Files: `soulstep-catalog-api/app/api/v1/admin/`

- [ ] **Admin password reset for users**
  - Admins cannot reset a user's password.
  - Add `POST /api/v1/admin/users/{code}/reset-password` that sends a reset email via Resend.
  - Files: `soulstep-catalog-api/app/api/v1/admin/users.py`

- [ ] **User ban/suspension system with reasons**
  - No mechanism to ban abusive users without deleting the account.
  - Add `is_banned`, `banned_at`, `ban_reason` to User model. Banned users receive 403. Admin UI for ban/unban.
  - Files: `soulstep-catalog-api/app/db/models.py`, `soulstep-catalog-api/app/api/v1/admin/users.py`, new migration

- [ ] **Review moderation workflow with rejection reasons**
  - Reviews are published immediately with no moderation step.
  - Add `moderation_status` (`pending`/`approved`/`rejected`) and `rejection_reason` to Review. Add admin moderation queue endpoint.
  - Files: `soulstep-catalog-api/app/db/models.py`, `soulstep-catalog-api/app/api/v1/admin/reviews.py`, new migration

- [ ] **Bulk place image management in admin**
  - No bulk upload, no bulk alt-text generation, no view of all images missing alt text.
  - Add "Place Images" admin page: filterable by missing alt text, bulk alt-text generation trigger, bulk delete.
  - Files: `apps/soulstep-admin-web/src/app/pages/`, `soulstep-catalog-api/app/api/v1/admin/`

- [ ] **Advanced export formats (JSON, Excel, filtered)**
  - Admin CSV export is basic. No JSON/Excel. No filtered exports.
  - Add JSON and `.xlsx` export. Support column/date-range filters on admin export endpoints.
  - Files: `soulstep-catalog-api/app/api/v1/admin/`

- [ ] **Enhanced analytics dashboard (retention, funnels, cost analysis)**
  - Admin analytics shows basic counts only.
  - Add retention cohorts, conversion funnels (view → check-in), and cost-per-place analysis.
  - Files: `soulstep-catalog-api/app/api/v1/admin/analytics.py`, `apps/soulstep-admin-web/src/`

### Scraper Enhancements

- [ ] **Add concurrency to scraper enrichment pipeline**
  - Enrichment runs collectors sequentially per place. ~4× speedup possible with concurrent collectors.
  - Run independent collectors concurrently with `asyncio.gather`. Keep sequential ordering for collectors with dependencies.
  - Files: `soulstep-scraper-api/app/pipeline/enrichment.py`

- [ ] **Add client-side rate limiting for external APIs in scraper**
  - No client-side rate limiting. The scraper relies on external services returning 429.
  - Implement token-bucket rate limiters per API client. Stay within known rate limits proactively.
  - Files: `soulstep-scraper-api/app/collectors/`, `soulstep-scraper-api/app/scrapers/`

### Monetization

- [ ] **Premium subscription tier (SoulStep Pro)**
- [ ] **B2B partnerships — place claiming and sponsorships**
- [ ] **Local experiences marketplace**
- [ ] **API access for third-party developers**
- [ ] **Donation platform integration**
- [ ] **Premium group features**
- [ ] **Analytics-as-a-Service for religious organizations**

---

## P3 — Scalability & DevOps

### Infrastructure

- [ ] **CDN for images**
  - Images stored in GCS are served without a CDN. High latency for distant users.
  - Add Cloudflare or Cloud CDN in front of the GCS bucket. Update image URLs. Add cache-control headers.

- [ ] **Background job queue (Celery or arq)**
  - FastAPI `BackgroundTasks` runs in-process with no retry, persistence, or monitoring.
  - Set up Celery with Redis or `arq`. Move email sending, image processing, badge evaluation, analytics aggregation.
  - Files: new `soulstep-catalog-api/app/workers/`

- [ ] **Load testing**
  - No performance benchmarks. Unknown behavior under concurrent load.
  - Write Locust or k6 scripts for critical paths: place listing, detail, search, check-in, review. Document results.
  - Files: new `load-tests/`

- [ ] **Dependabot for dependency updates**
  - No automated dependency update mechanism. Vulnerabilities in outdated packages go undetected.
  - Configure Dependabot for npm and pip. Auto-create PRs for security updates.
  - Files: new `.github/dependabot.yml`

- [ ] **Feature flags system**
  - Cannot enable/disable features without a deploy.
  - Add a lightweight feature flags table or integrate Unleash / Flagsmith.
  - Files: `soulstep-catalog-api/app/db/models.py`, new migration

- [ ] **Multi-stage Docker builds for image size optimization**
  - Single-stage builds include build tools in production images.
  - Use multi-stage builds: `builder` installs deps, `runtime` copies only app + installed packages.
  - Files: `soulstep-catalog-api/Dockerfile`, `apps/soulstep-customer-web/Dockerfile`

### Monitoring & Observability

- [ ] **Monitoring dashboards and alerting (Prometheus + Grafana)**
  - Prometheus endpoint exists at `/metrics` but no dashboards or alerts configured.
  - Deploy Prometheus + Grafana. Alert on high error rate, slow queries, and deploy failures.

- [ ] **Distributed tracing (OpenTelemetry)**
  - No trace collection across services.
  - Instrument FastAPI with `opentelemetry-instrumentation-fastapi`. Export to Jaeger or a managed backend.

- [ ] **Uptime monitoring**
  - No synthetic probes to detect outages.
  - Set up UptimeRobot / GCP Cloud Monitoring uptime checks for API health endpoint and web frontend.

- [ ] **Real User Monitoring (Web Vitals)**
  - No visibility into LCP, FID, CLS, TTFB.
  - Configure Sentry Performance or Web Vitals API reporting. Alert on regressions.

### Optimization

- [ ] **Response caching (Redis / in-memory with TTL)**
  - Every request hits the database, even for rarely-changing data (translations, religion list, city list).
  - Cache translations for the session, place lists for 5 min, religion/category metadata for 1 hour.
  - Files: `soulstep-catalog-api/app/api/v1/`

- [ ] **Image optimization pipeline**
  - Images stored and served at original size/format. No WebP conversion. No multiple sizes.
  - Resize to standard dimensions on upload. Convert to WebP. Serve based on context.
  - Files: `soulstep-catalog-api/app/api/v1/admin/places.py`

- [ ] **Frontend bundle optimization**
  - Routes are lazy-loaded but no further code splitting configured.
  - Configure Vite `manualChunks`. Analyze with `rollup-plugin-visualizer`. Remove large unused dependencies.
  - Files: `apps/soulstep-customer-web/vite.config.ts`

### Scraper Reliability

- [ ] **Per-collector retry logic with partial result acceptance**
  - A single collector failure aborts enrichment for the entire place.
  - Wrap each collector in try/except. Accept partial results from whichever collectors succeeded.
  - Files: `soulstep-scraper-api/app/pipeline/enrichment.py`

- [ ] **Google Maps API exponential backoff on 429**
  - Backoff on 429 is a fixed sleep.
  - Implement exponential backoff with jitter. Respect `Retry-After` header.
  - Files: `soulstep-scraper-api/app/collectors/gmaps.py`, `soulstep-scraper-api/app/scrapers/base.py`

- [ ] **Request deduplication across scraper runs**
  - The same place can be scraped multiple times in overlapping grid cells.
  - Track visited place IDs per run. Deduplicate on external ID before enrichment.
  - Files: `soulstep-scraper-api/app/scrapers/gmaps.py`

- [ ] **QueryLog auto-pruning**
  - `QueryLog` table grows without bound. Old logs are never deleted.
  - Add a scheduled job to prune rows older than 90 days. Run weekly.
  - Files: `soulstep-scraper-api/app/db/`, `soulstep-scraper-api/app/main.py`

### Code Quality & Docs

- [ ] **Security model and threat analysis (SECURITY.md)**
  - No documented threat model or attack surface analysis.
  - Create `SECURITY.md` covering auth flow, data encryption, API security, known risks, incident response.

- [ ] **Data retention and privacy policies**
  - No retention policy. Old data accumulates. No GDPR-compliant deletion process.
  - Define retention periods (analytics: 1 year, logs: 90 days, deleted user PII: 30 days then purge).

- [ ] **Pin scraper dependency versions for production**
  - Scraper deps use unpinned latest. Unexpected upgrades can break production.
  - Generate `requirements.lock` with pinned versions.
  - Files: `soulstep-scraper-api/requirements.txt`

- [ ] **Troubleshooting guide (TROUBLESHOOTING.md)**
  - Common setup and runtime issues are undocumented.
  - Document: DB migration failures, env variable issues, Playwright browser install, Docker pitfalls, test setup.
  - Files: new `TROUBLESHOOTING.md`
