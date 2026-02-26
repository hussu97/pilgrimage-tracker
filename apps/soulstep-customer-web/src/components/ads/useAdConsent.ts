/**
 * Hook for reading and writing ad/analytics consent state.
 *
 * Consent is persisted in localStorage and synced to the backend via
 * POST /api/v1/consent. The hook returns the current state and a setter.
 */

import { useState, useCallback } from 'react';
import { AD_CONSENT_KEY, ANALYTICS_CONSENT_KEY } from './ad-constants';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export interface ConsentState {
  ads: boolean | null;
  analytics: boolean | null;
}

/** Read consent from localStorage. Returns null if not yet decided. */
export function readConsent(): ConsentState {
  const ads = localStorage.getItem(AD_CONSENT_KEY);
  const analytics = localStorage.getItem(ANALYTICS_CONSENT_KEY);
  return {
    ads: ads === null ? null : ads === 'true',
    analytics: analytics === null ? null : analytics === 'true',
  };
}

/** Persist consent to localStorage. */
export function writeConsent(type: 'ads' | 'analytics', granted: boolean): void {
  const key = type === 'ads' ? AD_CONSENT_KEY : ANALYTICS_CONSENT_KEY;
  localStorage.setItem(key, String(granted));
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
    credentials: 'include',
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
  const [consent, setConsentState] = useState<ConsentState>(readConsent);

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
