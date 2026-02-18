import { describe, it, expect } from 'vitest';
import { cn } from '@/lib/utils/cn';
import { crowdColorClass } from '@/lib/utils/place-utils';

// ─── cn utility ───────────────────────────────────────────────────────────────

describe('cn()', () => {
  it('returns empty string for no inputs', () => {
    expect(cn()).toBe('');
  });

  it('joins string inputs', () => {
    expect(cn('a', 'b', 'c')).toBe('a b c');
  });

  it('skips falsy values', () => {
    expect(cn('a', false, null, undefined, 0, 'b')).toBe('a b');
  });

  it('handles conditional string', () => {
    const active = true;
    expect(cn('base', active && 'active')).toBe('base active');
    expect(cn('base', !active && 'inactive')).toBe('base');
  });

  it('handles object input — truthy values included', () => {
    expect(cn({ foo: true, bar: false, baz: true })).toBe('foo baz');
  });

  it('handles array input recursively', () => {
    expect(cn(['a', 'b'], 'c')).toBe('a b c');
  });

  it('handles nested arrays', () => {
    expect(cn(['a', ['b', 'c']])).toBe('a b c');
  });

  it('handles numeric input', () => {
    expect(cn(42 as unknown as string)).toBe('42');
  });
});

// ─── crowdColorClass utility ──────────────────────────────────────────────────

describe('crowdColorClass()', () => {
  it('returns empty string for null/undefined', () => {
    expect(crowdColorClass()).toBe('');
    expect(crowdColorClass(null)).toBe('');
    expect(crowdColorClass(undefined)).toBe('');
  });

  it('returns emerald class for low', () => {
    expect(crowdColorClass('low')).toBe('text-emerald-600');
    expect(crowdColorClass('Low')).toBe('text-emerald-600');
    expect(crowdColorClass('LOW')).toBe('text-emerald-600');
  });

  it('returns amber class for medium', () => {
    expect(crowdColorClass('medium')).toBe('text-amber-600');
  });

  it('returns red class for high', () => {
    expect(crowdColorClass('high')).toBe('text-red-600');
  });

  it('returns empty string for unknown level', () => {
    expect(crowdColorClass('extreme')).toBe('');
  });
});
