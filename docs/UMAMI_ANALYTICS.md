# SoulStep Analytics — Umami Cloud

Single source of truth for what the customer web app tracks, why, and how to
extend it.

- **App tracked:** `apps/soulstep-customer-web` (Next.js 15 App Router on Vercel)
- **Backend:** Umami Cloud (`cloud.umami.is`) — privacy-friendly, cookie-free
- **Same-origin proxy:** `/umami/*` rewrites to `cloud.umami.is/*` via
  `next.config.ts` so ad-blockers don't strip the script

---

## 1. Configuration

### Environment variables

| Var | Where | Required | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_UMAMI_WEBSITE_ID` | Vercel dashboard (prod) + `.env.local` (dev) | Optional — disables analytics entirely when unset | UUID from Umami Cloud → Websites → your site |

The `<Script>` tag in `app/layout.tsx` is gated on this value (`{UMAMI_ID && …}`).
If it's empty, **no** script loads and **all** `trackUmamiEvent` calls no-op.
That's the intended off-switch — not a bug.

### Request flow

```
Browser
  ↳ GET  /umami/script.js        →  cloud.umami.is/script.js   (same-origin, cached)
  ↳ POST /umami/api/send         →  cloud.umami.is/api/send    (event ingestion)
```

Both legs are rewritten by `next.config.ts` in **every** environment (dev +
prod). This rewrite has bitten us once: it used to be dev-only, which is why
production Umami was silently dead until 2026-04-21.

### Verifying it works

1. **Dev:** `npm run dev`, open the app, open DevTools → Network, filter
   `api/send`. You should see a `POST` on initial load. Navigate between
   routes → one `POST` per navigation.
2. **Prod:** same check against `https://soul-step.org/umami/api/send`.
3. **Dashboard:** Umami Cloud → your website → Events. New events appear within
   ~1 minute.

### Common gotchas

- **"0 events in production"** → check `NEXT_PUBLIC_UMAMI_WEBSITE_ID` is set in
  the Vercel project's env vars for the prod branch, *and* that the most recent
  deploy happened after setting it (Next.js inlines `NEXT_PUBLIC_*` at build
  time, not runtime).
- **"Dev console says unset but I set it"** → restart `npm run dev`. Next.js
  only reads `.env.local` at boot.
- **"Events show on some browsers, not others"** → an aggressive ad-blocker may
  still block `/umami/script.js` even same-origin. Umami doesn't let you rename
  that path; our own domain just happens not to be on most blocklists.
- **Consent banner currently does NOT gate analytics** — there's a TODO in
  `useUmamiTracking.ts`. When the consent UX is finished, re-enable the guard.

---

## 2. Architecture

```
index.html / app/layout.tsx      ← loads script (initial pageview only)
              │
              ▼
  window.umami.track(…)
              │
              ▼
 ┌─────────────────────────────┐
 │ useUmamiTracking (named     │  ← custom events at user-action sites
 │ events)                      │
 └─────────────────────────────┘
 ┌─────────────────────────────┐
 │ useUmamiPageViews (SPA soft │  ← route-change pageviews (mounted once in App.tsx)
 │ nav — fires every next/link)│
 └─────────────────────────────┘
```

**Why two page-view sources?** The Umami script's built-in auto-tracker fires
only when the HTML document reloads. Next.js soft navigations don't reload,
so without `useUmamiPageViews` the dashboard would only see deep-link entries.

---

## 3. How to add a new event

1. Add the name to `src/lib/analytics/events.ts` under the correct namespace
   (use `snake_case`, stay consistent with existing names).
2. Call it at the trigger site:
   ```tsx
   import { useUmamiTracking } from '@/lib/hooks/useUmamiTracking';
   import { EVENTS } from '@/lib/analytics/events';

   const { trackUmamiEvent } = useUmamiTracking();
   trackUmamiEvent(EVENTS.namespace.event_name, { place_code: 'plc_abc' });
   ```
3. Add the row to the Event catalog below.
4. If the event is a **goal** or a **funnel step**, update sections 5/6 of this
   doc and configure it in the Umami dashboard (goals/funnels are dashboard-
   side config, not code).

**Event payload convention:** event name carries the *what*; the `data` object
carries the *context* (entity codes, religion, counts, intent). Keep payload
keys flat and snake_case. Avoid PII.

---

## 4. Event catalog

Grouped by namespace in `EVENTS`.

### Auth

| Event | Where it fires | Data payload |
|---|---|---|
| `auth_signup_submit` | Register form submit click | — |
| `auth_signup_success` | After successful `register()` call | — |
| `auth_login_submit` | Login form submit click | — |
| `auth_login_success` | After successful `login()` call | — |
| `auth_logout` | Logout button click in Profile | — |
| `auth_forgot_password` | Forgot-password form submit success | — |
| `auth_reset_password_success` | Reset-password form submit success | — |

### Onboarding

| Event | Where it fires | Data payload |
|---|---|---|
| `onboarding_start` | Onboarding screen mount | — |
| `onboarding_complete` | "Get started" on last card | `last_card_index` |
| `onboarding_skip` | Skip button | `last_card_index` |

### Discover

| Event | Where it fires | Data payload |
|---|---|---|
| `discover_search_submit` | *(reserved — search UI not yet standardized)* | — |
| `discover_filter_toggle` | Religion pill on Places, filter pill on Map | `source`, `filter`, `active`/`value` |
| `discover_city_click` | City collage click on ExploreCities | `city`, `count` |
| `discover_religion_click` | *(reserved — religion filter UI in flux)* | — |
| `discover_map_pan` | MapDiscovery bounds change (debounced 2s) | — |
| `discover_map_zoom` | *(reserved)* | — |
| `discover_place_card_click` | `PlaceCardUnified` click (via `onCardClick` prop) | `source`, `place_code`, `religion?`, `city?` |

### Place engagement

| Event | Where it fires | Data payload |
|---|---|---|
| `place_view` | PlaceDetail mounts with a loaded place | `place_code`, `religion` |
| `place_favorite_add` | Favorite toggled on | `place_code` |
| `place_favorite_remove` | Favorite toggled off | `place_code` |
| `place_check_in_submit` | Check-in clicked (pre-await) | `place_code` |
| `place_check_in_success` | Check-in request succeeded | `place_code` |
| `place_share_click` | Share button clicked | `place_code`, `method` (`shared`/`copied`) |
| `place_add_to_journey_click` | "Add to more groups" CTA | `place_code` |

### Review

| Event | Where it fires | Data payload |
|---|---|---|
| `review_start` | WriteReview mounts | `place_code` |
| `review_rating_select` | Star tapped | `place_code`, `rating` |
| `review_photo_upload` | Photo added to the review | `place_code` |
| `review_submit` | Review submit success | `place_code`, `rating`, `has_photos` |
| `review_delete` | Review row delete succeeded | `review_code` |

### Journey / Group

| Event | Where it fires | Data payload |
|---|---|---|
| `journey_create_start` | CreateGroup mount | — |
| `journey_create_submit` | CreateGroup submit success | `intent`, `place_count` |
| `journey_place_add` | EditGroupPlaces save with net additions | `group_code`, `count` |
| `journey_place_remove` | EditGroupPlaces save with net removals | `group_code`, `count` |
| `journey_invite_click` | Invite/share-link button | `group_code` |
| `journey_member_remove` | Admin removes a member | `group_code` |
| `journey_join_submit` | JoinGroup submit success | — |
| `journey_leave` | Leave-group success | `group_code` |
| `journey_complete` | *(not yet wired — compute in check-in handler when nth/last check-in completes the route)* | — |

### Profile

| Event | Where it fires | Data payload |
|---|---|---|
| `profile_language_change` | Language dropdown select | `language` |
| `profile_theme_toggle` | Dark-mode toggle | `theme` |
| `profile_religion_change` | Religion path save | `count` |
| `profile_edit_submit` | EditProfile save success | `religion_count` |

### Error

| Event | Where it fires | Data payload |
|---|---|---|
| `error_boundary_trip` | *(reserved — wire in `ErrorBoundary.tsx`)* | — |

---

## 5. Goals (conversion checkpoints)

Configure these in **Umami → your website → Goals**. Each is a single event
hit counted as one conversion per visitor per session.

| # | Event name | Why it matters |
|---|---|---|
| 1 | `auth_signup_success` | Acquisition floor |
| 2 | `onboarding_complete` | Activation — user got through the intro |
| 3 | `place_check_in_success` | Primary product action |
| 4 | `place_favorite_add` | Intent / save-for-later |
| 5 | `journey_create_submit` | High-intent engagement |
| 6 | `journey_join_submit` | Social activation |
| 7 | `review_submit` | Content contribution |

**Dashboard steps (same for each):** Goals → Create goal → Type: Event →
Event name: *(paste from above)* → Save.

---

## 6. Journeys (funnels)

Configure in **Umami → your website → Journeys**. Umami does ordered-step
funnels; each step is an event name that must fire in order (same visitor).

### 6.1 Signup → first engagement
```
auth_signup_submit
  → auth_signup_success
  → onboarding_complete
  → place_view
  → place_check_in_success
```

### 6.2 Review submission
```
place_view
  → review_start
  → review_rating_select
  → review_submit
```

### 6.3 Journey creation
```
journey_create_start
  → journey_create_submit
  → journey_place_add
  → journey_invite_click
```

### 6.4 Discovery → conversion
```
discover_place_card_click
  → place_view
  → place_check_in_success
```

### 6.5 Social join
```
journey_join_submit
  → place_check_in_success
```

---

## 7. Files involved

Core:
- `apps/soulstep-customer-web/src/lib/analytics/events.ts` — `EVENTS` constants + `EventName` type + `routeToPageName`
- `apps/soulstep-customer-web/src/lib/hooks/useUmamiTracking.ts` — `trackUmamiEvent` hook, website-id guard
- `apps/soulstep-customer-web/src/lib/hooks/useUmamiPageViews.ts` — SPA route-change pageviews
- `apps/soulstep-customer-web/app/layout.tsx` — `<Script>` tag (conditional on `NEXT_PUBLIC_UMAMI_WEBSITE_ID`)
- `apps/soulstep-customer-web/next.config.ts` — `/umami/*` same-origin rewrite
- `apps/soulstep-customer-web/src/app/App.tsx` — `<UmamiPageViewTracker />` mount point

Tests:
- `apps/soulstep-customer-web/src/__tests__/umami.test.ts` — payload builder
- `apps/soulstep-customer-web/src/__tests__/analytics-events.test.ts` — EVENTS taxonomy, `routeToPageName`, `isWebsiteIdConfigured`
