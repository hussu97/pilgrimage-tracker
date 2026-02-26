/**
 * AdInterstitial — singleton controller for interstitial ads.
 *
 * Manages a 5-minute cooldown between interstitials and tracks whether the
 * user is in their first session (grace period = no interstitials).
 *
 * Once react-native-google-mobile-ads is installed, this will preload and
 * show real interstitial ads. For now it's a no-op placeholder.
 */

import { INTERSTITIAL_COOLDOWN_MS } from './ad-constants';

let lastShownAt = 0;
let isFirstSession = true;

/** Mark that the user has had at least one session. */
export function clearFirstSessionFlag(): void {
  isFirstSession = false;
}

/**
 * Show an interstitial ad if ready and cooldown has elapsed.
 * Returns true if the ad was shown, false otherwise.
 */
export function showInterstitialIfReady(): boolean {
  if (isFirstSession) return false;

  const now = Date.now();
  if (now - lastShownAt < INTERSTITIAL_COOLDOWN_MS) return false;

  // TODO: Replace with real AdMob interstitial when SDK is installed
  // InterstitialAd.createForAdRequest(adUnitId).show();
  lastShownAt = now;
  return false; // Return false until real ads are wired
}

/** Reset state (for testing). */
export function resetInterstitialState(): void {
  lastShownAt = 0;
  isFirstSession = true;
}
