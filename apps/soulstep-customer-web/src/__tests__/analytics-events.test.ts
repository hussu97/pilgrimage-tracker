/**
 * Pure-logic tests for the analytics event taxonomy.
 * No DOM or fetch required — validates the shape and uniqueness of EVENTS,
 * the route-to-page-name helper, and isWebsiteIdConfigured edge cases.
 */

import { describe, it, expect } from 'vitest';
import { EVENTS, routeToPageName, type EventName } from '../lib/analytics/events';
import { isWebsiteIdConfigured } from '../lib/hooks/useUmamiTracking';

function collectLeafValues(node: unknown, acc: string[] = []): string[] {
  if (typeof node === 'string') {
    acc.push(node);
  } else if (node && typeof node === 'object') {
    for (const v of Object.values(node as Record<string, unknown>)) {
      collectLeafValues(v, acc);
    }
  }
  return acc;
}

describe('EVENTS taxonomy', () => {
  it('contains only snake_case string values', () => {
    const values = collectLeafValues(EVENTS);
    expect(values.length).toBeGreaterThan(20); // sanity floor
    for (const v of values) {
      expect(typeof v).toBe('string');
      expect(v).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it('has no duplicate event names across namespaces', () => {
    const values = collectLeafValues(EVENTS);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  it('exposes the key goal events by name', () => {
    // These strings are referenced in docs/UMAMI_ANALYTICS.md for dashboard
    // goal configuration — renaming any of them must be an explicit decision.
    const expected: EventName[] = [
      'auth_signup_success',
      'place_check_in_success',
      'place_favorite_add',
      'journey_create_submit',
      'journey_join_submit',
      'review_submit',
      'onboarding_complete',
    ];
    const values = new Set(collectLeafValues(EVENTS));
    for (const name of expected) {
      expect(values.has(name)).toBe(true);
    }
  });
});

describe('routeToPageName', () => {
  it('maps root path to "home"', () => {
    expect(routeToPageName('/')).toBe('home');
  });

  it('collapses prefixed opaque codes to :code', () => {
    expect(routeToPageName('/places/plc_abc12')).toBe('places/:code');
    expect(routeToPageName('/groups/grp_xyz99/edit')).toBe('groups/:code/edit');
  });

  it('collapses hex-id-like segments to :code', () => {
    expect(routeToPageName('/journeys/7a4f9e2c3b')).toBe('journeys/:code');
  });

  it('preserves slug-like segments', () => {
    expect(routeToPageName('/explore/dubai')).toBe('explore/dubai');
    expect(routeToPageName('/blog/pilgrimage-guide')).toBe('blog/pilgrimage-guide');
  });

  it('strips leading and trailing slashes', () => {
    expect(routeToPageName('/places/')).toBe('places');
  });
});

describe('isWebsiteIdConfigured', () => {
  it('rejects empty string', () => {
    expect(isWebsiteIdConfigured('')).toBe(false);
  });

  it('rejects the literal HTML placeholder pattern', () => {
    // If the NEXT_PUBLIC_* env var is missing at build time, Next.js substitutes
    // process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID with `undefined` (→ '' after ??),
    // so an unreplaced %…% placeholder reaches this guard only via a
    // misconfigured host. Either way: treat as unconfigured.
    expect(isWebsiteIdConfigured('%NEXT_PUBLIC_UMAMI_WEBSITE_ID%')).toBe(false);
  });

  it('accepts a real UUID', () => {
    expect(isWebsiteIdConfigured('fae4143a-20f8-46fa-97fc-cede6ceb3979')).toBe(true);
  });
});
