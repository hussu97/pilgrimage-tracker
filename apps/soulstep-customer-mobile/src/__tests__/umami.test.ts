/**
 * Pure-logic tests for Umami analytics payload builder (mobile).
 * No React Native / fetch required — tests buildUmamiPayload in isolation.
 */

import { describe, it, expect } from '@jest/globals';

// ── Inline the pure builder (mirrors useUmamiTracking, no RN imports) ─────────

interface UmamiEventPayload {
  type: 'event';
  payload: {
    hostname: string;
    language: string;
    screen: string;
    title: string;
    url: string;
    website: string;
    name?: string;
    data?: Record<string, unknown>;
  };
}

function buildUmamiPayload(
  screenName: string,
  websiteId: string,
  opts: {
    language?: string;
    screen?: string;
    eventName?: string;
    data?: Record<string, unknown>;
  } = {},
): UmamiEventPayload {
  return {
    type: 'event',
    payload: {
      hostname: 'soulstep.app',
      language: opts.language ?? 'en',
      screen: opts.screen ?? '390x844',
      title: screenName,
      url: `/${screenName}`,
      website: websiteId,
      ...(opts.eventName ? { name: opts.eventName } : {}),
      ...(opts.data ? { data: opts.data } : {}),
    },
  };
}

function normaliseScreenName(raw: string): string {
  return raw.toLowerCase().replace(/\s+/g, '_');
}

const WEBSITE_ID = 'test-website-id-5678';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildUmamiPayload', () => {
  it('sets type to "event"', () => {
    const p = buildUmamiPayload('Home', WEBSITE_ID);
    expect(p.type).toBe('event');
  });

  it('builds correct url and title from screen name', () => {
    const p = buildUmamiPayload('PlaceDetail', WEBSITE_ID);
    expect(p.payload.title).toBe('PlaceDetail');
    expect(p.payload.url).toBe('/PlaceDetail');
  });

  it('sets website ID', () => {
    const p = buildUmamiPayload('Home', WEBSITE_ID);
    expect(p.payload.website).toBe(WEBSITE_ID);
  });

  it('sets hostname to soulstep.app', () => {
    const p = buildUmamiPayload('Home', WEBSITE_ID);
    expect(p.payload.hostname).toBe('soulstep.app');
  });

  it('omits name field when no custom event name', () => {
    const p = buildUmamiPayload('Home', WEBSITE_ID);
    expect('name' in p.payload).toBe(false);
  });

  it('includes name field for custom events', () => {
    const p = buildUmamiPayload('PlaceDetail', WEBSITE_ID, { eventName: 'place_view' });
    expect(p.payload.name).toBe('place_view');
  });

  it('includes data field when provided', () => {
    const p = buildUmamiPayload('PlaceDetail', WEBSITE_ID, { data: { place_code: 'plc_abc' } });
    expect(p.payload.data).toEqual({ place_code: 'plc_abc' });
  });

  it('omits data field when not provided', () => {
    const p = buildUmamiPayload('Home', WEBSITE_ID);
    expect('data' in p.payload).toBe(false);
  });

  it('uses custom language when provided', () => {
    const p = buildUmamiPayload('Home', WEBSITE_ID, { language: 'ar' });
    expect(p.payload.language).toBe('ar');
  });

  it('uses custom screen dimensions when provided', () => {
    const p = buildUmamiPayload('Home', WEBSITE_ID, { screen: '414x896' });
    expect(p.payload.screen).toBe('414x896');
  });
});

describe('normaliseScreenName', () => {
  it('lowercases screen names', () => {
    expect(normaliseScreenName('HomeScreen')).toBe('homescreen');
  });

  it('replaces spaces with underscores', () => {
    expect(normaliseScreenName('Place Detail')).toBe('place_detail');
  });

  it('handles already normalised names', () => {
    expect(normaliseScreenName('search')).toBe('search');
  });
});

describe('consent gating logic', () => {
  const shouldSend = (consent: boolean | null): boolean => consent === true;

  it('blocks when consent is null', () => {
    expect(shouldSend(null)).toBe(false);
  });

  it('blocks when consent is false', () => {
    expect(shouldSend(false)).toBe(false);
  });

  it('allows when consent is true', () => {
    expect(shouldSend(true)).toBe(true);
  });
});

describe('website ID guard', () => {
  const isConfigured = (id: string | undefined): boolean =>
    typeof id === 'string' && id.length > 0 && id !== '%EXPO_PUBLIC_UMAMI_WEBSITE_ID%';

  it('rejects undefined', () => {
    expect(isConfigured(undefined)).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isConfigured('')).toBe(false);
  });

  it('rejects un-replaced Expo placeholder', () => {
    expect(isConfigured('%EXPO_PUBLIC_UMAMI_WEBSITE_ID%')).toBe(false);
  });

  it('accepts a real UUID', () => {
    expect(isConfigured('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });
});

describe('deduplication guard', () => {
  it('does not re-track the same screen consecutively', () => {
    let lastTracked: string | null = null;
    const shouldTrack = (screen: string): boolean => {
      if (screen === lastTracked) return false;
      lastTracked = screen;
      return true;
    };

    expect(shouldTrack('Home')).toBe(true);
    expect(shouldTrack('Home')).toBe(false); // same screen
    expect(shouldTrack('PlaceDetail')).toBe(true);
  });
});
