import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getCached, setCache, invalidateCache } from '@/lib/api/cache';

describe('api cache', () => {
  beforeEach(() => {
    invalidateCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null for a missing key', () => {
    expect(getCached('missing', 60_000)).toBeNull();
  });

  it('returns cached data within TTL', () => {
    setCache('key', { value: 42 });
    expect(getCached<{ value: number }>('key', 60_000)).toEqual({ value: 42 });
  });

  it('returns null after TTL expires', () => {
    setCache('key', 'hello');
    vi.advanceTimersByTime(61_000);
    expect(getCached('key', 60_000)).toBeNull();
  });

  it('invalidates by prefix', () => {
    setCache('places:all', []);
    setCache('places:islam', []);
    setCache('profile:me', {});
    invalidateCache('places:');
    expect(getCached('places:all', 60_000)).toBeNull();
    expect(getCached('places:islam', 60_000)).toBeNull();
    expect(getCached<object>('profile:me', 60_000)).toEqual({});
  });

  it('invalidates all when no prefix given', () => {
    setCache('a', 1);
    setCache('b', 2);
    invalidateCache();
    expect(getCached('a', 60_000)).toBeNull();
    expect(getCached('b', 60_000)).toBeNull();
  });
});
