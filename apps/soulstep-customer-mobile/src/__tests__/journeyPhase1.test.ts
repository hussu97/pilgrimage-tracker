/**
 * Mobile tests for Phase 1 Journey UX pivot utilities.
 * Mirrors apps/soulstep-customer-web/src/__tests__/journeyPhase1.test.ts
 */

// ── Progress calculation ─────────────────────────────────────────────────────

function calcProgress(visited: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((visited / total) * 100);
}

describe('calcProgress', () => {
  it('returns 0 when total is 0', () => {
    expect(calcProgress(0, 0)).toBe(0);
  });

  it('returns 0 when nothing visited', () => {
    expect(calcProgress(0, 5)).toBe(0);
  });

  it('returns 100 when all visited', () => {
    expect(calcProgress(5, 5)).toBe(100);
  });

  it('rounds to nearest integer', () => {
    expect(calcProgress(1, 3)).toBe(33);
    expect(calcProgress(2, 3)).toBe(67);
  });
});

// ── Haversine distance ────────────────────────────────────────────────────────

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

describe('haversineKm', () => {
  it('returns 0 for identical points', () => {
    expect(haversineKm(25, 55, 25, 55)).toBeCloseTo(0);
  });

  it('is symmetric', () => {
    const a = haversineKm(25, 55, 26, 56);
    const b = haversineKm(26, 56, 25, 55);
    expect(a).toBeCloseTo(b, 5);
  });

  it('calculates a non-zero distance for distinct points', () => {
    expect(haversineKm(25.2, 55.3, 24.4, 54.4)).toBeGreaterThan(0);
  });
});

// ── Nearest-neighbour ordering ────────────────────────────────────────────────

interface Waypoint {
  code: string;
  lat: number;
  lng: number;
}

function nearestNeighbourOrder(places: Waypoint[]): string[] {
  if (places.length < 3) return places.map((p) => p.code);
  const ordered = [places[0]];
  const remaining = new Set(places.slice(1));
  while (remaining.size > 0) {
    const last = ordered[ordered.length - 1];
    let nearest: Waypoint | null = null;
    let nearestDist = Infinity;
    for (const p of remaining) {
      const d = haversineKm(last.lat, last.lng, p.lat, p.lng);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = p;
      }
    }
    if (nearest) {
      ordered.push(nearest);
      remaining.delete(nearest);
    }
  }
  return ordered.map((p) => p.code);
}

describe('nearestNeighbourOrder', () => {
  it('returns same order for fewer than 3 places', () => {
    expect(
      nearestNeighbourOrder([
        { code: 'A', lat: 25, lng: 55 },
        { code: 'B', lat: 26, lng: 56 },
      ]),
    ).toEqual(['A', 'B']);
  });

  it('reorders three collinear places optimally', () => {
    expect(
      nearestNeighbourOrder([
        { code: 'A', lat: 25, lng: 55 },
        { code: 'B', lat: 25, lng: 57 },
        { code: 'C', lat: 25, lng: 56 },
      ]),
    ).toEqual(['A', 'C', 'B']);
  });

  it('keeps already-optimal order unchanged', () => {
    expect(
      nearestNeighbourOrder([
        { code: 'A', lat: 25, lng: 55 },
        { code: 'B', lat: 25, lng: 55.1 },
        { code: 'C', lat: 25, lng: 55.2 },
      ]),
    ).toEqual(['A', 'B', 'C']);
  });

  it('always starts from the first place', () => {
    const result = nearestNeighbourOrder([
      { code: 'start', lat: 0, lng: 0 },
      { code: 'far', lat: 50, lng: 50 },
      { code: 'mid', lat: 25, lng: 25 },
    ]);
    expect(result[0]).toBe('start');
  });
});

// ── Journey URL helpers ───────────────────────────────────────────────────────

function journeyScreenParams(groupCode: string) {
  return { groupCode };
}

describe('journeyScreenParams', () => {
  it('builds GroupDetail params', () => {
    expect(journeyScreenParams('grp_abc')).toEqual({ groupCode: 'grp_abc' });
  });
});
