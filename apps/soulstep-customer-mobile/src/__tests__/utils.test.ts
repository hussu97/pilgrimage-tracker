// Mock @/lib/theme before any imports that depend on it.
// expo/winter runtime uses import.meta which is not supported in Jest.
jest.mock('../lib/theme', () => ({
  tokens: {
    colors: {
      textMuted: '#94a3b8',
      textMain: '#0f172a',
      primary: '#007AFF',
      crowdLow: '#059669',
      crowdMedium: '#d97706',
      error: '#dc2626',
    },
  },
  getStoredTheme: jest.fn().mockResolvedValue('system'),
  setStoredTheme: jest.fn().mockResolvedValue(undefined),
}));

import { crowdColor } from '../lib/utils/crowdColor';
import { getFullImageUrl } from '../lib/utils/imageUtils';
import { ROUTES, USER_KEY, VISITOR_KEY } from '../lib/constants';
import { formatDistance } from '../lib/utils/place-utils';

// ─── crowdColor ──────────────────────────────────────────────────────────────

describe('crowdColor()', () => {
  it('returns a muted color for undefined input', () => {
    const result = crowdColor(undefined);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns green for low crowd', () => {
    expect(crowdColor('low')).toBe('#059669');
    expect(crowdColor('Low')).toBe('#059669');
    expect(crowdColor('LOW')).toBe('#059669');
  });

  it('returns amber for medium crowd', () => {
    expect(crowdColor('medium')).toBe('#d97706');
  });

  it('returns red for high crowd', () => {
    expect(crowdColor('high')).toBe('#dc2626');
  });

  it('returns main text color for unknown level', () => {
    const result = crowdColor('unknown');
    expect(typeof result).toBe('string');
  });
});

// ─── getFullImageUrl ─────────────────────────────────────────────────────────

describe('getFullImageUrl()', () => {
  it('returns empty string for undefined', () => {
    expect(getFullImageUrl(undefined)).toBe('');
    expect(getFullImageUrl()).toBe('');
  });

  it('returns external URLs unchanged', () => {
    const url = 'https://images.unsplash.com/photo-123';
    expect(getFullImageUrl(url)).toBe(url);
  });

  it('prepends API_BASE for relative paths', () => {
    const result = getFullImageUrl('/api/v1/places/pl_abc/images/1');
    expect(result).toContain('/api/v1/places/pl_abc/images/1');
    expect(result.startsWith('http')).toBe(true);
  });
});

// ─── constants ───────────────────────────────────────────────────────────────

describe('ROUTES constants', () => {
  it('exports expected route names', () => {
    expect(ROUTES.HOME).toBe('Home');
    expect(ROUTES.LOGIN).toBe('Login');
    expect(ROUTES.REGISTER).toBe('Register');
    expect(ROUTES.PROFILE).toBe('Profile');
    expect(ROUTES.PLACE_DETAIL).toBe('PlaceDetail');
    expect(ROUTES.FAVORITES).toBe('Favorites');
  });
});

describe('storage key constants', () => {
  it('exports correct storage keys', () => {
    expect(USER_KEY).toBe('user');
    expect(VISITOR_KEY).toBe('visitor_code');
  });
});

// ─── formatDistance utility ───────────────────────────────────────────────────

describe('formatDistance()', () => {
  describe('km units (default)', () => {
    it('formats sub-km distances as meters', () => {
      expect(formatDistance(0.5)).toBe('500 m');
      expect(formatDistance(0.1)).toBe('100 m');
    });

    it('formats >= 1 km as decimal km', () => {
      expect(formatDistance(2.5)).toBe('2.5 km');
      expect(formatDistance(1.0)).toBe('1.0 km');
    });

    it('km units explicit', () => {
      expect(formatDistance(0.5, 'km')).toBe('500 m');
      expect(formatDistance(2.5, 'km')).toBe('2.5 km');
    });
  });

  describe('miles units', () => {
    it('formats >= 0.1 mi as decimal mi', () => {
      expect(formatDistance(1.0, 'miles')).toBe('0.6 mi');
    });

    it('formats < 0.1 mi as feet', () => {
      expect(formatDistance(0.05, 'miles')).toBe('164 ft');
    });
  });
});
