/**
 * Tests for setApiLocale() — verifies that the locale module variable is
 * correctly injected as a `lang` query parameter in getPlaces() and getPlace()
 * calls, and absent (fast path) when locale is English.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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
Object.defineProperty(window, 'localStorage', { value: storageMock, writable: true });

import { setApiLocale, getPlaces, getPlace } from '@/lib/api/client';

function mockOkResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(data),
  } as unknown as Response;
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
  storageMock.clear();
  // Reset locale to English before each test
  setApiLocale('en');
});

// ── setApiLocale + getPlaces ──────────────────────────────────────────────────

describe('setApiLocale() + getPlaces()', () => {
  it('does NOT inject lang param when locale is en', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockOkResponse({ places: [], filters: { options: [] } }),
    );
    setApiLocale('en');
    await getPlaces();
    const url = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(url).not.toContain('lang=');
  });

  it('injects lang=ar when locale is ar', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockOkResponse({ places: [], filters: { options: [] } }),
    );
    setApiLocale('ar');
    await getPlaces();
    const url = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(url).toContain('lang=ar');
  });

  it('injects lang=hi when locale is hi', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockOkResponse({ places: [], filters: { options: [] } }),
    );
    setApiLocale('hi');
    await getPlaces();
    const url = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(url).toContain('lang=hi');
  });

  it('injects lang=te when locale is te', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockOkResponse({ places: [], filters: { options: [] } }),
    );
    setApiLocale('te');
    await getPlaces();
    const url = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(url).toContain('lang=te');
  });
});

// ── setApiLocale + getPlace ───────────────────────────────────────────────────

describe('setApiLocale() + getPlace()', () => {
  it('does NOT inject lang param when locale is en', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockOkResponse({ place_code: 'plc_001', name: 'Test' }));
    setApiLocale('en');
    await getPlace('plc_001');
    const url = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(url).not.toContain('lang=');
  });

  it('injects lang=ar when locale is ar', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockOkResponse({ place_code: 'plc_001', name: 'مسجد' }));
    setApiLocale('ar');
    await getPlace('plc_001');
    const url = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(url).toContain('lang=ar');
  });
});
