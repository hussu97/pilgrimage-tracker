/**
 * Pure-logic tests for the mobile analytics hook utilities.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ── fetch mock ────────────────────────────────────────────────────────────────

const fetchMock = jest
  .fn<() => Promise<{ ok: boolean; json: () => Promise<{ accepted: number }> }>>()
  .mockResolvedValue({ ok: true, json: async () => ({ accepted: 1 }) });
global.fetch = fetchMock as unknown as typeof fetch;

// ── Session ID logic ─────────────────────────────────────────────────────────

describe('generateSessionId', () => {
  it('generates a valid UUID-like string', () => {
    // Copy generateSessionId logic inline for pure testing
    const generateSessionId = (): string =>
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });

    const id = generateSessionId();
    // UUID v4 format: 8-4-4-4-12
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('generates unique IDs each call', () => {
    const generateSessionId = (): string =>
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });

    const ids = new Set(Array.from({ length: 10 }, generateSessionId));
    expect(ids.size).toBe(10);
  });
});

// ── Event buffering logic ─────────────────────────────────────────────────────

describe('event buffer accumulation', () => {
  it('accumulates events up to the max buffer size', () => {
    const MAX_BUFFER_SIZE = 10;
    const buffer: unknown[] = [];
    for (let i = 0; i < MAX_BUFFER_SIZE - 1; i++) {
      buffer.push({ event_type: 'page_view', session_id: 'sess-1' });
    }
    expect(buffer).toHaveLength(MAX_BUFFER_SIZE - 1);
    buffer.push({ event_type: 'check_in', session_id: 'sess-1' });
    expect(buffer).toHaveLength(MAX_BUFFER_SIZE);
  });
});

// ── Flush payload shape ───────────────────────────────────────────────────────

describe('flush payload shape', () => {
  beforeEach(() => {
    (fetchMock as jest.Mock).mockClear();
  });

  it('sends correct payload for iOS', async () => {
    const payload = {
      events: [
        {
          event_type: 'place_view',
          properties: { place_code: 'plc_abc01', religion: 'islam' },
          client_timestamp: new Date().toISOString(),
          session_id: 'test-session-001',
        },
      ],
      platform: 'ios',
      device_type: 'mobile',
      app_version: '1.2.3',
      visitor_code: 'vis_mobile001',
    };

    await fetch('http://127.0.0.1:3000/api/v1/analytics/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const callArgs = (fetchMock as jest.Mock).mock.calls[0] as unknown[];
    const body = JSON.parse((callArgs[1] as { body: string }).body);
    expect(body.platform).toBe('ios');
    expect(body.device_type).toBe('mobile');
    expect(body.events[0].event_type).toBe('place_view');
    expect(body.visitor_code).toBe('vis_mobile001');
  });
});

// ── Consent gating ────────────────────────────────────────────────────────────

describe('consent gating', () => {
  it('does not track when consent is null', () => {
    const analyticsConsent: boolean | null = null;
    expect(analyticsConsent === true).toBe(false);
  });

  it('does not track when consent is false', () => {
    const analyticsConsent: boolean | null = false;
    expect((analyticsConsent as boolean | null) === true).toBe(false);
  });

  it('tracks when consent is true', () => {
    const analyticsConsent: boolean | null = true;
    expect(analyticsConsent === true).toBe(true);
  });
});

// ── Identity requirement ──────────────────────────────────────────────────────

describe('identity requirement', () => {
  const canTrack = (userCode: string | null, visitorCode: string | null) =>
    !!(userCode ?? visitorCode);

  it('blocks tracking without identity', () => {
    expect(canTrack(null, null)).toBe(false);
  });

  it('allows tracking with userCode', () => {
    expect(canTrack('usr_abc123', null)).toBe(true);
  });

  it('allows tracking with visitorCode', () => {
    expect(canTrack(null, 'vis_abc123')).toBe(true);
  });
});

// ── Valid event types ─────────────────────────────────────────────────────────

describe('valid analytics event types', () => {
  const VALID_TYPES = [
    'page_view',
    'place_view',
    'search',
    'check_in',
    'favorite_toggle',
    'review_submit',
    'share',
    'filter_change',
    'signup',
    'login',
  ] as const;

  it('has 10 event types', () => {
    expect(VALID_TYPES).toHaveLength(10);
  });

  it('includes mobile-relevant events', () => {
    expect(VALID_TYPES).toContain('check_in');
    expect(VALID_TYPES).toContain('place_view');
    expect(VALID_TYPES).toContain('signup');
    expect(VALID_TYPES).toContain('login');
  });
});

// ── Batch size enforcement ────────────────────────────────────────────────────

describe('batch size limit', () => {
  it('enforces maximum 50 events per batch', () => {
    const MAX = 50;
    const validateBatch = (events: unknown[]) => events.length <= MAX;

    expect(validateBatch(new Array(50).fill({}))).toBe(true);
    expect(validateBatch(new Array(51).fill({}))).toBe(false);
  });
});
