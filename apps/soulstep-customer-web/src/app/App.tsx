'use client';

import { useState, useEffect } from 'react';
import {
  AuthProvider,
  FeedbackProvider,
  I18nProvider,
  ThemeProvider,
  useI18n,
} from '@/app/providers';
import { LocationProvider } from '@/app/contexts/LocationContext';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { AuthGateProvider } from '@/components/auth/AuthGateProvider';
import { AdProvider } from '@/components/ads/AdProvider';
import ConsentBanner from '@/components/consent/ConsentBanner';
import { AnalyticsProviderConnected } from '@/components/analytics/AnalyticsProviderConnected';

function I18nReadyGate({ children }: { children: React.ReactNode }) {
  const { ready } = useI18n();
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);

  if (isClient && !ready) return null;
  return <>{children}</>;
}

/** Root app component that wraps all providers around Next.js page children. */
export default function App({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <I18nProvider>
            <I18nReadyGate>
              <AdProvider>
                <AnalyticsProviderConnected>
                  <FeedbackProvider>
                    <LocationProvider>
                      <AuthGateProvider>
                        {children}
                        <ConsentBanner />
                      </AuthGateProvider>
                    </LocationProvider>
                  </FeedbackProvider>
                </AnalyticsProviderConnected>
              </AdProvider>
            </I18nReadyGate>
          </I18nProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
