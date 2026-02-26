/**
 * AdProvider — context for ad rendering decisions.
 *
 * Loads ad config from the backend, manages consent state, and exposes a
 * simple `canShowAds` flag for child components.
 *
 * The AdSense `<script>` tag is only injected after the user grants consent.
 */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '@/app/providers';
import { useAdConsent, type ConsentState } from './useAdConsent';
import type { AdSlotName } from './ad-constants';

const API_BASE = import.meta.env.VITE_API_URL ?? '';
const ADSENSE_PUB_ID = import.meta.env.VITE_ADSENSE_PUBLISHER_ID ?? '';

// ── Types ──────────────────────────────────────────────────────────────────────

interface AdConfig {
  adsEnabled: boolean;
  publisherId: string;
  adSlots: Record<string, string>;
}

interface AdContextValue {
  /** True when all conditions are met: config enabled, consent given, not premium. */
  canShowAds: boolean;
  /** Ad unit ID for a given slot name (from backend config). */
  getSlotId: (slot: AdSlotName) => string;
  /** Current consent state. */
  consent: ConsentState;
  /** Set consent for a specific type. */
  setConsent: (type: 'ads' | 'analytics', granted: boolean) => void;
  /** Grant all consent types at once. */
  acceptAll: () => void;
  /** Whether the consent banner should be shown. */
  showConsentBanner: boolean;
  /** Dismiss the consent banner. */
  dismissConsentBanner: () => void;
}

const AdContext = createContext<AdContextValue | null>(null);

// ── Helpers ────────────────────────────────────────────────────────────────────

function injectAdSenseScript(pubId: string): void {
  if (!pubId || document.getElementById('adsense-script')) return;
  const s = document.createElement('script');
  s.id = 'adsense-script';
  s.async = true;
  s.crossOrigin = 'anonymous';
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${pubId}`;
  document.head.appendChild(s);
}

function updateGoogleConsent(granted: boolean): void {
  const w = window as unknown as { gtag?: (...args: unknown[]) => void };
  if (w.gtag) {
    const state = granted ? 'granted' : 'denied';
    w.gtag('consent', 'update', {
      ad_storage: state,
      ad_user_data: state,
      ad_personalization: state,
      analytics_storage: state,
    });
  }
}

// ── Provider ───────────────────────────────────────────────────────────────────

export function AdProvider({ children }: { children: ReactNode }) {
  const { user, token, visitorCode } = useAuth();
  const { consent, setConsent, acceptAll } = useAdConsent(visitorCode, token);
  const [config, setConfig] = useState<AdConfig>({
    adsEnabled: false,
    publisherId: ADSENSE_PUB_ID,
    adSlots: {},
  });
  const [showConsentBanner, setShowConsentBanner] = useState(false);

  // Fetch ad config from backend
  useEffect(() => {
    fetch(`${API_BASE}/api/v1/ads/config?platform=web`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setConfig({
            adsEnabled: data.ads_enabled,
            publisherId: data.adsense_publisher_id || ADSENSE_PUB_ID,
            adSlots: data.ad_slots || {},
          });
        }
      })
      .catch(() => {
        // Non-critical — fall back to defaults
      });
  }, []);

  // Show consent banner if consent hasn't been given yet and ads are enabled
  useEffect(() => {
    if (config.adsEnabled && consent.ads === null) {
      setShowConsentBanner(true);
    }
  }, [config.adsEnabled, consent.ads]);

  // Inject AdSense script only after consent is granted
  useEffect(() => {
    if (consent.ads && config.publisherId) {
      injectAdSenseScript(config.publisherId);
      updateGoogleConsent(true);
    }
  }, [consent.ads, config.publisherId]);

  const isPremium = !!(user as { is_premium?: boolean } | null)?.is_premium;
  const canShowAds = config.adsEnabled && consent.ads === true && !isPremium;

  const getSlotId = useMemo(
    () => (slot: AdSlotName) => config.adSlots[slot] ?? '',
    [config.adSlots],
  );

  const dismissConsentBanner = useMemo(() => () => setShowConsentBanner(false), []);

  const value = useMemo<AdContextValue>(
    () => ({
      canShowAds,
      getSlotId,
      consent,
      setConsent,
      acceptAll,
      showConsentBanner,
      dismissConsentBanner,
    }),
    [
      canShowAds,
      getSlotId,
      consent,
      setConsent,
      acceptAll,
      showConsentBanner,
      dismissConsentBanner,
    ],
  );

  return <AdContext.Provider value={value}>{children}</AdContext.Provider>;
}

export function useAds(): AdContextValue {
  const ctx = useContext(AdContext);
  if (!ctx) throw new Error('useAds must be used within AdProvider');
  return ctx;
}
