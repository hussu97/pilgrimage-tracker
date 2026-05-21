'use client';

/**
 * AdProvider — context for ad rendering decisions.
 *
 * Loads ad config from the backend, manages consent state, and exposes
 * provider-neutral slot config for child components.
 *
 * Third-party ad scripts are only injected after the user grants consent.
 */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '@/app/providers';
import { getCached, setCache, dedupeInflight } from '@/lib/api/cache';
import { markThirdPartyAdsActive } from '@/lib/thirdPartyRejections';
import { useAdConsent, type ConsentState } from './useAdConsent';
import {
  filterSlotsForAdServer,
  isAdsterraSlotConfig,
  normalizeAdServer,
  resolveAdsenseSlotId,
  type AdProviderName,
  type AdSlotConfig,
  type AdSlotName,
} from './ad-constants';
import { injectAdsterraGlobalScript } from './adsterra';

const API_BASE = '';
const ADSENSE_PUB_ID = process.env.NEXT_PUBLIC_ADSENSE_PUBLISHER_ID ?? '';

// ── Types ──────────────────────────────────────────────────────────────────────

interface AdConfig {
  adsEnabled: boolean;
  adServer: AdProviderName;
  publisherId: string;
  adSlots: Partial<Record<AdSlotName, AdSlotConfig>>;
}

interface AdContextValue {
  /** True when all conditions are met: config enabled, consent given, not premium. */
  canShowAds: boolean;
  /** Active ad server. Only slots matching this provider are exposed. */
  adServer: AdProviderName;
  /** Ad unit ID for a given slot name (from backend config). */
  getSlotId: (slot: AdSlotName) => string;
  /** Provider-specific slot config for a given slot name. */
  getSlotConfig: (slot: AdSlotName) => AdSlotConfig | undefined;
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
    adServer: 'adsense',
    publisherId: ADSENSE_PUB_ID,
    adSlots: {},
  });
  const [showConsentBanner, setShowConsentBanner] = useState(false);

  // Fetch ad config from backend
  useEffect(() => {
    const CACHE_KEY = 'ads:config:web';
    const TTL = 5 * 60_000;
    type RawAdConfig = {
      ads_enabled: boolean;
      ad_server?: AdProviderName;
      adsense_publisher_id: string;
      ad_slots: Partial<Record<AdSlotName, AdSlotConfig>>;
    };

    const apply = (data: RawAdConfig) => {
      const adServer = normalizeAdServer(data.ad_server);
      setConfig({
        adsEnabled: data.ads_enabled,
        adServer,
        publisherId: adServer === 'adsense' ? data.adsense_publisher_id || ADSENSE_PUB_ID : '',
        adSlots: filterSlotsForAdServer(data.ad_slots || {}, adServer),
      });
    };

    const cached = getCached<RawAdConfig>(CACHE_KEY, TTL);
    if (cached) {
      apply(cached);
      return;
    }

    dedupeInflight(CACHE_KEY, () =>
      fetch(`${API_BASE}/api/v1/ads/config?platform=web`).then((r) => (r.ok ? r.json() : null)),
    )
      .then((data) => {
        if (data) {
          setCache(CACHE_KEY, data);
          apply(data);
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

  // Inject provider scripts only after consent is granted.
  useEffect(() => {
    if (!canShowAds) return;

    const globalSocialBar = config.adSlots['global-social-bar'];
    const globalPopunder = config.adSlots['global-popunder'];
    const hasAdsenseSlot = Object.values(config.adSlots).some((slotConfig) =>
      resolveAdsenseSlotId(slotConfig),
    );
    const cleanup: Array<() => void> = [];

    markThirdPartyAdsActive();
    if (config.adServer === 'adsense' && config.publisherId && hasAdsenseSlot) {
      injectAdSenseScript(config.publisherId);
      updateGoogleConsent(true);
    }
    if (config.adServer === 'adsterra' && isAdsterraSlotConfig(globalSocialBar)) {
      cleanup.push(injectAdsterraGlobalScript('adsterra-global-social-bar', globalSocialBar));
    }
    if (config.adServer === 'adsterra' && isAdsterraSlotConfig(globalPopunder)) {
      cleanup.push(injectAdsterraGlobalScript('adsterra-global-popunder', globalPopunder));
    }

    return () => {
      cleanup.forEach((fn) => fn());
    };
  }, [canShowAds, config.adServer, config.adSlots, config.publisherId]);

  const getSlotConfig = useMemo(() => (slot: AdSlotName) => config.adSlots[slot], [config.adSlots]);
  const getSlotId = useMemo(
    () => (slot: AdSlotName) => resolveAdsenseSlotId(config.adSlots[slot]),
    [config.adSlots],
  );

  const dismissConsentBanner = useMemo(() => () => setShowConsentBanner(false), []);

  const value = useMemo<AdContextValue>(
    () => ({
      canShowAds,
      adServer: config.adServer,
      getSlotId,
      getSlotConfig,
      consent,
      setConsent,
      acceptAll,
      showConsentBanner,
      dismissConsentBanner,
    }),
    [
      canShowAds,
      config.adServer,
      getSlotId,
      getSlotConfig,
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
