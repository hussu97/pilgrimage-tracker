'use client';

/**
 * Umami Cloud analytics hook (customer web — Next.js App Router).
 *
 * Wraps window.umami.track() with consent gating.
 * - No-ops when analytics consent is not granted or website ID is unset.
 * - Reads consent automatically from AdProvider context.
 * - The Umami script itself is loaded via app/layout.tsx (conditionally, only
 *   when NEXT_PUBLIC_UMAMI_WEBSITE_ID is set). Auto page-views on initial load
 *   come from the script. SPA route-change pageviews are handled by
 *   useUmamiPageViews(); this hook is only for named custom events.
 */

import { useCallback } from 'react';
import { useAds } from '@/components/ads/AdProvider';

declare global {
  interface Window {
    umami?: {
      /**
       * Umami's track() supports three call shapes:
       *   1. Named event:   track(name, data?)
       *   2. Page-view override: track({ url, title, referrer, ... })
       *   3. Payload transform:  track((props) => ({ ...props, url: ... }))
       */
      track: {
        (eventName: string, data?: Record<string, unknown>): void;
        (props: Record<string, unknown>): void;
        (fn: (props: Record<string, unknown>) => Record<string, unknown>): void;
      };
    };
  }
}

const WEBSITE_ID: string = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID ?? '';

let _devConfigLogged = false;
function logDevConfigOnce(): void {
  if (_devConfigLogged) return;
  _devConfigLogged = true;
  if (process.env.NODE_ENV !== 'development') return;
  if (isWebsiteIdConfigured()) {
    // eslint-disable-next-line no-console
    console.info(`[umami] tracking enabled (website id ${WEBSITE_ID.slice(0, 8)}…)`);
  } else {
    console.warn(
      '[umami] NEXT_PUBLIC_UMAMI_WEBSITE_ID is unset — events will not be sent. ' +
        'Add it to .env.local to enable tracking in dev.',
    );
  }
}

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
  return typeof id === 'string' && id.length > 0 && id !== '%NEXT_PUBLIC_UMAMI_WEBSITE_ID%';
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
      logDevConfigOnce();
      if (!isWebsiteIdConfigured()) return;
      if (consent.analytics !== true) return;
      window.umami?.track(name, data);
    },
    [consent.analytics],
  );

  return { trackUmamiEvent };
}
