/**
 * Renders inside NavigationContainer and tracks screen views in Umami Cloud.
 * Reads consent from AdProvider (which wraps NavigationContainer in App.tsx).
 * Uses useNavigationState to detect the currently focused route.
 */

import { useEffect, useRef } from 'react';
import { useNavigationState } from '@react-navigation/native';
import type { NavigationState, PartialState } from '@react-navigation/routers';
import { useAds } from '@/components/ads/AdProvider';
import { useUmamiTracking } from '@/lib/hooks/useUmamiTracking';

type NavState = NavigationState | PartialState<NavigationState>;

function getActiveRouteName(state: NavState | undefined): string | null {
  if (!state) return null;
  const route = state.routes[state.index ?? 0];
  if (!route) return null;
  // Recurse into nested navigators
  if (route.state) return getActiveRouteName(route.state as NavState);
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
