# Pilgrimage Tracker – Mobile app

Vite + React + TypeScript + Tailwind frontend for Pilgrimage Tracker, intended to be wrapped with **Capacitor** for iOS and Android. Same UI and features as `apps/web`; the two codebases are replicated (see `.cursor/rules/frontend-replication.mdc`).

## Run locally (web preview)

From **repo root**:

```bash
npm install
npm run dev:mobile
```

Runs at `http://localhost:5174` (or next free port). Set **`VITE_API_URL`** if the backend is not at `http://localhost:3000`, or configure the proxy in `vite.config.ts`.

From this directory:

```bash
npm install
npm run dev
```

## Build for web

```bash
npm run build
```

Output: `dist/`. Set `VITE_API_URL` for production API when building.

## Build for iOS/Android (Capacitor)

After adding Capacitor to the project:

```bash
npm run build
npx cap sync
npx cap open ios    # or: cap open android
```

Build and run from Xcode or Android Studio. Configure the production API URL in app config or env (e.g. `VITE_API_URL`) before building.

## Environment

- **`VITE_API_URL`** – Base URL of the API. Required when not using the default dev proxy.

## Structure

- `src/` – Same structure as `apps/web`: pages, components, API client, types.
- API client calls `/api/v1/*`. Design reference: `DESIGN_FILE.html` at repo root.
