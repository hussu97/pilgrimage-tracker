/**
 * Onboarding utility logic tests.
 * Tests the AsyncStorage key logic used to control whether onboarding is shown.
 */
import { describe, it, expect } from '@jest/globals';

const ONBOARDING_KEY = 'onboarding_done';

function shouldShowOnboarding(storedValue: string | null, user: unknown): boolean {
  return !storedValue && !user;
}

function shouldNavigateToOnboarding(storedValue: string | null, user: unknown): boolean {
  return storedValue !== '1' && !user;
}

describe('Onboarding AsyncStorage flag logic', () => {
  it('shows onboarding when key is null and no user', () => {
    expect(shouldShowOnboarding(null, null)).toBe(true);
  });

  it('does not show onboarding when key is set', () => {
    expect(shouldShowOnboarding('1', null)).toBe(false);
  });

  it('does not show onboarding when user is logged in', () => {
    expect(shouldShowOnboarding(null, { email: 'a@b.com' })).toBe(false);
  });

  it('does not show onboarding when key is set and user exists', () => {
    expect(shouldShowOnboarding('1', { email: 'a@b.com' })).toBe(false);
  });

  it('navigates to onboarding when value is not exactly "1"', () => {
    expect(shouldNavigateToOnboarding(null, null)).toBe(true);
    expect(shouldNavigateToOnboarding('true', null)).toBe(true);
    expect(shouldNavigateToOnboarding('0', null)).toBe(true);
  });

  it('does not navigate to onboarding when value is "1"', () => {
    expect(shouldNavigateToOnboarding('1', null)).toBe(false);
  });

  it('key constant has expected value', () => {
    expect(ONBOARDING_KEY).toBe('onboarding_done');
  });
});
