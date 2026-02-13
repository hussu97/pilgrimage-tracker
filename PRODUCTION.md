# Production deployment plans

This document outlines how to deploy Pilgrimage Tracker to production. **Update the relevant plan(s) whenever deployment-relevant changes are made** (e.g. new env vars, new services, build steps).

Current system: **Backend** (Python FastAPI in `server/`), **Web app** (Vite + React in `apps/web/`), **Mobile app** (Expo / React Native in `apps/mobile/`). API is versioned at `/api/v1`. For production, replace in-memory stores with PostgreSQL (and optional file storage).

---

## Plan 1: Docker

Deploy using Docker and Docker Compose.

### Backend (API)

- **Dockerfile** (in `server/` or repo root):
  - Base image: `python:3.14-slim` (or `python:3.12-slim` if 3.14 is unavailable in your registry).
  - Copy `server/` (or `app/`), install deps from `requirements.txt`.
  - Run: `uvicorn app.main:app --host 0.0.0.0 --port 3000`.
- **Environment:** `JWT_SECRET`, `DATABASE_URL` (PostgreSQL), optional `PORT`. For production DB, use a real connection string; do not use in-memory store.
- **Build:** `docker build -t pilgrimage-api -f server/Dockerfile .` (adjust context/path as needed).

### Database

- Use **PostgreSQL** in production. Option A: run Postgres in Docker Compose. Option B: use a managed Postgres (e.g. Supabase, Neon) and set `DATABASE_URL` in the API container.
- **Docker Compose example:** Define services `api` (build from server Dockerfile), `db` (postgres:15), set `DATABASE_URL` for api pointing to `db`.

### Web frontend

- **Build:** From repo root, `npm run build` for web (or `npm run build -w @pilgrimage-tracker/web`). Output is in `apps/web/dist/`.
- **Serving:** Option A: Nginx container serving `apps/web/dist` and proxying `/api` to the API. Option B: separate Dockerfile that builds the app and serves with nginx or a static server.
- **Env:** Set `VITE_API_URL` at **build time** to the public API URL (e.g. `https://api.yourdomain.com`). If API is same-origin, use relative `/api` and configure reverse proxy.

### Mobile app

- Not run in Docker. Build locally or in CI: `cd apps/mobile && npx expo export` then build with EAS Build or `expo run:ios` / `expo run:android`. Submit to App Store / Play Store. Set API URL in app config or env (e.g. `EXPO_PUBLIC_API_URL`) to production API.

### Updates

- When adding new env vars (e.g. `CORS_ORIGINS`, `SENTRY_DSN`), document them in this section and in the Dockerfile/Compose example.
- When adding a new service (e.g. Redis, worker), add a container and wire it in Compose; update this doc.

---

## Plan 2: Free online services (Render, Vercel, etc.)

Deploy backend and web on free-tier or low-cost services; use a free or cheap Postgres and optional file storage.

### Backend (Render, Railway, Fly.io, etc.)

- **Render (Web Service):**
  - Connect repo; root or `server/` as working directory.
  - Build: `pip install -r requirements.txt` (or set Python version and use `pip install -r server/requirements.txt` if root).
  - Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`. Render sets `PORT`.
  - Env: `JWT_SECRET`, `DATABASE_URL` (e.g. from Render Postgres or external Supabase/Neon).
- **CORS:** Set allowed origins to the web app URL (e.g. Vercel preview and production).
- **Database:** Use Render Postgres, or Supabase/Neon free tier; set `DATABASE_URL` in the backend service.

### Web frontend (Vercel, Netlify)

- **Vercel:**
  - Connect repo; set **Root Directory** to `apps/web`.
  - Build: `npm run build` (or `npm ci && npm run build` from repo root with root as root and build command running in `apps/web` — adjust per monorepo setup). Output directory: `dist`.
  - Env: `VITE_API_URL` = production API URL (e.g. `https://your-api.onrender.com`).
- **Netlify:** Same idea: build command and publish directory for `apps/web`, set `VITE_API_URL`.

### Mobile app

- Build locally or in CI (e.g. GitHub Actions). Set `EXPO_PUBLIC_API_URL` to production API. Build iOS/Android with Expo (EAS or local) and submit to stores.

### Updates

- When adding env vars or build steps, update this section.
- If you add serverless functions or a separate worker, document the service and env here.

---

## Plan 3: Google Cloud Platform (GCP)

Deploy using GCP services.

### Backend (Cloud Run)

- **Container:** Build API image (same as Plan 1 Dockerfile) and push to **Artifact Registry** (e.g. `gcr.io/PROJECT_ID/pilgrimage-api` or Artifact Registry path).
- **Cloud Run service:** Deploy the image. Set env: `JWT_SECRET`, `DATABASE_URL`. Use **Secret Manager** for secrets. Set min instances 0 for cost savings; scale as needed.
- **Database:** Use **Cloud SQL (PostgreSQL)**. Create instance; allow Cloud Run to connect (VPC connector or public IP + authorized networks). Set `DATABASE_URL` to Cloud SQL connection (e.g. Unix socket or private IP).

### Database (Cloud SQL)

- Create PostgreSQL instance; run migrations if any. Store connection name and credentials in Secret Manager; inject into Cloud Run as `DATABASE_URL`.

### Web frontend (Firebase Hosting or Cloud Storage + CDN)

- **Option A – Firebase Hosting:** Build web app (`npm run build` in `apps/web`); deploy with `firebase deploy`. Set `VITE_API_URL` to Cloud Run URL at build time.
- **Option B – Cloud Storage + Load Balancer:** Build app; upload `dist/` to a GCS bucket; configure Load Balancer and optional CDN to serve the bucket. API URL can be same Load Balancer with path-based routing or a separate Cloud Run URL.

### Mobile app

- Build with Expo (EAS or local); set `EXPO_PUBLIC_API_URL` to Cloud Run (or API URL). Submit to App Store / Play Store. Optional: use EAS Update or Firebase App Distribution for beta.

### Optional GCP services

- **Storage:** Use **Cloud Storage** for avatars and photos if you add file uploads; configure backend to use GCS (e.g. via bucket name and credentials).
- **Monitoring:** Cloud Monitoring and Logging for Cloud Run; optional Sentry or similar.

### Updates

- When adding new GCP resources (e.g. Redis, Pub/Sub), document them here.
- When changing secrets or env vars, update this section and Secret Manager usage.

---

## Summary

| Plan   | Backend        | DB              | Web frontend      | Mobile        |
|--------|----------------|-----------------|-------------------|---------------|
| 1 Docker | Docker container | Postgres (Compose or external) | Nginx/static in Docker or same host | Local/CI build, stores |
| 2 Free | Render / Railway / Fly | Render Postgres, Supabase, Neon | Vercel / Netlify | Local/CI build, stores |
| 3 GCP  | Cloud Run      | Cloud SQL       | Firebase Hosting or GCS + LB | Local/CI build, stores |

Keep this file in sync with the codebase: when deployment steps or environment change, update the corresponding plan(s).
