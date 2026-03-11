# SoulStep – Mobile app (Expo)

Expo (React Native) app for SoulStep. Builds for iOS and Android. Uses the same API as the web app; feature parity with `apps/soulstep-customer-web` is maintained (see `.cursor/rules/frontend-replication.mdc`).

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

- **`EXPO_PUBLIC_API_URL`** – Base URL of the API.
- **`EXPO_PUBLIC_ADMOB_APP_ID_IOS`** – Optional. Google AdMob App ID for iOS. Replace the placeholder in `app.json` when ready.
- **`EXPO_PUBLIC_ADMOB_APP_ID_ANDROID`** – Optional. Google AdMob App ID for Android. Replace the placeholder in `app.json` when ready. When unset, the app defaults to `http://127.0.0.1:3000` so the simulator can reach the backend. For a physical device, set this to your machine’s LAN IP (e.g. `http://192.168.1.10:3000`). The **backend must be running** (e.g. `cd soulstep-catalog-api && uvicorn app.main:app --reload --port 3000`) for the Home screen and other API features to work.
- **`EXPO_PUBLIC_UMAMI_WEBSITE_ID`** – Optional. Umami Cloud website ID for privacy-friendly analytics. Sends directly to `cloud.umami.is/api/send` (no adblocker risk in native apps). Sign up at https://umami.is → free plan → Add website → copy Website ID. When unset, Umami is disabled.

## Structure

- `index.js` – Entry point.
- `app.json` / `eas.json` – Expo config and EAS Build config.
- `src/app/` – App shell: `App.tsx`, `providers.tsx`, `navigation.tsx`, `contexts/`, and all screens under `screens/`.
- `src/app/screens/` – Screen components:
  - **Core journey flow**: `HomeScreen` (Journey Dashboard), `OnboardingScreen` (first-visit 3-card flow), `MapDiscoveryScreen` (full-screen WebView map + horizontal carousel), `CreateGroupScreen` (4-step journey creation), `GroupDetailScreen` (journey detail — hero, timeline, tabs, glass bar)
  - **Auth**: `LoginScreen`, `RegisterScreen`, `ForgotPasswordScreen`, `ResetPasswordScreen`
  - **Places**: `PlaceDetailScreen`, `WriteReviewScreen`, `PlacesScreen`, `ExploreCitiesScreen`, `ExploreCityScreen`
  - **User**: `ProfileScreen`, `EditProfileScreen`, `CheckInsListScreen`, `FavoritesScreen`, `NotificationsScreen`
  - **Groups (legacy)**: `GroupsScreen`, `EditGroupScreen`, `EditGroupPlacesScreen`, `JoinGroupScreen`
  - **Utility**: `SplashScreen`, `SearchScreen`
- `src/lib/` – Shared utilities: `api/client.ts` (API client), `types/` (TypeScript types), `theme.ts`, `constants.ts`, `share.ts`, `hooks/` (useAnalytics — batched event ingestion, consent gating, AppState background flush, in-memory session ID), `utils/`.
- `src/stores/` – State stores.
- `src/components/` – Shared UI components: `ads/` (AdProvider, AdBannerNative, AdInterstitial, useAdConsent, ad-constants), `consent/` (ConsentBanner), `analytics/` (AnalyticsProviderConnected).

Design reference: `FRONTEND_V3_LIGHT.html` / `FRONTEND_V3_DARK.html` at repo root. Use the same translation keys and API shapes as `apps/soulstep-customer-web`.

## Tests

```bash
npm test
```

Tests live in `src/__tests__/`. Uses Jest + jest-expo. Covers pure logic (utilities, hooks, transformers) — not component rendering.

## Error Tracking (GlitchTip / Sentry)

GlitchTip integration requires native Sentry modules which need a full native build (not Expo Go). To enable:

```bash
npx expo install @sentry/react-native
```

Then follow the [Sentry React Native setup guide](https://docs.sentry.io/platforms/react-native/) to configure the DSN and wrap the root component. The `ErrorBoundary` component in `src/components/common/ErrorBoundary.tsx` already has a placeholder comment for `Sentry.captureException(error)` in `componentDidCatch`.
