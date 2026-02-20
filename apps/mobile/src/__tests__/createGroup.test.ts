/**
 * Unit tests for group creation form validation logic.
 *
 * The CreateGroupScreen component validates the group name with:
 *   - `!name.trim()` — rejects empty and whitespace-only names
 *
 * Since the validation is inline (no extracted pure function), we replicate
 * the same checks here to ensure the logic is correct.
 */

// ─── Group name validation ──────────────────────────────────────────────────

function isGroupNameValid(name: string): boolean {
  return name.trim() !== '';
}

describe('Group creation — name validation', () => {
  it('rejects an empty string', () => {
    expect(isGroupNameValid('')).toBe(false);
  });

  it('rejects a string with only spaces', () => {
    expect(isGroupNameValid('   ')).toBe(false);
  });

  it('rejects a string with only tabs and newlines', () => {
    expect(isGroupNameValid('\t\n')).toBe(false);
  });

  it('accepts a non-empty trimmed name', () => {
    expect(isGroupNameValid('Hajj 2026')).toBe(true);
  });

  it('accepts a name with leading/trailing whitespace (trims to non-empty)', () => {
    expect(isGroupNameValid('  Umrah Group  ')).toBe(true);
  });

  it('accepts a single character name', () => {
    expect(isGroupNameValid('A')).toBe(true);
  });
});
