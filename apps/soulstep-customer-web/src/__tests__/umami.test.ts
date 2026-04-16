/**
 * Pure-logic tests for Umami analytics payload builder.
 * No DOM / fetch required — tests the buildUmamiPayload helper in isolation.
 */

import { describe, it, expect } from 'vitest';

// ── Payload builder (mirrors useUmamiTracking logic) ─────────────────────────

interface UmamiPayload {
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
    hostname?: string;
    language?: string;
    screen?: string;
    eventName?: string;
    data?: Record<string, unknown>;
  } = {},
): UmamiPayload {
  return {
    type: 'event',
    payload: {
      hostname: opts.hostname ?? 'soulstep.app',
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

// ── Tests ────────────────────────────────────────────────────────────────────

describe('buildUmamiPayload', () => {
  const WEBSITE_ID = 'test-website-id-1234';

  it('builds a page-view payload with correct structure', () => {
    const payload = buildUmamiPayload('Home', WEBSITE_ID);
    expect(payload.type).toBe('event');
    expect(payload.payload.title).toBe('Home');
    expect(payload.payload.url).toBe('/Home');
    expect(payload.payload.website).toBe(WEBSITE_ID);
    expect(payload.payload.hostname).toBe('soulstep.app');
  });

  it('omits name field for page-view (no custom event name)', () => {
    const payload = buildUmamiPayload('PlaceDetail', WEBSITE_ID);
    expect('name' in payload.payload).toBe(false);
  });

  it('includes name field for custom events', () => {
    const payload = buildUmamiPayload('PlaceDetail', WEBSITE_ID, { eventName: 'place_view' });
    expect(payload.payload.name).toBe('place_view');
  });

  it('includes data field for custom events with data', () => {
    const payload = buildUmamiPayload('PlaceDetail', WEBSITE_ID, {
      eventName: 'place_view',
      data: { religion: 'Islam' },
    });
    expect(payload.payload.data).toEqual({ religion: 'Islam' });
  });

  it('omits data field when no data provided', () => {
    const payload = buildUmamiPayload('Home', WEBSITE_ID, { eventName: 'login' });
    expect('data' in payload.payload).toBe(false);
  });

  it('builds review_submit event with rating data', () => {
    const payload = buildUmamiPayload('WriteReview', WEBSITE_ID, {
      eventName: 'review_submit',
      data: { rating: 5 },
    });
    expect(payload.payload.name).toBe('review_submit');
    expect(payload.payload.data).toEqual({ rating: 5 });
  });

  it('builds filter_apply event with count data', () => {
    const payload = buildUmamiPayload('Home', WEBSITE_ID, {
      eventName: 'filter_apply',
      data: { count: 3 },
    });
    expect(payload.payload.name).toBe('filter_apply');
    expect(payload.payload.data).toEqual({ count: 3 });
  });

  it('uses custom hostname when provided', () => {
    const payload = buildUmamiPayload('Home', WEBSITE_ID, { hostname: 'soul-step.org' });
    expect(payload.payload.hostname).toBe('soul-step.org');
  });

  it('uses custom language when provided', () => {
    const payload = buildUmamiPayload('Home', WEBSITE_ID, { language: 'ar' });
    expect(payload.payload.language).toBe('ar');
  });

  it('uses custom screen dimensions when provided', () => {
    const payload = buildUmamiPayload('Home', WEBSITE_ID, { screen: '1280x800' });
    expect(payload.payload.screen).toBe('1280x800');
  });
});

describe('normaliseScreenName', () => {
  it('lowercases screen names', () => {
    expect(normaliseScreenName('HomeScreen')).toBe('homescreen');
  });

  it('replaces spaces with underscores', () => {
    expect(normaliseScreenName('Place Detail')).toBe('place_detail');
  });

  it('handles already-lowercase names', () => {
    expect(normaliseScreenName('search')).toBe('search');
  });

  it('collapses multiple spaces into one underscore', () => {
    expect(normaliseScreenName('Edit  Group  Places')).toBe('edit_group_places');
  });
});

describe('consent gating logic', () => {
  const shouldSendUmami = (consent: boolean | null): boolean => consent === true;

  it('blocks when consent is null', () => {
    expect(shouldSendUmami(null)).toBe(false);
  });

  it('blocks when consent is false', () => {
    expect(shouldSendUmami(false)).toBe(false);
  });

  it('allows when consent is true', () => {
    expect(shouldSendUmami(true)).toBe(true);
  });
});

describe('website ID guard', () => {
  const isValidWebsiteId = (id: string | undefined): boolean =>
    typeof id === 'string' && id.length > 0 && id !== '%NEXT_PUBLIC_UMAMI_WEBSITE_ID%';

  it('rejects undefined', () => {
    expect(isValidWebsiteId(undefined)).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidWebsiteId('')).toBe(false);
  });

  it('rejects un-replaced Vite placeholder', () => {
    expect(isValidWebsiteId('%NEXT_PUBLIC_UMAMI_WEBSITE_ID%')).toBe(false);
  });

  it('accepts a real UUID', () => {
    expect(isValidWebsiteId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });
});
