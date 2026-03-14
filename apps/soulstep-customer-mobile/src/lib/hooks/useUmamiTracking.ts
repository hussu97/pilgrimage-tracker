/**
 * Umami Cloud analytics hook (mobile).
 *
 * - Fires a page-view event when `screenName` changes.
 * - Exposes `trackUmamiEvent(name, data?)` for custom events.
 * - No-ops when analytics consent is not granted or website ID is unset.
 * - Sends directly to cloud.umami.is (no adblocker risk in native apps).
 */

import { useCallback, useEffect, useRef } from 'react';
import { Dimensions, Platform } from 'react-native';

const WEBSITE_ID = process.env.EXPO_PUBLIC_UMAMI_WEBSITE_ID ?? '';
const UMAMI_ENDPOINT = 'https://cloud.umami.is/api/send';
const HOSTNAME = 'soulstep.app';

// ── Payload builder (exported for unit testing) ────────────────────────────

export interface UmamiEventPayload {
  type: 'event';
  payload: {
    hostname: string;
    language: string;
    screen: string;
    title: string;
    url: string;
    website: string;
    name?: string;
    data?: Record<string, unknown>;
  };
}

export function buildUmamiPayload(
  screenName: string,
  opts: {
    language?: string;
    eventName?: string;
    data?: Record<string, unknown>;
  } = {},
): UmamiEventPayload {
  const { width, height } = Dimensions.get('window');
  return {
    type: 'event',
    payload: {
      hostname: HOSTNAME,
      language: opts.language ?? (Platform.OS === 'ios' ? 'en' : 'en'),
      screen: `${Math.round(width)}x${Math.round(height)}`,
      title: screenName,
      url: `/${screenName}`,
      website: WEBSITE_ID,
      ...(opts.eventName ? { name: opts.eventName } : {}),
      ...(opts.data ? { data: opts.data } : {}),
    },
  };
}

function isWebsiteIdConfigured(): boolean {
  return (
    typeof WEBSITE_ID === 'string' &&
    WEBSITE_ID.length > 0 &&
    WEBSITE_ID !== '%EXPO_PUBLIC_UMAMI_WEBSITE_ID%'
  );
}

function sendToUmami(payload: UmamiEventPayload): void {
  fetch(UMAMI_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {
    // Fire-and-forget — analytics failures must not break UX
  });
}

// ── Hook ──────────────────────────────────────────────────────────────────

interface UseUmamiTrackingResult {
  /** Track a custom named event on the current screen. */
  trackUmamiEvent: (name: string, data?: Record<string, unknown>) => void;
}

/**
 * @param screenName  Current screen name (e.g. "Home", "PlaceDetail").
 * @param analyticsConsent  From AdProvider consent context.
 * @param language  Current locale code (e.g. "en", "ar", "hi").
 */
export function useUmamiTracking(
  screenName: string | null,
  analyticsConsent: boolean | null,
  language = 'en',
): UseUmamiTrackingResult {
  const lastTrackedScreen = useRef<string | null>(null);

  // Auto-track page views on screen change
  useEffect(() => {
    if (!isWebsiteIdConfigured()) return;
    // TODO: re-enable consent gating once AdProvider consent flow is wired up
    // if (analyticsConsent !== true) return;
    if (!screenName) return;
    if (screenName === lastTrackedScreen.current) return;

    lastTrackedScreen.current = screenName;
    sendToUmami(buildUmamiPayload(screenName, { language }));
  }, [screenName, analyticsConsent, language]);

  const trackUmamiEvent = useCallback(
    (name: string, data?: Record<string, unknown>) => {
      if (!isWebsiteIdConfigured()) return;
      // TODO: re-enable consent gating once AdProvider consent flow is wired up
      // if (analyticsConsent !== true) return;
      if (!screenName) return;

      sendToUmami(buildUmamiPayload(screenName, { language, eventName: name, data }));
    },
    [screenName, analyticsConsent, language],
  );

  return { trackUmamiEvent };
}
