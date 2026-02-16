# Plan: Timezone-Aware Opening Hours & Timings

## Problem Statement

Opening hours are scraped from Google Maps in local time (e.g., "9:00 AM - 5:00 PM" in UAE) and converted to UTC using a **hardcoded +4 offset** (`data_scraper/app/scrapers/gmaps.py:82`). The backend then stores these UTC times in the DB and computes `is_open_now` by comparing against `datetime.now(timezone.utc)`.

This approach has three problems:
1. **Scraper only works for UAE** — any place outside UTC+4 gets wrong UTC times
2. **No local-time response** — the API returns raw UTC opening hours to the frontend, which are meaningless to the user
3. **No opening hours display** — the frontend only shows `is_open_now` badge and prayer/service timings, but never renders the actual weekly opening hours schedule

## Design Decision: Store Local Time, Not UTC

**Current approach:** Store UTC times in DB, convert to local on read.
**Proposed approach:** Store **local times as-is** from Google Maps + store the place's **IANA timezone identifier** (e.g., `Asia/Dubai`). Convert on read when needed.

**Rationale:**
- Local times are what Google Maps provides — no lossy conversion at scrape time
- The `timezone` field lets the backend compute `is_open_now` accurately: get current time in the place's timezone, compare against stored local hours
- The frontend receives local times directly — no client-side conversion needed
- Avoids the edge case where a UTC conversion shifts a day boundary (e.g., 11 PM local → next day UTC)
- The "24 hours" and "Closed" cases remain trivial

---

## Implementation Plan

### Phase 1: Backend — Data Model & Timezone Lookup

#### 1.1 Add `timezonefinder` dependency
- **File:** `server/requirements.txt`, `data_scraper/requirements.txt`
- Add `timezonefinder>=6.0.0` to both
- This is a pure-Python library that resolves `(lat, lng)` → IANA timezone string (e.g., `Asia/Dubai`), no API calls needed
- Uses Python 3.9+ built-in `zoneinfo` module (no `pytz` needed)

#### 1.2 Add `timezone` field to the Place model
- **File:** `server/app/db/models.py` (line 27-41)
- Add to the `Place` model:
  ```python
  timezone: Optional[str] = None  # IANA timezone, e.g. "Asia/Dubai"
  ```
- This field stores the resolved timezone for the place based on its `lat`/`lng`

#### 1.3 Create a timezone utility module
- **File:** `server/app/services/timezone_utils.py` (new)
- Functions:
  ```python
  from zoneinfo import ZoneInfo
  from timezonefinder import TimezoneFinder

  _tf = TimezoneFinder()  # singleton, thread-safe for reads

  def get_timezone_for_coords(lat: float, lng: float) -> str | None:
      """Return IANA timezone string for coordinates, or None."""
      return _tf.timezone_at(lat=lat, lng=lng)

  def get_local_now(iana_tz: str) -> datetime:
      """Return current datetime in the given timezone."""
      return datetime.now(ZoneInfo(iana_tz))

  def convert_utc_to_local(hours_dict: dict, iana_tz: str) -> dict:
      """Convert a dict of {day: 'HH:MM-HH:MM' (UTC)} to local time.
         Used for migrating existing UTC data to local time."""
      ...
  ```

#### 1.4 Auto-resolve timezone on place creation/update
- **File:** `server/app/db/places.py`
- When a place is created or updated (and `timezone` is not already set), call `get_timezone_for_coords(lat, lng)` to populate the `timezone` field automatically
- This means existing places get their timezone filled in on next update, or via a one-time migration script

#### 1.5 Migration script for existing places
- **File:** `server/app/jobs/backfill_timezones.py` (new)
- A one-time script that:
  1. Queries all places where `timezone IS NULL`
  2. For each, calls `get_timezone_for_coords(lat, lng)` to set the timezone
  3. Converts existing UTC `opening_hours` back to local time using the resolved timezone (reverse the +4 offset → apply correct local offset)
  4. Updates the DB row

---

### Phase 2: Data Scraper — Store Local Times

#### 2.1 Remove UTC conversion from scraper
- **File:** `data_scraper/app/scrapers/gmaps.py`
- **`convert_to_utc_24h()` (line 82):** Rename to `normalize_to_24h()` — keep the 12h→24h conversion but **remove the UTC offset subtraction** (line 106). The function now just converts "9:00 AM - 5:00 PM" → "09:00-17:00" in local time
- **`process_weekly_hours()` (line 113):** Update docstring to reflect it now returns local times, not UTC

#### 2.2 Resolve and store timezone during scraping
- **File:** `data_scraper/app/scrapers/gmaps.py`
- After getting place details (which include `lat`/`lng`), call `get_timezone_for_coords(lat, lng)` and include the result in the place data dict
- The scraper output now includes `timezone: "Asia/Dubai"` alongside `opening_hours`

---

### Phase 3: Backend — Fix `is_open_now` and API Response

#### 3.1 Rewrite `_is_open_now_from_hours()`
- **File:** `server/app/db/places.py` (lines 28-90)
- Change signature to accept the place's timezone:
  ```python
  def _is_open_now_from_hours(opening_hours: dict, iana_tz: str | None) -> bool | None:
  ```
- Instead of `datetime.now(timezone.utc)`, use:
  ```python
  now = datetime.now(ZoneInfo(iana_tz)) if iana_tz else datetime.now(timezone.utc)
  ```
- Since hours are now stored in local time, comparing local-now against local-hours is straightforward
- The "24 hours" case (`00:00-23:59`) works identically regardless of timezone

#### 3.2 Update `_place_to_item()` to include timezone-converted hours
- **File:** `server/app/api/v1/places.py` (lines 26-63)
- Pass `place.timezone` to `_is_open_now_from_hours()`
- Add `timezone` field to the response (for the frontend to display, e.g., "GST" or "Asia/Dubai")
- The `opening_hours` in the response are now **local times** — exactly what the user expects to see
- Add a new response field: `opening_hours_today: str | None` — the hours string for just today (e.g., "09:00-17:00" or "Closed"), for easy frontend display

#### 3.3 Update `build_timings()` to use place timezone
- **File:** `server/app/services/place_timings.py`
- Lines 52, 92: Replace `datetime.now(timezone.utc)` with `datetime.now(ZoneInfo(place.timezone))` when the timezone is available
- Prayer times and service times are already stored in local time (they're attribute data, not scraped UTC), so this makes the "past/current/upcoming" status accurate

#### 3.4 Accept optional `lat`/`lng` query params for user-relative timing
- **File:** `server/app/api/v1/places.py`
- For the place detail endpoint `GET /api/v1/places/{place_code}`, add optional query params: `user_lat`, `user_lng`
- **However**, for the initial implementation, the place's own timezone is sufficient — the opening hours are local to the place, and `is_open_now` should reflect whether the place is currently open in its own timezone, regardless of where the user is
- User lat/lng is only needed if we want to **display times converted to the user's timezone** — this is a future enhancement, not needed now. Users typically want to know "is this place open right now?" in the place's own time context

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
    ...
  },
  "opening_hours_today": "08:00-00:00",
  "is_open_now": true,
  "timezone": "Asia/Dubai",
  "timings": [...]
}
```

Key additions:
- **`opening_hours`** — now in **local time** (not UTC)
- **`opening_hours_today`** — convenience field for the current day's hours
- **`timezone`** — IANA timezone identifier
- **`is_open_now`** — now computed against the place's actual timezone

#### 4.2 Update schemas
- **File:** `server/app/models/schemas.py`
- Add `timezone: Optional[str]` and `opening_hours_today: Optional[str]` to `PlaceListItem` and `PlaceCreate`

---

### Phase 5: Frontend — Display Opening Hours

#### 5.1 Update TypeScript types
- **Files:** `apps/web/src/lib/types/places.ts`, `apps/mobile/src/lib/types/places.ts`
- Add to `Place` interface:
  ```typescript
  timezone?: string;
  opening_hours_today?: string;
  ```

#### 5.2 Web — Place Detail opening hours section
- **File:** `apps/web/src/app/pages/PlaceDetail.tsx`
- Below the existing `is_open_now` badge (line 454-466), add an expandable **Opening Hours** section:
  - **Collapsed state:** Shows today's hours inline: "Today: 08:00 - 00:00" (from `opening_hours_today`)
  - **Expanded state:** Shows the full weekly schedule from `opening_hours`, highlighting today's day
  - Style: Use the existing card/section patterns in the detail page. Reference FRONTEND_REWAMP design files for alignment
  - If `opening_hours` is null/empty, don't render the section

#### 5.3 Mobile — Place Detail opening hours section
- **File:** `apps/mobile/src/app/screens/PlaceDetailScreen.tsx`
- Mirror the web implementation:
  - Collapsed: Today's hours inline
  - Expanded: Full weekly schedule
  - Use React Native primitives (View, Text, Pressable) with matching visual design

#### 5.4 Translation keys
- Add i18n keys for all three languages (en, ar, hi):
  - `places.openingHours` — "Opening Hours" / "ساعات العمل" / "खुलने का समय"
  - `places.today` — "Today" / "اليوم" / "आज"
  - `places.closed` — "Closed" / "مغلق" / "बंद"
  - `places.open24Hours` — "Open 24 Hours" / "مفتوح 24 ساعة" / "24 घंटे खुला"
  - `places.hoursNotAvailable` — "Hours not available" / "الساعات غير متوفرة" / "समय उपलब्ध नहीं"
  - Day names for all three languages

---

### Phase 6: Edge Cases & Special Handling

#### 6.1 24-hour places
- If `opening_hours` has `"00:00-23:59"` or `"Open 24 hours"` for a day, `is_open_now` = `true`
- Frontend displays "Open 24 Hours" instead of a time range
- No timezone conversion needed (24hrs is 24hrs everywhere) — this is the exception the user mentioned

#### 6.2 Midnight crossover
- A place open "20:00-04:00" (local) means it closes at 4 AM the next day
- `_is_open_now_from_hours()` already handles this case (lines 67-70)
- No change needed here since we're still comparing same-format times

#### 6.3 Places without timezone data
- Fallback: If `timezone` is `None` (legacy data not yet migrated), fall back to UTC comparison (current behavior)
- The migration script (Phase 1.5) ensures this is temporary

#### 6.4 Places near timezone boundaries
- `timezonefinder` handles this correctly — it uses geographic polygon boundaries
- The resolved timezone is always the legal timezone for that exact coordinate

---

### Implementation Order

| Step | Scope | Description |
|------|-------|-------------|
| 1 | Backend | Add `timezonefinder` to requirements, create `timezone_utils.py` |
| 2 | Backend | Add `timezone` field to Place model, run DB migration |
| 3 | Backend | Write backfill script, migrate existing places |
| 4 | Scraper | Remove UTC offset, store local times + timezone |
| 5 | Backend | Rewrite `_is_open_now_from_hours()` with timezone awareness |
| 6 | Backend | Update `build_timings()` to use place timezone |
| 7 | Backend | Update API response: add `timezone`, `opening_hours_today` |
| 8 | Frontend | Update types in both web and mobile |
| 9 | Frontend | Add Opening Hours section to web PlaceDetail |
| 10 | Frontend | Add Opening Hours section to mobile PlaceDetailScreen |
| 11 | i18n | Add translation keys for all three languages |
| 12 | Docs | Update ARCHITECTURE.md, CHANGELOG.md |

---

### Files Changed Summary

| File | Change |
|------|--------|
| `server/requirements.txt` | Add `timezonefinder` |
| `data_scraper/requirements.txt` | Add `timezonefinder` |
| `server/app/db/models.py` | Add `timezone` field to Place |
| `server/app/services/timezone_utils.py` | New — timezone lookup utilities |
| `server/app/jobs/backfill_timezones.py` | New — one-time migration script |
| `server/app/db/places.py` | Rewrite `_is_open_now_from_hours()`, auto-set timezone on create/update |
| `server/app/services/place_timings.py` | Use place timezone for status calc |
| `server/app/api/v1/places.py` | Add `timezone`, `opening_hours_today` to response |
| `server/app/models/schemas.py` | Add new fields to schemas |
| `data_scraper/app/scrapers/gmaps.py` | Remove UTC offset, resolve timezone |
| `apps/web/src/lib/types/places.ts` | Add `timezone`, `opening_hours_today` |
| `apps/mobile/src/lib/types/places.ts` | Add `timezone`, `opening_hours_today` |
| `apps/web/src/app/pages/PlaceDetail.tsx` | Add Opening Hours section |
| `apps/mobile/src/app/screens/PlaceDetailScreen.tsx` | Add Opening Hours section |
| Backend translation seed | Add i18n keys |
| `ARCHITECTURE.md` | Update timezone documentation |
| `CHANGELOG.md` | Add entries |
