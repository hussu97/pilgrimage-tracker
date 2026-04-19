# SoulStep – Web App

Next.js 15 + React customer-facing web app with Tailwind CSS, SSR, and i18n. Deployed to Vercel.

## Quick Start

```bash
cd apps/soulstep-customer-web
npm install
cp .env.local.example .env.local   # edit values
npm run dev
```

App runs at http://localhost:3000

## Environment Variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | Public catalog-api base URL (browser-side fetches) |
| `INTERNAL_API_URL` | Catalog-api URL for server-side / SSR fetches |
| `NEXT_PUBLIC_PROXY_TARGET` | API proxy target for local dev rewrites |

## Key Pages

| Route | Description |
|---|---|
| `/` | Home — featured places, nearby, recommended journeys |
| `/places` | Browse all sacred sites |
| `/places/:placeCode` | Place detail with check-in, reviews, FAQs, nearby |
| `/map` | Interactive map with filters |
| `/groups` | My journeys list |
| `/groups/:groupCode` | Journey detail — timeline, members, progress |
| `/explore` | Explore cities |
| `/explore/:citySlug` | City page with place grid |
| `/profile` | User profile and settings |
| `/login` | Login / register |

## Tests

```bash
npm test                  # Vitest unit tests
npx tsc --noEmit          # TypeScript type check
```

## Deploy

Deployed to Vercel via `.github/workflows/deploy.yml` on every merge to `main`. No manual steps required.
