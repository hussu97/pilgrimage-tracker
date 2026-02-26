/**
 * Ad unit slot names and storage keys.
 *
 * Mirrors web ad-constants.ts. Real unit IDs are fetched from the backend
 * via GET /api/v1/ads/config and merged at runtime by AdProvider.
 */

/** AsyncStorage key for ad consent state. */
export const AD_CONSENT_KEY = 'soulstep-ad-consent';
export const ANALYTICS_CONSENT_KEY = 'soulstep-analytics-consent';

/** Minimum time (ms) between interstitial ads. */
export const INTERSTITIAL_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

/** Well-known slot names used in AdBannerNative `slot` prop. */
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

/** Ad display format. */
export type AdFormat = 'banner' | 'medium-rectangle' | 'adaptive';
