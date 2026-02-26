import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── localStorage mock ──────────────────────────────────────────────────────
const storageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: storageMock,
  writable: true,
});

// Mock fetch globally
const fetchMock = vi.fn().mockResolvedValue({ ok: true });
vi.stubGlobal('fetch', fetchMock);

import { readConsent, writeConsent, syncConsentToBackend } from '@/components/ads/useAdConsent';
import { AD_CONSENT_KEY, ANALYTICS_CONSENT_KEY } from '@/components/ads/ad-constants';

describe('readConsent()', () => {
  beforeEach(() => {
    storageMock.clear();
  });

  it('returns null for both when nothing stored', () => {
    const c = readConsent();
    expect(c.ads).toBeNull();
    expect(c.analytics).toBeNull();
  });

  it('reads ads consent as true', () => {
    storageMock.setItem(AD_CONSENT_KEY, 'true');
    const c = readConsent();
    expect(c.ads).toBe(true);
  });

  it('reads ads consent as false', () => {
    storageMock.setItem(AD_CONSENT_KEY, 'false');
    const c = readConsent();
    expect(c.ads).toBe(false);
  });

  it('reads analytics consent independently', () => {
    storageMock.setItem(ANALYTICS_CONSENT_KEY, 'true');
    const c = readConsent();
    expect(c.ads).toBeNull();
    expect(c.analytics).toBe(true);
  });

  it('reads both when set', () => {
    storageMock.setItem(AD_CONSENT_KEY, 'true');
    storageMock.setItem(ANALYTICS_CONSENT_KEY, 'false');
    const c = readConsent();
    expect(c.ads).toBe(true);
    expect(c.analytics).toBe(false);
  });
});

describe('writeConsent()', () => {
  beforeEach(() => {
    storageMock.clear();
  });

  it('writes ads consent to localStorage', () => {
    writeConsent('ads', true);
    expect(storageMock.getItem(AD_CONSENT_KEY)).toBe('true');
  });

  it('writes analytics consent to localStorage', () => {
    writeConsent('analytics', false);
    expect(storageMock.getItem(ANALYTICS_CONSENT_KEY)).toBe('false');
  });

  it('overwrites existing consent', () => {
    writeConsent('ads', true);
    expect(storageMock.getItem(AD_CONSENT_KEY)).toBe('true');
    writeConsent('ads', false);
    expect(storageMock.getItem(AD_CONSENT_KEY)).toBe('false');
  });
});

describe('syncConsentToBackend()', () => {
  beforeEach(() => {
    fetchMock.mockClear();
  });

  it('sends POST to /api/v1/consent with consent data', () => {
    syncConsentToBackend('ads', true, 'vis_abc', 'tok_123');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
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
    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.headers['Authorization']).toBeUndefined();
  });

  it('does not throw when fetch rejects', () => {
    fetchMock.mockImplementationOnce(() => Promise.reject(new Error('network')));
    expect(() => syncConsentToBackend('ads', true, null, null)).not.toThrow();
  });
});
