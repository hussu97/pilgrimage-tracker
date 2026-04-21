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
import { usePathname } from 'next/navigation';
import { isWebsiteIdConfigured } from './useUmamiTracking';
import { routeToPageName } from '@/lib/analytics/events';

export function useUmamiPageViews(): void {
  const pathname = usePathname();
  const lastReported = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;
    if (!isWebsiteIdConfigured()) return;

    // Dedupe — soft navs occasionally re-run this effect with unchanged pathname.
    // We intentionally ignore searchParams: (a) using useSearchParams would
    // force every page that mounts this hook to sit inside a Suspense boundary
    // for Next.js static prerender, and (b) most funnels don't care about
    // query-string variations of the same page.
    if (lastReported.current === pathname) return;
    lastReported.current = pathname;

    // Passing a plain object to umami.track() reports a page view (not a
    // named custom event). Route template (dynamic segments collapsed) is used
    // as the title so the dashboard rows stay stable instead of exploding into
    // one per entity code.
    window.umami?.track({
      url: pathname,
      title: routeToPageName(pathname),
      referrer: typeof document !== 'undefined' ? document.referrer : '',
    });
  }, [pathname]);
}
