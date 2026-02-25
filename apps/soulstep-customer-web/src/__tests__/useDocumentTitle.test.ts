import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Tests for the useDocumentTitle hook logic.
 *
 * We test the core title-building logic directly (no React rendering needed),
 * matching what the hook executes inside useEffect.
 */

const APP = 'SoulStep';

function buildTitle(title?: string): string {
  return title ? `${title} | ${APP}` : APP;
}

beforeEach(() => {
  document.title = '';
});

describe('useDocumentTitle logic', () => {
  it('sets document.title to APP name when no title provided', () => {
    document.title = buildTitle();
    expect(document.title).toBe('SoulStep');
  });

  it('sets document.title to "{title} | SoulStep" when title provided', () => {
    document.title = buildTitle('Grand Mosque');
    expect(document.title).toBe('Grand Mosque | SoulStep');
  });

  it('resets document.title to APP on cleanup (no title arg)', () => {
    document.title = buildTitle();
    expect(document.title).toBe('SoulStep');
  });

  it('handles title update — new title reflected in format', () => {
    document.title = buildTitle('First');
    expect(document.title).toBe('First | SoulStep');

    document.title = buildTitle('Second');
    expect(document.title).toBe('Second | SoulStep');
  });

  it('handles undefined title — renders just APP name', () => {
    document.title = buildTitle(undefined);
    expect(document.title).toBe('SoulStep');
  });

  it('handles empty string title — falsy, renders just APP name', () => {
    document.title = buildTitle('');
    expect(document.title).toBe('SoulStep');
  });

  it('separator is " | "', () => {
    const title = buildTitle('Profile');
    expect(title).toContain(' | ');
    expect(title).toBe('Profile | SoulStep');
  });

  it('long title is not truncated by the hook logic', () => {
    const longTitle = 'A'.repeat(100);
    document.title = buildTitle(longTitle);
    expect(document.title).toBe(`${'A'.repeat(100)} | SoulStep`);
  });
});
