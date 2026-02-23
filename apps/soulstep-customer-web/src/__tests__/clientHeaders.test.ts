import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── localStorage mock ────────────────────────────────────────────────────────
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

import { clientHeaders } from '@/lib/api/client';

beforeEach(() => {
  storageMock.clear();
  vi.stubGlobal('fetch', vi.fn());
});

// ─── clientHeaders — desktop user agent ───────────────────────────────────────

describe('clientHeaders() — desktop browser', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      writable: true,
      configurable: true,
    });
  });

  it('returns X-App-Type: web', () => {
    expect(clientHeaders()['X-App-Type']).toBe('web');
  });

  it('returns X-Platform: web', () => {
    expect(clientHeaders()['X-Platform']).toBe('web');
  });

  it('returns X-Content-Type: desktop for non-mobile UA', () => {
    expect(clientHeaders()['X-Content-Type']).toBe('desktop');
  });

  it('does NOT include X-App-Version', () => {
    expect(clientHeaders()['X-App-Version']).toBeUndefined();
  });
});

// ─── clientHeaders — mobile user agent ───────────────────────────────────────

describe('clientHeaders() — mobile browser', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'userAgent', {
      value:
        'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.0.0 Mobile Safari/537.36',
      writable: true,
      configurable: true,
    });
  });

  it('returns X-Content-Type: mobile for mobile UA', () => {
    expect(clientHeaders()['X-Content-Type']).toBe('mobile');
  });

  it('still returns X-App-Type: web', () => {
    expect(clientHeaders()['X-App-Type']).toBe('web');
  });

  it('still returns X-Platform: web', () => {
    expect(clientHeaders()['X-Platform']).toBe('web');
  });
});

// ─── clientHeaders — Android user agent ──────────────────────────────────────

describe('clientHeaders() — Android keyword in UA', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Dalvik/2.1.0 (Linux; U; Android 11; Samsung Galaxy)',
      writable: true,
      configurable: true,
    });
  });

  it('detects Android as mobile', () => {
    expect(clientHeaders()['X-Content-Type']).toBe('mobile');
  });
});
