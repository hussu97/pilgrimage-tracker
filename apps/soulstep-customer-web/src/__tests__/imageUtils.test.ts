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

  it('prepends base URL for relative paths', async () => {
    const { getFullImageUrl } = await import('@/lib/utils/imageUtils');
    const result = getFullImageUrl('/api/v1/places/pl_abc/images/1');
    expect(result).toContain('/api/v1/places/pl_abc/images/1');
    expect(result.startsWith('http')).toBe(true);
  });
});
