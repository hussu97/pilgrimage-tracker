'use client';

/**
 * Reports a Umami page view on every client-side route change.
 *
 * The Umami script's built-in auto-tracking only fires on the initial document
 * load. Next.js App Router uses soft navigation (no full page reload), so
 * without this hook the dashboard would only see deep-link entries and miss
 * all in-session navigation. Mount this once near the root of the app.
 */

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { isWebsiteIdConfigured } from './useUmamiTracking';
import { routeToPageName } from '@/lib/analytics/events';

export function useUmamiPageViews(): void {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastReported = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;
    if (!isWebsiteIdConfigured()) return;

    // Dedupe — soft navs occasionally re-run this effect with unchanged params.
    const qs = searchParams?.toString() ?? '';
    const key = qs ? `${pathname}?${qs}` : pathname;
    if (lastReported.current === key) return;
    lastReported.current = key;

    // Passing a plain object to umami.track() reports a page view (not a
    // named custom event). Route template (dynamic segments collapsed) is used
    // as the title so the dashboard rows stay stable instead of exploding into
    // one per entity code.
    window.umami?.track({
      url: key,
      title: routeToPageName(pathname),
      referrer: typeof document !== 'undefined' ? document.referrer : '',
    });
  }, [pathname, searchParams]);
}
