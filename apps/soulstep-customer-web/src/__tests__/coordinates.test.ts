import { describe, expect, it } from 'vitest';
import { hasCoordinates } from '@/lib/utils/coordinates';

describe('hasCoordinates', () => {
  it('accepts zero-valued coordinates', () => {
    expect(hasCoordinates({ lat: 0, lng: 0 })).toBe(true);
  });

  it('rejects null or missing coordinates', () => {
    expect(hasCoordinates(null)).toBe(false);
    expect(hasCoordinates({ lat: null, lng: 77.2 })).toBe(false);
    expect(hasCoordinates({ lat: 12.9, lng: null })).toBe(false);
    expect(hasCoordinates({ lat: 12.9 })).toBe(false);
  });
});
