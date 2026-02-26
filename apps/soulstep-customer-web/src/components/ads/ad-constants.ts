/**
 * Ad unit slot names and IDs.
 *
 * In development, Google AdSense renders placeholder ads automatically when
 * `data-adtest="on"` is set (handled by AdBanner). Real unit IDs are fetched
 * from the backend via GET /api/v1/ads/config and merged at runtime by
 * AdProvider.
 */

/** Storage key for consent state. */
export const AD_CONSENT_KEY = 'soulstep-ad-consent';
export const ANALYTICS_CONSENT_KEY = 'soulstep-analytics-consent';

/** Minimum time (ms) between interstitial-style disruptions (not used on web). */
export const INTERSTITIAL_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

/** Well-known slot names used in AdBanner `slot` prop. */
export type AdSlotName =
  | 'home-feed'
  | 'place-detail-top'
  | 'place-detail-mid'
  | 'place-detail-bottom'
  | 'checkins-top'
  | 'checkins-mid'
  | 'favorites-feed'
  | 'group-detail-bottom'
  | 'profile-bottom'
  | 'notifications-bottom';

/** Ad display format (maps to Google AdSense ad-format). */
export type AdFormat = 'auto' | 'horizontal' | 'rectangle' | 'vertical';
