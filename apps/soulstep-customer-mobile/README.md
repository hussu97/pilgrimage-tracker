# SoulStep – Mobile App (Expo)

Expo / React Native app for iOS and Android. Feature-parity with the customer web app.

## Quick Start

```bash
cd apps/soulstep-customer-mobile
npm install
cp .env.example .env          # edit values
npx expo start
```

Scan the QR code with Expo Go (iOS/Android) or press `i`/`a` for simulator.

## Environment Variables

| Variable | Description |
|---|---|
| `EXPO_PUBLIC_API_URL` | Catalog-api base URL (e.g. `https://catalog-api.soulstep.app`) |

## Key Screens

| Screen | Description |
|---|---|
| `HomeScreen` | Featured places, nearby, recommended journeys |
| `PlacesScreen` | Browse all sacred sites |
| `PlaceDetailScreen` | Place detail with check-in, reviews, FAQs, nearby |
| `MapScreen` | Interactive map with filters |
| `GroupsScreen` | My journeys list |
| `GroupDetailScreen` | Journey detail — timeline, members, progress |
| `ExploreCitiesScreen` | Browse cities |
| `ExploreCityScreen` | City page with place grid |
| `ProfileScreen` | User profile and settings |

## Tests

```bash
npm test          # Jest / jest-expo unit tests
```

## Production Build

```bash
npm install -g eas-cli
eas build --platform ios      # iOS
eas build --platform android  # Android
```

Configure `eas.json` and set secrets in the Expo dashboard before building.
