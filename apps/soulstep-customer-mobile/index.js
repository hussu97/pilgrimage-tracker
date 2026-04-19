import * as Sentry from '@sentry/react-native';
import { registerRootComponent } from 'expo';
import App from './src/app/App';

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
if (DSN) {
  Sentry.init({ dsn: DSN, tracesSampleRate: 0.05, enabled: !__DEV__ });
}

registerRootComponent(DSN ? Sentry.wrap(App) : App);
