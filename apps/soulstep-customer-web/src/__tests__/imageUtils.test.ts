import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock import.meta.env before importing the module
beforeEach(() => {
  vi.resetModules();
});

describe('getFullImageUrl()', () => {
  it('returns empty string for undefined', async () => {
    const { getFullImageUrl } = await import('@/lib/utils/imageUtils');
    expect(getFullImageUrl(undefined)).toBe('');
    expect(getFullImageUrl()).toBe('');
  });

  it('returns external URLs unchanged', async () => {
    const { getFullImageUrl } = await import('@/lib/utils/imageUtils');
    const url = 'https://images.unsplash.com/photo-123';
    expect(getFullImageUrl(url)).toBe(url);
  });

  it('returns relative paths as-is when no VITE_API_URL set', async () => {
    vi.stubEnv('VITE_API_URL', '');
    const { getFullImageUrl } = await import('@/lib/utils/imageUtils');
    const result = getFullImageUrl('/api/v1/places/pl_abc/images/1');
    vi.unstubAllEnvs();
    expect(result).toBe('/api/v1/places/pl_abc/images/1');
  });
});
