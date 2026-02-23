/**
 * Utility functions for place-related UI logic.
 */

export function formatDistance(km: number, units: 'km' | 'miles' = 'km'): string {
  if (units === 'miles') {
    const mi = km * 0.621371;
    return mi < 0.1 ? `${Math.round(mi * 5280)} ft` : `${mi.toFixed(1)} mi`;
  }
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}
