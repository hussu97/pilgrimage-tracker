# SoulStep – Admin Dashboard

Vite + React admin dashboard for managing places, users, SEO, and scraper runs. Deployed to Vercel.

## Quick Start

```bash
cd apps/soulstep-admin-web
npm install
cp .env.example .env          # edit values
npm run dev
```

App runs at http://localhost:5174

## Environment Variables

| Variable | Description |
|---|---|
| `VITE_API_URL` | Catalog-api base URL for API calls |
| `API_PROXY_TARGET` | Local dev proxy target (Vite devServer rewrite) |

## Key Pages

| Route | Description |
|---|---|
| `/` | Dashboard — summary stats |
| `/blog` | Blog posts — list with view/click metrics |
| `/blog/new` | Create blog post — section editor, link previews, FAQ |
| `/blog/:postCode/edit` | Edit blog post |
| `/places` | Places table — search, filter, paginate |
| `/places/:placeCode` | Place detail — edit, images, SEO fields |
| `/places/new` | Create place |
| `/users` | Users table |
| `/scraper` | Scraper runs — start, monitor, sync |
| `/seo` | SEO dashboard — scores, missing fields |
| `/seo/ai-citations` | AI crawler log |

Paginated tables default to **50 rows/page** (options: 50, 100, 200, 500, 1000, 2000).

## Tests

```bash
npm test          # Vitest unit tests
```

## Deploy

Deployed to Vercel via `.github/workflows/deploy.yml` on every merge to `main`. No manual steps required.
