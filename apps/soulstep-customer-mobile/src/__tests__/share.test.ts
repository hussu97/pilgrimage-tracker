// Mock react-native modules before any imports
jest.mock('react-native', () => ({
  Share: {
    share: jest.fn(),
    sharedAction: 'sharedAction',
    dismissedAction: 'dismissedAction',
  },
  Platform: {
    OS: 'ios',
    select: jest.fn((map: Record<string, unknown>) => map.ios ?? map.android),
  },
  Linking: {
    canOpenURL: jest.fn(),
    openURL: jest.fn(),
  },
}));

import { Share, Platform, Linking } from 'react-native';
import { shareUrl, openDirections } from '../lib/share';

/** Flush all pending microtasks/promises. */
const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

const mockShare = Share.share as jest.Mock;
const mockCanOpenURL = Linking.canOpenURL as jest.Mock;
const mockOpenURL = Linking.openURL as jest.Mock;
const mockPlatformSelect = Platform.select as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── shareUrl ─────────────────────────────────────────────────────────────────

describe('shareUrl()', () => {
  it('returns "shared" when Share.share resolves with sharedAction', async () => {
    mockShare.mockResolvedValue({ action: Share.sharedAction });

    const result = await shareUrl('Test', 'https://example.com');
    expect(mockShare).toHaveBeenCalledWith({
      title: 'Test',
      message: 'https://example.com',
      url: 'https://example.com',
    });
    expect(result).toBe('shared');
  });

  it('returns "dismissed" when Share.share resolves with dismissedAction', async () => {
    mockShare.mockResolvedValue({ action: Share.dismissedAction });

    const result = await shareUrl('Test', 'https://example.com');
    expect(result).toBe('dismissed');
  });

  it('returns "dismissed" when Share.share rejects', async () => {
    mockShare.mockRejectedValue(new Error('share error'));

    const result = await shareUrl('Test', 'https://example.com');
    expect(result).toBe('dismissed');
  });
});

// ─── openDirections ───────────────────────────────────────────────────────────

describe('openDirections() on iOS', () => {
  beforeEach(() => {
    mockPlatformSelect.mockImplementation((map: Record<string, unknown>) => map.ios);
  });

  it('opens maps:// URL when supported on iOS', async () => {
    mockCanOpenURL.mockResolvedValue(true);
    mockOpenURL.mockResolvedValue(undefined);

    openDirections(25.2048, 55.2708, 'Dubai');
    await flushPromises();

    expect(mockCanOpenURL).toHaveBeenCalledWith('maps://?daddr=25.2048,55.2708');
  });

  it('falls back to Google Maps web URL when native scheme is unsupported', async () => {
    mockCanOpenURL.mockResolvedValue(false);
    mockOpenURL.mockResolvedValue(undefined);

    openDirections(25.2048, 55.2708);
    await flushPromises();

    expect(mockOpenURL).toHaveBeenCalledWith(
      expect.stringContaining('maps.google.com/?daddr=25.2048,55.2708'),
    );
  });

  it('falls back to Google Maps when canOpenURL rejects', async () => {
    mockCanOpenURL.mockRejectedValue(new Error('check failed'));
    mockOpenURL.mockResolvedValue(undefined);

    openDirections(25.2048, 55.2708);
    await flushPromises();

    expect(mockOpenURL).toHaveBeenCalledWith(
      expect.stringContaining('maps.google.com/?daddr=25.2048,55.2708'),
    );
  });
});

describe('openDirections() on Android', () => {
  beforeEach(() => {
    mockPlatformSelect.mockImplementation((map: Record<string, unknown>) => map.android);
  });

  it('opens geo: URL with coordinates on Android', async () => {
    mockCanOpenURL.mockResolvedValue(true);
    mockOpenURL.mockResolvedValue(undefined);

    openDirections(25.2048, 55.2708, 'Dubai');
    await flushPromises();

    expect(mockCanOpenURL).toHaveBeenCalledWith(expect.stringContaining('geo:25.2048,55.2708'));
  });
});

describe('openDirections() — no native URL (web/unknown platform)', () => {
  beforeEach(() => {
    // Platform.select returns undefined — neither ios nor android
    mockPlatformSelect.mockImplementation(() => undefined);
  });

  it('directly opens fallback Google Maps URL when nativeUrl is undefined', async () => {
    mockOpenURL.mockResolvedValue(undefined);

    openDirections(25.2048, 55.2708, 'Dubai');
    await flushPromises();

    expect(mockCanOpenURL).not.toHaveBeenCalled();
    expect(mockOpenURL).toHaveBeenCalledWith(
      expect.stringContaining('maps.google.com/?daddr=25.2048,55.2708'),
    );
  });
});
