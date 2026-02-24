/**
 * Tests for setApiLocale() — verifies that the locale module variable is
 * correctly injected as a `lang` query parameter in getPlaces(), getPlace(),
 * and getPlaceReviews() calls, and absent (fast path) when locale is English.
 */
import { setApiLocale, getPlaces, getPlace, getPlaceReviews } from '@/lib/api/client';

// Mock react-native modules
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(null),
}));
jest.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.0.0' } },
}));

function mockOkResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue(data),
  } as unknown as Response;
}

beforeEach(() => {
  (global.fetch as jest.Mock) = jest.fn();
  // Reset locale to English before each test
  setApiLocale('en');
});

// ── setApiLocale + getPlaces ──────────────────────────────────────────────────

describe('setApiLocale() + getPlaces()', () => {
  it('does NOT inject lang param when locale is en', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      mockOkResponse({ places: [], filters: { options: [] } }),
    );
    setApiLocale('en');
    await getPlaces();
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).not.toContain('lang=');
  });

  it('injects lang=ar when locale is ar', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      mockOkResponse({ places: [], filters: { options: [] } }),
    );
    setApiLocale('ar');
    await getPlaces();
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain('lang=ar');
  });

  it('injects lang=hi when locale is hi', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      mockOkResponse({ places: [], filters: { options: [] } }),
    );
    setApiLocale('hi');
    await getPlaces();
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain('lang=hi');
  });

  it('injects lang=te when locale is te', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      mockOkResponse({ places: [], filters: { options: [] } }),
    );
    setApiLocale('te');
    await getPlaces();
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain('lang=te');
  });
});

// ── setApiLocale + getPlace ───────────────────────────────────────────────────

describe('setApiLocale() + getPlace()', () => {
  it('does NOT inject lang param when locale is en', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      mockOkResponse({ place_code: 'plc_001', name: 'Test' }),
    );
    setApiLocale('en');
    await getPlace('plc_001');
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).not.toContain('lang=');
  });

  it('injects lang=ar when locale is ar', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      mockOkResponse({ place_code: 'plc_001', name: 'مسجد' }),
    );
    setApiLocale('ar');
    await getPlace('plc_001');
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain('lang=ar');
  });
});

// ── setApiLocale + getPlaceReviews ────────────────────────────────────────────

describe('setApiLocale() + getPlaceReviews()', () => {
  it('does NOT inject lang param when locale is en', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(mockOkResponse({ reviews: [] }));
    setApiLocale('en');
    await getPlaceReviews('plc_001');
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).not.toContain('lang=');
  });

  it('injects lang=ar when locale is ar', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(mockOkResponse({ reviews: [] }));
    setApiLocale('ar');
    await getPlaceReviews('plc_001');
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain('lang=ar');
  });

  it('injects lang=hi when locale is hi', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(mockOkResponse({ reviews: [] }));
    setApiLocale('hi');
    await getPlaceReviews('plc_001');
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain('lang=hi');
  });
});
