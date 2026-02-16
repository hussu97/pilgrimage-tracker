# Plan: Timezone-Aware Opening Hours & Timings

## Problem Statement

Opening hours are scraped from Google Maps in local time (e.g., "9:00 AM - 5:00 PM" in UAE) and converted to UTC using a **hardcoded +4 offset** (`data_scraper/app/scrapers/gmaps.py:82`). The backend then stores these UTC times in the DB and computes `is_open_now` by comparing against `datetime.now(timezone.utc)`.

This approach has three problems:
1. **Scraper only works for UAE** — any place outside UTC+4 gets wrong UTC times
2. **No local-time response** — the API returns raw UTC opening hours to the frontend, which are meaningless to the user
3. **No opening hours display** — the frontend only shows `is_open_now` badge and prayer/service timings, but never renders the actual weekly opening hours schedule

## Design Decision: Store Local Time + UTC Offset from Google Maps

**Current approach:** Store UTC times in DB (converted with hardcoded +4), compare against UTC clock.
**Proposed approach:** Store **local times as-is** from Google Maps + store the place's **`utc_offset_minutes`** (already provided by the Google Maps Places API in the response).

### Why `utc_offset` from Google Maps (not `timezonefinder`)

The Google Maps Places API already returns a `utc_offset` field (integer, minutes from UTC) as part of every place details response. The scraper already calls this API — we just need to add the field to the `fields` request param (line 156 of `gmaps.py`).

| Approach | Pros | Cons |
|----------|------|------|
| **`utc_offset` from Google Maps** (chosen) | Zero new dependencies, no extra API calls, already included in existing request, free | Static offset — doesn't capture DST rules |
| `timezonefinder` library | Returns IANA timezone, handles DST | Adds ~50MB dependency |
| Google Time Zone API | Most accurate, IANA timezone | Extra API call per place, additional billing |

**DST is not a concern for this project's target regions** — UAE, India, Saudi Arabia, and most Middle Eastern/South Asian countries do not observe DST. If DST support is needed later (places in Europe/Americas), upgrading to store an IANA timezone alongside the offset is a straightforward migration.

### Rationale for storing local times:
- Local times are what Google Maps provides — no lossy conversion at scrape time
- The `utc_offset_minutes` field lets the backend compute `is_open_now` accurately: `local_now = utc_now + timedelta(minutes=offset)`, then compare against stored local hours
- The frontend receives local times directly — no client-side conversion needed
- Avoids the edge case where a UTC conversion shifts a day boundary (e.g., 11 PM local → next day UTC)
- The "24 hours" and "Closed" cases remain trivial

---

## Implementation Plan

### Phase 1: Backend — Data Model & Utility

#### 1.1 Add `utc_offset_minutes` field to the Place model
- **File:** `server/app/db/models.py` (line 27-41)
- Add to the `Place` model:
  ```python
  utc_offset_minutes: Optional[int] = None  # e.g., 240 for UTC+4 (UAE), 330 for UTC+5:30 (India)
  ```

#### 1.2 Create a timezone utility module
- **File:** `server/app/services/timezone_utils.py` (new)
- Functions:
  ```python
  from datetime import datetime, timedelta, timezone

  def get_local_now(utc_offset_minutes: int) -> datetime:
      """Return current datetime in the place's local timezone."""
      tz = timezone(timedelta(minutes=utc_offset_minutes))
      return datetime.now(tz)

  def get_today_name(utc_offset_minutes: int | None) -> str:
      """Return current day name (e.g., 'Monday') in the place's local timezone."""
      if utc_offset_minutes is not None:
          return get_local_now(utc_offset_minutes).strftime("%A")
      return datetime.now(timezone.utc).strftime("%A")

  def format_utc_offset(minutes: int) -> str:
      """Format offset for display, e.g., 240 → 'UTC+4', 330 → 'UTC+5:30', -300 → 'UTC-5'."""
      sign = "+" if minutes >= 0 else "-"
      total = abs(minutes)
      h, m = divmod(total, 60)
      return f"UTC{sign}{h}" if m == 0 else f"UTC{sign}{h}:{m:02d}"
  ```
- No new dependencies — uses only Python stdlib `datetime`

#### 1.3 Migration script for existing places
- **File:** `server/app/jobs/backfill_timezones.py` (new)
- A one-time script that:
  1. Queries all places where `utc_offset_minutes IS NULL`
  2. For existing UAE places: sets `utc_offset_minutes = 240` (known context)
  3. Converts existing UTC `opening_hours` back to local time by **adding** 4 hours (reversing the original hardcoded subtraction)
  4. Updates the DB row
- For future non-UAE places added via scraper, the offset comes from the Google Maps API automatically

---

### Phase 2: Data Scraper — Store Local Times + Offset

#### 2.1 Request `utc_offset` from Google Maps API
- **File:** `data_scraper/app/scrapers/gmaps.py` (line 156)
- Add `utc_offset` to the `fields` string:
  ```python
  fields = "name,formatted_address,vicinity,geometry,opening_hours,utc_offset,wheelchair_accessible_entrance,rating,user_ratings_total,url,photos,business_status,reviews,editorial_summary,types"
  ```
- Extract from response and include in `place_data` dict (around line 258-278):
  ```python
  place_data = {
      ...
      "utc_offset_minutes": result.get("utc_offset"),  # int, minutes from UTC
      ...
  }
  ```

#### 2.2 Remove UTC conversion, keep 12h→24h normalization
- **File:** `data_scraper/app/scrapers/gmaps.py`
- **`convert_to_utc_24h()` (line 82):** Rename to `normalize_to_24h()` — keep the 12h→24h conversion but **remove the UTC offset subtraction** (delete line 106: `utc_dt = dt - timedelta(hours=utc_offset_hours)`). The function now just converts "9:00 AM - 5:00 PM" → "09:00-17:00" in local time
- **`process_weekly_hours()` (line 113):** Update docstring to reflect it now returns local times, not UTC

---

### Phase 3: Backend — Fix `is_open_now` and Timings

#### 3.1 Rewrite `_is_open_now_from_hours()`
- **File:** `server/app/db/places.py` (lines 28-90)
- Change signature to accept the place's UTC offset:
  ```python
  def _is_open_now_from_hours(opening_hours: dict, utc_offset_minutes: int | None = None) -> bool | None:
  ```
- Instead of `datetime.now(timezone.utc)`, use:
  ```python
  if utc_offset_minutes is not None:
      now = get_local_now(utc_offset_minutes)
  else:
      now = datetime.now(timezone.utc)  # fallback for legacy data
  ```
- Since hours are now stored in local time, comparing local-now against local-hours is straightforward
- The "24 hours" case (`00:00-23:59`) works identically regardless of offset

#### 3.2 Update `build_timings()` to use place offset
- **File:** `server/app/services/place_timings.py`
- Lines 52, 92: Replace `datetime.now(timezone.utc)` with `get_local_now(utc_offset_minutes)` when the offset is available
- Prayer times and service times are already stored in local time (they're attribute data, not scraped UTC), so this makes the "past/current/upcoming" status accurate
- Pass `utc_offset_minutes` through from the place object

#### 3.3 Update `_place_to_item()` API response
- **File:** `server/app/api/v1/places.py` (lines 26-63)
- Pass `place.utc_offset_minutes` to `_is_open_now_from_hours()`
- Add `utc_offset_minutes` to the response dict
- Add a new computed field: `opening_hours_today: str | None` — the hours string for just today in local time (e.g., "09:00-17:00" or "Closed"), for easy frontend display
- Compute today based on the place's local time (using `get_today_name(utc_offset_minutes)`)

---

### Phase 4: API Response Shape Changes

#### 4.1 Updated response shape
```json
{
  "place_code": "gplc_...",
  "name": "Al-Farooq Mosque",
  "opening_hours": {
    "Monday": "08:00-00:00",
    "Tuesday": "08:00-00:00",
    "Wednesday": "Closed",
    "..."
  },
  "opening_hours_today": "08:00-00:00",
  "is_open_now": true,
  "utc_offset_minutes": 240,
  "timings": [...]
}
```

Key additions/changes:
- **`opening_hours`** — now in **local time** (not UTC)
- **`opening_hours_today`** — convenience field for the current day's hours in local time
- **`utc_offset_minutes`** — integer offset (e.g., 240 = UTC+4), replaces the old implicit UTC assumption
- **`is_open_now`** — now computed against the place's actual local time

#### 4.2 Update schemas
- **File:** `server/app/models/schemas.py`
- Add `utc_offset_minutes: Optional[int]` and `opening_hours_today: Optional[str]` to `PlaceListItem` and `PlaceCreate`

---

### Phase 5: Backend — Place Creation/Ingestion

#### 5.1 Update place creation to accept `utc_offset_minutes`
- **File:** `server/app/db/places.py` (create/upsert functions)
- When a place is created via the scraper ingestion API, accept and store `utc_offset_minutes` from the request body
- When a place is created manually (admin API) and no `utc_offset_minutes` is provided, leave it as `None` (or optionally, the admin can provide it)
- Future enhancement: for manually created places, use `timezonefinder` or Google Timezone API to resolve offset from coords — but this is not needed now

---

### Phase 6: Frontend — Display Opening Hours

#### 6.1 Update TypeScript types
- **Files:** `apps/web/src/lib/types/places.ts`, `apps/mobile/src/lib/types/places.ts`
- Add to `Place` interface:
  ```typescript
  utc_offset_minutes?: number;
  opening_hours_today?: string;
  ```

#### 6.2 Web — Place Detail opening hours section
- **File:** `apps/web/src/app/pages/PlaceDetail.tsx`
- Below the existing `is_open_now` badge (line 454-466), add an expandable **Opening Hours** section:
  - **Collapsed state:** Shows today's hours inline: "Today: 08:00 - 00:00" (from `opening_hours_today`)
  - **Expanded state:** Shows the full weekly schedule from `opening_hours`, highlighting today's day
  - Style: Use the existing card/section patterns in the detail page. Reference FRONTEND_REWAMP design files for alignment
  - If `opening_hours` is null/empty, don't render the section

#### 6.3 Mobile — Place Detail opening hours section
- **File:** `apps/mobile/src/app/screens/PlaceDetailScreen.tsx`
- Mirror the web implementation:
  - Collapsed: Today's hours inline
  - Expanded: Full weekly schedule
  - Use React Native primitives (View, Text, Pressable) with matching visual design

#### 6.4 Translation keys
- Add i18n keys for all three languages (en, ar, hi):
  - `places.openingHours` — "Opening Hours" / "ساعات العمل" / "खुलने का समय"
  - `places.today` — "Today" / "اليوم" / "आज"
  - `places.closed` — "Closed" / "مغلق" / "बंद"
  - `places.open24Hours` — "Open 24 Hours" / "مفتوح 24 ساعة" / "24 घंटे खुला"
  - `places.hoursNotAvailable` — "Hours not available" / "الساعات غير متوفرة" / "समय उपलब्ध नहीं"
  - Day names for all three languages

---

### Phase 7: Edge Cases & Special Handling

#### 7.1 24-hour places
- If `opening_hours` has `"00:00-23:59"` or `"Open 24 hours"` for a day, `is_open_now` = `true`
- Frontend displays "Open 24 Hours" instead of a time range
- No timezone conversion needed (24hrs is 24hrs everywhere) — this is the noted exception

#### 7.2 Midnight crossover
- A place open "20:00-04:00" (local) means it closes at 4 AM the next day
- `_is_open_now_from_hours()` already handles this case (lines 67-70)
- No change needed here since we're still comparing same-format times

#### 7.3 Places without offset data (legacy fallback)
- If `utc_offset_minutes` is `None` (legacy data not yet migrated), fall back to UTC comparison (current behavior)
- The migration script (Phase 1.3) ensures this is temporary

#### 7.4 Future: DST support
- If the app expands to regions that observe DST (Europe, Americas), upgrade path:
  1. Add an `iana_timezone: Optional[str]` field to Place model
  2. Use `timezonefinder` or Google Timezone API to resolve it
  3. Use Python's `zoneinfo.ZoneInfo(iana_tz)` for DST-aware time calculations
  4. Keep `utc_offset_minutes` as a display convenience, but use IANA timezone for calculations
- This is a non-breaking additive change

---

### Implementation Order

| Step | Scope | Description |
|------|-------|-------------|
| 1 | Backend | Create `timezone_utils.py` (no new deps — stdlib only) |
| 2 | Backend | Add `utc_offset_minutes` field to Place model |
| 3 | Backend | Write backfill script for existing places (set offset=240, convert UTC→local hours) |
| 4 | Scraper | Add `utc_offset` to API fields, remove hardcoded offset, store local times |
| 5 | Backend | Rewrite `_is_open_now_from_hours()` with offset awareness |
| 6 | Backend | Update `build_timings()` to use place offset |
| 7 | Backend | Update API response: add `utc_offset_minutes`, `opening_hours_today` |
| 8 | Backend | Update place creation to accept `utc_offset_minutes` |
| 9 | Frontend | Update types in both web and mobile |
| 10 | Frontend | Add Opening Hours section to web PlaceDetail |
| 11 | Frontend | Add Opening Hours section to mobile PlaceDetailScreen |
| 12 | i18n | Add translation keys for all three languages |
| 13 | Docs | Update ARCHITECTURE.md, CHANGELOG.md |

---

### Files Changed Summary

| File | Change |
|------|--------|
| `server/app/db/models.py` | Add `utc_offset_minutes` field to Place |
| `server/app/services/timezone_utils.py` | New — offset-based time utilities (stdlib only) |
| `server/app/jobs/backfill_timezones.py` | New — one-time migration: set offset + convert UTC→local hours |
| `server/app/db/places.py` | Rewrite `_is_open_now_from_hours()`, accept offset on create/upsert |
| `server/app/services/place_timings.py` | Use place offset for status calc |
| `server/app/api/v1/places.py` | Add `utc_offset_minutes`, `opening_hours_today` to response |
| `server/app/models/schemas.py` | Add new fields to schemas |
| `data_scraper/app/scrapers/gmaps.py` | Add `utc_offset` to fields, remove UTC conversion, store local times |
| `apps/web/src/lib/types/places.ts` | Add `utc_offset_minutes`, `opening_hours_today` |
| `apps/mobile/src/lib/types/places.ts` | Add `utc_offset_minutes`, `opening_hours_today` |
| `apps/web/src/app/pages/PlaceDetail.tsx` | Add Opening Hours section |
| `apps/mobile/src/app/screens/PlaceDetailScreen.tsx` | Add Opening Hours section |
| Backend translation seed | Add i18n keys |
| `ARCHITECTURE.md` | Update timezone documentation |
| `CHANGELOG.md` | Add entries |

### No New Dependencies

This approach requires **zero new Python packages**. Everything uses Python's stdlib `datetime` module. The UTC offset comes directly from the Google Maps API response that the scraper already fetches.
