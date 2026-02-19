import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getProgressLevel, formatRelativeTime } from '@/lib/utils/groupUtils';

// ─── getProgressLevel ─────────────────────────────────────────────────────────

describe('getProgressLevel()', () => {
  it('returns "none" for 0%', () => {
    expect(getProgressLevel(0)).toBe('none');
  });

  it('returns "low" for > 0 and < 25', () => {
    expect(getProgressLevel(1)).toBe('low');
    expect(getProgressLevel(10)).toBe('low');
    expect(getProgressLevel(24)).toBe('low');
  });

  it('returns "medium" for 25 to 74', () => {
    expect(getProgressLevel(25)).toBe('medium');
    expect(getProgressLevel(50)).toBe('medium');
    expect(getProgressLevel(74)).toBe('medium');
  });

  it('returns "high" for 75 to 99', () => {
    expect(getProgressLevel(75)).toBe('high');
    expect(getProgressLevel(90)).toBe('high');
    expect(getProgressLevel(99)).toBe('high');
  });

  it('returns "complete" for 100', () => {
    expect(getProgressLevel(100)).toBe('complete');
  });

  it('returns "complete" for values > 100 (edge case)', () => {
    expect(getProgressLevel(110)).toBe('complete');
  });
});

// ─── formatRelativeTime ───────────────────────────────────────────────────────

describe('formatRelativeTime()', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-01T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for < 60 seconds ago', () => {
    const iso = new Date(Date.now() - 30_000).toISOString();
    expect(formatRelativeTime(iso)).toBe('just now');
  });

  it('returns minutes for < 60 minutes ago', () => {
    const iso = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(formatRelativeTime(iso)).toBe('5m ago');
  });

  it('returns hours for < 24 hours ago', () => {
    const iso = new Date(Date.now() - 3 * 3600_000).toISOString();
    expect(formatRelativeTime(iso)).toBe('3h ago');
  });

  it('returns days for < 7 days ago', () => {
    const iso = new Date(Date.now() - 2 * 86400_000).toISOString();
    expect(formatRelativeTime(iso)).toBe('2d ago');
  });

  it('returns locale date for >= 7 days ago', () => {
    const longAgo = new Date(Date.now() - 10 * 86400_000);
    const iso = longAgo.toISOString();
    const result = formatRelativeTime(iso);
    // Should return a date string (locale-dependent), not a relative label
    expect(result).not.toContain('ago');
    expect(result).not.toBe('just now');
  });
});
