# Pilgrimage Tracker Redesign – Implementation Prompts

This file contains all implementation prompts derived from the redesign plan (DESIGN_FILE_V2.html). Use them in order: Backend first, then shared/mobile-web, then desktop, then extras.

---

## Part 1: Backend changes

### BE-1. Places: religion_specific, open-now, optional events and filters

Extend the places backend to support the redesign:

- **religion_specific** (already exists): Document and support the following shapes so place detail and list can render faith-specific UI:
  - **Islam**: `prayer_times` (e.g. array or map with Fajr, Dhuhr, Asr, Maghrib, Isha; support a date or “today”), `capacity`, `wudu_area`, `parking`, `womens_area`.
  - **Hindu**: `deities` (array of `{ name, subtitle, image_url }`), `architecture`, `next_festival`, `dress_code`, `dress_code_notes`, optional `crowd_level` (Low/Medium/High).
  - **Christian**: `service_times` (array of `{ day, name, location?, time }`), `founded_year`, `style` (e.g. "Gothic"), `website_url` (or add top-level `website_url` on place).
- Add or compute **is_open_now** in place list and place detail responses using existing `opening_hours` and current time (and timezone if available); document the convention (e.g. server time or place timezone).
- **Optional**: Add `website_url` at place top-level if not already present.
- **Optional – Jummah**: Allow filtering places that have Jummah / Friday prayer (e.g. flag or `jummah_times` in `religion_specific`); add query param to `GET /places` (e.g. `jummah=true`) and filter accordingly.
- **Optional – Events**: Support events (e.g. `religion_specific.events` or a small `place_events` store) and either include `has_events` in list response or add `GET /places/{place_code}/events`; add `has_events=true` filter to `GET /places` if needed.

Keep existing `GET /places` (lat, lng, sort, place_type, search, limit) and `GET /places/{place_code}`; ensure place detail includes aggregate review rating and count (e.g. from existing reviews) for “4.8, 320 reviews” in the design.

---

### BE-2. Reviews and user stats

- **Reviews**: Extend review create and response to support optional `is_anonymous` (boolean) and `photo_urls` (array of strings). Update `POST /places/{place_code}/reviews` body and any review response model/schema; persist in DB if not already present.
- **User stats**: Ensure `GET /users/me/stats` (or equivalent) returns: **visits** (check-in count), **reviews** (review count). Add optional **badges** (e.g. `badges_count` or `badges[]`) for Profile “Badges” in the design; minimal implementation is a count or static list.
- **Check-ins**: Ensure `GET /users/me/check-ins` (or equivalent) returns for each check-in: date, time, place_code, place name, place image URL, and location/city so the client can build the “My Journey” calendar and Recent Activity list without a new endpoint. If needed, add a small `GET /users/me/check-ins/calendar?year=&month=` that returns dates (and optionally counts) with check-ins; prefer deriving from existing list first.

---

### BE-3. Groups: progress and “next” place

- Ensure the groups list API returns for each group: name, last_activity (or equivalent), member count.
- Add **progress** to each group in the response (e.g. `sites_visited`, `total_sites`, or a single `progress` object with counts). If the current model has no path/goals, define a minimal schema (e.g. group path or list of places, and group_place_visits or equivalent) and compute “X/Y Sites” (or similar).
- Add **next** place when applicable (e.g. next unvisited place in the group path) so the design “Next: The Cathedral” can be shown. Expose as `next_place_name` (and optionally `next_place_code`) on the group object.
- **Featured group**: Use “first group” or a `featured` flag/sort so the app can show one featured group card at the top.

---

## Part 2: Mobile and mobile web changes

Work from DESIGN_FILE_V2.html; mobile and mobile web UIs should match the design as closely as possible. Break work into the following steps.

### M-1. Design tokens and shared components (mobile + web)

- Extract from DESIGN_FILE_V2.html: primary/accent colors, background, text colors, border radius, shadows, typography (Inter, weights). Define these as design tokens (e.g. theme or CSS variables) for both mobile (React Native / StyleSheet or Tamagui) and web (CSS or Tailwind).
- Build or refactor reusable components used across multiple screens: **PlaceCard** (image, name, address, distance, rating, “Open Now” badge), **BottomNav** (Explore, Map, Groups, Profile — match design labels and icons), primary/secondary buttons, text inputs, search bar, filter chips. Ensure they work on mobile and mobile web viewport.

---

### M-2. Select Your Path (mobile + mobile web)

- [x] Redesign the Select Path screen to match DESIGN_FILE_V2.html “Select Your Path”: faith cards (Islam, Hinduism, Christianity), “View More Faiths”, “Skip for now”. Use existing settings API to save religion preference. Match layout, spacing, and typography from the design on both mobile app and mobile web.

---

### M-3. Explore Sacred Places – Home (mobile + mobile web)

- [x] Redesign Home/Explore to match DESIGN_FILE_V2.html “Explore Sacred Places”: greeting (e.g. “Assalamu Alaikum, [name]”), search bar, filter chips (Nearby, Historical, Jummah, Events), hero place card and list of place cards, bottom nav (Explore, Map, Groups, Profile). Use GET /places with lat/lng; add Jummah/Events filters when backend supports. Show “Open Now” when API provides it. Match design layout and styling on mobile and mobile web.

---

### M-4. Place Detail – mosque variant (mobile + mobile web)

- [x] Redesign Place Detail for **mosque** to match DESIGN_FILE_V2.html “Place Details - Mosque”: hero image, back/share/favorite, “Open Now” and distance, name and address, Prayer Times (Fajr, Dhuhr, Asr, Maghrib, Isha with date), About, Details & Facilities (Capacity, Wudu Area, Parking, Women’s Area), Check-in and Directions buttons, Recent Reviews. Use place detail and `religion_specific`; add prayer_times and facilities if backend is extended. Match design on mobile and mobile web.

---

### M-5. Place Detail – Hindu temple and Christian church variants (mobile + mobile web)

- [x] For **Hindu temple**: Match DESIGN_FILE_V2.html “Place Details - Hindu Temple” — hero, Opens At / Distance / Crowd, Sanctum Story, Divine Presence (deities carousel), Essential Information (Architecture, Next Festival, Dress Code), Pilgrim Voices. Use `opening_hours` and `religion_specific` (deities, architecture, next_festival, dress_code, crowd_level).
- [x] For **Christian church**: Match “Place Details - Christian Church” — hero, badge and “Open”, name and address, rating/founded/style, Get Directions, Visit Website, The Sanctuary copy, Service Times table. Use `religion_specific` (founded_year, style, service_times, website_url).
- [x] Ensure one Place Detail screen branches on religion/place_type to render the correct variant. Match design on mobile and mobile web.

---

### M-6. Map Discovery tab and screen (mobile + mobile web)

- [x] Add a **Map** tab to the main tabs: bottom nav should be Explore, **Map**, Groups, Profile (replace Favorites with Map per design, or add Map and keep Favorites per product decision; design shows Map).
- [x] Implement the Map screen to match DESIGN_FILE_V2.html “Map Discovery View”: full-screen map with place pins, search bar, layers and “my location” buttons, bottom sheet with selected place card (image, name, address, rating, distance, “Open Now”), Get Directions. Use GET /places with lat/lng (and optional bounds). Match design on mobile and mobile web.

---

### M-7. User Profile & Stats (mobile + mobile web)

- [x] Redesign Profile to match DESIGN_FILE_V2.html “User Profile & Stats”: avatar, name, Joined date, stats (Visits, Reviews, Badges), faith toggle, Edit Profile button, Account section (My Check-ins, Favorite Places, Group Activity), app version, bottom nav. Use GET /me and GET /me/stats; show badges when backend supports. Match design on mobile and mobile web.

---

### M-8. My Pilgrimage Groups (mobile + mobile web)

- Redesign Groups list to match DESIGN_FILE_V2.html “My Pilgrimage Groups”: “My Groups” header, notifications icon, featured group card (gradient, progress %, “Next: …”, member avatars, CTA), list of groups with name, last active, progress (e.g. 45/100 Sites, Lvl 3), member avatars, FAB “+”. Use groups API with progress and “next” when backend provides. Match design on mobile and mobile web.

---

### M-9. Write a Review (mobile + mobile web)

- Redesign Write Review to match DESIGN_FILE_V2.html “Write a Review”: header (Cancel, “Write Review”, Save), place name and location and thumb, star rating (1–5), text area “Share your experience…”, photo upload strip, “Post Anonymously” toggle, Submit button, success overlay “Review Posted”, bottom nav. Use POST /places/{code}/reviews; send is_anonymous and photo_urls when supported. Match design on mobile and mobile web.

---

### M-10. Check-in History / My Journey (mobile + mobile web)

- Implement or refactor Check-in History to match DESIGN_FILE_V2.html “Check-in History Calendar” or “Journey Log”: title “My Journey” or “Journey Log”, total check-ins and “This month”, calendar with month nav and check-in indicators, Recent Activity / Recent Visits list. Use GET /me/check-ins; derive calendar from check-in dates on the client. Pick one visual variant (dark or light) or support theme. Match design on mobile and mobile web.

---

## Part 3: Desktop changes

Use the same information hierarchy and components as mobile; replace single-column layout with a max-width content area (e.g. 1024–1280px), top or side nav (Explore, Map, Groups, Profile), and same design tokens (colors, typography, radii, shadows).

### D-1. Desktop layout and navigation

- Add a desktop layout: max-width content area centered, top bar or sidebar with Explore, Map, Groups, Profile (and logo/home). Apply same design tokens as mobile. Ensure all main routes are reachable from this nav and that layout is responsive (e.g. switch to bottom nav or stacked layout below a breakpoint for tablet/mobile web).

---

### D-2. Desktop – Explore and Map

- **Explore**: Same content as mobile Explore (greeting, search, filter chips, place cards) in a 2–3 column grid; search and filters in header or a sidebar. Reuse PlaceCard and tokens.
- **Map**: Map fills main area; place list or selected place in a side panel or bottom sheet. Reuse map and place card from mobile implementation; adapt layout only.

---

### D-3. Desktop – Place Detail and Profile

- **Place Detail**: Same sections as mobile (hero, prayer times / sanctum / service times, about, facilities, reviews, actions) in a single column or two-column layout (e.g. hero + sticky sidebar with actions and key info). Support all three variants (mosque, temple, church).
- **Profile**: Same blocks as mobile (avatar, name, Joined, stats, faith toggle, Edit Profile, Account links) in a centered card or two columns. Reuse tokens and components.

---

### D-4. Desktop – Groups, Write Review, Check-in History

- **Groups**: Same content as mobile (featured group card, list with progress) in a grid or list with featured card on top; FAB or primary CTA visible.
- **Write Review**: Same form as mobile (place info, stars, text area, photos, anonymous toggle, Submit) in a centered card.
- **Check-in History**: Same content (title, totals, calendar, recent list) with a larger calendar and list layout. Reuse tokens and components.

---

## Part 4: Extra prompts (verifications and screens not in design)

### X-1. Verify API contracts and data flow

- After backend and frontend changes: Verify that GET /places (list and detail) returns all fields used by the new UI (e.g. religion_specific, is_open_now, aggregate rating/count). Verify GET /users/me/check-ins includes place name, image, date, time, location/city. Verify GET /users/me/stats returns visits, reviews, and optionally badges. Verify groups list returns progress and next place when implemented. Document any gaps and fix backend or frontend accordingly.

---

### X-2. Screens not in design – restyle to design system

- Restyle the following screens to use the same design tokens and components (colors, typography, buttons, inputs) as DESIGN_FILE_V2.html; keep existing flows and copy, only update look and feel:
  - **Splash** – Keep as loading only; use design tokens.
  - **Login, Register, Forgot Password, Reset Password** – Same layout and flow; apply tokens and component styles.
  - **Check-in (standalone)** – If kept, restyle to match design system.
  - **Favorites / Saved** – List of places with PlaceCard-style cards; bottom nav may show “Saved” per design variant.
  - **Notifications** – List restyled with tokens.
  - **Settings** – Restyle; keep Profile settings icon linking here.
  - **Edit Profile** – Form restyled with tokens.
  - **Create Group, Group Detail, Join Group** – Restyle to match design system.

---

### X-3. Cross-platform and accessibility

- Ensure mobile and mobile web render the same for each redesigned screen (same structure and styling from DESIGN_FILE_V2.html). Run a quick pass for accessibility: focus order, labels, contrast, and touch targets on mobile. Fix any regressions in existing flows (auth, check-in, review submit, group join).

---

### X-4. Optional: theme and check-in history variant

- If supporting both “Check-in History” design variants (dark “My Journey” vs light “Journey Log”), add a theme or toggle and apply the chosen variant to the Check-in History screen so it matches DESIGN_FILE_V2.html for both themes.
