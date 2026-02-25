// No theme/native module dependencies — pure logic tests

import { parseSemver, versionMeetsMinimum, shouldSoftUpdate } from '../lib/utils/versionUtils';

// ─── parseSemver ──────────────────────────────────────────────────────────────

describe('parseSemver()', () => {
  it('parses a three-part version', () => {
    expect(parseSemver('1.2.3')).toEqual([1, 2, 3]);
  });

  it('pads missing parts with 0', () => {
    expect(parseSemver('2.0')).toEqual([2, 0, 0]);
    expect(parseSemver('3')).toEqual([3, 0, 0]);
  });

  it('treats non-numeric segments as 0', () => {
    expect(parseSemver('1.0.0-beta')).toEqual([1, 0, 0]);
  });

  it('handles leading/trailing whitespace', () => {
    expect(parseSemver('  1.2.3  ')).toEqual([1, 2, 3]);
  });
});

// ─── versionMeetsMinimum ──────────────────────────────────────────────────────

describe('versionMeetsMinimum()', () => {
  it('returns true when versions are equal', () => {
    expect(versionMeetsMinimum('1.0.0', '1.0.0')).toBe(true);
  });

  it('returns true when current is above minimum', () => {
    expect(versionMeetsMinimum('1.1.0', '1.0.0')).toBe(true);
    expect(versionMeetsMinimum('2.0.0', '1.9.9')).toBe(true);
    expect(versionMeetsMinimum('1.0.1', '1.0.0')).toBe(true);
  });

  it('returns false when current is below minimum', () => {
    expect(versionMeetsMinimum('0.9.9', '1.0.0')).toBe(false);
    expect(versionMeetsMinimum('1.0.0', '1.0.1')).toBe(false);
    expect(versionMeetsMinimum('1.1.0', '2.0.0')).toBe(false);
  });

  it('returns true when minimum is empty (disabled)', () => {
    expect(versionMeetsMinimum('0.0.1', '')).toBe(true);
    expect(versionMeetsMinimum('99.0.0', '')).toBe(true);
  });
});

// ─── shouldSoftUpdate ─────────────────────────────────────────────────────────

describe('shouldSoftUpdate()', () => {
  it('returns true when current < min_version_soft', () => {
    expect(shouldSoftUpdate('1.0.0', '1.1.0')).toBe(true);
  });

  it('returns false when current >= min_version_soft', () => {
    expect(shouldSoftUpdate('1.1.0', '1.1.0')).toBe(false);
    expect(shouldSoftUpdate('2.0.0', '1.1.0')).toBe(false);
  });

  it('returns false when min_version_soft is empty', () => {
    expect(shouldSoftUpdate('0.0.1', '')).toBe(false);
  });
});
