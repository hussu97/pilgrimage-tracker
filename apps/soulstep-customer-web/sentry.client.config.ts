import * as Sentry from '@sentry/nextjs';
import { shouldDropSentryEventForThirdPartyAds } from './src/lib/thirdPartyRejections';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.05,
  debug: false,
  enabled: process.env.NODE_ENV === 'production',
  beforeSend(event) {
    if (shouldDropSentryEventForThirdPartyAds(event)) return null;
    return event;
  },
});
