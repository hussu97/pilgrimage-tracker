# Project Rules

## 1. Architecture Review
When implementing functionality that changes how the system is built or deployed (new services, databases, auth strategies, API versioning, monorepo layout, etc.), review and update **ARCHITECTURE.md** so it stays accurate.

## 2. Changelog Updates
After every feature, fix, or notable change, add an entry to **CHANGELOG.md**. Organize by **Backend**, **Frontend (web)**, **Frontend (mobile)**, and **Docs** as applicable. Keep entries concise but descriptive.

## 3. Production Plan Maintenance
Keep **PRODUCTION.md** up to date with three deployment plans:
1. **Docker** – Docker Compose / container images
2. **Free online services** – Render (backend), Vercel (frontend), free Postgres/storage
3. **GCP** – Cloud Run, App Engine, Cloud SQL, Storage, etc.

Update the relevant plan(s) when adding new env vars, services, DB migrations, or build commands.

## 4. Git Commit After Feature Changes
After any feature change (or coherent set of changes), commit the work with a clear, descriptive message. One logical change per commit where practical. Do not leave implemented work uncommitted.

Every commit **must** be authored by Hussain Abbasi. Always pass `--author` explicitly:
```
git commit --author="Hussain Abbasi <h_abbasi97@hotmail.com>" -m "..."
```
The `Co-Authored-By` trailer for Claude should still be included in the commit body.

## 5. Design File Inspiration
For any frontend UI/UX changes in `apps/soulstep-customer-web` or `apps/soulstep-customer-mobile`, use **FRONTEND_V3_LIGHT.html** (light mode) and **FRONTEND_V3_DARK.html** (dark mode) as the primary visual and layout reference. Align structure, spacing, typography (Lexend), colors, and icons (Material Icons/Symbols) with the design.

## 6. README Maintenance
Keep the following READMEs accurate and up to date. After any change that affects setup, structure, endpoints, env vars, or screens, update the relevant README(s) **before committing**.

- **README.md** – Monorepo overview, structure (all services), prerequisites, local setup, env vars, docs links
- **soulstep-catalog-api/README.md** – FastAPI backend: setup, run, env vars, all API routes (grouped by router), Alembic migrations, seed, tests
- **soulstep-scraper-api/README.md** – Scraper service: setup, env vars, all API routes, architecture, collector table, tests
- **apps/soulstep-customer-web/README.md** – Vite + React: install, run, env, backend connection, directory structure, tests, parity reference (screens + API surface)
- **apps/soulstep-customer-mobile/README.md** – Expo / React Native: install, run, env, iOS/Android build, directory structure, tests, parity reference
- **apps/soulstep-admin-web/README.md** – Admin dashboard (Vite + React): install, run, env, directory structure, pages, API surface, tests

**Triggers — update READMEs when you:**
- Add, rename, or remove an API endpoint
- Add, rename, or remove a screen/page
- Add a new env var
- Change the directory structure of a service
- Add or change test commands
- Add a new service or major dependency

## 7. Internationalization (i18n)
All customer-facing strings must come from the backend translation API — never hardcode UI copy.
- **Supported languages:** English (default), Arabic, Hindi, Telugu, Malayalam
- **Backend endpoints:** `GET /api/v1/languages`, `GET /api/v1/translations?lang=en|ar|hi|te|ml`
- **Fallback:** English when a key is missing for the requested language
- **RTL:** Enable RTL layout when locale is Arabic (`ar`)
- When adding/changing UI copy, update translation keys for all five languages in the backend seed/source.

## 8. Datetime Columns

All datetime model fields **must** use the `_UTCAwareDateTime` TypeDecorator defined in `soulstep-catalog-api/app/db/models.py` via the `_TSTZ()` helper, **not** plain `DateTime` or `Field(default_factory=...)` alone.

```python
# ✅ Correct — always add sa_column=_TSTZ(...)
created_at: datetime = Field(
    default_factory=lambda: datetime.now(UTC),
    sa_column=_TSTZ(nullable=False),
)
expires_at: datetime = Field(sa_column=_TSTZ(nullable=False))
read_at: datetime | None = Field(default=None, sa_column=_TSTZ(nullable=True))

# ❌ Wrong — plain DateTime returns naive datetimes from SQLite
created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
```

**Why:** `_UTCAwareDateTime` maps to `TIMESTAMPTZ` in PostgreSQL (stores and returns aware datetimes) and re-attaches UTC on read from SQLite's string storage. Every value coming out of the DB has `tzinfo=UTC`, so business logic can always compare directly with `datetime.now(UTC)` without hacks like `.replace(tzinfo=None)`.

**Runtime writes:** Always use `datetime.now(UTC)` (timezone-aware). Never use `datetime.utcnow()` (deprecated in Python 3.12, removed in 3.14).

**Migrations:** When adding a new datetime column, generate an Alembic migration with `sa.DateTime(timezone=True)` as the column type.

## 9. Schema and API: Code-Based Identifiers
All entities use a stable, autogenerated **code** (e.g. `user_code`, `place_code`, `group_code`), never numeric IDs, across:
- **DB schema** – `*_code` as primary and foreign keys
- **API** – paths, params, and request/response bodies use codes (e.g. `GET /api/v1/places/:placeCode`)
- **Frontend types and API client** – use code fields in types and API calls

Codes may have a prefix/suffix (e.g. `usr_abc12`) for readability — treat them as opaque strings in business logic. See ARCHITECTURE.md (sections 4 & 5) for the full data model and API outline.

## 10. Frontend Replication (Web ↔ Mobile)
`apps/soulstep-customer-web` (Vite + React) and `apps/soulstep-customer-mobile` (Expo / React Native) must stay in **feature parity**. There are no shared packages — replicate code in both apps, do not create shared imports.

After every frontend task, verify:
- [ ] Same screen/route exists in the other app?
- [ ] Same API client methods (endpoints and request/response shapes)?
- [ ] Same navigation/route names and params?

**What may differ:** React DOM + Tailwind vs React Native + Expo primitives, app-specific config, env variable loading, and build/deployment scripts.

## 11. Testing and Verification
When testing or verifying changes to backend services (`soulstep-catalog-api/` or `soulstep-scraper-api/`):
- **Follow the README:** Use the exact setup and run commands from the respective `README.md` file
- **Virtual environment:** Always activate the virtual environment (`.venv`) before running or testing
- **Install dependencies:** Ensure all `requirements.txt` modules are installed via `pip install -r requirements.txt`
- **Use 127.0.0.1:** When testing endpoints with curl or requests, use `127.0.0.1` instead of `localhost` for consistency
- **Example:** `curl -s http://127.0.0.1:3000/health` (not `localhost:3000`)

This ensures consistent behavior across different network configurations and DNS resolution.

## 12. Backend Tests (pytest)
Every backend change **must** include corresponding pytest coverage. Tests live in:
- `soulstep-catalog-api/tests/` — FastAPI integration tests + unit tests for pure logic
- `soulstep-scraper-api/tests/` — Unit tests for scraper utilities

**Rules:**
- When adding or modifying backend logic, add or update the relevant test file.
- Run tests before committing: `cd soulstep-catalog-api && source .venv/bin/activate && python -m pytest tests/ -v`
- Run scraper tests: `cd soulstep-scraper-api && source .venv/bin/activate && python -m pytest tests/ -v`
- Test infrastructure: in-memory SQLite (`StaticPool`), patched `run_migrations`/`run_seed`, disabled rate limiting.
- Test isolation: each test gets a fresh database (function-scoped `test_engine` fixture).
- Password fixtures must satisfy the validator: ≥8 chars, one uppercase, one lowercase, one digit.

## 13. Frontend Tests (Vitest + Jest)
Every frontend change **must** include corresponding test coverage. Tests live in:
- `apps/soulstep-customer-web/src/__tests__/` — Vitest unit tests for web utilities, hooks, and pure logic
- `apps/soulstep-customer-mobile/src/__tests__/` — Jest/jest-expo unit tests for mobile utilities and pure logic

**Rules:**
- When adding or modifying a utility, hook, or pure function, add or update the relevant test file.
- Run web tests before committing: `cd apps/soulstep-customer-web && npm test`
- Run mobile tests before committing: `cd apps/soulstep-customer-mobile && npm test`
- Tests must pass the TypeScript typecheck too: `cd apps/soulstep-customer-web && npx tsc --noEmit` (Vitest does not type-check — only `tsc` does).
- Test scope: focus on pure logic (utilities, transformers, helpers). Do not test React component rendering unless specifically needed; avoid mocking the entire component tree.
- Both web and mobile test files for the same logic should cover the same cases — keep them in parity.

## 14. Dark Mode Compliance
Every UI element in both `apps/soulstep-customer-web` and `apps/soulstep-customer-mobile` must support dark mode.

**Web (Tailwind):**
- Backgrounds: `dark:bg-dark-bg` (page), `dark:bg-dark-surface` (cards/panels)
- Text: `dark:text-white` (primary), `dark:text-dark-text-secondary` (muted)
- Borders: `dark:border-dark-border`
- NEVER use `dark:bg-gray-*` or `dark:text-gray-*` — always use the `dark-*` design tokens above

**Mobile (React Native):**
- Use `makeStyles(isDark)` pattern — dynamic StyleSheet based on `isDark` boolean from `useTheme()`
- Light colors from `tokens.colors.*`, dark colors from `tokens.colors.dark*`
- Never hardcode hex colors inline — always reference tokens

## 15. Translation Key Parity
Web and mobile must use the **same translation keys** for the same UI strings. When adding a new key:
1. Add to `soulstep-catalog-api/app/db/seed_data.json` under `translations.en`, `translations.ar`, `translations.hi`
2. Use `t('key.name')` in both `apps/soulstep-customer-web` and `apps/soulstep-customer-mobile`
3. Never add a web-only or mobile-only key unless the UX genuinely differs
4. Audit both apps when adding new keys to catch any matching hardcoded strings
5. Interpolation pattern: `.replace('{placeholder}', value)` — the `t()` function is a simple key lookup with no built-in interpolation

## 16. Admin Pagination Standard
All paginated tables in `apps/soulstep-admin-web` must use the following page size options, in this exact order:

| Option | Value |
|--------|-------|
| Default | **50 / page** |
| — | 100 / page |
| — | 200 / page |
| — | 500 / page |
| — | 1000 / page |
| — | 2000 / page |

**Rules:**
- The shared `Pagination` component (`src/components/shared/Pagination.tsx`) already enforces this as the default `pageSizeOptions`.
- The `usePagination` hook defaults to `50`.
- All new paginated tables must use `usePagination(50)` and pass `onPageSizeChange={setPageSize}` to `<Pagination>`.
- Backend list endpoints must accept `page_size` up to `2000` (`le=2000`) with a default of `50`.
- Never hardcode a `PAGE_SIZE` constant — always use `usePagination`.
