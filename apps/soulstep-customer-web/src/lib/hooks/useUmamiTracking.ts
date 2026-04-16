/**
 * Umami Cloud analytics hook (web).
 *
 * Wraps window.umami.track() with consent gating.
 * - No-ops when analytics consent is not granted or website ID is unset.
 * - Reads consent automatically from AdProvider context.
 * - The Umami script is loaded via index.html; auto page-views are handled by it.
 *   This hook is only for named custom events.
 */

import { useCallback } from 'react';
import { useAds } from '@/components/ads/AdProvider';

declare global {
  interface Window {
    umami?: {
      track: (eventName: string, data?: Record<string, unknown>) => void;
    };
  }
}

const WEBSITE_ID = import.meta.env.VITE_UMAMI_WEBSITE_ID ?? '';

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
  pageName: string,
  websiteId: string,
  opts: {
    hostname?: string;
    language?: string;
    screen?: string;
    eventName?: string;
    data?: Record<string, unknown>;
  } = {},
): UmamiEventPayload {
  return {
    type: 'event',
    payload: {
      hostname: opts.hostname ?? 'soulstep.app',
      language: opts.language ?? 'en',
      screen:
        opts.screen ??
        (typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : '1280x800'),
      title: pageName,
      url: typeof window !== 'undefined' ? window.location.pathname : `/${pageName}`,
      website: websiteId,
      ...(opts.eventName ? { name: opts.eventName } : {}),
      ...(opts.data ? { data: opts.data } : {}),
    },
  };
}

export function isWebsiteIdConfigured(id = WEBSITE_ID): boolean {
  return typeof id === 'string' && id.length > 0 && id !== '%VITE_UMAMI_WEBSITE_ID%';
}

// ── Hook ──────────────────────────────────────────────────────────────────

interface UseUmamiTrackingResult {
  /** Track a custom named Umami event on the current page. */
  trackUmamiEvent: (name: string, data?: Record<string, unknown>) => void;
}

/**
 * Use in any component inside AdProvider.
 * Consent is read automatically from the AdProvider context.
 */
export function useUmamiTracking(): UseUmamiTrackingResult {
  const { consent } = useAds();

  const trackUmamiEvent = useCallback(
    (name: string, data?: Record<string, unknown>) => {
      if (!isWebsiteIdConfigured()) return;
      if (consent.analytics !== true) return;
      window.umami?.track(name, data);
    },
    [consent.analytics],
  );

  return { trackUmamiEvent };
}
