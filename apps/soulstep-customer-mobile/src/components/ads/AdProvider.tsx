/**
 * AdProvider — context for ad rendering decisions on mobile.
 *
 * Loads ad config from the backend, manages consent state, and exposes a
 * simple `canShowAds` flag for child components.
 *
 * AdMob SDK initialization is deferred until after the user grants consent.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Platform } from 'react-native';
import { useAuth } from '@/app/providers';
import { useAdConsent, type ConsentState } from './useAdConsent';
import type { AdSlotName } from './ad-constants';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:3000';

// ── Types ──────────────────────────────────────────────────────────────────────

interface AdConfig {
  adsEnabled: boolean;
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

// ── Provider ───────────────────────────────────────────────────────────────────

export function AdProvider({ children }: { children: ReactNode }) {
  const { user, token, visitorCode } = useAuth();
  const { consent, setConsent, acceptAll } = useAdConsent(visitorCode, token);
  const [config, setConfig] = useState<AdConfig>({
    adsEnabled: false,
    adSlots: {},
  });
  const [showConsentBanner, setShowConsentBanner] = useState(false);

  // Fetch ad config from backend
  useEffect(() => {
    const platform = Platform.OS === 'ios' ? 'ios' : 'android';
    fetch(`${API_BASE}/api/v1/ads/config?platform=${platform}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setConfig({
            adsEnabled: data.ads_enabled,
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
