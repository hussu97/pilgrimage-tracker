/**
 * Tests for Phase 3 UI redesign utilities.
 *
 * Covers pure logic:
 *   - Place count response parsing (count field variations)
 *   - City metrics popularity badge derivation
 *   - Ease-out cubic animation progress calculation
 *   - Carousel card width class helpers
 */
import { describe, it, expect } from 'vitest';

// ── Place count response parsing ───────────────────────────────────────────────

function parsePlacesCount(data: Record<string, unknown>): number {
  const val = data.count ?? data.total ?? 0;
  return typeof val === 'number' ? val : 0;
}

describe('parsePlacesCount', () => {
  it('reads count field', () => {
    expect(parsePlacesCount({ count: 1234 })).toBe(1234);
  });

  it('falls back to total field', () => {
    expect(parsePlacesCount({ total: 5678 })).toBe(5678);
  });

  it('prefers count over total when both present', () => {
    expect(parsePlacesCount({ count: 100, total: 200 })).toBe(100);
  });

  it('returns 0 for empty response', () => {
    expect(parsePlacesCount({})).toBe(0);
  });

  it('returns 0 for non-numeric value', () => {
    expect(parsePlacesCount({ count: 'bad' })).toBe(0);
  });
});

// ── City popularity badge logic ───────────────────────────────────────────────

function derivePopularityLabel(checkins30d: number): string | null {
  if (checkins30d > 50) return 'Trending';
  if (checkins30d > 20) return 'Popular';
  if (checkins30d > 5) return 'Growing';
  return null;
}

describe('derivePopularityLabel', () => {
  it('returns Trending for >50 checkins', () => {
    expect(derivePopularityLabel(51)).toBe('Trending');
    expect(derivePopularityLabel(200)).toBe('Trending');
  });

  it('returns Popular for 21–50 checkins', () => {
    expect(derivePopularityLabel(21)).toBe('Popular');
    expect(derivePopularityLabel(50)).toBe('Popular');
  });

  it('returns Growing for 6–20 checkins', () => {
    expect(derivePopularityLabel(6)).toBe('Growing');
    expect(derivePopularityLabel(20)).toBe('Growing');
  });

  it('returns null for ≤5 checkins', () => {
    expect(derivePopularityLabel(5)).toBeNull();
    expect(derivePopularityLabel(0)).toBeNull();
  });
});

// ── Ease-out cubic ticker progress ────────────────────────────────────────────

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function tickerValue(elapsed: number, duration: number, total: number): number {
  const progress = Math.min(elapsed / duration, 1);
  return Math.round(easeOutCubic(progress) * total);
}

describe('tickerValue', () => {
  it('starts at 0', () => {
    expect(tickerValue(0, 1200, 5000)).toBe(0);
  });

  it('reaches total at duration', () => {
    expect(tickerValue(1200, 1200, 5000)).toBe(5000);
  });

  it('clamps at total beyond duration', () => {
    expect(tickerValue(2000, 1200, 5000)).toBe(5000);
  });

  it('is monotonically increasing', () => {
    const samples = [0, 100, 300, 600, 900, 1200].map((t) => tickerValue(t, 1200, 1000));
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1]);
    }
  });

  it('is faster at start (ease-out)', () => {
    // At 50% time, ease-out cubic should be past 50% of value
    const midValue = tickerValue(600, 1200, 1000);
    expect(midValue).toBeGreaterThan(500);
  });
});

// ── Carousel card width class helpers ─────────────────────────────────────────

function mobileCardClass(isMobile: boolean): string {
  return isMobile ? 'w-[calc((100vw-2.5rem)/2.3)] flex-shrink-0' : 'w-48 flex-shrink-0';
}

describe('mobileCardClass', () => {
  it('returns 2.3-item width on mobile', () => {
    const cls = mobileCardClass(true);
    expect(cls).toContain('w-[calc((100vw-2.5rem)/2.3)]');
    expect(cls).toContain('flex-shrink-0');
  });

  it('returns fixed width on desktop', () => {
    const cls = mobileCardClass(false);
    expect(cls).toContain('w-48');
    expect(cls).toContain('flex-shrink-0');
  });
});
