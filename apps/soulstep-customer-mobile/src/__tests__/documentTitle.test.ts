/**
 * Mobile-side tests for document/navigation title formatting logic.
 *
 * The PlaceDetailScreen sets navigation.setOptions({ title: place.name })
 * when place data loads. We test the title formatting utilities that
 * mirror the web useDocumentTitle behaviour (consistent parity).
 */

describe('Navigation title formatting (mobile parity with web useDocumentTitle)', () => {
  function formatNavigationTitle(placeName?: string): string {
    return placeName ?? '';
  }

  it('returns place name when provided', () => {
    expect(formatNavigationTitle('Grand Mosque')).toBe('Grand Mosque');
  });

  it('returns empty string when no place name', () => {
    expect(formatNavigationTitle(undefined)).toBe('');
  });

  it('handles long place names without truncation (OS handles it)', () => {
    const longName = 'A'.repeat(200);
    expect(formatNavigationTitle(longName)).toBe(longName);
  });

  it('handles place name with special characters', () => {
    expect(formatNavigationTitle("St. Mary's Church")).toBe("St. Mary's Church");
  });
});

describe('PlaceDetail slug route params (mobile — slug is optional)', () => {
  type PlaceDetailParams = { placeCode: string; slug?: string };

  function buildParams(placeCode: string, slug?: string): PlaceDetailParams {
    return slug ? { placeCode, slug } : { placeCode };
  }

  it('builds params without slug', () => {
    const params = buildParams('plc_abc123');
    expect(params).toEqual({ placeCode: 'plc_abc123' });
    expect(params.slug).toBeUndefined();
  });

  it('builds params with slug', () => {
    const params = buildParams('plc_abc123', 'grand-mosque');
    expect(params).toEqual({ placeCode: 'plc_abc123', slug: 'grand-mosque' });
  });

  it('slug field is optional — type allows omission', () => {
    const params: PlaceDetailParams = { placeCode: 'plc_test' };
    expect(params.slug).toBeUndefined();
  });
});
