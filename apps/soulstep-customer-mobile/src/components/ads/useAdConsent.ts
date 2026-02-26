/**
 * Hook for reading and writing ad/analytics consent state.
 *
 * Consent is persisted in AsyncStorage and synced to the backend via
 * POST /api/v1/consent. Mirrors web useAdConsent.ts.
 */

import { useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AD_CONSENT_KEY, ANALYTICS_CONSENT_KEY } from './ad-constants';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:3000';

export interface ConsentState {
  ads: boolean | null;
  analytics: boolean | null;
}

/** Read consent from AsyncStorage. Returns null if not yet decided. */
export async function readConsent(): Promise<ConsentState> {
  try {
    const [ads, analytics] = await Promise.all([
      AsyncStorage.getItem(AD_CONSENT_KEY),
      AsyncStorage.getItem(ANALYTICS_CONSENT_KEY),
    ]);
    return {
      ads: ads === null ? null : ads === 'true',
      analytics: analytics === null ? null : analytics === 'true',
    };
  } catch {
    return { ads: null, analytics: null };
  }
}

/** Persist consent to AsyncStorage. */
export async function writeConsent(type: 'ads' | 'analytics', granted: boolean): Promise<void> {
  const key = type === 'ads' ? AD_CONSENT_KEY : ANALYTICS_CONSENT_KEY;
  await AsyncStorage.setItem(key, String(granted));
}

/** Sync consent to backend (fire-and-forget). */
function syncConsentToBackend(
  type: 'ads' | 'analytics',
  granted: boolean,
  visitorCode: string | null,
  token: string | null,
): void {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  fetch(`${API_BASE}/api/v1/consent`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      consent_type: type,
      granted,
      visitor_code: visitorCode,
    }),
  }).catch(() => {
    // Non-critical — consent is persisted locally regardless
  });
}

export function useAdConsent(visitorCode: string | null, token: string | null) {
  const [consent, setConsentState] = useState<ConsentState>({ ads: null, analytics: null });

  // Load persisted consent on mount
  useEffect(() => {
    readConsent().then(setConsentState);
  }, []);

  const setConsent = useCallback(
    (type: 'ads' | 'analytics', granted: boolean) => {
      writeConsent(type, granted);
      setConsentState((prev) => ({ ...prev, [type]: granted }));
      syncConsentToBackend(type, granted, visitorCode, token);
    },
    [visitorCode, token],
  );

  const acceptAll = useCallback(() => {
    setConsent('ads', true);
    setConsent('analytics', true);
  }, [setConsent]);

  return { consent, setConsent, acceptAll };
}
