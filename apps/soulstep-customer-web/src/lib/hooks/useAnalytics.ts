'use client';

/**
 * Analytics hook — batched event ingestion with consent gating.
 *
 * - Buffers events and flushes every 30 s or when 10 events accumulate.
 * - Uses navigator.sendBeacon() on page unload for reliability.
 * - No-ops if analytics consent is not granted.
 * - Works for both authenticated users and anonymous visitors.
 */

import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react';
import { useLocation } from '@/lib/navigation';
import { createElement } from 'react';

const API_BASE = '';

// ── Types ─────────────────────────────────────────────────────────────────────

export type AnalyticsEventType =
  | 'page_view'
  | 'place_view'
  | 'search'
  | 'check_in'
  | 'favorite_toggle'
  | 'review_submit'
  | 'share'
  | 'filter_change'
  | 'signup'
  | 'login';

interface BufferedEvent {
  event_type: AnalyticsEventType;
  properties?: Record<string, unknown>;
  client_timestamp: string;
  session_id: string;
}

interface IngestionPayload {
  events: BufferedEvent[];
  platform: 'web';
  device_type: 'mobile' | 'desktop';
  visitor_code?: string;
}

interface AnalyticsContextValue {
  trackEvent: (type: AnalyticsEventType, properties?: Record<string, unknown>) => void;
}

// ── Session ID ────────────────────────────────────────────────────────────────

function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return '';
  const key = '__ss_session_id';
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
  }
  return id;
}

function getDeviceType(): 'mobile' | 'desktop' {
  if (typeof window === 'undefined') return 'desktop';
  return window.innerWidth < 768 ? 'mobile' : 'desktop';
}

// ── Context ───────────────────────────────────────────────────────────────────

export const AnalyticsContext = createContext<AnalyticsContextValue>({
  trackEvent: () => {},
});

// ── Provider ──────────────────────────────────────────────────────────────────

interface AnalyticsProviderProps {
  children: ReactNode;
  /** Analytics consent flag — pass from AdProvider/consent context. */
  analyticsConsent: boolean | null;
  /** Authenticated user code — pass from AuthContext. */
  userCode?: string | null;
  /** Anonymous visitor code — pass from AuthContext. */
  visitorCode?: string | null;
}

const FLUSH_INTERVAL_MS = 30_000;
const MAX_BUFFER_SIZE = 10;

export function AnalyticsProvider({
  children,
  analyticsConsent,
  userCode,
  visitorCode,
}: AnalyticsProviderProps) {
  const buffer = useRef<BufferedEvent[]>([]);
  // Lazily initialize session ID on the client side to avoid SSR issues
  const sessionId = useRef<string>('');
  useEffect(() => {
    sessionId.current = getOrCreateSessionId();
  }, []);

  const flush = useCallback(
    (useBeacon = false) => {
      if (buffer.current.length === 0) return;
      // Require either user or visitor identity
      if (!userCode && !visitorCode) return;
      // Only send if consent granted
      if (analyticsConsent !== true) {
        buffer.current = [];
        return;
      }

      const payload: IngestionPayload = {
        events: [...buffer.current],
        platform: 'web',
        device_type: getDeviceType(),
      };
      if (!userCode && visitorCode) {
        payload.visitor_code = visitorCode;
      }
      buffer.current = [];

      const url = `${API_BASE}/api/v1/analytics/events`;
      const body = JSON.stringify(payload);

      if (useBeacon && navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
      } else {
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          keepalive: true,
        }).catch(() => {
          // Fire-and-forget — analytics failures must not break UX
        });
      }
    },
    [analyticsConsent, userCode, visitorCode],
  );

  const trackEvent = useCallback(
    (type: AnalyticsEventType, properties?: Record<string, unknown>) => {
      if (analyticsConsent !== true) return;
      if (!userCode && !visitorCode) return;

      buffer.current.push({
        event_type: type,
        properties,
        client_timestamp: new Date().toISOString(),
        session_id: sessionId.current,
      });

      if (buffer.current.length >= MAX_BUFFER_SIZE) {
        flush();
      }
    },
    [analyticsConsent, userCode, visitorCode, flush],
  );

  // Periodic flush
  useEffect(() => {
    const id = setInterval(() => flush(), FLUSH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [flush]);

  // Flush on page unload via sendBeacon
  useEffect(() => {
    const handler = () => flush(true);
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [flush]);

  return createElement(AnalyticsContext.Provider, { value: { trackEvent } }, children);
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useAnalytics(): AnalyticsContextValue {
  return useContext(AnalyticsContext);
}

/**
 * Auto page-view tracking. Call this once inside your route wrapper or App.
 * Fires a page_view event on every location change.
 */
export function usePageViewTracking() {
  const { trackEvent } = useAnalytics();
  const location = useLocation();

  useEffect(() => {
    trackEvent('page_view', { page_path: location.pathname });
  }, [location.pathname, trackEvent]);
}
