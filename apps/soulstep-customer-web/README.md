# SoulStep – Web App

Next.js 15 + React customer-facing web app with Tailwind CSS, SSR, and i18n. Deployed to Vercel.

## Quick Start

```bash
cd apps/soulstep-customer-web
npm install
cp .env.example .env.local   # edit values
npm run dev
```

App runs at http://localhost:5173

## Environment Variables

| Variable                           | Description                                                                 |
| ---------------------------------- | --------------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_BASE_URL`         | Public catalog-api base URL (browser-side fetches)                          |
| `INTERNAL_API_URL`                 | Catalog-api URL for server-side / SSR fetches                               |
| `NEXT_PUBLIC_PROXY_TARGET`         | API proxy target for local dev rewrites                                     |
| `NEXT_PUBLIC_UMAMI_WEBSITE_ID`     | Umami website ID; enables `/lib/app.js` + `/api/send` same-origin analytics |
| `NEXT_PUBLIC_ADSENSE_PUBLISHER_ID` | Google AdSense publisher ID                                                 |

Only `NEXT_PUBLIC_UMAMI_WEBSITE_ID` is read for Umami. `VITE_UMAMI_WEBSITE_ID` and old native-app env names are ignored by the Next.js app.

## Browser Cache Cleanup

Legacy Vite/PWA service workers are tombstoned at `/sw.js`, `/service-worker.js`, and `/registerSW.js` with `Cache-Control: no-store`. The client shell also unregisters any old service workers and clears Cache Storage once per session.

## Key Pages

| Route                  | Description                                         |
| ---------------------- | --------------------------------------------------- |
| `/`                    | Redirects into the customer web experience          |
| `/home`                | Discover — search, filter, and select sacred places |
| `/places`              | Browse the full sacred-site catalog                 |
| `/places/:placeCode`   | Place detail with check-in, reviews, FAQs, nearby   |
| `/map`                 | Interactive map with filters                        |
| `/journeys`            | My journeys list                                    |
| `/journeys/new`        | Create a journey from selected places               |
| `/journeys/:groupCode` | Journey detail — timeline, members, progress        |
| `/groups/*`            | Legacy compatibility redirects to `/journeys/*`     |
| `/explore`             | Explore cities                                      |
| `/explore/:citySlug`   | City page with place grid                           |
| `/profile`             | User profile and settings                           |
| `/login`               | Login / register                                    |

## SEO Proxy Routes

The app keeps crawler-facing SEO URLs on the primary `soul-step.org` domain while
catalog-api owns the generated XML/HTML payloads.

| Route              | Description                                                          |
| ------------------ | -------------------------------------------------------------------- |
| `/sitemap.xml`     | Proxies the catalog sitemap index without ISR body caching           |
| `/sitemaps/:path*` | Proxies chunked catalog sitemap files, e.g. `/sitemaps/places-1.xml` |
| `/ads.txt`         | Static Google seller file with crawler-friendly text/cache headers   |
| `/robots.txt`      | Static robots file with crawler-friendly text/cache headers          |
| `/llms.txt`        | Static AI crawler summary with crawler-friendly text/cache headers   |
| `/.well-known/*`   | Static well-known metadata with crawler-friendly cache headers       |
| `/feed.xml`        | Proxies the catalog RSS feed                                         |
| `/feed.atom`       | Proxies the catalog Atom feed                                        |

## Tests

```bash
npm test                  # Vitest unit tests
npx tsc --noEmit          # TypeScript type check
npm run test:e2e          # Playwright browser tests
```

## Deploy

Deployed to Vercel via `.github/workflows/deploy.yml` on every merge to `main`. No manual steps required.
