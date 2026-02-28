/**
 * Analytics hook — batched event ingestion with consent gating (mobile).
 *
 * - Buffers events and flushes every 30 s or when 10 events accumulate.
 * - Flushes on app background transition (AppState change).
 * - No-ops if analytics consent is not granted.
 * - Works for both authenticated users and anonymous visitors.
 */

import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import { createElement } from 'react';
import Constants from 'expo-constants';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:3000';

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

type MobilePlatform = 'ios' | 'android';

interface IngestionPayload {
  events: BufferedEvent[];
  platform: MobilePlatform;
  device_type: 'mobile';
  app_version?: string;
  visitor_code?: string;
}

interface AnalyticsContextValue {
  trackEvent: (type: AnalyticsEventType, properties?: Record<string, unknown>) => void;
}

// ── Session ID ────────────────────────────────────────────────────────────────

function generateSessionId(): string {
  // React Native doesn't have crypto.randomUUID reliably — use a simple UUID v4
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
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
  const sessionId = useRef(generateSessionId());
  const platform: MobilePlatform = Platform.OS === 'ios' ? 'ios' : 'android';
  const appVersion = (Constants.expoConfig?.version as string | undefined) ?? undefined;

  const flush = useCallback(() => {
    if (buffer.current.length === 0) return;
    if (!userCode && !visitorCode) return;
    if (analyticsConsent !== true) {
      buffer.current = [];
      return;
    }

    const payload: IngestionPayload = {
      events: [...buffer.current],
      platform,
      device_type: 'mobile',
      app_version: appVersion,
    };
    if (!userCode && visitorCode) {
      payload.visitor_code = visitorCode;
    }
    buffer.current = [];

    const url = `${API_BASE}/api/v1/analytics/events`;
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {
      // Fire-and-forget — analytics failures must not break UX
    });
  }, [analyticsConsent, userCode, visitorCode, platform, appVersion]);

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

  // Flush when app goes to background
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        flush();
      }
    });
    return () => subscription.remove();
  }, [flush]);

  return createElement(AnalyticsContext.Provider, { value: { trackEvent } }, children);
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAnalytics(): AnalyticsContextValue {
  return useContext(AnalyticsContext);
}
