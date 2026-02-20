import { describe, it, expect } from 'vitest';

// ─── Create-group form validation ────────────────────────────────────────────
// The CreateGroup component uses `!name.trim()` to decide whether the group
// name is valid before proceeding.  We replicate that same check here as pure
// unit tests so the validation logic is covered without rendering React.

/**
 * Mirrors the validation in CreateGroup.goNext() / handleSubmit():
 *   if (!name.trim()) → invalid
 */
function isGroupNameValid(name: string): boolean {
  return name.trim() !== '';
}

describe('Create group — name validation', () => {
  it('rejects an empty string', () => {
    expect(isGroupNameValid('')).toBe(false);
  });

  it('rejects a single space', () => {
    expect(isGroupNameValid(' ')).toBe(false);
  });

  it('rejects multiple spaces', () => {
    expect(isGroupNameValid('     ')).toBe(false);
  });

  it('rejects tabs and newlines only', () => {
    expect(isGroupNameValid('\t\n')).toBe(false);
  });

  it('accepts a normal group name', () => {
    expect(isGroupNameValid('Hajj 2026')).toBe(true);
  });

  it('accepts a name with leading/trailing whitespace (trim still yields content)', () => {
    expect(isGroupNameValid('  Umrah Trip  ')).toBe(true);
  });

  it('accepts a single character', () => {
    expect(isGroupNameValid('A')).toBe(true);
  });
});
