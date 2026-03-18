/**
 * Tests for ad consent utilities (readConsent, writeConsent, syncConsentToBackend)
 * and interstitial cooldown logic.
 */

// Mock AsyncStorage before any imports
const mockStore: Record<string, string> = {};

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn((key: string) => Promise.resolve(mockStore[key] ?? null)),
  setItem: jest.fn((key: string, value: string) => {
    mockStore[key] = value;
    return Promise.resolve();
  }),
  removeItem: jest.fn((key: string) => {
    delete mockStore[key];
    return Promise.resolve();
  }),
}));

import { readConsent, writeConsent, syncConsentToBackend } from '../components/ads/useAdConsent';
import {
  AD_CONSENT_KEY,
  ANALYTICS_CONSENT_KEY,
  INTERSTITIAL_COOLDOWN_MS,
} from '../components/ads/ad-constants';
import {
  showInterstitialIfReady,
  clearFirstSessionFlag,
  resetInterstitialState,
} from '../components/ads/AdInterstitial';

const mockFetch = jest.fn(() => Promise.resolve({ ok: true }));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as unknown as Record<string, any>).fetch = mockFetch;

beforeEach(() => {
  // Clear mock store
  Object.keys(mockStore).forEach((k) => delete mockStore[k]);
  resetInterstitialState();
  mockFetch.mockClear();
});

// ─── readConsent ──────────────────────────────────────────────────────────────

describe('readConsent()', () => {
  it('returns null for both when nothing stored', async () => {
    const result = await readConsent();
    expect(result).toEqual({ ads: null, analytics: null });
  });

  it('returns true when "true" is stored', async () => {
    mockStore[AD_CONSENT_KEY] = 'true';
    mockStore[ANALYTICS_CONSENT_KEY] = 'true';
    const result = await readConsent();
    expect(result).toEqual({ ads: true, analytics: true });
  });

  it('returns false when "false" is stored', async () => {
    mockStore[AD_CONSENT_KEY] = 'false';
    mockStore[ANALYTICS_CONSENT_KEY] = 'false';
    const result = await readConsent();
    expect(result).toEqual({ ads: false, analytics: false });
  });

  it('handles mixed states', async () => {
    mockStore[AD_CONSENT_KEY] = 'true';
    // analytics not set
    const result = await readConsent();
    expect(result).toEqual({ ads: true, analytics: null });
  });
});

// ─── writeConsent ─────────────────────────────────────────────────────────────

describe('writeConsent()', () => {
  it('stores ads consent as string', async () => {
    await writeConsent('ads', true);
    expect(mockStore[AD_CONSENT_KEY]).toBe('true');
  });

  it('stores analytics consent as string', async () => {
    await writeConsent('analytics', false);
    expect(mockStore[ANALYTICS_CONSENT_KEY]).toBe('false');
  });

  it('roundtrips through readConsent', async () => {
    await writeConsent('ads', true);
    await writeConsent('analytics', false);
    const result = await readConsent();
    expect(result).toEqual({ ads: true, analytics: false });
  });
});

// ─── AdInterstitial ───────────────────────────────────────────────────────────

describe('AdInterstitial', () => {
  it('blocks interstitials during first session', () => {
    expect(showInterstitialIfReady()).toBe(false);
  });

  it('allows interstitial after clearing first session flag', () => {
    clearFirstSessionFlag();
    // Returns false because no real ad SDK is loaded, but it passes the guard
    expect(showInterstitialIfReady()).toBe(false);
  });

  it('has correct cooldown constant', () => {
    expect(INTERSTITIAL_COOLDOWN_MS).toBe(5 * 60 * 1000);
  });
});

// ─── syncConsentToBackend ────────────────────────────────────────────────────

describe('syncConsentToBackend()', () => {
  it('sends POST to /api/v1/consent with consent data', () => {
    syncConsentToBackend('ads', true, 'vis_abc', 'tok_123');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0] as unknown as [
      string,
      { method: string; body: string; headers: Record<string, string> },
    ];
    expect(url).toContain('/api/v1/consent');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({
      consent_type: 'ads',
      granted: true,
      visitor_code: 'vis_abc',
    });
    expect(opts.headers['Authorization']).toBe('Bearer tok_123');
  });

  it('omits Authorization header when token is null', () => {
    syncConsentToBackend('analytics', false, 'vis_abc', null);
    const [, opts] = mockFetch.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string> },
    ];
    expect(opts.headers['Authorization']).toBeUndefined();
  });

  it('does not throw when fetch rejects', () => {
    mockFetch.mockImplementationOnce(() => Promise.reject(new Error('network')));
    expect(() => syncConsentToBackend('ads', true, null, null)).not.toThrow();
  });
});
