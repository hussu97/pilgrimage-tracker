# Cleanup Tracker

This document tracks all known issues, technical debt, and cleanup tasks across the pilgrimage-tracker codebase. Items are organized by severity and area. Use the checkboxes to track progress.

---

## 1. Critical Bugs (Must Fix Immediately)

These issues will cause runtime crashes or incorrect behavior in production.

- [x] **reviews.py runtime crash** (`server/app/api/v1/reviews.py` lines 44-49): `delete_review` references non-existent attributes `reviews_db.reviews_by_code`, `.reviews_by_place`, and `.reviews_by_user`. These are leftover from a previous in-memory caching approach and will crash at runtime when any review deletion is attempted.

- [x] **users.py attribute error** (`server/app/api/v1/users.py` lines 70-71, 78, 144): Code accesses `.image_urls` on the `Place` model, but that attribute does not exist on the current model. Should use `place_images.get_images()` instead.

- [x] **JWT expiration ignores config** (`server/app/core/security.py` line 18): Token expiration is hardcoded to 7 days. The `JWT_EXPIRE` config variable is defined but never read, so changing the config has no effect.

- [x] **Dangerous session handling** (`server/app/services/place_images.py` lines 18, 41, 59, 90): Uses `next(get_session())` outside the FastAPI dependency-injection context. This bypasses proper session lifecycle management, risks leaked connections, and will not roll back on errors. Should accept a `Session` parameter injected by FastAPI `Depends()`.

---

## 2. Architecture Cleanup (Folder Structure, File Organization, Module Extraction)

### File Size and Extraction

- [ ] **places.py is 513 lines** (`server/app/api/v1/places.py`): The largest API file. Extract `_build_timings()` (129 lines, lines 64-193) and `_build_specifications()` (40 lines) into dedicated service modules under `server/app/services/`.

- [ ] **PlaceDetail.tsx is ~750 lines** (`apps/web/src/pages/PlaceDetail.tsx`): Split into sub-components (header, timings panel, reviews section, photo gallery, specifications list).

- [ ] **Home.tsx is ~450 lines** (`apps/web/src/pages/Home.tsx`): Extract map view, filter bar, and place list into separate components.

- [ ] **HomeScreen.tsx is 925 lines** (`apps/mobile/src/screens/HomeScreen.tsx`): Split into sub-components mirroring the web breakdown.

- [ ] **PlaceDetailScreen.tsx is 1070 lines** (`apps/mobile/src/screens/PlaceDetailScreen.tsx`): Split into sub-components mirroring the web breakdown.

### Folder Organization

- [ ] **Web components flat structure** (`apps/web/src/components/`): No subdirectories. Organize into `components/places/`, `components/groups/`, `components/reviews/`, `components/common/`, etc.

- [ ] **Mobile components flat structure** (`apps/mobile/src/components/`): Same issue as web. Organize into domain-based subdirectories.

- [ ] **Types files** (`apps/web/src/lib/types/index.ts` and `apps/mobile/src/lib/types/index.ts`): Single monolithic type file. Split by domain: `places.ts`, `users.ts`, `groups.ts`, `reviews.ts`, `translations.ts`.

### Dead Files and References

- [x] **enriched_places.json deleted**: `data_scraper/enriched_places.json` was deleted (visible in git status). Verify no remaining imports or references to this file exist in the scraper or seed scripts.

- [x] **Possible duplicate gmaps.py**: Check whether an old `data_scraper/gmaps.py` exists alongside the proper `data_scraper/app/scrapers/gmaps.py`. If so, remove the old one.

- [x] **Unused component SearchBar.tsx** (`apps/mobile/src/components/SearchBar.tsx`): Never imported anywhere. Remove or integrate.

- [x] **Unused component PrimaryButton.tsx** (`apps/mobile/src/components/PrimaryButton.tsx`): Never imported anywhere. Remove or integrate.

- [x] **Unused screen MapScreen.tsx** (`apps/mobile/src/screens/MapScreen.tsx`): Exists but not wired into navigation. Its functionality is duplicated in HomeScreen. Remove or integrate into navigation.

---

## 3. Code Quality (Dead Code, Naming Consistency, Type Safety)

### Duplicate and Redundant Imports

- [x] **Duplicate Column import** (`server/app/models/models.py` lines 4-5): `Column` is imported from both `sqlalchemy` and `sqlmodel`. Remove the redundant import.

- [x] **Redundant auth imports** (`server/app/api/v1/auth.py`): Functions are imported both as a module reference and individually. Consolidate to one style.

### Type Safety

- [x] **Lowercase `any` type hint** (`server/app/api/v1/users.py` line 31): Uses Python's built-in `any` instead of `Any` from `typing`. This is a type error that linters may miss.

- [ ] **PlaceAttributeInput.value is `Any`** (`server/app/schemas/`): No validation on attribute values. Add a constrained union type or validator.

- [ ] **Force cast `navigate('Main' as never)`** (`apps/mobile/src/screens/WriteReviewScreen.tsx` line 93): Type assertion masks a navigation typing issue. Fix the navigation type definitions so the cast is unnecessary.

### Empty and Stub Implementations

- [x] **Rating sort is a no-op** (`server/app/api/v1/places.py` lines 278-280): `if sort == "rating": pass` -- the sort branch does nothing. Implement or remove the sort option from the API.

- [ ] **Password reset sends no email** (`server/app/api/v1/auth.py` lines 79-80): Endpoint exists but the email dispatch is stubbed out. Either implement with a mail service or return 501 Not Implemented.

- [ ] **Badges system returns hardcoded 0**: Badge counts are always zero. Either implement the badges feature or remove the field from API responses to avoid confusion.

- [ ] **Photo upload UI with no implementation** (web: `WriteReview` component; mobile: `WriteReviewScreen`): Upload button is rendered but no file picker or upload logic exists. Wire up image picker and upload to the backend.

- [ ] **"View More Faiths" button is a no-op** (web: `SelectPath` component; mobile: `SelectPathScreen`): Button renders but the `onPress`/`onClick` handler is empty. Implement or hide the button.

### Naming Inconsistencies

- [ ] **`source_type` vs `source`**: The scraper uses `source_type` while the server uses `source` for the same concept. Align on one name across the codebase.

- [ ] **`image_type` vs `images` array**: Backend uses `image_type` ("url"/"blob") but the frontend only sees an `images` array. Clarify the schema so the distinction is transparent or unnecessary on the client side.

- [x] **`google_reviews` field in PlaceCreate schema**: The field is still named `google_reviews` despite the system renaming the concept to "external reviews". Rename to `external_reviews`.

- [ ] **Inconsistent styling patterns (mobile)**: Some screens use `makeStyles(isDark)`, others use inline conditional styles. Pick one pattern and apply it consistently.

- [ ] **Inconsistent className patterns (web)**: Mix of template literals and conditional joins for `className`. Standardize on one approach (recommendation: template literals with a `cn()` utility).

### Schema and Validation

- [ ] **PlaceCreate accepts both `image_urls` and `image_blobs`**: No documented precedence for which wins if both are provided. Add validation that rejects requests with both, or document the priority.

- [ ] **No place deletion endpoint**: Places can be created and updated but not deleted. Add `DELETE /api/v1/places/:placeCode` or document why deletion is intentionally omitted.

- [ ] **No user avatar upload endpoint**: Users cannot upload profile images through the API. Add an upload endpoint or integrate with the existing image service.

### Performance

- [ ] **Groups activity N+2 query problem** (`server/app/api/v1/groups.py`): Activity calculation uses complex nested loops with additional queries per iteration. Refactor to use joined/eager loading or a single aggregated query.

- [ ] **Hardcoded UTC offset in gmaps.py** (`data_scraper/app/scrapers/gmaps.py` line 97): Opening hours conversion is hardcoded for UAE (+4). Use timezone-aware datetime handling (e.g., `pytz` or `zoneinfo`) based on the place's location.

- [ ] **`makeStyles()` recreated on every render** (`apps/mobile/src/screens/HomeScreen.tsx`): The style object is regenerated each render cycle. Wrap in `useMemo` with `isDark` as a dependency.

- [ ] **PlaceCard not memoized** (`apps/mobile/src/components/PlaceCard.tsx`): Not wrapped in `React.memo()`. Since it renders in lists, memoization would prevent unnecessary re-renders.

- [ ] **FilterChip not memoized** (`apps/mobile/src/components/FilterChip.tsx`): Same issue as PlaceCard. Wrap in `React.memo()`.

- [ ] **No image caching library (mobile)**: The mobile app loads images without a caching layer. Integrate `react-native-fast-image` or equivalent to reduce network usage and improve scroll performance.

---

## 4. Frontend Web Cleanup

### Internationalization (i18n) Violations

All customer-facing strings must come from the backend translation API per project rules.

- [x] **JoinGroup.tsx line 56**: `"No invite code"` -- hardcoded English string.
- [x] **JoinGroup.tsx line 57-58**: `"Use a link like /join?code=XXX"` -- hardcoded English string.
- [x] **JoinGroup.tsx line 79**: `"You're invited to join"` -- hardcoded English string.
- [x] **JoinGroup.tsx line 81**: `"Join with this invite code"` -- hardcoded English string.
- [x] **JoinGroup.tsx line 101**: `"Join"` button label -- hardcoded English string.

### Dark Mode and Styling

- [ ] **ResetPassword.tsx missing dark mode styles** (lines 46, 58, 68): The success state and no-token state do not apply dark mode classes. Background and text colors will be incorrect in dark mode.

### Missing UI Patterns

- [ ] **No React Error Boundary**: The web app has no error boundary component. A crash in any component will unmount the entire app. Add an error boundary at the router level at minimum.

- [ ] **No loading skeletons**: Most pages show plain "Loading..." text instead of skeleton placeholders. Add skeleton components for place cards, lists, and detail views.

---

## 5. Frontend Mobile Cleanup

### Internationalization (i18n) Violations

- [ ] **PlaceDetailScreen.tsx line 183**: `"Delete review?"` -- hardcoded English string.
- [ ] **PlaceDetailScreen.tsx line 184**: `"This cannot be undone."` -- hardcoded English string.
- [ ] **PlaceDetailScreen.tsx line 235**: `"Checked in"` -- hardcoded English string.
- [ ] **CreateGroupScreen.tsx line 88**: `"Group created"` -- hardcoded English string.
- [ ] **CreateGroupScreen.tsx line 89**: `"Share this link"` -- hardcoded English string.
- [ ] **CreateGroupScreen.tsx line 147**: `"Private group (invite only)"` -- hardcoded English string.
- [ ] **JoinGroupScreen.tsx lines 98-101, 127, 142**: Multiple hardcoded English strings across the join flow.
- [ ] **GroupDetailScreen.tsx lines 215, 218, 220, 236**: Multiple hardcoded English strings in the group detail view.

### Missing UI Patterns

- [ ] **No React Error Boundary**: Same as web -- no crash protection. Add an error boundary wrapping the navigation container.

### Feature Parity (Web to Mobile)

Per project rule 9, both frontends must stay in feature parity. The following need verification:

- [ ] Audit every screen/route in web and confirm a corresponding screen exists in mobile.
- [ ] Audit every API client method in web and confirm the same method exists in mobile.
- [ ] Audit navigation/route names and params for consistency.

---

## 6. Backend Cleanup (Session Management, Validation, Error Handling)

Items in this section overlap with sections above but are grouped here for backend-focused work.

- [ ] Refactor `place_images.py` to accept `Session` via dependency injection instead of calling `next(get_session())`.
- [ ] Fix `reviews.py` to use the database session for review lookups and deletion instead of non-existent in-memory dictionaries.
- [ ] Fix `users.py` to use `place_images.get_images()` instead of the removed `.image_urls` attribute.
- [ ] Read `JWT_EXPIRE` from config in `security.py` instead of using the hardcoded 7-day value.
- [ ] Implement or remove the rating sort branch in `places.py`.
- [ ] Implement email dispatch for password reset in `auth.py`, or return an appropriate error status.
- [ ] Add validation to `PlaceCreate` to handle the `image_urls` / `image_blobs` ambiguity.
- [ ] Add type validation to `PlaceAttributeInput.value`.
- [ ] Resolve the `source_type` vs `source` naming inconsistency.
- [ ] Rename `google_reviews` to `external_reviews` in the `PlaceCreate` schema.
- [ ] Optimize group activity queries to avoid N+2 problem.
- [ ] Replace hardcoded UTC+4 offset in `gmaps.py` with timezone-aware handling.

---

## 7. Design Alignment Checklist

The design files `FRONTEND_REWAMP_LIGHT.html` and `FRONTEND_REWAMP_DARK.html` define the target UI. Each screen below needs a side-by-side comparison against the current implementation.

### Per-Screen Comparison

#### Place Details (Mosque Variant)
- [ ] Color tokens match design file
- [ ] Typography uses correct font (Inter) and weights
- [ ] Glass morphism and gradient effects implemented
- [ ] Badge styling matches design
- [ ] Layout spacing and grid match
- [ ] Dark mode variant matches dark design file
- [ ] Icon usage matches Material Symbols Outlined with correct variants

#### Sign In
- [ ] Color tokens match design file
- [ ] Typography and input field styling match
- [ ] Layout spacing matches
- [ ] Dark mode variant matches
- [ ] Error states styled correctly

#### Home / Explore (Map View)
- [ ] Map styling and overlays match design
- [ ] Filter bar styling matches
- [ ] Place card styling matches
- [ ] Search bar styling matches
- [ ] Dark mode variant matches
- [ ] Safe area insets handled correctly

#### Check-ins History
- [ ] List item styling matches design
- [ ] Timeline or date grouping matches
- [ ] Empty state matches
- [ ] Dark mode variant matches

#### Sign Up
- [ ] Form layout matches design
- [ ] Input field styling matches
- [ ] Button styling matches
- [ ] Dark mode variant matches
- [ ] Validation error styling matches

### Cross-Cutting Design Concerns

- [ ] All color tokens defined in a central theme file and used consistently
- [ ] Inter font loaded and applied globally (not Lexend -- verify which font the design files actually specify)
- [ ] Material Symbols Outlined icon set used with correct `FILL`, `wght`, `GRAD`, `opsz` settings
- [ ] Animation patterns (transitions, micro-interactions) match design intent
- [ ] RTL layout support verified for Arabic locale on all screens
- [ ] Responsive breakpoints match design assumptions

---

## Priority Order

1. **Critical Bugs** (Section 1) -- fix immediately, these cause runtime failures.
2. **Backend Cleanup** (Section 6) -- stabilize the API layer.
3. **i18n Violations** (Sections 4 and 5) -- required by project rules.
4. **Code Quality** (Section 3) -- reduce tech debt and improve maintainability.
5. **Architecture Cleanup** (Section 2) -- improve developer experience and file navigability.
6. **Design Alignment** (Section 7) -- align UI with design files.
