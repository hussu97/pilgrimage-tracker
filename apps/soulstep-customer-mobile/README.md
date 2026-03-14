# SoulStep – Mobile App (Expo)

Expo / React Native app for iOS and Android. Feature parity with `apps/soulstep-customer-web` — same API, same screens, same translation keys.

Design reference: `FRONTEND_V3_LIGHT.html` (light mode) / `FRONTEND_V3_DARK.html` (dark mode) at repo root.

## Prerequisites

- **Node.js 18+**
- **iOS simulator**: Xcode (macOS only)
- **Android emulator**: Android Studio with Android SDK
- **Physical device**: Expo Go app (for quick testing without a native build)

## Quick Start

From repo root:

```bash
npm install
npm run dev:mobile
```

Or from this directory:

```bash
npm install
npx expo start
```

Then:
- Press `i` → iOS simulator
- Press `a` → Android emulator
- Scan QR code → Expo Go on device

The backend must be running. For a physical device, set `EXPO_PUBLIC_API_URL` to your machine's LAN IP (e.g. `http://192.168.1.10:3000`) — simulators can use `http://127.0.0.1:3000`.

## Build for Device

**Local development build:**

```bash
npx expo run:ios       # requires Xcode
npx expo run:android   # requires Android Studio
```

**Production build (EAS Build):**

```bash
npm install -g eas-cli
eas build --platform ios
eas build --platform android
```

Configure `app.json` / `app.config.js` (icons, splash screen, bundle identifier, scheme) before your first EAS build. Submit to App Store / Play Store using `eas submit` or manually.

## Environment Variables

Copy `.env.example` to `.env` and set values. All `EXPO_PUBLIC_*` vars are bundled into the JS at build time.

| Variable | Required | Default | Description |
|---|---|---|---|
| `EXPO_PUBLIC_API_URL` | Yes (device/prod) | `http://127.0.0.1:3000` | Backend API base URL. Simulators can use 127.0.0.1; physical devices need the LAN IP or prod URL. |
| `EXPO_PUBLIC_INVITE_LINK_BASE_URL` | No | — | Base URL for group invite links. When unset, invite sharing is disabled. |
| `EXPO_PUBLIC_ADMOB_APP_ID_IOS` | No | — | Google AdMob App ID for iOS (from AdMob console → App settings → App ID) |
| `EXPO_PUBLIC_ADMOB_APP_ID_ANDROID` | No | — | Google AdMob App ID for Android |
| `EXPO_PUBLIC_UMAMI_WEBSITE_ID` | No | — | Umami Cloud website ID for analytics. Sends directly to `cloud.umami.is` (no adblocker risk in native apps). |

**EAS secrets** (for production builds): `eas secret:create --name VAR_NAME --value VALUE`

## Tests

```bash
npm test
```

Tests live in `src/__tests__/`. Uses Jest + jest-expo. Covers pure logic (utilities, hooks, transformers) — not component rendering.

## Directory Structure

```
src/
  app/
    App.tsx              # Root component
    providers.tsx        # Auth + i18n providers
    navigation.tsx       # Stack and tab navigation definitions
    screens/             # All screen components (see Screens below)
    contexts/            # React contexts
  lib/
    api/client.ts        # API client (all endpoints)
    types/               # TypeScript types (uses *_code identifiers)
    theme.ts             # Design tokens (colors, spacing)
    constants.ts
    share.ts
    hooks/               # useAnalytics, batched event ingestion
    utils/
  components/
    ads/                 # AdProvider, AdBannerNative, AdInterstitial
    consent/             # ConsentBanner
    analytics/           # AnalyticsProviderConnected
    common/              # ErrorBoundary and shared UI
  stores/                # State stores
index.js                 # Entry point
app.json                 # Expo config
eas.json                 # EAS Build config
```

## Screens

| Screen | Stack | Description |
|---|---|---|
| `HomeScreen` | Bottom tab | Journey Dashboard — active journey card, quick actions, carousels |
| `OnboardingScreen` | Stack | 3-card first-visit onboarding flow |
| `MapDiscoveryScreen` | Bottom tab | Full-screen WebView map + horizontal carousel |
| `PlaceDetailScreen` | Stack | Place detail with FAQ, nearby places |
| `PlacesScreen` | Stack | All sacred sites list |
| `ExploreCitiesScreen` | Stack | City browse |
| `ExploreCityScreen` | Stack | Places in a city |
| `CreateGroupScreen` | Stack | 4-step journey creation flow |
| `GroupDetailScreen` | Stack | Journey detail — hero, timeline, tabs, glass bar |
| `EditGroupScreen` | Stack | Edit journey settings |
| `EditGroupPlacesScreen` | Stack | Edit journey place list |
| `ProfileScreen` | Bottom tab | User stats, settings, dark mode |
| `EditProfileScreen` | Stack | Update display name |
| `CheckInsListScreen` | Stack | Check-in history |
| `FavoritesScreen` | Stack | Saved places |
| `NotificationsScreen` | Stack | Notification list |
| `LoginScreen` | Auth | Email + password sign-in |
| `RegisterScreen` | Auth | Account creation |
| `ForgotPasswordScreen` | Auth | Password reset request |
| `ResetPasswordScreen` | Auth | Set new password |
| `SearchScreen` | Stack | Place search |
| `SplashScreen` | Root | Loading gate (waits for translations + auth) |

## Error Tracking

GlitchTip / Sentry integration requires a full native build (not Expo Go):

```bash
npx expo install @sentry/react-native
```

Follow the [Sentry React Native setup guide](https://docs.sentry.io/platforms/react-native/) to configure the DSN and wrap the root component.
