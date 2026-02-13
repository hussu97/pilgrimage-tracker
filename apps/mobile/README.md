# Pilgrimage Tracker – Mobile app (Expo)

Expo (React Native) app for Pilgrimage Tracker. Builds for iOS and Android. Uses the same API as the web app; feature parity with `apps/web` is maintained (see `.cursor/rules/frontend-replication.mdc`).

## Prerequisites

- Node.js 18+
- iOS: Xcode (for simulator or device)
- Android: Android Studio / SDK (for emulator or device)
- Optional: [Expo Go](https://expo.dev/go) on a device for quick testing

## Run

From **repo root**:

```bash
npm install
npm run dev:mobile
```

From this directory:

```bash
npm install
npx expo start
```

Then press `i` for iOS simulator, `a` for Android emulator, or scan the QR code with Expo Go.

## Build for iOS/Android

**Development build (local):**

```bash
npx expo run:ios
# or
npx expo run:android
```

**Production build (EAS Build):**

```bash
npm install -g eas-cli
eas build --platform ios
eas build --platform android
```

Configure `app.json` / `app.config.js` (icons, splash, scheme). Submit to App Store / Play Store using EAS Submit or manually.

## Environment

- **`EXPO_PUBLIC_API_URL`** – Base URL of the API (e.g. `http://localhost:3000` for dev, or your production API URL). Use in API client for all requests.

## Structure

- `App.js` – Root component.
- `app.json` – Expo config (name, slug, version, etc.).
- `api/` – API client (e.g. `getLanguages`, `getTranslations` for i18n; add other endpoints to match web).
- `context/` – React context (e.g. `I18nContext` for locale and `t(key)`).
- `screens/` – Screen components (e.g. `SettingsScreen` with language picker; add auth, home, places, groups, profile to match web flows).

Design reference: `DESIGN_FILE.html` at repo root. Use the same translation keys and API shapes as `apps/web` (see `.cursor/rules/i18n-translations.mdc` and `.cursor/rules/frontend-replication.mdc`).
