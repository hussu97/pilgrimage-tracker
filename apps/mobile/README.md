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

- **`EXPO_PUBLIC_API_URL`** – Base URL of the API. When unset, the app defaults to `http://127.0.0.1:3000` so the simulator can reach the backend. For a physical device, set this to your machine’s LAN IP (e.g. `http://192.168.1.10:3000`). The **backend must be running** (e.g. `cd server && uvicorn app.main:app --reload --port 3000`) for the Home screen and other API features to work.

## Structure

- `App.js` – Root component.
- `app.json` – Expo config (name, slug, version, etc.).
- `api/` – API client (e.g. `getLanguages`, `getTranslations` for i18n; add other endpoints to match web).
- `context/` – React context (e.g. `I18nContext` for locale and `t(key)`).
- `screens/` – Screen components (e.g. `SettingsScreen` with language picker; add auth, home, places, groups, profile to match web flows).

Design reference: `DESIGN_FILE.html` at repo root. Use the same translation keys and API shapes as `apps/web` (see `.cursor/rules/i18n-translations.mdc` and `.cursor/rules/frontend-replication.mdc`).

## Performance Optimization

### TODO: Image Caching

The app currently loads images without a caching layer, which can impact scroll performance and increase network usage. Consider integrating one of these solutions:

- **expo-image** (recommended for Expo SDK 54+) - Built-in image component with caching
- **react-native-fast-image** - Fast image loading with disk and memory caching
- **@react-native-community/image** - Community-maintained image component

To integrate:
```bash
npx expo install expo-image
# or
npm install react-native-fast-image
```

Then replace `<Image>` components in PlaceCard, HomeScreen, PlaceDetailScreen, etc. with the cached version.
