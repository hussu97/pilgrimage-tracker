import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shareUrl } from '@/lib/share';

describe('shareUrl()', () => {
  beforeEach(() => {
    // Reset navigator mocks between tests
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'window', {
      value: { location: { origin: 'https://example.com' } },
      writable: true,
      configurable: true,
    });
  });

  it('calls navigator.share when available and returns "shared"', async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, 'share', {
      value: shareMock,
      writable: true,
      configurable: true,
    });

    const result = await shareUrl('Test title', 'https://example.com/page');
    expect(shareMock).toHaveBeenCalledWith({
      title: 'Test title',
      url: 'https://example.com/page',
      text: 'Test title',
    });
    expect(result).toBe('shared');
  });

  it('prepends window.location.origin for relative URLs', async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, 'share', {
      value: shareMock,
      writable: true,
      configurable: true,
    });

    await shareUrl('Test', '/relative/path');
    expect(shareMock).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://example.com/relative/path' }),
    );
  });

  it('treats AbortError as "shared" (user dismissed share sheet)', async () => {
    const abortError = new Error('share cancelled');
    abortError.name = 'AbortError';
    const shareMock = vi.fn().mockRejectedValue(abortError);
    Object.defineProperty(globalThis.navigator, 'share', {
      value: shareMock,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });

    const result = await shareUrl('Test', 'https://example.com');
    expect(result).toBe('shared');
  });

  it('falls back to clipboard.writeText when navigator.share is unavailable', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });
    // no navigator.share

    const result = await shareUrl('Test title', 'https://example.com/page');
    expect(writeTextMock).toHaveBeenCalledWith('https://example.com/page');
    expect(result).toBe('copied');
  });

  it('returns "copied" even when clipboard also fails', async () => {
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      writable: true,
      configurable: true,
    });

    const result = await shareUrl('Test', 'https://example.com');
    expect(result).toBe('copied');
  });

  it('uses empty origin when window is undefined (SSR/Node fallback)', async () => {
    Object.defineProperty(globalThis, 'window', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } },
      writable: true,
      configurable: true,
    });
    const result = await shareUrl('Test', '/relative');
    expect(result).toBe('copied');
    // Restore window for subsequent tests
    Object.defineProperty(globalThis, 'window', {
      value: { location: { origin: 'https://example.com' } },
      writable: true,
      configurable: true,
    });
  });

  it('falls back to clipboard when navigator.share throws a non-AbortError', async () => {
    const networkError = new Error('network error');
    const shareMock = vi.fn().mockRejectedValue(networkError);
    Object.defineProperty(globalThis.navigator, 'share', {
      value: shareMock,
      writable: true,
      configurable: true,
    });
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });

    const result = await shareUrl('Test', 'https://example.com');
    expect(writeTextMock).toHaveBeenCalled();
    expect(result).toBe('copied');
  });
});
