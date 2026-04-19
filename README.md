# SoulStep

Multi-platform app for discovering, visiting, and tracking sacred sites worldwide.

---

## Services

| Service | Path | Description |
|---|---|---|
| **catalog-api** | `soulstep-catalog-api/` | FastAPI REST API — users, places, groups, check-ins, SEO |
| **scraper-api** | `soulstep-scraper-api/` | FastAPI scraper — discovers and enriches sacred sites |
| **customer-web** | `apps/soulstep-customer-web/` | Next.js 15 + React — customer-facing web app (Vercel) |
| **admin-web** | `apps/soulstep-admin-web/` | Vite + React — admin dashboard (Vercel) |
| **mobile** | `apps/soulstep-customer-mobile/` | Expo / React Native — iOS + Android |

---

## Local Development

**Prerequisites:** Docker, Docker Compose, Node.js 20, Python 3.11+

### Backend (catalog-api + scraper-api + Postgres)

```bash
cp .env.example .env          # fill in API keys
docker compose up             # starts postgres, catalog-api, scraper-api
```

- catalog-api: http://127.0.0.1:3000 · docs: http://127.0.0.1:3000/docs
- scraper-api: http://127.0.0.1:8080 · docs: http://127.0.0.1:8080/docs

Without Docker (individual services):

```bash
cd soulstep-catalog-api
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 3000
```

### Frontend

```bash
cd apps/soulstep-customer-web && npm install && npm run dev   # http://localhost:3000
cd apps/soulstep-admin-web   && npm install && npm run dev   # http://localhost:5174
cd apps/soulstep-customer-mobile && npm install && npx expo start
```

---

## Environment Variables

Copy `.env.example` to `.env` in the repo root — this single file is used by Docker Compose for both backend services locally and in production (written by CI at deploy time).

Frontend apps each have their own `.env.local` file inside their directory.

See **[PRODUCTION.md §11](PRODUCTION.md)** for the full env var reference.

---

## Production

| Component | Platform |
|---|---|
| catalog-api + scraper-api | GCP e2-micro VM (Docker Compose + Postgres 15) |
| customer-web + admin-web | Vercel |
| Playwright scraper | Cloud Run Job (europe-west1, west4, west2) |
| Images + backups | GCS |

See [PRODUCTION.md](PRODUCTION.md) for the full deployment guide.

---

## Docs

| Doc | Purpose |
|---|---|
| [PRODUCTION.md](PRODUCTION.md) | Deployment guide, env vars, CI/CD |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System architecture and tech decisions |
| [ROADMAP.md](ROADMAP.md) | Planned features |
| [CHANGELOG.md](CHANGELOG.md) | Release history |

---

## Tests

```bash
# Backend
cd soulstep-catalog-api && source .venv/bin/activate && python -m pytest tests/ -v
cd soulstep-scraper-api && source .venv/bin/activate && python -m pytest tests/ -v

# Web
cd apps/soulstep-customer-web && npm test && npx tsc --noEmit
cd apps/soulstep-admin-web    && npm test

# Mobile
cd apps/soulstep-customer-mobile && npm test
```
