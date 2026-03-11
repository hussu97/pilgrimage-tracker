/**
 * Renders inside NavigationContainer and tracks screen views in Umami Cloud.
 * Reads consent from AdProvider (which wraps NavigationContainer in App.tsx).
 * Uses useNavigationState to detect the currently focused route.
 */

import { useEffect, useRef } from 'react';
import { useNavigationState } from '@react-navigation/native';
import { useAds } from '@/components/ads/AdProvider';
import { useUmamiTracking } from '@/lib/hooks/useUmamiTracking';

function getActiveRouteName(
  state: ReturnType<typeof useNavigationState<typeof identity>> | undefined,
): string | null {
  if (!state) return null;
  const route = state.routes[state.index ?? 0];
  if (!route) return null;
  // Recurse into nested navigators
  if (route.state)
    return getActiveRouteName(route.state as Parameters<typeof getActiveRouteName>[0]);
  return route.name;
}

// Identity selector to get the full state
function identity<T>(s: T): T {
  return s;
}

export function UmamiTrackerConnected() {
  const state = useNavigationState(identity);
  const { consent } = useAds();
  const screenName = getActiveRouteName(state);
  useUmamiTracking(screenName, consent.analytics);
  return null;
}
