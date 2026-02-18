// Mock @/lib/theme before any imports that depend on it.
// expo/winter runtime uses import.meta which is not supported in Jest.
jest.mock('../lib/theme', () => ({
  tokens: {
    colors: {
      textMuted: '#94a3b8',
      textMain: '#0f172a',
      primary: '#007AFF',
    },
  },
  getStoredTheme: jest.fn().mockResolvedValue('system'),
  setStoredTheme: jest.fn().mockResolvedValue(undefined),
}));

import { crowdColor } from '../lib/utils/crowdColor';
import { getFullImageUrl } from '../lib/utils/imageUtils';
import { ROUTES, TOKEN_KEY, USER_KEY, VISITOR_KEY } from '../lib/constants';

// ─── crowdColor ──────────────────────────────────────────────────────────────

describe('crowdColor()', () => {
  it('returns a muted color for undefined input', () => {
    const result = crowdColor(undefined);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns green hex for low crowd', () => {
    expect(crowdColor('low')).toBe('#059669');
    expect(crowdColor('Low')).toBe('#059669');
    expect(crowdColor('LOW')).toBe('#059669');
  });

  it('returns amber hex for medium crowd', () => {
    expect(crowdColor('medium')).toBe('#d97706');
  });

  it('returns red hex for high crowd', () => {
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
    expect(TOKEN_KEY).toBe('token');
    expect(USER_KEY).toBe('user');
    expect(VISITOR_KEY).toBe('visitor_code');
  });
});
