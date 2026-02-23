# Admin Panel Roadmap

> **Status:** Planned — no implementation yet
> **Stack:** Vite + React + TypeScript + Tailwind CSS + shadcn/ui (Radix UI headless)
> **Language:** English only (no i18n system for admin)
> **Auth:** Same JWT flow as main app; gated by `is_admin` flag on User model

---

## Table of Contents

1. [Phase 1 — Foundation](#phase-1--foundation)
2. [Phase 2 — Core Entity Management](#phase-2--core-entity-management)
3. [Phase 3 — Data Scraper Management](#phase-3--data-scraper-management)
4. [Phase 4 — Content & Configuration](#phase-4--content--configuration)
5. [Phase 5 — Dashboard & Analytics](#phase-5--dashboard--analytics)
6. [Phase 6 — Advanced Features](#phase-6--advanced-features)
7. [Admin App File Tree](#admin-app-file-tree)
8. [Dependency Graph](#dependency-graph)
9. [Conventions Checklist](#conventions-checklist)

---

## Phase 1 — Foundation

### 1.1 Database Changes

#### User model — add `is_admin`

```python
# server/app/db/models.py — User class
is_admin: bool = Field(default=False, sa_column=Column(Boolean, nullable=False, server_default="0"))
```

#### Migration — `0005_add_is_admin.py`

```
ALTER TABLE "user" ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE;
```

### 1.2 Backend Auth Guard

**File:** `server/app/api/deps.py`

Add an `AdminDep` dependency that:
1. Resolves the current user via the existing `CurrentUserDep`
2. Raises `HTTPException(403)` if `user.is_admin is False`

```python
async def get_admin_user(current_user: CurrentUserDep) -> User:
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user

AdminDep = Annotated[User, Depends(get_admin_user)]
```

### 1.3 Admin API Router

**Mount point:** `/api/v1/admin/`

```python
# server/app/api/v1/admin/__init__.py
admin_router = APIRouter(prefix="/admin", tags=["admin"])
```

Register in `server/app/main.py` under the existing v1 router.

### 1.4 Scraper Proxy

The admin panel talks only to the main server. The main server proxies scraper requests via `httpx`.

**New env var:** `DATA_SCRAPER_URL` (e.g. `http://localhost:8001`)

**File:** `server/app/api/v1/admin/scraper_proxy.py`

All scraper-proxy endpoints require `AdminDep`. The proxy forwards requests to the data_scraper service and returns responses to the admin frontend.

### 1.5 CLI Script — Seed Admin User

**File:** `scripts/create_admin.py`

```
python scripts/create_admin.py --email admin@example.com --password <pw> --display-name "Admin"
```

Inserts a User row with `is_admin=True`, or updates an existing user to set `is_admin=True`.

### 1.6 Admin Frontend Scaffold

**Location:** `apps/admin/`

| File / Dir | Purpose |
|---|---|
| `vite.config.ts` | Vite config, port 5174 |
| `tailwind.config.ts` | Same design tokens as `apps/web` (dark-bg, dark-surface, etc.) |
| `tsconfig.json` | Path aliases (`@/` → `src/`) |
| `src/main.tsx` | Entry point |
| `src/app/App.tsx` | Root: React Router, AuthProvider, ThemeProvider |
| `src/app/router.tsx` | Route definitions |
| `src/app/providers/` | Auth context, theme context |
| `src/lib/api/` | API client (Axios/fetch wrapper, token handling) |
| `src/components/layout/` | Sidebar, Topbar, AdminLayout |
| `src/app/pages/` | Page components (one per route) |

### 1.7 Admin Layout

- **Sidebar:** Collapsible (icon-only when collapsed). Sections: Dashboard, Users, Places, Reviews, Check-ins, Groups, Scraper, Content, Settings.
- **Topbar:** Breadcrumb, theme toggle (light/dark), admin user avatar + dropdown (logout).
- **Responsive:** On mobile (< 768 px), sidebar becomes a slide-out drawer triggered by hamburger icon.

### 1.8 Auth Flow

1. Admin navigates to `http://localhost:5174/login`
2. `POST /api/v1/auth/login` — returns JWT + refresh cookie (same as main app)
3. `GET /api/v1/users/me` — response includes `is_admin` field
4. If `is_admin === false`, redirect to an "Access Denied" page
5. Protected routes wrapped in `<RequireAdmin>` component

### 1.9 Foundation Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/api/v1/users/me` | JWT | Returns user profile including `is_admin` flag |

> No new endpoints beyond the existing `/users/me` for auth — the admin guard is client-side (check `is_admin`) plus server-side (`AdminDep` on all admin routes).

### 1.10 Foundation Tests

- `test_admin_dep.py` — verify 403 for non-admin, 200 for admin
- `test_create_admin_script.py` — verify CLI creates/promotes admin user
- `apps/admin/` — Vitest setup mirroring `apps/web`

---

## Phase 2 — Core Entity Management

### 2.1 Database Changes

#### User model — add `is_active`

```python
is_active: bool = Field(default=True, sa_column=Column(Boolean, nullable=False, server_default="1"))
```

#### Review model — add `is_flagged`

```python
is_flagged: bool = Field(default=False, sa_column=Column(Boolean, nullable=False, server_default="0"))
```

#### Migration — `0006_admin_entity_fields.py`

```sql
ALTER TABLE "user" ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE review ADD COLUMN is_flagged BOOLEAN NOT NULL DEFAULT FALSE;
```

### 2.2 Shared UI Components (shadcn/ui based)

| Component | Description |
|---|---|
| `DataTable` | Sortable, paginated table with column visibility toggles (built on `@tanstack/react-table` + shadcn Table) |
| `SearchInput` | Debounced search field (shadcn Input) |
| `FilterBar` | Composable filter chips/dropdowns (shadcn Select, Popover) |
| `Pagination` | Page size selector + page navigation (shadcn Pagination) |
| `ConfirmDialog` | Destructive action confirmation (shadcn AlertDialog) |
| `Badge` | Status indicators — active/inactive, flagged, role (shadcn Badge) |
| `StatCard` | Metric card with label, value, trend arrow |
| `Sheet` | Slide-over detail panel (shadcn Sheet) |
| `Tabs` | Section tabs within a page (shadcn Tabs) |

### 2.3 Users Management

#### Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/api/v1/admin/users` | Admin | List users (paginated, searchable, filterable by active/inactive) |
| `GET` | `/api/v1/admin/users/{user_code}` | Admin | Get user detail (profile, stats, groups, check-ins, reviews) |
| `PATCH` | `/api/v1/admin/users/{user_code}` | Admin | Update user (is_active, is_admin, display_name) |
| `DELETE` | `/api/v1/admin/users/{user_code}` | Admin | Soft-delete user (set is_active=False) |
| `GET` | `/api/v1/admin/users/{user_code}/check-ins` | Admin | List user's check-ins |
| `GET` | `/api/v1/admin/users/{user_code}/reviews` | Admin | List user's reviews |

#### Frontend Pages

| Route | Page | Description |
|-------|------|-------------|
| `/users` | `UsersListPage` | DataTable: user_code, display_name, email, created_at, is_active, is_admin. Search by name/email. Filter by active/inactive/admin. |
| `/users/:userCode` | `UserDetailPage` | Profile card, stats summary, tabbed view (check-ins, reviews, groups, favorites). Actions: activate/deactivate, promote/demote admin. |

### 2.4 Places Management

#### Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/api/v1/admin/places` | Admin | List places (paginated, searchable, filterable by religion/type) |
| `GET` | `/api/v1/admin/places/{place_code}` | Admin | Get place detail (reviews, check-ins, attributes, images, translations) |
| `PATCH` | `/api/v1/admin/places/{place_code}` | Admin | Update place fields (name, description, religion, coordinates, etc.) |
| `DELETE` | `/api/v1/admin/places/{place_code}` | Admin | Delete place and all related data |
| `POST` | `/api/v1/admin/places` | Admin | Create place manually |
| `GET` | `/api/v1/admin/places/{place_code}/images` | Admin | List place images |
| `DELETE` | `/api/v1/admin/places/{place_code}/images/{image_id}` | Admin | Delete a place image |

#### Frontend Pages

| Route | Page | Description |
|-------|------|-------------|
| `/places` | `PlacesListPage` | DataTable: place_code, name, religion, place_type, avg_rating, review_count, check_in_count. Filter by religion, type. Search by name. |
| `/places/:placeCode` | `PlaceDetailPage` | Detail card with map preview. Tabs: info (editable fields), reviews, check-ins, images, attributes, translations. Actions: edit, delete. |
| `/places/new` | `CreatePlacePage` | Form to manually add a place. |

### 2.5 Reviews Management

#### Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/api/v1/admin/reviews` | Admin | List reviews (paginated, filterable by flagged/place/user/rating) |
| `GET` | `/api/v1/admin/reviews/{review_code}` | Admin | Get review detail with images |
| `PATCH` | `/api/v1/admin/reviews/{review_code}` | Admin | Update review (is_flagged, body, title) |
| `DELETE` | `/api/v1/admin/reviews/{review_code}` | Admin | Hard-delete review |

#### Frontend Pages

| Route | Page | Description |
|-------|------|-------------|
| `/reviews` | `ReviewsListPage` | DataTable: review_code, place name, user, rating, is_flagged, created_at. Filter by flagged, rating range. Search by content. |
| `/reviews/:reviewCode` | `ReviewDetailPage` | Full review with images, user info, place info. Actions: flag/unflag, delete. |

### 2.6 Check-ins Management

#### Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/api/v1/admin/check-ins` | Admin | List check-ins (paginated, filterable by place/user/group/date range) |
| `DELETE` | `/api/v1/admin/check-ins/{check_in_code}` | Admin | Delete check-in |

#### Frontend Pages

| Route | Page | Description |
|-------|------|-------------|
| `/check-ins` | `CheckInsListPage` | DataTable: check_in_code, user, place, group (if any), checked_in_at. Filter by date range, place, user. |

### 2.7 Groups Management

#### Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/api/v1/admin/groups` | Admin | List groups (paginated, searchable) |
| `GET` | `/api/v1/admin/groups/{group_code}` | Admin | Get group detail (members, places, activity) |
| `PATCH` | `/api/v1/admin/groups/{group_code}` | Admin | Update group (name, description, is_private) |
| `DELETE` | `/api/v1/admin/groups/{group_code}` | Admin | Delete group and all related data |
| `GET` | `/api/v1/admin/groups/{group_code}/members` | Admin | List members with roles |
| `DELETE` | `/api/v1/admin/groups/{group_code}/members/{user_code}` | Admin | Remove member |

#### Frontend Pages

| Route | Page | Description |
|-------|------|-------------|
| `/groups` | `GroupsListPage` | DataTable: group_code, name, member_count, place_count, is_private, created_at. Search by name. |
| `/groups/:groupCode` | `GroupDetailPage` | Group info, tabs: members, places/itinerary, activity feed, notes. Actions: edit, delete, remove members. |

### 2.8 Phase 2 Tests

- `test_admin_users.py` — CRUD + filter/search, soft-delete, promote/demote
- `test_admin_places.py` — CRUD + filter, image deletion
- `test_admin_reviews.py` — CRUD + flag/unflag
- `test_admin_check_ins.py` — list + delete
- `test_admin_groups.py` — CRUD + member management
- Frontend: Vitest tests for DataTable filtering/sorting logic, pagination helpers

---

## Phase 3 — Data Scraper Management

### 3.1 Proxy Architecture

All scraper endpoints are proxied through the main server under `/api/v1/admin/scraper/`. The main server uses `httpx.AsyncClient` to forward requests to `DATA_SCRAPER_URL`.

```python
# server/app/api/v1/admin/scraper_proxy.py
@router.get("/scraper/data-locations")
async def list_data_locations(admin: AdminDep):
    async with httpx.AsyncClient(base_url=settings.DATA_SCRAPER_URL) as client:
        resp = await client.get("/data-locations")
        return resp.json()
```

### 3.2 New Scraper Endpoints (on data_scraper service)

These endpoints need to be added to the scraper service itself:

| Method | Path (scraper) | Purpose |
|--------|----------------|---------|
| `GET` | `/runs` | List all scraper runs (paginated, filterable by status/location) |
| `DELETE` | `/data-locations/{code}` | Delete a data location and its runs |
| `DELETE` | `/runs/{run_code}` | Delete a run and its scraped data |
| `GET` | `/stats` | Scraper stats (total locations, runs, places scraped) |

### 3.3 Proxy Endpoints (on main server)

| Method | Path (main server) | Proxies To | Purpose |
|--------|---------------------|------------|---------|
| `GET` | `/api/v1/admin/scraper/data-locations` | `GET /data-locations` | List data locations |
| `POST` | `/api/v1/admin/scraper/data-locations` | `POST /data-locations` | Create data location |
| `DELETE` | `/api/v1/admin/scraper/data-locations/{code}` | `DELETE /data-locations/{code}` | Delete data location |
| `GET` | `/api/v1/admin/scraper/runs` | `GET /runs` | List all runs |
| `POST` | `/api/v1/admin/scraper/runs` | `POST /runs` | Start scraper run |
| `GET` | `/api/v1/admin/scraper/runs/{run_code}` | `GET /runs/{run_code}` | Get run status |
| `GET` | `/api/v1/admin/scraper/runs/{run_code}/data` | `GET /runs/{run_code}/data` | View scraped data |
| `GET` | `/api/v1/admin/scraper/runs/{run_code}/raw-data` | `GET /runs/{run_code}/raw-data` | View raw collector data |
| `POST` | `/api/v1/admin/scraper/runs/{run_code}/sync` | `POST /runs/{run_code}/sync` | Sync to main DB |
| `POST` | `/api/v1/admin/scraper/runs/{run_code}/re-enrich` | `POST /runs/{run_code}/re-enrich` | Re-run enrichment |
| `POST` | `/api/v1/admin/scraper/runs/{run_code}/cancel` | `POST /runs/{run_code}/cancel` | Cancel run |
| `DELETE` | `/api/v1/admin/scraper/runs/{run_code}` | `DELETE /runs/{run_code}` | Delete run |
| `GET` | `/api/v1/admin/scraper/collectors` | `GET /collectors` | List collectors |
| `GET` | `/api/v1/admin/scraper/place-type-mappings` | `GET /place-type-mappings` | List mappings |
| `POST` | `/api/v1/admin/scraper/place-type-mappings` | `POST /place-type-mappings` | Create mapping |
| `PUT` | `/api/v1/admin/scraper/place-type-mappings/{id}` | `PUT /place-type-mappings/{id}` | Update mapping |
| `DELETE` | `/api/v1/admin/scraper/place-type-mappings/{id}` | `DELETE /place-type-mappings/{id}` | Delete mapping |

### 3.4 Frontend Pages

| Route | Page | Description |
|-------|------|-------------|
| `/scraper` | `ScraperOverviewPage` | Summary cards: total locations, total runs, places scraped, last sync. Links to sub-pages. |
| `/scraper/data-locations` | `DataLocationsPage` | DataTable: code, name, source_type, config (city/country), run count. CRUD actions. Create form in Sheet. |
| `/scraper/runs` | `ScraperRunsPage` | DataTable: run_code, location, status, progress (bar), total_items, processed_items, started_at. Filter by status. Actions: start new, cancel, sync, re-enrich, delete. |
| `/scraper/runs/:runCode` | `RunDetailPage` | Run info + progress. Tabs: scraped places (DataTable with enrichment status), raw collector data (grouped by place, expandable JSON viewer). |
| `/scraper/collectors` | `CollectorsPage` | Card grid: collector name, description, status (active API keys configured or not). Read-only informational page. |
| `/scraper/place-type-mappings` | `PlaceTypeMappingsPage` | DataTable: gmaps_type, our_place_type, religion, is_active, display_order. Inline edit or Sheet form. CRUD. |

### 3.5 Progress Polling

For active scraper runs, the admin UI polls `GET /api/v1/admin/scraper/runs/{run_code}` every 3 seconds to update the progress bar and status badge. Polling stops when status is `completed`, `failed`, or `cancelled`.

### 3.6 Phase 3 Tests

- `test_scraper_proxy.py` — mock httpx calls, verify admin auth required, verify request forwarding
- New scraper tests: `test_list_runs.py`, `test_delete_location.py`, `test_delete_run.py`
- Frontend: Vitest tests for polling hook logic, data transformations

---

## Phase 4 — Content & Configuration

### 4.1 Translation Key Management

#### New DB Model — `UITranslation`

Runtime overrides for translation keys. The seed data in `seed_data.json` remains the source of truth; rows in this table override seed values at runtime.

```python
class UITranslation(SQLModel, table=True):
    __tablename__ = "ui_translation"

    id: int | None = Field(default=None, primary_key=True)
    key: str = Field(index=True)          # e.g. "home.title"
    lang: str = Field(max_length=5)       # "en", "ar", "hi"
    value: str
    updated_at: datetime = Field(sa_column=_TSTZ(nullable=False))

    __table_args__ = (UniqueConstraint("key", "lang"),)
```

#### Migration — `0007_ui_translation.py`

#### Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/api/v1/admin/translations` | Admin | List all translation keys with values per language (merged: seed + DB overrides) |
| `GET` | `/api/v1/admin/translations/{key}` | Admin | Get single key across all languages |
| `PUT` | `/api/v1/admin/translations/{key}` | Admin | Upsert override for a key (body: `{lang: value}` map) |
| `DELETE` | `/api/v1/admin/translations/{key}` | Admin | Remove override (reverts to seed value) |
| `POST` | `/api/v1/admin/translations` | Admin | Create new key (added to DB, not seed file) |

> **Important:** Update the existing `GET /api/v1/i18n/translations` endpoint to merge DB overrides on top of seed data so the main app picks up changes immediately.

#### Frontend Page

| Route | Page | Description |
|-------|------|-------------|
| `/translations` | `TranslationsPage` | Three-column table: key, EN value, AR value, HI value. Inline editing. Search by key. Highlight keys missing translations. Badge for "overridden" vs "seed default". Add new key button. |

### 4.2 App Version Config

#### Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/api/v1/admin/app-versions` | Admin | List all AppVersionConfig rows |
| `PUT` | `/api/v1/admin/app-versions/{platform}` | Admin | Update version config for platform (ios/android) |

#### Frontend Page

| Route | Page | Description |
|-------|------|-------------|
| `/app-versions` | `AppVersionsPage` | Card per platform (iOS, Android). Fields: min_version_soft, min_version_hard, latest_version, store_url. Edit in-place. |

### 4.3 Content Translations (Place Localization)

#### Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/api/v1/admin/content-translations` | Admin | List all ContentTranslation rows (filterable by place, lang, field) |
| `POST` | `/api/v1/admin/content-translations` | Admin | Create translation for a place field |
| `PUT` | `/api/v1/admin/content-translations/{id}` | Admin | Update translation text |
| `DELETE` | `/api/v1/admin/content-translations/{id}` | Admin | Delete translation |

#### Frontend Page

| Route | Page | Description |
|-------|------|-------------|
| `/content-translations` | `ContentTranslationsPage` | DataTable: place_code, place name, field (name/description), lang, translated_text. Filter by place, lang. Create/edit via Sheet form. |

### 4.4 Place Attributes

#### Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/api/v1/admin/place-attributes` | Admin | List all attribute definitions (distinct attribute_code values + counts) |
| `GET` | `/api/v1/admin/place-attributes/{place_code}` | Admin | List attributes for a place |
| `PUT` | `/api/v1/admin/place-attributes/{place_code}` | Admin | Bulk update attributes for a place |

#### Frontend Page

| Route | Page | Description |
|-------|------|-------------|
| `/place-attributes` | `PlaceAttributesPage` | DataTable of attribute types (attribute_code, places using it, sample values). Click through to see/edit per-place attributes. |

### 4.5 Phase 4 Tests

- `test_admin_translations.py` — CRUD, merge logic with seed data, revert on delete
- `test_admin_app_versions.py` — list/update
- `test_admin_content_translations.py` — CRUD
- `test_admin_place_attributes.py` — list/bulk update
- Frontend: Vitest tests for translation merge logic, inline editing helpers

---

## Phase 5 — Dashboard & Analytics

### 5.1 Stats Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/api/v1/admin/stats/overview` | Admin | Total counts: users, places, reviews, check-ins, groups, active users (30d) |
| `GET` | `/api/v1/admin/stats/user-growth` | Admin | User registrations per day/week/month (query param: `interval`) |
| `GET` | `/api/v1/admin/stats/popular-places` | Admin | Top 20 places by check-in count (with review avg) |
| `GET` | `/api/v1/admin/stats/religion-breakdown` | Admin | Place count and check-in count grouped by religion |
| `GET` | `/api/v1/admin/stats/recent-activity` | Admin | Latest 50 actions across all users (check-ins, reviews, group joins) |
| `GET` | `/api/v1/admin/stats/review-stats` | Admin | Review count by rating (1-5 histogram), flagged count, avg rating |

### 5.2 Frontend Page

| Route | Page | Description |
|-------|------|-------------|
| `/` (dashboard) | `DashboardPage` | **Row 1:** StatCards — total users, total places, total check-ins, total reviews, total groups, active users (30d). **Row 2:** User growth line chart + religion breakdown donut chart (Recharts). **Row 3:** Popular places bar chart + review rating histogram. **Row 4:** Recent activity feed (avatar, action text, timestamp). |

### 5.3 Charting Library

Use [Recharts](https://recharts.org/) — lightweight, React-native, composable. Components: `LineChart`, `BarChart`, `PieChart`, `ResponsiveContainer`.

### 5.4 Phase 5 Tests

- `test_admin_stats.py` — verify counts, date grouping, religion breakdown
- Frontend: Vitest tests for stat data transformations, date interval helpers

---

## Phase 6 — Advanced Features

### 6.1 Bulk Operations

Add multi-select checkboxes to all DataTable instances. When rows are selected, a floating action bar appears with bulk actions:

| Entity | Bulk Actions |
|--------|-------------|
| Users | Deactivate, Activate, Export |
| Places | Delete, Export |
| Reviews | Flag, Unflag, Delete |
| Check-ins | Delete, Export |
| Groups | Delete |

#### Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/api/v1/admin/bulk/users/deactivate` | Admin | Body: `{user_codes: [...]}` |
| `POST` | `/api/v1/admin/bulk/users/activate` | Admin | Body: `{user_codes: [...]}` |
| `POST` | `/api/v1/admin/bulk/reviews/flag` | Admin | Body: `{review_codes: [...]}` |
| `POST` | `/api/v1/admin/bulk/reviews/unflag` | Admin | Body: `{review_codes: [...]}` |
| `POST` | `/api/v1/admin/bulk/reviews/delete` | Admin | Body: `{review_codes: [...]}` |
| `POST` | `/api/v1/admin/bulk/check-ins/delete` | Admin | Body: `{check_in_codes: [...]}` |
| `POST` | `/api/v1/admin/bulk/places/delete` | Admin | Body: `{place_codes: [...]}` |
| `POST` | `/api/v1/admin/bulk/groups/delete` | Admin | Body: `{group_codes: [...]}` |

### 6.2 Data Export

Stream CSV or JSON exports for large datasets.

#### Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/api/v1/admin/export/users` | Admin | Export users as CSV or JSON (`?format=csv\|json`) |
| `GET` | `/api/v1/admin/export/places` | Admin | Export places |
| `GET` | `/api/v1/admin/export/reviews` | Admin | Export reviews |
| `GET` | `/api/v1/admin/export/check-ins` | Admin | Export check-ins |
| `GET` | `/api/v1/admin/export/groups` | Admin | Export groups |

Implementation: Use `StreamingResponse` with a generator that yields rows to avoid loading entire tables into memory.

### 6.3 Audit Log

Track all admin write operations for accountability.

#### New DB Model — `AuditLog`

```python
class AuditLog(SQLModel, table=True):
    __tablename__ = "audit_log"

    log_code: str = Field(primary_key=True, default_factory=generate_code)
    admin_user_code: str = Field(foreign_key="user.user_code", index=True)
    action: str          # "create", "update", "delete", "bulk_delete", "flag", etc.
    entity_type: str     # "user", "place", "review", "check_in", "group", etc.
    entity_code: str     # code of the affected entity
    changes: dict | None = Field(default=None, sa_column=Column(JSON))  # {field: {old, new}}
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=_TSTZ(nullable=False),
    )
```

#### Migration — `0008_audit_log.py`

#### Logging Mechanism

Create an `audit_log()` helper function called inside every admin write endpoint:

```python
async def audit_log(
    session: AsyncSession,
    admin: User,
    action: str,
    entity_type: str,
    entity_code: str,
    changes: dict | None = None,
):
    log = AuditLog(
        admin_user_code=admin.user_code,
        action=action,
        entity_type=entity_type,
        entity_code=entity_code,
        changes=changes,
    )
    session.add(log)
    await session.flush()
```

#### Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/api/v1/admin/audit-log` | Admin | List audit entries (paginated, filterable by admin, entity_type, action, date range) |
| `GET` | `/api/v1/admin/audit-log/{log_code}` | Admin | Get single audit entry with full change diff |

#### Frontend Page

| Route | Page | Description |
|-------|------|-------------|
| `/audit-log` | `AuditLogPage` | DataTable: timestamp, admin user, action, entity type, entity code. Expandable rows show change diff. Filter by admin, entity type, action, date range. |

### 6.4 Notification Management

Send broadcast or targeted notifications from the admin panel.

#### Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/api/v1/admin/notifications/broadcast` | Admin | Send notification to all users (body: type, payload) |
| `POST` | `/api/v1/admin/notifications/send` | Admin | Send notification to specific users (body: user_codes[], type, payload) |
| `GET` | `/api/v1/admin/notifications/history` | Admin | List sent admin notifications (paginated) |

#### Frontend Page

| Route | Page | Description |
|-------|------|-------------|
| `/notifications` | `NotificationManagementPage` | Compose form: type selector, payload editor (JSON or structured form), recipient picker (all users or search/select specific users). History table below. |

### 6.5 Phase 6 Tests

- `test_admin_bulk.py` — bulk operations for each entity
- `test_admin_export.py` — CSV and JSON export, streaming behavior
- `test_admin_audit_log.py` — log creation on writes, list/filter
- `test_admin_notifications.py` — broadcast and targeted send
- Frontend: Vitest tests for bulk selection logic, export download triggers

---

## Admin App File Tree

```
apps/admin/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
├── postcss.config.js
├── public/
│   └── favicon.svg
├── src/
│   ├── main.tsx
│   ├── index.css                          # Tailwind base + shadcn globals
│   ├── lib/
│   │   ├── api/
│   │   │   ├── client.ts                  # Axios instance, token interceptor
│   │   │   ├── admin.ts                   # Admin API methods (users, places, etc.)
│   │   │   ├── scraper.ts                 # Scraper proxy API methods
│   │   │   ├── stats.ts                   # Dashboard stats API methods
│   │   │   └── types.ts                   # Shared request/response types
│   │   ├── utils.ts                       # cn() helper, formatters
│   │   └── hooks/
│   │       ├── useAuth.ts
│   │       ├── usePolling.ts              # Scraper run progress polling
│   │       └── usePagination.ts
│   ├── components/
│   │   ├── ui/                            # shadcn/ui generated components
│   │   │   ├── button.tsx
│   │   │   ├── table.tsx
│   │   │   ├── input.tsx
│   │   │   ├── select.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── sheet.tsx
│   │   │   ├── alert-dialog.tsx
│   │   │   ├── tabs.tsx
│   │   │   ├── pagination.tsx
│   │   │   ├── popover.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dropdown-menu.tsx
│   │   │   └── ...
│   │   ├── layout/
│   │   │   ├── AdminLayout.tsx            # Sidebar + Topbar wrapper
│   │   │   ├── Sidebar.tsx                # Collapsible nav sidebar
│   │   │   └── Topbar.tsx                 # Breadcrumb, theme toggle, user menu
│   │   ├── shared/
│   │   │   ├── DataTable.tsx              # Generic sortable/paginated table
│   │   │   ├── SearchInput.tsx            # Debounced search
│   │   │   ├── FilterBar.tsx              # Composable filters
│   │   │   ├── StatCard.tsx               # Dashboard metric card
│   │   │   ├── ConfirmDialog.tsx          # Destructive action confirm
│   │   │   ├── BulkActionBar.tsx          # Floating bar for multi-select actions
│   │   │   ├── JsonViewer.tsx             # Expandable JSON tree (scraper raw data)
│   │   │   └── ActivityFeed.tsx           # Timeline of recent actions
│   │   └── charts/
│   │       ├── LineChart.tsx              # Recharts wrapper
│   │       ├── BarChart.tsx
│   │       └── DonutChart.tsx
│   ├── app/
│   │   ├── App.tsx
│   │   ├── router.tsx
│   │   ├── providers/
│   │   │   ├── AuthProvider.tsx
│   │   │   └── ThemeProvider.tsx
│   │   └── pages/
│   │       ├── LoginPage.tsx
│   │       ├── AccessDeniedPage.tsx
│   │       ├── DashboardPage.tsx
│   │       ├── users/
│   │       │   ├── UsersListPage.tsx
│   │       │   └── UserDetailPage.tsx
│   │       ├── places/
│   │       │   ├── PlacesListPage.tsx
│   │       │   ├── PlaceDetailPage.tsx
│   │       │   └── CreatePlacePage.tsx
│   │       ├── reviews/
│   │       │   ├── ReviewsListPage.tsx
│   │       │   └── ReviewDetailPage.tsx
│   │       ├── check-ins/
│   │       │   └── CheckInsListPage.tsx
│   │       ├── groups/
│   │       │   ├── GroupsListPage.tsx
│   │       │   └── GroupDetailPage.tsx
│   │       ├── scraper/
│   │       │   ├── ScraperOverviewPage.tsx
│   │       │   ├── DataLocationsPage.tsx
│   │       │   ├── ScraperRunsPage.tsx
│   │       │   ├── RunDetailPage.tsx
│   │       │   ├── CollectorsPage.tsx
│   │       │   └── PlaceTypeMappingsPage.tsx
│   │       ├── content/
│   │       │   ├── TranslationsPage.tsx
│   │       │   ├── ContentTranslationsPage.tsx
│   │       │   ├── AppVersionsPage.tsx
│   │       │   └── PlaceAttributesPage.tsx
│   │       ├── audit-log/
│   │       │   └── AuditLogPage.tsx
│   │       └── notifications/
│   │           └── NotificationManagementPage.tsx
│   └── __tests__/
│       ├── setup.ts
│       ├── utils.test.ts
│       ├── hooks/
│       │   ├── usePolling.test.ts
│       │   └── usePagination.test.ts
│       └── helpers/
│           └── dataTransformers.test.ts
```

---

## Dependency Graph

```
Phase 1: Foundation
  ├── is_admin field + migration
  ├── AdminDep
  ├── Admin router mount
  ├── CLI script
  ├── Admin app scaffold
  └── Auth flow
       │
       ▼
Phase 2: Core Entity Management ──────────────────────┐
  ├── Shared UI components (DataTable, etc.)           │
  ├── Users CRUD                                       │
  ├── Places CRUD                                      │
  ├── Reviews CRUD                                     │
  ├── Check-ins management                             │
  └── Groups CRUD                                      │
       │                                               │
       ▼                                               │
Phase 3: Data Scraper Management                       │
  ├── Scraper proxy (requires Phase 1 proxy setup)     │
  ├── New scraper endpoints                            │
  └── Scraper UI pages (reuses Phase 2 components) ────┘
       │
       ▼
Phase 4: Content & Configuration
  ├── Translation management (UITranslation model)
  ├── App version config
  ├── Content translations
  └── Place attributes
       │
       ▼
Phase 5: Dashboard & Analytics
  ├── Stats endpoints (queries all entities from Phase 2-4)
  ├── Dashboard page
  └── Charts (Recharts)
       │
       ▼
Phase 6: Advanced Features
  ├── Bulk operations (extends Phase 2 DataTables)
  ├── Data export (queries same entities)
  ├── Audit log (wraps all Phase 2-5 write endpoints)
  └── Notification management
```

### Recommended Implementation Order

1. **Phase 1** — Must come first; everything depends on admin auth and the app scaffold.
2. **Phase 2** — Core CRUD is the backbone; builds all shared UI components.
3. **Phase 3** — Can be done in parallel with late Phase 2 work (independent service).
4. **Phase 5** — Dashboard can start once Phase 2 entities exist (stats query those tables).
5. **Phase 4** — Content management is independent of dashboard; order vs Phase 5 is flexible.
6. **Phase 6** — Must come last; audit log wraps all prior write endpoints, bulk ops extend existing tables.

---

## Conventions Checklist

| Convention | How the Admin Panel Complies |
|---|---|
| **Code-based IDs** (Rule 9) | All API paths and responses use `*_code` identifiers, never numeric IDs |
| **Dark mode** (Rule 14) | Admin app uses same Tailwind tokens (`dark:bg-dark-bg`, `dark:bg-dark-surface`, `dark:border-dark-border`, `dark:text-dark-text-secondary`). shadcn/ui theme variables mapped to these tokens |
| **`_TSTZ()` datetimes** (Rule 8) | New models (`UITranslation`, `AuditLog`) use `_TSTZ()` for all datetime columns |
| **Backend tests** (Rule 12) | Every phase includes pytest test files for all new endpoints |
| **Frontend tests** (Rule 13) | Vitest tests for utility functions, hooks, and data transformations |
| **No mobile replication** (Rule 10) | Admin panel is web-only — no mobile counterpart needed |
| **i18n** | English-only for admin; no translation keys needed. Main app translation endpoint updated to merge `UITranslation` overrides |
| **Changelog** (Rule 2) | Each phase updates `CHANGELOG.md` under a new "Admin" section |
| **Architecture doc** (Rule 1) | Phase 1 updates `ARCHITECTURE.md` with admin subsystem description |
| **Production docs** (Rule 3) | `PRODUCTION.md` updated with admin app build/deploy for Docker, Render/Vercel, and GCP |
| **Design reference** (Rule 5) | Admin uses shadcn/ui (not the SoulStep design files), but inherits the same color tokens and Lexend typography for visual consistency |
| **Git commits** (Rule 4) | Each phase is committed as one or more logical commits with `--author="Hussain Abbasi <h_abbasi97@hotmail.com>"` |
