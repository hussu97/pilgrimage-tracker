import { describe, expect, it } from 'vitest';
import type { Place } from '@/lib/types';
import {
  buildDiscoveryJourneyDraft,
  filterDiscoveryCities,
  isUsefulDiscoveryCity,
  parseDiscoveryJourneyDraft,
} from '@/lib/utils/discovery';

describe('discovery utilities', () => {
  it('rejects low-quality city labels from discovery modules', () => {
    expect(isUsefulDiscoveryCity('Dubai')).toBe(true);
    expect(isUsefulDiscoveryCity('Unnamed Road')).toBe(false);
    expect(isUsefulDiscoveryCity('Main Street')).toBe(false);
    expect(isUsefulDiscoveryCity('Sector 12345')).toBe(false);
    expect(isUsefulDiscoveryCity('Abu Dhabi, UAE')).toBe(false);
  });

  it('deduplicates and limits useful discovery cities', () => {
    const cities = filterDiscoveryCities(
      [
        { city: 'Dubai', city_slug: 'dubai', count: 5, top_images: [] },
        { city: 'Unnamed Road', city_slug: 'unnamed-road', count: 9, top_images: [] },
        { city: 'dubai', city_slug: 'dubai-duplicate', count: 4, top_images: [] },
        { city: 'Sharjah', city_slug: 'sharjah', count: 3, top_images: [] },
      ],
      2,
    );

    expect(cities.map((city) => city.city_slug)).toEqual(['dubai', 'sharjah']);
  });

  it('round-trips a selected-place journey draft', () => {
    const place: Place = {
      place_code: 'plc_123',
      name: 'Test Mosque',
      religion: 'islam',
      place_type: 'mosque',
      lat: 25.2,
      lng: 55.3,
      address: '1 Main St',
      images: [{ url: '/image.jpg', display_order: 0 }],
    };

    const draft = buildDiscoveryJourneyDraft([place]);
    const parsed = parseDiscoveryJourneyDraft(JSON.stringify(draft));

    expect(parsed?.source).toBe('discover');
    expect(parsed?.places).toHaveLength(1);
    expect(parsed?.places[0].place_code).toBe('plc_123');
  });
});
