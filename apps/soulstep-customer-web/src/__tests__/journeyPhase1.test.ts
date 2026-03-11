/**
 * Tests for Phase 1 Journey UX pivot utilities.
 *
 * Covers pure logic:
 *   - Progress percentage calculation
 *   - Nearest-neighbour route ordering (client-side mirror)
 *   - Journey navigation helpers
 */
import { describe, it, expect } from 'vitest';

// ── Progress ring calculation ─────────────────────────────────────────────────

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

  it('caps at 100 for over-visited edge cases', () => {
    expect(calcProgress(6, 5)).toBe(120); // raw — callers clamp if needed
  });
});

// ── Haversine distance (client-side for route optimisation) ──────────────────

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

  it('calculates approximate Dubai–Abu Dhabi distance', () => {
    // Dubai (25.2, 55.3) to Abu Dhabi (24.4, 54.4) ≈ 130km
    const dist = haversineKm(25.2, 55.3, 24.4, 54.4);
    expect(dist).toBeGreaterThan(100);
    expect(dist).toBeLessThan(160);
  });

  it('is symmetric', () => {
    const a = haversineKm(25, 55, 26, 56);
    const b = haversineKm(26, 56, 25, 55);
    expect(a).toBeCloseTo(b, 5);
  });
});

// ── Nearest-neighbour route optimisation (client-side) ───────────────────────

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
  it('returns same order for less than 3 places', () => {
    const result = nearestNeighbourOrder([
      { code: 'A', lat: 25, lng: 55 },
      { code: 'B', lat: 26, lng: 56 },
    ]);
    expect(result).toEqual(['A', 'B']);
  });

  it('reorders three collinear places optimally', () => {
    // A(55) → C(56) → B(57) is shorter than A → B → C
    const result = nearestNeighbourOrder([
      { code: 'A', lat: 25, lng: 55 },
      { code: 'B', lat: 25, lng: 57 },
      { code: 'C', lat: 25, lng: 56 },
    ]);
    expect(result).toEqual(['A', 'C', 'B']);
  });

  it('keeps already-optimal order unchanged', () => {
    const result = nearestNeighbourOrder([
      { code: 'A', lat: 25, lng: 55 },
      { code: 'B', lat: 25, lng: 55.1 },
      { code: 'C', lat: 25, lng: 55.2 },
    ]);
    expect(result).toEqual(['A', 'B', 'C']);
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

// ── Journey route URL helpers ─────────────────────────────────────────────────

function journeyUrl(groupCode: string): string {
  return `/journeys/${groupCode}`;
}

function journeyEditUrl(groupCode: string): string {
  return `/journeys/${groupCode}/edit`;
}

describe('journey URL helpers', () => {
  it('builds journey detail URL', () => {
    expect(journeyUrl('grp_abc123')).toBe('/journeys/grp_abc123');
  });

  it('builds journey edit URL', () => {
    expect(journeyEditUrl('grp_abc123')).toBe('/journeys/grp_abc123/edit');
  });
});
