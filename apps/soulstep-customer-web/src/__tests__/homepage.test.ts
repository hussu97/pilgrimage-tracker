import { describe, it, expect, vi, beforeEach } from 'vitest';

// Test the getHomepage function parsing
describe('getHomepage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('parses homepage data correctly', async () => {
    const mockData = {
      groups: [],
      recommended_places: [
        {
          place_code: 'plc_001',
          name: 'Test Mosque',
          religion: 'islam',
          address: '1 Main St',
          lat: 0,
          lng: 0,
          image_url: null,
          distance_km: 1.5,
        },
      ],
      featured_journeys: [],
      popular_places: [],
      popular_cities: [{ city: 'London', city_slug: 'london', count: 42 }],
      place_count: 100,
    };

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
      status: 200,
      clone: () => ({ json: async () => mockData }),
    });

    // Dynamically import to avoid module-level side effects
    const { getHomepage } = await import('@/lib/api/client');
    const result = await getHomepage({ lat: 51.5, lng: -0.1 });

    expect(result.place_count).toBe(100);
    expect(result.popular_cities[0].city).toBe('London');
    expect(result.recommended_places[0].place_code).toBe('plc_001');
    expect(result.groups).toEqual([]);
  });

  it('throws on error response', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
      clone: () => ({ json: async () => ({}) }),
    });

    const { getHomepage } = await import('@/lib/api/client');
    await expect(getHomepage()).rejects.toThrow('Failed to fetch homepage data');
  });
});
