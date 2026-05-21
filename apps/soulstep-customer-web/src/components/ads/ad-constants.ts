/**
 * Ad unit slot names and IDs.
 *
 * Real unit IDs / network tags are fetched from the backend via
 * GET /api/v1/ads/config and merged at runtime by AdProvider.
 */

/** Storage key for consent state. */
export const AD_CONSENT_KEY = 'soulstep-ad-consent';
export const ANALYTICS_CONSENT_KEY = 'soulstep-analytics-consent';

/** Minimum time (ms) between interstitial-style disruptions (not used on web). */
export const INTERSTITIAL_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

/** Well-known slot names used in AdBanner `slot` prop. */
export type AdSlotName =
  | 'home-feed'
  | 'places-feed'
  | 'explore-feed'
  | 'explore-city-feed'
  | 'journeys-feed'
  | 'blog-list-feed'
  | 'map-panel-feed'
  | 'place-detail-top'
  | 'place-detail-mid'
  | 'place-detail-bottom'
  | 'checkins-top'
  | 'checkins-mid'
  | 'favorites-feed'
  | 'group-detail-bottom'
  | 'profile-bottom'
  | 'notifications-bottom'
  | 'global-social-bar'
  | 'global-popunder';

/** Ad display format (maps to Google AdSense ad-format). */
export type AdFormat = 'auto' | 'horizontal' | 'rectangle' | 'vertical';

export type AdProviderName = 'adsense' | 'adsterra';

export interface AdsenseSlotConfig {
  provider?: 'adsense';
  slotId?: string;
  slot_id?: string;
}

export interface AdsterraSlotConfig {
  provider: 'adsterra';
  /** banner/native/social-bar/popunder/script. Native and global formats may use scriptSrc only. */
  type?: 'banner' | 'native' | 'social-bar' | 'popunder' | 'script';
  /** Adsterra zone key for standard banner invoke.js tags. */
  key?: string;
  /** Full script URL copied from Adsterra, supports https:// and protocol-relative URLs. */
  scriptSrc?: string;
  script_src?: string;
  /** Native banner container id copied from Adsterra, when that format provides one. */
  containerId?: string;
  container_id?: string;
  width?: number;
  height?: number;
  params?: Record<string, unknown>;
}

export type AdSlotConfig = string | AdsenseSlotConfig | AdsterraSlotConfig;
