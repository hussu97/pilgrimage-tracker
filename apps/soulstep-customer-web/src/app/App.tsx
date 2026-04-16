'use client';

import { useState, useEffect } from 'react';
import {
  AuthProvider,
  FeedbackProvider,
  I18nProvider,
  ThemeProvider,
  useI18n,
} from '@/app/providers';
import { COLORS } from '@/lib/colors';
import { LocationProvider } from '@/app/contexts/LocationContext';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { AuthGateProvider } from '@/components/auth/AuthGateProvider';
import { AdProvider } from '@/components/ads/AdProvider';
import ConsentBanner from '@/components/consent/ConsentBanner';
import { AnalyticsProviderConnected } from '@/components/analytics/AnalyticsProviderConnected';

/**
 * Renders children only after initial i18n (locale + translations) has loaded.
 *
 * SSR behaviour: during the server render (and first hydration frame) children
 * are rendered directly so the HTML contains real page content — this is what
 * Google AdSense and search crawlers need.  The animated splash is shown only
 * on the client, after the component mounts, while translations are still
 * loading.  This avoids blank-page SSR output and prevents hydration mismatches.
 */
function I18nReadyGate({ children }: { children: React.ReactNode }) {
  const { ready } = useI18n();
  // Start as false — becomes true after first client-side mount.
  // During SSR and the initial hydration frame this stays false, so both server
  // and first-client renders produce identical output (children).
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);

  if (isClient && !ready) {
    return (
      <>
        <style>{`
          @keyframes ssLogoIn {
            0% { opacity: 0; transform: scale(0.5) rotate(-15deg); }
            70% { transform: scale(1.08) rotate(2deg); }
            100% { opacity: 1; transform: scale(1) rotate(0deg); }
          }
          @keyframes ssRingPulse {
            0%, 100% { opacity: 0.25; transform: scale(1); }
            50% { opacity: 0.55; transform: scale(1.06); }
          }
          @keyframes ssRingPulse2 {
            0%, 100% { opacity: 0.1; transform: scale(1); }
            50% { opacity: 0.2; transform: scale(1.12); }
          }
          @keyframes ssRingSpin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          @keyframes ssTextIn {
            from { opacity: 0; transform: translateY(18px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes ssDotPop {
            0%, 80%, 100% { transform: scale(0.6); opacity: 0.35; }
            40% { transform: scale(1.4); opacity: 1; }
          }
          @keyframes ssGlowPulse {
            0%, 100% { opacity: 0.4; transform: scale(1); }
            50% { opacity: 0.7; transform: scale(1.08); }
          }
        `}</style>
        <div className="min-h-screen flex flex-col items-center justify-center bg-background-light dark:bg-dark-bg overflow-hidden relative select-none">
          {/* Ambient glow rings */}
          <div
            className="absolute rounded-full bg-primary/[0.07] dark:bg-primary/[0.1]"
            style={{
              width: 560,
              height: 560,
              top: '50%',
              left: '50%',
              translate: '-50% -50%',
              animation: 'ssRingPulse2 5s ease-in-out infinite',
            }}
          />
          <div
            className="absolute rounded-full bg-primary/[0.1] dark:bg-primary/[0.14]"
            style={{
              width: 340,
              height: 340,
              top: '50%',
              left: '50%',
              translate: '-50% -50%',
              animation: 'ssRingPulse 4s ease-in-out infinite 0.5s',
            }}
          />

          {/* Logo card */}
          <div
            style={{
              animation: 'ssLogoIn 0.9s cubic-bezier(0.34,1.56,0.64,1) forwards',
              opacity: 0,
            }}
            className="relative"
          >
            {/* Spinning orbit ring */}
            <div
              className="absolute inset-0 m-auto"
              style={{
                width: 120,
                height: 120,
                top: -12,
                left: -12,
                borderRadius: '50%',
                border: '2px solid transparent',
                borderTopColor: COLORS.primary,
                borderRightColor: COLORS.primaryAlpha30,
                animation: 'ssRingSpin 5s linear infinite',
              }}
            />
            <div
              className="absolute inset-0 m-auto"
              style={{
                width: 140,
                height: 140,
                top: -22,
                left: -22,
                borderRadius: '50%',
                border: `1px solid ${COLORS.primaryAlpha15}`,
                animation: 'ssRingSpin 10s linear infinite reverse',
              }}
            />

            <div
              className="w-24 h-24 rounded-full bg-white dark:bg-dark-surface flex items-center justify-center relative z-10"
              style={{
                boxShadow: `0 20px 60px ${COLORS.primaryAlpha22}, 0 4px 16px rgba(0,0,0,0.08)`,
              }}
            >
              {/* Compass SVG mark */}
              <svg
                width="46"
                height="46"
                viewBox="0 0 46 46"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <circle
                  cx="23"
                  cy="23"
                  r="20"
                  stroke={COLORS.primary}
                  strokeWidth="1"
                  strokeOpacity="0.2"
                  fill="none"
                />
                <circle cx="23" cy="23" r="3.5" fill={COLORS.primary} />
                {/* North needle */}
                <path d="M23 5 L25.2 20.8 L23 23 L20.8 20.8 Z" fill={COLORS.primary} />
                {/* East needle */}
                <path
                  d="M41 23 L25.2 25.2 L23 23 L25.2 20.8 Z"
                  fill={COLORS.compassNeutral}
                  fillOpacity="0.7"
                />
                {/* South needle */}
                <path
                  d="M23 41 L20.8 25.2 L23 23 L25.2 25.2 Z"
                  fill={COLORS.compassNeutral}
                  fillOpacity="0.6"
                />
                {/* West needle */}
                <path
                  d="M5 23 L20.8 20.8 L23 23 L20.8 25.2 Z"
                  fill={COLORS.compassNeutral}
                  fillOpacity="0.4"
                />
                <circle
                  cx="23"
                  cy="23"
                  r="16"
                  stroke={COLORS.primary}
                  strokeWidth="0.5"
                  strokeOpacity="0.12"
                  fill="none"
                  strokeDasharray="3 4"
                />
              </svg>
            </div>
          </div>

          {/* Brand wordmark */}
          <div
            style={{ animation: 'ssTextIn 0.7s ease-out 0.35s forwards', opacity: 0 }}
            className="mt-9"
          >
            <h1
              className="text-[2.6rem] font-bold text-text-main dark:text-white"
              style={{
                fontFamily: 'Lexend, Inter, sans-serif',
                letterSpacing: '-0.03em',
                lineHeight: 1,
              }}
            >
              SoulStep
            </h1>
          </div>

          {/* Tagline */}
          <div
            style={{ animation: 'ssTextIn 0.7s ease-out 0.55s forwards', opacity: 0 }}
            className="mt-2.5"
          >
            <p className="text-[10px] font-semibold text-primary tracking-[0.25em] uppercase">
              Sacred Sites &nbsp;·&nbsp; Every Step
            </p>
          </div>

          {/* Bouncing dots loader */}
          <div
            style={{ animation: 'ssTextIn 0.5s ease-out 0.75s forwards', opacity: 0 }}
            className="mt-14 flex gap-2 items-center"
          >
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-primary"
                style={{ animation: `ssDotPop 1.5s ease-in-out ${i * 0.22}s infinite` }}
              />
            ))}
          </div>
        </div>
      </>
    );
  }
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
