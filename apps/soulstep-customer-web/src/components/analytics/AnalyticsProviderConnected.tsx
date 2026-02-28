/**
 * Connects AnalyticsProvider to the existing auth and ads contexts.
 * Must be placed inside both AuthProvider and AdProvider.
 */

import type { ReactNode } from 'react';
import { AnalyticsProvider } from '@/lib/hooks/useAnalytics';
import { useAuth } from '@/app/providers';
import { useAds } from '@/components/ads/AdProvider';

export function AnalyticsProviderConnected({ children }: { children: ReactNode }) {
  const { user, visitorCode } = useAuth();
  const { consent } = useAds();

  const userCode = (user as { user_code?: string } | null)?.user_code ?? null;

  return (
    <AnalyticsProvider
      analyticsConsent={consent.analytics}
      userCode={userCode}
      visitorCode={visitorCode}
    >
      {children}
    </AnalyticsProvider>
  );
}
