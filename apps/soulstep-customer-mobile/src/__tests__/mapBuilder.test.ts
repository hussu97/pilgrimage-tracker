/**
 * Unit tests for pure functions in src/lib/utils/mapBuilder.ts.
 *
 * formatDistance() and buildMapHtml() have no native dependencies.
 */

import { buildMapHtml, formatDistance } from '../lib/utils/mapBuilder';
import type { Place } from '../lib/types';

function makePlaces(overrides: Partial<Place>[] = []): Place[] {
  return overrides.map((o, i) => ({
    place_code: `plc_00${i}`,
    name: `Place ${i}`,
    religion: 'islam' as const,
    place_type: 'mosque',
    lat: 25.0 + i * 0.01,
    lng: 55.0 + i * 0.01,
    address: `Address ${i}`,
    is_open_now: null,
    open_status: undefined,
    ...o,
  }));
}

// ── formatDistance ─────────────────────────────────────────────────────────────

describe('formatDistance()', () => {
  it('shows metres when distance is less than 1 km', () => {
    expect(formatDistance(0.5)).toBe('500 m');
  });

  it('shows 0 m for zero distance', () => {
    expect(formatDistance(0)).toBe('0 m');
  });

  it('shows km with one decimal when distance >= 1 km', () => {
    expect(formatDistance(1.5)).toBe('1.5 km');
    expect(formatDistance(10.2)).toBe('10.2 km');
  });

  it('shows exactly 1.0 km at the boundary', () => {
    expect(formatDistance(1.0)).toBe('1.0 km');
  });

  it('rounds metres to the nearest integer', () => {
    expect(formatDistance(0.7777)).toBe('778 m');
  });
});

// ── buildMapHtml ───────────────────────────────────────────────────────────────

describe('buildMapHtml()', () => {
  const CENTER_LAT = 25.2048;
  const CENTER_LNG = 55.2708;

  it('returns a non-empty string', () => {
    const html = buildMapHtml([], CENTER_LAT, CENTER_LNG);
    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(0);
  });

  it('contains the center coordinates', () => {
    const html = buildMapHtml([], CENTER_LAT, CENTER_LNG);
    expect(html).toContain(String(CENTER_LAT));
    expect(html).toContain(String(CENTER_LNG));
  });

  it('contains Leaflet CDN link', () => {
    const html = buildMapHtml([], CENTER_LAT, CENTER_LNG);
    expect(html).toContain('leaflet');
  });

  it('embeds markers JSON in the output', () => {
    const html = buildMapHtml([], CENTER_LAT, CENTER_LNG);
    expect(html).toContain('var markers =');
  });

  it('empty places array yields markers JSON as []', () => {
    const html = buildMapHtml([], CENTER_LAT, CENTER_LNG);
    expect(html).toContain('var markers = []');
  });

  it('includes place name in markers JSON when places are provided', () => {
    const places = makePlaces([{ name: 'Al Farooq Mosque', lat: 25.1, lng: 55.1 }]);
    const html = buildMapHtml(places, CENTER_LAT, CENTER_LNG);
    expect(html).toContain('Al Farooq Mosque');
  });

  it('includes place_code in markers JSON', () => {
    const places = makePlaces([{ place_code: 'plc_test999' }]);
    const html = buildMapHtml(places, CENTER_LAT, CENTER_LNG);
    expect(html).toContain('plc_test999');
  });

  it('sets openStatus based on is_open_now when open_status is absent', () => {
    const places = makePlaces([{ is_open_now: true, open_status: undefined }]);
    const html = buildMapHtml(places, CENTER_LAT, CENTER_LNG);
    expect(html).toContain('"openStatus":"open"');
  });

  it('sets openStatus to unknown when both fields are null', () => {
    const places = makePlaces([{ is_open_now: null, open_status: undefined }]);
    const html = buildMapHtml(places, CENTER_LAT, CENTER_LNG);
    expect(html).toContain('"openStatus":"unknown"');
  });
});
